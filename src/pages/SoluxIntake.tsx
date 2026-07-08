import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { uid, deepClone } from "@/lib/utils";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import ProjectsMenu from "@/components/ProjectsMenu";
import { SoluxForm, defaultForm, defaultLightingSetup, SEGMENT_TYPES, SEGMENT_COLORS, COLOR_OPTIONS, createDefaultZoneLightingData, ZoneLightingData, ProjectDocument } from "@/types/solux";
import { saveSubmission } from "@/lib/submissions";
import { geocodeCity, resolveWinterSolsticeDusk } from "@/lib/solarNight";
import { buildProjectKml, downloadKml } from "@/lib/kml";
import { rescaleSegmentsToTotal, snapHalf } from "@/lib/program";
import { saveDraft, loadDraft, clearDraft, DraftEnvelope } from "@/lib/draft";

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

// N2/F3 — does the given mode hold real work worth confirming before we clear it?
const hasRoadData = (f: SoluxForm) =>
  f.roadProfile.length > 0 || f.roadDocuments.length > 0 ||
  Object.keys(f.roadSegmentLighting).length > 0 || !!f.roadProfileNotes;
const hasZoneData = (f: SoluxForm) =>
  f.areas.length > 0 || f.pdfPlan.zones.length > 0 || Object.keys(f.zoneLightingData).length > 0;

const NIGHT_MIN_H = 4;
const NIGHT_MAX_H = 24; // matches the Lighting Program table bounds
const clampNightHours = (h: number) => Math.min(NIGHT_MAX_H, Math.max(NIGHT_MIN_H, snapHalf(h)));

