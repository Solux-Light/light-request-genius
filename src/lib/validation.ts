import { SoluxForm, isHeightRange } from "@/types/solux";

// Central form validation (V1).
// Three severities, used differently by the UI:
// - `required` — a mandatory field is missing. Blocks submit; shown inline
//   only after a submit attempt (so a fresh form isn't covered in red).
// - `invalid`  — a typed value is physically impossible (negative lux,
//   uniformity above 1, minimum above average…). Blocks submit and is shown
//   inline immediately.
// - `warning`  — unusual but potentially intentional (very high lux, very
//   large spacing…). Never blocks; shown inline in amber so a knowledgeable
//   user can simply carry on.

export type Severity = "required" | "invalid" | "warning";

export type Finding = {
  field: string; // stable field key — also the DOM anchor id (`field-${field}`)
  label: string; // human field label for the summary list
  message: string;
  severity: Severity;
};

export type ValidationResult = {
  findings: Finding[];
  blocking: Finding[]; // required + invalid
  byField: Record<string, Finding[]>;
};

const toNum = (v: string): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

type L = (fr: string, en: string) => string;

// Shared checks for one avg/min/uniformity level trio. `prefix` namespaces the
// field keys, `where` names the location in messages ("Zone 2", "Sidewalk #1").
export const validateLevelTrio = (
  vals: { avgLux: string; minLux: string; uniformity: string },
  prefix: string,
  where: string,
  l: L,
): Finding[] => {
  const out: Finding[] = [];
  const avg = toNum(vals.avgLux);
  const min = toNum(vals.minLux);
  const uni = toNum(vals.uniformity);
  const at = where ? ` (${where})` : "";

  if (vals.avgLux.trim() !== "" && avg === null) {
    out.push({ field: `${prefix}avgLux`, label: l("Lux moyen", "Average illuminance") + at, severity: "invalid", message: l("Valeur numérique invalide.", "Not a valid number.") });
  } else if (avg !== null && avg <= 0) {
    out.push({ field: `${prefix}avgLux`, label: l("Lux moyen", "Average illuminance") + at, severity: "invalid", message: l("L'éclairement moyen doit être supérieur à zéro.", "Average illuminance must be greater than zero.") });
  } else if (avg !== null && avg > 150) {
    out.push({ field: `${prefix}avgLux`, label: l("Lux moyen", "Average illuminance") + at, severity: "warning", message: l("Valeur inhabituellement élevée pour de l'éclairage extérieur — vérifiez avant de continuer.", "Unusually high for outdoor lighting — please verify before continuing.") });
  }

  if (vals.minLux.trim() !== "" && min === null) {
    out.push({ field: `${prefix}minLux`, label: l("Lux minimum", "Minimum illuminance") + at, severity: "invalid", message: l("Valeur numérique invalide.", "Not a valid number.") });
  } else if (min !== null && min < 0) {
    out.push({ field: `${prefix}minLux`, label: l("Lux minimum", "Minimum illuminance") + at, severity: "invalid", message: l("Le lux minimum ne peut pas être négatif.", "Minimum illuminance cannot be negative.") });
  } else if (min !== null && avg !== null && avg > 0 && min > avg) {
    out.push({ field: `${prefix}minLux`, label: l("Lux minimum", "Minimum illuminance") + at, severity: "invalid", message: l("Le lux minimum ne peut pas dépasser le lux moyen.", "Minimum illuminance cannot exceed average illuminance.") });
  } else if (min !== null && avg !== null && avg > 0 && min >= avg * 0.9) {
    out.push({ field: `${prefix}minLux`, label: l("Lux minimum", "Minimum illuminance") + at, severity: "warning", message: l("Lux minimum très proche du lux moyen — cela impose une uniformité quasi parfaite.", "Minimum very close to the average — this demands near-perfect uniformity.") });
  }

  if (vals.uniformity.trim() !== "" && uni === null) {
    out.push({ field: `${prefix}uniformity`, label: l("Uniformité", "Uniformity") + at, severity: "invalid", message: l("Valeur numérique invalide.", "Not a valid number.") });
  } else if (uni !== null && (uni <= 0 || uni > 1)) {
    out.push({ field: `${prefix}uniformity`, label: l("Uniformité", "Uniformity") + at, severity: "invalid", message: l("L'uniformité doit être comprise entre 0 et 1.", "Uniformity must be between 0 and 1.") });
  }

  return out;
};

