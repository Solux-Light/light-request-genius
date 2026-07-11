import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { deepClone } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Home, Send, Globe, MessageSquareText, AlertCircle, PenTool, Trash2, FileUp } from "lucide-react";
import GoogleMapSection from "@/components/GoogleMapSection";
import PdfZoneEditor from "@/components/PdfZoneEditor";
import ProductSelectionSection from "@/components/ProductSelectionSection";
import MultiProductSection from "@/components/MultiProductSection";
import LightingProgramTable from "@/components/LightingProgramTable";
import CctSelect from "@/components/CctSelect";
import StepHeader from "@/components/StepHeader";
import RoadBuilder from "@/components/RoadBuilder";
import RoadLightingLayout from "@/components/RoadLightingLayout";
import RoadPerSegmentLevels from "@/components/RoadPerSegmentLevels";
import ProjectDocumentsSection from "@/components/ProjectDocumentsSection";
import PdfSubmissionDocument from "@/components/PdfSubmissionDocument";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import PdfExportButton from "@/components/PdfExportButton";
import ProjectsMenu from "@/components/ProjectsMenu";
import { SoluxForm, defaultForm, createDefaultZoneLightingData, formFieldsToZoneData, zoneDataToFormFields, ProjectDocument, migrateLegacyLuminaireFamily, PRODUCT_FAMILIES } from "@/types/solux";
import { saveSubmission } from "@/lib/submissions";
import { geocodeCity, resolveWinterSolsticeDusk } from "@/lib/solarNight";
import { buildProjectKml, downloadKml } from "@/lib/kml";
import { rescaleSegmentsToTotal, snapHalf } from "@/lib/program";
import { saveDraft, loadDraft, clearDraft, DraftEnvelope } from "@/lib/draft";
import { validateForm, hasZoneGeometry, Finding } from "@/lib/validation";
import FieldMessage from "@/components/FieldMessage";
import ConfirmButton from "@/components/ConfirmButton";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// N2/F3 — does the given mode hold real work worth confirming before we clear it?
const hasRoadData = (f: SoluxForm) =>
  f.roadProfile.length > 0 || f.roadDocuments.length > 0 ||
  Object.keys(f.roadSegmentLighting).length > 0 || !!f.roadProfileNotes;
const hasZoneData = (f: SoluxForm) =>
  f.areas.length > 0 || f.pdfPlan.zones.length > 0 || Object.keys(f.zoneLightingData).length > 0;

const NIGHT_MIN_H = 4;
const NIGHT_MAX_H = 24; // matches the Lighting Program table bounds
const clampNightHours = (h: number) => Math.min(NIGHT_MAX_H, Math.max(NIGHT_MIN_H, snapHalf(h)));

