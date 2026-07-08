import { memo, useRef, useState } from "react";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Upload, Trash2, Plus, RefreshCw, FileText, Image as ImageIcon, Box,
  Eye, EyeOff, MessageSquareText, MapPin, Sparkles, Copy, AlertTriangle,
} from "lucide-react";
import PdfZoneEditor from "@/components/PdfZoneEditor";
import ConfirmButton from "@/components/ConfirmButton";
import HeightField from "@/components/HeightField";
import LightingProgramTable from "@/components/LightingProgramTable";
import StepHeader from "@/components/StepHeader";
import {
  ProjectDocument,
  ProjectDocumentKind,
  ProfileSegment,
  ProfileProgram,
  PdfZoneValue,
  PROJECT_DOCUMENT_ACCEPT,
  documentKindFromFile,
  isAnnotatableKind,
  createDefaultProfileConfig,
  createDefaultProfileSegment,
  PRODUCT_FAMILIES,
  ProfileOptimizeFlags,
  PROFILE_SEGMENT_KINDS,
  ROAD_CLASS_OPTIONS,
  formatHeight,
} from "@/types/solux";

interface Props {
  documents: ProjectDocument[];
  onChange: (docs: ProjectDocument[]) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  lang?: "fr" | "en";
}

const emptyAnnotation = (file: File, kind: ProjectDocumentKind): PdfZoneValue => ({
  pdfUrl: isAnnotatableKind(kind) ? URL.createObjectURL(file) : "",
  mediaType: kind === "image" ? "image" : "pdf",
  sourceKind: kind,
  sourceFileName: file.name,
  zones: [],
  lampposts: [],
  previewImage: "",
  viewState: { page: 1, zoom: 1, rotation: 0 },
});

// One upload = one file group with a single default cross-section profile.
// Additional profiles for the SAME drawing are added via addCrossSection below.
// N1: name the default profile after the file so several files uploaded at once
// get distinct names (they were all "Section 1"). Added cross-sections of the
// SAME file are still numbered "Section 2/3…" under that file's group.
const fileBaseName = (name: string) => name.replace(/\.[^./\\]+$/, "").trim() || "Section 1";
const buildDocument = (file: File): ProjectDocument => {
  const kind = documentKindFromFile(file);
  return {
    id: uid(),
    fileGroupId: uid(),
    profileName: fileBaseName(file.name),
    fileName: file.name,
    kind,
    uploadedAt: new Date().toISOString(),
    annotation: emptyAnnotation(file, kind),
    config: createDefaultProfileConfig(),
    segments: [createDefaultProfileSegment("main_road")],
    notes: "",
  };
};

const revokeIfBlob = (url?: string) => {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
};

const KIND_META: Record<ProjectDocumentKind, { icon: typeof FileText; labelEn: string; labelFr: string }> = {
  pdf: { icon: FileText, labelEn: "PDF", labelFr: "PDF" },
  image: { icon: ImageIcon, labelEn: "Image", labelFr: "Image" },
  dwg: { icon: Box, labelEn: "CAD · DWG", labelFr: "CAO · DWG" },
  dxf: { icon: Box, labelEn: "CAD · DXF", labelFr: "CAO · DXF" },
};

// F2 — uniformity and maintenance factor are ratios: clamp to [0, 1].
const clamp01 = (v: string): string => {
  if (v === "") return "";
  const n = parseFloat(v.replace(",", "."));
  if (isNaN(n)) return "";
  return String(Math.min(1, Math.max(0, n)));
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground whitespace-nowrap">
    {children}
  </span>
);

// Compact one-line program description for summaries.
const programShort = (p: ProfileProgram, l: (fr: string, en: string) => string) =>
  `${p.nightHours}h · ${p.segments.length} ${l("périodes", "periods")}${p.morningTimeH > 0 ? ` · 🌅 ${p.morningTimeH}h` : ""}`;

