import { memo, useState } from "react";
import { Input } from "@/components/ui/input";
import { uid } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { PRODUCT_FAMILIES, ProductAssignment, MapArea } from "@/types/solux";
import HeightField from "@/components/HeightField";
import FieldMessage from "@/components/FieldMessage";

// Sentinel for the "Study Lab defines the model" entry in the model select
// (Radix Select items can't have an empty-string value).
const MODEL_PENDING = "__study_lab__";

interface Props {
  // Product hierarchy: family (range) → model. `product` holds the MODEL.
  productFamily: string;
  onProductFamilyChange: (v: string) => void;
  productModelPending: boolean;
  onProductModelPendingChange: (v: boolean) => void;
  // When the family is owned by another section (road mode: the Road Lighting
  // Layout's "Luminaire" field), the family select is replaced by a read-only
  // reference so there is exactly ONE place to change it.
  familyReadOnly?: boolean;
  product: string;
  onProductChange: (v: string) => void;
  // Inline validation messages keyed by field name (see lib/validation).
  fieldErrors?: Record<string, string>;
  fieldWarnings?: Record<string, string>;
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
  productFamily, onProductFamilyChange,
  productModelPending, onProductModelPendingChange,
  familyReadOnly = false,
  product, onProductChange,
  fieldErrors = {}, fieldWarnings = {},
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
  // Set when a family change had to reset an incompatible model, so the user
  // is told WHY the model select emptied instead of guessing.
  const [modelResetNote, setModelResetNote] = useState<string | null>(null);

  const familyModels = PRODUCT_FAMILIES[productFamily] ?? [];

  const handleFamilyChange = (fam: string) => {
    onProductFamilyChange(fam);
    const models = PRODUCT_FAMILIES[fam] ?? [];
    if (product && !models.includes(product)) {
      onProductChange("");
      onProductModelPendingChange(false);
      setModelResetNote(l(
        `Le modèle précédent n'existe pas dans la famille ${fam} — choisissez un modèle ${fam}.`,
        `The previous model does not exist in the ${fam} family — pick a ${fam} model.`,
      ));
    } else {
      setModelResetNote(null);
    }
  };

  const handleModelChange = (v: string) => {
    setModelResetNote(null);
    if (v === MODEL_PENDING) {
      onProductChange("");
      onProductModelPendingChange(true);
    } else {
      onProductChange(v);
      onProductModelPendingChange(false);
    }
  };

