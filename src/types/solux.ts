import { uid } from "@/lib/utils";

export type MapArea = {
  id: string;
  type: "polygon" | "rectangle";
  paths: { lat: number; lng: number }[];
  color: string;
  name?: string;
};

export type MapLamppost = {
  id: string;
  lat: number;
  lng: number;
  type: "single" | "double";
  rotation?: number;
  // Identification (Study Lab feedback #4): every lamppost gets its own
  // colour and a visible short label ("L1", "L2"…) so sales and the Study
  // Lab can unambiguously refer to a specific pole.
  color?: string;
  label?: string;
};

// DEPRECATED — the Line tool was replaced by Recommendation Zones after Study
// Lab testing. The type is kept only so drafts saved during the short-lived
// Line era still parse; nothing creates or renders lines any more.
export type MapLine = {
  id: string;
  path: { lat: number; lng: number }[];
  color: string;
};

// Recommendation zone (replaces the Line tool): a rectangle the salesperson
// draws to tell the Study Lab where lampposts SHOULD go (recommended) or must
// NOT go (excluded). Self-explanatory on sight — green ✓ vs red ⛔.
export type RecoKind = "recommended" | "excluded";

export type MapRecoZone = {
  id: string;
  kind: RecoKind;
  bounds: { north: number; south: number; east: number; west: number };
};

// Same concept on an uploaded plan — normalised (0–1) rectangle, per page.
export type PdfRecoZone = {
  id: string;
  kind: RecoKind;
  x: number; // top-left
  y: number;
  w: number;
  h: number;
  page: number;
};

// Shared styling for recommendation zones (map, plan canvas and PDF legend).
// Reco zones must be UNMISTAKABLY different from calculation zones (feedback
// #3): calc zones = solid ~30% coloured fill with a thin outline; reco zones =
// thick outline + near-transparent fill + a corner ✓/⛔ badge (and diagonal
// hatching on the plan canvas), so the two can never be confused on a busy map.
export const RECO_STYLE: Record<RecoKind, { stroke: string; fill: string; icon: string; labelFr: string; labelEn: string }> = {
  recommended: { stroke: "#15803d", fill: "#22c55e", icon: "✓", labelFr: "Zone recommandée", labelEn: "Recommended area" },
  excluded: { stroke: "#b91c1c", fill: "#ef4444", icon: "⛔", labelFr: "Zone exclue", labelEn: "Excluded area" },
};

// Google Maps RectangleF options for a reco zone — thick hollow box, distinct
// from a calc polygon's thin outline + solid fill.
export const recoMapRectOptions = (kind: RecoKind, selected = false, clickable = false) => {
  const s = RECO_STYLE[kind];
  return {
    strokeColor: s.stroke,
    strokeWeight: selected ? 5 : 4,
    strokeOpacity: 1,
    fillColor: s.fill,
    fillOpacity: 0.06,
    clickable,
    zIndex: 6,
  } as google.maps.RectangleOptions;
};

// The ✓/⛔ badge sits in the top-left corner of the rectangle, not the centre,
// so it never hides what's inside and reads as an annotation marker.
export const recoBadgePosition = (bounds: MapRecoZone["bounds"]) => ({
  lat: bounds.north,
  lng: bounds.west,
});

// An extra, independent viewport onto the same study map (feedback #5) —
// lets distant zones each get a readable frame in the app and the PDF.
export type MapFrame = {
  id: string;
  center: { lat: number; lng: number } | null;
  zoom: number | null;
};

// Distinct colours cycled over lampposts for easy identification.
export const LAMPPOST_COLORS = ["#f59e0b", "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0891b2", "#ea580c", "#db2777"];

// Colour + label for a lamppost, with stable fallbacks for poles created
// before identification existed (colour cycles, label = index order).
export const lamppostDisplay = (lp: { color?: string; label?: string }, index: number) => ({
  color: lp.color || LAMPPOST_COLORS[index % LAMPPOST_COLORS.length],
  label: lp.label || `L${index + 1}`,
});

export type MapValue = {
  address: string;
  location?: { lat: number; lng: number };
  areas: MapArea[];
  lampposts?: MapLamppost[];
};

export type PdfZone = {
  id: string;
  paths: { x: number; y: number }[];
  color: string;
  name?: string;
  page: number;
};

