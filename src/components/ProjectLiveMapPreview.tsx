import { GoogleMap, useJsApiLoader, PolygonF, PolylineF, MarkerF } from "@react-google-maps/api";
import { MapArea, MapLamppost, MapLine, lamppostDisplay } from "@/types/solux";
import { getLamppostIconOptions, getLamppostLabel } from "@/lib/lamppostIcon";
import { MAP_SYMBOL_CIRCLE } from "@/lib/googleMapsSymbols";

const LIBRARIES: ("places" | "drawing")[] = ["places", "drawing"];

interface Props {
  apiKey: string;
  location: { lat: number; lng: number };
  areas: MapArea[];
  lampposts: MapLamppost[];
  lines?: MapLine[];
  zoom?: number;
  center?: { lat: number; lng: number };
  lang?: "fr" | "en";
  // Frame title shown in the overlay (e.g. "Additional view 2").
  title?: string;
}

const ProjectLiveMapPreview = ({ apiKey, location, areas, lampposts, lines = [], zoom, center, lang = "en", title }: Props) => {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES });

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  if (loadError || !isLoaded) {
    return (
      <ProjectMapPreviewFallback location={location} areas={areas} lampposts={lampposts} />
    );
  }

  return (
    <div className="relative" style={{ aspectRatio: "2/1" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center || location}
        zoom={zoom || 16}
        options={{
          disableDefaultUI: true,
          gestureHandling: "none",
          tilt: 0,
          heading: 0,
          mapTypeId: "satellite",
        }}
      >
        {/* Areas */}
        {areas.map((area) => (
          <PolygonF
            key={area.id}
            paths={area.paths}
            options={{
              fillColor: area.color,
              fillOpacity: 0.3,
              strokeColor: area.color,
              strokeWeight: 2,
              clickable: false,
            }}
          />
        ))}

        {/* Indication lines (Study Lab feedback #2) */}
        {lines.map((line) => (
          <PolylineF
            key={line.id}
            path={line.path}
            options={{ strokeColor: line.color, strokeWeight: 4, strokeOpacity: 0.9, clickable: false }}
          />
        ))}

        {/* Lampposts — identification colour + label (feedback #4) */}
        {lampposts.map((lp, i) => {
          const identity = lamppostDisplay(lp, i);
          return (
            <MarkerF
              key={lp.id}
              position={{ lat: lp.lat, lng: lp.lng }}
              icon={getLamppostIconOptions({ type: lp.type, rotation: lp.rotation || 0, color: identity.color })}
              label={getLamppostLabel(identity.label, identity.color)}
            />
          );
        })}

        {/* Reference location marker */}
        <MarkerF
          position={location}
          icon={{
            path: MAP_SYMBOL_CIRCLE,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 6,
          }}
        />
      </GoogleMap>

      {/* Label overlay */}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
        {title || l("Aperçu du projet", "Project preview")}
      </div>

      {/* GPS footer */}
      <div className="absolute bottom-1 right-2 text-white/70 text-[10px]">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </div>
    </div>
  );
};

// Simple SVG fallback
const ProjectMapPreviewFallback = ({ location, areas, lampposts }: { location: { lat: number; lng: number }; areas: MapArea[]; lampposts: MapLamppost[] }) => {
  const W = 800, H = 400;

  // Compute bounds
  const allPoints = [
    { lat: location.lat, lng: location.lng },
    ...areas.flatMap((a) => a.paths),
    ...lampposts.map((lp) => ({ lat: lp.lat, lng: lp.lng })),
  ];
  const lats = allPoints.map((p) => p.lat);
  const lngs = allPoints.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const pad = 0.15;
  const latRange = (maxLat - minLat) || 0.001;
  const lngRange = (maxLng - minLng) || 0.001;

  const toX = (lng: number) => ((lng - minLng + latRange * pad) / (lngRange + lngRange * pad * 2)) * W;
  const toY = (lat: number) => ((maxLat + latRange * pad - lat) / (latRange + latRange * pad * 2)) * H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full border rounded bg-muted/20">
      {/* Grid */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={H * (i + 1) / 10} x2={W} y2={H * (i + 1) / 10} stroke="hsl(var(--border))" strokeWidth={0.5} />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={W * (i + 1) / 10} y1={0} x2={W * (i + 1) / 10} y2={H} stroke="hsl(var(--border))" strokeWidth={0.5} />
      ))}

      {/* Polygons */}
      {areas.map((area) => (
        <polygon
          key={area.id}
          points={area.paths.map((p) => `${toX(p.lng)},${toY(p.lat)}`).join(" ")}
          fill={area.color}
          fillOpacity={0.3}
          stroke={area.color}
          strokeWidth={2}
        />
      ))}

      {/* Lampposts */}
      {lampposts.map((lp) => (
        <g key={lp.id}>
          <circle cx={toX(lp.lng)} cy={toY(lp.lat)} r={4} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />
          <line x1={toX(lp.lng)} y1={toY(lp.lat)} x2={toX(lp.lng)} y2={toY(lp.lat) - 12} stroke="#f59e0b" strokeWidth={2} />
        </g>
      ))}

      {/* Reference crosshair */}
      <line x1={toX(location.lng) - 8} y1={toY(location.lat)} x2={toX(location.lng) + 8} y2={toY(location.lat)} stroke="red" strokeWidth={2} />
      <line x1={toX(location.lng)} y1={toY(location.lat) - 8} x2={toX(location.lng)} y2={toY(location.lat) + 8} stroke="red" strokeWidth={2} />
    </svg>
  );
};

export default ProjectLiveMapPreview;
export { ProjectMapPreviewFallback as ProjectMapPreview };
