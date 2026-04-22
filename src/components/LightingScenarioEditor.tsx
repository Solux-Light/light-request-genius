import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_LIGHTING_NIGHT_HOURS, LightingSegment, createDefaultLightingSegments } from "@/types/solux";

const snap30 = (h: number) => Math.round(h * 2) / 2;
const round2 = (n: number) => Math.round(n * 100) / 100;

const mkSensor = (hours: number, min: number, max: number): LightingSegment => ({
  id: crypto.randomUUID(), mode: "sensor", hours, min, max,
});

const cloneSegments = (segments?: LightingSegment[]) => {
  if (segments && segments.length > 0) return segments.map((segment) => ({ ...segment }));
  return createDefaultLightingSegments();
};

const segColor = (seg: LightingSegment) => {
  if (seg.mode === "sensor") return "rgb(137, 250, 140)";
  if (seg.intensity === 100) return "#111";
  return "rgb(170, 173, 184)";
};

const segTextColor = (seg: LightingSegment) => {
  if (seg.mode === "sensor") return "#111";
  if (seg.intensity === 100) return "#fff";
  return "#111";
};

interface Props {
  valueSegments?: LightingSegment[];
  valueNightHours?: number;
  onChange: (segments: LightingSegment[], nightHours: number) => void;
  lang?: "fr" | "en";
}

