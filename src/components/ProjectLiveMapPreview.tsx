import { GoogleMap, useJsApiLoader, PolygonF, MarkerF } from "@react-google-maps/api";
import { MapArea, MapLamppost } from "@/types/solux";

const LIBRARIES: ("places" | "drawing")[] = ["places", "drawing"];

const LAMP_SINGLE = "M0,0 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M4,0 L14,0 M14,-3 L14,3";
const LAMP_DOUBLE = "M0,0 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M-14,0 L-4,0 M4,0 L14,0 M-14,-3 L-14,3 M14,-3 L14,3";

interface Props {
  apiKey: string;
  location: { lat: number; lng: number };
  areas: MapArea[];
  lampposts: MapLamppost[];
  zoom?: number;
  center?: { lat: number; lng: number };
  lang?: "fr" | "en";
}

const ProjectLiveMapPreview = ({ apiKey, location, areas, lampposts, zoom, center, lang = "en" }: Props) => {
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
        mapTypeId="hybrid"
        options={{
          disableDefaultUI: true,
          gestureHandling: "none",
          tilt: 0,
          heading: 0,
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

        {/* Lampposts */}
        {lampposts.map((lp) => (
          <MarkerF
            key={lp.id}
            position={{ lat: lp.lat, lng: lp.lng }}
            icon={{
              path: lp.type === "double" ? LAMP_DOUBLE : LAMP_SINGLE,
              fillColor: "#f59e0b",
              fillOpacity: 1,
              strokeColor: "#f59e0b",
              strokeWeight: 2.5,
              scale: 1.2,
              rotation: lp.rotation || 0,
              anchor: new google.maps.Point(0, 0),
            }}
          />
        ))}

        {/* Reference location marker */}
        <MarkerF
          position={location}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
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
        {l("Aperçu du projet", "Project preview")}
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