export type PdfLamppost = {
  id: string;
  x: number;
  y: number;
  page: number;
  type: "single" | "double";
  rotation?: number;
  // Identification (Study Lab feedback #4) — same scheme as MapLamppost.
  color?: string;
  label?: string;
};

// DEPRECATED — see MapLine: kept only for old-draft compatibility.
export type PdfLine = {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  page: number;
};

export type PdfZoneValue = {
  pdfUrl: string;
  // What `pdfUrl` points at. Defaults to "pdf" when omitted so existing Area
  // Lighting plans keep their exact behaviour. "image" renders a raster (PNG/JPG,
  // or a generated preview of a CAD file) with the identical annotation tooling.
  mediaType?: "pdf" | "image";
  zones: PdfZone[];
  lampposts?: PdfLamppost[];
  /** DEPRECATED — replaced by recoZones; kept for old-draft compatibility. */
  lines?: PdfLine[];
  recoZones?: PdfRecoZone[];
  previewImage?: string;
  // Extra saved views of the same plan (feedback #5): each is a snapshot of
  // the user's framing at capture time, appended to the exported PDF so far
  // apart areas each stay readable.
  extraFrames?: { id: string; image: string }[];
  // Original upload metadata. CAD files (dwg/dxf) cannot be previewed in the
  // browser yet: pdfUrl stays empty, only these fields are set, and the UI
  // shows a stored-file placeholder instead of the annotation canvas.
  sourceKind?: ProjectDocumentKind;
  sourceFileName?: string;
  // Permanent storage URL of the original file, set at submit time (C4).
  fileUrl?: string;
  viewState?: {
    page: number;
    zoom: number;
    rotation: number;
    scrollLeft?: number;
    scrollTop?: number;
  };
};

export type RoadSegment = {
  id: string;
  type: "lane" | "sidewalk" | "median" | "bike_lane" | "shoulder" | "parking";
  width: number;
  direction?: "forward" | "backward" | "both";
  priority?: string;
};

export type RoadProfile = RoadSegment[];

// --- Work From PDF Profile (generic Project Documents module) ---
// Instead of rebuilding the road geometry, the sales rep uploads the customer's
// road-profile document(s) and only specifies the requested lighting levels.

export type ProjectDocumentKind = "pdf" | "image" | "dwg" | "dxf";

// Product catalogue: family (= product RANGE, the parent) → models (children).
// The model select only offers models of the selected family. The team will
// populate the real database later — these entries are placeholders that pin
// the parent→child architecture; edit this single map to update the catalogue.
export const PRODUCT_FAMILIES: Record<string, string[]> = {
  "SSLX Performance": ["SSLX Performance 40", "SSLX Performance 60", "SSLX Performance 80"],
  "SSLX Pro": ["SSLX Pro 40", "SSLX Pro 60", "SSLX Pro 80"],
  "AOS Performance": ["AOS Performance"],
  "AOS Pro+": ["AOS Pro+"],
  COLARSUN: ["COLARSUN"],
  "KONOS+": ["KONOS+"],
  TOTEM: ["TOTEM", "TOTEM +"],
  Relight: ["Relight"],
};

export const familyForProduct = (product: string): string =>
  Object.keys(PRODUCT_FAMILIES).find((f) => PRODUCT_FAMILIES[f].includes(product)) || "";

// --- Product hierarchy (final product decision) ---
// Two levels everywhere: PRODUCT FAMILY (range) → PRODUCT MODEL (exact power
// configuration inside the family). The model may be left to the Study Lab
// ("model pending"). Legacy single-field ids from older drafts are migrated
// through migrateLegacyProduct below.
const LEGACY_PRODUCT_MAP: Record<string, { family: string; product: string }> = {
  SSLXPRO: { family: "SSLX Pro", product: "" },
  SSLXPERFORMANCE: { family: "SSLX Performance", product: "" },
  AOSPRO: { family: "AOS Pro+", product: "AOS Pro+" },
  "AOS PERFORMANCE": { family: "AOS Performance", product: "AOS Performance" },
  COLARSUN: { family: "COLARSUN", product: "COLARSUN" },
  "KONOS+": { family: "KONOS+", product: "KONOS+" },
  TOTEM: { family: "TOTEM", product: "TOTEM" },
  "TOTEM +": { family: "TOTEM", product: "TOTEM +" },
  Relight: { family: "Relight", product: "Relight" },
};

