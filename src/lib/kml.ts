// Google Earth export (task: "the engineer never has to manually redraw
// polygons or re-enter coordinates").
//
// Technical choice: a Google Earth *deep link* can only carry a camera
// position, never geometry — so the reliable vehicle for the project polygons
// and lampposts is a KML file, which Google Earth (web/pro/mobile) opens
// natively. We generate the KML client-side from the map areas; the PDF gets a
// short retypable/clickable Earth link that flies to the site, plus a note
// that the KML accompanies the request.

import { MapArea, MapLamppost } from "@/types/solux";

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );

// KML colors are aabbggrr (alpha, blue, green, red) — the reverse of #rrggbb.
export const hexToKmlColor = (hex: string, alphaHex: string): string => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `${alphaHex}ffffff`;
  const [, rr, gg, bb] = m;
  return `${alphaHex}${bb}${gg}${rr}`.toLowerCase();
};

export interface ProjectKmlInput {
  projectName: string;
  address?: string;
  location?: { lat: number; lng: number } | null;
  areas: MapArea[];
  lampposts?: MapLamppost[];
}

// Build a standalone KML document with one polygon per drawn zone and one
// point per lamppost. Coordinates use the KML order: lng,lat,alt.
export const buildProjectKml = ({ projectName, address, location, areas, lampposts = [] }: ProjectKmlInput): string => {
  const name = escapeXml(projectName || "Solux project");

  const styles = areas
    .map((a, i) => {
      const lineColor = hexToKmlColor(a.color, "ff");
      const fillColor = hexToKmlColor(a.color, "4d"); // ≈30% fill, matches the app
      return `    <Style id="zone${i}">
      <LineStyle><color>${lineColor}</color><width>2</width></LineStyle>
      <PolyStyle><color>${fillColor}</color></PolyStyle>
    </Style>`;
    })
    .join("\n");

  const polygons = areas
    .map((a, i) => {
      if (a.paths.length < 3) return "";
      const ring = [...a.paths, a.paths[0]] // close the ring
        .map((p) => `${p.lng},${p.lat},0`)
        .join(" ");
      return `    <Placemark>
      <name>${escapeXml(a.name || `Zone ${i + 1}`)}</name>
      <styleUrl>#zone${i}</styleUrl>
      <Polygon>
        <tessellate>1</tessellate>
        <outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>`;
    })
    .filter(Boolean)
    .join("\n");

  const lamps = lampposts
    .map(
      (lp, i) => `    <Placemark>
      <name>${escapeXml(`Lamppost ${i + 1} (${lp.type}${lp.rotation ? `, ${lp.rotation}°` : ""})`)}</name>
      <Point><coordinates>${lp.lng},${lp.lat},0</coordinates></Point>
    </Placemark>`,
    )
    .join("\n");

  const center = location
    ? `    <Placemark>
      <name>${name} — ${escapeXml(address || "project location")}</name>
      <Point><coordinates>${location.lng},${location.lat},0</coordinates></Point>
    </Placemark>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
${styles}
${center}
${polygons}
${lamps}
  </Document>
</kml>
`;
};

// Short, retypable deep link that flies Google Earth (web) to the site. It
// carries only the viewpoint — the geometry travels in the KML above.
export const earthWebUrl = (lat: number, lng: number): string =>
  `https://earth.google.com/web/search/${lat.toFixed(6)},${lng.toFixed(6)}`;

export const downloadKml = (kml: string, filename: string) => {
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".kml") ? filename : `${filename}.kml`;
  a.click();
  URL.revokeObjectURL(url);
};
