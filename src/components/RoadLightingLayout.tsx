import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LightingSetup, RoadProfile, PRODUCT_OPTIONS, SEGMENT_COLORS } from "@/types/solux";

interface Props {
  value: LightingSetup;
  onChange: (v: LightingSetup) => void;
  roadProfile: RoadProfile;
  lang?: "fr" | "en";
}

const RoadLightingLayout = ({ value, onChange, roadProfile, lang = "en" }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const update = <K extends keyof LightingSetup>(key: K, val: LightingSetup[K]) => {
    onChange({ ...value, [key]: val });
  };

  const totalWidth = roadProfile.reduce((s, seg) => s + seg.width, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Arrangement */}
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

        {/* Luminaire */}
        <div className="space-y-2">
          <Label>{l("Luminaire", "Luminaire")}</Label>
          <Select value={value.luminaire} onValueChange={(v) => update("luminaire", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Pole Height */}
        <div className="space-y-2">
          <Label>{l("Hauteur du mât", "Pole Height")} ({value.pole_height}m)</Label>
          <Slider value={[value.pole_height]} onValueChange={(v) => update("pole_height", v[0])} min={4} max={14} step={0.5} />
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_pole_height} onCheckedChange={(v) => update("optimize_pole_height", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        {/* Arm Length */}
        <div className="space-y-2">
          <Label>{l("Longueur du bras", "Arm Length")} ({value.arm_length}m)</Label>
          <Slider value={[value.arm_length]} onValueChange={(v) => update("arm_length", v[0])} min={0} max={3} step={0.1} />
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_arm_length} onCheckedChange={(v) => update("optimize_arm_length", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        {/* Tilt */}
        <div className="space-y-2">
          <Label>{l("Inclinaison", "Tilt")} ({value.tilt}°)</Label>
          <Slider value={[value.tilt]} onValueChange={(v) => update("tilt", v[0])} min={-15} max={15} step={1} />
        </div>

        {/* Spacing */}
        <div className="space-y-2">
          <Label>{l("Espacement", "Spacing")} ({value.spacing}m)</Label>
          <Slider value={[value.spacing]} onValueChange={(v) => update("spacing", v[0])} min={10} max={50} step={1} />
          <div className="flex items-center gap-2">
            <Checkbox checked={value.optimize_spacing} onCheckedChange={(v) => update("optimize_spacing", !!v)} />
            <Label className="text-xs">{l("Optimiser", "Optimize")}</Label>
          </div>
        </div>

        {/* Power Mode */}
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

        {/* Orientation */}
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

      {/* Visual preview */}
      {roadProfile.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="flex items-end justify-center relative" style={{ height: 120 }}>
            {/* Road segments */}
            {roadProfile.map((seg) => (
              <div
                key={seg.id}
                className="flex items-end justify-center"
                style={{
                  minWidth: 60,
                  width: seg.width * 40,
                  height: 40,
                  backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                  borderRadius: "4px 4px 0 0",
                  fontSize: 9,
                  color: "#fff",
                  fontWeight: 600,
                  padding: 2,
                }}
              >
                {seg.width}m
              </div>
            ))}
            {/* Pole indicators */}
            {(value.arrangement === "single_left" || value.arrangement === "both" || value.arrangement === "staggered") && (
              <div className="absolute left-0 bottom-10 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-0.5 h-8 bg-yellow-400" />
              </div>
            )}
            {(value.arrangement === "single_right" || value.arrangement === "both") && (
              <div className="absolute right-0 bottom-10 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-0.5 h-8 bg-yellow-400" />
              </div>
            )}
            {value.arrangement === "central" && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-10 flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-0.5 h-8 bg-yellow-400" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground text-center mt-2">
            {l("Largeur totale", "Total width")}: {totalWidth.toFixed(1)}m
          </p>
        </div>
      )}
    </div>
  );
};

export default RoadLightingLayout;
