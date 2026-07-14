import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CctSelect from "@/components/CctSelect";
import { RoadSegment, SEGMENT_COLORS, segmentTypeLabel } from "@/types/solux";

type SegLevels = { avgLux: string; uniformity: string; minLux: string; cct: string };

interface Props {
  roadProfile: RoadSegment[];
  values: Record<string, SegLevels>;
  onChange: (next: Record<string, SegLevels>) => void;
  lang: "fr" | "en";
}

// Q7 — extracted from SoluxIntake. Per-segment lighting levels keyed by segment
// id (F2), so same-type segments carry independent levels.
const RoadPerSegmentLevels = memo(function RoadPerSegmentLevels({ roadProfile, values, onChange, lang }: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  if (roadProfile.length === 0) return null;

  return (
    <section>
      <h3 className="text-lg font-semibold mb-4">{l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}</h3>
      {roadProfile.map((seg, i) => {
        const segLighting = values[seg.id] || { avgLux: "", uniformity: "", minLux: "", cct: "4000K" };
        const setSeg = (patch: Partial<SegLevels>) => onChange({ ...values, [seg.id]: { ...segLighting, ...patch } });
        return (
          <Card key={seg.id} className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[seg.type] }} />
                <span className="font-medium">{segmentTypeLabel(seg.type, lang)}</span>
                <span className="text-xs text-muted-foreground">#{i + 1} · {seg.width}m</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{l("Lux moyen", "Average Lux")}</Label>
                  <Input value={segLighting.avgLux} onChange={(e) => setSeg({ avgLux: e.target.value })} placeholder="15" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{l("Uniformité", "Uniformity")}</Label>
                  <Input value={segLighting.uniformity} onChange={(e) => setSeg({ uniformity: e.target.value })} placeholder="0.6" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{l("Lux min", "Min Lux")}</Label>
                  <Input value={segLighting.minLux} onChange={(e) => setSeg({ minLux: e.target.value })} placeholder="4" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CCT</Label>
                  <CctSelect value={segLighting.cct} onChange={(v) => setSeg({ cct: v })} lang={lang} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
});

export default RoadPerSegmentLevels;
