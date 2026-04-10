import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Props {
  contentRef: React.RefObject<HTMLDivElement>;
  filename?: string;
  lang?: "fr" | "en";
}

const PdfExportButton = ({ contentRef, filename = "document.pdf", lang = "en" }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const handleExport = async () => {
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

    pdf.save(filename);
  };

  return (
    <Button variant="outline" size="lg" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      {l("Exporter PDF", "Export PDF")}
    </Button>
  );
};

export default PdfExportButton;
