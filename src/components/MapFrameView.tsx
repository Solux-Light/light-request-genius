import { memo, useMemo, useRef, useCallback } from "react";
import { GoogleMap, PolygonF, RectangleF, MarkerF } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { MapArea, MapLamppost, MapRecoZone, MapFrame, RECO_STYLE, lamppostDisplay } from "@/types/solux";
import { getLamppostIconOptions, getLamppostLabel } from "@/lib/lamppostIcon";

// Additional viewport onto the SAME study (Study Lab feedback #5).
// Fully independent pan/zoom, read-only overlays: it lets a project whose
// zones are kilometres apart show each area in its own readable frame, both
// in the app and in the exported PDF. Assumes the Maps JS API is already
// loaded by the main map (this component only renders below it).
interface Props {
  frame: MapFrame;
  index: number;
  areas: MapArea[];
  lampposts: MapLamppost[];
  recoZones: MapRecoZone[];
  fallbackCenter: { lat: number; lng: number };
  fallbackZoom: number;
  onViewChange: (id: string, center: { lat: number; lng: number }, zoom: number) => void;
  onRemove: (id: string) => void;
  lang?: "fr" | "en";
}

const FRAME_STYLE = { width: "100%", height: "420px", borderRadius: "0.5rem" } as const;

const MapFrameView = memo(function MapFrameView({
  frame, index, areas, lampposts, recoZones, fallbackCenter, fallbackZoom, onViewChange, onRemove, lang = "en",
}: Props) {
  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);
  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setMapTypeId("satellite");
    map.setCenter(frame.center ?? fallbackCenter);
    map.setZoom(frame.zoom ?? fallbackZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist this frame's own viewport (debounced by Maps' idle event).
  const onIdle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const z = map.getZoom();
    if (c && z !== undefined) onViewChange(frame.id, { lat: c.lat(), lng: c.lng() }, z);
  }, [frame.id, onViewChange]);

  const options = useMemo(
    () => ({
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy" as const,
      tilt: 0,
      heading: 0,
    }),
    [],
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {l("Vue supplémentaire", "Additional view")} {index + 2}
          <span className="text-xs text-muted-foreground font-normal ml-2">
            {l("déplacez / zoomez librement — cette vue sera exportée dans le PDF", "pan / zoom freely — this view is exported in the PDF")}
          </span>
        </p>
        <Button
          type="button" size="sm" variant="ghost"
          className="h-7 text-destructive hover:text-destructive"
          onClick={() => onRemove(frame.id)}
          title={l("Retirer cette vue", "Remove this view")}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" /> {l("Retirer", "Remove")}
        </Button>
      </div>
      <div className="rounded-lg border border-border">
        <GoogleMap mapContainerStyle={FRAME_STYLE} onLoad={onLoad} onIdle={onIdle} options={options}>
          {areas.map((area) => (
            <PolygonF
              key={area.id}
              paths={area.paths}
              options={{ fillColor: area.color, fillOpacity: 0.3, strokeColor: area.color, strokeWeight: 2, clickable: false }}
            />
          ))}
          {recoZones.map((zone) => {
            const style = RECO_STYLE[zone.kind];
            return (
              <RectangleF
                key={zone.id}
                bounds={zone.bounds}
                options={{ strokeColor: style.stroke, strokeWeight: 2, fillColor: style.fill, fillOpacity: 0.12, clickable: false }}
              />
            );
          })}
          {lampposts.map((lp, i) => {
            const identity = lamppostDisplay(lp, i);
            return (
              <MarkerF
                key={lp.id}
                position={{ lat: lp.lat, lng: lp.lng }}
                icon={getLamppostIconOptions({ type: lp.type, rotation: lp.rotation || 0, color: identity.color })}
                label={getLamppostLabel(identity.label, identity.color)}
                clickable={false}
              />
            );
          })}
        </GoogleMap>
      </div>
    </div>
  );
});

export default MapFrameView;
