import { AlertCircle, TriangleAlert } from "lucide-react";

// Inline field feedback (V1): a red line for blocking problems, an amber line
// for soft warnings the user may consciously keep.
interface Props {
  error?: string;
  warning?: string;
}

const FieldMessage = ({ error, warning }: Props) => {
  if (error) {
    return (
      <p className="flex items-start gap-1 text-xs text-destructive" role="alert">
        <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
        <span>{error}</span>
      </p>
    );
  }
  if (warning) {
    return (
      <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-500">
        <TriangleAlert className="h-3.5 w-3.5 mt-px shrink-0" />
        <span>{warning}</span>
      </p>
    );
  }
  return null;
};

export default FieldMessage;
