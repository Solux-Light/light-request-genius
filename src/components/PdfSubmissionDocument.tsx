import { forwardRef } from "react";
import {
  SoluxForm, SEGMENT_TYPES, SEGMENT_COLORS, LightingSegment,
  formatHeight, PROFILE_SEGMENT_KINDS, ProfileProgram,
} from "@/types/solux";
import { earthWebUrl } from "@/lib/kml";
import ProjectLiveMapPreview from "@/components/ProjectLiveMapPreview";

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

// One period as compact text, including the sensor energy parameters.
const periodText = (seg: LightingSegment): string =>
  seg.mode === "sensor"
    ? `Sensor ${seg.min ?? 0}–${seg.max ?? 100}%${seg.boostDurationS ? `, boost ${seg.boostDurationS}s` : ""}${seg.estimatedDetections ? `, ~${seg.estimatedDetections} det.` : ""} — ${seg.hours}h`
    : `Fixed ${seg.intensity ?? 100}% — ${seg.hours}h`;

// Whole program on one line for the profile/segment tables.
const programSummary = (p: ProfileProgram): string => {
  const parts = p.segments.map(periodText);
  if (p.morningTimeH > 0) parts.push(`Morning ${p.morningTimeH}h @${p.morningIntensityPct}%`);
  return `${p.nightHours}h: ${parts.join(" · ")}`;
};

