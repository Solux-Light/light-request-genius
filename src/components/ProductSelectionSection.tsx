import { Input } from "@/components/ui/input";
import { uid } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { PRODUCT_OPTIONS, ProductAssignment, MapArea } from "@/types/solux";
import HeightField from "@/components/HeightField";

interface Props {
  product: string;
  onProductChange: (v: string) => void;
  luminaireHeight: string;
  onLuminaireHeightChange: (v: string) => void;
  spacing: string;
  onSpacingChange: (v: string) => void;
  optimizeHeight: boolean;
  onOptimizeHeightChange: (v: boolean) => void;
  optimizeSpacing: boolean;
  onOptimizeSpacingChange: (v: boolean) => void;
  batteryChoice: "standard" | "custom";
  onBatteryChoiceChange: (v: "standard" | "custom") => void;
  batteryWh: string;
  onBatteryWhChange: (v: string) => void;
  panelChoice: "standard" | "custom";
  onPanelChoiceChange: (v: "standard" | "custom") => void;
  panelWp: string;
  onPanelWpChange: (v: string) => void;
  alternativeAccepted: boolean;
  onAlternativeAcceptedChange: (v: boolean) => void;
  alternativeDetails: string;
  onAlternativeDetailsChange: (v: string) => void;
  multiProduct?: boolean;
  onMultiProductChange?: (v: boolean) => void;
  productAssignments?: ProductAssignment[];
  onProductAssignmentsChange?: (v: ProductAssignment[]) => void;
  mapAreas?: MapArea[];
  hideMultiToggle?: boolean;
  assignmentsOnly?: boolean;
  lang?: "fr" | "en";
}

