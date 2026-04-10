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
  zones: PdfZone[];
  lampposts?: PdfLamppost[];
  previewImage?: string;
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

export type LightingSetup = {
  arrangement: "single_left" | "single_right" | "both" | "staggered" | "central";
  pole_height: number;
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
  min?: number;
  max?: number;
  intensity?: number;
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

export const PRODUCT_OPTIONS = [
  "SSLXPRO", "SSLXPERFORMANCE", "AOSPRO", "AOS PERFORMANCE",
  "COLARSUN", "KONOS+", "TOTEM", "TOTEM +", "Relight"
];

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
};

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
  scenarioText: string;
  presenceDetection: boolean;
  detectionCount: string;
  detectionDuration: string;
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
  roadProfile: RoadProfile;
  roadLighting: LightingSetup;
  roadSegmentLighting: Record<string, { avgLux: string; uniformity: string; minLux: string; cct: string }>;
  lightingSegments: LightingSegment[];
  lightingNightHours: number;
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
  scenarioText: "",
  presenceDetection: false,
  detectionCount: "",
  detectionDuration: "",
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
  roadProfile: [],
  roadLighting: { ...defaultLightingSetup },
  roadSegmentLighting: {},
  lightingSegments: [],
  lightingNightHours: 12,
  deadlineDate: "",
  technicalNotes: "",
  zoneLightingData: {},
};
