import { useState, useCallback, useRef, useEffect, useMemo, memo, Fragment } from "react";
import { uid } from "@/lib/utils";
import { GoogleMap, useJsApiLoader, PolygonF, MarkerF, PolylineF, RectangleF } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, RotateCcw, RotateCw, Plus, Minus, MousePointer, PenTool, SquareCheckBig, Ban, X } from "lucide-react";
import { MapArea, MapLamppost, MapRecoZone, RecoKind, RECO_STYLE, recoMapRectOptions, recoBadgePosition, COLOR_OPTIONS, lamppostDisplay } from "@/types/solux";
import ColorSwatches from "@/components/ColorSwatches";
import ConfirmButton from "@/components/ConfirmButton";
import HelpTip from "@/components/HelpTip";
import { Label } from "@/components/ui/label";
import { getLamppostIconOptions, getLamppostLabel, LAMPPOST_SELECTION_STROKE } from "@/lib/lamppostIcon";
import { MAP_SYMBOL_CIRCLE } from "@/lib/googleMapsSymbols";

const LIBRARIES: ("places" | "drawing")[] = ["places", "drawing"];
const MAP_CLICK_SUPPRESSION_MS = 250;
const MAP_VIEW_DEBOUNCE_MS = 500;
// Taller map now that the page uses the full widescreen width — more room to
// draw and review project areas comfortably.
const MAP_CONTAINER_STYLE = { width: "100%", height: "640px", borderRadius: "0.5rem" } as const;

