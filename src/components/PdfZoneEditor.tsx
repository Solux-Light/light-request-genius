import { memo, useState, useRef, useEffect, useCallback } from "react";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ConfirmButton from "@/components/ConfirmButton";
import ColorSwatches from "@/components/ColorSwatches";
import { Input } from "@/components/ui/input";
import { PenTool, MousePointer, Trash2, RotateCcw, RotateCw, Plus, Minus, RotateCw as Rotate, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { PdfZoneValue, PdfZone, PdfLamppost, COLOR_OPTIONS, PROJECT_DOCUMENT_ACCEPT, documentKindFromFile, isAnnotatableKind } from "@/types/solux";

interface Props {
  value: PdfZoneValue;
  onChange: (val: PdfZoneValue) => void;
  lang?: "fr" | "en";
  // Embedded mode: the parent owns file upload/replace, so hide the built-in
  // upload dropzone and the "Change PDF" button. Used by the Project Documents
  // module; Area Lighting leaves this off to keep its behaviour identical.
  embedded?: boolean;
}

const PdfZoneEditor = memo(function PdfZoneEditor({ value, onChange, lang = "en", embedded = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const isImage = value.mediaType === "image";
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [colorIndex, setColorIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<"lasso" | "select" | "lamppost">("select");
  const [lamppostType, setLamppostType] = useState<"single" | "double">("single");
  const [selectedLamppostId, setSelectedLamppostId] = useState<string | null>(null);
  const [autoFitScale, setAutoFitScale] = useState(1);

  // Click-to-place lasso points (like Google Map)
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[]>([]);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  // C4/P2 — the canvas→base64 preview capture is deferred (debounced) and merged
  // onto the LATEST value via a ref, so it (a) doesn't re-encode a multi-MB PNG on
  // every render/lasso point, and (b) can't revert a concurrent zone edit by
  // spreading a stale `value`.
  const valueRef = useRef(value);
  valueRef.current = value;
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(captureTimerRef.current), []);

  // Load the source — a PDF (via pdf.js) or a raster image. Images cover PNG/JPG
  // uploads and the generated preview of a CAD file; both annotate identically.
  useEffect(() => {
    if (!value.pdfUrl) {
      setPdfDoc(null);
      setImgEl(null);
      return;
    }
    let cancelled = false;

    if (isImage) {
      setPdfDoc(null);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setImgEl(img);
        setTotalPages(1);
        setCurrentPage(1);
      };
      img.onerror = (err) => console.error("Image load failed:", err);
      img.src = value.pdfUrl;
      return () => { cancelled = true; };
    }

    setImgEl(null);
    const loadPdf = async () => {
      const pdfjsLib = await import("pdfjs-dist");
      // Q9 — bundle the worker from the installed package (its version always
      // matches pdfjs-dist, and it works offline / behind a strict CSP) instead
      // of a hard-pinned cloudflare CDN URL.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      const doc = await pdfjsLib.getDocument(value.pdfUrl).promise;
      if (cancelled) return;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    };
    loadPdf().catch(console.error);
    return () => { cancelled = true; };
  }, [value.pdfUrl, isImage]);

  // Render the base layer + annotation overlay onto the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isImage ? !imgEl : !pdfDoc) return;
    const render = async () => {
      const ctx = canvas.getContext("2d")!;
      const containerWidth = containerRef.current?.clientWidth || 800;

      if (isImage) {
        // Fit-to-width using the rotated footprint so 90°/270° still fits.
        const swap = rotation === 90 || rotation === 270;
        const fitScale = containerWidth / (swap ? imgEl!.naturalHeight : imgEl!.naturalWidth);
        setAutoFitScale(fitScale);
        const effectiveScale = zoom * fitScale;
        const drawW = imgEl!.naturalWidth * effectiveScale;
        const drawH = imgEl!.naturalHeight * effectiveScale;
        canvas.width = swap ? drawH : drawW;
        canvas.height = swap ? drawW : drawH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(imgEl!, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      } else {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1, rotation });
        const fitScale = containerWidth / viewport.width;
        setAutoFitScale(fitScale);
        const effectiveScale = zoom * fitScale;
        const scaledViewport = page.getViewport({ scale: effectiveScale, rotation });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      }

      // Draw zones
      const zones = value.zones.filter((z) => z.page === currentPage);
      zones.forEach((zone) => {
        if (zone.paths.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(zone.paths[0].x * canvas.width, zone.paths[0].y * canvas.height);
        zone.paths.forEach((p, i) => {
          if (i > 0) ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        });
        ctx.closePath();
        ctx.fillStyle = zone.color + "4D";
        ctx.fill();
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (zone.name) {
          const cx = zone.paths.reduce((s, p) => s + p.x, 0) / zone.paths.length * canvas.width;
          const cy = zone.paths.reduce((s, p) => s + p.y, 0) / zone.paths.length * canvas.height;
          ctx.fillStyle = zone.color;
          ctx.font = "bold 14px Inter, system-ui";
          ctx.textAlign = "center";
          ctx.fillText(zone.name, cx, cy);
        }
      });

      // Draw in-progress lasso path
      if (lassoPath.length > 0) {
        ctx.beginPath();
        ctx.moveTo(lassoPath[0].x * canvas.width, lassoPath[0].y * canvas.height);
        lassoPath.forEach((p, i) => {
          if (i > 0) ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        });
        // Close visually
        ctx.lineTo(lassoPath[0].x * canvas.width, lassoPath[0].y * canvas.height);
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw points
        lassoPath.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x * canvas.width, p.y * canvas.height, i === 0 ? 7 : 5, 0, Math.PI * 2);
          ctx.fillStyle = selectedColor;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }

      // Draw lampposts
      const lamps = (value.lampposts || []).filter((lp) => lp.page === currentPage);
      lamps.forEach((lp) => {
        const cx = lp.x * canvas.width;
        const cy = lp.y * canvas.height;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((lp.rotation || 0) * Math.PI) / 180);
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#92400e";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2.5;
        if (lp.type === "double") {
          ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-4, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(-14, 3); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(14, 3); ctx.stroke();
        if (selectedLamppostId === lp.id) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = "hsl(217, 19%, 35%)";
          ctx.beginPath();
          ctx.arc(0, 0, 22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      });

      // Capture preview — deferred so rapid edits (e.g. each lasso point) coalesce
      // into one encode, and merged onto the latest value (valueRef) so it never
      // reverts a concurrent zone/lamppost edit (C4/P2).
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = setTimeout(() => {
        try {
          const preview = canvas.toDataURL("image/png");
          const cur = valueRef.current;
          if (preview !== cur.previewImage) {
            onChange({ ...cur, previewImage: preview, viewState: { page: currentPage, zoom, rotation } });
          }
        } catch { /* tainted canvas / unsupported — leave preview as-is */ }
      }, 400);
    };
    render();
  }, [pdfDoc, imgEl, isImage, currentPage, zoom, rotation, value.zones, value.lampposts, selectedLamppostId, lassoPath]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const kind = documentKindFromFile(file);
      if (isAnnotatableKind(kind)) {
        // PDFs and images share the exact same annotation tooling.
        const localUrl = URL.createObjectURL(file);
        onChange({
          ...value,
          pdfUrl: localUrl,
          mediaType: kind === "image" ? "image" : "pdf",
          sourceKind: kind,
          sourceFileName: file.name,
          zones: [],
          lampposts: [],
        });
      } else {
        // CAD (DWG/DXF): no browser preview yet — store the file reference and
        // show a placeholder; annotation activates once a preview image exists.
        onChange({
          ...value,
          pdfUrl: "",
          mediaType: "pdf",
          sourceKind: kind,
          sourceFileName: file.name,
          zones: [],
          lampposts: [],
          previewImage: "",
        });
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
  };

  const closeLasso = useCallback(() => {
    if (lassoPath.length >= 3) {
      const nextIdx = (colorIndex + 1) % COLOR_OPTIONS.length;
      const newZone: PdfZone = {
        id: uid(),
        paths: lassoPath,
        color: selectedColor,
        name: `Zone ${value.zones.length + 1}`,
        page: currentPage,
      };
      onChange({ ...value, zones: [...value.zones, newZone] });
      setSelectedColor(COLOR_OPTIONS[nextIdx]);
      setColorIndex(nextIdx);
    }
    setLassoPath([]);
  }, [lassoPath, colorIndex, selectedColor, onChange, value, currentPage]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (activeTool === "lasso") {
      // If clicking near the first point and we have enough points, close the zone
      if (lassoPath.length >= 3) {
        const first = lassoPath[0];
        const dist = Math.sqrt((nx - first.x) ** 2 + (ny - first.y) ** 2);
        if (dist < 0.02) {
          closeLasso();
          return;
        }
      }
      setLassoPath((prev) => [...prev, { x: nx, y: ny }]);
    } else if (activeTool === "lamppost") {
      const existing = (value.lampposts || []).find(
        (lp) => lp.page === currentPage && Math.abs(lp.x - nx) < 0.02 && Math.abs(lp.y - ny) < 0.02
      );
      if (existing) {
        setSelectedLamppostId(selectedLamppostId === existing.id ? null : existing.id);
      } else {
        const newLp: PdfLamppost = {
          id: uid(),
          x: nx,
          y: ny,
          page: currentPage,
          type: lamppostType,
          rotation: 0,
        };
        onChange({ ...value, lampposts: [...(value.lampposts || []), newLp] });
        setSelectedLamppostId(newLp.id);
      }
    }
  };

  const handleCanvasDblClick = (e: React.MouseEvent) => {
    if (activeTool === "lasso") {
      e.preventDefault();
      closeLasso();
    }
  };

  if (!value.pdfUrl) {
    // In embedded mode the parent owns the file, so it renders its own empty state.
    if (embedded) return null;
    // Stored CAD file: no preview available yet, but the file travels with the request.
    if (value.sourceKind === "dwg" || value.sourceKind === "dxf") {
      return (
        <div className="border rounded-lg p-6 text-center space-y-3">
          <p className="text-sm font-medium">📐 {value.sourceFileName}</p>
          <p className="text-xs text-muted-foreground">
            {l(
              "Fichier CAO enregistré (aperçu bientôt disponible via une image générée). Les annotations seront alors identiques aux PDF.",
              "CAD file stored (preview coming via a generated image). Annotation will then work exactly like PDFs.",
            )}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...value, sourceKind: undefined, sourceFileName: undefined })}>
            {l("Changer de fichier", "Change file")}
          </Button>
        </div>
      );
    }
    return (
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">
          {l("Télécharger un plan (PDF, image ou CAO)", "Upload a plan (PDF, image or CAD)")}
        </p>
        <Input type="file" accept={PROJECT_DOCUMENT_ACCEPT} onChange={handleUpload} disabled={uploading} className="max-w-xs mx-auto" />
        <p className="text-xs text-muted-foreground mt-2">PDF · JPG · JPEG · PNG · DWG · DXF</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <ColorSwatches value={selectedColor} onChange={setSelectedColor} />
        <div className="w-px h-6 bg-border" />
        <Button type="button" size="sm" variant={activeTool === "lasso" ? "default" : "outline"} onClick={() => setActiveTool("lasso")}>
          <PenTool className="h-4 w-4 mr-1" /> Lasso
        </Button>
        <Button type="button" size="sm" variant={activeTool === "select" ? "default" : "outline"} onClick={() => setActiveTool("select")}>
          <MousePointer className="h-4 w-4 mr-1" /> {l("Sélection", "Select")}
        </Button>
        <Button type="button" size="sm" variant={activeTool === "lamppost" ? "default" : "outline"} onClick={() => setActiveTool("lamppost")}>
          💡 {l("Lampadaire", "Lamppost")}
        </Button>
        {activeTool === "lamppost" && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={lamppostType === "single" ? "default" : "outline"} onClick={() => setLamppostType("single")}>
              {l("Simple", "Single")}
            </Button>
            <Button type="button" size="sm" variant={lamppostType === "double" ? "default" : "outline"} onClick={() => setLamppostType("double")}>
              Double
            </Button>
          </div>
        )}
        {activeTool === "lasso" && lassoPath.length > 0 && (
          <Button type="button" size="sm" variant="default" onClick={closeLasso} disabled={lassoPath.length < 3}>
            ✓ {l("Fermer la zone", "Close zone")} ({lassoPath.length} pts)
          </Button>
        )}
        {activeTool === "lasso" && lassoPath.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {l("Cliquez pour placer des points, double-clic ou cliquez le 1er point pour fermer", "Click to place points, double-click or click first point to close")}
          </span>
        )}
        <div className="w-px h-6 bg-border" />
        <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <Rotate className="h-4 w-4" />
        </Button>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{currentPage}/{totalPages}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {!embedded && (
          <Button type="button" size="sm" variant="outline" onClick={() => { setLassoPath([]); onChange({ ...value, pdfUrl: "", sourceKind: undefined, sourceFileName: undefined, zones: [], lampposts: [] }); }}>
            {l("Changer le fichier", "Change file")}
          </Button>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="border rounded-lg overflow-auto max-h-[760px] relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDblClick}
          style={{ cursor: activeTool === "lasso" ? "crosshair" : activeTool === "lamppost" ? "crosshair" : "default" }}
        />
        {/* Selected lamppost popup */}
        {selectedLamppostId && (() => {
          const lp = (value.lampposts || []).find((l) => l.id === selectedLamppostId && l.page === currentPage);
          if (!lp || !canvasRef.current) return null;
          const rect = canvasRef.current;
          return (
            <div
              className="absolute bg-card border rounded-lg shadow-lg p-2 flex gap-1"
              style={{ left: lp.x * rect.width + 20, top: lp.y * rect.height - 20 }}
            >
              <Button type="button" size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((l) =>
                    l.id === lp.id ? { ...l, rotation: ((l.rotation || 0) - 15) % 360 } : l
                  ),
                });
              }}>
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((l) =>
                    l.id === lp.id ? { ...l, rotation: ((l.rotation || 0) + 15) % 360 } : l
                  ),
                });
              }}>
                <RotateCw className="h-3 w-3" />
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => {
                onChange({ ...value, lampposts: (value.lampposts || []).filter((l) => l.id !== lp.id) });
                setSelectedLamppostId(null);
              }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })()}
      </div>

      {/* Zone & lamppost counts */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        {value.zones.length > 0 && (
          <div className="flex items-center gap-2">
            <span>{value.zones.length} zone(s)</span>
            <ConfirmButton
              title={l("Effacer toutes les zones ?", "Clear all zones?")}
              description={l("Toutes les zones dessinées sur ce plan seront supprimées.", "Every zone drawn on this plan will be removed.")}
              confirmLabel={l("Effacer", "Clear")}
              cancelLabel={l("Annuler", "Cancel")}
              onConfirm={() => onChange({ ...value, zones: [] })}
            >
              <Button type="button" size="sm" variant="outline">
                {l("Effacer les zones", "Clear all zones")}
              </Button>
            </ConfirmButton>
          </div>
        )}
        {(value.lampposts || []).length > 0 && (
          <div className="flex items-center gap-2">
            <span>💡 {(value.lampposts || []).length} {l("lampadaire(s)", "lamppost(s)")}</span>
            <ConfirmButton
              title={l("Effacer tous les lampadaires ?", "Clear all lampposts?")}
              description={l("Tous les lampadaires placés sur ce plan seront supprimés.", "Every lamppost placed on this plan will be removed.")}
              confirmLabel={l("Effacer", "Clear")}
              cancelLabel={l("Annuler", "Cancel")}
              onConfirm={() => onChange({ ...value, lampposts: [] })}
            >
              <Button type="button" size="sm" variant="outline">
                {l("Effacer les lampadaires", "Clear lampposts")}
              </Button>
            </ConfirmButton>
          </div>
        )}
      </div>
    </div>
  );
});

export default PdfZoneEditor;
