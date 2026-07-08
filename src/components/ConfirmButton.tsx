import { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Standard confirmation for destructive actions (delete profile, clear all
// zones…). Wrap the trigger button; the action only runs after confirm.
interface Props {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  children: ReactNode; // the trigger button
}

const ConfirmButton = ({ title, description, confirmLabel = "Delete", cancelLabel = "Cancel", onConfirm, children }: Props) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onClick={onConfirm}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmButton;
