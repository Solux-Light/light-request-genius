import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Home, Send, Globe, MessageSquareText } from "lucide-react";
import GoogleMapSection from "@/components/GoogleMapSection";
import PdfZoneEditor from "@/components/PdfZoneEditor";
import ProductSelectionSection from "@/components/ProductSelectionSection";
import LightingProgramTable from "@/components/LightingProgramTable";
import StepHeader from "@/components/StepHeader";
import RoadBuilder from "@/components/RoadBuilder";
import RoadLightingLayout from "@/components/RoadLightingLayout";
import ProjectDocumentsSection from "@/components/ProjectDocumentsSection";
import PdfSubmissionDocument from "@/components/PdfSubmissionDocument";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import PdfExportButton from "@/components/PdfExportButton";
import { SoluxForm, defaultForm, defaultLightingSetup, SEGMENT_TYPES, SEGMENT_COLORS, COLOR_OPTIONS, createDefaultZoneLightingData, ZoneLightingData, LightingSegment } from "@/types/solux";
import { saveSubmission } from "@/lib/submissions";
import { geocodeCity, resolveWinterSolsticeDusk } from "@/lib/solarNight";
import { buildProjectKml, downloadKml } from "@/lib/kml";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Snapshot the top-level "mirror" lighting fields into a ZoneLightingData object.
// Used to seed the first zone with values the user typed before any zone existed.
const mirrorToZoneData = (f: SoluxForm): ZoneLightingData => ({
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

const NIGHT_MIN_H = 4;
const NIGHT_MAX_H = 24; // matches the Lighting Program table bounds
const snap30 = (h: number) => Math.round(h * 2) / 2;
const clampNightHours = (h: number) => Math.min(NIGHT_MAX_H, Math.max(NIGHT_MIN_H, snap30(h)));

// Rescale the program's period durations proportionally so they still sum to the
// new night length (mirrors the "Fit" rescale inside LightingProgramTable).
const scaleSegmentsToTotal = (segs: LightingSegment[], total: number): LightingSegment[] => {
  const sum = segs.reduce((s, x) => s + x.hours, 0);
  if (sum <= 0) return segs.map((s) => ({ ...s }));
  const scaled = segs.map((s) => ({ ...s, hours: snap30((s.hours / sum) * total) }));
  const newSum = scaled.reduce((s, x) => s + x.hours, 0);
  const diff = Math.round((total - newSum) * 100) / 100;
  if (diff !== 0 && scaled.length) {
    const last = scaled.length - 1;
    scaled[last].hours = Math.max(0.5, snap30(scaled[last].hours + diff));
  }
  return scaled;
};

const SoluxIntake = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [lang, setLang] = useState<"fr" | "en">("en");
  const [form, setForm] = useState<SoluxForm>({ ...defaultForm });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [computingDusk, setComputingDusk] = useState(false);
  const directExportRef = useRef<HTMLDivElement>(null);

  const l = useCallback((fr: string, en: string) => (lang === "fr" ? fr : en), [lang]);

  const salesName = user?.email?.split("@")[0] || "";
  const nowStr = new Date().toLocaleString();

  const onChange = useCallback(<K extends keyof SoluxForm>(key: K, val: SoluxForm[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  const handleMapSectionChange = useCallback(
    (val: {
      address: string;
      location?: { lat: number; lng: number } | null;
      areas: SoluxForm["areas"];
      lampposts: SoluxForm["lampposts"];
    }) => {
      setForm((f) => ({
        ...f,
        address: val.address,
        ...(val.location !== undefined ? { location: val.location } : {}),
        areas: val.areas,
        lampposts: val.lampposts,
      }));
    },
    []
  );

  const handleMapViewChange = useCallback((zoom: number, center: { lat: number; lng: number }) => {
    setForm((f) => {
      if (
        f.mapZoom === zoom &&
        f.mapCenter?.lat === center.lat &&
        f.mapCenter?.lng === center.lng
      ) {
        return f;
      }
      return { ...f, mapZoom: zoom, mapCenter: center };
    });
  }, []);

  // SEO effects
  useEffect(() => {
    document.title = l(
      "Solux – Formulaire d'étude d'éclairage",
      "Solux – Professional Lighting Study Request"
    );
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", l("Formulaire de demande d'étude d'éclairage solaire Solux", "Solux solar lighting study request form"));
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = window.location.href;
  }, [lang, l]);

  // Validation
  const requiredErrors = useMemo(() => {
    const errs: string[] = [];
    const isNum = (v: string) => v !== "" && !isNaN(Number(v.replace(",", ".")));
    if (!form.projectName) errs.push(l("Nom du projet", "Project Name"));
    if (!form.clientName) errs.push(l("Nom du client", "Client Name"));
    if (!form.locality) errs.push(l("Localité", "City/Location"));
    if (!form.country) errs.push(l("Pays", "Country"));
    if (!form.address) errs.push(l("Adresse", "Project Address"));
    if (!isNum(form.avgLux) && form.projectType === "zone") errs.push(l("Éclairement moyen", "Average Illuminance"));
    if (!form.cct) errs.push(l("Température de couleur", "Color Temperature"));
    if (!form.product) errs.push(l("Produit", "Product Selection"));
    return errs;
  }, [form, l]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiredErrors.length > 0) {
      toast({
        title: l("Champs manquants", "Missing Fields"),
        description: requiredErrors.join(", "),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await saveSubmission(form, { salesName });
      toast({
        title: l("Demande enregistrée", "Request Saved"),
        description: l("Votre demande a été transmise au bureau d'études.", "Your request has been sent to the design team."),
      });
    } catch (err) {
      toast({
        title: l("Échec de l'envoi", "Submission Failed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Combine zones from map and PDF (memoized — new array each render caused effect loops)
  const allZones = useMemo(
    () => [
      ...form.areas.map((a) => ({ ...a, source: "Map" as const })),
      ...form.pdfPlan.zones.map((z) => ({
        id: z.id,
        name: z.name,
        color: z.color,
        source: "PDF" as const,
        type: "polygon" as const,
        paths: [] as { lat: number; lng: number }[],
      })),
    ],
    [form.areas, form.pdfPlan.zones]
  );
  const zoneOptions = useMemo(() => allZones.map((zone) => ({
    id: zone.id,
    name: zone.name || `${l("Zone", "Zone")} ${zone.id.slice(0, 6)}`,
    color: zone.color,
    source: zone.source,
  })), [allZones, l]);
  const selectedZoneOption = zoneOptions.find((zone) => zone.id === form.assignedArea);

  const syncAssignedZoneData = useCallback((updates: Partial<Pick<SoluxForm,
    "avgLux" | "uniformity" | "minLux" | "cct" | "lightingSegments" | "lightingNightHours"
    | "morningTimeH" | "morningIntensityPct"
    | "product" | "luminaireHeight" | "spacing" | "optimizeHeight" | "optimizeSpacing"
    | "batteryChoice" | "batteryWh" | "panelChoice" | "panelWp"
    | "alternativeAccepted" | "alternativeDetails"
  >>) => {
    setForm((current) => {
      const nextLightingSegments = updates.lightingSegments?.map((segment) => ({ ...segment }));
      const nextForm: SoluxForm = {
        ...current,
        ...updates,
        ...(nextLightingSegments ? { lightingSegments: nextLightingSegments } : {}),
      };

      if (!current.assignedArea) return nextForm;

      const existingZoneData = current.zoneLightingData[current.assignedArea] ?? createDefaultZoneLightingData();

      return {
        ...nextForm,
        zoneLightingData: {
          ...current.zoneLightingData,
          [current.assignedArea]: {
            ...existingZoneData,
            ...updates,
            ...(nextLightingSegments ? { lightingSegments: nextLightingSegments } : {}),
          },
        },
      };
    });
  }, []);

  // Compute the worst-case sizing references (longest night + winter-solstice
  // sunset) from the project's latitude, then auto-fill the night duration and
  // the program start time. Uses the map pin when available, otherwise geocodes
  // the typed city/address.
  const handleAutoCalcNight = useCallback(async () => {
    setComputingDusk(true);
    try {
      let loc = form.location;
      let geoFormatted: string | undefined;
      if (!loc) {
        const query = [form.address, form.locality, form.country].filter(Boolean).join(", ");
        if (!query.trim()) {
          toast({
            title: l("Lieu manquant", "Location missing"),
            description: l("Renseignez d'abord une ville/adresse ou placez un point sur la carte.", "Enter a city/address first, or drop a point on the map."),
            variant: "destructive",
          });
          return;
        }
        const geo = await geocodeCity(query, GOOGLE_MAPS_API_KEY);
        if (!geo) {
          toast({
            title: l("Ville introuvable", "City not found"),
            description: l("Géocodage indisponible (API non activée ?). Placez un point sur la carte comme alternative.", "Geocoding unavailable (API not enabled?). Drop a point on the map instead."),
            variant: "destructive",
          });
          return;
        }
        loc = geo.location;
        geoFormatted = geo.formatted;
      }

      const res = await resolveWinterSolsticeDusk(loc, GOOGLE_MAPS_API_KEY, new Date().getFullYear());
      const nightH = clampNightHours(res.longestNightH);

      setForm((current) => {
        // Standard periods cover the night minus the fixed Morning Time block.
        const scaled = scaleSegmentsToTotal(current.lightingSegments, Math.max(1, nightH - current.morningTimeH));
        const next: SoluxForm = {
          ...current,
          location: current.location ?? loc!,
          address: current.address || geoFormatted || current.address,
          lightingSegments: scaled,
          lightingNightHours: nightH,
          // Store the snapped value so the reference, the slider and the PDF all
          // agree (the raw astronomical value, e.g. 15.97 h, only differs by the
          // 0.5 h slider granularity).
          longestNightH: nightH,
          duskHHMM: res.hhmm,
          duskBasis: res.basis,
        };
        if (!current.assignedArea) return next;
        const zd = current.zoneLightingData[current.assignedArea] ?? createDefaultZoneLightingData();
        return {
          ...next,
          zoneLightingData: {
            ...current.zoneLightingData,
            [current.assignedArea]: {
              ...zd,
              lightingSegments: scaled.map((s) => ({ ...s })),
              lightingNightHours: nightH,
            },
          },
        };
      });

      toast({
        title: l("Calcul effectué", "Calculation done"),
        description: `${l("Nuit la plus longue", "Longest night")}: ${nightH}h · ${l("Coucher", "Sunset")}: ${res.hhmm} (${res.basis === "legal" ? l("heure légale", "legal time") : l("heure solaire", "solar time")})`,
      });
    } finally {
      setComputingDusk(false);
    }
  }, [form.location, form.address, form.locality, form.country, toast, l]);

  useEffect(() => {
    setForm((current) => {
      const validZoneIds = new Set(allZones.map((zone) => zone.id));
      const nextZoneLightingData = { ...current.zoneLightingData };
      let changed = false;

      // If lighting fields were filled before any zone existed, those values live
      // only in the top-level mirror. Seed the first newly-created zone with them
      // so creating a zone doesn't wipe what the user just typed.
      const seedFromMirror =
        !current.assignedArea && Object.keys(current.zoneLightingData).length === 0;
      const firstNewZoneId = allZones[0]?.id;

      allZones.forEach((zone) => {
        if (!nextZoneLightingData[zone.id]) {
          nextZoneLightingData[zone.id] =
            seedFromMirror && zone.id === firstNewZoneId
              ? mirrorToZoneData(current)
              : createDefaultZoneLightingData();
          changed = true;
        }
      });

      Object.keys(nextZoneLightingData).forEach((zoneId) => {
        if (!validZoneIds.has(zoneId)) {
          delete nextZoneLightingData[zoneId];
          changed = true;
        }
      });

      const fallbackZoneId = current.assignedArea && validZoneIds.has(current.assignedArea)
        ? current.assignedArea
        : allZones[0]?.id || "";

      if (!changed && fallbackZoneId === current.assignedArea) return current;

      const zoneData = fallbackZoneId ? nextZoneLightingData[fallbackZoneId] ?? createDefaultZoneLightingData() : createDefaultZoneLightingData();

      return {
        ...current,
        assignedArea: fallbackZoneId,
        avgLux: zoneData.avgLux,
        uniformity: zoneData.uniformity,
        minLux: zoneData.minLux,
        cct: zoneData.cct,
        lightingSegments: zoneData.lightingSegments.map((segment) => ({ ...segment })),
        lightingNightHours: zoneData.lightingNightHours,
        morningTimeH: zoneData.morningTimeH,
        morningIntensityPct: zoneData.morningIntensityPct,
        product: zoneData.product,
        luminaireHeight: zoneData.luminaireHeight,
        spacing: zoneData.spacing,
        optimizeHeight: zoneData.optimizeHeight,
        optimizeSpacing: zoneData.optimizeSpacing,
        batteryChoice: zoneData.batteryChoice,
        batteryWh: zoneData.batteryWh,
        panelChoice: zoneData.panelChoice,
        panelWp: zoneData.panelWp,
        alternativeAccepted: zoneData.alternativeAccepted,
        alternativeDetails: zoneData.alternativeDetails,
        zoneLightingData: nextZoneLightingData,
      };
    });
  }, [allZones]);

  // Unique road segment types
  const uniqueSegmentTypes = [...new Set(form.roadProfile.map((s) => s.type))];

  // No auth gate - form is accessible to everyone

  // Sequential step numbering — conditional sections only consume a number
  // when rendered, so zone and road flows both read 1…N without gaps.
  let stepNo = 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header. Context while scrolling long profiles is provided by the
          per-profile sticky header inside the Work-From-PDF-Profile workflow. */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/d872661a-d41f-4565-9853-2f2195d3f284.png"
              alt="Solux"
              className="h-8"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <h1 className="text-2xl md:text-3xl font-bold">
              {l("Solux – Formulaire d'étude d'éclairage", "Solux – Professional Lighting Study Request")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">🇫🇷 Français</SelectItem>
                <SelectItem value="en">🇬🇧 English</SelectItem>
              </SelectContent>
            </Select>
            <Link to="/">
              <Button variant="ghost" size="sm"><Home className="h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Form */}
      {/* Desktop-first: use widescreen real estate (was max-w-5xl / 1024px) */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-fade-in">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={onSubmit} className="grid gap-8">

                {/* Section 1: General Information */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Informations générales", "General Information")} hint={l("Identité du projet et du client.", "Project and customer identity.")} />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{l("Nom du projet *", "Project Name *")}</Label>
                      <Input value={form.projectName} onChange={(e) => onChange("projectName", e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Nom du client *", "Client Name *")}</Label>
                      <Input value={form.clientName} onChange={(e) => onChange("clientName", e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Localité *", "City/Location *")}</Label>
                      <Input value={form.locality} onChange={(e) => onChange("locality", e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Pays *", "Country *")}</Label>
                      <Input value={form.country} onChange={(e) => onChange("country", e.target.value)} required />
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 2: Project Type */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Type de projet", "Project Type")} hint={l("Le choix détermine le déroulé des étapes suivantes.", "This choice drives the following steps.")} />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      className={`p-6 rounded-lg border-2 text-left transition-colors ${
                        form.projectType === "zone"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-primary/50"
                      }`}
                      onClick={() => {
                        onChange("projectType", "zone");
                        onChange("roadProfile", []);
                        onChange("roadLighting", { ...defaultLightingSetup });
                        onChange("roadSegmentLighting", {});
                      }}
                    >
                      <span className="text-2xl">💡</span>
                      <h3 className="font-semibold mt-2">{l("Éclairage de zone", "Area Lighting")}</h3>
                      <p className="text-sm text-muted-foreground">{l("Parking, bâtiment, espace public, etc.", "Parking, building, public space, etc.")}</p>
                    </button>
                    <button
                      type="button"
                      className={`p-6 rounded-lg border-2 text-left transition-colors ${
                        form.projectType === "road"
                          ? "border-primary bg-primary/5"
                          : "border-input hover:border-primary/50"
                      }`}
                      onClick={() => {
                        onChange("projectType", "road");
                        onChange("assignedArea", "");
                        onChange("avgLux", "");
                        onChange("minLux", "");
                        onChange("uniformity", "");
                      }}
                    >
                      <span className="text-2xl">🛣️</span>
                      <h3 className="font-semibold mt-2">{l("Éclairage routier", "Road & Street lighting Lighting")}</h3>
                      <p className="text-sm text-muted-foreground">{l("Route, rue, autoroute, piste cyclable, etc.", "Road, street, highway, bike path, etc.")}</p>
                    </button>
                  </div>
                </section>

                <Separator />

                {/* Section 3A: Zone Mode */}
                {form.projectType === "zone" && (
                  <>
                    <section>
                      <div className="mb-4">
                        <StepHeader n={++stepNo} title={l("Emplacement", "Location")} hint={l("Carte interactive ou plan fourni par le client.", "Interactive map or the customer's plan.")} />
                      </div>
                      <Tabs value={form.locationMode} onValueChange={(v) => onChange("locationMode", v as "map" | "pdf")}>
                        <TabsList>
                          <TabsTrigger value="map">{l("Carte", "Map")}</TabsTrigger>
                          <TabsTrigger value="pdf">{l("Plan (PDF/Image/CAO)", "Plan (PDF/Image/CAD)")}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="map">
                          <GoogleMapSection
                            apiKey={GOOGLE_MAPS_API_KEY}
                            value={{
                              address: form.address,
                              location: form.location,
                              areas: form.areas,
                              lampposts: form.lampposts,
                            }}
                            onChange={handleMapSectionChange}
                            onMapViewChange={handleMapViewChange}
                            lang={lang}
                          />
                        </TabsContent>
                        <TabsContent value="pdf">
                          <PdfZoneEditor
                            value={form.pdfPlan}
                            onChange={(val) => onChange("pdfPlan", val)}
                            lang={lang}
                          />
                        </TabsContent>
                      </Tabs>
                    </section>

                    <section>
                      <div className="mb-4">
                        <StepHeader
                          n={++stepNo}
                          title={l("Zone d'étude & niveaux d'éclairage", "Study Area & Lighting Levels")}
                          hint={l("Choisissez la zone puis saisissez les niveaux demandés par le client.", "Pick the zone, then enter the customer's requested levels.")}
                        />
                      </div>
                      {allZones.length > 0 ? (
                        <Select value={form.assignedArea} onValueChange={(v) => {
                          const saved = form.zoneLightingData[v] ?? createDefaultZoneLightingData();
                          setForm((current) => ({
                            ...current,
                            assignedArea: v,
                            avgLux: saved.avgLux,
                            uniformity: saved.uniformity,
                            minLux: saved.minLux,
                            cct: saved.cct,
                            lightingSegments: saved.lightingSegments.map((segment) => ({ ...segment })),
                            lightingNightHours: saved.lightingNightHours,
                            morningTimeH: saved.morningTimeH,
                            morningIntensityPct: saved.morningIntensityPct,
                            product: saved.product,
                            luminaireHeight: saved.luminaireHeight,
                            spacing: saved.spacing,
                            optimizeHeight: saved.optimizeHeight,
                            optimizeSpacing: saved.optimizeSpacing,
                            batteryChoice: saved.batteryChoice,
                            batteryWh: saved.batteryWh,
                            panelChoice: saved.panelChoice,
                            panelWp: saved.panelWp,
                            alternativeAccepted: saved.alternativeAccepted,
                            alternativeDetails: saved.alternativeDetails,
                          }));
                        }}>
                          <SelectTrigger><SelectValue placeholder={l("Sélectionner une zone", "Select a zone")} /></SelectTrigger>
                          <SelectContent>
                            {zoneOptions.map((z) => (
                              <SelectItem key={z.id} value={z.id}>
                                <span className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: z.color }} />
                                  {z.name}
                                  <span className="text-xs text-muted-foreground">({z.source})</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground">{l("Aucune zone créée", "No zones created")}</p>
                      )}
                      <div className="mt-4 grid md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label>{l("Lux moyen minimum *", "Required Average Illuminance (lux) *")}</Label>
                          <Input value={form.avgLux} onChange={(e) => syncAssignedZoneData({ avgLux: e.target.value })} placeholder="15" required />
                        </div>
                        <div className="space-y-2">
                          <Label>{l("Uniformité minimale (optionnel)", "Minimum Uniformity Ratio (optional)")}</Label>
                          <Input value={form.uniformity} onChange={(e) => syncAssignedZoneData({ uniformity: e.target.value })} placeholder="0.6" />
                        </div>
                        <div className="space-y-2">
                          <Label>{l("Lux minimum (optionnel)", "Minimum Lux (optional)")}</Label>
                          <Input value={form.minLux} onChange={(e) => syncAssignedZoneData({ minLux: e.target.value })} placeholder="4" />
                        </div>
                        <div className="space-y-2">
                          <Label>{l("CCT en Kelvin *", "Color Temperature (CCT in Kelvin) *")}</Label>
                          <Select value={form.cct} onValueChange={(v) => syncAssignedZoneData({ cct: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3000K">3000K</SelectItem>
                              <SelectItem value="4000K">4000K</SelectItem>
                              <SelectItem value="5000K">5000K</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </section>
                  </>
                )}

                {/* Section 3B: Road Mode — Road Builder or Work From PDF Profile */}
                {form.projectType === "road" && (
                  <Tabs value={form.roadInputMode} onValueChange={(v) => onChange("roadInputMode", v as "builder" | "pdf_profile")}>
                    <div className="mb-4">
                      <StepHeader
                        n={++stepNo}
                        title={l("Éclairage routier", "Road & Street Lighting")}
                        hint={l("Construisez la route ou travaillez depuis le profil fourni par le client (déroulé guidé).", "Build the road, or work from the customer's profile (guided sub-steps).")}
                      />
                    </div>
                    <TabsList className="mb-6">
                      <TabsTrigger value="builder">{l("Constructeur de route", "Road Builder")}</TabsTrigger>
                      <TabsTrigger value="pdf_profile">{l("Depuis un profil PDF", "Work From PDF Profile")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="builder" className="space-y-8 mt-0">
                    <section>
                      <h3 className="text-lg font-semibold mb-4">{l("Construction de route", "Road Builder")}</h3>
                      <RoadBuilder value={form.roadProfile} onChange={(v) => onChange("roadProfile", v)} lang={lang} />
                    </section>

                    <section>
                      <h3 className="text-lg font-semibold mb-4">{l("Configuration d'éclairage routier", "Road Lighting Layout")}</h3>
                      <RoadLightingLayout
                        value={form.roadLighting}
                        onChange={(v) => onChange("roadLighting", v)}
                        roadProfile={form.roadProfile}
                        lang={lang}
                      />
                    </section>

                    {/* Per-segment lighting levels */}
                    {form.roadProfile.length > 0 && uniqueSegmentTypes.length > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold mb-4">{l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}</h3>
                        {uniqueSegmentTypes.map((segType) => {
                          const segInfo = SEGMENT_TYPES.find((t) => t.value === segType);
                          const segLighting = form.roadSegmentLighting[segType] || { avgLux: "", uniformity: "", minLux: "", cct: "4000K" };
                          return (
                            <Card key={segType} className="mb-4">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[segType] }} />
                                  <span className="font-medium">{segInfo ? (lang === "fr" ? segInfo.labelFr : segInfo.labelEn) : segType}</span>
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Lux moyen", "Average Lux")}</Label>
                                    <Input
                                      value={segLighting.avgLux}
                                      onChange={(e) => onChange("roadSegmentLighting", {
                                        ...form.roadSegmentLighting,
                                        [segType]: { ...segLighting, avgLux: e.target.value },
                                      })}
                                      placeholder="15"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Uniformité", "Uniformity")}</Label>
                                    <Input
                                      value={segLighting.uniformity}
                                      onChange={(e) => onChange("roadSegmentLighting", {
                                        ...form.roadSegmentLighting,
                                        [segType]: { ...segLighting, uniformity: e.target.value },
                                      })}
                                      placeholder="0.6"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Lux min", "Min Lux")}</Label>
                                    <Input
                                      value={segLighting.minLux}
                                      onChange={(e) => onChange("roadSegmentLighting", {
                                        ...form.roadSegmentLighting,
                                        [segType]: { ...segLighting, minLux: e.target.value },
                                      })}
                                      placeholder="4"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">CCT</Label>
                                    <Select
                                      value={segLighting.cct}
                                      onValueChange={(v) => onChange("roadSegmentLighting", {
                                        ...form.roadSegmentLighting,
                                        [segType]: { ...segLighting, cct: v },
                                      })}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="3000K">3000K</SelectItem>
                                        <SelectItem value="4000K">4000K</SelectItem>
                                        <SelectItem value="5000K">5000K</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </section>
                    )}
                    </TabsContent>

                    <TabsContent value="pdf_profile" className="mt-0">
                      <ProjectDocumentsSection
                        documents={form.roadDocuments}
                        onChange={(docs) => onChange("roadDocuments", docs)}
                        notes={form.roadProfileNotes}
                        onNotesChange={(v) => onChange("roadProfileNotes", v)}
                        lang={lang}
                      />
                    </TabsContent>
                  </Tabs>
                )}

                <Separator />

                {/* Section 4: Product Selection */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Sélection du produit", "Product Selection")} hint={l("Choisissez le produit Solux adapté.", "Choose the appropriate Solux product.")} />
                  </div>
                  {form.projectType === "zone" && selectedZoneOption && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {l("Produit appliqué à la zone sélectionnée :", "Product applied to selected zone:")} <span className="font-medium text-foreground">{selectedZoneOption.name}</span>
                    </p>
                  )}
                  <ProductSelectionSection
                    product={form.product}
                    onProductChange={(v) => syncAssignedZoneData({ product: v })}
                    luminaireHeight={form.luminaireHeight}
                    onLuminaireHeightChange={(v) => syncAssignedZoneData({ luminaireHeight: v })}
                    spacing={form.spacing}
                    onSpacingChange={(v) => syncAssignedZoneData({ spacing: v })}
                    optimizeHeight={form.optimizeHeight}
                    onOptimizeHeightChange={(v) => syncAssignedZoneData({ optimizeHeight: v })}
                    optimizeSpacing={form.optimizeSpacing}
                    onOptimizeSpacingChange={(v) => syncAssignedZoneData({ optimizeSpacing: v })}
                    batteryChoice={form.batteryChoice}
                    onBatteryChoiceChange={(v) => syncAssignedZoneData({ batteryChoice: v })}
                    batteryWh={form.batteryWh}
                    onBatteryWhChange={(v) => syncAssignedZoneData({ batteryWh: v })}
                    panelChoice={form.panelChoice}
                    onPanelChoiceChange={(v) => syncAssignedZoneData({ panelChoice: v })}
                    panelWp={form.panelWp}
                    onPanelWpChange={(v) => syncAssignedZoneData({ panelWp: v })}
                    alternativeAccepted={form.alternativeAccepted}
                    onAlternativeAcceptedChange={(v) => syncAssignedZoneData({ alternativeAccepted: v })}
                    alternativeDetails={form.alternativeDetails}
                    onAlternativeDetailsChange={(v) => syncAssignedZoneData({ alternativeDetails: v })}
                    hideMultiToggle
                    lang={lang}
                  />
                </section>

                <Separator />

                {/* Section 5: Lighting Scenario — hidden in Work-From-PDF-Profile
                    mode, where each cross-section profile owns its own program. */}
                {!(form.projectType === "road" && form.roadInputMode === "pdf_profile") && (
                <>
                <section>
                  <div className="mb-4">
                    <StepHeader
                      n={++stepNo}
                      title={l("Programme d'éclairage", "Lighting Program")}
                      hint={l("Saisie directe : nuit, Morning Time, périodes, détection.", "Direct entry: night, Morning Time, periods, detection.")}
                    />
                  </div>
                  {selectedZoneOption && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {l("Scénario appliqué à la zone sélectionnée :", "Scenario applied to selected zone:")} <span className="font-medium text-foreground">{selectedZoneOption.name}</span>
                    </p>
                  )}
                  <div className="mb-4 rounded-lg border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" onClick={handleAutoCalcNight} disabled={computingDusk}>
                        {computingDusk ? l("Calcul…", "Calculating…") : l("🌙 Calculer depuis le lieu", "🌙 Auto-calculate from location")}
                      </Button>
                      <p className="text-xs text-muted-foreground flex-1 min-w-[220px]">
                        {l(
                          "Estime la nuit la plus longue (solstice d'hiver) et l'heure de coucher du soleil à partir de la ville — référence de dimensionnement pire cas.",
                          "Estimates the longest night (winter solstice) and the sunset time from the city — the worst-case sizing reference.",
                        )}
                      </p>
                    </div>
                    {form.duskHHMM && (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 text-sm">
                        <span>🌙 {l("Nuit la plus longue", "Longest night")}: <strong>{`${form.longestNightH || form.lightingNightHours}h`}</strong></span>
                        <span>
                          🌇 {l("Coucher du soleil (solstice)", "Sunset (solstice)")}: <strong>{form.duskHHMM}</strong>{" "}
                          <span className="text-xs text-muted-foreground">
                            ({form.duskBasis === "legal" ? l("heure légale", "legal time") : l("heure solaire", "solar time")})
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Standard program module (same as the profile workflow) —
                      one implementation across the whole application. */}
                  <LightingProgramTable
                    value={{
                      nightHours: form.lightingNightHours,
                      morningTimeH: form.morningTimeH,
                      morningIntensityPct: form.morningIntensityPct,
                      segments: form.lightingSegments,
                    }}
                    onChange={(next) => syncAssignedZoneData({
                      lightingSegments: next.segments,
                      lightingNightHours: next.nightHours,
                      morningTimeH: next.morningTimeH,
                      morningIntensityPct: next.morningIntensityPct,
                    })}
                    lang={lang}
                  />
                </section>

                <Separator />
                </>
                )}

                {/* Section 6: Multi-Product Toggle */}
                <section>
                  <div className="bg-[hsl(var(--callout))] rounded-lg p-4 md:p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Label className="text-lg md:text-xl font-semibold">{l("Produits multiples", "Multiple Products")}</Label>
                        <p className="text-sm text-muted-foreground">
                          {l("Attribuez différents produits à différentes zones.", "Assign different products to different zones.")}
                        </p>
                      </div>
                      <Switch
                        className="scale-110 md:scale-125"
                        checked={form.multiProduct}
                        onCheckedChange={(v) => {
                          onChange("multiProduct", v);
                          if (v && form.productAssignments.length === 0) {
                            onChange("productAssignments", [{
                              id: crypto.randomUUID(),
                              zone: "",
                              product: form.product || "SSLXPRO",
                            }]);
                          }
                        }}
                      />
                    </div>
                    {form.multiProduct && (
                      <div className="mt-4">
                        <ProductSelectionSection
                          product={form.product}
                          onProductChange={(v) => onChange("product", v)}
                          luminaireHeight={form.luminaireHeight}
                          onLuminaireHeightChange={(v) => onChange("luminaireHeight", v)}
                          spacing={form.spacing}
                          onSpacingChange={(v) => onChange("spacing", v)}
                          optimizeHeight={form.optimizeHeight}
                          onOptimizeHeightChange={(v) => onChange("optimizeHeight", v)}
                          optimizeSpacing={form.optimizeSpacing}
                          onOptimizeSpacingChange={(v) => onChange("optimizeSpacing", v)}
                          batteryChoice={form.batteryChoice}
                          onBatteryChoiceChange={(v) => onChange("batteryChoice", v)}
                          batteryWh={form.batteryWh}
                          onBatteryWhChange={(v) => onChange("batteryWh", v)}
                          panelChoice={form.panelChoice}
                          onPanelChoiceChange={(v) => onChange("panelChoice", v)}
                          panelWp={form.panelWp}
                          onPanelWpChange={(v) => onChange("panelWp", v)}
                          alternativeAccepted={form.alternativeAccepted}
                          onAlternativeAcceptedChange={(v) => onChange("alternativeAccepted", v)}
                          alternativeDetails={form.alternativeDetails}
                          onAlternativeDetailsChange={(v) => onChange("alternativeDetails", v)}
                          productAssignments={form.productAssignments}
                          onProductAssignmentsChange={(v) => onChange("productAssignments", v)}
                          mapAreas={form.areas}
                          assignmentsOnly
                          hideMultiToggle
                          lang={lang}
                        />
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                {/* Section 7: Additional Information */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Informations supplémentaires", "Additional Information")} hint={l("Notes pour le Study Lab et pièces jointes.", "Notes for the Study Lab and attachments.")} />
                  </div>
                  <div className="space-y-4">
                    {/* Notes & discussion — deliberately prominent so nothing
                        that doesn't fit a structured field gets lost. */}
                    <div className="rounded-lg border-2 border-primary/40 bg-[hsl(var(--callout))] p-5 space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageSquareText className="h-5 w-5 text-primary" />
                        <Label className="text-base font-semibold">{l("Notes & discussion pour le Study Lab", "Notes & Discussion for the Study Lab")}</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {l(
                          "Demandes client particulières, contraintes d'installation, mâts existants, situations inhabituelles, hypothèses, comptes-rendus de réunion…",
                          "Special customer requests, installation constraints, existing poles, unusual situations, assumptions, meeting notes…",
                        )}
                      </p>
                      <Textarea
                        value={form.technicalNotes}
                        onChange={(e) => onChange("technicalNotes", e.target.value)}
                        rows={6}
                        placeholder={l("Expliquez librement le contexte du projet…", "Explain the project context freely…")}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Télécharger des fichiers", "Upload Files")}</Label>
                      <Input
                        type="file"
                        multiple
                        accept=".pdf,.dwg"
                        onChange={(e) => setFiles(Array.from(e.target.files || []))}
                      />
                      {files.length > 0 && (
                        <p className="text-xs text-muted-foreground">{files.length} {l("fichier(s) sélectionné(s)", "file(s) selected")}</p>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 8: Processing Details */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Traitement & envoi", "Processing & Submit")} hint={l("Échéance, puis envoi au bureau d'études.", "Deadline, then submit to the design team.")} />
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{l("Commercial", "Sales Name")}</Label>
                      <Input value={salesName} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Date de soumission", "Submission Date")}</Label>
                      <Input value={nowStr} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Date limite", "Deadline")}</Label>
                      <Input
                        type="date"
                        value={form.deadlineDate}
                        onChange={(e) => onChange("deadlineDate", e.target.value)}
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 9: Footer Actions */}
                <section>
                  <div className="flex items-center gap-3 pt-2 border-t">
                    <Button type="submit" size="lg" className="px-8" disabled={submitting}>
                      <Send className="h-4 w-4 mr-2" />
                      {submitting ? l("Envoi…", "Sending…") : l("Envoyer au bureau d'études", "Submit to Design Team")}
                    </Button>
                    <PdfExportButton
                      contentRef={directExportRef}
                      filename={`${form.projectName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document"}.pdf`}
                      lang={lang}
                    />
                    <PdfPreviewModal
                      form={form}
                      salesName={salesName}
                      nowStr={nowStr}
                      lang={lang}
                      apiKey={GOOGLE_MAPS_API_KEY}
                    />
                    {form.location && (
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => {
                          const kml = buildProjectKml({
                            projectName: form.projectName,
                            address: form.address,
                            location: form.location,
                            areas: form.areas,
                            lampposts: form.lampposts,
                          });
                          const slug = form.projectName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
                          downloadKml(kml, `${slug}.kml`);
                        }}
                        title={l("Exporter les zones et lampadaires pour Google Earth", "Export zones and lampposts for Google Earth")}
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Google Earth (KML)
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {l("Votre demande sera enregistrée et transmise au bureau d'études.", "Your request will be saved and sent to the design team.")}
                  </p>
                </section>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Hidden PDF document for direct export */}
        <div style={{ position: "absolute", left: -9999 }}>
          <PdfSubmissionDocument
            ref={directExportRef}
            form={form}
            salesName={salesName}
            nowStr={nowStr}
            lang={lang}
            mapPreviewMode="placeholder"
          />
        </div>
      </main>
    </div>
  );
};

export default SoluxIntake;
