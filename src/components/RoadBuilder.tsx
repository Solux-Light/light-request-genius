import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Copy, GripVertical, Plus } from "lucide-react";
import { RoadProfile, RoadSegment, SEGMENT_TYPES, SEGMENT_COLORS } from "@/types/solux";

interface Props {
  value: RoadProfile;
  onChange: (v: RoadProfile) => void;
  lang?: "fr" | "en";
}

const RoadBuilder = ({ value, onChange, lang = "en" }: Props) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const addSegment = () => {
    onChange([...value, {
      id: crypto.randomUUID(),
      type: "lane",
      width: 3.5,
      direction: "forward",
    }]);
  };

  const updateSegment = (id: string, updates: Record<string, any>) => {
    onChange(value.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeSegment = (id: string) => {
    onChange(value.filter((s) => s.id !== id));
  };

  const duplicateSegment = (seg: RoadSegment) => {
    const idx = value.findIndex((s) => s.id === seg.id);
    const copy = { ...seg, id: crypto.randomUUID() };
    const next = [...value];
    next.splice(idx + 1, 0, copy);
    onChange(next);
  };

  const mirrorProfile = () => {
    const mirrored = [...value].reverse().map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      direction: s.direction === "forward" ? "backward" as const : s.direction === "backward" ? "forward" as const : s.direction,
    }));
    onChange([...value, ...mirrored]);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDropIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx === null) return;
    const next = [...value];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    setDragIdx(null);
    setDropIdx(null);
  };

  const totalWidth = value.reduce((s, seg) => s + seg.width, 0);

  const getLabel = (type: string) => {
    const t = SEGMENT_TYPES.find((s) => s.value === type);
    return t ? (lang === "fr" ? t.labelFr : t.labelEn) : type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{l("Profil routier", "Road Profile")}</h3>
        <div className="flex gap-2">
          {value.length > 0 && (
            <Button type="button" variant="outline" onClick={mirrorProfile}>
              {l("Miroir", "Mirror")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={addSegment}>
            <Plus className="h-4 w-4 mr-1" /> {l("Ajouter un segment", "Add Segment")}
          </Button>
        </div>
      </div>

      {/* Visual cross-section */}
      {value.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <div className="flex items-end justify-center">
            {value.map((seg) => (
              <div key={seg.id} className="flex flex-col items-center">
                {/* Direction arrow */}
                {seg.type === "lane" && seg.direction && (
                  <span className="text-sm text-foreground mb-1">
                    {seg.direction === "forward" ? "↑" : seg.direction === "backward" ? "↓" : "↕"}
                  </span>
                )}
                {seg.type !== "lane" && <span className="text-sm mb-1">&nbsp;</span>}
                {/* Segment block */}
                <div
                  className="flex items-center justify-center"
                  style={{
                    minWidth: 70,
                    width: seg.width * 45,
                    height: 44,
                    backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {getLabel(seg.type)}
                </div>
                {/* Width label */}
                <span className="text-xs text-muted-foreground mt-1">{seg.width}m</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-3">
            {l("Largeur totale", "Total width")}: <strong>{totalWidth.toFixed(1)}m</strong>
          </p>
        </div>
      )}

      {/* Segment list — each as a card row */}
      {value.map((seg, i) => (
        <div
          key={seg.id}
          className={`flex items-end gap-4 p-4 rounded-lg border bg-card ${dropIdx === i ? "ring-2 ring-primary" : ""} ${dragIdx === i ? "opacity-50" : ""}`}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
        >
          <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab shrink-0 mb-2" />

          {/* Type */}
          <div className="flex-1 space-y-1">
            <Label className="text-xs">{l("Type", "Type")}</Label>
            <Select value={seg.type} onValueChange={(v) => {
              const def = SEGMENT_TYPES.find((t) => t.value === v);
              updateSegment(seg.id, { type: v, ...(def ? { width: def.defaultWidth } : {}) });
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEGMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{lang === "fr" ? t.labelFr : t.labelEn}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Width */}
          <div className="w-28 space-y-1">
            <Label className="text-xs">{l("Largeur (m)", "Width (m)")}</Label>
            <Input
              type="number"
              step={0.5}
              min={0.5}
              max={20}
              value={seg.width}
              onChange={(e) => updateSegment(seg.id, { width: parseFloat(e.target.value) || 0.5 })}
            />
          </div>

          {/* Direction (lanes only) */}
          {seg.type === "lane" && (
            <div className="w-36 space-y-1">
              <Label className="text-xs">{l("Direction", "Direction")}</Label>
              <Select value={seg.direction || "forward"} onValueChange={(v) => updateSegment(seg.id, { direction: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="forward">{l("Avant", "Forward")}</SelectItem>
                  <SelectItem value="backward">{l("Arrière", "Backward")}</SelectItem>
                  <SelectItem value="both">{l("Les deux", "Both")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Actions */}
          <Button type="button" size="icon" variant="ghost" onClick={() => duplicateSegment(seg)} className="shrink-0 mb-0.5">
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => removeSegment(seg.id)} className="shrink-0 mb-0.5 text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {value.length === 0 && (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <p>{l("Aucun segment. Cliquez sur \"Ajouter un segment\" pour commencer.", "No segments. Click \"Add Segment\" to start.")}</p>
        </div>
      )}
    </div>
  );
};

export default RoadBuilder;
