import { memo, useState, useRef, useEffect, useCallback } from "react";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import ConfirmButton from "@/components/ConfirmButton";
import ColorSwatches from "@/components/ColorSwatches";
import { Input } from "@/components/ui/input";
import { PenTool, MousePointer, Trash2, RotateCcw, RotateCw, Plus, Minus, RotateCw as Rotate, ChevronLeft, ChevronRight, Upload, Spline, Camera } from "lucide-react";
import { PdfZoneValue, PdfZone, PdfLamppost, PdfLine, COLOR_OPTIONS, PROJECT_DOCUMENT_ACCEPT, documentKindFromFile, isAnnotatableKind, lamppostDisplay } from "@/types/solux";

interface Props {
  value: PdfZoneValue;
  onChange: (val: PdfZoneValue) => void;
  lang?: "fr" | "en";
  // Embedded mode: the parent owns file upload/replace, so hide the built-in
  // upload dropzone and the "Change PDF" button. Used by the Project Documents
  // module; Area Lighting leaves this off to keep its behaviour identical.
  embedded?: boolean;
}

// Pixel radius (on screen) within which a mousedown grabs a lamppost.
const LAMP_HIT_PX = 18;

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
  const [activeTool, setActiveTool] = useState<"lasso" | "select" | "lamppost" | "line">("select");
  const [lamppostType, setLamppostType] = useState<"single" | "double">("single");
  const [selectedLamppostId, setSelectedLamppostId] = useState<string | null>(null);
  const [autoFitScale, setAutoFitScale] = useState(1);
  // Bumped whenever the cached base layer is re-rendered, so the (cheap)
  // overlay effect knows to repaint.
  const [baseVersion, setBaseVersion] = useState(0);

  // Click-to-place lasso points (like Google Map)
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[]>([]);
  // In-progress indication line (feedback #2) — open polyline.
  const [linePath, setLinePath] = useState<{ x: number; y: number }[]>([]);

  // Lamppost dragging (feedback #1 — plan lampposts could not be moved at all).
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  // C4/P2 — the canvas→base64 preview capture is deferred (debounced) and merged
  // onto the LATEST value via a ref, so it (a) doesn't re-encode a multi-MB PNG on
  // every render/lasso point, and (b) can't revert a concurrent zone edit by
  // spreading a stale `value`.
  const valueRef = useRef(value);
  valueRef.current = value;
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(captureTimerRef.current), []);

  // Cached base layer (the rendered PDF page / image WITHOUT annotations).
  // Annotation edits and lamppost drags repaint from this cache instead of
  // re-rendering the PDF page — that's what makes dragging fluid.
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Render the BASE layer (PDF page / image) into the offscreen cache.
  useEffect(() => {
    if (isImage ? !imgEl : !pdfDoc) return;
    let cancelled = false;
    const renderBase = async () => {
      const containerWidth = containerRef.current?.clientWidth || 800;
      const base = document.createElement("canvas");
      const ctx = base.getContext("2d")!;

      if (isImage) {
        // Fit-to-width using the rotated footprint so 90°/270° still fits.
        const swap = rotation === 90 || rotation === 270;
        const fitScale = containerWidth / (swap ? imgEl!.naturalHeight : imgEl!.naturalWidth);
        if (cancelled) return;
        setAutoFitScale(fitScale);
        const effectiveScale = zoom * fitScale;
        const drawW = imgEl!.naturalWidth * effectiveScale;
        const drawH = imgEl!.naturalHeight * effectiveScale;
        base.width = swap ? drawH : drawW;
        base.height = swap ? drawW : drawH;
        ctx.clearRect(0, 0, base.width, base.height);
        ctx.save();
        ctx.translate(base.width / 2, base.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(imgEl!, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      } else {
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1, rotation });
        const fitScale = containerWidth / viewport.width;
        if (cancelled) return;
        setAutoFitScale(fitScale);
        const effectiveScale = zoom * fitScale;
        const scaledViewport = page.getViewport({ scale: effectiveScale, rotation });
        base.width = scaledViewport.width;
        base.height = scaledViewport.height;
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        if (cancelled) return;
      }

      baseCanvasRef.current = base;
      setBaseVersion((v) => v + 1);
    };
    renderBase().catch(console.error);
    return () => { cancelled = true; };
  }, [pdfDoc, imgEl, isImage, currentPage, zoom, rotation]);

  // Capture the preview EXACTLY as the user currently frames it (feedback #8):
  // the visible portion of the canvas inside the scroll container — never an
  // automatic re-crop of the whole document.
  const capturePreview = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || canvas.width === 0) return;
    try {
      const sx = container.scrollLeft;
      const sy = container.scrollTop;
      const sw = Math.min(container.clientWidth, canvas.width - sx);
      const sh = Math.min(container.clientHeight, canvas.height - sy);
      let preview: string;
      if (sw >= canvas.width - 1 && sh >= canvas.height - 1) {
        preview = canvas.toDataURL("image/png"); // fully visible — capture all
      } else {
        const crop = document.createElement("canvas");
        crop.width = Math.max(1, sw);
        crop.height = Math.max(1, sh);
        crop.getContext("2d")!.drawImage(canvas, sx, sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
        preview = crop.toDataURL("image/png");
      }
      const cur = valueRef.current;
      if (preview !== cur.previewImage) {
        onChange({
          ...cur,
          previewImage: preview,
          viewState: { page: currentPage, zoom, rotation, scrollLeft: sx, scrollTop: sy },
        });
      }
    } catch { /* tainted canvas / unsupported — leave preview as-is */ }
  }, [onChange, currentPage, zoom, rotation]);

  const scheduleCapture = useCallback(() => {
    clearTimeout(captureTimerRef.current);
    captureTimerRef.current = setTimeout(capturePreview, 400);
  }, [capturePreview]);

  // Draw base cache + annotation overlay onto the visible canvas (cheap).
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = base.width;
    canvas.height = base.height;
    ctx.drawImage(base, 0, 0);

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

    // Draw committed indication lines (feedback #2)
    (value.lines || []).filter((ln) => ln.page === currentPage).forEach((ln) => {
      if (ln.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(ln.points[0].x * canvas.width, ln.points[0].y * canvas.height);
      ln.points.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x * canvas.width, p.y * canvas.height); });
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.stroke();
    });

    // Draw in-progress line
    if (linePath.length > 0) {
      ctx.beginPath();
      ctx.moveTo(linePath[0].x * canvas.width, linePath[0].y * canvas.height);
      linePath.forEach((p, i) => { if (i > 0) ctx.lineTo(p.x * canvas.width, p.y * canvas.height); });
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      linePath.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
        ctx.fillStyle = selectedColor;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

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

    // Draw lampposts — each with its identification colour + label (feedback #4).
    const allLamps = value.lampposts || [];
    allLamps.forEach((lp, globalIdx) => {
      if (lp.page !== currentPage) return;
      const identity = lamppostDisplay(lp, globalIdx);
      const cx = lp.x * canvas.width;
      const cy = lp.y * canvas.height;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(((lp.rotation || 0) * Math.PI) / 180);
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = identity.color;
      ctx.fill();
      ctx.strokeStyle = "#00000055";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = identity.color;
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
      // Label above the pole, with a white halo so it stays readable on plans.
      ctx.font = "bold 12px Inter, system-ui";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(identity.label, cx, cy - 10);
      ctx.fillStyle = identity.color;
      ctx.fillText(identity.label, cx, cy - 10);
    });

    // Preview capture — deferred so rapid edits coalesce into one encode.
    scheduleCapture();
  }, [baseVersion, currentPage, value.zones, value.lampposts, value.lines, selectedLamppostId, lassoPath, linePath, selectedColor, scheduleCapture]);

  // Re-capture the framing when the user scrolls the plan (feedback #8): the
  // exported image must always match the LAST view they had on screen.
  // `value.pdfUrl` in the deps: the container only exists once a file is
  // loaded, so an effect run from before the upload would find null and
  // never attach.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => scheduleCapture();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [scheduleCapture, value.pdfUrl]);

  // Ctrl/Cmd + wheel (and trackpad pinch) zooms the PLAN, not the page
  // (feedback #9). Non-passive so preventDefault stops the browser zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel keeps scrolling the plan
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cx = e.clientX - rect.left + container.scrollLeft;
      const cy = e.clientY - rect.top + container.scrollTop;
      setZoom((z) => {
        const next = Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const ratio = next / z;
        // Keep the point under the cursor stationary while zooming.
        requestAnimationFrame(() => {
          container.scrollLeft = cx * ratio - (e.clientX - rect.left);
          container.scrollTop = cy * ratio - (e.clientY - rect.top);
        });
        return next;
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [value.pdfUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const kind = documentKindFromFile(file);
      if (isAnnotatableKind(kind)) {
        // PDFs and images share the exact same annotation tooling.
        // Re-attaching a file to a RESTORED project (no current pdfUrl, but
        // saved zones/lines/lampposts) must keep those annotations — that's
        // how drawn lines stay visible when a request is reopened (#2).
        // Explicitly replacing a loaded file ("Change file") already clears
        // everything before reaching here.
        const restoring = !value.pdfUrl &&
          (value.zones.length > 0 || (value.lampposts || []).length > 0 || (value.lines || []).length > 0);
        const localUrl = URL.createObjectURL(file);
        onChange({
          ...value,
          pdfUrl: localUrl,
          mediaType: kind === "image" ? "image" : "pdf",
          sourceKind: kind,
          sourceFileName: file.name,
          zones: restoring ? value.zones : [],
          lampposts: restoring ? (value.lampposts || []) : [],
          lines: restoring ? (value.lines || []) : [],
          extraFrames: [],
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
          lines: [],
          extraFrames: [],
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

  const finishLine = useCallback(() => {
    if (linePath.length >= 2) {
      const newLine: PdfLine = {
        id: uid(),
        points: linePath,
        color: selectedColor,
        page: currentPage,
      };
      onChange({ ...value, lines: [...(value.lines || []), newLine] });
    }
    setLinePath([]);
  }, [linePath, selectedColor, onChange, value, currentPage]);

  // Lamppost under the given canvas-normalised point, within LAMP_HIT_PX.
  const lampAt = useCallback((nx: number, ny: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return (value.lampposts || []).find((lp) => {
      if (lp.page !== currentPage) return false;
      const dx = (lp.x - nx) * rect.width;
      const dy = (lp.y - ny) * rect.height;
      return Math.hypot(dx, dy) < LAMP_HIT_PX;
    }) || null;
  }, [value.lampposts, currentPage]);

  const canvasPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
  };

  // --- Lamppost dragging (feedback #1) — works in Select AND Lamppost mode,
  // exactly like the map behaves. ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    if (activeTool !== "select" && activeTool !== "lamppost") return;
    const { nx, ny } = canvasPoint(e);
    const lp = lampAt(nx, ny);
    if (lp) {
      // Selection itself happens on click / at drag end — pre-selecting here
      // would make the follow-up click toggle it straight back off.
      dragRef.current = { id: lp.id, moved: false };
      e.preventDefault();
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag || !canvasRef.current) return;
    const { nx, ny } = canvasPoint(e);
    drag.moved = true;
    if (selectedLamppostId !== drag.id) setSelectedLamppostId(drag.id);
    onChange({
      ...valueRef.current,
      lampposts: (valueRef.current.lampposts || []).map((lp) =>
        lp.id === drag.id ? { ...lp, x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) } : lp,
      ),
    });
  };
  const handleMouseUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      dragRef.current = null; // plain click — let the click handler decide
      return;
    }
    // Keep the flag just long enough to swallow the click that ends the drag;
    // clear it shortly after in case the release happened off-canvas and no
    // click ever fires (otherwise the NEXT click would be swallowed).
    setTimeout(() => { dragRef.current = null; }, 150);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    // Swallow the click that ends a drag.
    if (dragRef.current?.moved) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;
    const { nx, ny } = canvasPoint(e);

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
    } else if (activeTool === "line") {
      setLinePath((prev) => [...prev, { x: nx, y: ny }]);
    } else if (activeTool === "lamppost") {
      const existing = lampAt(nx, ny);
      if (existing) {
        setSelectedLamppostId(selectedLamppostId === existing.id ? null : existing.id);
      } else {
        const count = (value.lampposts || []).length;
        const identity = lamppostDisplay({}, count);
        const newLp: PdfLamppost = {
          id: uid(),
          x: nx,
          y: ny,
          page: currentPage,
          type: lamppostType,
          rotation: 0,
          color: identity.color,
          label: identity.label,
        };
        onChange({ ...value, lampposts: [...(value.lampposts || []), newLp] });
        setSelectedLamppostId(newLp.id);
      }
    } else if (activeTool === "select") {
      const existing = lampAt(nx, ny);
      setSelectedLamppostId(existing ? existing.id : null);
    }
  };

  const handleCanvasDblClick = (e: React.MouseEvent) => {
    if (activeTool === "lasso") {
      e.preventDefault();
      closeLasso();
    } else if (activeTool === "line") {
      e.preventDefault();
      finishLine();
    }
  };

  // Extra saved views of the plan (feedback #5) — snapshot of the current
  // framing, appended to the exported PDF.
  const addPlanFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || canvas.width === 0) return;
    try {
      const sx = container.scrollLeft;
      const sy = container.scrollTop;
      const sw = Math.min(container.clientWidth, canvas.width - sx);
      const sh = Math.min(container.clientHeight, canvas.height - sy);
      const crop = document.createElement("canvas");
      crop.width = Math.max(1, sw);
      crop.height = Math.max(1, sh);
      crop.getContext("2d")!.drawImage(canvas, sx, sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
      onChange({
        ...valueRef.current,
        extraFrames: [...(valueRef.current.extraFrames || []), { id: uid(), image: crop.toDataURL("image/png") }],
      });
    } catch { /* tainted canvas — ignore */ }
  }, [onChange]);

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
        <Button type="button" size="sm" variant={activeTool === "lasso" ? "default" : "outline"} onClick={() => setActiveTool("lasso")} title={l("Dessiner le contour d'une zone d'étude", "Draw the boundary of a study zone")}>
          <PenTool className="h-4 w-4 mr-1" /> Lasso
        </Button>
        <Button type="button" size="sm" variant={activeTool === "select" ? "default" : "outline"} onClick={() => setActiveTool("select")} title={l("Sélectionner et déplacer un lampadaire", "Select and move a lamp post")}>
          <MousePointer className="h-4 w-4 mr-1" /> {l("Sélection", "Select")}
        </Button>
        <Button
          type="button" size="sm"
          variant={activeTool === "line" ? "default" : "outline"}
          onClick={() => setActiveTool("line")}
          title={l(
            "Tracer des lignes d'indication pour le Study Lab (ex. rouge = pas de lampadaires, vert = installation possible)",
            "Draw indication lines for the Study Lab (e.g. red = no lampposts, green = installation allowed)",
          )}
        >
          <Spline className="h-4 w-4 mr-1" /> {l("Ligne", "Line")}
        </Button>
        <Button type="button" size="sm" variant={activeTool === "lamppost" ? "default" : "outline"} onClick={() => setActiveTool("lamppost")} title={l("Placer les positions de lampadaires", "Place lamp-post positions")}>
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
        {activeTool === "line" && linePath.length > 0 && (
          <Button type="button" size="sm" variant="default" onClick={finishLine} disabled={linePath.length < 2}>
            ✓ {l("Terminer la ligne", "Finish line")} ({linePath.length} pts)
          </Button>
        )}
        {activeTool === "line" && linePath.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {l("Choisissez une couleur puis cliquez pour tracer — double-clic pour terminer", "Pick a colour then click to draw — double-click to finish")}
          </span>
        )}
        <div className="w-px h-6 bg-border" />
        <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(z + 0.25, 4))} title={l("Zoomer le plan (ou Ctrl + molette)", "Zoom the plan (or Ctrl + wheel)")}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))} title={l("Dézoomer le plan", "Zoom the plan out")}>
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
          <Button type="button" size="sm" variant="outline" onClick={() => { setLassoPath([]); setLinePath([]); onChange({ ...value, pdfUrl: "", sourceKind: undefined, sourceFileName: undefined, zones: [], lampposts: [], lines: [], extraFrames: [] }); }}>
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
        />
        {/* Selected lamppost popup */}
        {selectedLamppostId && (() => {
          const allLamps = value.lampposts || [];
          const lpIndex = allLamps.findIndex((x) => x.id === selectedLamppostId && x.page === currentPage);
          const lp = lpIndex >= 0 ? allLamps[lpIndex] : null;
          if (!lp || !canvasRef.current) return null;
          const identity = lamppostDisplay(lp, lpIndex);
          const rect = canvasRef.current;
          return (
            <div
              className="absolute bg-card border rounded-lg shadow-lg p-2 flex items-center gap-1"
              style={{ left: lp.x * rect.width + 20, top: lp.y * rect.height - 20 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: identity.color }}>
                {identity.label}
              </span>
              <Input
                className="h-7 w-20 text-sm"
                value={lp.label ?? identity.label}
                maxLength={12}
                onChange={(e) => {
                  onChange({
                    ...value,
                    lampposts: allLamps.map((x) => (x.id === lp.id ? { ...x, label: e.target.value } : x)),
                  });
                }}
              />
              <Button type="button" size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: allLamps.map((x) =>
                    x.id === lp.id ? { ...x, rotation: ((x.rotation || 0) - 15) % 360 } : x
                  ),
                });
              }}>
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: allLamps.map((x) =>
                    x.id === lp.id ? { ...x, rotation: ((x.rotation || 0) + 15) % 360 } : x
                  ),
                });
              }}>
                <RotateCw className="h-3 w-3" />
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => {
                onChange({ ...value, lampposts: allLamps.filter((x) => x.id !== lp.id) });
                setSelectedLamppostId(null);
              }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })()}
      </div>

      {/* Extra saved views (feedback #5) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button" size="sm" variant="outline"
          onClick={addPlanFrame}
          title={l(
            "Enregistre la vue actuelle comme cadre supplémentaire — chaque cadre est exporté dans le PDF (utile pour des zones éloignées).",
            "Saves the current view as an extra frame — every frame is exported in the PDF (useful for far-apart areas).",
          )}
        >
          <Camera className="h-4 w-4 mr-1.5" />
          {l("Ajouter un cadre (vue actuelle)", "Add plan frame (current view)")}
        </Button>
        {(value.extraFrames || []).map((f, i) => (
          <span key={f.id} className="inline-flex items-center gap-2 rounded border p-1">
            <img src={f.image} alt={`Frame ${i + 2}`} className="h-12 w-auto rounded" />
            <span className="text-xs text-muted-foreground">{l("Vue", "View")} {i + 2}</span>
            <Button
              type="button" size="icon" variant="ghost"
              className="h-5 w-5 text-destructive hover:text-destructive"
              aria-label={l("Retirer cette vue", "Remove this view")}
              title={l("Retirer cette vue", "Remove this view")}
              onClick={() => onChange({ ...value, extraFrames: (value.extraFrames || []).filter((x) => x.id !== f.id) })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </span>
        ))}
      </div>

      {/* Zone / line / lamppost summaries */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
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
        {(value.lines || []).length > 0 && (
          <div className="flex items-center gap-2">
            <span>{(value.lines || []).length} {l("ligne(s)", "line(s)")}</span>
            {(value.lines || []).map((ln, i) => (
              <span key={ln.id} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
                <span className="inline-block h-1 w-5 rounded" style={{ backgroundColor: ln.color }} />
                <Button
                  type="button" size="icon" variant="ghost"
                  className="h-4 w-4 text-destructive hover:text-destructive"
                  aria-label={`${l("Supprimer la ligne", "Delete line")} ${i + 1}`}
                  title={`${l("Supprimer la ligne", "Delete line")} ${i + 1}`}
                  onClick={() => onChange({ ...value, lines: (value.lines || []).filter((x) => x.id !== ln.id) })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
        {(value.lampposts || []).length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span>💡 {(value.lampposts || []).length} {l("lampadaire(s)", "lamppost(s)")}</span>
            {(value.lampposts || []).map((lp, i) => {
              const identity = lamppostDisplay(lp, i);
              return (
                <button
                  key={lp.id}
                  type="button"
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${selectedLamppostId === lp.id ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                  style={{ backgroundColor: identity.color }}
                  title={`${identity.label} — ${lp.type === "double" ? "double" : "single"}`}
                  onClick={() => setSelectedLamppostId(lp.id)}
                >
                  {identity.label}
                </button>
              );
            })}
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
