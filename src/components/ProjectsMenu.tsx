import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderOpen, Save, Trash2, Upload } from "lucide-react";
import { SoluxForm } from "@/types/solux";
import { listProjects, saveProject, loadProject, deleteProject, SavedProject } from "@/lib/draft";
import ConfirmButton from "@/components/ConfirmButton";

// U1 — local save/reopen. Projects live in localStorage (Supabase drafts come
// later); files themselves can't be stored, so reopened projects show the
// "replace file" state where an upload existed.
interface Props {
  form: SoluxForm;
  onLoad: (form: SoluxForm) => void;
  lang?: "fr" | "en";
}

const ProjectsMenu = ({ form, onLoad, lang = "en" }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const refresh = () => setProjects(listProjects());

  const handleSave = () => {
    const name = form.projectName.trim() || l("Projet sans nom", "Untitled project");
    const outcome = saveProject(name, form);
    refresh();
    setSavedFlash(
      outcome === "failed"
        ? l("Échec (stockage plein)", "Failed (storage full)")
        : outcome === "stripped"
          ? l("Enregistré (sans aperçus)", "Saved (previews dropped)")
          : l("Enregistré", "Saved"),
    );
    setTimeout(() => setSavedFlash(null), 2500);
  };

  const handleLoad = (id: string) => {
    const loaded = loadProject(id);
    if (loaded) {
      onLoad(loaded);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) refresh(); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <FolderOpen className="h-4 w-4 mr-1.5" />
          {l("Projets locaux", "Local projects")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{l("Projets enregistrés sur ce poste", "Projects saved on this device")}</p>
          <Button type="button" size="sm" variant="default" className="h-8" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {savedFlash ?? l("Enregistrer le projet actuel", "Save current project")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {l(
            "Stockés dans ce navigateur uniquement : ils ne sont pas visibles depuis un autre poste et disparaissent si les données du navigateur sont effacées. Les fichiers joints devront être re-sélectionnés à la réouverture.",
            "Stored in this browser only: they are not visible from another computer and are removed if browser data is cleared. Attached files must be selected again when reopened.",
          )}
        </p>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {l("Aucun projet enregistré.", "No saved projects yet.")}
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.savedAt ? new Date(p.savedAt).toLocaleString() : ""}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => handleLoad(p.id)}>
                  <Upload className="h-3.5 w-3.5 mr-1 rotate-180" />
                  {l("Ouvrir", "Open")}
                </Button>
                <ConfirmButton
                  title={l("Supprimer ce projet ?", "Delete this project?")}
                  description={`« ${p.name} » — ${l(
                    "le projet enregistré sera définitivement supprimé de ce navigateur. Cette action ne peut pas être annulée.",
                    "the saved project will be permanently removed from this browser. This cannot be undone.",
                  )}`}
                  confirmLabel={l("Supprimer", "Delete")}
                  cancelLabel={l("Annuler", "Cancel")}
                  onConfirm={() => { deleteProject(p.id); refresh(); }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    aria-label={l("Supprimer", "Delete")}
                    title={l("Supprimer", "Delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ProjectsMenu;
