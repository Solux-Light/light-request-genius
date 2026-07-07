import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isHeightRange } from "@/types/solux";

// Mounting-height input supporting a fixed value ("8") or an allowed range
// ("5-8"), serialized into the SAME string field so existing schemas (form,
// zone data, product assignments) are untouched. The range is a design
// constraint transmitted to the Study Lab — nothing is optimised client-side.
interface Props {
  value: string;
  onChange: (v: string) => void;
  lang?: "fr" | "en";
  placeholder?: string;
}

const parse = (v: string) => {
  if (isHeightRange(v)) {
    const [min, max] = v.split("-").map((s) => s.trim());
    return { mode: "range" as const, fixed: "", min, max };
  }
  return { mode: "fixed" as const, fixed: v, min: "", max: "" };
};

const HeightField = ({ value, onChange, lang = "en", placeholder = "8" }: Props) => {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const initial = parse(value);
  const [mode, setMode] = useState<"fixed" | "range">(initial.mode);
  const [fixed, setFixed] = useState(initial.fixed);
  const [min, setMin] = useState(initial.min);
  const [max, setMax] = useState(initial.max);

  // Re-sync if the value is replaced from outside (profile/zone switch,
  // restore…). An empty external value must CLEAR the local inputs, otherwise
  // the previous profile's height visually leaks into the next one.
  useEffect(() => {
    const p = parse(value);
    if (value === "") {
      // A half-typed range ("5" + empty max) also emits "" — don't wipe the
      // field the user is actively typing in.
      if (mode === "range" && ((min && !max) || (!min && max))) return;
      setFixed("");
      setMin("");
      setMax("");
      return; // keep the current Fixed/Range toggle position
    }
    setMode(p.mode);
    if (p.mode === "range") { setMin(p.min); setMax(p.max); }
    else setFixed(p.fixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emitFixed = (v: string) => { setFixed(v); onChange(v.trim()); };
  const emitRange = (nextMin: string, nextMax: string) => {
    setMin(nextMin);
    setMax(nextMax);
    onChange(nextMin.trim() && nextMax.trim() ? `${nextMin.trim()}-${nextMax.trim()}` : "");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "fixed" ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => { setMode("fixed"); onChange(fixed.trim()); }}
        >
          {l("Fixe", "Fixed")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "range" ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={() => { setMode("range"); onChange(min.trim() && max.trim() ? `${min.trim()}-${max.trim()}` : ""); }}
        >
          {l("Plage", "Range")}
        </Button>
      </div>
      {mode === "fixed" ? (
        <Input type="number" step="0.5" value={fixed} placeholder={placeholder} onChange={(e) => emitFixed(e.target.value)} />
      ) : (
        <div className="flex items-center gap-2">
          <Input type="number" step="0.5" value={min} placeholder="5" onChange={(e) => emitRange(e.target.value, max)} />
          <span className="text-muted-foreground">–</span>
          <Input type="number" step="0.5" value={max} placeholder="8" onChange={(e) => emitRange(min, e.target.value)} />
          <span className="text-sm text-muted-foreground">m</span>
        </div>
      )}
    </div>
  );
};

export default HeightField;
