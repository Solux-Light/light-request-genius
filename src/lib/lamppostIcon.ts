import { MapLamppost } from "@/types/solux";

const rotatePoint = (x: number, y: number, angleDeg: number) => {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
};

const toPathPoint = ({ x, y }: { x: number; y: number }) => `${x.toFixed(2)},${y.toFixed(2)}`;

const buildOpenPath = (points: Array<[number, number]>, angleDeg: number) => {
  const rotated = points.map(([x, y]) => rotatePoint(x, y, angleDeg));
  return `M${toPathPoint(rotated[0])} L${rotated.slice(1).map(toPathPoint).join(" L")}`;
};

const buildClosedPath = (points: Array<[number, number]>, angleDeg: number) => {
  const rotated = points.map(([x, y]) => rotatePoint(x, y, angleDeg));
  return `${buildOpenPath(points, angleDeg)} Z`;
};

export const LAMPPOST_FILL = "hsl(38 92% 50%)";
export const LAMPPOST_STROKE = "hsl(30 85% 30%)";
export const LAMPPOST_SELECTION_STROKE = "hsl(217 19% 27%)";

export const getLamppostPath = (type: MapLamppost["type"], rotation = 0) => {
  const pole = buildClosedPath([
    [-3.5, -3.5],
    [3.5, -3.5],
    [3.5, 3.5],
    [-3.5, 3.5],
  ], rotation);
  const rightArm = buildOpenPath([[3.5, 0], [8, 0], [10.5, -0.8]], rotation);
  const rightHead = buildClosedPath([[10.5, -2.4], [16.5, -1.6], [16.5, 1.6], [10.5, 2.4]], rotation);

  if (type === "double") {
    const leftArm = buildOpenPath([[-3.5, 0], [-8, 0], [-10.5, 0.8]], rotation);
    const leftHead = buildClosedPath([[-10.5, -2.4], [-16.5, -1.6], [-16.5, 1.6], [-10.5, 2.4]], rotation);
    return [pole, rightArm, rightHead, leftArm, leftHead].join(" ");
  }

  return [pole, rightArm, rightHead].join(" ");
};

let lamppostIconAnchor: google.maps.Point | undefined;
let lamppostLabelOrigin: google.maps.Point | undefined;

const getLamppostIconAnchor = () => {
  if (!lamppostIconAnchor && typeof google !== "undefined") {
    lamppostIconAnchor = new google.maps.Point(0, 0);
  }
  return lamppostIconAnchor;
};

// Where the marker label ("L1", "L2"…) sits relative to the icon: just above
// the pole, so the number never covers the lamppost drawing itself.
const getLamppostLabelOrigin = () => {
  if (!lamppostLabelOrigin && typeof google !== "undefined") {
    lamppostLabelOrigin = new google.maps.Point(0, -14);
  }
  return lamppostLabelOrigin;
};

export const getLamppostIconOptions = ({
  type,
  rotation = 0,
  selected = false,
  color,
}: {
  type: MapLamppost["type"];
  rotation?: number;
  selected?: boolean;
  // Per-lamppost identification colour (feedback #4); defaults to the
  // historical amber.
  color?: string;
}): google.maps.Symbol => {
  const anchor = getLamppostIconAnchor();
  const labelOrigin = getLamppostLabelOrigin();
  return {
    path: getLamppostPath(type, rotation),
    fillColor: color || LAMPPOST_FILL,
    fillOpacity: 1,
    strokeColor: selected ? LAMPPOST_SELECTION_STROKE : LAMPPOST_STROKE,
    strokeWeight: selected ? 3 : 2.25,
    scale: selected ? 1.45 : 1.2,
    ...(anchor ? { anchor } : {}),
    ...(labelOrigin ? { labelOrigin } : {}),
  };
};

// Standard marker label config for a lamppost id label.
export const getLamppostLabel = (text: string, color: string): google.maps.MarkerLabel => ({
  text,
  color,
  fontSize: "12px",
  fontWeight: "800",
});