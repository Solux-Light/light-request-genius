// Numbered step header — THE standard section header across the application.
// Mirrors the engineering workflow: a number, a clear title, a one-line hint.
interface Props {
  n: number;
  title: string;
  hint?: string;
}

const StepHeader = ({ n, title, hint }: Props) => (
  <div className="flex items-start gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
      {n}
    </span>
    <div>
      <p className="font-semibold leading-7">{title}</p>
      {hint && <p className="text-xs text-muted-foreground -mt-0.5">{hint}</p>}
    </div>
  </div>
);

export default StepHeader;