// memo — with stable parent callbacks (P1), typing in unrelated form sections
// no longer re-renders this whole module.
const ProjectDocumentsSection = memo(function ProjectDocumentsSection({ documents, onChange, notes, onNotesChange, lang = "en" }: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState<Record<string, boolean>>({});
  // Which road section the user is currently editing — surfaced in the sticky
  // context header so context isn't lost when scrolling long profiles.
  const [focusedSegId, setFocusedSegId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  // Step 2 — the profile being configured. Fall back to the first profile.
  const selected = documents.find((d) => d.id === selectedId) ?? documents[0] ?? null;

  const segKindLabel = (kind: string) => {
    const k = PROFILE_SEGMENT_KINDS.find((s) => s.value === kind);
    return k ? (lang === "fr" ? k.labelFr : k.labelEn) : kind;
  };
  const segDisplayName = (seg: ProfileSegment) => seg.label || segKindLabel(seg.kind);

  // All mutations flow through docsRef so several synchronous updates in one
  // tick COMPOSE instead of clobbering each other (with plain prop state, two
  // child callbacks in the same event would both map over the same stale array
  // and the last onChange would silently drop the first change).
  const docsRef = useRef(documents);
  docsRef.current = documents;
  const commit = (next: ProjectDocument[]) => {
    docsRef.current = next;
    onChange(next);
  };
  const mutateDoc = (id: string, fn: (d: ProjectDocument) => ProjectDocument) =>
    commit(docsRef.current.map((d) => (d.id === id ? fn(d) : d)));

  const addFiles = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    const docs = arr.map((f) => buildDocument(f));
    commit([...docsRef.current, ...docs]);
    setSelectedId(docs[0].id); // jump straight into the first new profile
  };

  // "Add Cross-Section Profile": a new fully independent profile referencing
  // the SAME uploaded drawing (shared blob URL, fresh annotations/levels/config).
  const addCrossSection = (source: ProjectDocument) => {
    // F1: read the LIVE list — with the stale prop, rapid clicks in one tick
    // all computed the same sibling count and produced duplicate names.
    const siblings = docsRef.current.filter((d) => d.fileGroupId === source.fileGroupId);
    const doc: ProjectDocument = {
      id: uid(),
      fileGroupId: source.fileGroupId,
      profileName: `Section ${siblings.length + 1}`,
      fileName: source.fileName,
      kind: source.kind,
      uploadedAt: source.uploadedAt,
      annotation: {
        pdfUrl: source.annotation.pdfUrl,
        mediaType: source.annotation.mediaType,
        sourceKind: source.annotation.sourceKind,
        sourceFileName: source.annotation.sourceFileName,
        zones: [],
        lampposts: [],
        previewImage: "",
        viewState: { page: 1, zoom: 1, rotation: 0 },
      },
      config: createDefaultProfileConfig(),
      segments: [createDefaultProfileSegment("main_road")],
      notes: "",
    };
    // Keep the group contiguous: insert right after its last sibling.
    const cur = docsRef.current;
    const lastIdx = cur.map((d) => d.fileGroupId).lastIndexOf(source.fileGroupId);
    const next = [...cur];
    next.splice(lastIdx + 1, 0, doc);
    commit(next);
    setSelectedId(doc.id);
  };

  // F4 — true "Duplicate profile": deep-clones the WHOLE profile (levels,
  // product request, program, notes) with fresh ids, sharing the same drawing.
  const duplicateDoc = (source: ProjectDocument) => {
    const clone: ProjectDocument = {
      ...source,
      id: uid(),
      profileName: `${source.profileName || "Section"} (copy)`,
      annotation: {
        ...source.annotation,
        zones: source.annotation.zones.map((z) => ({ ...z, id: uid(), paths: z.paths.map((p) => ({ ...p })) })),
        lampposts: (source.annotation.lampposts ?? []).map((lp) => ({ ...lp, id: uid() })),
      },
      config: {
        ...source.config,
        optimize: { ...source.config.optimize },
        program: {
          ...source.config.program,
          segments: source.config.program.segments.map((s) => ({ ...s, id: uid() })),
        },
      },
      segments: source.segments.map((s) => ({ ...s, id: uid() })),
    };
    const cur = docsRef.current;
    const idx = cur.findIndex((d) => d.id === source.id);
    const next = [...cur];
    next.splice(idx + 1, 0, clone);
    commit(next);
    setSelectedId(clone.id);
  };

  const updateDoc = (id: string, updates: Partial<ProjectDocument>) =>
    mutateDoc(id, (d) => ({ ...d, ...updates }));

  const updateConfig = (doc: ProjectDocument, patch: Partial<ProjectDocument["config"]>) =>
    mutateDoc(doc.id, (d) => ({ ...d, config: { ...d.config, ...patch } }));

  // The compact program table emits the whole next program in ONE callback.
  const updateProgram = (doc: ProjectDocument, program: ProfileProgram) =>
    mutateDoc(doc.id, (d) => ({ ...d, config: { ...d.config, program } }));

  const updateSegment = (doc: ProjectDocument, segId: string, patch: Partial<ProfileSegment>) =>
    mutateDoc(doc.id, (d) => ({ ...d, segments: d.segments.map((s) => (s.id === segId ? { ...s, ...patch } : s)) }));

  // "Copy Lighting Levels from another profile": values map by segment TYPE
  // (Main Road → Main Road, Sidewalk → Sidewalk; "other" matches by label).
  // Matching kinds are updated in order; source kinds missing from the target
  // are appended; target-only kinds are left untouched.
  const copyLevelsFrom = (targetId: string, sourceId: string) => {
    const source = docsRef.current.find((d) => d.id === sourceId);
    if (!source) return;
    const keyOf = (s: ProfileSegment) => (s.kind === "other" ? `other:${s.label.trim().toLowerCase()}` : s.kind);
    mutateDoc(targetId, (target) => {
      const used = new Set<string>();
      const updated = target.segments.map((t) => {
        const match = source.segments.find((s) => keyOf(s) === keyOf(t) && !used.has(s.id));
        if (!match) return t;
        used.add(match.id);
        return {
          ...t,
          avgLux: match.avgLux,
          minLux: match.minLux,
          uniformity: match.uniformity,
          maintenanceFactor: match.maintenanceFactor,
          roadClass: match.roadClass,
          notes: match.notes,
        };
      });
      const additions = source.segments
        .filter((s) => !used.has(s.id))
        .map((s) => ({ ...s, id: uid() }));
      return { ...target, segments: [...updated, ...additions] };
    });
  };

  const removeDoc = (id: string) => {
    const cur = docsRef.current;
    const prev = cur.find((d) => d.id === id);
    const next = cur.filter((d) => d.id !== id);
    // Several cross-section profiles can share one uploaded drawing (same blob
    // URL) — only revoke it once the last profile using it is removed.
    if (prev?.annotation.pdfUrl && !next.some((d) => d.annotation.pdfUrl === prev.annotation.pdfUrl)) {
      revokeIfBlob(prev.annotation.pdfUrl);
    }
    commit(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const replaceFile = (id: string, file: File) => {
    const cur = docsRef.current;
    const prev = cur.find((d) => d.id === id);
    if (prev?.annotation.pdfUrl && !cur.some((d) => d.id !== id && d.annotation.pdfUrl === prev.annotation.pdfUrl)) {
      revokeIfBlob(prev.annotation.pdfUrl);
    }
    const kind = documentKindFromFile(file);
    // The rep's work (targets, product request, program, notes) is preserved —
    // only the underlying plan and its annotations are swapped. The profile
    // detaches into its own file group since it now references a new drawing.
    updateDoc(id, {
      fileName: file.name,
      kind,
      uploadedAt: new Date().toISOString(),
      annotation: emptyAnnotation(file, kind),
      fileGroupId: uid(),
    });
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  const cellInput = "h-8 border-0 bg-transparent px-2 focus-visible:ring-1 focus-visible:ring-primary rounded-none w-full";

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {l(
          "Suivez le déroulé d'un vrai projet : téléchargez le profil du client, sélectionnez-le, décrivez les niveaux d'éclairage demandés, puis l'installation souhaitée et son programme. Le Study Lab déterminera ensuite la solution optimale.",
          "Follow the real project flow: upload the customer's profile, select it, describe the requested lighting levels, then the requested installation and its program. The Study Lab will later determine the optimal solution.",
        )}
      </p>

      {/* Step 1 — Upload */}
      <div>
        <StepHeader
          n={1}
          title={l("Télécharger les profils", "Upload PDF Profiles")}
          hint={l("Chaque fichier devient un profil d'étude indépendant.", "Each file becomes an independent engineering profile.")}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => addInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addInputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          className={`mt-3 cursor-pointer border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-input hover:border-primary/50"
          }`}
        >
          <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">{l("Glissez vos fichiers ici ou cliquez pour parcourir", "Drag your files here or click to browse")}</p>
          <p className="text-xs text-muted-foreground mt-1">PDF · JPG · JPEG · PNG · DWG · DXF</p>
          <input
            ref={addInputRef}
            type="file"
            multiple
            accept={PROJECT_DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      </div>

      {/* Hidden single-file input for Replace */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={PROJECT_DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replaceTargetId.current) replaceFile(replaceTargetId.current, file);
          replaceTargetId.current = null;
          e.target.value = "";
        }}
      />

      {/* Project summary — auto-generated when several profiles exist */}
      {documents.length > 1 && (
        <div>
          <p className="font-semibold mb-2">{l("Synthèse du projet", "Project Summary")}</p>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  {[l("Profil", "Profile"), l("Segments routiers", "Road Segments"), l("Produit demandé", "Requested Product"), l("Hauteur", "Height"), l("Programme", "Program")].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`border-b last:border-0 cursor-pointer hover:bg-muted/30 ${selected?.id === doc.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedId(doc.id)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{doc.profileName || l("Sans nom", "Untitled")}</span>
                      <span className="block text-xs text-muted-foreground">{doc.fileName}</span>
                    </td>
                    <td className="px-3 py-2">{doc.segments.map(segDisplayName).join(" + ") || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {doc.config.recommendProduct
                        ? `✨ ${l("Recommandation Study Lab", "Study Lab recommendation")}`
                        : [doc.config.family, doc.config.product].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{doc.config.optimize?.height ? `✨ ${l("Optimisé", "Optimize")}` : formatHeight(doc.config.height, lang)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{programShort(doc.config.program, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 2 — Select the profile to configure, grouped by uploaded drawing:
          one PDF can contain several cross-sections, each an independent profile. */}
      {documents.length > 0 && (
        <div>
          <StepHeader
            n={2}
            title={l("Sélectionner un profil", "Select Profile")}
            hint={l(
              "Un même PDF peut contenir plusieurs coupes : ajoutez autant de profils que nécessaire, chacun totalement indépendant.",
              "One PDF can contain several cross-sections: add as many profiles as needed, each fully independent.",
            )}
          />
          <div className="mt-3 grid gap-3">
            {documents
              .reduce<{ fileGroupId: string; docs: ProjectDocument[] }[]>((acc, d) => {
                const g = acc.find((x) => x.fileGroupId === d.fileGroupId);
                if (g) g.docs.push(d);
                else acc.push({ fileGroupId: d.fileGroupId, docs: [d] });
                return acc;
              }, [])
              .map((group, gi) => {
                const first = group.docs[0];
                const meta = KIND_META[first.kind];
                const KindIcon = meta.icon;
                return (
                  <div key={group.fileGroupId} className="rounded-lg border overflow-hidden">
                    {/* File header */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
                      <KindIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate">
                        {l("PDF", "PDF")} {gi + 1} · {first.fileName}
                      </span>
                      <Chip>{group.docs.length} {l("profil(s)", "profile(s)")}</Chip>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        onClick={() => addCrossSection(first)}
                      >
                        <Plus className="h-4 w-4 mr-1" /> {l("Ajouter un profil de coupe", "Add Cross-Section Profile")}
                      </Button>
                    </div>
                    {/* Profiles of this file */}
                    <div className="p-2 grid gap-2">
                      {group.docs.map((doc) => {
                        const active = selected?.id === doc.id;
                        return (
                          <button
                            type="button"
                            key={doc.id}
                            onClick={() => setSelectedId(doc.id)}
                            className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                              active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:border-primary/50"
                            }`}
                          >
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/30"}`} />
                            <span className="font-medium">{doc.profileName || l("Sans nom", "Untitled")}</span>
                            <span className="ml-auto hidden md:flex items-center gap-1.5">
                              {/* U2 — completeness cue: flag profiles with no levels entered */}
                              {!doc.segments.some((s) => s.avgLux || s.minLux || s.uniformity) && (
                                <Chip>
                                  <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                                  {l("niveaux vides", "no levels")}
                                </Chip>
                              )}
                              <Chip>{doc.segments.length} {l("segment(s)", "segment(s)")}</Chip>
                              {doc.config.recommendProduct
                                ? <Chip><Sparkles className="h-3 w-3 mr-1" />{l("Reco Study Lab", "Study Lab pick")}</Chip>
                                : doc.config.product && <Chip>{doc.config.product}</Chip>}
                              {doc.config.height && !doc.config.optimize?.height && <Chip>{formatHeight(doc.config.height, lang)}</Chip>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Selected profile configuration.
          No overflow-hidden here: it would break the sticky panel header. */}
      {selected && (() => {
        const focusedSeg = selected.segments.find((s) => s.id === focusedSegId);
        return (
        <div className="rounded-lg border bg-card">
          {/* Sticky panel header — keeps "which profile → which section" visible
              while scrolling. Opaque bg so content doesn't show through. */}
          <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 p-3 border-b rounded-t-lg bg-card/95 backdrop-blur shadow-sm">
            <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold text-primary">
              <MapPin className="h-3.5 w-3.5" />
              {selected.profileName || l("Sans nom", "Untitled")}
              {focusedSeg && (
                <span className="text-primary/70">→ {segDisplayName(focusedSeg)}</span>
              )}
            </span>
            <Input
              value={selected.profileName}
              onChange={(e) => updateDoc(selected.id, { profileName: e.target.value })}
              placeholder={l("Nom du profil", "Profile Name")}
              className="h-9 max-w-[200px] font-medium"
            />
            <span className="hidden md:inline text-xs text-muted-foreground">
              {selected.fileName} · {fmtDate(selected.uploadedAt)}
            </span>
            <div className="ml-auto flex gap-1">
              {isAnnotatableKind(selected.kind) && (
                <Button type="button" size="sm" variant="outline" onClick={() => setShowPlan((m) => ({ ...m, [selected.id]: !m[selected.id] }))}>
                  {showPlan[selected.id] ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                  {showPlan[selected.id] ? l("Masquer le plan", "Hide plan") : l("Voir le plan", "Show plan")}
                </Button>
              )}
              {/* F4 — full deep clone (levels + product + program + notes) */}
              <Button type="button" size="sm" variant="outline" onClick={() => duplicateDoc(selected)}>
                <Copy className="h-4 w-4 mr-1" /> {l("Dupliquer", "Duplicate")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { replaceTargetId.current = selected.id; replaceInputRef.current?.click(); }}>
                <RefreshCw className="h-4 w-4 mr-1" /> {l("Remplacer", "Replace")}
              </Button>
              {/* U4 — deleting a whole profile is irreversible: confirm first */}
              <ConfirmButton
                title={l("Supprimer ce profil ?", "Delete this profile?")}
                description={`${selected.profileName || l("Sans nom", "Untitled")} — ${l("niveaux, produit, programme et notes seront perdus.", "its levels, product, program and notes will be lost.")}`}
                confirmLabel={l("Supprimer", "Delete")}
                cancelLabel={l("Annuler", "Cancel")}
                onConfirm={() => removeDoc(selected.id)}
              >
                <Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" aria-label={l("Supprimer", "Delete")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </ConfirmButton>
            </div>
          </div>

          <div className="p-4 space-y-8">
            {/* Plan & annotations — on demand, keeps the screen clean */}
            {isAnnotatableKind(selected.kind) ? (
              showPlan[selected.id] && (
                <PdfZoneEditor value={selected.annotation} onChange={(val) => updateDoc(selected.id, { annotation: val })} lang={lang} embedded />
              )
            ) : (
              <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                <Box className="h-5 w-5 mx-auto mb-1" />
                {l("Fichier CAO (DWG/DXF) enregistré — aperçu annotable à venir.", "CAD file (DWG/DXF) stored — annotatable preview coming soon.")}
              </div>
            )}

            {/* Step 3 — Lighting Levels (highest priority, engineering table) */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <StepHeader
                  n={3}
                  title={l("Niveaux d'éclairage demandés", "Lighting Levels")}
                  hint={l("Ce que le client demande, par partie de la route. C'est la donnée d'entrée principale du Study Lab.", "What the customer requests, per part of the road. This is the Study Lab's primary input.")}
                />
                <div className="flex shrink-0 items-center gap-2">
                  {documents.length > 1 && (
                    // F1 — a menu of buttons (not a Select): every pick fires, so
                    // choosing the same/first source always copies. A Select
                    // remembers its value and silently no-ops on a repeat pick.
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline" className="h-9">
                          <Copy className="h-4 w-4 mr-1" /> {l("Copier les niveaux de…", "Copy levels from…")}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {documents.filter((d) => d.id !== selected.id).map((d) => (
                          <DropdownMenuItem key={d.id} onSelect={() => copyLevelsFrom(selected.id, d.id)}>
                            {d.profileName || l("Sans nom", "Untitled")} · {d.fileName}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => updateDoc(selected.id, { segments: [...selected.segments, createDefaultProfileSegment("sidewalk")] })}>
                    <Plus className="h-4 w-4 mr-1" /> {l("Ajouter une section", "Add section")}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-2 py-2 font-semibold min-w-[160px]">{l("Segment", "Segment")}</th>
                      <th className="px-2 py-2 font-semibold w-24">{l("Lux moy", "Avg Lux")}</th>
                      <th className="px-2 py-2 font-semibold w-24">{l("Lux min", "Min Lux")}</th>
                      <th className="px-2 py-2 font-semibold w-28">{l("Uniformité", "Uniformity")}</th>
                      <th className="px-2 py-2 font-semibold w-20" title={l("Facteur de maintenance", "Maintenance Factor")}>MF</th>
                      <th className="px-2 py-2 font-semibold w-24">{l("Classe", "Class")}</th>
                      <th className="px-2 py-2 font-semibold min-w-[180px]">{l("Notes", "Notes")}</th>
                      <th className="px-2 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.segments.map((seg) => (
                      <tr key={seg.id} className="border-b last:border-0 align-top" onFocusCapture={() => setFocusedSegId(seg.id)}>
                        <td className="px-1 py-1">
                          <Select value={seg.kind} onValueChange={(v) => updateSegment(selected, seg.id, { kind: v })}>
                            <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-1 focus:ring-primary"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROFILE_SEGMENT_KINDS.map((k) => (
                                <SelectItem key={k.value} value={k.value}>{lang === "fr" ? k.labelFr : k.labelEn}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {seg.kind === "other" && (
                            <Input
                              value={seg.label}
                              onChange={(e) => updateSegment(selected, seg.id, { label: e.target.value })}
                              placeholder={l("Libellé…", "Label…")}
                              className="h-7 mt-1 text-xs"
                            />
                          )}
                        </td>
                        {/* F2 — numeric-only with engineering bounds (MF and U₀ ∈ [0,1]) */}
                        <td className="px-1 py-1"><Input type="number" inputMode="decimal" min={0} step="0.5" className={cellInput} value={seg.avgLux} onChange={(e) => updateSegment(selected, seg.id, { avgLux: e.target.value })} placeholder="20" /></td>
                        <td className="px-1 py-1"><Input type="number" inputMode="decimal" min={0} step="0.5" className={cellInput} value={seg.minLux} onChange={(e) => updateSegment(selected, seg.id, { minLux: e.target.value })} placeholder="8" /></td>
                        <td className="px-1 py-1"><Input type="number" inputMode="decimal" min={0} max={1} step="0.05" className={cellInput} value={seg.uniformity} onChange={(e) => updateSegment(selected, seg.id, { uniformity: clamp01(e.target.value) })} placeholder="0.40" /></td>
                        <td className="px-1 py-1"><Input type="number" inputMode="decimal" min={0} max={1} step="0.05" className={cellInput} value={seg.maintenanceFactor} onChange={(e) => updateSegment(selected, seg.id, { maintenanceFactor: clamp01(e.target.value) })} placeholder="0.80" /></td>
                        <td className="px-1 py-1">
                          <Select value={seg.roadClass} onValueChange={(v) => updateSegment(selected, seg.id, { roadClass: v })}>
                            <SelectTrigger className="h-8 border-0 bg-transparent focus:ring-1 focus:ring-primary"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {ROAD_CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1"><Input className={cellInput} value={seg.notes} onChange={(e) => updateSegment(selected, seg.id, { notes: e.target.value })} placeholder={l("Optionnel", "Optional")} /></td>
                        <td className="px-1 py-1 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => updateDoc(selected.id, { segments: selected.segments.filter((s) => s.id !== seg.id) })}
                            aria-label={l("Supprimer la section", "Remove section")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {selected.segments.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-center text-sm text-muted-foreground">
                          {l("Aucune section — ajoutez la première.", "No sections yet — add the first one.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 4 — Requested product / installation */}
            <div className="space-y-3">
              <StepHeader
                n={4}
                title={l("Produit demandé", "Requested Product")}
                hint={l("L'installation souhaitée par le client. Les optiques restent du ressort du Study Lab.", "The installation the customer requests. Optics remain the Study Lab's optimisation.")}
              />
              {(() => {
                const opt = selected.config.optimize;
                // Functional update so several toggles in one tick compose.
                const setOpt = (key: keyof ProfileOptimizeFlags, v: boolean) =>
                  mutateDoc(selected.id, (d) => ({
                    ...d,
                    config: { ...d.config, optimize: { ...d.config.optimize, [key]: v } },
                  }));
                // Label row with the per-parameter Manual/Optimize switch.
                const FieldHead = ({ label, k }: { label: string; k: keyof ProfileOptimizeFlags }) => (
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{label}</Label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox checked={opt[k]} onCheckedChange={(v) => setOpt(k, !!v)} className="h-3.5 w-3.5" />
                      {l("Optimiser", "Optimize")}
                    </label>
                  </div>
                );
                const Optimized = () => (
                  <div className="flex h-10 items-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-3 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> {l("Optimisé par le Study Lab", "Optimised by Study Lab")}
                  </div>
                );
                return (
                  <div className="space-y-3">
                    {/* Option 2 (anticipates the future product database): the
                        Study Lab analyses the requirements and recommends. */}
                    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm">
                      <Checkbox
                        checked={selected.config.recommendProduct}
                        onCheckedChange={(v) => updateConfig(selected, { recommendProduct: !!v })}
                      />
                      <Sparkles className="h-4 w-4 text-primary" />
                      {l("Laisser le Study Lab recommander le meilleur produit", "Let the Study Lab recommend the best product")}
                    </label>
                    <div className="grid md:grid-cols-3 gap-3">
                    {!selected.config.recommendProduct && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">{l("Famille de produit", "Product Family")}</Label>
                          <Select
                            value={selected.config.family}
                            onValueChange={(v) => {
                              const models = PRODUCT_FAMILIES[v] ?? [];
                              updateConfig(selected, { family: v, product: models.includes(selected.config.product) ? selected.config.product : "" });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder={l("Sélectionner une gamme", "Select a range")} /></SelectTrigger>
                            <SelectContent>
                              {Object.keys(PRODUCT_FAMILIES).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{l("Modèle", "Product Model")}</Label>
                          {/* Parent → child: only the selected family's models are offered. */}
                          <Select
                            value={selected.config.product}
                            onValueChange={(v) => updateConfig(selected, { product: v })}
                            disabled={!selected.config.family}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={selected.config.family ? l("Sélectionner", "Select") : l("Choisir d'abord une famille", "Select a family first")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(PRODUCT_FAMILIES[selected.config.family] ?? []).map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {/* Product-level CCT (deliberately not per road segment) */}
                    <div className="space-y-1">
                      <Label className="text-xs">{l("Température de couleur (CCT)", "Color Temperature (CCT)")}</Label>
                      <Select value={selected.config.cct} onValueChange={(v) => updateConfig(selected, { cct: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2700K">2700K</SelectItem>
                          <SelectItem value="3000K">3000K</SelectItem>
                          <SelectItem value="4000K">4000K</SelectItem>
                          <SelectItem value="5000K">5000K</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <FieldHead label={l("Hauteur de feu (m)", "Mounting Height (m)")} k="height" />
                      {opt.height ? <Optimized /> : (
                        <HeightField value={selected.config.height} onChange={(v) => updateConfig(selected, { height: v })} lang={lang} />
                      )}
                    </div>
                    <div className="space-y-1">
                      <FieldHead label={l("Disposition", "Pole Arrangement")} k="arrangement" />
                      {opt.arrangement ? <Optimized /> : (
                        <Select value={selected.config.arrangement} onValueChange={(v) => updateConfig(selected, { arrangement: v as ProjectDocument["config"]["arrangement"] })}>
                          <SelectTrigger><SelectValue placeholder={l("Sélectionner", "Select")} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single_left">{l("Simple gauche", "Single Left")}</SelectItem>
                            <SelectItem value="single_right">{l("Simple droite", "Single Right")}</SelectItem>
                            <SelectItem value="both">{l("Les deux côtés", "Both Sides")}</SelectItem>
                            <SelectItem value="staggered">{l("En quinconce", "Staggered")}</SelectItem>
                            <SelectItem value="central">{l("Central", "Central")}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-1">
                      <FieldHead label={l("Espacement (m)", "Pole Spacing (m)")} k="spacing" />
                      {opt.spacing ? <Optimized /> : (
                        <Input type="number" step="1" value={selected.config.spacing} onChange={(e) => updateConfig(selected, { spacing: e.target.value })} placeholder="25" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <FieldHead label={l("Avancée (m)", "Overhang (m)")} k="overhang" />
                        {opt.overhang ? <Optimized /> : (
                          <Input type="number" step="0.1" value={selected.config.overhang} onChange={(e) => updateConfig(selected, { overhang: e.target.value })} placeholder="1.5" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <FieldHead label={l("Inclinaison (°)", "Tilt (°)")} k="tilt" />
                        {opt.tilt ? <Optimized /> : (
                          <Input type="number" step="1" value={selected.config.tilt} onChange={(e) => updateConfig(selected, { tilt: e.target.value })} placeholder="0" />
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Step 5 — Lighting program */}
            <div className="space-y-3">
              <StepHeader
                n={5}
                title={l("Programme d'éclairage", "Lighting Program")}
                hint={l("Saisie directe : nuit, Morning Time, périodes, détection. Propre à CE profil.", "Direct entry: night, Morning Time, periods, detection. Specific to THIS profile.")}
              />
              <LightingProgramTable
                value={selected.config.program}
                onChange={(next) => updateProgram(selected, next)}
                lang={lang}
              />
            </div>

            {/* Per-profile notes — independent from the global discussion */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{l("Notes de ce profil", "Notes for this profile")}</Label>
              <Textarea
                value={selected.notes}
                onChange={(e) => updateDoc(selected.id, { notes: e.target.value })}
                rows={3}
                placeholder={l("Contexte spécifique à ce profil…", "Context specific to this profile…")}
              />
            </div>
          </div>
        </div>
        );
      })()}

      {documents.length === 0 && (
        <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
          {l("Aucun profil pour l'instant — commencez par télécharger le document du client.", "No profiles yet — start by uploading the customer's document.")}
        </div>
      )}

      {/* Global notes & discussion — deliberately prominent */}
      <div className="rounded-lg border-2 border-primary/40 bg-[hsl(var(--callout))] p-5 space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-primary" />
          <Label className="text-base font-semibold">{l("Notes & discussion pour le Study Lab", "Notes & Discussion for the Study Lab")}</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {l(
            "Tout ce qui ne rentre pas dans les champs : demandes client particulières, contraintes d'installation, mâts existants, situations inhabituelles, hypothèses, comptes-rendus de réunion…",
            "Anything that doesn't fit the fields: special customer requests, installation constraints, existing poles, unusual situations, assumptions, meeting notes…",
          )}
        </p>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={6}
          placeholder={l("Expliquez librement le contexte du projet…", "Explain the project context freely…")}
          className="bg-background"
        />
      </div>
    </div>
  );
});

export default ProjectDocumentsSection;