// Supporting-document uploads (P7): every common project format, never a
// silent rejection. Files can't be persisted locally (browser storage can't
// hold bytes) — they travel with the request at submit time.
const ATTACHMENT_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.xls,.xlsx,.csv,.kml,.kmz,.zip";
const ATTACHMENT_EXTENSIONS = new Set(ATTACHMENT_ACCEPT.split(",").map((e) => e.replace(".", "")));
const MAX_ATTACHMENT_MB = 25;
const formatFileSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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
  // ONE date format everywhere (form + PDF): medium date + short time in the
  // active language.
  const nowStr = new Date().toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const todayISO = new Date().toISOString().slice(0, 10);

  // Prefill the contact name from the signed-in account when available; the
  // field stays editable (the preparer may file for a colleague).
  useEffect(() => {
    if (salesName) {
      setForm((f) => (f.preparedBy ? f : { ...f, preparedBy: salesName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesName]);

  const onChange = useCallback(<K extends keyof SoluxForm>(key: K, val: SoluxForm[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  }, []);

  // P7 — append newly-picked files, explaining every rejection precisely.
  const handleFilesAdded = useCallback((picked: File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];
    picked.forEach((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ATTACHMENT_EXTENSIONS.has(ext)) {
        rejected.push(`${f.name} — ${l("format non pris en charge. Utilisez PDF, DWG, DXF, image, tableur, KML/KMZ ou ZIP.", "unsupported format. Please use PDF, DWG, DXF, image, spreadsheet, KML/KMZ or ZIP.")}`);
      } else if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        rejected.push(`${f.name} — ${l(`dépasse ${MAX_ATTACHMENT_MB} Mo (${formatFileSize(f.size)}).`, `exceeds ${MAX_ATTACHMENT_MB} MB (${formatFileSize(f.size)}).`)}`);
      } else {
        accepted.push(f);
      }
    });
    if (accepted.length > 0) {
      setFiles((prev) => {
        const seen = new Set(prev.map((p) => `${p.name}|${p.size}`));
        return [...prev, ...accepted.filter((f) => !seen.has(`${f.name}|${f.size}`))];
      });
    }
    if (rejected.length > 0) {
      toast({
        title: l("Fichier(s) non ajouté(s)", "File(s) not added"),
        description: rejected.join(" · "),
        variant: "destructive",
      });
    }
  }, [toast, l]);

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

  // Project-type switch PRESERVES both modes' data in the background: nothing
  // is cleared, so picking the wrong type at minute 1 costs nothing at minute
  // 20. The PDF/preview only render the ACTIVE mode's sections, so background
  // data never leaks into the document. A short toast tells the user their
  // other-mode work is kept.
  const requestSwitchType = (target: "zone" | "road") => {
    if (form.projectType === target) return;
    const leavingHasData = form.projectType === "road" ? hasRoadData(form) : hasZoneData(form);
    onChange("projectType", target);
    if (leavingHasData) {
      toast({
        title: l("Type de projet changé", "Project type changed"),
        description: form.projectType === "road"
          ? l("Vos données routières sont conservées — elles reviendront si vous repassez en Éclairage routier.", "Your road data is kept — it will return if you switch back to Road & Street Lighting.")
          : l("Vos données de zone sont conservées — elles reviendront si vous repassez en Éclairage de zone.", "Your zone data is kept — it will return if you switch back to Area Lighting."),
      });
    }
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
  const handleRoadLightingChange = useCallback((v: SoluxForm["roadLighting"]) => {
    // Family (luminaire) changed → drop a now-incompatible model so the
    // "Product model" select never carries a model from another family.
    setForm((f) => {
      const fam = migrateLegacyLuminaireFamily(v.luminaire);
      const modelOk = !f.product || (PRODUCT_FAMILIES[fam] ?? []).includes(f.product);
      return {
        ...f,
        roadLighting: v,
        ...(modelOk ? {} : { product: "", productModelPending: false }),
      };
    });
  }, []);
  const handleRoadSegmentLightingChange = useCallback((v: SoluxForm["roadSegmentLighting"]) => onChange("roadSegmentLighting", v), [onChange]);
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

  // Validation (V1) — central rules in lib/validation. Behaviour:
  // - `invalid` findings (impossible values) are shown inline immediately;
  // - `required` findings only appear after a submit attempt, so a fresh form
  //   isn't covered in red;
  // - `warning` findings are amber, informative and never block.
  const isProfilesMode = form.projectType === "road" && form.roadInputMode === "pdf_profile";
  const validation = useMemo(() => validateForm(form, l), [form, l]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Incremented by "Draw a study zone" — the map section activates the Lasso
  // tool when it changes, connecting the empty state to the actual tool.
  const [lassoSignal, setLassoSignal] = useState(0);

  // First message per field, split by what the inline UI should show now.
  const fieldErrors = useMemo(() => {
    const out: Record<string, string> = {};
    validation.findings.forEach((f) => {
      if (out[f.field]) return;
      if (f.severity === "invalid" || (f.severity === "required" && attemptedSubmit)) out[f.field] = f.message;
    });
    return out;
  }, [validation, attemptedSubmit]);
  const fieldWarnings = useMemo(() => {
    const out: Record<string, string> = {};
    validation.findings.forEach((f) => {
      if (f.severity === "warning" && !out[f.field]) out[f.field] = f.message;
    });
    return out;
  }, [validation]);

  const scrollToField = useCallback((field: string) => {
    const el = document.getElementById(`field-${field}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = el.querySelector<HTMLElement>("input, [role='combobox'], textarea");
      input?.focus({ preventScroll: true });
    }
  }, []);

  const projectSlug = form.projectName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
  const zoneGeometryExists = hasZoneGeometry(form);
  const attachmentMeta = useMemo(() => files.map((f) => ({ name: f.name, size: f.size })), [files]);

  // Export gate (P9): exporting with missing required data or, in zone mode,
  // with no drawn geometry is allowed — but only after an explicit, honest
  // confirmation listing exactly what the document will lack.
  const [exportGate, setExportGate] = useState<{ issues: string[]; resolve: (go: boolean) => void } | null>(null);
  const confirmExportIfIncomplete = useCallback((): Promise<boolean> => {
    const issues: string[] = [];
    validation.blocking.forEach((f) => issues.push(`${f.label} — ${f.message}`));
    if (form.projectType === "zone" && !hasZoneGeometry(form)) {
      issues.push(l(
        "Aucune géométrie d'étude définie — le PDF sera généré sans zones et aucun fichier KML ne sera disponible.",
        "No study geometry has been defined — the PDF will be generated without zones and no KML file will be available.",
      ));
    }
    if (issues.length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setExportGate({ issues, resolve }));
  }, [validation, form, l]);

  const handleKmlExport = useCallback(() => {
    if (!form.location) return;
    const kml = buildProjectKml({
      projectName: form.projectName,
      address: form.address,
      location: form.location,
      areas: form.areas,
      lampposts: form.lampposts,
    });
    downloadKml(kml, `${projectSlug}.kml`);
    toast({
      title: l("Fichier KML créé", "KML file ready"),
      description: l(
        `${projectSlug}.kml téléchargé — ${form.areas.length} zone(s), ${form.lampposts.length} lampadaire(s). Ouvrez-le dans Google Earth.`,
        `${projectSlug}.kml downloaded — ${form.areas.length} zone(s), ${form.lampposts.length} lamp post(s). Open it in Google Earth.`,
      ),
    });
  }, [form.location, form.projectName, form.address, form.areas, form.lampposts, projectSlug, toast, l]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validation.blocking.length > 0) {
      setAttemptedSubmit(true);
      // Inline messages + the summary card carry the detail; the toast is just
      // the short global signal that something needs attention.
      toast({
        title: l("Vérifiez le formulaire", "Please review the form"),
        description: l(
          `${validation.blocking.length} champ(s) à corriger — voir les messages en rouge.`,
          `${validation.blocking.length} field(s) need attention — see the messages in red.`,
        ),
        variant: "destructive",
      });
      scrollToField(validation.blocking[0].field);
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
      // Human-readable failure — never a serialized object. The draft is still
      // saved locally, so make the safe next step explicit.
      const detail =
        err instanceof Error ? err.message
        : err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : l("Erreur inattendue.", "Unexpected error.");
      toast({
        title: l("Échec de l'envoi", "Submission failed"),
        description: `${detail} — ${l(
          "Vos données restent enregistrées sur ce poste. Réessayez, ou exportez le PDF.",
          "Your data is still saved on this device. Try again, or export the PDF.",
        )}`,
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
    | "productFamily" | "productModelPending"
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
  const psFamily = useCallback((v: string) => syncAssignedZoneData({ productFamily: v }), [syncAssignedZoneData]);
  const psModelPending = useCallback((v: boolean) => syncAssignedZoneData({ productModelPending: v }), [syncAssignedZoneData]);
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
    } catch (err) {
      // Q2 — geocode/timezone helpers swallow their own errors, but guard any
      // unexpected throw so the user gets feedback instead of a silent no-op.
      toast({
        title: l("Échec du calcul", "Calculation failed"),
        description: err instanceof Error ? err.message : l("Réessayez ou placez un point sur la carte.", "Try again, or drop a point on the map."),
        variant: "destructive",
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
              ? formFieldsToZoneData(current)
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
        ...zoneDataToFormFields(zoneData),
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
        {/* flex-wrap — on narrow screens the controls drop below the title
            instead of forcing the whole page wider than the viewport. */}
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2 py-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
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
            <ConfirmButton
              title={l("Supprimer le brouillon ?", "Discard this draft?")}
              description={`${pendingDraft.form.projectName || l("Projet sans nom", "Untitled project")} — ${l(
                "le brouillon sera définitivement supprimé. Cette action ne peut pas être annulée.",
                "the draft will be permanently deleted. This cannot be undone.",
              )}`}
              confirmLabel={l("Supprimer le brouillon", "Discard draft")}
              cancelLabel={l("Conserver", "Keep it")}
              onConfirm={discardPendingDraft}
            >
              <Button type="button" size="sm" variant="ghost">
                {l("Ignorer", "Discard")}
              </Button>
            </ConfirmButton>
          </div>
        )}
        <div className="animate-fade-in">
          <Card>
            <CardContent className="p-6">
              {/* [&>*]:min-w-0 — grid children default to min-width:auto, which
                  lets a wide table (lighting program) force the whole page past
                  the viewport instead of scrolling inside its own container. */}
              <form onSubmit={onSubmit} className="grid gap-8 [&>*]:min-w-0" noValidate>

                {/* Section 1: General Information */}
                <section>
                  <div className="mb-4">
                    <StepHeader n={++stepNo} title={l("Informations générales", "General Information")} hint={l("Identité du projet et du client.", "Project and customer identity.")} />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2" id="field-projectName">
                      <Label>{l("Nom du projet *", "Project Name *")}</Label>
                      <Input value={form.projectName} onChange={(e) => onChange("projectName", e.target.value)} maxLength={120} aria-invalid={!!fieldErrors.projectName} className={fieldErrors.projectName ? "border-destructive" : undefined} />
                      <FieldMessage error={fieldErrors.projectName} />
                    </div>
                    <div className="space-y-2" id="field-clientName">
                      <Label>{l("Nom du client *", "Client Name *")}</Label>
                      <Input value={form.clientName} onChange={(e) => onChange("clientName", e.target.value)} maxLength={120} aria-invalid={!!fieldErrors.clientName} className={fieldErrors.clientName ? "border-destructive" : undefined} />
                      <FieldMessage error={fieldErrors.clientName} />
                    </div>
                    <div className="space-y-2" id="field-locality">
                      <Label>{l("Localité *", "City/Location *")}</Label>
                      <Input value={form.locality} onChange={(e) => onChange("locality", e.target.value)} maxLength={120} aria-invalid={!!fieldErrors.locality} className={fieldErrors.locality ? "border-destructive" : undefined} />
                      <FieldMessage error={fieldErrors.locality} />
                    </div>
                    <div className="space-y-2" id="field-country">
                      <Label>{l("Pays *", "Country *")}</Label>
                      <Input value={form.country} onChange={(e) => onChange("country", e.target.value)} maxLength={80} aria-invalid={!!fieldErrors.country} className={fieldErrors.country ? "border-destructive" : undefined} />
                      <FieldMessage error={fieldErrors.country} />
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
                    <section id="field-address">
                      <div className="mb-4">
                        <StepHeader n={++stepNo} title={l("Emplacement", "Location")} hint={l("Carte interactive ou plan fourni par le client.", "Interactive map or the customer's plan.")} />
                      </div>
                      <FieldMessage error={fieldErrors.address && l("Adresse du projet obligatoire — recherchez l'adresse ou saisissez des coordonnées GPS ci-dessous.", "Project address required — search the address or type GPS coordinates below.")} />
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
                            lassoRequestSignal={lassoSignal}
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
                            ...zoneDataToFormFields(saved),
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
                        // Actionable empty state: say WHAT to do and offer the
                        // one-click way to start doing it.
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
                          <p className="text-sm text-muted-foreground flex-1 min-w-[240px]">
                            {l(
                              "Aucune zone d'étude pour l'instant. Utilisez l'outil Lasso sur la carte pour dessiner la première zone à éclairer.",
                              "No study zone has been created yet. Use the Lasso tool on the map to draw the first study area.",
                            )}
                          </p>
                          {form.locationMode === "map" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setLassoSignal((n) => n + 1);
                                document.getElementById("field-address")?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                            >
                              <PenTool className="h-4 w-4 mr-1.5" />
                              {l("Dessiner une zone d'étude", "Draw a study zone")}
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="mt-4 grid md:grid-cols-4 gap-4">
                        <div className="space-y-2" id="field-avgLux">
                          <Label>{l("Lux moyen minimum *", "Required Average Illuminance (lux) *")}</Label>
                          <Input type="number" inputMode="decimal" min={0} step="0.5" value={form.avgLux} onChange={(e) => syncAssignedZoneData({ avgLux: e.target.value })} placeholder="15" aria-invalid={!!fieldErrors.avgLux} className={fieldErrors.avgLux ? "border-destructive" : undefined} />
                          <FieldMessage error={fieldErrors.avgLux} warning={fieldWarnings.avgLux} />
                        </div>
                        <div className="space-y-2" id="field-uniformity">
                          <Label>{l("Uniformité minimale (optionnel)", "Minimum Uniformity Ratio (optional)")}</Label>
                          <Input type="number" inputMode="decimal" min={0} max={1} step="0.05" value={form.uniformity} onChange={(e) => syncAssignedZoneData({ uniformity: e.target.value })} placeholder="0.6" aria-invalid={!!fieldErrors.uniformity} className={fieldErrors.uniformity ? "border-destructive" : undefined} />
                          <FieldMessage error={fieldErrors.uniformity} warning={fieldWarnings.uniformity} />
                        </div>
                        <div className="space-y-2" id="field-minLux">
                          <Label>{l("Lux minimum (optionnel)", "Minimum Lux (optional)")}</Label>
                          <Input type="number" inputMode="decimal" min={0} step="0.5" value={form.minLux} onChange={(e) => syncAssignedZoneData({ minLux: e.target.value })} placeholder="4" aria-invalid={!!fieldErrors.minLux} className={fieldErrors.minLux ? "border-destructive" : undefined} />
                          <FieldMessage error={fieldErrors.minLux} warning={fieldWarnings.minLux} />
                        </div>
                        <div className="space-y-2" id="field-cct">
                          <Label>{l("CCT en Kelvin *", "Color Temperature (CCT in Kelvin) *")}</Label>
                          <CctSelect value={form.cct} onChange={(v) => syncAssignedZoneData({ cct: v })} />
                          <FieldMessage error={fieldErrors.cct} />
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

                    {/* Per-segment lighting levels — keyed by segment id (F2). */}
                    <RoadPerSegmentLevels
                      roadProfile={form.roadProfile}
                      values={form.roadSegmentLighting}
                      onChange={handleRoadSegmentLightingChange}
                      lang={lang}
                    />
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
                    productFamily={form.projectType === "road"
                      ? migrateLegacyLuminaireFamily(form.roadLighting.luminaire)
                      : form.productFamily}
                    onProductFamilyChange={psFamily}
                    familyReadOnly={form.projectType === "road"}
                    productModelPending={form.productModelPending}
                    onProductModelPendingChange={psModelPending}
                    product={form.product}
                    onProductChange={psProduct}
                    fieldErrors={fieldErrors}
                    fieldWarnings={fieldWarnings}
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
                      hint={l("Saisie directe : durée de nuit, période du matin, périodes, détection.", "Direct entry: night duration, morning period, periods, detection.")}
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
                <MultiProductSection form={form} onChange={onChange} lang={lang} />
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
                      <Label>{l("Pièces jointes", "Supporting Documents")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {l(
                          `Formats acceptés : PDF, Word, images (JPG/PNG/WEBP), tableurs (XLS/XLSX/CSV), CAO (DWG/DXF), KML/KMZ, ZIP — ${MAX_ATTACHMENT_MB} Mo max par fichier.`,
                          `Accepted formats: PDF, Word, images (JPG/PNG/WEBP), spreadsheets (XLS/XLSX/CSV), CAD (DWG/DXF), KML/KMZ, ZIP — max ${MAX_ATTACHMENT_MB} MB per file.`,
                        )}
                      </p>
                      <Input
                        type="file"
                        multiple
                        accept={ATTACHMENT_ACCEPT}
                        onChange={(e) => {
                          handleFilesAdded(Array.from(e.target.files || []));
                          e.target.value = ""; // allow re-selecting the same file
                        }}
                      />
                      {files.length > 0 && (
                        <ul className="space-y-1.5">
                          {files.map((f, i) => (
                            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                              <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="flex-1 min-w-0 truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                              <Button
                                type="button" size="icon" variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                aria-label={l("Retirer le fichier", "Remove file")}
                                title={l("Retirer le fichier", "Remove file")}
                                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 8: Processing Details */}
                <section>
                  <div className="mb-4">
                    <StepHeader
                      n={++stepNo}
                      title={l("Contact & échéance", "Contact & Deadline")}
                      hint={l("Qui contacter pour les questions du Study Lab, et la date cible souhaitée.", "Who the Study Lab should contact with questions, and the requested target date.")}
                    />
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2" id="field-preparedBy">
                      <Label>{l("Demande préparée par", "Request prepared by")}</Label>
                      <Input
                        value={form.preparedBy}
                        onChange={(e) => onChange("preparedBy", e.target.value)}
                        maxLength={120}
                        placeholder={l("Prénom Nom", "First Last")}
                      />
                    </div>
                    <div className="space-y-2" id="field-contactEmail">
                      <Label>{l("Email de contact", "Contact email")}</Label>
                      <Input
                        type="email"
                        value={form.contactEmail}
                        onChange={(e) => onChange("contactEmail", e.target.value)}
                        maxLength={160}
                        placeholder="nom@solux.fr"
                      />
                    </div>
                    <div className="space-y-2" id="field-contactPhone">
                      <Label>{l("Téléphone", "Telephone")}</Label>
                      <Input
                        type="tel"
                        value={form.contactPhone}
                        onChange={(e) => onChange("contactPhone", e.target.value)}
                        maxLength={40}
                        placeholder="+33 …"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Date de la demande", "Request date")}</Label>
                      <Input value={nowStr} readOnly className="bg-muted/40" />
                    </div>
                    <div className="space-y-2">
                      <Label>{l("Priorité", "Priority")}</Label>
                      <Select value={form.deadlinePriority} onValueChange={(v) => onChange("deadlinePriority", v as SoluxForm["deadlinePriority"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">{l("Priorité standard", "Standard priority")}</SelectItem>
                          <SelectItem value="urgent">{l("Urgent", "Urgent")}</SelectItem>
                          <SelectItem value="none">{l("Pas d'échéance fixe", "No fixed deadline")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2" id="field-deadlineDate">
                      <Label>{l("Date de rendu souhaitée", "Requested study completion date")}</Label>
                      <Input
                        type="date"
                        value={form.deadlineDate}
                        min={todayISO}
                        disabled={form.deadlinePriority === "none"}
                        onChange={(e) => onChange("deadlineDate", e.target.value)}
                        aria-invalid={!!fieldErrors.deadlineDate}
                        className={fieldErrors.deadlineDate ? "border-destructive" : undefined}
                      />
                      <p className="text-xs text-muted-foreground">
                        {l(
                          "Date cible souhaitée — ne constitue pas un engagement de livraison.",
                          "This is the requested target date and does not constitute a confirmed delivery commitment.",
                        )}
                      </p>
                      <FieldMessage error={fieldErrors.deadlineDate} />
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Section 9: Footer Actions.
                    Hierarchy: review actions first (Preview → Export → KML,
                    all secondary), then ONE dominant primary action (Submit). */}
                <section>
                  {attemptedSubmit && validation.blocking.length > 0 && (
                    <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/5 p-4" role="alert">
                      <p className="flex items-center gap-2 text-sm font-semibold text-destructive mb-2">
                        <AlertCircle className="h-4 w-4" />
                        {l(
                          `${validation.blocking.length} champ(s) à corriger avant l'envoi`,
                          `${validation.blocking.length} field(s) to fix before submitting`,
                        )}
                      </p>
                      <ul className="space-y-1">
                        {validation.blocking.map((f, i) => (
                          <li key={`${f.field}-${i}`}>
                            <button
                              type="button"
                              className="text-sm text-destructive underline-offset-2 hover:underline text-left"
                              onClick={() => scrollToField(f.field)}
                            >
                              {f.label} — {f.message}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                    <PdfPreviewModal
                      form={form}
                      salesName={form.preparedBy || salesName}
                      nowStr={nowStr}
                      lang={lang}
                      apiKey={GOOGLE_MAPS_API_KEY}
                      attachments={attachmentMeta}
                    />
                    <PdfExportButton
                      contentRef={directExportRef}
                      filename={`${projectSlug}.pdf`}
                      lang={lang}
                      prepare={prepareExportDoc}
                      cleanup={cleanupExportDoc}
                      beforeExport={confirmExportIfIncomplete}
                    />
                    {form.projectType === "zone" && (
                      <span title={!zoneGeometryExists ? l("Dessinez au moins une zone d'étude (ou placez un lampadaire) avant d'exporter un fichier KML.", "Draw at least one study zone (or place a lamp post) before exporting a KML file.") : undefined}>
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          disabled={!zoneGeometryExists || !form.location}
                          onClick={handleKmlExport}
                          title={zoneGeometryExists ? l("Exporter les zones et lampadaires pour Google Earth", "Export zones and lampposts for Google Earth") : undefined}
                        >
                          <Globe className="h-4 w-4 mr-2" />
                          Google Earth (KML)
                        </Button>
                      </span>
                    )}
                    <div className="flex-1" />
                    <Button type="submit" size="lg" className="px-8" disabled={submitting}>
                      <Send className="h-4 w-4 mr-2" />
                      {submitting ? l("Envoi…", "Sending…") : l("Envoyer au bureau d'études", "Submit to Design Team")}
                    </Button>
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
              salesName={form.preparedBy || salesName}
              nowStr={nowStr}
              lang={lang}
              mapPreviewMode="placeholder"
              attachments={attachmentMeta}
            />
          </div>
        )}

        {/* P9 — honest pre-export confirmation when the document would be
            incomplete (missing required fields / no drawn geometry). */}
        <AlertDialog open={exportGate !== null} onOpenChange={(o) => { if (!o && exportGate) { exportGate.resolve(false); setExportGate(null); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{l("Exporter un document incomplet ?", "Export an incomplete document?")}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p className="mb-2">{l("Le PDF peut être généré, mais il manquera :", "The PDF can still be generated, but it will be missing:")}</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {(exportGate?.issues ?? []).map((msg, i) => <li key={i}>{msg}</li>)}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { exportGate?.resolve(false); setExportGate(null); }}>
                {l("Compléter d'abord", "Complete the form first")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => { exportGate?.resolve(true); setExportGate(null); }}>
                {l("Exporter quand même", "Export anyway")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
};

export default SoluxIntake;