const PdfSubmissionDocument = forwardRef<HTMLDivElement, Props>(
  ({ form, salesName, nowStr, lang, mapPreviewMode = "placeholder", apiKey }, ref) => {
    const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
    const getSegLabel = (type: string) => {
      const t = SEGMENT_TYPES.find((s) => s.value === type);
      return t ? (lang === "fr" ? t.labelFr : t.labelEn) : type;
    };

    // Resolve a zone id to its human name (map areas + PDF zones), so the PDF
    // shows "Parking nord" instead of a raw UUID.
    const zoneNameById: Record<string, string> = {};
    form.areas.forEach((a) => { zoneNameById[a.id] = a.name || `Zone ${a.id.slice(0, 6)}`; });
    form.pdfPlan.zones.forEach((z) => { zoneNameById[z.id] = z.name || `Zone ${z.id.slice(0, 6)}`; });

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

        {/* Worst-case sizing references (winter solstice) */}
        {form.duskHHMM && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Références de dimensionnement (solstice d'hiver)", "Sizing References (Winter Solstice)")}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  [l("Nuit la plus longue", "Longest night"), `${form.longestNightH || form.lightingNightHours} h`],
                  [l("Coucher du soleil", "Sunset"), `${form.duskHHMM} (${form.duskBasis === "legal" ? l("heure légale", "legal time") : l("heure solaire", "solar time")})`],
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

        {/* Map preview (zone + map mode) */}
         {form.locationMode === "map" && form.location && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Carte du projet", "Project Map")}
            </h2>
            {apiKey ? (
              <div data-map-preview>
                <ProjectLiveMapPreview
                  apiKey={apiKey}
                  location={form.location}
                  areas={form.areas}
                  lampposts={form.lampposts}
                  zoom={form.mapZoom}
                  center={form.mapCenter}
                  lang={lang}
                />
              </div>
            ) : (
              <p style={{ color: "#999", fontStyle: "italic" }}>{l("Carte non disponible", "Map not available")}</p>
            )}
          </section>
        )}

        {/* Google Earth — lets the Study Lab reopen the project geometry without
            redrawing. The KML (zones + lampposts) is exported from the app; the
            link below flies Google Earth to the site (clickable in the PDF). */}
        {form.location && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              Google Earth
            </h2>
            <p style={{ fontSize: 11, marginBottom: 4 }} data-pdf-link={earthWebUrl(form.location.lat, form.location.lng)}>
              🌍 <span style={{ color: "#2563eb", textDecoration: "underline" }}>{earthWebUrl(form.location.lat, form.location.lng)}</span>
            </p>
            <p style={{ fontSize: 10, color: "#666" }}>
              {l(
                "Le fichier KML (zones + lampadaires) exporté depuis l'application accompagne cette demande — ouvrez-le dans Google Earth pour retrouver la géométrie exacte.",
                "The KML file (zones + lampposts) exported from the app accompanies this request — open it in Google Earth to recover the exact geometry.",
              )}
            </p>
          </section>
        )}

        {/* Plan preview (PDF/image) or stored CAD reference */}
        {form.locationMode === "pdf" && form.pdfPlan.previewImage && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Plan du projet", "Project Plan")}
            </h2>
            <img src={form.pdfPlan.previewImage} alt="Plan" style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4 }} />
          </section>
        )}
        {form.locationMode === "pdf" && !form.pdfPlan.previewImage && (form.pdfPlan.sourceKind === "dwg" || form.pdfPlan.sourceKind === "dxf") && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Plan du projet", "Project Plan")}
            </h2>
            <p style={{ fontSize: 11 }}>
              📐 {l("Fichier CAO joint", "CAD file attached")}: <strong>{form.pdfPlan.sourceFileName}</strong> ({(form.pdfPlan.sourceKind || "").toUpperCase()}) — {l("aperçu non disponible dans ce document", "preview not available in this document")}
            </p>
          </section>
        )}

        {/* Zone Lighting Levels — horizontal engineering tables (mirror the app):
            requirements at a glance, then the requested product, then the
            program per zone (Morning Time included consistently). */}
        {form.projectType === "zone" && (() => {
          const th = { padding: "4px 6px", fontWeight: 700 } as const;
          const td = { padding: "4px 6px" } as const;
          const headRow = { borderBottom: "1.5px solid #111", backgroundColor: "#f9fafb" } as const;
          const entries = Object.entries(form.zoneLightingData);
          // Fall back to the top-level fields when no zone was drawn, so the
          // program (and Morning Time) is never dropped from the document.
          const rows = entries.length > 0
            ? entries.map(([zoneId, zd]) => ({ id: zoneId, name: zoneNameById[zoneId] || zoneId, zd }))
            : [{
                id: "current",
                name: form.assignedArea ? (zoneNameById[form.assignedArea] || form.assignedArea) : l("Zone", "Zone"),
                zd: {
                  avgLux: form.avgLux, uniformity: form.uniformity, minLux: form.minLux, cct: form.cct,
                  lightingSegments: form.lightingSegments, lightingNightHours: form.lightingNightHours,
                  morningTimeH: form.morningTimeH, morningIntensityPct: form.morningIntensityPct,
                  product: form.product, luminaireHeight: form.luminaireHeight, spacing: form.spacing,
                  optimizeHeight: form.optimizeHeight, optimizeSpacing: form.optimizeSpacing,
                  batteryChoice: form.batteryChoice, batteryWh: form.batteryWh,
                  panelChoice: form.panelChoice, panelWp: form.panelWp,
                  alternativeAccepted: form.alternativeAccepted, alternativeDetails: form.alternativeDetails,
                },
              }];
          return (
            <section style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
                {l("Niveaux d'éclairage demandés", "Requested Lighting Levels")}
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 8 }}>
                <tbody>
                  <tr style={headRow}>
                    {[l("Zone", "Zone"), l("Lux moy", "Avg Lux"), l("Lux min", "Min Lux"), l("Uniformité", "Uniformity"), "CCT", l("Nuit", "Night"), "🌅 Morning"].map((h, i) => (
                      <td key={i} style={th}>{h}</td>
                    ))}
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                      <td style={td}>{r.zd.avgLux || "—"}</td>
                      <td style={td}>{r.zd.minLux || "—"}</td>
                      <td style={td}>{r.zd.uniformity || "—"}</td>
                      <td style={td}>{r.zd.cct || "—"}</td>
                      <td style={td}>{r.zd.lightingNightHours}h</td>
                      <td style={td}>{r.zd.morningTimeH > 0 ? `${r.zd.morningTimeH}h @ ${r.zd.morningIntensityPct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 8 }}>
                <tbody>
                  <tr style={headRow}>
                    {[l("Zone", "Zone"), l("Produit", "Product"), l("Hauteur", "Height"), l("Espacement", "Spacing"), l("Batterie", "Battery"), l("Panneau", "Panel"), "Alt."].map((h, i) => (
                      <td key={i} style={th}>{h}</td>
                    ))}
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                      <td style={td}>{PRODUCT_LABELS[r.zd.product] || r.zd.product || "—"}</td>
                      <td style={td}>{formatHeight(r.zd.luminaireHeight, lang)}</td>
                      <td style={td}>{r.zd.spacing ? `${r.zd.spacing}m` : "—"}</td>
                      <td style={td}>{r.zd.batteryChoice === "custom" ? `${r.zd.batteryWh}Wh` : "Std"}</td>
                      <td style={td}>{r.zd.panelChoice === "custom" ? `${r.zd.panelWp}Wp` : "Std"}</td>
                      <td style={td}>{r.zd.alternativeAccepted ? (r.zd.alternativeDetails || l("Oui", "Yes")) : l("Non", "No")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.filter((r) => r.zd.lightingSegments && r.zd.lightingSegments.length > 0).map((r) => (
                <p key={r.id} style={{ fontSize: 10, marginTop: 2 }}>
                  <strong>{r.name}</strong> — {programSummary({
                    nightHours: r.zd.lightingNightHours,
                    morningTimeH: r.zd.morningTimeH,
                    morningIntensityPct: r.zd.morningIntensityPct,
                    segments: r.zd.lightingSegments,
                  })}
                </p>
              ))}
            </section>
          );
        })()}

        {/* Road Profile */}
        {form.projectType === "road" && form.roadInputMode === "builder" && form.roadProfile.length > 0 && (
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
        {form.projectType === "road" && form.roadInputMode === "builder" && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Configuration éclairage routier", "Road Lighting Configuration")}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  [l("Disposition", "Arrangement"), form.roadLighting.arrangement],
                  [l("Luminaire", "Luminaire"), PRODUCT_LABELS[form.roadLighting.luminaire] || form.roadLighting.luminaire || "—"],
                  [l("Hauteur du mât", "Pole Height"),
                    form.roadLighting.pole_height_mode === "range"
                      ? `${form.roadLighting.pole_height_min ?? "—"}–${form.roadLighting.pole_height_max ?? "—"} m (${l("plage — le Study Lab choisit la hauteur optimale", "range — Study Lab picks the best height")})`
                      : `${form.roadLighting.pole_height}m`],
                  [l("Longueur du bras", "Arm Length"), `${form.roadLighting.arm_length}m`],
                  [l("Espacement", "Spacing"), `${form.roadLighting.spacing}m`],
                  [l("Inclinaison", "Tilt"), `${form.roadLighting.tilt}°`],
                  [l("Orientation", "Orientation"), form.roadLighting.orientation],
                  [l("Puissance", "Power"), form.roadLighting.power_mode === "manual" ? `${form.roadLighting.power_w || "—"}W` : "Auto"],
                  [l("Optimisations", "Optimizations"), [
                    form.roadLighting.optimize_pole_height && l("hauteur", "pole height"),
                    form.roadLighting.optimize_arm_length && l("bras", "arm"),
                    form.roadLighting.optimize_spacing && l("espacement", "spacing"),
                  ].filter(Boolean).join(", ") || l("Aucune", "None")],
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

        {/* Per-Segment Lighting Levels (road) */}
        {form.projectType === "road" && form.roadInputMode === "builder" && Object.keys(form.roadSegmentLighting).length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {[l("Segment", "Segment"), l("Lux moyen", "Avg Lux"), l("Uniformité", "Uniformity"), l("Lux min", "Min Lux"), "CCT"].map((h, i) => (
                    <td key={i} style={{ padding: "4px 8px", fontWeight: 700 }}>{h}</td>
                  ))}
                </tr>
                {Object.entries(form.roadSegmentLighting).map(([type, lvl]) => (
                  <tr key={type} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{getSegLabel(type)}</td>
                    <td style={{ padding: "4px 8px" }}>{lvl.avgLux || "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{lvl.uniformity || "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{lvl.minLux || "—"}</td>
                    <td style={{ padding: "4px 8px" }}>{lvl.cct || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Work From PDF Profile — customer-supplied documents + requested levels */}
        {form.projectType === "road" && form.roadInputMode === "pdf_profile" && (
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
              {l("Profils fournis par le client", "Customer-Provided Profiles")}
            </h2>
            {/* Project summary — quick overview before the per-profile detail */}
            {form.roadDocuments.length > 1 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 12 }}>
                <tbody>
                  <tr style={{ borderBottom: "1.5px solid #111", backgroundColor: "#f9fafb" }}>
                    {[l("Profil", "Profile"), l("Segments routiers", "Road Segments"), l("Produit demandé", "Requested Product"), l("Hauteur", "Height"), l("Programme", "Program")].map((h, i) => (
                      <td key={i} style={{ padding: "4px 6px", fontWeight: 700 }}>{h}</td>
                    ))}
                  </tr>
                  {form.roadDocuments.map((doc, di) => {
                    const kindName = (kind: string) => {
                      const k = PROFILE_SEGMENT_KINDS.find((s) => s.value === kind);
                      return k ? (lang === "fr" ? k.labelFr : k.labelEn) : kind;
                    };
                    const p = doc.config.program;
                    return (
                      <tr key={doc.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px 6px", fontWeight: 600 }}>{doc.profileName || `${l("Profil", "Profile")} ${di + 1}`}</td>
                        <td style={{ padding: "4px 6px" }}>{doc.segments.map((s) => s.label || kindName(s.kind)).join(" + ") || "—"}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {doc.config.recommendProduct
                            ? `✨ ${l("Reco Study Lab", "Study Lab pick")}`
                            : [doc.config.family, doc.config.product].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={{ padding: "4px 6px" }}>{doc.config.optimize?.height ? l("Optimisé", "Optimize") : formatHeight(doc.config.height, lang)}</td>
                        <td style={{ padding: "4px 6px" }}>{p.nightHours}h · {p.segments.length} {l("périodes", "periods")}{p.morningTimeH > 0 ? ` · 🌅 ${p.morningTimeH}h` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {form.roadDocuments.length === 0 ? (
              <p style={{ color: "#999", fontStyle: "italic" }}>{l("Aucun document fourni", "No documents provided")}</p>
            ) : form.roadDocuments.map((doc, di) => {
              const segKindName = (kind: string) => {
                const k = PROFILE_SEGMENT_KINDS.find((s) => s.value === kind);
                return k ? (lang === "fr" ? k.labelFr : k.labelEn) : kind;
              };
              const cfg = doc.config;
              return (
                <div key={doc.id} style={{ marginBottom: 20, padding: 10, border: "1px solid #e5e7eb", borderRadius: 4, pageBreakInside: "avoid" }}>
                  {/* Profile header */}
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                    {l("Profil", "Profile")} {di + 1} — {doc.profileName || doc.fileName}
                  </p>
                  <p style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
                    {doc.fileName} · {doc.kind.toUpperCase()} · {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB") : "—"}
                  </p>

                  {/* Profile configuration — one compact line-table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8, fontSize: 11 }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "3px 6px", fontWeight: 600, width: "25%" }}>{l("Produit demandé", "Requested Product")}</td>
                        {/* No optic — optics are chosen by the Study Lab during optimisation. */}
                        <td style={{ padding: "3px 6px" }}>
                          {cfg.recommendProduct
                            ? `✨ ${l("Le Study Lab recommandera la meilleure solution", "Study Lab will recommend the best solution")}`
                            : [cfg.family, cfg.product].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={{ padding: "3px 6px", fontWeight: 600 }}>CCT</td>
                        <td style={{ padding: "3px 6px" }}>{cfg.cct || "—"}</td>
                      </tr>
                      {(() => {
                        // Per-parameter: manual constraint or Study Lab optimisation.
                        const OPT = `✨ ${l("À optimiser (Study Lab)", "Optimize (Study Lab)")}`;
                        const o = cfg.optimize;
                        return (
                          <>
                            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{l("Hauteur", "Height")}</td>
                              <td style={{ padding: "3px 6px" }}>{o?.height ? OPT : formatHeight(cfg.height, lang)}</td>
                              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{l("Espacement", "Spacing")}</td>
                              <td style={{ padding: "3px 6px" }}>{o?.spacing ? OPT : cfg.spacing ? `${cfg.spacing} m` : "—"}</td>
                            </tr>
                            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{l("Disposition", "Arrangement")}</td>
                              <td style={{ padding: "3px 6px" }}>{o?.arrangement ? OPT : cfg.arrangement || "—"}</td>
                              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{l("Avancée / Inclinaison", "Overhang / Tilt")}</td>
                              <td style={{ padding: "3px 6px" }}>
                                {o?.overhang ? OPT : cfg.overhang ? `${cfg.overhang} m` : "—"} / {o?.tilt ? OPT : cfg.tilt ? `${cfg.tilt}°` : "—"}
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                      <tr>
                        <td style={{ padding: "3px 6px", fontWeight: 600 }}>{l("Programme", "Program")}</td>
                        <td style={{ padding: "3px 6px" }} colSpan={3}>{programSummary(cfg.program)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Lighting levels table — the customer's requested targets */}
                  {doc.segments.length > 0 && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                      <tbody>
                        <tr style={{ borderBottom: "1.5px solid #111", backgroundColor: "#f9fafb" }}>
                          {[l("Segment", "Segment"), l("Lux moy", "Avg Lux"), l("Lux min", "Min Lux"), l("Uniformité", "Uniformity"), "MF", l("Classe", "Class"), l("Notes", "Notes")].map((h, i) => (
                            <td key={i} style={{ padding: "4px 6px", fontWeight: 700 }}>{h}</td>
                          ))}
                        </tr>
                        {doc.segments.map((seg) => (
                          <tr key={seg.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "4px 6px", fontWeight: 600 }}>{seg.label || segKindName(seg.kind)}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.avgLux || "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.minLux || "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.uniformity || "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.maintenanceFactor || "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.roadClass || "—"}</td>
                            <td style={{ padding: "4px 6px" }}>{seg.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Per-profile notes */}
                  {doc.notes && (
                    <p style={{ fontSize: 10, marginTop: 6 }}>✎ {l("Notes du profil", "Profile notes")}: {doc.notes}</p>
                  )}

                  {doc.annotation.previewImage && (
                    <img src={doc.annotation.previewImage} alt={doc.profileName} style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4, marginTop: 8 }} />
                  )}
                  {!doc.annotation.previewImage && (doc.kind === "dwg" || doc.kind === "dxf") && (
                    <p style={{ fontSize: 10, marginTop: 6 }}>📐 {l("Fichier CAO joint", "CAD file attached")}: <strong>{doc.fileName}</strong></p>
                  )}
                </div>
              );
            })}
            {form.roadProfileNotes && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{l("Notes supplémentaires", "Additional Notes")}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>{form.roadProfileNotes}</p>
              </div>
            )}
          </section>
        )}

        {/* Lighting Programming — builder mode only; in Work-From-PDF-Profile
            mode each profile prints its own program in its section. */}
        {form.projectType === "road" && form.roadInputMode === "builder" && form.lightingSegments.length > 0 && (
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
                {l("Période", "Period")} {i + 1}: {periodText(seg)}
              </p>
            ))}
            {form.morningTimeH > 0 && (
              <p style={{ fontSize: 11, marginTop: 4, color: "#92400e" }}>
                🌅 Morning Time: {form.morningTimeH}h @ {form.morningIntensityPct}% — {l("toujours la dernière période, se termine au lever du soleil", "always the final period, ends at sunrise")}
              </p>
            )}
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
                [l("Hauteur luminaire", "Luminaire Height"), formatHeight(form.luminaireHeight, lang)],
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
                <p><strong>{a.zone || `Zone ${i + 1}`}</strong> → {PRODUCT_LABELS[a.product] || a.product}</p>
                {a.avgLux && <p>{l("Lux moyen", "Avg Lux")}: {a.avgLux}</p>}
                {a.uniformity && <p>{l("Uniformité", "Uniformity")}: {a.uniformity}</p>}
                {a.minLux && <p>{l("Lux min", "Min Lux")}: {a.minLux}</p>}
                {a.cct && <p>CCT: {String(a.cct).replace(/k$/i, "")}K</p>}
                {(a.luminaireHeight || a.spacing) && <p>{l("Hauteur", "Height")}: {a.luminaireHeight || "—"}m · {l("Espacement", "Spacing")}: {a.spacing || "—"}m</p>}
                {a.presenceDetection && <p>{l("Détection de présence", "Presence Detection")}: {l("Oui", "Yes")}{a.detectionCount ? ` (${a.detectionCount}${a.detectionDuration ? `, ${a.detectionDuration}` : ""})` : ""}</p>}
                {a.scenarioText && <p>{l("Notes de scénario", "Scenario notes")}: {a.scenarioText}</p>}
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