const SoluxIntake = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [lang, setLang] = useState<"fr" | "en">("en");
  const [form, setForm] = useState<SoluxForm>(() => deepClone(defaultForm));
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [computingDusk, setComputingDusk] = useState(false);
  // Export doc is mounted only while an export runs (P2 — it re-rendered the
  // whole submission document on every keystroke before).
  const [exportDocMounted, setExportDocMounted] = useState(false);
  const directExportRef = useRef<HTMLDivElement>(null);

  const l = useCallback((fr: string, en: string) => (lang === "fr" ? fr : en), [lang]);

  // --- C1/U1: local autosave, restore banner, dirty-state exit guard ---
  const [pendingDraft, setPendingDraft] = useState<DraftEnvelope | null>(() => loadDraft());
  const dirtyRef = useRef(false);
  const firstRenderRef = useRef(true);
  const autosaveWarnedRef = useRef(false);
  // C2 — suppress the one autosave that would otherwise fire right after a
  // successful submit and re-create the draft that submit just cleared.
  const justSubmittedRef = useRef(false);
  // F3 — synchronous double-submit guard (setSubmitting is async, so a fast
  // double-click can enter onSubmit twice before the button disables).
  const submittingRef = useRef(false);
  // C5 — the currently-selected zone, read at auto-calc call time so a slow
  // geocode result never lands on a different zone the user switched to.
  const assignedAreaRef = useRef(form.assignedArea);
  assignedAreaRef.current = form.assignedArea;
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    // While the restore banner is open, don't clobber the stored draft with
    // the pristine form the user hasn't chosen yet.
    if (pendingDraft) return;
    // C2 — never autosave during a submit (the pending timer is cancelled by
    // cleanup when `submitting` flips), and skip the single run triggered when
    // submitting flips back to false, or we'd re-persist the draft submit just
    // cleared and it would reappear as an "unsent draft".
    if (submitting) return;
    if (justSubmittedRef.current) { justSubmittedRef.current = false; return; }
    dirtyRef.current = true;
    const t = setTimeout(() => {
      const outcome = saveDraft(form);
      // N3: autosave used to fail silently when storage was full. Warn once so
      // the user knows to save the project / trim attachments; reset once it
      // recovers so a later failure warns again.
      if (outcome === "failed" && !autosaveWarnedRef.current) {
        autosaveWarnedRef.current = true;
        toast({
          title: l("Sauvegarde automatique en pause", "Autosave paused"),
          description: l(
            "Le stockage du navigateur est plein. Enregistrez le projet ou réduisez les pièces jointes.",
            "Browser storage is full. Save the project or reduce attachments.",
          ),
          variant: "destructive",
        });
      } else if (outcome !== "failed") {
        autosaveWarnedRef.current = false;
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, pendingDraft, submitting, toast, l]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const salesName = user?.email?.split("@")[0] || "";
  const nowStr = new Date().toLocaleString();

  const onChange = useCallback(<K extends keyof SoluxForm>(key: K, val: SoluxForm[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  const restorePendingDraft = useCallback(() => {
    setPendingDraft((draft) => {
      if (draft) {
        setForm(draft.form);
        toast({
          title: l("Brouillon restauré", "Draft restored"),
          description: l(
            "Les fichiers téléchargés doivent être re-téléchargés (le navigateur ne conserve pas les fichiers).",
            "Uploaded files must be re-uploaded (the browser can't keep file bytes between sessions).",
          ),
        });
      }
      return null;
    });
  }, [toast, l]);

  const discardPendingDraft = useCallback(() => {
    clearDraft();
    setPendingDraft(null);
  }, []);

  // U1 — load a saved project from the local library.
  const handleLoadProject = useCallback((loaded: SoluxForm) => {
    setForm(loaded);
    toast({
      title: l("Projet chargé", "Project loaded"),
      description: l("Fichiers à re-télécharger si nécessaire.", "Re-upload files where needed."),
    });
  }, [toast, l]);

  // N2/F3 — project-type switch clears the OTHER mode's data so it isn't kept
  // in state, autosaved and submitted. Confirm first when that mode holds work.
  const [pendingType, setPendingType] = useState<null | "zone" | "road">(null);
  const doSwitchType = useCallback((target: "zone" | "road") => {
    setForm((current) => {
      if (target === "zone") {
        // leaving road — drop road-only data, revoking its blob previews
        current.roadDocuments.forEach((d) => {
          if (d.annotation.pdfUrl?.startsWith("blob:")) URL.revokeObjectURL(d.annotation.pdfUrl);
        });
        return {
          ...current,
          projectType: "zone",
          roadProfile: [],
          roadLighting: deepClone(defaultLightingSetup),
          roadSegmentLighting: {},
          roadDocuments: [],
          roadProfileNotes: "",
          roadInputMode: "builder",
        };
      }
      // leaving zone — drop zone-only geometry/levels (the shared program fields stay)
      if (current.pdfPlan.pdfUrl?.startsWith("blob:")) URL.revokeObjectURL(current.pdfPlan.pdfUrl);
      return {
        ...current,
        projectType: "road",
        areas: [],
        lampposts: [],
        pdfPlan: deepClone(defaultForm.pdfPlan),
        zoneLightingData: {},
        assignedArea: "",
        multiProduct: false,
        productAssignments: [],
      };
    });
  }, []);
  const requestSwitchType = (target: "zone" | "road") => {
    if (form.projectType === target) return;
    const leavingHasData = form.projectType === "road" ? hasRoadData(form) : hasZoneData(form);
    if (leavingHasData) setPendingType(target);
    else doSwitchType(target);
  };

  // --- P1: stable handlers + memoized value objects so the heavy child
  // sections can be memo()-ized and skip re-renders while you type elsewhere.
  const handleRoadDocumentsChange = useCallback((docs: ProjectDocument[]) => onChange("roadDocuments", docs), [onChange]);
  const handleRoadProfileNotesChange = useCallback((v: string) => onChange("roadProfileNotes", v), [onChange]);
  const handlePdfPlanChange = useCallback((val: SoluxForm["pdfPlan"]) => onChange("pdfPlan", val), [onChange]);
  const handleRoadProfileChange = useCallback((v: SoluxForm["roadProfile"]) => {
    // F2 — prune per-segment levels whose segment was removed, so orphan entries
    // aren't kept in state, autosaved and submitted for segments that no longer exist.
    setForm((f) => {
      const validIds = new Set(v.map((s) => s.id));
      let pruned = f.roadSegmentLighting;
      const orphan = Object.keys(f.roadSegmentLighting).some((k) => !validIds.has(k));
      if (orphan) {
        pruned = {};
        Object.keys(f.roadSegmentLighting).forEach((k) => {
          if (validIds.has(k)) pruned[k] = f.roadSegmentLighting[k];
        });
      }
      return { ...f, roadProfile: v, roadSegmentLighting: pruned };
    });
  }, []);
  const handleRoadLightingChange = useCallback((v: SoluxForm["roadLighting"]) => onChange("roadLighting", v), [onChange]);
  const mapValue = useMemo(() => ({
    address: form.address,
    location: form.location,
    areas: form.areas,
    lampposts: form.lampposts,
  }), [form.address, form.location, form.areas, form.lampposts]);
  const zoneProgram = useMemo(() => ({
    nightHours: form.lightingNightHours,
    morningTimeH: form.morningTimeH,
    morningIntensityPct: form.morningIntensityPct,
    segments: form.lightingSegments,
  }), [form.lightingNightHours, form.morningTimeH, form.morningIntensityPct, form.lightingSegments]);

  // P2 — mount the hidden export document only for the duration of an export.
  const prepareExportDoc = useCallback(async () => {
    setExportDocMounted(true);
    await new Promise((r) => setTimeout(r, 150)); // let it paint before capture
  }, []);
  const cleanupExportDoc = useCallback(() => setExportDocMounted(false), []);

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

  // Validation — mode-aware (C2/C3):
  // - Address comes from the zone map; road mode has no address input, so it
  //   is only required for zone projects.
  // - Product: zone validates the global product; Work-From-PDF-Profile
  //   validates each profile (chosen product OR "Study Lab recommends");
  //   road builder needs neither (the luminaire lives in the road layout).
  const isProfilesMode = form.projectType === "road" && form.roadInputMode === "pdf_profile";
  const requiredErrors = useMemo(() => {
    const errs: string[] = [];
    const isNum = (v: string) => v !== "" && !isNaN(Number(v.replace(",", ".")));
    if (!form.projectName) errs.push(l("Nom du projet", "Project Name"));
    if (!form.clientName) errs.push(l("Nom du client", "Client Name"));
    if (!form.locality) errs.push(l("Localité", "City/Location"));
    if (!form.country) errs.push(l("Pays", "Country"));
    if (form.projectType === "zone") {
      if (!form.address) errs.push(l("Adresse", "Project Address"));
      if (!isNum(form.avgLux)) errs.push(l("Éclairement moyen", "Average Illuminance"));
      if (!form.cct) errs.push(l("Température de couleur", "Color Temperature"));
      if (!form.product) errs.push(l("Produit", "Product Selection"));
    }
    if (isProfilesMode) {
      if (form.roadDocuments.length === 0) {
        errs.push(l("Document du client (profil)", "Customer profile document"));
      }
      form.roadDocuments.forEach((d, i) => {
        if (!d.config.recommendProduct && !d.config.product) {
          errs.push(`${l("Produit", "Product")} — ${d.profileName || `${l("Profil", "Profile")} ${i + 1}`}`);
        }
      });
    }
    return errs;
  }, [form, l, isProfilesMode]);

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
    // U2 — soft completeness nudge (non-blocking): profiles with no lighting
    // levels at all are flagged; the Study Lab will otherwise assume defaults.
    if (isProfilesMode) {
      const emptyProfiles = form.roadDocuments
        .filter((d) => !d.segments.some((s) => s.avgLux || s.minLux || s.uniformity))
        .map((d) => d.profileName || d.fileName);
      if (emptyProfiles.length > 0) {
        toast({
          title: l("Niveaux d'éclairage non renseignés", "Lighting levels not specified"),
          description: `${emptyProfiles.join(", ")} — ${l("le Study Lab choisira les niveaux.", "the Study Lab will decide the levels.")}`,
        });
      }
    }
    // F3 — reject a second concurrent submit synchronously (before the async
    // setSubmitting re-render disables the button).
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await saveSubmission(form, { salesName });
      if (result.fileUploadWarning) {
        toast({
          title: l("Fichiers non joints", "Files not attached"),
          description: result.fileUploadWarning,
        });
      }
      // The request is safely in the database — the local draft has done its job.
      clearDraft();
      dirtyRef.current = false;
      justSubmittedRef.current = true; // C2: don't let autosave re-create the draft
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
      submittingRef.current = false;
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

  // P4 — stable per-field handlers so the memoized ProductSelectionSection can
  // skip re-renders while the user types in unrelated fields.
  const psProduct = useCallback((v: string) => syncAssignedZoneData({ product: v }), [syncAssignedZoneData]);
  const psHeight = useCallback((v: string) => syncAssignedZoneData({ luminaireHeight: v }), [syncAssignedZoneData]);
  const psSpacing = useCallback((v: string) => syncAssignedZoneData({ spacing: v }), [syncAssignedZoneData]);
  const psOptHeight = useCallback((v: boolean) => syncAssignedZoneData({ optimizeHeight: v }), [syncAssignedZoneData]);
  const psOptSpacing = useCallback((v: boolean) => syncAssignedZoneData({ optimizeSpacing: v }), [syncAssignedZoneData]);
  const psBatteryChoice = useCallback((v: "standard" | "custom") => syncAssignedZoneData({ batteryChoice: v }), [syncAssignedZoneData]);
  const psBatteryWh = useCallback((v: string) => syncAssignedZoneData({ batteryWh: v }), [syncAssignedZoneData]);
  const psPanelChoice = useCallback((v: "standard" | "custom") => syncAssignedZoneData({ panelChoice: v }), [syncAssignedZoneData]);
  const psPanelWp = useCallback((v: string) => syncAssignedZoneData({ panelWp: v }), [syncAssignedZoneData]);
  const psAltAccepted = useCallback((v: boolean) => syncAssignedZoneData({ alternativeAccepted: v }), [syncAssignedZoneData]);
  const psAltDetails = useCallback((v: string) => syncAssignedZoneData({ alternativeDetails: v }), [syncAssignedZoneData]);

  // Compute the worst-case sizing references (longest night + winter-solstice
  // sunset) from the project's latitude, then auto-fill the night duration and
  // the program start time. Uses the map pin when available, otherwise geocodes
  // the typed city/address.
  const handleAutoCalcNight = useCallback(async () => {
    setComputingDusk(true);
    // C5 — remember which zone was selected when the button was clicked.
    const startZone = assignedAreaRef.current;
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

      let bailedOnZoneChange = false;
      setForm((current) => {
        // C5 — if the user switched zones while we were computing, don't apply
        // this zone's result to a different zone. Leave everything untouched.
        if (current.assignedArea !== startZone) {
          bailedOnZoneChange = true;
          return current;
        }
        // Standard periods cover the night minus the fixed Morning Time block.
        const scaled = rescaleSegmentsToTotal(current.lightingSegments, Math.max(1, nightH - current.morningTimeH));
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

      if (bailedOnZoneChange) {
        toast({
          title: l("Zone changée", "Zone changed"),
          description: l("La zone a changé pendant le calcul — relancez le calcul pour la zone sélectionnée.", "The selected zone changed during the calculation — run it again for the current zone."),
          variant: "destructive",
        });
        return;
      }

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
            {/* I4 — scale down earlier so the title doesn't wrap awkwardly at mid widths */}
            <h1 className="text-lg md:text-2xl lg:text-3xl font-bold leading-tight">
              {l("Solux – Formulaire d'étude d'éclairage", "Solux – Professional Lighting Study Request")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ProjectsMenu form={form} onLoad={handleLoadProject} lang={lang} />
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
        {/* C1 — pending draft restore banner */}
        {pendingDraft && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <span className="text-xl">🕘</span>
            <div className="flex-1 min-w-[240px]">
              <p className="text-sm font-medium">
                {l("Un brouillon non envoyé a été retrouvé", "An unsent draft was found")}
                {pendingDraft.savedAt && (
                  <span className="text-muted-foreground font-normal"> · {new Date(pendingDraft.savedAt).toLocaleString()}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {l("Les fichiers devront être re-téléchargés.", "Files will need to be re-uploaded.")}
              </p>
            </div>
            <Button type="button" size="sm" onClick={restorePendingDraft}>
              {l("Restaurer", "Restore")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={discardPendingDraft}>
              {l("Ignorer", "Discard")}
            </Button>
          </div>
        )}
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
                      <Input value={form.projectName} onChange={(e) => onChange("projectName", e.target.value)} maxLength={120} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Nom du client *", "Client Name *")}</Label>
                      <Input value={form.clientName} onChange={(e) => onChange("clientName", e.target.value)} maxLength={120} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Localité *", "City/Location *")}</Label>
                      <Input value={form.locality} onChange={(e) => onChange("locality", e.target.value)} maxLength={120} required />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Pays *", "Country *")}</Label>
                      <Input value={form.country} onChange={(e) => onChange("country", e.target.value)} maxLength={80} required />
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
                      onClick={() => requestSwitchType("zone")}
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
                      onClick={() => requestSwitchType("road")}
                    >
                      <span className="text-2xl">🛣️</span>
                      <h3 className="font-semibold mt-2">{l("Éclairage routier", "Road & Street Lighting")}</h3>
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
                            value={mapValue}
                            onChange={handleMapSectionChange}
                            onMapViewChange={handleMapViewChange}
                            lang={lang}
                          />
                        </TabsContent>
                        <TabsContent value="pdf">
                          <PdfZoneEditor
                            value={form.pdfPlan}
                            onChange={handlePdfPlanChange}
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
                          <Input type="number" inputMode="decimal" min={0} step="0.5" value={form.avgLux} onChange={(e) => syncAssignedZoneData({ avgLux: e.target.value })} placeholder="15" required />
                        </div>
                        <div className="space-y-2">
                          <Label>{l("Uniformité minimale (optionnel)", "Minimum Uniformity Ratio (optional)")}</Label>
                          <Input type="number" inputMode="decimal" min={0} max={1} step="0.05" value={form.uniformity} onChange={(e) => syncAssignedZoneData({ uniformity: e.target.value })} placeholder="0.6" />
                        </div>
                        <div className="space-y-2">
                          <Label>{l("Lux minimum (optionnel)", "Minimum Lux (optional)")}</Label>
                          <Input type="number" inputMode="decimal" min={0} step="0.5" value={form.minLux} onChange={(e) => syncAssignedZoneData({ minLux: e.target.value })} placeholder="4" />
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
                      <RoadBuilder value={form.roadProfile} onChange={handleRoadProfileChange} lang={lang} />
                    </section>

                    <section>
                      <h3 className="text-lg font-semibold mb-4">{l("Configuration d'éclairage routier", "Road Lighting Layout")}</h3>
                      <RoadLightingLayout
                        value={form.roadLighting}
                        onChange={handleRoadLightingChange}
                        roadProfile={form.roadProfile}
                        lang={lang}
                      />
                    </section>

                    {/* Per-segment lighting levels — keyed by segment id so two
                        segments of the same type can carry different levels (F2). */}
                    {form.roadProfile.length > 0 && (
                      <section>
                        <h3 className="text-lg font-semibold mb-4">{l("Niveaux d'éclairage par segment", "Per-Segment Lighting Levels")}</h3>
                        {form.roadProfile.map((seg, i) => {
                          const segInfo = SEGMENT_TYPES.find((t) => t.value === seg.type);
                          const segLabel = segInfo ? (lang === "fr" ? segInfo.labelFr : segInfo.labelEn) : seg.type;
                          const segLighting = form.roadSegmentLighting[seg.id] || { avgLux: "", uniformity: "", minLux: "", cct: "4000K" };
                          const setSeg = (patch: Partial<typeof segLighting>) => onChange("roadSegmentLighting", {
                            ...form.roadSegmentLighting,
                            [seg.id]: { ...segLighting, ...patch },
                          });
                          return (
                            <Card key={seg.id} className="mb-4">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[seg.type] }} />
                                  <span className="font-medium">{segLabel}</span>
                                  <span className="text-xs text-muted-foreground">#{i + 1} · {seg.width}m</span>
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Lux moyen", "Average Lux")}</Label>
                                    <Input value={segLighting.avgLux} onChange={(e) => setSeg({ avgLux: e.target.value })} placeholder="15" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Uniformité", "Uniformity")}</Label>
                                    <Input value={segLighting.uniformity} onChange={(e) => setSeg({ uniformity: e.target.value })} placeholder="0.6" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">{l("Lux min", "Min Lux")}</Label>
                                    <Input value={segLighting.minLux} onChange={(e) => setSeg({ minLux: e.target.value })} placeholder="4" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">CCT</Label>
                                    <Select value={segLighting.cct} onValueChange={(v) => setSeg({ cct: v })}>
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
                        onChange={handleRoadDocumentsChange}
                        notes={form.roadProfileNotes}
                        onNotesChange={handleRoadProfileNotesChange}
                        lang={lang}
                      />
                    </TabsContent>
                  </Tabs>
                )}

                <Separator />

                {/* Section 4: Product Selection — hidden in Work-From-PDF-Profile
                    mode, where the requested product lives on each profile (U3). */}
                {!isProfilesMode && (
                <>
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
                    onProductChange={psProduct}
                    luminaireHeight={form.luminaireHeight}
                    onLuminaireHeightChange={psHeight}
                    spacing={form.spacing}
                    onSpacingChange={psSpacing}
                    optimizeHeight={form.optimizeHeight}
                    onOptimizeHeightChange={psOptHeight}
                    optimizeSpacing={form.optimizeSpacing}
                    onOptimizeSpacingChange={psOptSpacing}
                    batteryChoice={form.batteryChoice}
                    onBatteryChoiceChange={psBatteryChoice}
                    batteryWh={form.batteryWh}
                    onBatteryWhChange={psBatteryWh}
                    panelChoice={form.panelChoice}
                    onPanelChoiceChange={psPanelChoice}
                    panelWp={form.panelWp}
                    onPanelWpChange={psPanelWp}
                    alternativeAccepted={form.alternativeAccepted}
                    onAlternativeAcceptedChange={psAltAccepted}
                    alternativeDetails={form.alternativeDetails}
                    onAlternativeDetailsChange={psAltDetails}
                    hideMultiToggle
                    lang={lang}
                  />
                </section>

                <Separator />
                </>
                )}

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
                    value={zoneProgram}
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

                {/* Section 6: Multi-Product Toggle — zone-only concept (U3) */}
                {form.projectType === "zone" && (
                <>
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
                              id: uid(),
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
                </>
                )}

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
                      prepare={prepareExportDoc}
                      cleanup={cleanupExportDoc}
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

        {/* Hidden PDF document — mounted only while an export runs (P2), so
            typing in the form doesn't re-render the whole submission document. */}
        {exportDocMounted && (
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
        )}

        {/* N2/F3 — confirm before a project-type switch discards the other mode's work. */}
        <AlertDialog open={pendingType !== null} onOpenChange={(o) => { if (!o) setPendingType(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{l("Changer de type de projet ?", "Change project type?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {form.projectType === "road"
                  ? l("Vos données routières (profils, segments, notes) seront effacées.", "Your road work (profiles, road segments, notes) will be cleared.")
                  : l("Vos données de zone (carte, zones dessinées, niveaux) seront effacées.", "Your zone work (map, drawn zones, levels) will be cleared.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{l("Annuler", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (pendingType) doSwitchType(pendingType); setPendingType(null); }}
              >
                {l("Changer et effacer", "Switch & clear")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default SoluxIntake;
