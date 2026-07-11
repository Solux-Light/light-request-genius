import { memo } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import ProductSelectionSection from "@/components/ProductSelectionSection";
import { SoluxForm } from "@/types/solux";
import { uid } from "@/lib/utils";

interface Props {
  form: SoluxForm;
  onChange: <K extends keyof SoluxForm>(key: K, val: SoluxForm[K]) => void;
  lang: "fr" | "en";
}

// Q7 — extracted from SoluxIntake. The zone-only "multiple products per zone"
// toggle and its per-zone assignment editor.
const MultiProductSection = memo(function MultiProductSection({ form, onChange, lang }: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  return (
    <section>
      <div className="bg-[hsl(var(--callout))] rounded-lg p-4 md:p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <Label className="text-lg md:text-xl font-semibold">{l("Produits multiples", "Multiple Products")}</Label>
            <p className="text-sm text-muted-foreground">
              {l("Attribuez différents produits à différentes zones.", "Assign different products to different zones.")}
            </p>
          </div>
          <Switch
            className="scale-110 md:scale-125"
            checked={form.multiProduct}
            onCheckedChange={(v) => {
              onChange("multiProduct", v);
              if (v && form.productAssignments.length === 0) {
                onChange("productAssignments", [{ id: uid(), zone: "", family: form.productFamily || "", product: form.product || "" }]);
              }
            }}
          />
        </div>
        {form.multiProduct && (
          <div className="mt-4">
            <ProductSelectionSection
              productFamily={form.productFamily}
              onProductFamilyChange={(v) => onChange("productFamily", v)}
              productModelPending={form.productModelPending}
              onProductModelPendingChange={(v) => onChange("productModelPending", v)}
              product={form.product}
              onProductChange={(v) => onChange("product", v)}
              luminaireHeight={form.luminaireHeight}
              onLuminaireHeightChange={(v) => onChange("luminaireHeight", v)}
              spacing={form.spacing}
              onSpacingChange={(v) => onChange("spacing", v)}
              optimizeHeight={form.optimizeHeight}
              onOptimizeHeightChange={(v) => onChange("optimizeHeight", v)}
              optimizeSpacing={form.optimizeSpacing}
              onOptimizeSpacingChange={(v) => onChange("optimizeSpacing", v)}
              batteryChoice={form.batteryChoice}
              onBatteryChoiceChange={(v) => onChange("batteryChoice", v)}
              batteryWh={form.batteryWh}
              onBatteryWhChange={(v) => onChange("batteryWh", v)}
              panelChoice={form.panelChoice}
              onPanelChoiceChange={(v) => onChange("panelChoice", v)}
              panelWp={form.panelWp}
              onPanelWpChange={(v) => onChange("panelWp", v)}
              alternativeAccepted={form.alternativeAccepted}
              onAlternativeAcceptedChange={(v) => onChange("alternativeAccepted", v)}
              alternativeDetails={form.alternativeDetails}
              onAlternativeDetailsChange={(v) => onChange("alternativeDetails", v)}
              productAssignments={form.productAssignments}
              onProductAssignmentsChange={(v) => onChange("productAssignments", v)}
              mapAreas={form.areas}
              assignmentsOnly
              hideMultiToggle
              lang={lang}
            />
          </div>
        )}
      </div>
    </section>
  );
});

export default MultiProductSection;