const LightingScenarioEditor = ({ valueSegments, valueNightHours, onChange, lang = "en" }: Props) => {
  const initialSegmentsRef = useRef<LightingSegment[]>(cloneSegments(valueSegments));
  const [nightHours, setNightHours] = useState(valueNightHours ?? DEFAULT_LIGHTING_NIGHT_HOURS);
  const [segments, setSegments] = useState<LightingSegment[]>(initialSegmentsRef.current);
  const [selectedId, setSelectedId] = useState(initialSegmentsRef.current[0].id);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const selected = segments.find((s) => s.id === selectedId) || segments[0];

  useEffect(() => {
    const nextSegments = cloneSegments(valueSegments);
    setSegments(nextSegments);
    setSelectedId((current) => nextSegments.some((segment) => segment.id === current) ? current : nextSegments[0].id);
  }, [valueSegments]);

  useEffect(() => {
    setNightHours(valueNightHours ?? DEFAULT_LIGHTING_NIGHT_HOURS);
  }, [valueNightHours]);

  useEffect(() => {
    onChange(segments.map((segment) => ({ ...segment })), nightHours);
  }, [segments, nightHours, onChange]);

  const normalise = (segs: LightingSegment[], total: number): LightingSegment[] => {
    const sum = segs.reduce((s, seg) => s + seg.hours, 0);
    if (sum === 0) return segs;
    const scaled = segs.map((seg) => ({ ...seg, hours: snap30(round2((seg.hours / sum) * total)) }));
    // Fix rounding
    const newSum = scaled.reduce((s, seg) => s + seg.hours, 0);
    const diff = round2(total - newSum);
    if (diff !== 0) scaled[scaled.length - 1].hours = Math.max(0.5, round2(scaled[scaled.length - 1].hours + diff));
    return scaled;
  };

  const handleNightHoursChange = (val: number[]) => {
    const nh = val[0];
    setNightHours(nh);
    setSegments((prev) => normalise(prev, nh));
  };

  const addSegment = () => {
    const idx = segments.findIndex((s) => s.id === selectedId);
    const newSeg = mkSensor(1, 30, 100);
    const next = [...segments];
    next.splice(idx + 1, 0, newSeg);
    setSegments(normalise(next, nightHours));
    setSelectedId(newSeg.id);
  };

  const removeSegment = () => {
    if (segments.length <= 1) return;
    const next = segments.filter((s) => s.id !== selectedId);
    setSegments(normalise(next, nightHours));
    setSelectedId(next[0].id);
  };

  const updateSelected = (field: string, value: any) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === selectedId ? { ...s, [field]: value } : s))
    );
  };

  const handleDurationChange = (val: number[]) => {
    const newHours = snap30(val[0]);
    const idx = segments.findIndex((s) => s.id === selectedId);
    const neighborIdx = idx < segments.length - 1 ? idx + 1 : idx - 1;
    if (neighborIdx < 0) return;
    const diff = newHours - segments[idx].hours;
    const neighborNew = Math.max(0.5, segments[neighborIdx].hours - diff);
    const actualDiff = segments[neighborIdx].hours - neighborNew;
    const next = segments.map((s, i) => {
      if (i === idx) return { ...s, hours: round2(s.hours + actualDiff) };
      if (i === neighborIdx) return { ...s, hours: neighborNew };
      return s;
    });
    setSegments(normalise(next, nightHours));
  };

  // Timeline bar drag
  const handleBarMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    setDragIdx(idx);
  };

  useEffect(() => {
    if (dragIdx === null) return;
    const handleMove = (e: MouseEvent) => {
      if (!barRef.current || dragIdx === null) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const totalBefore = segments.slice(0, dragIdx + 1).reduce((s, seg) => s + seg.hours, 0);
      const targetHours = pct * nightHours;
      const diff = snap30(targetHours - totalBefore);
      if (Math.abs(diff) < 0.5) return;
      const next = [...segments];
      const newLeft = Math.max(0.5, round2(next[dragIdx].hours + diff));
      const newRight = Math.max(0.5, round2(next[dragIdx + 1].hours - diff));
      if (newLeft >= 0.5 && newRight >= 0.5) {
        next[dragIdx] = { ...next[dragIdx], hours: newLeft };
        next[dragIdx + 1] = { ...next[dragIdx + 1], hours: newRight };
        setSegments(next);
      }
    };
    const handleUp = () => setDragIdx(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragIdx, segments, nightHours]);

  const styles = {
    card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 } as React.CSSProperties,
    activeBtn: { background: "#111", color: "#fff", border: "1px solid #111" } as React.CSSProperties,
    inactiveBtn: { background: "#fff", color: "#111", border: "1px solid #e5e7eb" } as React.CSSProperties,
  };

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Timeline bar */}
      <div ref={barRef} className="relative h-12 rounded-lg overflow-hidden mb-4 flex" style={{ border: "1px solid #e5e7eb" }}>
        {segments.map((seg, i) => {
          const pct = (seg.hours / nightHours) * 100;
          return (
            <div key={seg.id} className="relative flex items-center justify-center" style={{
              width: `${pct}%`,
              backgroundColor: segColor(seg),
              color: segTextColor(seg),
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              userSelect: "none",
            }} onClick={() => setSelectedId(seg.id)}>
              {seg.hours}h
              {/* Drag handle */}
              {i < segments.length - 1 && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize z-10"
                  style={{ transform: "translateX(50%)" }}
                  onMouseDown={(e) => handleBarMouseDown(e, i)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 3-Column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Night duration */}
        <div style={styles.card}>
          <h4 className="font-semibold text-sm mb-3">{l("Durée de nuit", "Night Duration")}</h4>
          <Slider value={[nightHours]} onValueChange={handleNightHoursChange} min={4} max={16} step={0.5} />
          <p className="text-center text-sm mt-2 font-medium">{nightHours}h</p>
        </div>

        {/* Periods */}
        <div style={styles.card}>
          <h4 className="font-semibold text-sm mb-3">{l("Périodes", "Periods")}</h4>
          <div className="space-y-1">
            {segments.map((seg) => (
              <button
                type="button"
                key={seg.id}
                className="w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between"
                style={seg.id === selectedId ? styles.activeBtn : styles.inactiveBtn}
                onClick={() => setSelectedId(seg.id)}
              >
                <span>{seg.mode === "sensor" ? "🔍 Sensor" : "💡 Fixed"}</span>
                <span>{seg.hours}h</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button type="button" size="sm" variant="outline" onClick={addSegment}>
              {l("+ Ajouter", "+ Add after")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={removeSegment} disabled={segments.length <= 1}>
              {l("Supprimer", "Delete")}
            </Button>
          </div>
        </div>

        {/* Selected period config */}
        <div style={styles.card}>
          <h4 className="font-semibold text-sm mb-3">{l("Période sélectionnée", "Selected Period")}</h4>
          {/* Mode toggle */}
          <div className="flex gap-1 mb-3">
            <button
              type="button"
              className="px-3 py-1 rounded text-sm"
              style={selected.mode === "sensor" ? styles.activeBtn : styles.inactiveBtn}
              onClick={() => updateSelected("mode", "sensor")}
            >
              Sensor
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded text-sm"
              style={selected.mode === "fixed" ? styles.activeBtn : styles.inactiveBtn}
              onClick={() => updateSelected("mode", "fixed")}
            >
              Fixed
            </button>
          </div>

          {/* Duration */}
          <div className="mb-3">
            <label className="text-xs text-muted-foreground">{l("Durée", "Duration")} ({selected.hours}h)</label>
            <Slider value={[selected.hours]} onValueChange={(v) => handleDurationChange(v)} min={0.5} max={nightHours} step={0.5} />
          </div>

          {selected.mode === "sensor" ? (
            <>
              <div className="mb-3">
                <label className="text-xs text-muted-foreground">DIM ({selected.min || 0}%)</label>
                <Slider value={[selected.min || 0]} onValueChange={(v) => updateSelected("min", v[0])} min={0} max={95} step={5} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{l("Pleine puissance", "Full power")} ({selected.max || 100}%)</label>
                <Slider value={[selected.max || 100]} onValueChange={(v) => updateSelected("max", v[0])} min={50} max={100} step={5} />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">{l("Intensité", "Intensity")} ({selected.intensity || 100}%)</label>
              <Slider value={[selected.intensity || 100]} onValueChange={(v) => updateSelected("intensity", v[0])} min={10} max={100} step={5} />
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgb(137, 250, 140)" }} />
          Sensor
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "#111" }} />
          Fixed 100%
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgb(170, 173, 184)" }} />
          Fixed &lt;100%
        </div>
      </div>
    </div>
  );
};

export default LightingScenarioEditor;
