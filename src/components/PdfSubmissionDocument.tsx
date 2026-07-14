import { forwardRef } from "react";
import {
  SoluxForm, SEGMENT_COLORS, LightingSegment,
  formatHeight, ProfileProgram, segmentTypeLabel, profileKindLabel,
  productDisplay, migrateLegacyProduct, migrateLegacyLuminaireFamily,
  lamppostDisplay, RECO_STYLE,
} from "@/types/solux";
import { earthWebUrl } from "@/lib/kml";
import { segmentColor } from "@/lib/program";
import ProjectLiveMapPreview from "@/components/ProjectLiveMapPreview";

interface Props {
  form: SoluxForm;
  salesName: string;
  nowStr: string;
  lang: "fr" | "en";
  mapPreviewMode?: "live" | "interactive" | "placeholder";
  apiKey?: string;
  attachments?: { name: string; size: number }[];
}

// Professional document rules (P9):
// - Same terminology as the interface, in both languages.
// - No emojis, no raw enum values, no floating-point coordinate noise.
// - Empty optional rows are OMITTED, never printed as "—".
// - Nothing is claimed that doesn't exist (no phantom zones, no KML promise
//   when no geometry was drawn).

// One period as compact text, including the sensor energy parameters.
const periodText = (seg: LightingSegment, lang: "fr" | "en"): string => {
  const t = (fr: string, en: string) => (lang === "fr" ? fr : en);
  return seg.mode === "sensor"
    ? `${t("Détection", "Sensor")} ${seg.min ?? 0}–${seg.max ?? 100}%${seg.boostDurationS ? `, boost ${seg.boostDurationS}s` : ""}${seg.estimatedDetections ? `, ~${seg.estimatedDetections} ${t("dét.", "det.")}` : ""} — ${seg.hours}h`
    : `${t("Fixe", "Fixed")} ${seg.intensity ?? 100}% — ${seg.hours}h`;
};

// Whole program on one line for the profile/segment tables.
const programSummary = (p: ProfileProgram, lang: "fr" | "en"): string => {
  const t = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const parts = p.segments.map((s) => periodText(s, lang));
  if (p.morningTimeH > 0) parts.push(`${t("Période du matin", "Morning period")} ${p.morningTimeH}h @${p.morningIntensityPct}%`);
  return `${p.nightHours}h: ${parts.join(" · ")}`;
};

const ARRANGEMENT_LABELS: Record<string, { fr: string; en: string }> = {
  single_left: { fr: "Simple gauche", en: "Single left" },
  single_right: { fr: "Simple droite", en: "Single right" },
  both: { fr: "Les deux côtés", en: "Both sides" },
  staggered: { fr: "En quinconce", en: "Staggered" },
  central: { fr: "Central", en: "Central" },
};
const ORIENTATION_LABELS: Record<string, { fr: string; en: string }> = {
  perpendicular: { fr: "Perpendiculaire", en: "Perpendicular" },
  parallel: { fr: "Parallèle", en: "Parallel" },
  angled: { fr: "En angle", en: "Angled" },
};

const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Legend for recommendation zones — the Study Lab must read the intent
// (green = install here, red = avoid) without any accompanying text.
const RecoLegend = ({ recoCount, lang }: { recoCount: { recommended: number; excluded: number }; lang: "fr" | "en" }) => {
  const t = (fr: string, en: string) => (lang === "fr" ? fr : en);
  if (recoCount.recommended + recoCount.excluded === 0) return null;
  return (
    <p style={{ fontSize: 10, marginTop: 4 }}>
      {recoCount.recommended > 0 && (
        <span style={{ marginRight: 12, color: RECO_STYLE.recommended.stroke, fontWeight: 600 }}>
          <span style={{ display: "inline-block", width: 9, height: 9, border: `2px solid ${RECO_STYLE.recommended.stroke}`, backgroundColor: `${RECO_STYLE.recommended.fill}1F`, marginRight: 3, verticalAlign: "middle" }} />
          {RECO_STYLE.recommended.icon} {t("Zone recommandée pour l'installation", "Recommended installation area")} ({recoCount.recommended})
        </span>
      )}
      {recoCount.excluded > 0 && (
        <span style={{ color: RECO_STYLE.excluded.stroke, fontWeight: 600 }}>
          <span style={{ display: "inline-block", width: 9, height: 9, border: `2px solid ${RECO_STYLE.excluded.stroke}`, backgroundColor: `${RECO_STYLE.excluded.fill}1F`, marginRight: 3, verticalAlign: "middle" }} />
          {RECO_STYLE.excluded.icon} {t("Zone exclue — ne pas installer", "Excluded area — do not install")} ({recoCount.excluded})
        </span>
      )}
    </p>
  );
};

