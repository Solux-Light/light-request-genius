import { forwardRef } from "react";
import { SoluxForm, SEGMENT_TYPES, SEGMENT_COLORS, LightingSegment } from "@/types/solux";

const buildStaticMapUrl = (
  apiKey: string,
  location: { lat: number; lng: number },
  areas: { paths: { lat: number; lng: number }[]; color: string }[],
  lampposts: { lat: number; lng: number }[],
  zoom?: number,
  center?: { lat: number; lng: number }
) => {
  const c = center || location;
  const z = zoom || 16;
  const base = `https://maps.googleapis.com/maps/api/staticmap?center=${c.lat},${c.lng}&zoom=${z}&size=760x380&scale=2&maptype=hybrid&key=${apiKey}`;

  // Add polygon paths
  const polyParts = areas.map((area) => {
    const hex = area.color.replace("#", "");
    const pathStr = area.paths.map((p) => `${p.lat},${p.lng}`).join("|");
    return `&path=color:0x${hex}88|fillcolor:0x${hex}44|weight:2|${pathStr}|${area.paths[0].lat},${area.paths[0].lng}`;
  });

  // Add lamppost markers
  const markerParts = lampposts.length > 0
    ? `&markers=color:yellow|size:small|${lampposts.map((lp) => `${lp.lat},${lp.lng}`).join("|")}`
    : "";

  return base + polyParts.join("") + markerParts;
};

const PRODUCT_LABELS: Record<string, string> = {
  SSLXPRO: "SOLUX PRO",
  SSLXMAX: "SOLUX MAX",
  SSLXULTRA: "SOLUX ULTRA",
  SSLXMINI: "SOLUX MINI",
  SSLXSTREET: "SOLUX STREET",
};

interface Props {
  form: SoluxForm;
  salesName: string;
  nowStr: string;
  lang: "fr" | "en";
  mapPreviewMode?: "live" | "interactive" | "placeholder";
  apiKey?: string;
}

const segColor = (seg: LightingSegment) => {
  if (seg.mode === "sensor") return "rgb(137, 250, 140)";
  if (seg.intensity === 100) return "#111";
  return "rgb(170, 173, 184)";
};

