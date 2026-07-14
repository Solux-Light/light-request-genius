import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Contextual help wrapper (Study Lab feedback): every important control gets a
// tooltip that explains WHAT the tool does, WHY it exists and WHEN to use it —
// readable enough that a new user understands the tool just by hovering.
// Wider than the default tooltip, larger text, automatic line wrapping.
interface Props {
  tip: ReactNode;
  // Radix needs a focusable single child; wrap disabled buttons in a <span>.
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

const HelpTip = ({ tip, children, side = "bottom" }: Props) => (
  <Tooltip delayDuration={300}>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side} className="max-w-[320px] whitespace-normal p-3 text-sm leading-relaxed">
      {tip}
    </TooltipContent>
  </Tooltip>
);

export default HelpTip;
