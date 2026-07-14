import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import HelpTip from "@/components/HelpTip";

interface Props {
  contentRef: React.RefObject<HTMLDivElement>;
  filename?: string;
  lang?: "fr" | "en";
  // Optional lifecycle: `prepare` runs before capture (e.g. mount the hidden
  // document on demand — P2) and `cleanup` runs after, success or failure.
  prepare?: () => Promise<void> | void;
  cleanup?: () => void;
  // Optional gate: return false to cancel the export (P9 — used to confirm
  // exporting an incomplete document instead of silently producing one).
  beforeExport?: () => Promise<boolean> | boolean;
}

const PdfExportButton = ({ contentRef, filename = "document.pdf", lang = "en", prepare, cleanup, beforeExport }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    if (beforeExport && !(await beforeExport())) return;
    setExporting(true);
    try {
      await prepare?.();
      await runExport();
      toast({
        title: l("PDF créé", "PDF ready"),
        description: l(`${filename} a été téléchargé.`, `${filename} has been downloaded.`),
      });
    } catch (err) {
      toast({
        title: l("Échec de l'export PDF", "PDF export failed"),
        description: err instanceof Error ? err.message : l("Erreur inattendue — réessayez.", "Unexpected error — please try again."),
        variant: "destructive",
      });
    } finally {
      cleanup?.();
      setExporting(false);
    }
  };

  const runExport = async () => {
    if (!contentRef.current) return;
    await document.fonts.ready;
    // Wait for all images (including static map) to load
    const images = contentRef.current.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => {
                img.onload = r;
                img.onerror = r;
              })
      )
    );
    // Wait for Google Maps tiles to fully render
    await new Promise((r) => setTimeout(r, 2000));

    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(contentRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 10;
    const pdfWidth = 210 - 2 * margin;
    const pdfHeight = 297 - 2 * margin;
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const scale = pdfWidth / (imgWidth / 2); // html2canvas scale=2
    const totalHeight = (imgHeight / 2) * scale;

    let yOffset = 0;
    let pageNum = 0;

    while (yOffset < totalHeight) {
      if (pageNum > 0) pdf.addPage();

      const srcY = (yOffset / scale) * 2;
      const srcH = Math.min((pdfHeight / scale) * 2, imgHeight - srcY);
      const drawH = (srcH / 2) * scale;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = imgWidth;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, pdfWidth, drawH);
      yOffset += pdfHeight;
      pageNum++;
    }

    // The pages above are rasterized images, so hyperlinks in the HTML are
    // lost. Re-add them as PDF link annotations: any element carrying
    // data-pdf-link="<url>" gets a clickable region at its rendered position.
    const contRect = contentRef.current.getBoundingClientRect();
    const mmPerPx = pdfWidth / contRect.width;
    contentRef.current.querySelectorAll<HTMLElement>("[data-pdf-link]").forEach((el) => {
      const url = el.getAttribute("data-pdf-link");
      if (!url) return;
      const r = el.getBoundingClientRect();
      const relYmm = (r.top - contRect.top) * mmPerPx;
      const page = Math.floor(relYmm / pdfHeight);
      if (page >= pageNum) return;
      pdf.setPage(page + 1);
      pdf.link(
        margin + (r.left - contRect.left) * mmPerPx,
        margin + (relYmm - page * pdfHeight),
        r.width * mmPerPx,
        r.height * mmPerPx,
        { url },
      );
    });

    pdf.save(filename);
  };

  // type="button" — inside the intake <form>, the default type="submit" made
  // every Export click ALSO fire a submission.
  return (
    <HelpTip tip={l(
      "Génère le document PDF complet de la demande (informations, carte ou plan avec zones, lampadaires et indications, niveaux, produit, programme) et le télécharge. Utilisez-le pour transmettre ou archiver la demande telle qu'elle sera lue par le Study Lab.",
      "Generates the complete PDF document of the request (details, map or plan with zones, lamp posts and indications, levels, product, program) and downloads it. Use it to send or archive the request exactly as the Study Lab will read it.",
    )}>
      <Button type="button" variant="outline" size="lg" onClick={handleExport} disabled={exporting}>
        {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {exporting ? l("Génération du PDF…", "Generating PDF…") : l("Exporter PDF", "Export PDF")}
      </Button>
    </HelpTip>
  );
};

export default PdfExportButton;
