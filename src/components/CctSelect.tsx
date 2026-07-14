import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// Standard colour temperatures selectable in one click (Study Lab feedback #6:
// 2200 K and 2700 K added for warm tenders).
const STANDARD = ["2200K", "2700K", "3000K", "4000K", "5000K"];
const CUSTOM = "__custom__";

interface Props {
  value: string;
  onChange: (v: string) => void;
  // Kept for call-site compatibility — 2700K is now always in the list.
  includeWarm?: boolean;
  className?: string;
  lang?: "fr" | "en";
}

// Q6 — the colour-temperature picker, previously copy-pasted in four places.
// "Custom" reveals a free-entry field for tender-specific temperatures
// (3500 K, 5700 K…): the typed text becomes the stored CCT value.
export default function CctSelect({ value, onChange, className, lang = "en" }: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  // A non-standard stored value means Custom is active; "" means Custom was
  // just picked and nothing is typed yet.
  const customActive = value === "" || !STANDARD.includes(value);

  return (
    <div className="space-y-1">
      <Select
        value={customActive ? CUSTOM : value}
        onValueChange={(v) => onChange(v === CUSTOM ? "" : v)}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={l("Sélectionner", "Select")} />
        </SelectTrigger>
        <SelectContent>
          {STANDARD.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value={CUSTOM}>{l("Personnalisée…", "Custom…")}</SelectItem>
        </SelectContent>
      </Select>
      {customActive && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={l("ex. 3500K", "e.g. 3500K")}
          maxLength={10}
          aria-label={l("Température de couleur personnalisée", "Custom colour temperature")}
        />
      )}
    </div>
  );
}
