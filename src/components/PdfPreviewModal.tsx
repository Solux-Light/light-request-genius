import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileText } from "lucide-react";
import PdfSubmissionDocument from "./PdfSubmissionDocument";
import PdfExportButton from "./PdfExportButton";
import { SoluxForm } from "@/types/solux";

interface Props {
  form: SoluxForm;
  salesName: string;
  nowStr: string;
  lang: "fr" | "en";
  apiKey?: string;
}

const PdfPreviewModal = ({ form, salesName, nowStr, lang, apiKey }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  const safeName = form.projectName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "document";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <FileText className="h-4 w-4 mr-2" />
          {l("Aperçu PDF", "PDF Preview")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{l("Aperçu du document", "Submission Document Preview")}</DialogTitle>
          <DialogDescription>{l("Aperçu avant export.", "Preview the document before exporting.")}</DialogDescription>
        </DialogHeader>

        {/* Visible preview */}
        <PdfSubmissionDocument
          ref={previewRef}
          form={form}
          salesName={salesName}
          nowStr={nowStr}
          lang={lang}
          apiKey={apiKey}
        />

        <div className="flex justify-end pt-4">
          <PdfExportButton contentRef={previewRef} filename={`${safeName}.pdf`} lang={lang} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewModal;
