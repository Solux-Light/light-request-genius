import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { GoogleMap, useJsApiLoader, PolygonF, MarkerF, OverlayViewF, OverlayView, PolylineF } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, RotateCcw, RotateCw, Plus, Minus, MousePointer, PenTool } from "lucide-react";
import { MapArea, MapLamppost, COLOR_OPTIONS } from "@/types/solux";

const LIBRARIES: ("places" | "drawing")[] = ["places", "drawing"];

interface Props {
  apiKey: string;
  value: {
    address: string;
    location?: { lat: number; lng: number } | null;
    areas: MapArea[];
    lampposts: MapLamppost[];
  };
  onChange: (val: any) => void;
  onMapViewChange?: (zoom: number, center: { lat: number; lng: number }) => void;
  lang?: "fr" | "en";
}

const parseLatLng = (input: string) => {
  const nums = input.match(/-?\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const lat = parseFloat(nums[0].replace(",", "."));
  const lng = parseFloat(nums[1].replace(",", "."));
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const LAMP_SINGLE = "M0,0 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M4,0 L14,0 M14,-3 L14,3";
const LAMP_DOUBLE = "M0,0 m-4,0 a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M-14,0 L-4,0 M4,0 L14,0 M-14,-3 L-14,3 M14,-3 L14,3";

const GoogleMapSection = ({ apiKey, value, onChange, onMapViewChange, lang = "en" }: Props) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [mapType, setMapType] = useState<string>("satellite");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [colorIndex, setColorIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<"lasso" | "select" | "lamppost">("select");
  const [lamppostType, setLamppostType] = useState<"single" | "double">("single");
  const [selectedLamppostId, setSelectedLamppostId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState(COLOR_OPTIONS[0]);

  // Lasso state (click-to-add mode)
  const [lassoPath, setLassoPath] = useState<{ lat: number; lng: number }[]>([]);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const initialCenter = useMemo(() => value.location || { lat: 46.2276, lng: 2.2137 }, []);
  const initialZoom = useMemo(() => value.location ? 16 : 5, []);

  const handleAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsed = parseLatLng(value.address);
      if (parsed) {
        onChange({ ...value, location: parsed });
        mapRef.current?.panTo(parsed);
        mapRef.current?.setZoom(16);
      }
    }
  };

  const handleAddressBlur = () => {
    const parsed = parseLatLng(value.address);
    if (parsed) {
      onChange({ ...value, location: parsed });
    }
  };
  // Google Places Autocomplete
  useEffect(() => {
    if (!isLoaded || !addressInputRef.current || autocompleteRef.current) return;
    const ac = new google.maps.places.Autocomplete(addressInputRef.current, {
      types: ["geocode", "establishment"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const addr = place.formatted_address || place.name || value.address;
        onChange({ ...value, address: addr, location: { lat, lng } });
        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(17);
      }
    });
    autocompleteRef.current = ac;
  }, [isLoaded]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onMapIdle = useCallback(() => {
    if (mapRef.current && onMapViewChange) {
      const z = mapRef.current.getZoom();
      const c = mapRef.current.getCenter();
      if (z !== undefined && c) {
        onMapViewChange(z, { lat: c.lat(), lng: c.lng() });
      }
    }
  }, [onMapViewChange]);

  // Close the current lasso polygon
  const closeLasso = useCallback(() => {
    if (lassoPath.length >= 3) {
      const nextIdx = (colorIndex + 1) % COLOR_OPTIONS.length;
      const newArea: MapArea = {
        id: crypto.randomUUID(),
        type: "polygon",
        paths: lassoPath,
        color: selectedColor,
        name: `Zone ${value.areas.length + 1}`,
      };
      onChange({ ...value, areas: [...value.areas, newArea] });
      setSelectedColor(COLOR_OPTIONS[nextIdx]);
      setColorIndex(nextIdx);
    }
    setLassoPath([]);
  }, [lassoPath, colorIndex, selectedColor, onChange, value]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool === "lasso" && e.latLng) {
      setLassoPath((prev) => [...prev, { lat: e.latLng!.lat(), lng: e.latLng!.lng() }]);
    } else if (activeTool === "lamppost" && e.latLng) {
      const newLamppost: MapLamppost = {
        id: crypto.randomUUID(),
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
        type: lamppostType,
        rotation: 0,
      };
      onChange({ ...value, lampposts: [...(value.lampposts || []), newLamppost] });
      setSelectedLamppostId(newLamppost.id);
    }
  }, [activeTool, lamppostType, onChange, value]);

  const handleMapDblClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool === "lasso") {
      e.stop();
      closeLasso();
    }
  }, [activeTool, closeLasso]);

  const clearArea = (id: string) => {
    onChange({ ...value, areas: value.areas.filter((a) => a.id !== id) });
  };

  const clearAllAreas = () => {
    onChange({ ...value, areas: [] });
  };

  const startEditing = (area: MapArea) => {
    setEditingAreaId(area.id);
    setEditingName(area.name || "");
    setEditingColor(area.color);
  };

  const saveEditing = () => {
    onChange({
      ...value,
      areas: value.areas.map((a) =>
        a.id === editingAreaId ? { ...a, name: editingName, color: editingColor } : a
      ),
    });
    setEditingAreaId(null);
  };

  const rotateLamppost = (id: string, delta: number) => {
    onChange({
      ...value,
      lampposts: (value.lampposts || []).map((lp) =>
        lp.id === id ? { ...lp, rotation: ((lp.rotation || 0) + delta) % 360 } : lp
      ),
    });
  };

  const deleteLamppost = (id: string) => {
    onChange({ ...value, lampposts: (value.lampposts || []).filter((lp) => lp.id !== id) });
    setSelectedLamppostId(null);
  };

  if (!isLoaded) {
    return <div className="h-96 bg-muted animate-pulse rounded-lg" />;
  }

  return (
    <div className="space-y-3">
      {/* Address Input */}
      <Input
        ref={addressInputRef}
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        onKeyDown={handleAddressKeyDown}
        onBlur={handleAddressBlur}
        placeholder={l("Adresse ou coordonnées GPS", "Address or GPS coordinates")}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Colors */}
        <div className="flex gap-1">
          {COLOR_OPTIONS.map((c) => (
            <button
              type="button"
              key={c}
              className={`w-6 h-6 rounded-full border-2 ${selectedColor === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => setSelectedColor(c)}
            />
          ))}
        </div>
        <div className="w-px h-6 bg-border" />
        {/* Tools */}
        <Button type="button" size="sm" variant={activeTool === "lasso" ? "default" : "outline"} onClick={() => setActiveTool("lasso")}>
          <PenTool className="h-4 w-4 mr-1" /> {l("Lasso", "Lasso")}
        </Button>
        <Button type="button" size="sm" variant={activeTool === "select" ? "default" : "outline"} onClick={() => setActiveTool("select")}>
          <MousePointer className="h-4 w-4 mr-1" /> {l("Sélection", "Select")}
        </Button>
        <Button type="button" size="sm" variant={activeTool === "lamppost" ? "default" : "outline"} onClick={() => setActiveTool("lamppost")}>
          💡 {l("Lampadaire", "Lamppost")}
        </Button>
        {activeTool === "lamppost" && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={lamppostType === "single" ? "default" : "outline"} onClick={() => setLamppostType("single")}>
              {l("Simple", "Single")}
            </Button>
            <Button type="button" size="sm" variant={lamppostType === "double" ? "default" : "outline"} onClick={() => setLamppostType("double")}>
              {l("Double", "Double")}
            </Button>
          </div>
        )}
        {activeTool === "lasso" && lassoPath.length > 0 && (
          <Button type="button" size="sm" variant="default" onClick={closeLasso} disabled={lassoPath.length < 3}>
            ✓ {l("Fermer la zone", "Close zone")} ({lassoPath.length} pts)
          </Button>
        )}
        {activeTool === "lasso" && lassoPath.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {l("Cliquez pour placer des points, double-clic ou cliquez le 1er point pour fermer", "Click to place points, double-click or click first point to close")}
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border border-border">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "500px" }}
          center={initialCenter}
          zoom={initialZoom}
          onLoad={onMapLoad}
          onIdle={onMapIdle}
          onClick={handleMapClick}
          onDblClick={handleMapDblClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            gestureHandling: "greedy",
            tilt: 0,
            heading: 0,
            mapTypeId: mapType,
            draggable: activeTool !== "lasso",
            draggableCursor: activeTool === "lasso" ? "crosshair" : activeTool === "lamppost" ? "crosshair" : "grab",
          }}
        >
          {/* Polygons */}
          {value.areas.map((area) => (
            <PolygonF
              key={area.id}
              paths={area.paths}
              options={{
                fillColor: area.color,
                fillOpacity: 0.3,
                strokeColor: area.color,
                strokeWeight: 2,
                clickable: true,
              }}
              onClick={() => startEditing(area)}
            />
          ))}

          {/* Lasso path */}
          {lassoPath.length > 0 && (
            <>
              <PolylineF
                path={[...lassoPath, lassoPath[0]]}
                options={{ strokeColor: selectedColor, strokeWeight: 2, strokeOpacity: 0.8 }}
              />
              {lassoPath.map((pt, i) => (
                <MarkerF
                  key={`lasso-pt-${i}`}
                  position={pt}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: selectedColor,
                    fillOpacity: 1,
                    strokeColor: "#fff",
                    strokeWeight: 1.5,
                    scale: i === 0 ? 7 : 5,
                  }}
                  onClick={() => {
                    if (i === 0 && lassoPath.length >= 3) closeLasso();
                  }}
                />
              ))}
            </>
          )}

          {/* Lampposts */}
          {(value.lampposts || []).map((lp) => (
            <MarkerF
              key={lp.id}
              position={{ lat: lp.lat, lng: lp.lng }}
              draggable
              onDragEnd={(e) => {
                if (e.latLng) {
                  onChange({
                    ...value,
                    lampposts: (value.lampposts || []).map((l) =>
                      l.id === lp.id ? { ...l, lat: e.latLng!.lat(), lng: e.latLng!.lng() } : l
                    ),
                  });
                }
              }}
              icon={{
                path: lp.type === "double" ? LAMP_DOUBLE : LAMP_SINGLE,
                fillColor: "#f59e0b",
                fillOpacity: 1,
                strokeColor: "#f59e0b",
                strokeWeight: selectedLamppostId === lp.id ? 3 : 2.5,
                scale: selectedLamppostId === lp.id ? 1.45 : 1.2,
                rotation: lp.rotation || 0,
                anchor: new google.maps.Point(0, 0),
              }}
              onClick={() => setSelectedLamppostId(selectedLamppostId === lp.id ? null : lp.id)}
            />
          ))}

          {/* Selected lamppost info window */}
          {selectedLamppostId && (() => {
            const lp = (value.lampposts || []).find((l) => l.id === selectedLamppostId);
            if (!lp) return null;
            return (
              <InfoWindowF position={{ lat: lp.lat, lng: lp.lng }} onCloseClick={() => setSelectedLamppostId(null)}>
                <div className="flex gap-1">
                   <Button type="button" size="sm" variant="outline" onClick={() => rotateLamppost(lp.id, -15)}>
                     <RotateCcw className="h-3 w-3" />
                   </Button>
                   <Button type="button" size="sm" variant="outline" onClick={() => rotateLamppost(lp.id, 15)}>
                     <RotateCw className="h-3 w-3" />
                   </Button>
                   <Button type="button" size="sm" variant="destructive" onClick={() => deleteLamppost(lp.id)}>
                     <Trash2 className="h-3 w-3" />
                   </Button>
                 </div>
              </InfoWindowF>
            );
          })()}

          {/* Reference location marker */}
          {value.location && (
            <MarkerF position={value.location} />
          )}
        </GoogleMap>

        {/* Zoom controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) - 1)}>
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        {/* Map type toggle */}
        <div className="absolute top-2 right-14 flex gap-1">
          <Button type="button" size="sm" variant={mapType === "satellite" ? "default" : "secondary"} onClick={() => setMapType("satellite")}>
            Satellite
          </Button>
          <Button type="button" size="sm" variant={mapType === "hybrid" ? "default" : "secondary"} onClick={() => setMapType("hybrid")}>
            Hybrid
          </Button>
        </div>

        {/* Clear all */}
        {value.areas.length > 0 && (
          <Button type="button" size="sm" variant="destructive" className="absolute bottom-2 left-2" onClick={clearAllAreas}>
            {l("Effacer toutes les zones", "Clear all zones")}
          </Button>
        )}
      </div>

      {/* Zone List */}
      {value.areas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{l("Zones", "Zones")} ({value.areas.length})</h3>
          {value.areas.map((area) => (
            <div key={area.id} className="flex items-center gap-2 p-2 rounded border border-border">
              {editingAreaId === area.id ? (
                <>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: editingColor }} />
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-7 text-sm flex-1"
                  />
                  <div className="flex gap-1">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className={`w-4 h-4 rounded-full border ${editingColor === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setEditingColor(c)}
                      />
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={saveEditing}>✓</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingAreaId(null)}>✕</Button>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="text-sm flex-1">{area.name || "Zone"}</span>
                  <span className="text-xs text-muted-foreground">{area.type}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEditing(area)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => clearArea(area.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lamppost count */}
      {(value.lampposts || []).length > 0 && (
        <p className="text-sm text-muted-foreground">
          💡 {(value.lampposts || []).length} {l("lampadaire(s)", "lamppost(s)")}
        </p>
      )}
    </div>
  );
};

export default GoogleMapSection;
