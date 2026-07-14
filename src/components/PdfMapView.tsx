import { useState } from "react";
import { MapArea, MapLamppost, MapRecoZone, RECO_STYLE, lamppostDisplay } from "@/types/solux";
import { buildStaticMapUrl } from "@/lib/staticMap";

// Map rendering for the PDF document (preview modal AND export). A LIVE Google
// Map cannot be rasterised by html2canvas — its tiles taint the canvas, so the
// map came out blank in the exported PDF. This component instead uses a Google
// STATIC map image (a plain <img> html2canvas can capture); if the Static Maps
// API is not enabled the image fails to load and we fall back to an SVG
// schematic that still shows the geometry (zones, reco areas, lampposts). Both
// paths are pure images/SVG, so the exported PDF is identical to the preview.
interface Props {
  apiKey?: string;
  location: { lat: number; lng: number };
  center?: { lat: number; lng: number };
  zoom?: number;
  areas: MapArea[];
  lampposts: MapLamppost[];
  recoZones?: MapRecoZone[];
  title?: string;
  lang?: "fr" | "en";
}

const PdfMapView = ({ apiKey, location, center, zoom, areas, lampposts, recoZones = [], title, lang = "en" }: Props) => {
  const [failed, setFailed] = useState(false);
  const c = center || location;
  const z = zoom || 16;

  if (apiKey && !failed) {
    const url = buildStaticMapUrl({ apiKey, center: c, zoom: z, areas, recoZones, lampposts });
    return (
      <div style={{ position: "relative" }}>
        <img
          src={url}
          crossOrigin="anonymous"
          alt={title || "Project map"}
          style={{ width: "100%", display: "block", border: "1px solid #e5e7eb", borderRadius: 4 }}
          onError={() => setFailed(true)}
        />
        {title && (
          <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 3 }}>
            {title}
          </span>
        )}
      </div>
    );
  }

  return <MapSchematic location={location} center={c} zoom={z} areas={areas} lampposts={lampposts} recoZones={recoZones} title={title} lang={lang} />;
};

// Web-Mercator world-pixel projection at a given zoom (same math Google uses),
// so the schematic can reproduce a specific frame's centre + zoom crop.
const worldPx = (lat: number, lng: number, z: number) => {
  const s = 256 * Math.pow(2, z);
  const x = ((lng + 180) / 360) * s;
  const sinLat = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * s;
  return { x, y };
};

