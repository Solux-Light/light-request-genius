import { SoluxForm, defaultForm, PdfZoneValue } from "@/types/solux";
import { uid } from "@/lib/utils";

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
  ...(stripPreview ? { previewImage: "" } : {}),
});

export const sanitizeFormForStorage = (form: SoluxForm, stripPreviews: boolean): SoluxForm => ({
  ...form,
  pdfPlan: sanitizeAnnotation(form.pdfPlan, stripPreviews),
  roadDocuments: form.roadDocuments.map((d) => ({
    ...d,
    annotation: sanitizeAnnotation(d.annotation, stripPreviews),
  })),
});

// Merge a stored form over today's defaults so drafts saved before a schema
// addition keep working (new fields fall back to their defaults).
const reviveForm = (stored: Partial<SoluxForm>): SoluxForm => ({ ...defaultForm, ...stored });

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const saveDraft = (form: SoluxForm): SaveOutcome => {
  const savedAt = new Date().toISOString();
  try {
    writeJson(DRAFT_KEY, { savedAt, form: sanitizeFormForStorage(form, false) });
    return "ok";
  } catch {
    try {
      writeJson(DRAFT_KEY, { savedAt, form: sanitizeFormForStorage(form, true) });
      return "stripped";
    } catch {
      return "failed";
    }
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