const debounce = <A extends unknown[]>(fn: (...args: A) => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

const mapViewRoughlyEqual = (
  a: { zoom: number; center: { lat: number; lng: number } } | null,
  zoom: number,
  center: { lat: number; lng: number }
) =>
  a !== null &&
  a.zoom === zoom &&
  Math.abs(a.center.lat - center.lat) < 1e-6 &&
  Math.abs(a.center.lng - center.lng) < 1e-6;

export interface MapSectionValue {
  address: string;
  location?: { lat: number; lng: number } | null;
  areas: MapArea[];
  lampposts: MapLamppost[];
  recoZones: MapRecoZone[];
}

interface Props {
  apiKey: string;
  value: MapSectionValue;
  onChange: (val: MapSectionValue) => void;
  onMapViewChange?: (zoom: number, center: { lat: number; lng: number }) => void;
  // Increment to activate the Lasso tool from outside (e.g. the "Draw a study
  // zone" button in the levels section's empty state).
  lassoRequestSignal?: number;
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

const GoogleMapSection = ({ apiKey, value, onChange, onMapViewChange, lassoRequestSignal = 0, lang = "en" }: Props) => {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries: LIBRARIES });
  const mapRef = useRef<google.maps.Map | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const suppressMapClickUntilRef = useRef(0);
  // The Places autocomplete listener is attached once; without these refs it would
  // close over the first-render value/onChange and wipe any zones drawn afterwards
  // when the user picks an address (a stale-closure data-loss bug).
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [mapType, setMapType] = useState<string>("satellite");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [colorIndex, setColorIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<"lasso" | "select" | "lamppost" | "reco">("select");
  const [lamppostType, setLamppostType] = useState<"single" | "double">("single");
  const [selectedLamppostId, setSelectedLamppostId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState(COLOR_OPTIONS[0]);

  // Recommendation-zone drawing (replaces the Line tool): first click fixes a
  // corner, the mouse previews the rectangle, the second click opens the
  // Recommended/Excluded chooser.
  const [recoStart, setRecoStart] = useState<{ lat: number; lng: number } | null>(null);
  const [recoCursor, setRecoCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingReco, setPendingReco] = useState<MapRecoZone["bounds"] | null>(null);
  const [selectedRecoId, setSelectedRecoId] = useState<string | null>(null);
  // Live Rectangle instances, to read user-edited bounds back on commit.
  const recoRectsRef = useRef<Record<string, google.maps.Rectangle>>({});

  // Lasso state (click-to-add mode).
  const [lassoPath, setLassoPath] = useState<{ lat: number; lng: number }[]>([]);
  // A double-click reaches us as click → click → dblclick, and Maps listeners
  // keep the callback from the PREVIOUS render — so any handler that closes
  // the polygon must read the path through a ref, never from its closure
  // (otherwise the dblclick sees a stale, shorter path and "does nothing").
  const lassoPathRef = useRef(lassoPath);
  lassoPathRef.current = lassoPath;
  const selectedColorRef = useRef(selectedColor);
  selectedColorRef.current = selectedColor;
  const colorIndexRef = useRef(colorIndex);
  colorIndexRef.current = colorIndex;
  // Timestamp+position of the previous lasso click, to detect a double-click
  // ourselves: the two burst clicks would otherwise add a duplicate vertex
  // before the dblclick event ever fires.
  const lastLassoClickRef = useRef<{ t: number; x: number; y: number } | null>(null);

  // External "start drawing" request (see lassoRequestSignal prop).
  useEffect(() => {
    if (lassoRequestSignal > 0) setActiveTool("lasso");
  }, [lassoRequestSignal]);

  // Leaving the reco tool abandons a half-drawn rectangle (the chooser for a
  // COMPLETED rectangle stays open — switching tools must not lose it).
  useEffect(() => {
    if (activeTool !== "reco") {
      setRecoStart(null);
      setRecoCursor(null);
    }
  }, [activeTool]);

  const l = (fr: string, en: string) => (lang === "fr" ? fr : en);

  const defaultCenter = useMemo(
    () => value.location || { lat: 46.2276, lng: 2.2137 },
    [value.location?.lat, value.location?.lng]
  );
  const defaultZoom = useMemo(() => (value.location ? 16 : 5), [value.location?.lat, value.location?.lng]);
  const lastMapViewRef = useRef<{ zoom: number; center: { lat: number; lng: number } } | null>(null);

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

  // Google Places Autocomplete. NOTE: still the legacy `Autocomplete` widget —
  // migrating to the modern `AutocompleteSuggestion` API is written and ready but
  // needs "Places API (New)" enabled in the GCP project (currently disabled, so
  // only this legacy widget resolves). The listener is attached once; the
  // valueRef/onChangeRef indirection keeps drawn zones from being wiped on select.
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
        const current = valueRef.current;
        const addr = place.formatted_address || place.name || current.address;
        onChangeRef.current({ ...current, address: addr, location: { lat, lng } });
        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(17);
      }
    });
    autocompleteRef.current = ac;
  }, [isLoaded]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setMapTypeId(mapType);
    // GoogleMap from @react-google-maps/api does NOT honour defaultCenter/defaultZoom,
    // so without this the map starts with no viewport and paints a grey canvas until
    // the first pan. Set the initial view explicitly here (uncontrolled: we don't pass
    // center/zoom props, which would fight the user's panning).
    map.setCenter(defaultCenter);
    map.setZoom(defaultZoom);
  }, [mapType, defaultCenter, defaultZoom]);

  const debouncedMapViewChange = useMemo(() => {
    if (!onMapViewChange) return null;
    return debounce((zoom: number, center: { lat: number; lng: number }) => {
      if (mapViewRoughlyEqual(lastMapViewRef.current, zoom, center)) return;
      lastMapViewRef.current = { zoom, center };
      onMapViewChange(zoom, center);
    }, MAP_VIEW_DEBOUNCE_MS);
  }, [onMapViewChange]);

  useEffect(() => () => debouncedMapViewChange?.cancel(), [debouncedMapViewChange]);

  useEffect(() => {
    if (!value.location || !mapRef.current) return;
    mapRef.current.panTo(value.location);
    const currentZoom = mapRef.current.getZoom();
    if (currentZoom === undefined || currentZoom < 14) {
      mapRef.current.setZoom(16);
    }
  }, [value.location?.lat, value.location?.lng]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setMapTypeId(mapType);
    }
  }, [mapType]);

  const onMapIdle = useCallback(() => {
    if (!mapRef.current || !debouncedMapViewChange) return;
    const z = mapRef.current.getZoom();
    const c = mapRef.current.getCenter();
    if (z !== undefined && c) {
      debouncedMapViewChange(z, { lat: c.lat(), lng: c.lng() });
    }
  }, [debouncedMapViewChange]);

  const mapOptions = useMemo(
    () => ({
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      gestureHandling: "greedy" as const,
      tilt: 0,
      heading: 0,
      // The map pans in Select AND Lamppost mode; it is locked only while
      // actively drawing (lasso points, or a reco rectangle press-drag).
      draggable: activeTool !== "lasso" && activeTool !== "reco",
      disableDoubleClickZoom: activeTool === "lasso",
      draggableCursor:
        activeTool === "lasso" || activeTool === "reco" ? "crosshair" : "grab",
    }),
    [activeTool]
  );

  const polygonOptionsByArea = useMemo(
    () =>
      Object.fromEntries(
        value.areas.map((area) => [
          area.id,
          {
            fillColor: area.color,
            fillOpacity: 0.3,
            strokeColor: area.color,
            strokeWeight: 2,
            // Zones only capture clicks in Select mode. In every drawing mode
            // they must be transparent to clicks, otherwise a lamppost / lasso
            // point / line point can never be placed INSIDE a zone (feedback #1).
            clickable: activeTool === "select",
          },
        ])
      ),
    [value.areas, activeTool]
  );

  const lassoPolylineOptions = useMemo(
    // clickable: false — the preview line must never swallow the clicks /
    // double-click meant for the map underneath it.
    () => ({ strokeColor: selectedColor, strokeWeight: 2, strokeOpacity: 0.8, clickable: false }),
    [selectedColor]
  );

  const selectionRingIcon = useMemo(
    () => ({
      path: MAP_SYMBOL_CIRCLE,
      fillOpacity: 0,
      strokeColor: LAMPPOST_SELECTION_STROKE,
      strokeOpacity: 1,
      strokeWeight: 2,
      scale: 24,
    }),
    []
  );

  const lassoPointIcon = useCallback(
    (pointIndex: number) => ({
      path: MAP_SYMBOL_CIRCLE,
      fillColor: selectedColor,
      fillOpacity: 1,
      strokeColor: "#fff",
      strokeWeight: 1.5,
      scale: pointIndex === 0 ? 7 : 5,
    }),
    [selectedColor]
  );

  // Close the current lasso polygon. Reads everything through refs so it
  // works identically no matter which (possibly stale) Maps listener calls it.
  const closeLasso = useCallback(() => {
    const path = lassoPathRef.current;
    lastLassoClickRef.current = null;
    if (path.length >= 3) {
      const current = valueRef.current;
      const newArea: MapArea = {
        id: uid(),
        type: "polygon",
        paths: path,
        color: selectedColorRef.current,
        name: `Zone ${current.areas.length + 1}`,
      };
      onChangeRef.current({ ...current, areas: [...current.areas, newArea] });
      const nextIdx = (colorIndexRef.current + 1) % COLOR_OPTIONS.length;
      setSelectedColor(COLOR_OPTIONS[nextIdx]);
      setColorIndex(nextIdx);
    }
    setLassoPath([]);
    // Feedback #1 — the moment a zone is finished, hand the map back to normal
    // navigation (Select is draggable) so the user can pan/zoom immediately
    // without clicking Select first.
    setActiveTool("select");
  }, []);

  // Two corners → normalised rectangle bounds.
  const cornersToBounds = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => ({
    north: Math.max(a.lat, b.lat),
    south: Math.min(a.lat, b.lat),
    east: Math.max(a.lng, b.lng),
    west: Math.min(a.lng, b.lng),
  });

  // Commit the pending rectangle once the salesperson picks its meaning.
  const commitReco = useCallback((kind: RecoKind) => {
    setPendingReco((bounds) => {
      if (bounds) {
        const current = valueRef.current;
        onChangeRef.current({
          ...current,
          recoZones: [...(current.recoZones || []), { id: uid(), kind, bounds }],
        });
      }
      return null;
    });
  }, []);

  // Read back the live rectangle after a move/resize and persist it.
  const commitRecoBounds = useCallback((id: string) => {
    const rect = recoRectsRef.current[id];
    const b = rect?.getBounds();
    if (!b) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const next = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
    const current = valueRef.current;
    const existing = (current.recoZones || []).find((z) => z.id === id);
    if (!existing) return;
    const same = Math.abs(existing.bounds.north - next.north) < 1e-9 &&
      Math.abs(existing.bounds.south - next.south) < 1e-9 &&
      Math.abs(existing.bounds.east - next.east) < 1e-9 &&
      Math.abs(existing.bounds.west - next.west) < 1e-9;
    if (same) return;
    onChangeRef.current({
      ...current,
      recoZones: (current.recoZones || []).map((z) => (z.id === id ? { ...z, bounds: next } : z)),
    });
  }, []);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (Date.now() < suppressMapClickUntilRef.current) {
      return;
    }

    if (activeTool === "lasso" && e.latLng) {
      // Detect the second click of a double-click ourselves: Maps fires
      // click, click, dblclick — without this, the burst adds a duplicate
      // vertex and the dblclick handler runs against a stale listener.
      const now = Date.now();
      const dom = e.domEvent instanceof MouseEvent ? e.domEvent : null;
      const x = dom?.clientX ?? 0;
      const y = dom?.clientY ?? 0;
      const last = lastLassoClickRef.current;
      if (last && now - last.t < 400 && Math.hypot(x - last.x, y - last.y) < 12) {
        closeLasso();
        return;
      }
      lastLassoClickRef.current = { t: now, x, y };
      setLassoPath((prev) => [...prev, { lat: e.latLng!.lat(), lng: e.latLng!.lng() }]);
    } else if (activeTool === "lamppost" && e.latLng) {
      const count = (value.lampposts || []).length;
      const identity = lamppostDisplay({}, count);
      const newLamppost: MapLamppost = {
        id: uid(),
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
        type: lamppostType,
        rotation: 0,
        // Feedback #4 — every pole is born with its own colour + number.
        color: identity.color,
        label: identity.label,
      };
      onChange({ ...value, lampposts: [...(value.lampposts || []), newLamppost] });
      setSelectedLamppostId(newLamppost.id);
      // Stay in lamppost mode so several poles can be placed in a row —
      // including directly inside zones (feedback #1).
    }
  }, [activeTool, lamppostType, onChange, value, closeLasso]);

  // Backup close path — kept for the case where the two burst clicks land
  // just outside the 12px tolerance (e.g. a fast hand on a trackpad).
  const handleMapDblClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool === "lasso") {
      e.stop();
      closeLasso();
    }
  }, [activeTool, closeLasso]);

  // Reco rectangle = press-drag-release (feedback #2): mousedown fixes the
  // first corner, mousemove previews, mouseup opens the type chooser. Behaves
  // like the rectangular-selection tool users know from other software.
  const handleMapMouseDown = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool === "reco" && e.latLng) {
      setRecoStart({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      setRecoCursor({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      setPendingReco(null);
    }
  }, [activeTool]);

  const handleMapMouseMove = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool === "reco" && recoStart && e.latLng) {
      setRecoCursor({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, [activeTool, recoStart]);

  const handleMapMouseUp = useCallback((e: google.maps.MapMouseEvent) => {
    if (activeTool !== "reco" || !recoStart || !e.latLng) return;
    const end = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    const bounds = cornersToBounds(recoStart, end);
    setRecoStart(null);
    setRecoCursor(null);
    // Ignore an accidental click with no real drag.
    if (Math.abs(bounds.north - bounds.south) < 1e-6 || Math.abs(bounds.east - bounds.west) < 1e-6) return;
    setPendingReco(bounds);
  }, [activeTool, recoStart]);

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
        lp.id === id ? { ...lp, rotation: (((lp.rotation || 0) + delta) + 360) % 360 } : lp
      ),
    });
  };

  const deleteLamppost = (id: string) => {
    onChange({ ...value, lampposts: (value.lampposts || []).filter((lp) => lp.id !== id) });
    setSelectedLamppostId(null);
  };

  const blockMapInteraction = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    suppressMapClickUntilRef.current = Date.now() + MAP_CLICK_SUPPRESSION_MS;
    setActiveTool("select");
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
        <ColorSwatches value={selectedColor} onChange={setSelectedColor} />
        <div className="w-px h-6 bg-border" />
        {/* Tools — each explains what it does, why it exists and when to use
            it, readable just by hovering (Study Lab feedback). */}
        <HelpTip tip={l(
          "Dessine le contour d'une zone d'étude : cliquez pour poser des points autour de la surface à éclairer, double-cliquez pour fermer. C'est la surface sur laquelle le Study Lab calculera l'éclairage — commencez par ceci.",
          "Draws the boundary of a study zone: click to place points around the area to light, double-click to close. This is the surface the Study Lab will calculate lighting for — start here.",
        )}>
          <Button
            type="button" size="sm"
            variant={activeTool === "lasso" ? "default" : "outline"}
            onClick={() => setActiveTool("lasso")}
          >
            <PenTool className="h-4 w-4 mr-1" /> {l("Lasso", "Lasso")}
          </Button>
        </HelpTip>
        <HelpTip tip={l(
          "Sélectionne un élément existant pour le modifier : cliquez sur une zone pour la renommer ou changer sa couleur, sur un lampadaire pour le renommer, l'orienter ou le supprimer, sur une zone de recommandation pour la déplacer ou la redimensionner.",
          "Selects an existing element to edit it: click a zone to rename or recolour it, a lamp post to rename, rotate or delete it, a recommendation area to move or resize it.",
        )}>
          <Button
            type="button" size="sm"
            variant={activeTool === "select" ? "default" : "outline"}
            onClick={() => setActiveTool("select")}
          >
            <MousePointer className="h-4 w-4 mr-1" /> {l("Sélection", "Select")}
          </Button>
        </HelpTip>
        <HelpTip tip={l(
          "Dessine une zone recommandée ou exclue pour le Study Lab : cliquez-glissez sur la carte pour tracer un rectangle, relâchez, puis choisissez ✓ Recommandée (installer ici de préférence) ou ⛔ Exclue (ne pas installer ici). Utilisez-le pour transmettre vos contraintes de terrain sans texte.",
          "Draws a recommended or excluded area for the Study Lab: click and drag on the map to draw a rectangle, release, then choose ✓ Recommended (preferably install here) or ⛔ Excluded (do not install here). Use it to pass on field constraints without writing text.",
        )}>
          <Button
            type="button" size="sm"
            variant={activeTool === "reco" ? "default" : "outline"}
            onClick={() => setActiveTool("reco")}
          >
            <SquareCheckBig className="h-4 w-4 mr-1" /> {l("Zone reco.", "Reco. zone")}
          </Button>
        </HelpTip>
        <HelpTip tip={l(
          "Place les lampadaires existants ou souhaités : cliquez sur la carte (y compris dans une zone) pour poser un mât. Chaque lampadaire reçoit une couleur et un numéro (L1, L2…) pour en parler facilement avec le Study Lab. Glissez-le pour le déplacer.",
          "Places existing or proposed lamp posts: click the map (including inside a zone) to drop a pole. Each lamp post gets a colour and a number (L1, L2…) so you can discuss a precise pole with the Study Lab. Drag it to move it.",
        )}>
          <Button
            type="button" size="sm"
            variant={activeTool === "lamppost" ? "default" : "outline"}
            onClick={() => setActiveTool("lamppost")}
          >
            💡 {l("Lampadaire", "Lamppost")}
          </Button>
        </HelpTip>
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
        {activeTool === "reco" && !pendingReco && (
          <span className="text-xs text-muted-foreground">
            {l("Cliquez-glissez sur la carte pour dessiner un rectangle, puis relâchez", "Click and drag on the map to draw a rectangle, then release")}
          </span>
        )}
      </div>

      {/* Recommended / Excluded chooser — appears once the rectangle is drawn. */}
      {pendingReco && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <span className="text-sm font-medium">{l("Quel type d'indication ?", "What kind of indication?")}</span>
          <Button
            type="button" size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => commitReco("recommended")}
          >
            <SquareCheckBig className="h-4 w-4 mr-1.5" />
            {l("Zone recommandée", "Recommended area")}
          </Button>
          <Button
            type="button" size="sm"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => commitReco("excluded")}
          >
            <Ban className="h-4 w-4 mr-1.5" />
            {l("Zone exclue", "Excluded area")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPendingReco(null)}>
            <X className="h-4 w-4 mr-1" /> {l("Annuler", "Cancel")}
          </Button>
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-lg border border-border">
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          onLoad={onMapLoad}
          onIdle={onMapIdle}
          onClick={handleMapClick}
          onDblClick={handleMapDblClick}
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
          options={mapOptions}
        >
          {/* Polygons */}
          {value.areas.map((area) => (
            <PolygonF
              key={area.id}
              paths={area.paths}
              options={polygonOptionsByArea[area.id]}
              onClick={() => startEditing(area)}
            />
          ))}

          {/* Recommendation zones — deliberately NOT like calc zones: a thick
              hollow box with a corner ✓/⛔ badge (feedback #3). Selected →
              draggable + resizable natively. */}
          {(value.recoZones || []).map((zone) => {
            const style = RECO_STYLE[zone.kind];
            const isSelected = selectedRecoId === zone.id;
            return (
              <Fragment key={zone.id}>
                <RectangleF
                  bounds={zone.bounds}
                  options={{
                    ...recoMapRectOptions(zone.kind, isSelected, activeTool === "select"),
                    editable: isSelected,
                    draggable: isSelected,
                  }}
                  onLoad={(rect) => { recoRectsRef.current[zone.id] = rect; }}
                  onUnmount={() => { delete recoRectsRef.current[zone.id]; }}
                  onClick={() => setSelectedRecoId(isSelected ? null : zone.id)}
                  onMouseUp={() => { if (isSelected) commitRecoBounds(zone.id); }}
                  onDragEnd={() => commitRecoBounds(zone.id)}
                />
                <MarkerF
                  position={recoBadgePosition(zone.bounds)}
                  clickable={false}
                  zIndex={7}
                  icon={{ path: MAP_SYMBOL_CIRCLE, scale: 11, fillColor: "#ffffff", fillOpacity: 1, strokeColor: style.stroke, strokeWeight: 2 }}
                  label={{ text: style.icon, color: style.stroke, fontSize: "13px", fontWeight: "900" }}
                />
              </Fragment>
            );
          })}

          {/* Rectangle preview while dragging (press-drag-release) */}
          {recoStart && recoCursor && (
            <RectangleF
              bounds={cornersToBounds(recoStart, recoCursor)}
              options={{ strokeColor: "#334155", strokeWeight: 2, fillColor: "#334155", fillOpacity: 0.06, clickable: false }}
            />
          )}
          {pendingReco && (
            <RectangleF
              bounds={pendingReco}
              options={{ strokeColor: "#334155", strokeWeight: 2, fillColor: "#334155", fillOpacity: 0.08, clickable: false }}
            />
          )}

          {/* Lasso path */}
          {lassoPath.length > 0 && (
            <>
              <PolylineF
                path={[...lassoPath, lassoPath[0]]}
                options={lassoPolylineOptions}
              />
              {lassoPath.map((pt, i) => (
                <MarkerF
                  key={`lasso-pt-${i}`}
                  position={pt}
                  icon={lassoPointIcon(i)}
                  onClick={() => {
                    if (i === 0 && lassoPath.length >= 3) closeLasso();
                  }}
                  // A double-click on/near an existing vertex hits the MARKER,
                  // not the map — close from here too instead of doing nothing.
                  onDblClick={() => {
                    if (lassoPathRef.current.length >= 3) closeLasso();
                  }}
                />
              ))}
            </>
          )}

          {/* Lampposts */}
          {(value.lampposts || []).map((lp, idx) => (
            <LamppostMarker
              key={lp.id}
              lamppost={lp}
              index={idx}
              selected={selectedLamppostId === lp.id}
              onSelect={() => {
                suppressMapClickUntilRef.current = Date.now() + MAP_CLICK_SUPPRESSION_MS;
                setSelectedLamppostId(selectedLamppostId === lp.id ? null : lp.id);
                setActiveTool("select");
              }}
              onDragEnd={(lat, lng) => {
                suppressMapClickUntilRef.current = Date.now() + MAP_CLICK_SUPPRESSION_MS;
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((l) =>
                    l.id === lp.id ? { ...l, lat, lng } : l
                  ),
                });
              }}
            />
          ))}

          {/* Selected lamppost highlight ring — clickable:false is essential:
              the ring sits ON TOP of the pole marker, and a clickable ring
              swallowed every drag, making the SELECTED lamppost the only one
              that could not be moved (feedback #1). */}
          {selectedLamppostId && (() => {
            const lp = (value.lampposts || []).find((l) => l.id === selectedLamppostId);
            if (!lp) return null;
            return (
              <MarkerF
                key={`selection-ring-${lp.id}`}
                position={{ lat: lp.lat, lng: lp.lng }}
                zIndex={999}
                icon={selectionRingIcon}
                clickable={false}
              />
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
          <Button type="button" size="sm" variant={mapType === "satellite" ? "default" : "secondary"} onClick={() => setMapType("satellite")} title={l("Vue satellite", "Satellite view")}>
            Satellite
          </Button>
          <Button type="button" size="sm" variant={mapType === "hybrid" ? "default" : "secondary"} onClick={() => setMapType("hybrid")} title={l("Satellite avec noms de rues", "Satellite with street names")}>
            {l("Hybride", "Hybrid")}
          </Button>
        </div>

        {/* Clear all — drawn zones are slow manual work, so confirm first. */}
        {value.areas.length > 0 && (
          <div className="absolute bottom-2 left-2">
            <ConfirmButton
              title={l("Effacer toutes les zones ?", "Clear all zones?")}
              description={l(
                `${value.areas.length} zone(s) dessinée(s) et leurs niveaux d'éclairage seront supprimés. Cette action ne peut pas être annulée.`,
                `${value.areas.length} drawn zone(s) and their lighting levels will be removed. This cannot be undone.`,
              )}
              confirmLabel={l("Tout effacer", "Clear all")}
              cancelLabel={l("Annuler", "Cancel")}
              onConfirm={clearAllAreas}
            >
              <Button type="button" size="sm" variant="destructive">
                {l("Effacer toutes les zones", "Clear all zones")}
              </Button>
            </ConfirmButton>
          </div>
        )}
      </div>

      {selectedLamppostId && (() => {
        const lpIndex = (value.lampposts || []).findIndex((l) => l.id === selectedLamppostId);
        const lp = lpIndex >= 0 ? (value.lampposts || [])[lpIndex] : null;
        if (!lp) return null;
        const identity = lamppostDisplay(lp, lpIndex);
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm" onMouseDown={blockMapInteraction} onClick={blockMapInteraction}>
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white" style={{ backgroundColor: identity.color }}>
              {identity.label}
            </span>
            <Label className="text-xs text-muted-foreground">{l("Nom", "Name")}</Label>
            <Input
              className="h-7 w-24 text-sm"
              value={lp.label ?? identity.label}
              maxLength={12}
              onChange={(e) => {
                onChange({
                  ...value,
                  lampposts: (value.lampposts || []).map((x) => (x.id === lp.id ? { ...x, label: e.target.value } : x)),
                });
              }}
            />
            <span className="text-sm text-muted-foreground">{l("Orientation", "Orientation")}: {lp.rotation || 0}°</span>
            <Button type="button" size="sm" variant="outline" onClick={(e) => { blockMapInteraction(e); rotateLamppost(lp.id, -15); }}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={(e) => { blockMapInteraction(e); rotateLamppost(lp.id, 15); }}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={(e) => { blockMapInteraction(e); deleteLamppost(lp.id); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })()}

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
                  <ColorSwatches value={editingColor} onChange={setEditingColor} size="sm" />
                  <Button type="button" size="sm" variant="ghost" onClick={saveEditing}>✓</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingAreaId(null)}>✕</Button>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="text-sm flex-1">{area.name || "Zone"}</span>
                  <span className="text-xs text-muted-foreground">{area.type}</span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => startEditing(area)} title={l("Renommer / changer la couleur", "Rename / change colour")}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <ConfirmButton
                    title={l("Supprimer cette zone ?", "Delete this zone?")}
                    description={l(
                      `« ${area.name || "Zone"} » et ses niveaux d'éclairage seront supprimés. Cette action ne peut pas être annulée.`,
                      `“${area.name || "Zone"}” and its lighting levels will be removed. This cannot be undone.`,
                    )}
                    confirmLabel={l("Supprimer", "Delete")}
                    cancelLabel={l("Annuler", "Cancel")}
                    onConfirm={() => clearArea(area.id)}
                  >
                    <Button type="button" size="sm" variant="ghost" title={l("Supprimer la zone", "Delete zone")}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </ConfirmButton>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected recommendation zone — kind toggle + delete + how-to hint. */}
      {selectedRecoId && (() => {
        const zone = (value.recoZones || []).find((z) => z.id === selectedRecoId);
        if (!zone) return null;
        const style = RECO_STYLE[zone.kind];
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
            <span className="text-sm font-semibold" style={{ color: style.stroke }}>
              {style.icon} {lang === "fr" ? style.labelFr : style.labelEn}
            </span>
            <span className="text-xs text-muted-foreground">
              {l("Glissez la zone pour la déplacer, tirez les poignées pour la redimensionner.", "Drag the area to move it, pull the handles to resize it.")}
            </span>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => onChange({
                ...value,
                recoZones: (value.recoZones || []).map((z) =>
                  z.id === zone.id ? { ...z, kind: (z.kind === "recommended" ? "excluded" : "recommended") as RecoKind } : z,
                ),
              })}
            >
              {zone.kind === "recommended"
                ? <>{l("Passer en zone exclue", "Switch to excluded")}</>
                : <>{l("Passer en zone recommandée", "Switch to recommended")}</>}
            </Button>
            <Button
              type="button" size="sm" variant="destructive"
              onClick={() => {
                onChange({ ...value, recoZones: (value.recoZones || []).filter((z) => z.id !== zone.id) });
                setSelectedRecoId(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> {l("Supprimer", "Delete")}
            </Button>
          </div>
        );
      })()}

      {/* Recommendation zones list */}
      {(value.recoZones || []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{l("Zones de recommandation", "Recommendation areas")} ({(value.recoZones || []).length})</h3>
          <div className="flex flex-wrap gap-2">
            {(value.recoZones || []).map((zone) => {
              const style = RECO_STYLE[zone.kind];
              return (
                <button
                  key={zone.id}
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-sm ${selectedRecoId === zone.id ? "ring-2 ring-foreground" : ""}`}
                  style={{ borderColor: style.stroke, color: style.stroke }}
                  onClick={() => {
                    setSelectedRecoId(zone.id);
                    setActiveTool("select");
                    mapRef.current?.panTo({
                      lat: (zone.bounds.north + zone.bounds.south) / 2,
                      lng: (zone.bounds.east + zone.bounds.west) / 2,
                    });
                  }}
                >
                  {style.icon} {lang === "fr" ? style.labelFr : style.labelEn}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lamppost legend (feedback #4) — colour + number so sales and the
          Study Lab can refer to a precise pole. Click to select it. */}
      {(value.lampposts || []).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">💡 {(value.lampposts || []).length} {l("lampadaire(s)", "lamppost(s)")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {(value.lampposts || []).map((lp, i) => {
              const identity = lamppostDisplay(lp, i);
              return (
                <button
                  key={lp.id}
                  type="button"
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${selectedLamppostId === lp.id ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                  style={{ backgroundColor: identity.color }}
                  title={`${identity.label} — ${lp.type === "double" ? l("double", "double") : l("simple", "single")}`}
                  onClick={() => {
                    setSelectedLamppostId(lp.id);
                    mapRef.current?.panTo({ lat: lp.lat, lng: lp.lng });
                  }}
                >
                  {identity.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

type LamppostMarkerProps = {
  lamppost: MapLamppost;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (lat: number, lng: number) => void;
};

const LamppostMarker = memo(({ lamppost, index, selected, onSelect, onDragEnd }: LamppostMarkerProps) => {
  const identity = lamppostDisplay(lamppost, index);
  const icon = useMemo(
    () =>
      getLamppostIconOptions({
        type: lamppost.type,
        rotation: lamppost.rotation || 0,
        selected,
        color: identity.color,
      }),
    [lamppost.type, lamppost.rotation, selected, identity.color]
  );
  // Visible identifier (feedback #4) — rendered just above the icon.
  const label = useMemo(() => getLamppostLabel(identity.label, identity.color), [identity.label, identity.color]);

  return (
    <MarkerF
      position={{ lat: lamppost.lat, lng: lamppost.lng }}
      draggable
      icon={icon}
      label={label}
      onClick={onSelect}
      onDragEnd={(e) => {
        if (e.latLng) onDragEnd(e.latLng.lat(), e.latLng.lng());
      }}
    />
  );
});
LamppostMarker.displayName = "LamppostMarker";

export default GoogleMapSection;
