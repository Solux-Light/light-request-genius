import { useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: string | number;
  className?: string;
  title?: string;
  placeholder?: string;
}

// A numeric input that lets you clear and retype freely (F5/UX3). While focused
// it holds the raw string, so deleting "12" doesn't instantly snap to the
// minimum; it clamps to [min, max] only when a complete number is typed and,
// finally, on blur / Enter. An empty field on blur falls back to `min` (or 0).
// This also enforces the upper bound in the handler, not just as an HTML hint.
export default function NumericInput({ value, onCommit, min, max, step, className, title, placeholder }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = (n: number) => {
    let x = n;
    if (min !== undefined) x = Math.max(min, x);
    if (max !== undefined) x = Math.min(max, x);
    return x;
  };

  const commit = () => {
    if (draft === null) return;
    const parsed = parseFloat(draft.replace(",", "."));
    onCommit(isNaN(parsed) ? (min ?? 0) : clamp(parsed));
    setDraft(null);
  };

  return (
    <Input
      type="number"
      step={step}
      min={min}
      max={max}
      title={title}
      placeholder={placeholder}
      className={className}
      value={draft ?? String(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        // Keep the parent roughly in sync for live totals while a complete
        // number is present; blur does the final clamp.
        const parsed = parseFloat(e.target.value.replace(",", "."));
        if (e.target.value !== "" && !isNaN(parsed)) onCommit(clamp(parsed));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