  const addAssignment = () => {
    onProductAssignmentsChange?.([
      ...productAssignments,
      {
        id: uid(),
        zone: "",
        family: productFamily || Object.keys(PRODUCT_FAMILIES)[0],
        product: "",
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
                <Label className="text-xs">{l("Famille de produit", "Product family")}</Label>
                <Select
                  value={row.family || ""}
                  onValueChange={(v) => {
                    const models = PRODUCT_FAMILIES[v] ?? [];
                    onProductAssignmentsChange?.(productAssignments.map((a) =>
                      a.id === row.id
                        ? { ...a, family: v, product: models.includes(a.product) ? a.product : "" }
                        : a,
                    ));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={l("Sélectionner", "Select")} /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(PRODUCT_FAMILIES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{l("Modèle", "Product model")}</Label>
                <Select
                  value={row.product || MODEL_PENDING}
                  onValueChange={(v) => updateAssignment(row.id, "product", v === MODEL_PENDING ? "" : v)}
                  disabled={!row.family}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={row.family ? l("Sélectionner", "Select") : l("Choisir d'abord une famille", "Select a family first")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MODEL_PENDING}>{l("À définir par le Study Lab", "Study Lab to define the model")}</SelectItem>
                    {(PRODUCT_FAMILIES[row.family || ""] ?? []).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="destructive" onClick={() => removeAssignment(row.id)}>
                <Trash2 className="h-3 w-3 mr-1" /> {l("Retirer", "Remove")}
              </Button>
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
        <div className="space-y-1" id="field-productFamily">
          <Label className="text-xs">{l("Famille de produit *", "Product family *")}</Label>
          {familyReadOnly ? (
            <>
              <Input value={productFamily || "—"} readOnly className="bg-muted/40" />
              <p className="text-xs text-muted-foreground">
                {l("Définie par le champ « Luminaire » de la configuration routière ci-dessus.", "Set by the “Luminaire” field in the road lighting layout above.")}
              </p>
            </>
          ) : (
            <Select value={productFamily} onValueChange={handleFamilyChange}>
              <SelectTrigger aria-invalid={!!fieldErrors.productFamily}>
                <SelectValue placeholder={l("Sélectionner une famille", "Select a family")} />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PRODUCT_FAMILIES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <FieldMessage error={fieldErrors.productFamily} />
        </div>
        <div className="space-y-1" id="field-product">
          <Label className="text-xs">{l("Modèle de produit *", "Product model *")}</Label>
          <Select
            value={productModelPending ? MODEL_PENDING : (product || undefined)}
            onValueChange={handleModelChange}
            disabled={!productFamily}
          >
            <SelectTrigger aria-invalid={!!fieldErrors.product}>
              <SelectValue placeholder={productFamily ? l("Sélectionner un modèle", "Select a model") : l("Choisir d'abord une famille", "Select a family first")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MODEL_PENDING}>{l("À définir par le Study Lab", "Study Lab to define the model")}</SelectItem>
              {familyModels.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          {modelResetNote && <p className="text-xs text-muted-foreground">{modelResetNote}</p>}
          <FieldMessage error={fieldErrors.product} />
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
          <div id="field-luminaireHeight">
            <HeightField value={luminaireHeight} onChange={onLuminaireHeightChange} lang={lang} />
          </div>
          <FieldMessage error={fieldErrors.luminaireHeight} warning={fieldWarnings.luminaireHeight} />
        </div>
        <div className="space-y-1" id="field-spacing">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">{l("Espacement (m)", "Spacing (m)")}</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox className="h-3.5 w-3.5" checked={optimizeSpacing} onCheckedChange={(v) => onOptimizeSpacingChange(!!v)} />
              {l("Optimiser", "Optimize")}
            </label>
          </div>
          <Input value={spacing} onChange={(e) => onSpacingChange(e.target.value)} placeholder="25" type="number" inputMode="decimal" min={0} step="1" aria-invalid={!!fieldErrors.spacing} />
          <FieldMessage error={fieldErrors.spacing} warning={fieldWarnings.spacing} />
        </div>
        <div className="space-y-1" id="field-batteryWh">
          <Label className="text-xs">{l("Batterie", "Battery")}</Label>
          <div className="flex gap-2">
            <Select value={batteryChoice} onValueChange={(v) => onBatteryChoiceChange(v as "standard" | "custom")}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="custom">{l("Personnalisée", "Custom")}</SelectItem>
              </SelectContent>
            </Select>
            {batteryChoice === "custom" && (
              <div className="w-32">
                <Input
                  value={batteryWh}
                  onChange={(e) => onBatteryWhChange(e.target.value)}
                  placeholder={l("Capacité (Wh)", "Capacity (Wh)")}
                  aria-label={l("Capacité de batterie demandée (Wh)", "Requested battery capacity (Wh)")}
                  type="number" inputMode="decimal" min={0}
                  aria-invalid={!!fieldErrors.batteryWh}
                />
              </div>
            )}
          </div>
          {batteryChoice === "custom" && (
            <p className="text-xs text-muted-foreground">{l("Capacité demandée en Wh.", "Requested capacity in Wh.")}</p>
          )}
          <FieldMessage error={fieldErrors.batteryWh} warning={fieldWarnings.batteryWh} />
        </div>
        <div className="space-y-1" id="field-panelWp">
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
              <div className="w-32">
                <Input
                  value={panelWp}
                  onChange={(e) => onPanelWpChange(e.target.value)}
                  placeholder={l("Puissance (Wp)", "Power (Wp)")}
                  aria-label={l("Puissance de panneau demandée (Wp)", "Requested solar panel power (Wp)")}
                  type="number" inputMode="decimal" min={0}
                  aria-invalid={!!fieldErrors.panelWp}
                />
              </div>
            )}
          </div>
          {panelChoice === "custom" && (
            <p className="text-xs text-muted-foreground">{l("Puissance demandée en Wp.", "Requested power in Wp.")}</p>
          )}
          <FieldMessage error={fieldErrors.panelWp} warning={fieldWarnings.panelWp} />
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

// P4 — memoized so it can skip re-renders when its (now-stable) props are
// unchanged while the user types in unrelated fields.
export default memo(ProductSelectionSection);
