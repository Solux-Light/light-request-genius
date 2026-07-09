import { COLOR_OPTIONS } from "@/types/solux";

interface Props {
  value: string;
  onChange: (color: string) => void;
  // "md" = toolbar swatch, "sm" = compact inline (zone editor) swatch.
  size?: "sm" | "md";
}

// Q6 — the colour picker row, previously copy-pasted in the map section and the
// PDF zone editor (toolbar + inline editor).
export default function ColorSwatches({ value, onChange, size = "md" }: Props) {
  const dim = size === "sm" ? "w-4 h-4 border" : "w-6 h-6 border-2";
  return (
    <div className="flex gap-1">
      {COLOR_OPTIONS.map((c) => (
        <button
          type="button"
          key={c}
          className={`${dim} rounded-full ${value === c ? "border-foreground" : "border-transparent"}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