// Resolve any stored product value (legacy id, model name, or family name) to
// the family/model pair. Model "" with a family means "model to be defined".
export const migrateLegacyProduct = (v: string): { family: string; product: string } => {
  if (!v) return { family: "", product: "" };
  if (LEGACY_PRODUCT_MAP[v]) return LEGACY_PRODUCT_MAP[v];
  const fam = familyForProduct(v);
  if (fam) return { family: fam, product: v };
  if (PRODUCT_FAMILIES[v]) return { family: v, product: "" };
  return { family: "", product: v };
};

// Same resolution for the road-layout luminaire, which stores the FAMILY level.
export const migrateLegacyLuminaireFamily = (v: string): string => {
  if (!v) return "";
  if (PRODUCT_FAMILIES[v]) return v;
  return migrateLegacyProduct(v).family || v;
};

// One printable string for family + model (+ pending), used by the PDF and
// summaries so the two levels are always labelled unambiguously.
export const productDisplay = (
  family: string,
  model: string,
  modelPending: boolean,
  lang: "fr" | "en",
): { family: string; model: string } => ({
  family: family || "—",
  model: model
    ? model
    : modelPending || family
      ? (lang === "fr" ? "À définir par le Study Lab" : "To be defined by the Study Lab")
      : "—",
});

// EN 13201 road lighting classes (M = motorised, C = conflict, P = pedestrian).
export const ROAD_CLASS_OPTIONS = [
  "M1", "M2", "M3", "M4", "M5", "M6",
  "C0", "C1", "C2", "C3", "C4", "C5",
  "P1", "P2", "P3", "P4", "P5", "P6",
];

// Road segment kinds available inside a lighting profile.
export const PROFILE_SEGMENT_KINDS = [
  { value: "main_road", labelEn: "Main Road", labelFr: "Route principale" },
  { value: "sidewalk", labelEn: "Sidewalk", labelFr: "Trottoir" },
  { value: "bike_lane", labelEn: "Bicycle Lane", labelFr: "Piste cyclable" },
  { value: "median", labelEn: "Median", labelFr: "Terre-plein central" },
  { value: "parking", labelEn: "Parking Area", labelFr: "Stationnement" },
  { value: "crossing", labelEn: "Crossing", labelFr: "Passage piéton" },
  { value: "roundabout", labelEn: "Roundabout", labelFr: "Rond-point" },
  { value: "service_road", labelEn: "Service Road", labelFr: "Voie de service" },
  { value: "other", labelEn: "Other", labelFr: "Autre" },
] as const;

// Q5 — one implementation of the "find the row, pick the fr/en label" lookup
// that was hand-inlined across the intake page, road builder and PDF.
export const segmentTypeLabel = (type: string, lang: "fr" | "en"): string => {
  const t = SEGMENT_TYPES.find((s) => s.value === type);
  return t ? (lang === "fr" ? t.labelFr : t.labelEn) : type;
};
export const profileKindLabel = (kind: string, lang: "fr" | "en"): string => {
  const k = PROFILE_SEGMENT_KINDS.find((s) => s.value === kind);
  return k ? (lang === "fr" ? k.labelFr : k.labelEn) : kind;
};

// A lighting program: night program periods + the fixed Morning Time block.
// Morning Time always ends at sunrise and is always the FINAL operating period,
// whatever the seasonal night length (sunrise − morningTimeH → sunrise).
export type ProfileProgram = {
  nightHours: number;
  morningTimeH: number;
  morningIntensityPct: number;
  segments: LightingSegment[];
};

export const createDefaultProfileProgram = (): ProfileProgram => ({
  nightHours: DEFAULT_LIGHTING_NIGHT_HOURS,
  morningTimeH: 0,
  morningIntensityPct: 100,
  segments: createDefaultLightingSegments(),
});

// Requested product/installation for one uploaded profile. Deliberately NO
// optic here: optics belong to the Study Lab optimisation, the salesperson only
// describes the requested installation.
// Per-parameter flag: true = the Study Lab optimises it freely, false = the
// salesperson imposes a manual constraint. Customers often fix SOME parameters
// (e.g. existing 8 m poles) while leaving the rest fully optimisable.
export type ProfileOptimizeFlags = {
  height: boolean;
  arrangement: boolean;
  spacing: boolean;
  overhang: boolean;
  tilt: boolean;
};

