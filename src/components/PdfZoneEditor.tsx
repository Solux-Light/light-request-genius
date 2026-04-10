import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PenTool, MousePointer, Trash2, RotateCcw, RotateCw, Plus, Minus, RotateCw as Rotate, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { PdfZoneValue, PdfZone, PdfLamppost, COLOR_OPTIONS } from "@/types/solux";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  value: PdfZoneValue;
  onChange: (val: PdfZoneValue) => void;
  lang?: "fr" | "en";
}

const PdfZoneEditor = ({ value, onChange, lang = "en" }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
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

  const drawingRef = useRef(false);
  const lassoPoints = useRef<{ x: number; y: number }[]>([]);
  const lastThrottle = useRef(0);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  // Load PDF
  useEffect(() => {
    if (!value.pdfUrl) return;
    const loadPdf = async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
      const doc = await pdfjsLib.getDocument(value.pdfUrl).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    };
    loadPdf().catch(console.error);
  }, [value.pdfUrl]);

  // Render page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    const render = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1, rotation });
      const containerWidth = containerRef.current?.clientWidth || 800;
      const fitScale = containerWidth / viewport.width;
      setAutoFitScale(fitScale);
      const effectiveScale = zoom * fitScale;
      const scaledViewport = page.getViewport({ scale: effectiveScale, rotation });

      const canvas = canvasRef.current!;
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

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

      // Capture preview
      try {
        const preview = canvas.toDataURL("image/png");
        if (preview !== value.previewImage) {
          onChange({ ...value, previewImage: preview, viewState: { page: currentPage, zoom, rotation } });
        }
      } catch {}
    };
    render();
  }, [pdfDoc, currentPage, zoom, rotation, value.zones, value.lampposts, selectedLamppostId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `plans/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("pdf-plans").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("pdf-plans").getPublicUrl(path);
      onChange({ ...value, pdfUrl: urlData.publicUrl, zones: [], lampposts: [] });
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (activeTool === "lasso") {
      drawingRef.current = true;
      lassoPoints.current = [{ x: nx, y: ny }];
    } else if (activeTool === "lamppost") {
      // Check existing lampposts
      const existing = (value.lampposts || []).find(
        (lp) => lp.page === currentPage && Math.abs(lp.x - nx) < 0.02 && Math.abs(lp.y - ny) < 0.02
      );
      if (existing) {
        setSelectedLamppostId(selectedLamppostId === existing.id ? null : existing.id);
      } else {
        const newLp: PdfLamppost = {
          id: crypto.randomUUID(),
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

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const now = Date.now();
    if (now - lastThrottle.current < 58) return;
    lastThrottle.current = now;
    const rect = canvasRef.current.getBoundingClientRect();
    lassoPoints.current.push({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  const handleCanvasMouseUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const points = lassoPoints.current;
    if (points.length >= 3) {
      const nextIdx = (colorIndex + 1) % COLOR_OPTIONS.length;
      const newZone: PdfZone = {
        id: crypto.randomUUID(),
        paths: points,
        color: selectedColor,
        name: `Zone ${value.zones.length + 1}`,
        page: currentPage,
      };
      onChange({ ...value, zones: [...value.zones, newZone] });
      setSelectedColor(COLOR_OPTIONS[nextIdx]);
      setColorIndex(nextIdx);
    }
    lassoPoints.current = [];
  };

  if (!value.pdfUrl) {
    return (
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-3">{l("Télécharger un plan PDF", "Upload a PDF plan")}</p>
        <Input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} className="max-w-xs mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              className={`w-6 h-6 rounded-full border-2 ${selectedColor === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => setSelectedColor(c)}
            />
          ))}
        </div>
        <div className="w-px h-6 bg-border" />
        <Button size="sm" variant={activeTool === "lasso" ? "default" : "outline"} onClick={() => setActiveTool("lasso")}>
          <PenTool className="h-4 w-4 mr-1" /> Lasso
        </Button>
        <Button size="sm" variant={activeTool === "select" ? "default" : "outline"} onClick={() => setActiveTool("select")}>
          <MousePointer className="h-4 w-4 mr-1" /> {l("Sélection", "Select")}
        </Button>
        <Button size="sm" variant={activeTool === "lamppost" ? "default" : "outline"} onClick={() => setActiveTool("lamppost")}>
          💡 {l("Lampadaire", "Lamppost")}
        </Button>
        {activeTool === "lamppost" && (
          <div className="flex gap-1">
            <Button size="sm" variant={lamppostType === "single" ? "default" : "outline"} onClick={() => setLamppostType("single")}>
              {l("Simple", "Single")}
            </Button>
            <Button size="sm" variant={lamppostType === "double" ? "default" : "outline"} onClick={() => setLamppostType("double")}>
              Double
            </Button>
          </div>
        )}
        <div className="w-px h-6 bg-border" />
        <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <Rotate className="h-4 w-4" />
        </Button>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{currentPage}/{totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => onChange({ ...value, pdfUrl: "", zones: [], lampposts: [] })}>
          {l("Changer le PDF", "Change PDF")}
        </Button>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="border rounded-lg overflow-auto max-h-[600px] relative">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
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
              <Button size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((l) =>
                    l.id === lp.id ? { ...l, rotation: ((l.rotation || 0) - 15) % 360 } : l
                  ),
                });
              }}>
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((l) =>
                    l.id === lp.id ? { ...l, rotation: ((l.rotation || 0) + 15) % 360 } : l
                  ),
                });
              }}>
                <RotateCw className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => {
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
            <Button size="sm" variant="outline" onClick={() => onChange({ ...value, zones: [] })}>
              {l("Effacer les zones", "Clear all zones")}
            </Button>
          </div>
        )}
        {(value.lampposts || []).length > 0 && (
          <div className="flex items-center gap-2">
            <span>💡 {(value.lampposts || []).length} {l("lampadaire(s)", "lamppost(s)")}</span>
            <Button size="sm" variant="outline" onClick={() => onChange({ ...value, lampposts: [] })}>
              {l("Effacer les lampadaires", "Clear lampposts")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfZoneEditor;
