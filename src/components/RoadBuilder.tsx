import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const addSegment = () => {
    const seg: RoadSegment = {
      id: crypto.randomUUID(),
      type: "lane",
      width: 3.5,
      direction: "forward",
    };
    onChange([...value, seg]);
    setSelectedId(seg.id);
  };

  const updateSegment = (id: string, field: string, val: any) => {
    onChange(value.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  };

  const removeSegment = (id: string) => {
    onChange(value.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateSegment = (seg: RoadSegment) => {
    const idx = value.findIndex((s) => s.id === seg.id);
    const copy = { ...seg, id: crypto.randomUUID() };
    const next = [...value];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setSelectedId(copy.id);
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
    <div className="space-y-4">
      {/* Header with actions */}
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

      {/* Visual cross-section — main UI */}
      {value.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-4">{l("Aperçu du profil routier", "Road profile preview")}</p>
          <div className="flex items-end justify-center" style={{ minHeight: 100 }}>
            {value.map((seg) => {
              const isSelected = selectedId === seg.id;
              return (
                <div
                  key={seg.id}
                  className={`relative flex flex-col items-center justify-center cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary ring-offset-2 rounded" : ""}`}
                  style={{
                    minWidth: 70,
                    width: `${(seg.width / totalWidth) * 100}%`,
                    maxWidth: seg.width * 50,
                    height: 60,
                    backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  onClick={() => setSelectedId(isSelected ? null : seg.id)}
                >
                  {/* Direction arrow above */}
                  {seg.type === "lane" && seg.direction && (
                    <span className="absolute -top-5 text-foreground text-sm">
                      {seg.direction === "forward" ? "↑" : seg.direction === "backward" ? "↓" : "↕"}
                    </span>
                  )}
                  <span>{getLabel(seg.type)}</span>
                </div>
              );
            })}
          </div>
          {/* Width labels below */}
          <div className="flex items-start justify-center mt-1">
            {value.map((seg) => (
              <div
                key={seg.id}
                className="text-center text-xs text-muted-foreground"
                style={{
                  minWidth: 70,
                  width: `${(seg.width / totalWidth) * 100}%`,
                  maxWidth: seg.width * 50,
                }}
              >
                {seg.width}m
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-3">
            {l("Largeur totale", "Total width")}: <strong>{totalWidth.toFixed(1)}m</strong>
          </p>
        </div>
      )}

      {/* Selected segment editor */}
      {selectedId && (() => {
        const seg = value.find((s) => s.id === selectedId);
        if (!seg) return null;
        return (
          <div className="border rounded-lg p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{l("Modifier le segment", "Edit segment")}</span>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => duplicateSegment(seg)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => removeSegment(seg.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{l("Type", "Type")}</label>
                <Select value={seg.type} onValueChange={(v) => {
                  const def = SEGMENT_TYPES.find((t) => t.value === v);
                  updateSegment(seg.id, "type", v);
                  if (def) updateSegment(seg.id, "width", def.defaultWidth);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEGMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{lang === "fr" ? t.labelFr : t.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{l("Largeur (m)", "Width (m)")}</label>
                <Input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={20}
                  value={seg.width}
                  onChange={(e) => updateSegment(seg.id, "width", parseFloat(e.target.value) || 0.5)}
                />
              </div>
              {seg.type === "lane" && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{l("Direction", "Direction")}</label>
                  <Select value={seg.direction || "forward"} onValueChange={(v) => updateSegment(seg.id, "direction", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">{l("→ Avant", "→ Forward")}</SelectItem>
                      <SelectItem value="backward">{l("← Arrière", "← Backward")}</SelectItem>
                      <SelectItem value="both">{l("↔ Les deux", "↔ Both")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Segment list — compact reorder */}
      {value.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{l("Glisser pour réorganiser", "Drag to reorder")}</p>
          {value.map((seg, i) => (
            <div
              key={seg.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded border text-sm cursor-pointer ${selectedId === seg.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"} ${dropIdx === i ? "ring-2 ring-primary" : ""} ${dragIdx === i ? "opacity-50" : ""}`}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
              onClick={() => setSelectedId(selectedId === seg.id ? null : seg.id)}
            >
              <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[seg.type] || "#888" }} />
              <span className="flex-1">{getLabel(seg.type)}</span>
              <span className="text-muted-foreground">{seg.width}m</span>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <p>{l("Aucun segment. Cliquez sur \"Ajouter un segment\" pour commencer.", "No segments. Click \"Add Segment\" to start.")}</p>
        </div>
      )}
    </div>
  );
};

export default RoadBuilder;