export type ProfileLightingConfig = {
  // Option 1: the salesperson picks family/product below.
  // Option 2: recommendProduct = true → no luminaire chosen; the Study Lab
  // analyses the requirements and recommends the best solution. The future
  // product database plugs into PRODUCT_FAMILIES without changing this shape.
  recommendProduct: boolean;
  family: string;
  product: string;
  // Product-level CCT (per profile) — deliberately NOT per road segment.
  cct: string;
  height: string; // "8" fixed or "5-8" range (see isHeightRange)
  spacing: string; // m
  arrangement: LightingSetup["arrangement"] | "";
  overhang: string; // m (arm length over the road)
  tilt: string; // degrees
  optimize: ProfileOptimizeFlags;
  program: ProfileProgram;
};

export const createDefaultProfileConfig = (): ProfileLightingConfig => ({
  recommendProduct: false,
  family: "",
  product: "",
  cct: "4000K",
  height: "",
  spacing: "",
  arrangement: "",
  overhang: "",
  tilt: "",
  // Everything starts optimisable; the rep switches a field to manual only
  // when the customer imposes that constraint.
  optimize: { height: true, arrangement: true, spacing: true, overhang: true, tilt: true },
  program: createDefaultProfileProgram(),
});

// One road section inside a profile — the CUSTOMER's lighting targets only
// (Step 3 of the workflow). How they are achieved is the Study Lab's job, so
// there are no per-segment product/height/program requests here.
export type ProfileSegment = {
  id: string;
  kind: string;
  label: string; // free label, mainly for kind = "other"
  avgLux: string;
  minLux: string;
  uniformity: string;
  maintenanceFactor: string; // MF — standard design parameter (e.g. 0.80)
  roadClass: string;
  notes: string;
};

export const createDefaultProfileSegment = (kind: string = "main_road"): ProfileSegment => ({
  id: uid(),
  kind,
  label: "",
  avgLux: "",
  minLux: "",
  uniformity: "",
  maintenanceFactor: "",
  roadClass: "",
  notes: "",
});

// A customer-supplied document. PDFs and images annotate through the very same
// component as the Area Lighting workflow (see PdfZoneEditor) via `annotation`.
// CAD files (dwg/dxf) keep an empty annotation until a preview image is
// generated, at which point they annotate exactly like an image.
export type ProjectDocument = {
  id: string;
  // One uploaded drawing can contain SEVERAL cross-sections: every profile
  // created from the same upload shares this group id (and the same file/blob),
  // while keeping fully independent levels/config/program/notes.
  fileGroupId: string;
  profileName: string;
  fileName: string;
  kind: ProjectDocumentKind;
  uploadedAt: string; // ISO timestamp
  annotation: PdfZoneValue;
  // Each profile is a fully independent engineering configuration — nothing is
  // shared between profiles: targets, product request, program and notes.
  config: ProfileLightingConfig;
  segments: ProfileSegment[];
  notes: string;
  // Set at submit time when the original file is uploaded to storage (C4);
  // lets the Study Lab download the customer's actual drawing.
  fileUrl?: string;
};

export const PROJECT_DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.dwg,.dxf";

// Only PDFs and images can be annotated today; CAD files need a generated
// preview first. This is the single source of truth for that capability.
export const isAnnotatableKind = (kind: ProjectDocumentKind) =>
  kind === "pdf" || kind === "image";

export const documentKindFromFile = (file: File): ProjectDocumentKind => {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") return "image";
  if (ext === "dwg") return "dwg";
  if (ext === "dxf") return "dxf";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  return "pdf";
};

export type LightingSetup = {
  arrangement: "single_left" | "single_right" | "both" | "staggered" | "central";
  pole_height: number;
  // Height constraint mode: "fixed" (default when omitted) uses pole_height;
  // "range" transmits pole_height_min–pole_height_max to the Study Lab, which
  // picks the best height inside the range during calculation.
  pole_height_mode?: "fixed" | "range";
  pole_height_min?: number;
  pole_height_max?: number;
  arm_length: number;
  tilt: number;
  spacing: number;
  optimize_pole_height: boolean;
  optimize_arm_length: boolean;
  optimize_spacing: boolean;
  // PRODUCT FAMILY level (the range). The exact model is chosen in the
  // Product Selection section (form.product) or left to the Study Lab.
  luminaire: string;
  power_mode: "auto" | "manual";
  power_w: string;
  orientation: "perpendicular" | "parallel" | "angled";
};

