import { useEffect, useRef, useState } from "react";
import {
  Check,
  Footprints,
  Layers,
  LocateFixed,
  Minus,
  Plus,
  X,
} from "lucide-react";
import {
  MapView,
  heatCategory,
  heatColor,
  mapStyles,
  type MapViewProps,
} from "./MapView";

export interface GoogleMapViewProps extends MapViewProps {
  googleMapsKey: string;
  onLoadError?: () => void;
}

type MapsWindow = Window & {
  google?: any;
  gm_authFailure?: () => void;
  turnsideGoogleMapsLoaded?: () => void;
};
let sdkPromise: Promise<any> | null = null;
let sdkFailure: (() => void) | null = null;
let authHookInstalled = false;
const authenticationListeners = new Set<() => void>();

function loadGoogleMaps(key: string): Promise<any> {
  const browser = window as MapsWindow;
  if (browser.google?.maps?.Map) return Promise.resolve(browser.google.maps);
  if (sdkPromise) return sdkPromise;
  if (!key.trim()) return Promise.reject(new Error("No browser map key"));
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "turnside-google-maps-sdk";
    script.async = true;
    const parameters = new URLSearchParams({
      key: key.trim(),
      v: "weekly",
      loading: "async",
      callback: "turnsideGoogleMapsLoaded",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters}`;
    const fail = () => {
      window.clearTimeout(timer);
      sdkPromise = null;
      script.remove();
      reject(new Error("Map connection unavailable"));
    };
    sdkFailure = fail;
    const timer = window.setTimeout(fail, 14000);
    browser.turnsideGoogleMapsLoaded = () => {
      window.clearTimeout(timer);
      browser.google?.maps?.Map ? resolve(browser.google.maps) : fail();
    };
    if (!authHookInstalled) {
      const previousAuthFailure = browser.gm_authFailure;
      browser.gm_authFailure = () => {
        previousAuthFailure?.();
        authenticationListeners.forEach((listener) => listener());
        sdkFailure?.();
      };
      authHookInstalled = true;
    }
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function htmlOverlay(
  maps: any,
  map: any,
  coordinates: [number, number],
  node: HTMLElement,
  radiusMeters?: number,
) {
  const overlay = new maps.OverlayView();
  const position = new maps.LatLng(coordinates[1], coordinates[0]);
  node.style.position = "absolute";
  node.style.transform = "translate(-50%,-50%)";
  overlay.onAdd = () =>
    overlay.getPanes()?.overlayMouseTarget.appendChild(node);
  overlay.draw = () => {
    const point = overlay.getProjection()?.fromLatLngToDivPixel(position);
    if (point) {
      node.style.left = `${point.x}px`;
      node.style.top = `${point.y}px`;
      if (radiusMeters) { const edge = overlay.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(coordinates[1] + radiusMeters / 111000, coordinates[0])); if (edge) { const diameter = Math.max(20, 2 * Math.abs(edge.y - point.y)); node.style.width = `${diameter}px`; node.style.height = `${diameter}px`; } }
    }
  };
  overlay.onRemove = () => node.remove();
  overlay.setMap(map);
  return overlay;
}

const quietStyle = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "landscape", stylers: [{ color: "#f0f2ef" }] },
  { featureType: "water", stylers: [{ color: "#d7e9ef" }] },
  { featureType: "poi.park", stylers: [{ color: "#e0ecd9" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#859196" }],
  },
];

export function GoogleMapView(props: GoogleMapViewProps) {
  const {
    stops,
    hotspots,
    selectedId,
    center,
    mapboxToken,
    googleMapsKey,
    heatAreas = [],
    heatVisible = false,
    heatFilter = "all",
    selectedAreaId,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const maps = useRef<any>(null);
  const pins = useRef<any[]>([]);
  const areas = useRef<any[]>([]);
  const routeShapes = useRef<any[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [layersOpen, setLayersOpen] = useState(false);
  const [layer, setLayer] = useState<"map" | "quiet" | "satellite">("quiet");
  const [route, setRoute] = useState<{
    coordinates: [number, number][];
    source: string;
    durationMinutes?: number;
    distanceMeters?: number;
  } | null>(null);
  const category = heatCategory(heatFilter);
  const coordinateKey = stops
    .map((stop) => stop.coordinates.join(","))
    .join(";");

  const clearObjects = (objects: any[]) =>
    objects.forEach((object) => {
      object.setMap?.(null);
      maps.current?.event.clearInstanceListeners(object);
    });
  const fit = () => {
    if (!map.current || !maps.current) return;
    const bounds = new maps.current.LatLngBounds();
    stops.forEach((stop) =>
      bounds.extend({ lng: stop.coordinates[0], lat: stop.coordinates[1] }),
    );
    if (heatVisible)
      heatAreas.forEach((area) => {
        bounds.extend({ lng: area.bounds[0], lat: area.bounds[1] });
        bounds.extend({ lng: area.bounds[2], lat: area.bounds[3] });
      });
    if (bounds.isEmpty()) {
      map.current.setCenter({ lng: center[0], lat: center[1] });
      map.current.setZoom(13);
    } else {
      map.current.fitBounds(bounds, {
        top: 115,
        bottom: 115,
        left: 65,
        right: 65,
      });
      maps.current.event.addListenerOnce(map.current, "idle", () => {
        if (map.current?.getZoom() > 15) map.current.setZoom(15);
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timeout: number | undefined;
    let observer: ResizeObserver | undefined;
    const fail = () => {
      if (cancelled) return;
      setStatus("failed");
      propsRef.current.onLoadError?.();
      clearObjects([...pins.current, ...areas.current, ...routeShapes.current]);
      if (map.current) maps.current?.event.clearInstanceListeners(map.current);
      map.current = null;
    };
    setStatus("loading");
    authenticationListeners.add(fail);
    loadGoogleMaps(googleMapsKey)
      .then((api) => {
        if (cancelled || !container.current) return;
        maps.current = api;
        const instance = new api.Map(container.current, {
          center: { lng: center[0], lat: center[1] },
          zoom: 13,
          maxZoom: 19,
          minZoom: 3,
          disableDefaultUI: true,
          keyboardShortcuts: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: quietStyle,
          backgroundColor: "#edf0ed",
        });
        map.current = instance;
        timeout = window.setTimeout(fail, 14000);
        api.event.addListenerOnce(instance, "tilesloaded", () => {
          window.clearTimeout(timeout);
          if (!cancelled && map.current) setStatus("ready");
        });
        observer = new ResizeObserver(() =>
          api.event.trigger(instance, "resize"),
        );
        observer.observe(container.current);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      observer?.disconnect();
      authenticationListeners.delete(fail);
      clearObjects([...pins.current, ...areas.current, ...routeShapes.current]);
      if (map.current) maps.current?.event.clearInstanceListeners(map.current);
      pins.current = [];
      areas.current = [];
      routeShapes.current = [];
      map.current = null;
    };
  }, [googleMapsKey]);

  useEffect(() => {
    if (status === "ready") fit();
  }, [status, coordinateKey, center.join(","), heatVisible, heatAreas.length]);
  useEffect(() => {
    if (map.current)
      map.current.setOptions({
        mapTypeId: layer === "satellite" ? "hybrid" : "roadmap",
        styles: layer === "quiet" ? quietStyle : [],
      });
  }, [layer, status]);

  useEffect(() => {
    if (status !== "ready" || !map.current) return;
    clearObjects(pins.current);
    pins.current = [];
    stops.forEach((stop, index) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "way-google-pin";
      node.style.zIndex = stop.id === selectedId ? "1000" : "700";
      node.title = stop.title;
      node.setAttribute(
        "aria-label",
        `${index + 1}. ${stop.title}, ${stop.time}`,
      );
      const inner = document.createElement("span");
      inner.className = `way-map-pin ${stop.id === selectedId ? "way-map-pin-selected" : ""} ${stop.status === "completed" ? "way-map-pin-completed" : ""}`;
      inner.textContent = stop.status === "completed" ? "✓" : String(index + 1);
      node.appendChild(inner);
      node.onclick = () => propsRef.current.onSelect(stop);
      pins.current.push(
        htmlOverlay(maps.current, map.current, stop.coordinates, node),
      );
    });
    hotspots.forEach((spot) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "way-google-pin";
      node.style.zIndex = spot.id === selectedId ? "1000" : "650";
      node.title = spot.name;
      node.setAttribute("aria-label", `Discover ${spot.name}`);
      const inner = document.createElement("span");
      inner.className = `way-map-discovery-pin ${spot.id === selectedId ? "way-map-discovery-selected" : ""}`;
      inner.textContent = "✦";
      inner.style.fontSize = "21px";
      node.appendChild(inner);
      node.onclick = () => propsRef.current.onSelectHotspot(spot);
      pins.current.push(
        htmlOverlay(maps.current, map.current, spot.coordinates, node),
      );
    });
  }, [status, stops, hotspots, selectedId]);

  useEffect(() => {
    if (status !== "ready" || !map.current) return;
    clearObjects(areas.current);
    areas.current = [];
    if (!heatVisible) return;
    const api = maps.current;
    heatAreas.forEach((area, index) => {
      const score = area.scores[category] || 0,
        color = heatColor(score, area.sourceKind === "unavailable"),
        selected = selectedAreaId === area.id;
      const point = { lng: area.center[0], lat: area.center[1] };
      const radius = Math.min(2200, Math.max(160, area.radiusMeters));
      const density = Math.round(area.densities[category] || 0);
      const glow = document.createElement('div'); glow.className = 'way-google-heat-glow'; glow.style.backgroundColor = color; glow.style.zIndex = '100'; glow.style.pointerEvents = 'none'; glow.style.animationDelay = `${index * -.7}s`;
      areas.current.push(htmlOverlay(api, map.current, area.center, glow, radius * 1.2));

      [1.13, 1, 0.65].forEach((scale, index) => {
        const circle = new api.Circle({
          map: map.current,
          center: point,
          radius: radius * scale,
          fillColor: color,
          fillOpacity: index === 1 ? 0.1 + (score / 100) * 0.12 : 0.075,
          strokeColor: color,
          strokeWeight: index === 1 ? (selected ? 2.5 : 1.25) : 0,
          strokeOpacity: selected ? 0.9 : 0.42,
          clickable: index === 1,
          zIndex: 1,
        });
        if (index === 1) {
          circle.addListener("click", () =>
            propsRef.current.onSelectArea?.(area),
          );
          const tooltip = document.createElement("div");
          tooltip.className = "way-heat-tooltip-content";
          const heading = document.createElement("strong");
          heading.textContent = area.name;
          const description = document.createElement("span");
          description.textContent =
            area.sourceKind === "unavailable"
              ? "No public data available"
              : `${density.toLocaleString()} mapped places/km² · ${area.sourceKind === "sample" ? "sample data" : area.sourceKind === "mixed" ? "mixed public and sample data" : "public records"}`;
          tooltip.append(heading, description);
          const info = new api.InfoWindow({
            content: tooltip,
            position: point,
            disableAutoPan: true,
          });
          circle.addListener("mouseover", () =>
            info.open({ map: map.current, shouldFocus: false }),
          );
          circle.addListener("mouseout", () => info.close());
          areas.current.push({ setMap: () => info.close() });
        }
        areas.current.push(circle);
      });
      const node = document.createElement("button");
      node.type = "button";
      node.className = `way-heat-label ${selected ? "way-heat-label-selected" : ""}`;
      node.style.setProperty("--area-color", color);
      node.style.zIndex = "400";
      node.title = `${area.name}: relative mapped-place density`;
      const heading = document.createElement("strong");
      heading.textContent = area.name;
      const metric = document.createElement("small");
      metric.textContent =
        area.sourceKind === "unavailable"
          ? "No data"
          : `${density.toLocaleString()} places/km²${area.sourceKind === "sample" ? " · Sample" : area.sourceKind === "mixed" ? " · Mixed" : ""}`;
      node.append(heading, metric);
      node.onclick = () => propsRef.current.onSelectArea?.(area);
      areas.current.push(htmlOverlay(api, map.current, area.center, node));
    });
  }, [status, heatAreas, heatVisible, category, selectedAreaId]);

  useEffect(() => {
    if (status !== "ready" || !map.current) return;
    const place =
      stops.find((stop) => stop.id === selectedId) ||
      hotspots.find((spot) => spot.id === selectedId);
    if (place) {
      map.current.panTo({
        lng: place.coordinates[0],
        lat: place.coordinates[1],
      });
      map.current.setZoom(Math.max(14, map.current.getZoom()));
    }
  }, [selectedId, status]);
  useEffect(() => {
    const area = heatAreas.find((item) => item.id === selectedAreaId);
    if (status === "ready" && heatVisible && area && map.current) {
      map.current.panTo({ lng: area.center[0], lat: area.center[1] });
      map.current.setZoom(14);
    }
  }, [selectedAreaId]);

  useEffect(() => {
    if (status !== "ready") return;
    const points = stops.map((stop) => stop.coordinates);
    setRoute({ coordinates: points, source: "preview" });
    if (points.length < 2 || points.length > 25) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), 13000);
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        coordinates: points,
        mode: "walking",
        mapProvider: "google",
        ...(mapboxToken?.startsWith("pk.") ? { mapboxToken } : {}),
      }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (
          !abort.signal.aborted &&
          Array.isArray(result.coordinates) &&
          result.coordinates.length >= 2 &&
          result.coordinates.every(
            (point: number[]) =>
              point.length === 2 && point.every(Number.isFinite),
          )
        )
          setRoute(result);
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timer));
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [status, coordinateKey, mapboxToken]);
  useEffect(() => {
    if (status !== "ready" || !map.current || !route) return;
    clearObjects(routeShapes.current);
    routeShapes.current = [];
    const path = route.coordinates.map((point) => ({
      lng: point[0],
      lat: point[1],
    }));
    const casing = new maps.current.Polyline({
      map: map.current,
      path,
      strokeColor: "#fff",
      strokeWeight: 8,
      strokeOpacity: 0.9,
      clickable: false,
      zIndex: 3,
    });
    const line = new maps.current.Polyline({
      map: map.current,
      path,
      strokeColor: "#276be1",
      strokeWeight: 4,
      strokeOpacity: ["mapbox", "google-routes"].includes(route.source) ? 0.95 : 0,
      icons:
        ["mapbox", "google-routes"].includes(route.source)
          ? []
          : [
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: 1,
                  strokeColor: "#276be1",
                  scale: 2,
                },
                offset: "0",
                repeat: "17px",
              },
            ],
      clickable: false,
      zIndex: 4,
    });
    routeShapes.current.push(casing, line);
  }, [route, status]);

  if (status === "failed") return <MapView {...props} />;
  return (
    <div className="way-map-shell way-google-shell">
      <style>{mapStyles + googleStyles}</style>
      <div
        ref={container}
        className="way-map-canvas"
        role="region"
        aria-label="Interactive Google map of your itinerary and mapped-place density areas"
      />
      {status === "loading" ? (
        <>
          <MapView {...props} />
          <span className="way-google-connecting" role="status">
            Connecting Google Maps…
          </span>
        </>
      ) : (
        <>
          <div className="way-map-tools">
            <button
              type="button"
              className={`way-map-tool ${layersOpen ? "way-map-tool-active" : ""}`}
              onClick={() => setLayersOpen(!layersOpen)}
              aria-label="Map layers"
              aria-expanded={layersOpen}
            >
              <Layers size={19} />
            </button>
            <button
              type="button"
              className="way-map-tool"
              onClick={fit}
              aria-label="Show all stops"
            >
              <LocateFixed size={20} />
            </button>
          </div>
          {layersOpen && (
            <div className="way-map-layers">
              <div className="way-map-layers-header">
                <strong>Map view</strong>
                <button
                  type="button"
                  onClick={() => setLayersOpen(false)}
                  aria-label="Close map layers"
                >
                  <X size={16} />
                </button>
              </div>
              {(["map", "quiet", "satellite"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`way-map-layer-row ${layer === item ? "way-map-layer-row-active" : ""}`}
                  aria-pressed={layer === item}
                  onClick={() => {
                    setLayer(item);
                    setLayersOpen(false);
                  }}
                >
                  <span
                    className={`way-map-layer-swatch way-map-layer-${item}`}
                  />
                  <span>
                    {item === "map"
                      ? "Street map"
                      : item === "quiet"
                        ? "Quiet map"
                        : "Satellite"}
                  </span>
                  {layer === item && <Check size={17} />}
                </button>
              ))}
              <p>Google Maps connected</p>
            </div>
          )}
          <div className="way-map-route-badge">
            <span className="way-map-route-icon">
              <Footprints size={18} />
            </span>
            <div>
              <strong>
                {route && ["mapbox", "google-routes"].includes(route.source) ? "Walking route" : "Preview route"}
              </strong>
              <span>
                {route && ["mapbox", "google-routes"].includes(route.source)
                  ? `${route.source === "google-routes" ? "Google Routes" : "Mapbox"} · ${Math.round(route.durationMinutes || 0)} min · ${((route.distanceMeters || 0) / 1000).toFixed(1)} km`
                  : `${stops.length} stops · straight-line connections`}
              </span>
            </div>
          </div>
          <div className="way-map-zoom">
            <button
              type="button"
              onClick={() => map.current?.setZoom(map.current.getZoom() + 1)}
              aria-label="Zoom in"
            >
              <Plus size={20} />
            </button>
            <button
              type="button"
              onClick={() => map.current?.setZoom(map.current.getZoom() - 1)}
              aria-label="Zoom out"
            >
              <Minus size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const googleStyles = `.way-google-shell .way-google-pin{border:0;background:transparent;padding:0;line-height:1;cursor:pointer;outline:none}.way-google-shell .way-google-pin:focus-visible{outline:3px solid #173c76;outline-offset:4px;border-radius:50%}.way-google-connecting{position:absolute;left:50%;bottom:105px;transform:translateX(-50%);z-index:620;padding:7px 12px;font-size:10px;background:#ffffffeb;border:1px solid #eef0f4;border-radius:100px;color:#697481;white-space:nowrap}.way-google-heat-glow{border-radius:50%;filter:blur(18px);opacity:.1;animation:way-google-glow-breathe 5.5s ease-in-out infinite;transition:background-color .7s ease}@keyframes way-google-glow-breathe{0%,100%{opacity:.1}50%{opacity:.21}}@media(prefers-reduced-motion:reduce){.way-google-heat-glow{animation:none;transition:none}}`;
