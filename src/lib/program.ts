import { LightingSegment } from "@/types/solux";

// Shared lighting-program math — single implementation used by the program
// table ("Fit" button) and the solstice auto-calc in the intake page.

export const snapHalf = (h: number) => Math.round(h * 2) / 2;

// Q8 — one colour for a program period, shared by the on-screen timeline and the
// PDF (they had drifted: one treated an undefined intensity as 100, the other
// didn't). Sensor = green, full-power fixed = ink, dimmed fixed = grey.
export const segmentColor = (seg: LightingSegment): string => {
  if (seg.mode === "sensor") return "rgb(137, 250, 140)";
  if ((seg.intensity ?? 100) === 100) return "#111";
  return "rgb(170, 173, 184)";
};

// Proportionally rescale period durations so they sum to `total` hours,
// snapping to the 0.5 h grid and absorbing rounding drift into the last
// period (min 0.5 h each).
export const rescaleSegmentsToTotal = (
  segments: LightingSegment[],
  total: number,
): LightingSegment[] => {
  const sum = segments.reduce((s, x) => s + (x.hours || 0), 0);
  if (sum <= 0 || segments.length === 0) return segments.map((s) => ({ ...s }));
  const scaled = segments.map((s) => ({
    ...s,
    hours: Math.max(0.5, snapHalf((s.hours / sum) * total)),
  }));
  const drift = Math.round((total - scaled.reduce((s, x) => s + x.hours, 0)) * 100) / 100;
  if (drift !== 0) {
    const last = scaled.length - 1;
    scaled[last].hours = Math.max(0.5, snapHalf(scaled[last].hours + drift));
  }
  return scaled;
};