export type LightingSegment = {
  id: string;
  mode: "sensor" | "fixed";
  hours: number;
  min?: number; // sensor: idle power %
  max?: number; // sensor: detection power %
  intensity?: number; // fixed: intensity %
  // Sensor-mode extras for Study Lab energy calculations:
  boostDurationS?: number; // how long the light stays boosted after each detection
  estimatedDetections?: number; // estimated detections during this period
};

export const DEFAULT_LIGHTING_NIGHT_HOURS = 12;

// Controller options for sensor periods (seconds after each detection).
export const BOOST_DURATION_OPTIONS = [10, 20, 30, 40, 50, 60, 90, 120, 180, 300];
// Typical per-period detection-count estimates used for energy sizing.
export const DETECTION_ESTIMATE_OPTIONS = [20, 50, 100, 200, 300, 500, 1000];

export const createDefaultLightingSegments = (): LightingSegment[] => ([
  { id: uid(), mode: "sensor", hours: 4, min: 30, max: 100, boostDurationS: 30, estimatedDetections: 100 },
  { id: uid(), mode: "fixed", hours: 4, intensity: 60 },
  { id: uid(), mode: "fixed", hours: 4, intensity: 100 },
]);

// --- Mounting heights: fixed value or an allowed range ---
// Heights are serialized as strings so existing fields keep their schema:
//   "8"    → fixed 8 m
//   "5-8"  → range 5 to 8 m (Study Lab picks the best height inside it; the
//            sales app never optimises — it only transmits the constraint).
export const isHeightRange = (v: string) => /^\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*$/.test(v);

export const formatHeight = (v: string, lang: "fr" | "en" = "en"): string => {
  if (!v) return "—";
  if (isHeightRange(v)) {
    return `${v.replace(/\s+/g, "").replace("-", "–")} m (${lang === "fr" ? "plage" : "range"})`;
  }
  return `${v} m`;
};

export type ProductAssignment = {
  id: string;
  zone: string;
  family?: string; // product family; `product` below is the model inside it
  product: string;
  avgLux?: string;
  uniformity?: string;
  minLux?: string;
  cct?: string;
  scenarioText?: string;
  presenceDetection?: boolean;
  detectionCount?: string;
  detectionDuration?: string;
  luminaireHeight?: string;
  spacing?: string;
};

// F6 — ONE canonical catalogue for the zone / road-luminaire product picker.
// `id` is the value stored on the form (form.product, zoneLightingData.product,
// productAssignments[].product, roadLighting.luminaire); `label` is the human
// name shown everywhere (the picker AND the PDF), so the submission document can
// never render a raw code or a stale label. (The Work-From-PDF-Profile flow uses
// the family→model catalogue in PRODUCT_FAMILIES.)
export const PRODUCT_CATALOGUE: { id: string; label: string }[] = [
  { id: "SSLXPRO", label: "SOLUX PRO" },
  { id: "SSLXPERFORMANCE", label: "SOLUX PERFORMANCE" },
  { id: "AOSPRO", label: "AOS PRO+" },
  { id: "AOS PERFORMANCE", label: "AOS PERFORMANCE" },
  { id: "COLARSUN", label: "COLARSUN" },
  { id: "KONOS+", label: "KONOS+" },
  { id: "TOTEM", label: "TOTEM" },
  { id: "TOTEM +", label: "TOTEM +" },
  { id: "Relight", label: "Relight" },
];

export const PRODUCT_OPTIONS = PRODUCT_CATALOGUE.map((p) => p.id);

const PRODUCT_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  PRODUCT_CATALOGUE.map((p) => [p.id, p.label]),
);

// Human label for a stored product id; falls back to the id, then a dash.
export const productLabel = (id: string | undefined | null): string =>
  (id && PRODUCT_LABEL_BY_ID[id]) || id || "—";

export const SEGMENT_TYPES = [
  { value: "lane", labelEn: "Traffic Lane", labelFr: "Voie de circulation", defaultWidth: 3.5 },
  { value: "sidewalk", labelEn: "Sidewalk", labelFr: "Trottoir", defaultWidth: 2.0 },
  { value: "median", labelEn: "Median", labelFr: "Terre-plein central", defaultWidth: 1.5 },
  { value: "bike_lane", labelEn: "Bike Lane", labelFr: "Piste cyclable", defaultWidth: 1.5 },
  { value: "shoulder", labelEn: "Shoulder", labelFr: "Accotement", defaultWidth: 1.5 },
  { value: "parking", labelEn: "Parking", labelFr: "Stationnement", defaultWidth: 2.5 },
] as const;

