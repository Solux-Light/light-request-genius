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

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const addSegment = () => {
    onChange([...value, {
      id: crypto.randomUUID(),
      type: "lane",
      width: 3.5,
      direction: "forward",
    }]);
  };

  const updateSegment = (id: string, field: string, val: any) => {
    onChange(value.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
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
    <div className="space-y-4">
      {/* Segment list */}
      {value.map((seg, i) => (
        <div
          key={seg.id}
          className={`flex items-center gap-2 p-3 rounded-lg border ${dropIdx === i ? "ring-2 ring-primary" : ""} ${dragIdx === i ? "opacity-50" : ""}`}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[seg.type] || "#888" }} />
          <Select value={seg.type} onValueChange={(v) => {
            const def = SEGMENT_TYPES.find((t) => t.value === v);
            updateSegment(seg.id, "type", v);
            if (def) updateSegment(seg.id, "width", def.defaultWidth);
          }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{lang === "fr" ? t.labelFr : t.labelEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step={0.5}
            min={0.5}
            max={20}
            value={seg.width}
            onChange={(e) => updateSegment(seg.id, "width", parseFloat(e.target.value) || 0.5)}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">m</span>
          {seg.type === "lane" && (
            <Select value={seg.direction || "forward"} onValueChange={(v) => updateSegment(seg.id, "direction", v)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="forward">{l("→ Avant", "→ Forward")}</SelectItem>
                <SelectItem value="backward">{l("← Arrière", "← Backward")}</SelectItem>
                <SelectItem value="both">{l("↔ Les deux", "↔ Both")}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="ghost" onClick={() => duplicateSegment(seg)}>
            <Copy className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="destructive" onClick={() => removeSegment(seg.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={addSegment}>
          <Plus className="h-4 w-4 mr-1" /> {l("Ajouter un segment", "Add Segment")}
        </Button>
        {value.length > 0 && (
          <Button variant="outline" onClick={mirrorProfile}>
            {l("Miroir", "Mirror")}
          </Button>
        )}
      </div>

      {/* Visual cross-section */}
      {value.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex">
            {value.map((seg) => (
              <div
                key={seg.id}
                className="flex flex-col items-center justify-end px-1"
                style={{
                  minWidth: 60,
                  width: seg.width * 40,
                  height: 80,
                  backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                <span>{getLabel(seg.type)}</span>
                <span>{seg.width}m</span>
                {seg.type === "lane" && seg.direction && (
                  <span>{seg.direction === "forward" ? "→" : seg.direction === "backward" ? "←" : "↔"}</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {l("Largeur totale", "Total width")}: {totalWidth.toFixed(1)}m
          </p>
        </div>
      )}
    </div>
  );
};

export default RoadBuilder;
