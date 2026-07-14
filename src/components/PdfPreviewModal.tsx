import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import HelpTip from "@/components/HelpTip";
import PdfSubmissionDocument from "./PdfSubmissionDocument";
import PdfExportButton from "./PdfExportButton";
import { SoluxForm } from "@/types/solux";

interface Props {
  form: SoluxForm;
  salesName: string;
  nowStr: string;
  lang: "fr" | "en";
  apiKey?: string;
  attachments?: { name: string; size: number }[];
}

const PdfPreviewModal = ({ form, salesName, nowStr, lang, apiKey, attachments }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const previewRef = useRef<HTMLDivElement>(null);
  // P3 — render the document (which mounts a live Google Map) only while the
  // dialog is open, never behind a closed modal on the typing hot path.
  const [open, setOpen] = useState(false);


  const safeName = form.projectName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "document";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* type="button" — prevents the form-default type="submit" */}
      <HelpTip tip={l(
        "Affiche le document PDF tel qu'il sera généré, sans le télécharger. Utilisez-le pour vérifier que la carte, les niveaux et le produit sont corrects avant d'exporter ou d'envoyer la demande.",
        "Shows the PDF document exactly as it will be generated, without downloading it. Use it to check that the map, levels and product are correct before exporting or submitting the request.",
      )}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="lg">
            <FileText className="h-4 w-4 mr-2" />
            {l("Aperçu PDF", "PDF Preview")}
          </Button>
        </DialogTrigger>
      </HelpTip>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{l("Aperçu du document", "Submission Document Preview")}</DialogTitle>
          <DialogDescription>{l("Aperçu avant export.", "Preview the document before exporting.")}</DialogDescription>
        </DialogHeader>

        {open && (
          <>
            {/* Visible preview */}
            <PdfSubmissionDocument
              ref={previewRef}
              form={form}
              salesName={salesName}
              nowStr={nowStr}
              lang={lang}
              apiKey={apiKey}
              attachments={attachments}
            />

            <div className="flex justify-end pt-4">
              <PdfExportButton contentRef={previewRef} filename={`${safeName}.pdf`} lang={lang} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewModal;