export const SEGMENT_COLORS: Record<string, string> = {
  lane: "hsl(222.2 47.4% 11.2%)",
  sidewalk: "hsl(210 40% 80%)",
  median: "hsl(140 40% 55%)",
  bike_lane: "hsl(140 60% 40%)",
  shoulder: "hsl(30 30% 70%)",
  parking: "hsl(260 30% 65%)",
};

export const COLOR_OPTIONS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#ea580c"];

export const defaultLightingSetup: LightingSetup = {
  arrangement: "staggered",
  pole_height: 8,
  arm_length: 1.5,
  tilt: 0,
  spacing: 25,
  optimize_pole_height: false,
  optimize_arm_length: false,
  optimize_spacing: false,
  luminaire: "SSLX Pro",
  power_mode: "auto",
  power_w: "",
  orientation: "perpendicular",
};

export type ZoneLightingData = {
  avgLux: string;
  uniformity: string;
  minLux: string;
  cct: string;
  lightingSegments: LightingSegment[];
  lightingNightHours: number;
  morningTimeH: number;
  morningIntensityPct: number;
  productFamily: string;
  productModelPending: boolean;
  product: string;
  luminaireHeight: string;
  spacing: string;
  optimizeHeight: boolean;
  optimizeSpacing: boolean;
  batteryChoice: "standard" | "custom";
  batteryWh: string;
  panelChoice: "standard" | "custom";
  panelWp: string;
  alternativeAccepted: boolean;
  alternativeDetails: string;
};

export const createDefaultZoneLightingData = (): ZoneLightingData => ({
  avgLux: "",
  uniformity: "",
  minLux: "",
  cct: "4000K",
  lightingSegments: createDefaultLightingSegments(),
  lightingNightHours: DEFAULT_LIGHTING_NIGHT_HOURS,
  morningTimeH: 0,
  morningIntensityPct: 100,
  productFamily: "",
  productModelPending: false,
  product: "",
  luminaireHeight: "",
  spacing: "",
  optimizeHeight: false,
  optimizeSpacing: false,
  batteryChoice: "standard",
  batteryWh: "",
  panelChoice: "standard",
  panelWp: "",
  alternativeAccepted: false,
  alternativeDetails: "",
});

// Q1 — the "current zone" lighting fields live BOTH flat on SoluxForm and inside
// zoneLightingData[assignedArea]. These two helpers are the single place that
// copies between the two representations (deep-copying the period array), so the
// sync sites in the intake page can't drift out of step.

// Snapshot the flat mirror fields (a ZoneLightingData-shaped source, e.g. the
// form) into a fresh ZoneLightingData — explicit picks so extra form fields
// aren't dragged along.
export const formFieldsToZoneData = (f: ZoneLightingData): ZoneLightingData => ({
  avgLux: f.avgLux,
  uniformity: f.uniformity,
  minLux: f.minLux,
  cct: f.cct,
  lightingSegments: f.lightingSegments.map((s) => ({ ...s })),
  lightingNightHours: f.lightingNightHours,
  morningTimeH: f.morningTimeH,
  morningIntensityPct: f.morningIntensityPct,
  productFamily: f.productFamily,
  productModelPending: f.productModelPending,
  product: f.product,
  luminaireHeight: f.luminaireHeight,
  spacing: f.spacing,
  optimizeHeight: f.optimizeHeight,
  optimizeSpacing: f.optimizeSpacing,
  batteryChoice: f.batteryChoice,
  batteryWh: f.batteryWh,
  panelChoice: f.panelChoice,
  panelWp: f.panelWp,
  alternativeAccepted: f.alternativeAccepted,
  alternativeDetails: f.alternativeDetails,
});

// The flat mirror fields for a stored ZoneLightingData, ready to spread into
// setForm (deep-copying the period array so edits don't alias the stored zone).
export const zoneDataToFormFields = (zd: ZoneLightingData): ZoneLightingData => ({
  ...zd,
  lightingSegments: zd.lightingSegments.map((s) => ({ ...s })),
});

