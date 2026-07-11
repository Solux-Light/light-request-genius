import { describe, it, expect } from "vitest";
import { buildProjectKml, hexToKmlColor, earthWebUrl } from "@/lib/kml";
import { isHeightRange, formatHeight } from "@/types/solux";

describe("kml", () => {
  const areas = [
    {
      id: "a1",
      type: "polygon" as const,
      color: "#2563eb",
      name: "Parking Nord",
      paths: [
        { lat: 48.85, lng: 2.35 },
        { lat: 48.851, lng: 2.352 },
        { lat: 48.8495, lng: 2.353 },
      ],
    },
  ];

  it("emits a closed polygon ring in lng,lat order with the zone name", () => {
    const kml = buildProjectKml({ projectName: "Test & Co", areas, lampposts: [], location: { lat: 48.85, lng: 2.35 } });
    expect(kml).toContain("<name>Test &amp; Co</name>"); // XML-escaped
    expect(kml).toContain("Parking Nord");
    // lng,lat order (KML) — first vertex
    expect(kml).toContain("2.35,48.85,0");
    // ring closed: first coordinate repeated at the end
    const coords = kml.match(/<coordinates>([^<]+)<\/coordinates>/g) ?? [];
    const ring = coords.find((c) => c.includes("2.352"))!;
    const pts = ring.replace(/<\/?coordinates>/g, "").trim().split(/\s+/);
    expect(pts[0]).toBe(pts[pts.length - 1]);
    expect(pts).toHaveLength(4); // 3 vertices + closing repeat
  });

  it("emits lamppost points and KML aabbggrr colors", () => {
    const kml = buildProjectKml({
      projectName: "P",
      areas,
      lampposts: [{ id: "l1", lat: 48.86, lng: 2.36, type: "double", rotation: 45 }],
      location: null,
    });
    expect(kml).toContain("<Point><coordinates>2.36,48.86,0</coordinates></Point>");
    expect(kml).toContain("Lamppost 1 (double, 45°)");
    // #2563eb → bb=eb gg=63 rr=25, line alpha ff
    expect(hexToKmlColor("#2563eb", "ff")).toBe("ffeb6325");
  });

  it("builds a retypable Earth deep link", () => {
    // toFixed rounds half-up on both coordinates (48.8575475 → .857548, 2.3513765 → .351377).
    expect(earthWebUrl(48.8575475, 2.3513765)).toBe("https://earth.google.com/web/search/48.857548,2.351377");
  });
});

describe("heights", () => {
  it("classifies fixed vs range strings", () => {
    expect(isHeightRange("8")).toBe(false);
    expect(isHeightRange("5-8")).toBe(true);
    expect(isHeightRange("5.5 - 8")).toBe(true);
    expect(isHeightRange("")).toBe(false);
    expect(isHeightRange("abc")).toBe(false);
  });

  it("formats for the Study Lab PDF", () => {
    expect(formatHeight("8")).toBe("8 m");
    expect(formatHeight("5-8")).toBe("5–8 m (range)");
    expect(formatHeight("5-8", "fr")).toBe("5–8 m (plage)");
    expect(formatHeight("")).toBe("—");
  });
});
