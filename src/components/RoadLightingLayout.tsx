import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LightingSetup, RoadProfile, PRODUCT_OPTIONS, SEGMENT_COLORS } from "@/types/solux";

interface Props {
  value: LightingSetup;
  onChange: (v: LightingSetup) => void;
  roadProfile: RoadProfile;
  lang?: "fr" | "en";
}

const Pole = () => (
  <div className="flex flex-col items-center">
    <div className="w-3 h-3 rounded-full bg-yellow-400" />
    <div className="w-0.5 h-8 bg-yellow-400" />
  </div>
);

const RoadLightingLayout = ({ value, onChange, roadProfile, lang = "en" }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const update = <K extends keyof LightingSetup>(key: K, val: LightingSetup[K]) => {
    onChange({ ...value, [key]: val });
  };

  const totalWidth = roadProfile.reduce((s, seg) => s + seg.width, 0);

  const showLeftPole = value.arrangement === "single_left" || value.arrangement === "both" || value.arrangement === "staggered";
  const showRightPole = value.arrangement === "single_right" || value.arrangement === "both";
  const showCentralPole = value.arrangement === "central";

  return (
    <div className="space-y-6">
      {/* Road profile preview with poles */}
      {roadProfile.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-4">{l("Aperçu du profil routier", "Road profile preview")}</p>
          <div className="flex items-end justify-center" style={{ minHeight: 100 }}>
            {/* Left pole */}
            {showLeftPole && (
              <div className="flex flex-col items-center justify-end mr-1 pb-0">
                <Pole />
              </div>
            )}
            {/* Segments */}
            {roadProfile.map((seg, i) => (
              <div key={seg.id} className="flex flex-col items-center relative">
                {/* Central pole */}
                {showCentralPole && i === Math.floor(roadProfile.length / 2) && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2">
                    <Pole />
                  </div>
                )}
                <div
                  className="flex items-center justify-center"
                  style={{
                    minWidth: 60,
                    width: Math.max(60, seg.width * 40),
                    height: 40,
                    backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.3)",
                  }}
                >
                  {seg.width}m
                </div>
              </div>
            ))}
            {/* Right pole */}
            {showRightPole && (
              <div className="flex flex-col items-center justify-end ml-1 pb-0">
                <Pole />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-3">
            {l("Largeur totale", "Total width")}: <strong>{totalWidth.toFixed(1)}m</strong>
          </p>
        </div>
      )}

      {/* Controls grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label>{l("Disposition", "Arrangement")}</Label>
          <Select value={value.arrangement} onValueChange={(v) => update("arrangement", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single_left">{l("Simple gauche", "Single Left")}</SelectItem>
              <SelectItem value="single_right">{l("Simple droite", "Single Right")}</SelectItem>
              <SelectItem value="both">{l("Les deux côtés", "Both Sides")}</SelectItem>
              <SelectItem value="staggered">{l("En quinconce", "Staggered")}</SelectItem>
              <SelectItem value="central">{l("Central", "Central")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{l("Luminaire", "Luminaire")}</Label>
          <Select value={value.luminaire} onValueChange={(v) => update("luminaire", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{l("Hauteur du mât", "Pole Height")}</Label>
            {/* Fixed value or an allowed range — the range is a design constraint
                for the Study Lab, nothing is optimised here. */}
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={(value.pole_height_mode ?? "fixed") === "fixed" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => update("pole_height_mode", "fixed")}
              >
                {l("Fixe", "Fixed")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={value.pole_height_mode === "range" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChange({
                  ...value,
                  pole_height_mode: "range",
                  pole_height_min: value.pole_height_min ?? Math.max(4, value.pole_height - 1),
                  pole_height_max: value.pole_height_max ?? Math.min(14, value.pole_height + 1),
                })}
              >
                {l("Plage", "Range")}
              </Button>
            </div>
          </div>
          {value.pole_height_mode === "range" ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={value.pole_height_min ?? 4}
                onChange={(e) => update("pole_height_min", Math.min(14, Math.max(4, parseFloat(e.target.value) || 4)))}
                step={0.5}
                min={4}
                max={14}
                className="w-24 text-center"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                value={value.pole_height_max ?? 14}
                onChange={(e) => update("pole_height_max", Math.min(14, Math.max(4, parseFloat(e.target.value) || 14)))}
                step={0.5}
                min={4}
                max={14}
                className="w-24 text-center"
              />
              <span className="text-sm text-muted-foreground">m</span>
              <span className="text-xs text-muted-foreground flex-1">
                {l("Le Study Lab choisira la meilleure hauteur dans la plage.", "Study Lab will pick the best height inside the range.")}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={value.pole_height}
                onChange={(e) => update("pole_height", Math.min(14, Math.max(4, parseFloat(e.target.value) || 4)))}
                step={0.5}
                min={4}
                max={14}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">m (4–14)</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_pole_height} onCheckedChange={(v) => update("optimize_pole_height", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{l("Longueur du bras", "Arm Length")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.arm_length}
              onChange={(e) => update("arm_length", Math.min(3, Math.max(0, parseFloat(e.target.value) || 0)))}
              step={0.1}
              min={0}
              max={3}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">m (0–3)</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_arm_length} onCheckedChange={(v) => update("optimize_arm_length", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{l("Inclinaison", "Tilt")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.tilt}
              onChange={(e) => update("tilt", Math.min(15, Math.max(-15, parseInt(e.target.value) || 0)))}
              step={1}
              min={-15}
              max={15}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">° (−15 à +15)</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{l("Espacement", "Spacing")}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={value.spacing}
              onChange={(e) => update("spacing", Math.min(50, Math.max(10, parseInt(e.target.value) || 10)))}
              step={1}
              min={10}
              max={50}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">m (10–50)</span>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_spacing} onCheckedChange={(v) => update("optimize_spacing", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{l("Mode puissance", "Power Mode")}</Label>
          <Select value={value.power_mode} onValueChange={(v) => update("power_mode", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="manual">{l("Manuel", "Manual")}</SelectItem>
            </SelectContent>
          </Select>
          {value.power_mode === "manual" && (
            <Input value={value.power_w} onChange={(e) => update("power_w", e.target.value)} placeholder="W" type="number" />
          )}
        </div>

        <div className="space-y-2">
          <Label>{l("Orientation", "Orientation")}</Label>
          <Select value={value.orientation} onValueChange={(v) => update("orientation", v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="perpendicular">{l("Perpendiculaire", "Perpendicular")}</SelectItem>
              <SelectItem value="parallel">{l("Parallèle", "Parallel")}</SelectItem>
              <SelectItem value="angled">{l("En angle", "Angled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default RoadLightingLayout;