export interface SoluxForm {
  projectName: string;
  clientName: string;
  locality: string;
  country: string;
  address: string;
  location: null | { lat: number; lng: number };
  areas: MapArea[];
  lampposts: MapLamppost[];
  /** DEPRECATED — replaced by mapRecoZones; kept for old-draft compatibility. */
  mapLines: MapLine[];
  // Recommendation zones drawn on the map: where lampposts should / must not go.
  mapRecoZones: MapRecoZone[];
  // Free comment tied to the map/plan itself (feedback #3) — instructions the
  // Study Lab reads next to the drawing ("keep existing poles on this side"…).
  planNotes: string;
  // Additional independent map viewports (feedback #5).
  extraMapFrames: MapFrame[];
  mapZoom: number | undefined;
  mapCenter: { lat: number; lng: number } | undefined;
  assignedArea: string;
  avgLux: string;
  minLux: string;
  uniformity: string;
  cct: string;
  // Product hierarchy: family (range) → model. `product` holds the MODEL;
  // `productModelPending` means "Study Lab to define the model".
  productFamily: string;
  productModelPending: boolean;
  product: string;
  multiProduct: boolean;
  productAssignments: ProductAssignment[];
  batteryChoice: "standard" | "custom";
  batteryWh: string;
  panelChoice: "standard" | "custom";
  panelWp: string;
  alternativeAccepted: boolean;
  alternativeDetails: string;
  luminaireHeight: string;
  spacing: string;
  optimizeHeight: boolean;
  optimizeSpacing: boolean;
  pdfPlan: PdfZoneValue;
  locationMode: "map" | "pdf";
  projectType: "zone" | "road";
  roadInputMode: "builder" | "pdf_profile";
  roadProfile: RoadProfile;
  roadLighting: LightingSetup;
  roadSegmentLighting: Record<string, { avgLux: string; uniformity: string; minLux: string; cct: string }>;
  roadDocuments: ProjectDocument[];
  roadProfileNotes: string;
  lightingSegments: LightingSegment[];
  lightingNightHours: number;
  // Morning Time: fixed-duration final operating period, always ending at
  // sunrise regardless of seasonal night length (sunrise − H → sunrise).
  morningTimeH: number;
  morningIntensityPct: number;
  // Worst-case sizing references, computed from the project's latitude at the
  // winter solstice (see lib/solarNight.ts). `duskHHMM` is the sunset / program
  // start time; `duskBasis` records whether it is legal (clock) or solar time.
  longestNightH: number;
  duskHHMM: string;
  duskBasis: "legal" | "solar" | "";
  deadlineDate: string;
  // How urgent the request is; the date above is a requested TARGET, never a
  // confirmed delivery commitment.
  deadlinePriority: "standard" | "urgent" | "none";
  // Contact block for the Study Lab (no authenticated account to derive it from).
  preparedBy: string;
  contactEmail: string;
  contactPhone: string;
  technicalNotes: string;
  zoneLightingData: Record<string, ZoneLightingData>;
}

export const defaultForm: SoluxForm = {
  projectName: "",
  clientName: "",
  locality: "",
  country: "",
  address: "",
  location: null,
  areas: [],
  lampposts: [],
  mapLines: [],
  mapRecoZones: [],
  planNotes: "",
  extraMapFrames: [],
  mapZoom: undefined,
  mapCenter: undefined,
  assignedArea: "",
  avgLux: "",
  minLux: "",
  uniformity: "",
  cct: "4000K",
  productFamily: "",
  productModelPending: false,
  product: "",
  multiProduct: false,
  productAssignments: [],
  batteryChoice: "standard",
  batteryWh: "",
  panelChoice: "standard",
  panelWp: "",
  alternativeAccepted: false,
  alternativeDetails: "",
  luminaireHeight: "",
  spacing: "",
  optimizeHeight: false,
  optimizeSpacing: false,
  pdfPlan: {
    pdfUrl: "",
    zones: [],
    lampposts: [],
    previewImage: "",
    viewState: { page: 1, zoom: 1, rotation: 0 },
  },
  locationMode: "map",
  projectType: "zone",
  roadInputMode: "builder",
  roadProfile: [],
  roadLighting: { ...defaultLightingSetup },
  roadSegmentLighting: {},
  roadDocuments: [],
  roadProfileNotes: "",
  lightingSegments: createDefaultLightingSegments(),
  lightingNightHours: DEFAULT_LIGHTING_NIGHT_HOURS,
  morningTimeH: 0,
  morningIntensityPct: 100,
  longestNightH: 0,
  duskHHMM: "",
  duskBasis: "",
  deadlineDate: "",
  deadlinePriority: "standard",
  preparedBy: "",
  contactEmail: "",
  contactPhone: "",
  technicalNotes: "",
  zoneLightingData: {},
};
