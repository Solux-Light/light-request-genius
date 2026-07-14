import { MapArea, MapLamppost, MapRecoZone, RECO_STYLE, lamppostDisplay } from "@/types/solux";

// Build a Google Static Maps API URL for the PDF (feedback: exported PDF must
// contain the real map captures, identical to the preview). Unlike a live
// Google Map, a static image is a plain <img> that html2canvas can rasterise,
// so it survives the PDF export. Overlays (calc zones, reco rectangles,
// lampposts) are drawn server-side by Google so they match the app.
//
// NOTE: requires the "Maps Static API" enabled on the API key. When it is not,
// the <img> 404/403s and the caller falls back to an SVG schematic.

const hexToStatic = (hex: string, alpha = "ff") => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return `0x${(m ? m[1] : "888888").toLowerCase()}${alpha}`;
};

export interface StaticMapInput {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  areas: MapArea[];
  recoZones: MapRecoZone[];
  lampposts: MapLamppost[];
  // Rendered pixel size (before scale=2). 640 is the free-tier max.
  width?: number;
  height?: number;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

export const buildStaticMapUrl = ({
  apiKey, center, zoom, areas, recoZones, lampposts, width = 640, height = 320,
}: StaticMapInput): string => {
  const params: string[] = [
    `center=${round(center.lat)},${round(center.lng)}`,
    `zoom=${Math.round(zoom)}`,
    `size=${width}x${height}`,
    `scale=2`,
    `maptype=satellite`,
    `key=${apiKey}`,
  ];

  // Calculation zones — filled coloured polygons (match the app's ~30% fill).
  areas.forEach((a) => {
    if (a.paths.length < 3) return;
    const pts = [...a.paths, a.paths[0]].map((p) => `${round(p.lat)},${round(p.lng)}`).join("|");
    params.push(`path=${encodeURIComponent(`fillcolor:${hexToStatic(a.color, "4d")}|color:${hexToStatic(a.color, "ff")}|weight:2|${pts}`)}`);
  });

  // Recommendation zones — thick hollow rectangle, green/red.
  recoZones.forEach((z) => {
    const s = RECO_STYLE[z.kind];
    const { north, south, east, west } = z.bounds;
    const ring = [
      `${round(north)},${round(west)}`,
      `${round(north)},${round(east)}`,
      `${round(south)},${round(east)}`,
      `${round(south)},${round(west)}`,
      `${round(north)},${round(west)}`,
    ].join("|");
    params.push(`path=${encodeURIComponent(`fillcolor:${hexToStatic(s.fill, "1a")}|color:${hexToStatic(s.stroke, "ff")}|weight:4|${ring}`)}`);
  });

  // Lampposts — small coloured markers (Static API labels allow one A–Z/0–9
  // character only, so numbered labels can't be shown here; the PDF legend
  // beneath the map lists every pole with its number).
  lampposts.slice(0, 40).forEach((lp, i) => {
    const identity = lamppostDisplay(lp, i);
    params.push(`markers=${encodeURIComponent(`size:tiny|color:${hexToStatic(identity.color, "ff")}|${round(lp.lat)},${round(lp.lng)}`)}`);
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.join("&")}`;
};