const PdfSubmissionDocument = forwardRef<HTMLDivElement, Props>(
  ({ form, salesName, nowStr, lang, mapPreviewMode = "placeholder", apiKey }, ref) => {
    const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
    const getSegLabel = (type: string) => {
      const t = SEGMENT_TYPES.find((s) => s.value === type);
      return t ? (lang === "fr" ? t.labelFr : t.labelEn) : type;
    };

    return (
      <div ref={ref} style={{ width: 794, fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, lineHeight: 1.6, padding: 40, backgroundColor: "#fff", color: "#111" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>
            {l("DEMANDE D'ÉTUDE D'ÉCLAIRAGE", "LIGHTING STUDY REQUEST")}
          </h1>
          <span style={{ fontSize: 20, fontWeight: 800 }}>SOLUX</span>
        </div>

        {/* General Info */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
            {l("Informations générales", "General Information")}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                [l("Nom du projet", "Project Name"), form.projectName],
                [l("Client", "Client"), form.clientName],
                [l("Localité", "Locality"), form.locality],
                [l("Pays", "Country"), form.country],
                [l("Adresse", "Address"), form.address],
                [l("GPS", "GPS"), form.location ? `${form.location.lat}, ${form.location.lng}` : "—"],
                [l("Type de projet", "Project Type"), form.projectType === "zone" ? l("Éclairage de zone", "Zone Lighting") : l("Éclairage routier", "Road Lighting")],
              ].map(([label, val], i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                  <td style={{ padding: "4px 8px" }}>{val || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Map preview (zone + map mode) */}
         {form.locationMode === "map" && form.location && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Carte du projet", "Project Map")}
            </h2>
            {apiKey ? (
              <img
                src={buildStaticMapUrl(
                  apiKey,
                  form.location,
                  form.areas,
                  form.lampposts.map((lp) => ({ lat: lp.lat, lng: lp.lng })),
                  form.mapZoom,
                  form.mapCenter
                )}
                alt="Project Map"
                style={{ width: "100%", borderRadius: 4, border: "1px solid #e5e7eb" }}
                crossOrigin="anonymous"
              />
            ) : (
              <p style={{ color: "#999", fontStyle: "italic" }}>{l("Carte non disponible", "Map not available")}</p>
            )}
          </section>
        )}

        {/* PDF Plan preview */}
        {form.locationMode === "pdf" && form.pdfPlan.previewImage && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Plan PDF", "PDF Plan")}
            </h2>
            <img src={form.pdfPlan.previewImage} alt="PDF Plan" style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4 }} />
          </section>
        )}

        {/* Zone Lighting Levels */}
        {form.projectType === "zone" && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Niveaux d'éclairage", "Lighting Levels")}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  [l("Zone assignée", "Assigned Zone"), form.assignedArea || "—"],
                  [l("Lux moyen", "Average Lux"), form.avgLux || "—"],
                  [l("Uniformité", "Uniformity"), form.uniformity || "—"],
                  [l("Lux minimum", "Min Lux"), form.minLux || "—"],
                  ["CCT", form.cct],
                ].map(([label, val], i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                    <td style={{ padding: "4px 8px" }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Road Profile */}
        {form.projectType === "road" && form.roadProfile.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Profil routier", "Road Profile")}
            </h2>
            <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
              {form.roadProfile.map((seg) => (
                <div key={seg.id} style={{
                  minWidth: 40,
                  width: seg.width * 30,
                  height: 40,
                  backgroundColor: SEGMENT_COLORS[seg.type] || "#888",
                  borderRadius: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 600,
                }}>
                  <span>{getSegLabel(seg.type)}</span>
                  <span>{seg.width}m</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11 }}>{l("Largeur totale", "Total width")}: {form.roadProfile.reduce((s, seg) => s + seg.width, 0).toFixed(1)}m</p>
          </section>
        )}

        {/* Road Lighting Config */}
        {form.projectType === "road" && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Configuration éclairage routier", "Road Lighting Configuration")}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  [l("Disposition", "Arrangement"), form.roadLighting.arrangement],
                  [l("Hauteur du mât", "Pole Height"), `${form.roadLighting.pole_height}m`],
                  [l("Longueur du bras", "Arm Length"), `${form.roadLighting.arm_length}m`],
                  [l("Espacement", "Spacing"), `${form.roadLighting.spacing}m`],
                  [l("Inclinaison", "Tilt"), `${form.roadLighting.tilt}°`],
                  [l("Orientation", "Orientation"), form.roadLighting.orientation],
                ].map(([label, val], i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                    <td style={{ padding: "4px 8px" }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Lighting Programming */}
        {form.lightingSegments.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Programmation d'éclairage", "Lighting Programming")}
            </h2>
            <p style={{ fontSize: 11, marginBottom: 8 }}>{l("Durée de nuit", "Night Duration")}: {form.lightingNightHours}h</p>
            <div style={{ display: "flex", height: 30, borderRadius: 6, overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: 8 }}>
              {form.lightingSegments.map((seg) => (
                <div key={seg.id} style={{
                  width: `${(seg.hours / form.lightingNightHours) * 100}%`,
                  backgroundColor: segColor(seg),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: seg.mode === "fixed" && seg.intensity === 100 ? "#fff" : "#111",
                }}>
                  {seg.hours}h
                </div>
              ))}
            </div>
            {form.lightingSegments.map((seg, i) => (
              <p key={seg.id} style={{ fontSize: 11 }}>
                {l("Période", "Period")} {i + 1}: {seg.mode === "sensor" ? `Sensor (${seg.min}%-${seg.max}%)` : `Fixed (${seg.intensity}%)`} — {seg.hours}h
              </p>
            ))}
          </section>
        )}

        {/* Product */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
            {l("Produit", "Product")}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                [l("Produit", "Product"), PRODUCT_LABELS[form.product] || form.product || "—"],
                [l("Hauteur luminaire", "Luminaire Height"), form.luminaireHeight ? `${form.luminaireHeight}m` : "—"],
                [l("Espacement", "Spacing"), form.spacing ? `${form.spacing}m` : "—"],
                [l("Batterie", "Battery"), form.batteryChoice === "custom" ? `Custom: ${form.batteryWh}Wh` : "Standard"],
                [l("Panneau", "Panel"), form.panelChoice === "custom" ? `Custom: ${form.panelWp}Wp` : "Standard"],
                [l("Alternative", "Alternative"), form.alternativeAccepted ? (form.alternativeDetails || l("Oui", "Yes")) : l("Non", "No")],
              ].map(([label, val], i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                  <td style={{ padding: "4px 8px" }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Multi-Product */}
        {form.multiProduct && form.productAssignments.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Assignations multi-produits", "Multi-Product Assignments")}
            </h2>
            {form.productAssignments.map((a, i) => (
              <div key={a.id} style={{ marginBottom: 8, padding: 8, border: "1px solid #e5e7eb", borderRadius: 4 }}>
                <p><strong>{a.zone || `Zone ${i + 1}`}</strong> → {a.product}</p>
                {a.avgLux && <p>Avg Lux: {a.avgLux}</p>}
                {a.uniformity && <p>Uniformity: {a.uniformity}</p>}
                {a.cct && <p>CCT: {a.cct}K</p>}
              </div>
            ))}
          </section>
        )}

        {/* Technical Notes */}
        {form.technicalNotes && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Notes techniques", "Technical Notes")}
            </h2>
            <p>{form.technicalNotes}</p>
          </section>
        )}

        {/* Processing Details */}
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
            {l("Détails de traitement", "Processing Details")}
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                [l("Commercial", "Sales Rep"), salesName || "—"],
                [l("Date de soumission", "Submission Date"), nowStr],
                [l("Date limite", "Deadline"), form.deadlineDate || "—"],
              ].map(([label, val], i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                  <td style={{ padding: "4px 8px" }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, textAlign: "center", fontSize: 10, color: "#999" }}>
          {l("Document auto-généré — SOLUX", "Auto-generated document — SOLUX")}
        </div>
      </div>
    );
  }
);

PdfSubmissionDocument.displayName = "PdfSubmissionDocument";

export default PdfSubmissionDocument;
