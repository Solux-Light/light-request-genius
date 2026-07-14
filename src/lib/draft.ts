import { SoluxForm, defaultForm, PdfZoneValue, migrateLegacyProduct, migrateLegacyLuminaireFamily } from "@/types/solux";
import { uid, deepClone } from "@/lib/utils";

// Local persistence for the intake form (C1/U1).
// - A rolling autosaved DRAFT so a refresh/crash never loses typed work.
// - A list of named SAVED PROJECTS the user can reopen later.
// Limits handled here:
// - blob: URLs die with the tab — stripped on save; the UI shows the
//   "replace file" state after a restore (bytes can't live in localStorage).
// - localStorage quota (~5 MB) — on overflow we retry without the base64
//   preview images, and report how the save degraded.

const DRAFT_KEY = "solux.draft.v1";
const PROJECTS_KEY = "solux.projects.v1";

export type SaveOutcome = "ok" | "stripped" | "failed";

export type DraftEnvelope = { savedAt: string; form: SoluxForm };
export type SavedProject = { id: string; name: string; savedAt: string; form: SoluxForm };

const sanitizeAnnotation = (ann: PdfZoneValue, stripPreview: boolean): PdfZoneValue => ({
  ...ann,
  pdfUrl: ann.pdfUrl && ann.pdfUrl.startsWith("blob:") ? "" : ann.pdfUrl,
  // Preview + extra view frames are base64 images — stripped from the rolling
  // autosave (quota), kept in named saves where possible.
  ...(stripPreview ? { previewImage: "", extraFrames: [] } : {}),
});

export const sanitizeFormForStorage = (form: SoluxForm, stripPreviews: boolean): SoluxForm => ({
  ...form,
  pdfPlan: sanitizeAnnotation(form.pdfPlan, stripPreviews),
  roadDocuments: form.roadDocuments.map((d) => ({
    ...d,
    annotation: sanitizeAnnotation(d.annotation, stripPreviews),
  })),
});

const asArray = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
const asObject = <T extends object>(v: unknown, fallback: T): T =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback;

// Merge a stored form over a FRESH copy of the defaults so drafts saved before a
// schema addition keep working, and — critically — nested default arrays/objects
// are never shared by reference between forms (C3). Array/object fields are also
// coerced back to sane shapes so a corrupted draft (e.g. areas:"x") can't crash
// rendering on restore (F7).
const reviveForm = (stored: Partial<SoluxForm>): SoluxForm => {
  const base = deepClone(defaultForm);
  const merged: SoluxForm = { ...base, ...stored };
  merged.areas = asArray(stored.areas, base.areas);
  merged.lampposts = asArray(stored.lampposts, base.lampposts);
  merged.mapLines = asArray(stored.mapLines, base.mapLines);
  merged.mapRecoZones = asArray(stored.mapRecoZones, base.mapRecoZones);
  merged.extraMapFrames = asArray(stored.extraMapFrames, base.extraMapFrames);
  merged.roadProfile = asArray(stored.roadProfile, base.roadProfile);
  merged.roadDocuments = asArray(stored.roadDocuments, base.roadDocuments);
  merged.productAssignments = asArray(stored.productAssignments, base.productAssignments);
  merged.lightingSegments = asArray(stored.lightingSegments, base.lightingSegments);
  merged.zoneLightingData = asObject(stored.zoneLightingData, base.zoneLightingData);
  merged.roadSegmentLighting = asObject(stored.roadSegmentLighting, base.roadSegmentLighting);
  merged.roadLighting = asObject(stored.roadLighting, base.roadLighting);
  const plan = asObject(stored.pdfPlan, base.pdfPlan);
  merged.pdfPlan = {
    ...base.pdfPlan,
    ...plan,
    zones: asArray(plan.zones, base.pdfPlan.zones),
    lampposts: asArray(plan.lampposts, base.pdfPlan.lampposts),
    recoZones: asArray(plan.recoZones, []),
    extraFrames: asArray(plan.extraFrames, []),
  };

  // Product hierarchy migration — drafts saved before the family→model split
  // stored a single id ("SSLXPRO"). Resolve it into family/model so old drafts
  // reopen cleanly in the two-level selectors.
  if (!merged.productFamily && merged.product) {
    const m = migrateLegacyProduct(merged.product);
    merged.productFamily = m.family;
    merged.product = m.product;
    merged.productModelPending = !!m.family && !m.product;
  }
  Object.keys(merged.zoneLightingData).forEach((k) => {
    const zd = merged.zoneLightingData[k];
    if (zd && !zd.productFamily && zd.product) {
      const m = migrateLegacyProduct(zd.product);
      merged.zoneLightingData[k] = {
        ...zd,
        productFamily: m.family,
        product: m.product,
        productModelPending: !!m.family && !m.product,
      };
    }
  });
  merged.productAssignments = merged.productAssignments.map((a) => {
    if (a.family || !a.product) return a;
    const m = migrateLegacyProduct(a.product);
    return { ...a, family: m.family, product: m.product };
  });
  merged.roadLighting = {
    ...merged.roadLighting,
    luminaire: migrateLegacyLuminaireFamily(merged.roadLighting.luminaire),
  };
  return merged;
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const saveDraft = (form: SoluxForm): SaveOutcome => {
  const savedAt = new Date().toISOString();
  // P1 — the rolling autosave ALWAYS strips the base64 canvas previews: they can
  // be multi-MB, re-stringifying them on every settled edit stalls the main
  // thread and repeatedly hits the quota, and a restore already tells the user to
  // re-add files. Named "Save project" keeps previews where it can.
  try {
    writeJson(DRAFT_KEY, { savedAt, form: sanitizeFormForStorage(form, true) });
    return "ok";
  } catch {
    return "failed";
  }
};

export const loadDraft = (): DraftEnvelope | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope;
    if (!parsed?.form || typeof parsed.form !== "object") return null;
    return { savedAt: parsed.savedAt ?? "", form: reviveForm(parsed.form) };
  } catch {
    return null;
  }
};

export const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
};

// --- Named projects (save / reopen) ---

export const listProjects = (): SavedProject[] => {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.form) : [];
  } catch {
    return [];
  }
};

export const saveProject = (name: string, form: SoluxForm): SaveOutcome => {
  const entry = (stripPreviews: boolean): SavedProject => ({
    id: uid(),
    name: name.trim() || "Untitled project",
    savedAt: new Date().toISOString(),
    form: sanitizeFormForStorage(form, stripPreviews),
  });
  // Replace an existing project with the same name (a re-save, not a sibling).
  const others = listProjects().filter((p) => p.name !== (name.trim() || "Untitled project"));
  try {
    writeJson(PROJECTS_KEY, [entry(false), ...others]);
    return "ok";
  } catch {
    try {
      writeJson(PROJECTS_KEY, [entry(true), ...others]);
      return "stripped";
    } catch {
      return "failed";
    }
  }
};

export const loadProject = (id: string): SoluxForm | null => {
  const p = listProjects().find((x) => x.id === id);
  return p ? reviveForm(p.form) : null;
};

export const deleteProject = (id: string) => {
  try {
    writeJson(PROJECTS_KEY, listProjects().filter((p) => p.id !== id));
  } catch { /* storage unavailable */ }
};