type Row = [string, string] | null;

const PdfSubmissionDocument = forwardRef<HTMLDivElement, Props>(
  ({ form, salesName, nowStr, lang, mapPreviewMode = "placeholder", apiKey, attachments = [] }, ref) => {
    const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
    const getSegLabel = (type: string) => segmentTypeLabel(type, lang);
    const locale = lang === "fr" ? "fr-FR" : "en-GB";

    // Resolve a zone id to its human name (map areas + PDF zones), so the PDF
    // shows "Parking nord" instead of a raw UUID.
    const zoneNameById: Record<string, string> = {};
    form.areas.forEach((a) => { zoneNameById[a.id] = a.name || `Zone ${a.id.slice(0, 6)}`; });
    form.pdfPlan.zones.forEach((z) => { zoneNameById[z.id] = z.name || `Zone ${z.id.slice(0, 6)}`; });

    const hasGeometry = form.areas.length > 0 || form.pdfPlan.zones.length > 0 || (form.lampposts?.length ?? 0) > 0;

    // Shared row table: null rows (empty optional data) are dropped entirely.
    const RowTable = ({ rows }: { rows: Row[] }) => {
      const kept = rows.filter((r): r is [string, string] => !!r && !!r[1] && r[1] !== "—");
      if (kept.length === 0) return null;
      return (
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            {kept.map(([label, val], i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "4px 8px", fontWeight: 600, width: "40%" }}>{label}</td>
                <td style={{ padding: "4px 8px" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    };

    const H2 = ({ children }: { children: React.ReactNode }) => (
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, borderBottom: "1px solid #e5e7eb", paddingBottom: 4 }}>
        {children}
      </h2>
    );

    // Product family/model for the active mode. Road-builder mode: family lives
    // on the road layout's Luminaire; zone mode: on the form itself. Legacy
    // single-field ids resolve through migrateLegacyProduct for BOTH levels.
    const formPair = form.productFamily
      ? { family: form.productFamily, product: form.product }
      : migrateLegacyProduct(form.product);
    const activeFamily = form.projectType === "road"
      ? migrateLegacyLuminaireFamily(form.roadLighting.luminaire)
      : formPair.family;
    const activeProduct = productDisplay(activeFamily, formPair.product, form.productModelPending, lang);

    const deadlineText = (() => {
      if (form.deadlinePriority === "none") return l("Pas d'échéance fixe", "No fixed deadline");
      const date = form.deadlineDate
        ? new Date(`${form.deadlineDate}T00:00:00`).toLocaleDateString(locale, { dateStyle: "long" })
        : "";
      const prio = form.deadlinePriority === "urgent" ? ` — ${l("URGENT", "URGENT")}` : "";
      return date ? `${date}${prio} (${l("date cible souhaitée, non contractuelle", "requested target date, not a confirmed delivery date")})` : "";
    })();

    return (
      <div ref={ref} style={{ width: 794, fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, lineHeight: 1.6, padding: 40, backgroundColor: "#fff", color: "#111", overflowWrap: "anywhere", wordBreak: "break-word" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #111", paddingBottom: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>
            {l("DEMANDE D'ÉTUDE D'ÉCLAIRAGE", "LIGHTING STUDY REQUEST")}
          </h1>
          <span style={{ fontSize: 20, fontWeight: 800 }}>SOLUX</span>
        </div>

        {/* General Info */}
        <section style={{ marginBottom: 20 }}>
          <H2>{l("Informations générales", "General Information")}</H2>
          <RowTable rows={[
            [l("Nom du projet", "Project Name"), form.projectName],
            [l("Client", "Client"), form.clientName],
            [l("Localité", "Locality"), form.locality],
            [l("Pays", "Country"), form.country],
            [l("Adresse", "Address"), form.address],
            form.location ? [l("GPS", "GPS"), `${form.location.lat.toFixed(6)}, ${form.location.lng.toFixed(6)}`] : null,
            [l("Type de projet", "Project Type"), form.projectType === "zone" ? l("Éclairage de zone", "Area Lighting") : l("Éclairage routier", "Road & Street Lighting")],
          ]} />
        </section>

        {/* Worst-case sizing references (winter solstice) */}
        {form.duskHHMM && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Références de dimensionnement (solstice d'hiver)", "Sizing References (Winter Solstice)")}</H2>
            <RowTable rows={[
              [l("Nuit la plus longue", "Longest night"), `${form.longestNightH || form.lightingNightHours} h`],
              [l("Coucher du soleil", "Sunset"), `${form.duskHHMM} (${form.duskBasis === "legal" ? l("heure légale", "legal time") : l("heure solaire", "solar time")})`],
            ]} />
          </section>
        )}

        {/* Map preview (zone + map mode) — main frame + every additional
            frame the user added for far-apart areas (feedback #5). */}
        {form.projectType === "zone" && form.locationMode === "map" && form.location && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Carte du projet", "Project Map")}</H2>
            {apiKey ? (
              <div data-map-preview>
                <ProjectLiveMapPreview
                  apiKey={apiKey}
                  location={form.location}
                  areas={form.areas}
                  lampposts={form.lampposts}
                  recoZones={form.mapRecoZones}
                  zoom={form.mapZoom}
                  center={form.mapCenter}
                  lang={lang}
                />
                {(form.extraMapFrames || []).map((frame, i) => (
                  <div key={frame.id} style={{ marginTop: 10 }}>
                    <ProjectLiveMapPreview
                      apiKey={apiKey}
                      location={form.location!}
                      areas={form.areas}
                      lampposts={form.lampposts}
                      recoZones={form.mapRecoZones}
                      zoom={frame.zoom ?? form.mapZoom}
                      center={frame.center ?? form.mapCenter}
                      lang={lang}
                      title={`${l("Vue supplémentaire", "Additional view")} ${i + 2}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#999", fontStyle: "italic" }}>{l("Carte non disponible", "Map not available")}</p>
            )}
            {/* Lamppost identification legend (feedback #4) */}
            {form.lampposts.length > 0 && (
              <p style={{ fontSize: 10, marginTop: 6 }}>
                {form.lampposts.map((lp, i) => {
                  const identity = lamppostDisplay(lp, i);
                  return (
                    <span key={lp.id} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, backgroundColor: identity.color, marginRight: 3, verticalAlign: "middle" }} />
                      <strong>{identity.label}</strong> ({lp.type === "double" ? l("double", "double") : l("simple", "single")})
                    </span>
                  );
                })}
              </p>
            )}
            <RecoLegend recoCount={{
              recommended: form.mapRecoZones.filter((z) => z.kind === "recommended").length,
              excluded: form.mapRecoZones.filter((z) => z.kind === "excluded").length,
            }} lang={lang} />
            {form.planNotes && (
              <div style={{ marginTop: 8, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 4, backgroundColor: "#f9fafb" }}>
                <p style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{l("Commentaires sur le plan", "Plan comments")}</p>
                <p style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{form.planNotes}</p>
              </div>
            )}
          </section>
        )}

        {/* Google Earth — only promise a KML when geometry actually exists. */}
        {form.projectType === "zone" && form.location && (
          <section style={{ marginBottom: 20 }}>
            <H2>Google Earth</H2>
            <p style={{ fontSize: 11, marginBottom: 4 }} data-pdf-link={earthWebUrl(form.location.lat, form.location.lng)}>
              <span style={{ color: "#2563eb", textDecoration: "underline" }}>{earthWebUrl(form.location.lat, form.location.lng)}</span>
            </p>
            {hasGeometry ? (
              <p style={{ fontSize: 10, color: "#666" }}>
                {l(
                  "Le fichier KML (zones + lampadaires) exporté depuis l'application accompagne cette demande — ouvrez-le dans Google Earth pour retrouver la géométrie exacte.",
                  "The KML file (zones + lamp posts) exported from the app accompanies this request — open it in Google Earth to recover the exact geometry.",
                )}
              </p>
            ) : (
              <p style={{ fontSize: 10, color: "#666" }}>
                {l(
                  "Aucune géométrie d'étude n'a été dessinée — aucun fichier KML n'est disponible pour cette demande.",
                  "No study geometry was drawn — no KML file is available for this request.",
                )}
              </p>
            )}
          </section>
        )}

        {/* Plan preview (PDF/image) or stored CAD reference. The preview is
            captured from the user's EXACT last framing (feedback #8), and any
            extra saved views follow it (feedback #5). */}
        {form.projectType === "zone" && form.locationMode === "pdf" && form.pdfPlan.previewImage && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Plan du projet", "Project Plan")}</H2>
            <img src={form.pdfPlan.previewImage} alt="Plan" style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4 }} />
            {(form.pdfPlan.extraFrames || []).map((f, i) => (
              <div key={f.id} style={{ marginTop: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{l("Vue supplémentaire", "Additional view")} {i + 2}</p>
                <img src={f.image} alt={`Plan view ${i + 2}`} style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4 }} />
              </div>
            ))}
            {(form.pdfPlan.lampposts || []).length > 0 && (
              <p style={{ fontSize: 10, marginTop: 6 }}>
                {(form.pdfPlan.lampposts || []).map((lp, i) => {
                  const identity = lamppostDisplay(lp, i);
                  return (
                    <span key={lp.id} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, backgroundColor: identity.color, marginRight: 3, verticalAlign: "middle" }} />
                      <strong>{identity.label}</strong> ({lp.type === "double" ? l("double", "double") : l("simple", "single")})
                    </span>
                  );
                })}
              </p>
            )}
            <RecoLegend recoCount={{
              recommended: (form.pdfPlan.recoZones || []).filter((z) => z.kind === "recommended").length,
              excluded: (form.pdfPlan.recoZones || []).filter((z) => z.kind === "excluded").length,
            }} lang={lang} />
            {form.planNotes && (
              <div style={{ marginTop: 8, padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 4, backgroundColor: "#f9fafb" }}>
                <p style={{ fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{l("Commentaires sur le plan", "Plan comments")}</p>
                <p style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{form.planNotes}</p>
              </div>
            )}
          </section>
        )}
        {form.projectType === "zone" && form.locationMode === "pdf" && !form.pdfPlan.previewImage && (form.pdfPlan.sourceKind === "dwg" || form.pdfPlan.sourceKind === "dxf") && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Plan du projet", "Project Plan")}</H2>
            <p style={{ fontSize: 11 }}>
              {l("Fichier CAO joint", "CAD file attached")}: <strong>{form.pdfPlan.sourceFileName}</strong> ({(form.pdfPlan.sourceKind || "").toUpperCase()}) — {l("aperçu non disponible dans ce document", "preview not available in this document")}
            </p>
          </section>
        )}

        {/* Zone Lighting Levels — one table per aspect. When no zone exists, the
            typed global levels are printed HONESTLY as project-level targets
            (never as a fabricated "Zone" row); if nothing was typed either,
            the section is omitted entirely. */}
        {form.projectType === "zone" && (() => {
          const th = { padding: "4px 6px", fontWeight: 700 } as const;
          const td = { padding: "4px 6px" } as const;
          const headRow = { borderBottom: "1.5px solid #111", backgroundColor: "#f9fafb" } as const;
          const entries = Object.entries(form.zoneLightingData);
          const hasTypedLevels = !!(form.avgLux || form.minLux || form.uniformity || form.product || form.productFamily);
          const rows = entries.length > 0
            ? entries.map(([zoneId, zd]) => ({ id: zoneId, name: zoneNameById[zoneId] || zoneId, zd }))
            : hasTypedLevels
              ? [{
                  id: "project",
                  name: l("Projet (aucune zone dessinée)", "Project (no zone drawn)"),
                  zd: {
                    avgLux: form.avgLux, uniformity: form.uniformity, minLux: form.minLux, cct: form.cct,
                    lightingSegments: form.lightingSegments, lightingNightHours: form.lightingNightHours,
                    morningTimeH: form.morningTimeH, morningIntensityPct: form.morningIntensityPct,
                    productFamily: form.productFamily, productModelPending: form.productModelPending,
                    product: form.product, luminaireHeight: form.luminaireHeight, spacing: form.spacing,
                    optimizeHeight: form.optimizeHeight, optimizeSpacing: form.optimizeSpacing,
                    batteryChoice: form.batteryChoice, batteryWh: form.batteryWh,
                    panelChoice: form.panelChoice, panelWp: form.panelWp,
                    alternativeAccepted: form.alternativeAccepted, alternativeDetails: form.alternativeDetails,
                  },
                }]
              : [];
          if (rows.length === 0) return null;
          return (
            <section style={{ marginBottom: 20 }}>
              <H2>{l("Niveaux d'éclairage demandés", "Requested Lighting Levels")}</H2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 8 }}>
                <tbody>
                  <tr style={headRow}>
                    {[l("Zone", "Zone"), l("Lux moy", "Avg Lux"), l("Lux min", "Min Lux"), l("Uniformité", "Uniformity"), "CCT", l("Nuit", "Night"), l("Matin", "Morning")].map((h, i) => (
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
                    {[l("Zone", "Zone"), l("Famille de produit", "Product family"), l("Modèle", "Model"), l("Hauteur", "Height"), l("Espacement", "Spacing"), l("Batterie", "Battery"), l("Panneau", "Panel")].map((h, i) => (
                      <td key={i} style={th}>{h}</td>
                    ))}
                  </tr>
                  {rows.map((r) => {
                    const pair = r.zd.productFamily
                      ? { family: r.zd.productFamily, product: r.zd.product }
                      : migrateLegacyProduct(r.zd.product);
                    const disp = productDisplay(pair.family, pair.product, r.zd.productModelPending ?? false, lang);
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                        <td style={td}>{disp.family}</td>
                        <td style={td}>{disp.model}</td>
                        <td style={td}>{formatHeight(r.zd.luminaireHeight, lang)}</td>
                        <td style={td}>{r.zd.spacing ? `${r.zd.spacing} m` : "—"}</td>
                        <td style={td}>{r.zd.batteryChoice === "custom" ? `${r.zd.batteryWh || "?"} Wh` : "Standard"}</td>
                        <td style={td}>{r.zd.panelChoice === "custom" ? `${r.zd.panelWp || "?"} Wp` : "Standard"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.some((r) => r.zd.alternativeAccepted) && (
                <p style={{ fontSize: 10, marginBottom: 6 }}>
                  <strong>{l("Solutions alternatives acceptées", "Alternative solutions accepted")}</strong>
                  {rows.filter((r) => r.zd.alternativeAccepted && r.zd.alternativeDetails).map((r) => ` — ${r.name}: ${r.zd.alternativeDetails}`).join("")}
                </p>
              )}
              {rows.filter((r) => r.zd.lightingSegments && r.zd.lightingSegments.length > 0).map((r) => (
                <p key={r.id} style={{ fontSize: 10, marginTop: 2 }}>
                  <strong>{r.name}</strong> — {programSummary({
                    nightHours: r.zd.lightingNightHours,
                    morningTimeH: r.zd.morningTimeH,
                    morningIntensityPct: r.zd.morningIntensityPct,
                    segments: r.zd.lightingSegments,
                  }, lang)}
                </p>
              ))}
            </section>
          );
        })()}

        {/* Road Profile */}
        {form.projectType === "road" && form.roadInputMode === "builder" && form.roadProfile.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Profil routier", "Road Profile")}</H2>
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
            <H2>{l("Configuration éclairage routier", "Road Lighting Configuration")}</H2>
            {/* Geometry/arrangement only — the product family & model print once,
                in the Product section below. */}
            <RowTable rows={[
              [l("Disposition", "Arrangement"), ARRANGEMENT_LABELS[form.roadLighting.arrangement] ? ARRANGEMENT_LABELS[form.roadLighting.arrangement][lang] : form.roadLighting.arrangement],
              [l("Hauteur du mât", "Pole Height"),
                form.roadLighting.pole_height_mode === "range"
                  ? `${form.roadLighting.pole_height_min ?? "—"}–${form.roadLighting.pole_height_max ?? "—"} m (${l("plage — le Study Lab choisit la hauteur optimale", "range — Study Lab picks the best height")})`
                  : `${form.roadLighting.pole_height} m`],
              [l("Longueur du bras", "Arm Length"), `${form.roadLighting.arm_length} m`],
              [l("Espacement", "Spacing"), `${form.roadLighting.spacing} m`],
              [l("Inclinaison", "Tilt"), `${form.roadLighting.tilt}°`],
              [l("Orientation", "Orientation"), ORIENTATION_LABELS[form.roadLighting.orientation] ? ORIENTATION_LABELS[form.roadLighting.orientation][lang] : form.roadLighting.orientation],
              [l("Puissance", "Power"), form.roadLighting.power_mode === "manual" ? (form.roadLighting.power_w ? `${form.roadLighting.power_w} W` : "") : "Auto"],
              [l("Optimisations", "Optimizations"), [
                form.roadLighting.optimize_pole_height && l("hauteur", "pole height"),
                form.roadLighting.optimize_arm_length && l("bras", "arm"),
                form.roadLighting.optimize_spacing && l("espacement", "spacing"),
              ].filter(Boolean).join(", ") || l("Aucune", "None")],
            ]} />
          </section>
        )}

        {/* Per-Segment Lighting Levels (road) */}
        {form.projectType === "road" && form.roadInputMode === "builder" && Object.keys(form.roadSegmentLighting).length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}</H2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {[l("Segment", "Segment"), l("Lux moyen", "Avg Lux"), l("Uniformité", "Uniformity"), l("Lux min", "Min Lux"), "CCT"].map((h, i) => (
                    <td key={i} style={{ padding: "4px 8px", fontWeight: 700 }}>{h}</td>
                  ))}
                </tr>
                {form.roadProfile.filter((seg) => form.roadSegmentLighting[seg.id]).map((seg) => {
                  const lvl = form.roadSegmentLighting[seg.id];
                  return (
                    <tr key={seg.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 8px", fontWeight: 600 }}>{getSegLabel(seg.type)} · {seg.width}m</td>
                      <td style={{ padding: "4px 8px" }}>{lvl.avgLux || "—"}</td>
                      <td style={{ padding: "4px 8px" }}>{lvl.uniformity || "—"}</td>
                      <td style={{ padding: "4px 8px" }}>{lvl.minLux || "—"}</td>
                      <td style={{ padding: "4px 8px" }}>{lvl.cct || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Work From PDF Profile — customer-supplied documents + requested levels */}
        {form.projectType === "road" && form.roadInputMode === "pdf_profile" && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Profils fournis par le client", "Customer-Provided Profiles")}</H2>
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
                    const kindName = (kind: string) => profileKindLabel(kind, lang);
                    const p = doc.config.program;
                    return (
                      <tr key={doc.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px 6px", fontWeight: 600 }}>{doc.profileName || `${l("Profil", "Profile")} ${di + 1}`}</td>
                        <td style={{ padding: "4px 6px" }}>{doc.segments.map((s) => s.label || kindName(s.kind)).join(" + ") || "—"}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {doc.config.recommendProduct
                            ? l("Recommandation Study Lab", "Study Lab recommendation")
                            : [doc.config.family, doc.config.product].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={{ padding: "4px 6px" }}>{doc.config.optimize?.height ? l("À optimiser", "Optimize") : formatHeight(doc.config.height, lang)}</td>
                        <td style={{ padding: "4px 6px" }}>{p.nightHours}h · {p.segments.length} {l("périodes", "periods")}{p.morningTimeH > 0 ? ` · ${l("matin", "morning")} ${p.morningTimeH}h` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {form.roadDocuments.length === 0 ? (
              <p style={{ color: "#999", fontStyle: "italic" }}>{l("Aucun document fourni", "No documents provided")}</p>
            ) : form.roadDocuments.map((doc, di) => {
              const segKindName = (kind: string) => profileKindLabel(kind, lang);
              const cfg = doc.config;
              return (
                <div key={doc.id} style={{ marginBottom: 20, padding: 10, border: "1px solid #e5e7eb", borderRadius: 4, pageBreakInside: "avoid" }}>
                  {/* Profile header */}
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                    {l("Profil", "Profile")} {di + 1} — {doc.profileName || doc.fileName}
                  </p>
                  <p style={{ fontSize: 10, color: "#666", marginBottom: 8 }}>
                    {doc.fileName} · {doc.kind.toUpperCase()} · {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString(locale) : "—"}
                  </p>

                  {/* Profile configuration — one compact line-table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8, fontSize: 11 }}>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "3px 6px", fontWeight: 600, width: "25%" }}>{l("Produit demandé", "Requested Product")}</td>
                        {/* No optic — optics are chosen by the Study Lab during optimisation. */}
                        <td style={{ padding: "3px 6px" }}>
                          {cfg.recommendProduct
                            ? l("Le Study Lab recommandera la meilleure solution", "Study Lab will recommend the best solution")
                            : [cfg.family, cfg.product].filter(Boolean).join(" / ") || "—"}
                        </td>
                        <td style={{ padding: "3px 6px", fontWeight: 600 }}>CCT</td>
                        <td style={{ padding: "3px 6px" }}>{cfg.cct || "—"}</td>
                      </tr>
                      {(() => {
                        // Per-parameter: manual constraint or Study Lab optimisation.
                        const OPT = l("À optimiser (Study Lab)", "Optimize (Study Lab)");
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
                              <td style={{ padding: "3px 6px" }}>{o?.arrangement ? OPT : (cfg.arrangement && ARRANGEMENT_LABELS[cfg.arrangement] ? ARRANGEMENT_LABELS[cfg.arrangement][lang] : cfg.arrangement) || "—"}</td>
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
                        <td style={{ padding: "3px 6px" }} colSpan={3}>{programSummary(cfg.program, lang)}</td>
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
                    <p style={{ fontSize: 10, marginTop: 6 }}>{l("Notes du profil", "Profile notes")}: {doc.notes}</p>
                  )}

                  {doc.annotation.previewImage && (
                    <img src={doc.annotation.previewImage} alt={doc.profileName} style={{ maxWidth: "100%", border: "1px solid #e5e7eb", borderRadius: 4, marginTop: 8 }} />
                  )}
                  {!doc.annotation.previewImage && (doc.kind === "dwg" || doc.kind === "dxf") && (
                    <p style={{ fontSize: 10, marginTop: 6 }}>{l("Fichier CAO joint", "CAD file attached")}: <strong>{doc.fileName}</strong></p>
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

        {/* Lighting Programming — road-builder mode only; zone mode prints the
            program per zone above; the profile workflow prints per profile. */}
        {form.projectType === "road" && form.roadInputMode === "builder" && form.lightingSegments.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Programmation d'éclairage", "Lighting Programming")}</H2>
            <p style={{ fontSize: 11, marginBottom: 8 }}>{l("Durée de nuit", "Night Duration")}: {form.lightingNightHours}h</p>
            <div style={{ display: "flex", height: 30, borderRadius: 6, overflow: "hidden", border: "1px solid #e5e7eb", marginBottom: 8 }}>
              {form.lightingSegments.map((seg) => (
                <div key={seg.id} style={{
                  width: `${(seg.hours / form.lightingNightHours) * 100}%`,
                  backgroundColor: segmentColor(seg),
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
                {l("Période", "Period")} {i + 1}: {periodText(seg, lang)}
              </p>
            ))}
            {form.morningTimeH > 0 && (
              <p style={{ fontSize: 11, marginTop: 4, color: "#92400e" }}>
                {l("Période du matin", "Morning period")}: {form.morningTimeH}h @ {form.morningIntensityPct}% — {l("toujours la dernière période, se termine au lever du soleil", "always the final period, ends at sunrise")}
              </p>
            )}
          </section>
        )}

        {/* Product — road-builder mode only. Zone mode already lists the product
            per zone in the Requested Lighting Levels section (no duplication);
            the family/model distinction is preserved. */}
        {form.projectType === "road" && form.roadInputMode === "builder" && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Produit", "Product")}</H2>
            <RowTable rows={[
              [l("Famille de produit", "Product family"), activeProduct.family],
              [l("Modèle de produit", "Product model"), activeProduct.model],
              form.luminaireHeight ? [l("Hauteur luminaire", "Luminaire Height"), formatHeight(form.luminaireHeight, lang)] : null,
              form.spacing ? [l("Espacement", "Spacing"), `${form.spacing} m`] : null,
              [l("Batterie", "Battery"), form.batteryChoice === "custom" ? `${l("Personnalisée", "Custom")}: ${form.batteryWh || "?"} Wh` : "Standard"],
              [l("Panneau", "Panel"), form.panelChoice === "custom" ? `${l("Personnalisé", "Custom")}: ${form.panelWp || "?"} Wp` : "Standard"],
              form.alternativeAccepted ? [l("Alternatives", "Alternatives"), form.alternativeDetails || l("Acceptées", "Accepted")] : null,
            ]} />
          </section>
        )}

        {/* Multi-Product */}
        {form.projectType === "zone" && form.multiProduct && form.productAssignments.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Assignations multi-produits", "Multi-Product Assignments")}</H2>
            {form.productAssignments.map((a, i) => {
              const disp = productDisplay(a.family || migrateLegacyProduct(a.product).family, a.product, false, lang);
              return (
                <div key={a.id} style={{ marginBottom: 8, padding: 8, border: "1px solid #e5e7eb", borderRadius: 4 }}>
                  <p><strong>{a.zone || `Zone ${i + 1}`}</strong> → {disp.family}{disp.model !== "—" ? ` / ${disp.model}` : ""}</p>
                  {a.avgLux && <p>{l("Lux moyen", "Avg Lux")}: {a.avgLux}</p>}
                  {a.uniformity && <p>{l("Uniformité", "Uniformity")}: {a.uniformity}</p>}
                  {a.minLux && <p>{l("Lux min", "Min Lux")}: {a.minLux}</p>}
                  {a.cct && <p>CCT: {String(a.cct).replace(/k$/i, "")}K</p>}
                  {(a.luminaireHeight || a.spacing) && <p>{l("Hauteur", "Height")}: {a.luminaireHeight || "—"}m · {l("Espacement", "Spacing")}: {a.spacing || "—"}m</p>}
                  {a.presenceDetection && <p>{l("Détection de présence", "Presence Detection")}: {l("Oui", "Yes")}{a.detectionCount ? ` (${a.detectionCount}${a.detectionDuration ? `, ${a.detectionDuration}` : ""})` : ""}</p>}
                  {a.scenarioText && <p>{l("Notes de scénario", "Scenario notes")}: {a.scenarioText}</p>}
                </div>
              );
            })}
          </section>
        )}

        {/* Technical Notes */}
        {form.technicalNotes && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Notes pour le Study Lab", "Notes for the Study Lab")}</H2>
            <p style={{ whiteSpace: "pre-wrap" }}>{form.technicalNotes}</p>
          </section>
        )}

        {/* Attachments — the files travel WITH the request, this lists them so
            the Study Lab knows what to expect. */}
        {attachments.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <H2>{l("Pièces jointes", "Attached Documents")}</H2>
            <ul style={{ paddingLeft: 18, fontSize: 11 }}>
              {attachments.map((f, i) => (
                <li key={i}>{f.name} ({formatFileSize(f.size)})</li>
              ))}
            </ul>
            <p style={{ fontSize: 10, color: "#666" }}>
              {l("Fichiers transmis avec la demande, séparément de ce document.", "Files sent alongside this request, separately from this document.")}
            </p>
          </section>
        )}

        {/* Contact & Deadline */}
        <section style={{ marginBottom: 20 }}>
          <H2>{l("Contact & échéance", "Contact & Deadline")}</H2>
          <RowTable rows={[
            salesName ? [l("Demande préparée par", "Request prepared by"), salesName] : null,
            form.contactEmail ? [l("Email de contact", "Contact email"), form.contactEmail] : null,
            form.contactPhone ? [l("Téléphone", "Telephone"), form.contactPhone] : null,
            [l("Date de la demande", "Request date"), nowStr],
            deadlineText ? [l("Date de rendu souhaitée", "Requested completion date"), deadlineText] : null,
          ]} />
        </section>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, textAlign: "center", fontSize: 10, color: "#999" }}>
          {l("Document généré par l'application Solux", "Document generated by the Solux application")} — {nowStr}
        </div>
      </div>
    );
  }
);

PdfSubmissionDocument.displayName = "PdfSubmissionDocument";

export default PdfSubmissionDocument;
