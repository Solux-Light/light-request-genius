import { supabase } from "@/integrations/supabase/client";
import { SoluxForm } from "@/types/solux";

export interface SubmissionMeta {
  salesName?: string;
}

/**
 * Persist a lighting study request to Supabase (public.submissions).
 * Stores a few denormalised columns for easy listing plus the full form as JSON.
 * Throws on failure so the caller can surface the error to the user.
 */
export const saveSubmission = async (form: SoluxForm, meta: SubmissionMeta = {}) => {
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      project_name: form.projectName || null,
      client_name: form.clientName || null,
      locality: form.locality || null,
      country: form.country || null,
      sales_name: meta.salesName || null,
      deadline: form.deadlineDate || null,
      form,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data;
};
