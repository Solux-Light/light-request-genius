import { memo } from "react";
import { Button } from "@/components/ui/button";
import { uid } from "@/lib/utils";
import NumericInput from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Wand2, Sunrise } from "lucide-react";
import {
  ProfileProgram,
  LightingSegment,
  BOOST_DURATION_OPTIONS,
  DETECTION_ESTIMATE_OPTIONS,
} from "@/types/solux";
import { rescaleSegmentsToTotal } from "@/lib/program";

// Compact, data-entry-oriented lighting program editor for profiles.
// Engineers know the values they want: direct numeric inputs in a dense table,
// with the timeline kept as a thin read-only preview. Durations are typed
// freely; a live total warns when periods don't fill (night − Morning Time),
// and one click rescales them proportionally.
interface Props {
  value: ProfileProgram;
  onChange: (next: ProfileProgram) => void;
  lang?: "fr" | "en";
}

const segColor = (seg: LightingSegment) => {
  if (seg.mode === "sensor") return "rgb(137, 250, 140)";
  if ((seg.intensity ?? 100) === 100) return "#111";
  return "rgb(170, 173, 184)";
};

const LightingProgramTable = memo(function LightingProgramTable({ value, onChange, lang = "en" }: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const patch = (p: Partial<ProfileProgram>) => onChange({ ...value, ...p });
  const patchSeg = (id: string, p: Partial<LightingSegment>) =>
    patch({ segments: value.segments.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const programTarget = Math.max(0, value.nightHours - value.morningTimeH);
  const total = value.segments.reduce((s, x) => s + (x.hours || 0), 0);
  const mismatch = Math.abs(total - programTarget) >= 0.25;

  // Q3 — single shared implementation (lib/program) for the proportional fit.
  const rescale = () => {
    if (total <= 0 || value.segments.length === 0) return;
    patch({ segments: rescaleSegmentsToTotal(value.segments, programTarget) });
  };

  const addPeriod = () =>
    patch({
      segments: [
        ...value.segments,
        { id: uid(), mode: "fixed", hours: 1, intensity: 100 },
      ],
    });

  const cell = "h-8 px-2 text-sm";

  return (
    <div className="space-y-3">
      {/* Global timings — direct numeric entry */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">{l("Durée de nuit (h)", "Night duration (h)")}</Label>
          <NumericInput
            step="0.5" min={1} max={24}
            value={value.nightHours}
            onCommit={(n) => patch({ nightHours: n })}
            className={`${cell} w-24`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><Sunrise className="h-3.5 w-3.5 text-amber-600" /> Morning Time (h)</Label>
          <NumericInput
            step="0.5" min={0} max={6}
            value={value.morningTimeH}
            onCommit={(n) => patch({ morningTimeH: n })}
            className={`${cell} w-24`}
            title={l("Toujours la dernière période — se termine au lever du soleil", "Always the final period — ends at sunrise")}
          />
        </div>
        {value.morningTimeH > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">{l("Intensité Morning (%)", "Morning intensity (%)")}</Label>
            <NumericInput
              step="5" min={10} max={100}
              value={value.morningIntensityPct}
              onCommit={(n) => patch({ morningIntensityPct: n })}
              className={`${cell} w-24`}
            />
          </div>
        )}
        <div className={`ml-auto flex items-center gap-2 text-sm ${mismatch ? "text-amber-700" : "text-muted-foreground"}`}>
          <span>
            {l("Périodes", "Periods")}: <strong>{Math.round(total * 100) / 100}h</strong> / {programTarget}h
            {mismatch && " ⚠"}
          </span>
          {mismatch && (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={rescale}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> {l("Ajuster", "Fit")}
            </Button>
          )}
        </div>
      </div>

      {/* Periods — dense engineering table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-2 py-1.5 font-semibold w-8">#</th>
              <th className="px-2 py-1.5 font-semibold w-32">{l("Mode", "Mode")}</th>
              <th className="px-2 py-1.5 font-semibold w-24">{l("Durée (h)", "Hours")}</th>
              <th className="px-2 py-1.5 font-semibold w-40">{l("Puissance (%)", "Power (%)")}</th>
              <th className="px-2 py-1.5 font-semibold w-28">{l("Boost", "Boost")}</th>
              <th className="px-2 py-1.5 font-semibold w-28">{l("Détections", "Detections")}</th>
              <th className="px-2 py-1.5 w-9" />
            </tr>
          </thead>
          <tbody>
            {value.segments.map((seg, i) => (
              <tr key={seg.id} className="border-b last:border-0">
                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                <td className="px-1 py-1">
                  <Select
                    value={seg.mode}
                    onValueChange={(v) =>
                      patchSeg(seg.id, v === "sensor"
                        ? { mode: "sensor", min: seg.min ?? 30, max: seg.max ?? 100, boostDurationS: seg.boostDurationS ?? 30, estimatedDetections: seg.estimatedDetections ?? 100 }
                        : { mode: "fixed", intensity: seg.intensity ?? 100 })
                    }
                  >
                    <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-1 focus:ring-primary"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sensor">🔍 {l("Détection", "Sensor")}</SelectItem>
                      <SelectItem value="fixed">💡 {l("Fixe", "Fixed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <NumericInput
                    step="0.5" min={0.5}
                    value={seg.hours}
                    onCommit={(n) => patchSeg(seg.id, { hours: n })}
                    className={`${cell} border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary rounded-none`}
                  />
                </td>
                <td className="px-1 py-1">
                  {seg.mode === "sensor" ? (
                    <div className="flex items-center gap-1">
                      <NumericInput
                        step="5" min={0} max={95}
                        value={seg.min ?? 0}
                        onCommit={(n) => patchSeg(seg.id, { min: n })}
                        className={`${cell} w-16 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary rounded-none`}
                        title={l("Puissance de veille", "Idle power")}
                      />
                      <span className="text-muted-foreground">→</span>
                      <NumericInput
                        step="5" min={50} max={100}
                        value={seg.max ?? 100}
                        onCommit={(n) => patchSeg(seg.id, { max: n })}
                        className={`${cell} w-16 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary rounded-none`}
                        title={l("Puissance de détection", "Detection power")}
                      />
                    </div>
                  ) : (
                    <NumericInput
                      step="5" min={10} max={100}
                      value={seg.intensity ?? 100}
                      onCommit={(n) => patchSeg(seg.id, { intensity: n })}
                      className={`${cell} w-16 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary rounded-none`}
                    />
                  )}
                </td>
                <td className="px-1 py-1">
                  {seg.mode === "sensor" ? (
                    <Select value={String(seg.boostDurationS ?? 30)} onValueChange={(v) => patchSeg(seg.id, { boostDurationS: Number(v) })}>
                      <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-1 focus:ring-primary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BOOST_DURATION_OPTIONS.map((s) => <SelectItem key={s} value={String(s)}>{s} s</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : <span className="px-2 text-muted-foreground">—</span>}
                </td>
                <td className="px-1 py-1">
                  {seg.mode === "sensor" ? (
                    <Select value={String(seg.estimatedDetections ?? 100)} onValueChange={(v) => patchSeg(seg.id, { estimatedDetections: Number(v) })}>
                      <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-1 focus:ring-primary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DETECTION_ESTIMATE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : <span className="px-2 text-muted-foreground">—</span>}
                </td>
                <td className="px-1 py-1 text-center">
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    disabled={value.segments.length <= 1}
                    onClick={() => patch({ segments: value.segments.filter((s) => s.id !== seg.id) })}
                    aria-label={l("Supprimer la période", "Remove period")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" size="sm" variant="outline" onClick={addPeriod}>
          <Plus className="h-4 w-4 mr-1" /> {l("Ajouter une période", "Add period")}
        </Button>
        {/* Thin read-only timeline preview */}
        <div className="flex h-5 flex-1 max-w-md ml-4 rounded overflow-hidden border" title={l("Aperçu du programme", "Program preview")}>
          {value.segments.map((seg) => (
            <div
              key={seg.id}
              style={{ width: `${(seg.hours / Math.max(1, value.nightHours)) * 100}%`, backgroundColor: segColor(seg) }}
              title={`${seg.hours}h ${seg.mode === "sensor" ? `${seg.min ?? 0}→${seg.max ?? 100}%` : `${seg.intensity ?? 100}%`}`}
            />
          ))}
          {value.morningTimeH > 0 && (
            <div
              style={{
                width: `${(value.morningTimeH / Math.max(1, value.nightHours)) * 100}%`,
                background: "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 4px, #fbbf24 4px, #fbbf24 8px)",
              }}
              title={`Morning Time ${value.morningTimeH}h @ ${value.morningIntensityPct}%`}
            />
          )}
        </div>
      </div>
    </div>
  );
});

export default LightingProgramTable;