// Height string: "8" or "5-8". Empty is fine (optional / Study Lab optimises).
const validateHeightString = (v: string, field: string, label: string, l: L): Finding[] => {
  const out: Finding[] = [];
  if (!v || !v.trim()) return out;
  if (isHeightRange(v)) {
    const [a, b] = v.split("-").map((s) => Number(s.trim().replace(",", ".")));
    if (a <= 0 || b <= 0) out.push({ field, label, severity: "invalid", message: l("La hauteur doit être supérieure à zéro.", "Height must be greater than zero.") });
    else if (a >= b) out.push({ field, label, severity: "invalid", message: l("Le minimum de la plage doit être inférieur au maximum.", "The range minimum must be below the maximum.") });
    else if (b > 20) out.push({ field, label, severity: "warning", message: l("Hauteur inhabituelle (> 20 m) — vérifiez.", "Unusual height (> 20 m) — please verify.") });
    return out;
  }
  const n = toNum(v);
  if (n === null) out.push({ field, label, severity: "invalid", message: l("Hauteur invalide — nombre (« 8 ») ou plage (« 5-8 »).", "Invalid height — use a number (“8”) or a range (“5-8”).") });
  else if (n <= 0) out.push({ field, label, severity: "invalid", message: l("La hauteur doit être supérieure à zéro.", "Height must be greater than zero.") });
  else if (n > 20 || n < 2) out.push({ field, label, severity: "warning", message: l("Hauteur inhabituelle pour un mât d'éclairage — vérifiez.", "Unusual height for a lighting pole — please verify.") });
  return out;
};