const ProductSelectionSection = ({
  product, onProductChange,
  luminaireHeight, onLuminaireHeightChange,
  spacing, onSpacingChange,
  optimizeHeight, onOptimizeHeightChange,
  optimizeSpacing, onOptimizeSpacingChange,
  batteryChoice, onBatteryChoiceChange,
  batteryWh, onBatteryWhChange,
  panelChoice, onPanelChoiceChange,
  panelWp, onPanelWpChange,
  alternativeAccepted, onAlternativeAcceptedChange,
  alternativeDetails, onAlternativeDetailsChange,
  multiProduct, onMultiProductChange,
  productAssignments = [], onProductAssignmentsChange,
  mapAreas = [],
  hideMultiToggle = false,
  assignmentsOnly = false,
  lang = "en",
}: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const addAssignment = () => {
    onProductAssignmentsChange?.([
      ...productAssignments,
      {
        id: uid(),
        zone: "",
        product: product || PRODUCT_OPTIONS[0],
        avgLux: "",
        uniformity: "",
        minLux: "",
        cct: "4000",
        scenarioText: "",
        presenceDetection: false,
        detectionCount: "",
        detectionDuration: "",
        luminaireHeight: "",
        spacing: "",
      },
    ]);
  };

  const updateAssignment = (id: string, field: string, value: any) => {
    onProductAssignmentsChange?.(
      productAssignments.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const removeAssignment = (id: string) => {
    onProductAssignmentsChange?.(productAssignments.filter((a) => a.id !== id));
  };

  if (assignmentsOnly) {
    return (
      <div className="space-y-4">
        {productAssignments.map((row) => (
          <div key={row.id} className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{l("Zone", "Zone")}</Label>
                {mapAreas.length > 0 ? (
                  <Select value={row.zone} onValueChange={(v) => updateAssignment(row.id, "zone", v)}>
                    <SelectTrigger><SelectValue placeholder={l("Sélectionner", "Select zone")} /></SelectTrigger>
                    <SelectContent>
                      {mapAreas.map((a) => (
                        <SelectItem key={a.id} value={a.name || a.id}>{a.name || a.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={row.zone} onChange={(e) => updateAssignment(row.id, "zone", e.target.value)} placeholder="Zone name" />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{l("Produit", "Product")}</Label>
                <Select value={row.product} onValueChange={(v) => updateAssignment(row.id, "product", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="button" size="sm" variant="destructive" onClick={() => removeAssignment(row.id)}>
                  <Trash2 className="h-3 w-3 mr-1" /> {l("Retirer", "Remove")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{l("Lux moyen", "Average Lux")}</Label>
                <Input value={row.avgLux || ""} onChange={(e) => updateAssignment(row.id, "avgLux", e.target.value)} placeholder="15" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{l("Uniformité min", "Min Uniformity")}</Label>
                <Input value={row.uniformity || ""} onChange={(e) => updateAssignment(row.id, "uniformity", e.target.value)} placeholder="0.6" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{l("Lux min", "Min Lux")}</Label>
                <Input value={row.minLux || ""} onChange={(e) => updateAssignment(row.id, "minLux", e.target.value)} placeholder="4" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{l("CCT (K)", "CCT in Kelvin")}</Label>
                <Input value={row.cct || ""} onChange={(e) => updateAssignment(row.id, "cct", e.target.value)} placeholder="4000" />
              </div>
              <div className="md:col-span-2 space-y-1">
                {/* Lightweight per-zone note — the structured Lighting Program
                    (with Morning Time) lives in the shared LightingProgramTable. */}
                <Label className="text-xs">{l("Notes de scénario", "Scenario notes")}</Label>
                <Textarea value={row.scenarioText || ""} onChange={(e) => updateAssignment(row.id, "scenarioText", e.target.value)} rows={2} placeholder={l("Note libre…", "Free note…")} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={row.presenceDetection || false} onCheckedChange={(v) => updateAssignment(row.id, "presenceDetection", v)} />
              <Label className="text-xs">{l("Détection de présence", "Presence Detection")}</Label>
            </div>
            {row.presenceDetection && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{l("Nombre de détections", "Detection Count")}</Label>
                  <Input value={row.detectionCount || ""} onChange={(e) => updateAssignment(row.id, "detectionCount", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{l("Durée", "Duration")}</Label>
                  <Input value={row.detectionDuration || ""} onChange={(e) => updateAssignment(row.id, "detectionDuration", e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{l("Hauteur luminaire", "Luminaire Height")}</Label>
                <Input value={row.luminaireHeight || ""} onChange={(e) => updateAssignment(row.id, "luminaireHeight", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{l("Espacement", "Spacing")}</Label>
                <Input value={row.spacing || ""} onChange={(e) => updateAssignment(row.id, "spacing", e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addAssignment}>
          <Plus className="h-4 w-4 mr-1" /> {l("Ajouter Zone/Produit", "Add Zone/Product Assignment")}
        </Button>
      </div>
    );
  }

  // Compact engineering grid (U5/I1) — same density and label language as the
  // profile configuration, instead of the old tall stacked column.
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{l("Produit *", "Product *")}</Label>
          <Select value={product} onValueChange={onProductChange}>
            <SelectTrigger><SelectValue placeholder={l("Sélectionner un produit", "Select product")} /></SelectTrigger>
            <SelectContent>
              {PRODUCT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">{l("Hauteur luminaire (m)", "Luminaire Height (m)")}</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox className="h-3.5 w-3.5" checked={optimizeHeight} onCheckedChange={(v) => onOptimizeHeightChange(!!v)} />
              {l("Optimiser", "Optimize")}
            </label>
          </div>
          {/* Fixed height ("8") or allowed range ("5-8") — transmitted as-is to
              the Study Lab, which picks the best height inside a range. */}
          <HeightField value={luminaireHeight} onChange={onLuminaireHeightChange} lang={lang} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">{l("Espacement (m)", "Spacing (m)")}</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox className="h-3.5 w-3.5" checked={optimizeSpacing} onCheckedChange={(v) => onOptimizeSpacingChange(!!v)} />
              {l("Optimiser", "Optimize")}
            </label>
          </div>
          <Input value={spacing} onChange={(e) => onSpacingChange(e.target.value)} placeholder="25" type="number" inputMode="decimal" min={0} step="1" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{l("Batterie", "Battery")}</Label>
          <div className="flex gap-2">
            <Select value={batteryChoice} onValueChange={(v) => onBatteryChoiceChange(v as "standard" | "custom")}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="custom">{l("Personnalisé", "Custom")}</SelectItem>
              </SelectContent>
            </Select>
            {batteryChoice === "custom" && (
              <Input className="w-24" value={batteryWh} onChange={(e) => onBatteryWhChange(e.target.value)} placeholder="Wh" type="number" inputMode="decimal" min={0} />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{l("Panneau solaire", "Solar Panel")}</Label>
          <div className="flex gap-2">
            <Select value={panelChoice} onValueChange={(v) => onPanelChoiceChange(v as "standard" | "custom")}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="custom">{l("Personnalisé", "Custom")}</SelectItem>
              </SelectContent>
            </Select>
            {panelChoice === "custom" && (
              <Input className="w-24" value={panelWp} onChange={(e) => onPanelWpChange(e.target.value)} placeholder="Wp" type="number" inputMode="decimal" min={0} />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{l("Solutions alternatives", "Alternative Solutions")}</Label>
          <div className="flex h-10 items-center gap-3 rounded-md border px-3">
            <Switch checked={alternativeAccepted} onCheckedChange={onAlternativeAcceptedChange} />
            <span className="text-sm text-muted-foreground">{l("Alternatives acceptées", "Accept alternatives")}</span>
          </div>
        </div>
      </div>
      {alternativeAccepted && (
        <Textarea
          value={alternativeDetails}
          onChange={(e) => onAlternativeDetailsChange(e.target.value)}
          placeholder={l("Détails et suggestions d'alternative...", "Alternative details and suggestions")}
          rows={2}
        />
      )}
    </div>
  );
};

export default ProductSelectionSection;
