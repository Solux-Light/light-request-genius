import { supabase } from "@/integrations/supabase/client";
import { SoluxForm } from "@/types/solux";

export interface SubmissionMeta {
  salesName?: string;
}

export interface SubmissionResult {
  id: string;
  // Human-readable warning when original files couldn't be attached (e.g.
  // storage bucket not provisioned yet) — the submission itself still succeeds.
  fileUploadWarning?: string;
}

// C4 — the customer's ORIGINAL drawings must reach the Study Lab, not just the
// low-res annotation previews. Files only exist as session blob: URLs, so at
// submit time we fetch their bytes and upload them to Supabase Storage.
// Requires a bucket named "project-files" (public). If it's missing or any
// upload fails, we degrade gracefully: submit proceeds, a warning is returned.
const FILES_BUCKET = "project-files";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

const uploadBlobUrl = async (blobUrl: string, path: string): Promise<string | null> => {
  const blob = await fetch(blobUrl).then((r) => r.blob());
  const { error } = await supabase.storage.from(FILES_BUCKET).upload(path, blob, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(FILES_BUCKET).getPublicUrl(path).data.publicUrl;
};

// Upload every blob-backed file in the form; returns a form copy with
// `fileUrl` filled in, plus the names of files that could not be uploaded.
const attachOriginalFiles = async (form: SoluxForm): Promise<{ form: SoluxForm; failed: string[] }> => {
  const failed: string[] = [];
  const base = `${slugify(form.projectName)}-${Date.now()}`;
  // One upload per unique blob URL (several cross-section profiles can share
  // the same drawing).
  const urlToUploaded = new Map<string, string | null>();

  const uploadOnce = async (blobUrl: string, fileName: string) => {
    if (urlToUploaded.has(blobUrl)) return urlToUploaded.get(blobUrl) ?? null;
    try {
      const url = await uploadBlobUrl(blobUrl, `${base}/${fileName}`);
      urlToUploaded.set(blobUrl, url);
      return url;
    } catch {
      urlToUploaded.set(blobUrl, null);
      failed.push(fileName);
      return null;
    }
  };

  const roadDocuments = await Promise.all(
    form.roadDocuments.map(async (doc) => {
      const src = doc.annotation.pdfUrl;
      if (!src || !src.startsWith("blob:")) return doc;
      const url = await uploadOnce(src, doc.fileName);
      return url ? { ...doc, fileUrl: url } : doc;
    }),
  );

  let pdfPlan = form.pdfPlan;
  if (pdfPlan.pdfUrl && pdfPlan.pdfUrl.startsWith("blob:") && pdfPlan.sourceFileName) {
    const url = await uploadOnce(pdfPlan.pdfUrl, pdfPlan.sourceFileName);
    if (url) pdfPlan = { ...pdfPlan, fileUrl: url };
  }

  return { form: { ...form, roadDocuments, pdfPlan }, failed };
};

/**
 * Persist a lighting study request to Supabase (public.submissions).
 * Stores a few denormalised columns for easy listing plus the full form as JSON.
 * Throws on failure so the caller can surface the error to the user.
 */
export const saveSubmission = async (form: SoluxForm, meta: SubmissionMeta = {}): Promise<SubmissionResult> => {
  const { form: withFiles, failed } = await attachOriginalFiles(form);

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      project_name: form.projectName || null,
      client_name: form.clientName || null,
      locality: form.locality || null,
      country: form.country || null,
      sales_name: meta.salesName || null,
      deadline: form.deadlineDate || null,
      form: withFiles,
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    fileUploadWarning:
      failed.length > 0
        ? `${failed.join(", ")} — original file(s) could not be uploaded (storage bucket "${FILES_BUCKET}" missing?). The request was saved with previews only.`
        : undefined,
  };
};