export const validateForm = (form: SoluxForm, l: L): ValidationResult => {
  const findings: Finding[] = [];
  const req = (cond: boolean, field: string, label: string) => {
    if (cond) findings.push({ field, label, severity: "required", message: l("Champ obligatoire.", "This field is required.") });
  };

  const isProfilesMode = form.projectType === "road" && form.roadInputMode === "pdf_profile";

  // --- Required fields (mode-aware, mirrors the previous submit gate) ---
  req(!form.projectName.trim(), "projectName", l("Nom du projet", "Project Name"));
  req(!form.clientName.trim(), "clientName", l("Nom du client", "Client Name"));
  req(!form.locality.trim(), "locality", l("Localité", "City/Location"));
  req(!form.country.trim(), "country", l("Pays", "Country"));

  if (form.projectType === "zone") {
    req(!form.address.trim(), "address", l("Adresse du projet", "Project Address"));
    const avg = toNum(form.avgLux);
    req(avg === null, "avgLux", l("Éclairement moyen", "Average Illuminance"));
    req(!form.cct, "cct", l("Température de couleur", "Color Temperature"));
    req(!form.productFamily, "productFamily", l("Famille de produit", "Product Family"));
    req(!!form.productFamily && !form.product && !form.productModelPending, "product", l("Modèle de produit", "Product Model"));
  }

  if (form.projectType === "road" && form.roadInputMode === "builder") {
    // The family is picked in the Road Lighting Layout ("Luminaire"); the model
    // is picked in Product Selection. Model may be delegated to the Study Lab.
    req(!!form.roadLighting.luminaire && !form.product && !form.productModelPending, "product", l("Modèle de produit", "Product Model"));
  }

  if (isProfilesMode) {
    req(form.roadDocuments.length === 0, "roadDocuments", l("Document du client (profil)", "Customer profile document"));
    form.roadDocuments.forEach((d, i) => {
      const name = d.profileName || `${l("Profil", "Profile")} ${i + 1}`;
      req(!d.config.recommendProduct && !d.config.family && !d.config.product, `profile-${d.id}-product`, `${l("Produit", "Product")} — ${name}`);
    });
  }

  // --- Value checks (hard + soft) ---
  if (form.projectType === "zone") {
    findings.push(...validateLevelTrio(
      { avgLux: form.avgLux, minLux: form.minLux, uniformity: form.uniformity },
      "", "", l,
    ));
    findings.push(...validateHeightString(form.luminaireHeight, "luminaireHeight", l("Hauteur luminaire", "Luminaire Height"), l));

    const spacing = toNum(form.spacing);
    if (form.spacing.trim() !== "" && spacing === null) {
      findings.push({ field: "spacing", label: l("Espacement", "Spacing"), severity: "invalid", message: l("Valeur numérique invalide.", "Not a valid number.") });
    } else if (spacing !== null && spacing <= 0) {
      findings.push({ field: "spacing", label: l("Espacement", "Spacing"), severity: "invalid", message: l("L'espacement doit être supérieur à zéro.", "Pole spacing must be greater than zero.") });
    } else if (spacing !== null && spacing > 60) {
      findings.push({ field: "spacing", label: l("Espacement", "Spacing"), severity: "warning", message: l("Espacement inhabituellement grand (> 60 m) — vérifiez.", "Unusually large spacing (> 60 m) — please verify.") });
    }
  }

  if (form.batteryChoice === "custom") {
    const wh = toNum(form.batteryWh);
    if (form.batteryWh.trim() !== "" && (wh === null || wh <= 0)) {
      findings.push({ field: "batteryWh", label: l("Batterie personnalisée", "Custom battery"), severity: "invalid", message: l("La capacité (Wh) doit être un nombre positif.", "Capacity (Wh) must be a positive number.") });
    } else if (form.batteryWh.trim() === "") {
      findings.push({ field: "batteryWh", label: l("Batterie personnalisée", "Custom battery"), severity: "warning", message: l("Précisez la capacité demandée, sinon le Study Lab choisira la batterie standard.", "Specify the requested capacity, otherwise the Study Lab will use the standard battery.") });
    }
  }
  if (form.panelChoice === "custom") {
    const wp = toNum(form.panelWp);
    if (form.panelWp.trim() !== "" && (wp === null || wp <= 0)) {
      findings.push({ field: "panelWp", label: l("Panneau personnalisé", "Custom solar panel"), severity: "invalid", message: l("La puissance (Wp) doit être un nombre positif.", "Power (Wp) must be a positive number.") });
    } else if (form.panelWp.trim() === "") {
      findings.push({ field: "panelWp", label: l("Panneau personnalisé", "Custom solar panel"), severity: "warning", message: l("Précisez la puissance demandée, sinon le Study Lab choisira le panneau standard.", "Specify the requested power, otherwise the Study Lab will use the standard panel.") });
    }
  }

  // Road builder — validate each segment's level trio.
  if (form.projectType === "road" && form.roadInputMode === "builder") {
    form.roadProfile.forEach((seg, i) => {
      const lvl = form.roadSegmentLighting[seg.id];
      if (!lvl) return;
      findings.push(...validateLevelTrio(lvl, `roadseg-${seg.id}-`, `#${i + 1}`, l));
    });
  }

  // Profile mode — validate each profile segment's level trio.
  if (isProfilesMode) {
    form.roadDocuments.forEach((d, di) => {
      const name = d.profileName || `${l("Profil", "Profile")} ${di + 1}`;
      d.segments.forEach((seg, si) => {
        findings.push(...validateLevelTrio(
          { avgLux: seg.avgLux, minLux: seg.minLux, uniformity: seg.uniformity },
          `profile-${d.id}-seg-${seg.id}-`, `${name} · ${si + 1}`, l,
        ));
      });
    });
  }

  // Deadline can't be in the past (compare calendar dates, not times).
  if (form.deadlineDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dl = new Date(`${form.deadlineDate}T00:00:00`);
    if (!isNaN(dl.getTime()) && dl < today) {
      findings.push({ field: "deadlineDate", label: l("Date souhaitée", "Requested date"), severity: "invalid", message: l("La date souhaitée ne peut pas être dans le passé.", "The requested date cannot be in the past.") });
    }
  }

  const blocking = findings.filter((f) => f.severity !== "warning");
  const byField: Record<string, Finding[]> = {};
  findings.forEach((f) => { (byField[f.field] ??= []).push(f); });
  return { findings, blocking, byField };
};

// Zone-mode geometry completeness — not blocking, but the export/submit flows
// warn before producing a document with no drawn geometry.
export const hasZoneGeometry = (form: SoluxForm): boolean =>
  form.areas.length > 0 || form.pdfPlan.zones.length > 0 || (form.lampposts?.length ?? 0) > 0;
