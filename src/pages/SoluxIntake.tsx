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
import { Home, Send } from "lucide-react";
import GoogleMapSection from "@/components/GoogleMapSection";
import PdfZoneEditor from "@/components/PdfZoneEditor";
import ProductSelectionSection from "@/components/ProductSelectionSection";
import LightingScenarioEditor from "@/components/LightingScenarioEditor";
import RoadBuilder from "@/components/RoadBuilder";
import RoadLightingLayout from "@/components/RoadLightingLayout";
import PdfSubmissionDocument from "@/components/PdfSubmissionDocument";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import PdfExportButton from "@/components/PdfExportButton";
import { SoluxForm, defaultForm, defaultLightingSetup, SEGMENT_TYPES, SEGMENT_COLORS, COLOR_OPTIONS, createDefaultZoneLightingData, ZoneLightingData } from "@/types/solux";

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

const SoluxIntake = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [lang, setLang] = useState<"fr" | "en">("en");
  const [form, setForm] = useState<SoluxForm>({ ...defaultForm });
  const [files, setFiles] = useState<File[]>([]);
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requiredErrors.length > 0) {
      toast({
        title: l("Champs manquants", "Missing Fields"),
        description: requiredErrors.join(", "),
        variant: "destructive",
      });
      return;
    }
    toast({
      title: l("Soumission réussie", "Request Submitted"),
      description: l("(Démo visuelle — aucune donnée envoyée)", "(Demo Mode — No data will be transmitted)"),
    });
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

  const handleLightingScenarioChange = useCallback(
    (segments: SoluxForm["lightingSegments"], nightHours: number) => {
      syncAssignedZoneData({ lightingSegments: segments, lightingNightHours: nightHours });
    },
    [syncAssignedZoneData]
  );

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto flex items-center justify-between py-3 px-4">
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
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-fade-in">
          <Card>
            <CardContent className="p-6">
              <form onSubmit={onSubmit} className="grid gap-8">

                {/* Section 1: General Information */}
                <section>
                  <h2 className="text-xl font-semibold mb-4">{l("Informations générales", "General Information")}</h2>
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
                  <h2 className="text-xl font-semibold mb-4">{l("Type de projet", "Project Type")}</h2>
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
                      <h2 className="text-xl font-semibold mb-4">{l("Emplacement", "Location")}</h2>
                      <Tabs value={form.locationMode} onValueChange={(v) => onChange("locationMode", v as "map" | "pdf")}>
                        <TabsList>
                          <TabsTrigger value="map">{l("Carte", "Map")}</TabsTrigger>
                          <TabsTrigger value="pdf">PDF</TabsTrigger>
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
                      <h2 className="text-xl font-semibold mb-4">{l("Zone d'étude assignée", "Assigned Study Area")}</h2>
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
                    </section>

                    <section>
                      <h2 className="text-xl font-semibold mb-4">{l("Niveaux d'éclairage", "Lighting Levels")}</h2>
                      <p className="text-sm text-muted-foreground mb-4">
                        {l("Définissez les niveaux d'éclairage requis pour cette zone.", "Define the required lighting levels for this zone.")}
                      </p>
                      <div className="grid md:grid-cols-2 gap-4">
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

                {/* Section 3B: Road Mode */}
                {form.projectType === "road" && (
                  <>
                    <section>
                      <h2 className="text-xl font-semibold mb-4">{l("Construction de route", "Road Builder")}</h2>
                      <RoadBuilder value={form.roadProfile} onChange={(v) => onChange("roadProfile", v)} lang={lang} />
                    </section>

                    <section>
                      <h2 className="text-xl font-semibold mb-4">{l("Configuration d'éclairage routier", "Road Lighting Layout")}</h2>
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
                        <h2 className="text-xl font-semibold mb-4">{l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}</h2>
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
                  </>
                )}

                <Separator />

                {/* Section 4: Product Selection */}
                <section>
                  <h2 className="text-xl font-semibold mb-2">{l("Sélection du produit", "Product Selection")}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {l("Choisissez le produit Solux adapté.", "Choose the appropriate Solux product.")}
                  </p>
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

                {/* Section 5: Lighting Scenario */}
                <section>
                  <h2 className="text-xl font-semibold mb-2">{l("Scénario d'éclairage", "Lighting Scenario")}</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {l("Configurez le programme d'éclairage nocturne.", "Configure the nighttime lighting program using the timeline editor.")}
                  </p>
                  {selectedZoneOption && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {l("Scénario appliqué à la zone sélectionnée :", "Scenario applied to selected zone:")} <span className="font-medium text-foreground">{selectedZoneOption.name}</span>
                    </p>
                  )}
                  <LightingScenarioEditor
                    valueSegments={form.lightingSegments}
                    valueNightHours={form.lightingNightHours}
                    onChange={handleLightingScenarioChange}
                    lang={lang}
                  />
                </section>

                <Separator />

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
                  <h2 className="text-xl font-semibold mb-4">{l("Informations supplémentaires", "Additional Information")}</h2>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{l("Notes techniques", "Technical Notes")}</Label>
                      <Textarea
                        value={form.technicalNotes}
                        onChange={(e) => onChange("technicalNotes", e.target.value)}
                        rows={3}
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
                  <h2 className="text-xl font-semibold mb-4">{l("Détails de traitement", "Processing Details")}</h2>
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
                    <Button type="submit" size="lg" className="px-8">
                      <Send className="h-4 w-4 mr-2" />
                      {l("Envoyer au bureau d'études", "Submit to Design Team")}
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
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {l("(Démo visuelle — aucune donnée envoyée)", "(Demo Mode — No data will be transmitted)")}
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
