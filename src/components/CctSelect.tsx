import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE = ["3000K", "4000K", "5000K"];

interface Props {
  value: string;
  onChange: (v: string) => void;
  // The Work-From-PDF-Profile flow also offers a warm 2700K option.
  includeWarm?: boolean;
  className?: string;
}

// Q6 — the colour-temperature picker, previously copy-pasted in four places.
export default function CctSelect({ value, onChange, includeWarm = false, className }: Props) {
  const options = includeWarm ? ["2700K", ...BASE] : BASE;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
