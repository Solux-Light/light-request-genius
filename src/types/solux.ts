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
};

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
};

export type PdfZoneValue = {
  pdfUrl: string;
  // What `pdfUrl` points at. Defaults to "pdf" when omitted so existing Area
  // Lighting plans keep their exact behaviour. "image" renders a raster (PNG/JPG,
  // or a generated preview of a CAD file) with the identical annotation tooling.
  mediaType?: "pdf" | "image";
  zones: PdfZone[];
  lampposts?: PdfLamppost[];
  previewImage?: string;
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
  luminaire: "SSLXPRO",
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
  mapZoom: number | undefined;
  mapCenter: { lat: number; lng: number } | undefined;
  assignedArea: string;
  avgLux: string;
  minLux: string;
  uniformity: string;
  cct: string;
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
  mapZoom: undefined,
  mapCenter: undefined,
  assignedArea: "",
  avgLux: "",
  minLux: "",
  uniformity: "",
  cct: "4000K",
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
  technicalNotes: "",
  zoneLightingData: {},
};