// Vector schematic (html2canvas-safe) showing the study geometry when no
// satellite image is available. Uses each frame's own centre + zoom so the
// additional views really show different parts of the project (feedback #4);
// falls back to fit-to-all-geometry when no view is provided.
const MapSchematic = ({
  location, center, zoom, areas, lampposts, recoZones = [], title,
}: {
  location: { lat: number; lng: number };
  center?: { lat: number; lng: number };
  zoom?: number;
  areas: MapArea[];
  lampposts: MapLamppost[];
  recoZones?: MapRecoZone[];
  title?: string;
  lang?: "fr" | "en";
}) => {
  const W = 800, H = 400;
  const clipId = `mapclip-${Math.abs(((center?.lat ?? location.lat) * 1e4 + (center?.lng ?? location.lng) * 1e6) | 0)}`;

  let toX: (lng: number, lat: number) => number;
  let toY: (lng: number, lat: number) => number;

  if (center && zoom) {
    // Mercator crop around this frame's centre/zoom (logical 640×320 viewport,
    // 2:1 like the map preview).
    const VW = 640, VH = 320;
    const cw = worldPx(center.lat, center.lng, zoom);
    const left = cw.x - VW / 2, top = cw.y - VH / 2;
    toX = (lng, lat) => ((worldPx(lat, lng, zoom).x - left) / VW) * W;
    toY = (lng, lat) => ((worldPx(lat, lng, zoom).y - top) / VH) * H;
  } else {
    // Fit all geometry (no specific view).
    const pts = [
      { lat: location.lat, lng: location.lng },
      ...areas.flatMap((a) => a.paths),
      ...lampposts.map((lp) => ({ lat: lp.lat, lng: lp.lng })),
      ...recoZones.flatMap((z) => [
        { lat: z.bounds.north, lng: z.bounds.west },
        { lat: z.bounds.south, lng: z.bounds.east },
      ]),
    ];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latRange = (maxLat - minLat) || 0.002;
    const lngRange = (maxLng - minLng) || 0.002;
    const pad = 0.18;
    toX = (lng) => ((lng - minLng + lngRange * pad) / (lngRange * (1 + pad * 2))) * W;
    toY = (_lng, lat) => ((maxLat - lat + latRange * pad) / (latRange * (1 + pad * 2))) * H;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 4, background: "#eef2f5" }}>
      <clipPath id={clipId}><rect x={0} y={0} width={W} height={H} /></clipPath>
      <defs>
        <pattern id="hatch-rec" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={RECO_STYLE.recommended.stroke} strokeWidth="1.4" opacity="0.6" />
        </pattern>
        <pattern id="hatch-exc" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke={RECO_STYLE.excluded.stroke} strokeWidth="1.4" opacity="0.6" />
        </pattern>
      </defs>
      {/* subtle grid */}
      {Array.from({ length: 7 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={(H * (i + 1)) / 8} x2={W} y2={(H * (i + 1)) / 8} stroke="#dbe2e8" strokeWidth={1} />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`v${i}`} x1={(W * (i + 1)) / 12} y1={0} x2={(W * (i + 1)) / 12} y2={H} stroke="#dbe2e8" strokeWidth={1} />
      ))}

      {/* All geometry clipped to the frame so a zoomed-in view really crops. */}
      <g clipPath={`url(#${clipId})`}>
      {/* Calculation zones — solid coloured fill */}
      {areas.map((a) => (
        <g key={a.id}>
          <polygon
            points={a.paths.map((p) => `${toX(p.lng, p.lat)},${toY(p.lng, p.lat)}`).join(" ")}
            fill={a.color} fillOpacity={0.3} stroke={a.color} strokeWidth={2}
          />
          {a.paths.length > 0 && (
            <text
              x={a.paths.reduce((s, p) => s + toX(p.lng, p.lat), 0) / a.paths.length}
              y={a.paths.reduce((s, p) => s + toY(p.lng, p.lat), 0) / a.paths.length}
              fill={a.color} fontSize={13} fontWeight={700} textAnchor="middle"
            >{a.name || ""}</text>
          )}
        </g>
      ))}

      {/* Recommendation zones — hatched + thick outline + corner badge */}
      {recoZones.map((z) => {
        const s = RECO_STYLE[z.kind];
        const xw = toX(z.bounds.west, z.bounds.north), xe = toX(z.bounds.east, z.bounds.north);
        const yn = toY(z.bounds.west, z.bounds.north), ys = toY(z.bounds.west, z.bounds.south);
        const x = Math.min(xw, xe), x2 = Math.max(xw, xe);
        const y = Math.min(yn, ys), y2 = Math.max(yn, ys);
        const w = x2 - x, h = y2 - y;
        return (
          <g key={z.id}>
            <rect x={x} y={y} width={w} height={h} fill={`url(#${z.kind === "recommended" ? "hatch-rec" : "hatch-exc"})`} stroke={s.stroke} strokeWidth={3} />
            <circle cx={x + 11} cy={y + 11} r={9} fill="#fff" stroke={s.stroke} strokeWidth={2} />
            <text x={x + 11} y={y + 15} fill={s.stroke} fontSize={12} fontWeight={800} textAnchor="middle">{s.icon}</text>
          </g>
        );
      })}

      {/* Lampposts — coloured dot + number label */}
      {lampposts.map((lp, i) => {
        const identity = lamppostDisplay(lp, i);
        const cx = toX(lp.lng, lp.lat), cy = toY(lp.lng, lp.lat);
        return (
          <g key={lp.id}>
            <circle cx={cx} cy={cy} r={5} fill={identity.color} stroke="#fff" strokeWidth={1.5} />
            <text x={cx} y={cy - 8} fill={identity.color} fontSize={11} fontWeight={800} textAnchor="middle" stroke="#fff" strokeWidth={0.5}>{identity.label}</text>
          </g>
        );
      })}
      </g>

      {title && (
        <>
          <rect x={6} y={6} width={title.length * 6.5 + 12} height={18} rx={3} fill="rgba(0,0,0,0.6)" />
          <text x={12} y={19} fill="#fff" fontSize={11}>{title}</text>
        </>
      )}
    </svg>
  );
};

export default PdfMapView;
