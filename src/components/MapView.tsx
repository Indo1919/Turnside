import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Check,
  Footprints,
  Layers,
  LocateFixed,
  Minus,
  Plus,
  X,
} from "lucide-react";
import type { ItineraryStop, TrendyHotspot } from "../types";
import type { HeatmapArea, HeatmapCategory } from "../heatmapTypes";

export interface MapViewProps {
  stops: ItineraryStop[];
  hotspots: TrendyHotspot[];
  selectedId: string | null;
  onSelect: (stop: ItineraryStop) => void;
  onSelectHotspot: (spot: TrendyHotspot) => void;
  center: [number, number];
  mapboxToken?: string;
  heatAreas?: HeatmapArea[];
  heatVisible?: boolean;
  heatFilter?: string;
  selectedAreaId?: string | null;
  onSelectArea?: (area: HeatmapArea) => void;
}

export const heatColor = (score: number, unavailable = false) =>
  unavailable
    ? "#aab4bd"
    : score >= 65
      ? "#ef9479"
      : score >= 35
        ? "#e8c16b"
        : "#a6c889";
export const heatCategory = (filter?: string): HeatmapCategory =>
  filter === "food" || filter === "culture" || filter === "outdoors"
    ? filter
    : "all";
const escapeLabel = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );

type RouteData = {
  coordinates: [number, number][];
  distanceMeters?: number;
  durationMinutes?: number;
  source: string;
};

const validCoordinate = (coordinate: [number, number]) =>
  Array.isArray(coordinate) &&
  coordinate.length === 2 &&
  coordinate.every(Number.isFinite) &&
  Math.abs(coordinate[0]) <= 180 &&
  Math.abs(coordinate[1]) <= 90;

function pinIcon(number: number, selected: boolean, completed: boolean) {
  return L.divIcon({
    className: "way-map-marker",
    html: `<span class="way-map-pin ${selected ? "way-map-pin-selected" : ""} ${completed ? "way-map-pin-completed" : ""}">${completed ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg>' : number}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    tooltipAnchor: [0, -23],
  });
}

const discoveryIcon = (selected: boolean) =>
  L.divIcon({
    className: "way-map-marker",
    html: `<span class="way-map-discovery-pin ${selected ? "way-map-discovery-selected" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    tooltipAnchor: [0, -20],
  });

export function MapView({
  stops,
  hotspots,
  selectedId,
  onSelect,
  onSelectHotspot,
  center,
  mapboxToken,
  heatAreas = [],
  heatVisible = false,
  heatFilter = "all",
  selectedAreaId = null,
  onSelectArea,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.LayerGroup | null>(null);
  const heatRef = useRef<L.LayerGroup | null>(null);
  const heatShapesRef = useRef(
    new Map<
      string,
      { outer: L.Circle; circle: L.Circle; inner: L.Circle; label: L.Marker }
    >(),
  );
  const tileRef = useRef<L.TileLayer | null>(null);
  const selectRef = useRef(onSelect);
  const hotspotSelectRef = useRef(onSelectHotspot);
  const areaSelectRef = useRef(onSelectArea);
  const areaDataRef = useRef(heatAreas);
  selectRef.current = onSelect;
  hotspotSelectRef.current = onSelectHotspot;
  areaSelectRef.current = onSelectArea;
  const [layersOpen, setLayersOpen] = useState(false);
  const [layer, setLayer] = useState<"map" | "quiet" | "satellite">("quiet");
  const [tileState, setTileState] = useState<"loading" | "ready" | "preview">(
    "loading",
  );
  const [route, setRoute] = useState<RouteData | null>(null);
  const [schematicZoom, setSchematicZoom] = useState(1);
  const [reload, setReload] = useState(0);
  const [smoothUnavailable, setSmoothUnavailable] = useState(false);
  const publicToken = mapboxToken?.trim().startsWith("pk.")
    ? mapboxToken.trim()
    : undefined;
  const validStops = useMemo(
    () => stops.filter((stop) => validCoordinate(stop.coordinates)),
    [stops],
  );
  const validHotspots = useMemo(
    () => hotspots.filter((spot) => validCoordinate(spot.coordinates)),
    [hotspots],
  );
  const validAreas = useMemo(
    () => heatAreas.filter((area) => validCoordinate(area.center)),
    [heatAreas],
  );
  areaDataRef.current = validAreas;
  const category = heatCategory(heatFilter);
  const coordinatesKey = validStops
    .map((stop) => stop.coordinates.join(","))
    .join(";");
  const centerKey = center.join(",");
  const preview = tileState === "preview";
  const showSchematic = tileState !== "ready";
  // Stadia explicitly allows keyless local development; public deployments
  // retain OSM unless the user has configured an authenticated provider.
  const useLocalSmooth =
    !publicToken &&
    layer === "quiet" &&
    !smoothUnavailable &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  const fitDay = (animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const coords = validStops.map((stop) =>
      L.latLng(stop.coordinates[1], stop.coordinates[0]),
    );
    if (heatVisible)
      validAreas.forEach((area) => {
        coords.push(
          L.latLng(area.bounds[1], area.bounds[0]),
          L.latLng(area.bounds[3], area.bounds[2]),
        );
      });
    if (coords.length > 1)
      map.fitBounds(L.latLngBounds(coords), {
        paddingTopLeft: heatVisible ? [55, 65] : [70, 120],
        paddingBottomRight: heatVisible ? [55, 55] : [70, 115],
        maxZoom: 15,
        animate,
      });
    else
      map.setView(coords[0] || L.latLng(center[1], center[0]), 14, {
        animate,
      });
    setSchematicZoom(1);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      scrollWheelZoom: true,
      keyboard: true,
    }).setView([center[1], center[0]], 13);
    mapRef.current = map;
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    routeRef.current = L.layerGroup().addTo(map);
    map.createPane("density");
    map.getPane("density")!.style.zIndex = "350";
    heatRef.current = L.layerGroup().addTo(map);
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      routeRef.current = null;
      heatRef.current = null;
      heatShapesRef.current.clear();
      tileRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setTileState("loading");
    let cancelled = false;
    let loaded = 0;
    let failed = 0;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const mapboxStyle =
      layer === "satellite"
        ? "satellite-streets-v12"
        : layer === "quiet"
          ? "light-v11"
          : "streets-v12";
    const tileUrl = publicToken
      ? `https://api.mapbox.com/styles/v1/mapbox/${mapboxStyle}/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(publicToken)}`
      : useLocalSmooth
        ? "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
        : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    const tiles = L.tileLayer(tileUrl, {
      maxZoom: 19,
      crossOrigin: true,
      attribution: publicToken
        ? '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
        : useLocalSmooth
          ? '© <a href="https://stadiamaps.com/attribution/" target="_blank" rel="noopener">Stadia Maps</a> © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
          : '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    });
    tileRef.current = tiles;
    const onLoaded = () => {
      loaded++;
      if (!cancelled && loaded >= 2) setTileState("ready");
    };
    const onError = () => {
      failed++;
      if (!cancelled && useLocalSmooth && failed >= 3 && failed > loaded) {
        setSmoothUnavailable(true);
        return;
      }
      if (!cancelled && failed >= 4 && loaded < 2) setTileState("preview");
    };
    tiles.on("tileload", onLoaded);
    tiles.on("tileerror", onError);
    tiles.addTo(map);
    const timeout = window.setTimeout(() => {
      if (!cancelled && loaded < 2) {
        if (useLocalSmooth) setSmoothUnavailable(true);
        else setTileState("preview");
      }
    }, 7500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      tiles.off("tileload", onLoaded);
      tiles.off("tileerror", onError);
      if (map.hasLayer(tiles)) map.removeLayer(tiles);
    };
  }, [layer, publicToken, reload, useLocalSmooth]);

  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    validStops.forEach((stop, index) => {
      const marker = L.marker([stop.coordinates[1], stop.coordinates[0]], {
        icon: pinIcon(
          index + 1,
          stop.id === selectedId,
          stop.status === "completed",
        ),
        title: `${index + 1}. ${stop.title}`,
        alt: `${stop.title}, ${stop.time}`,
        keyboard: true,
        zIndexOffset: stop.id === selectedId ? 1000 : 500,
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = stop.title;
      marker.bindTooltip(tooltip, {
        direction: "top",
        className: "way-map-tooltip",
      });
      marker.on("click", () => selectRef.current(stop));
      marker.addTo(group);
    });
    validHotspots.forEach((spot) => {
      const marker = L.marker([spot.coordinates[1], spot.coordinates[0]], {
        icon: discoveryIcon(spot.id === selectedId),
        title: `Discover ${spot.name}`,
        alt: spot.name,
        keyboard: true,
        zIndexOffset: spot.id === selectedId ? 1000 : 250,
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = spot.name;
      marker.bindTooltip(tooltip, {
        direction: "top",
        className: "way-map-tooltip",
      });
      marker.on("click", () => hotspotSelectRef.current(spot));
      marker.addTo(group);
    });
  }, [validStops, validHotspots, selectedId]);

  useEffect(() => {
    const group = heatRef.current;
    if (!group) return;
    const shapes = heatShapesRef.current;
    if (!heatVisible) {
      group.clearLayers();
      shapes.clear();
      return;
    }
    const active = new Set(validAreas.map((area) => area.id));
    shapes.forEach((shape, id) => {
      if (!active.has(id)) {
        [shape.outer, shape.circle, shape.inner, shape.label].forEach((item) =>
          group.removeLayer(item),
        );
        shapes.delete(id);
      }
    });
    validAreas.forEach((area, index) => {
      const selected = area.id === selectedAreaId;
      const score = Number(area.scores[category]) || 0;
      const color = heatColor(score, area.sourceKind === "unavailable");
      const point = L.latLng(area.center[1], area.center[0]);
      const radius = Math.min(2200, Math.max(160, area.radiusMeters));
      const density = Math.round(area.densities[category] || 0);
      const source =
        area.sourceKind === "sample"
          ? "sample data"
          : area.sourceKind === "mixed"
            ? "mixed public and sample data"
            : "public records";
      const tooltip = document.createElement("div");
      tooltip.className = "way-heat-tooltip-content";
      const title = document.createElement("strong");
      title.textContent = area.name;
      const description = document.createElement("span");
      description.textContent =
        area.sourceKind === "unavailable"
          ? "No public data available"
          : `${density.toLocaleString()} mapped places/km² · ${source}`;
      tooltip.append(title, description);
      const text =
        area.sourceKind === "unavailable"
          ? "No data"
          : `${density.toLocaleString()} places/km²${area.sourceKind === "sample" ? " · Sample" : area.sourceKind === "mixed" ? " · Mixed" : ""}`;
      const existing = shapes.get(area.id);
      if (existing) {
        existing.outer
          .setLatLng(point)
          .setRadius(radius * 1.2)
          .setStyle({ color, fillColor: color });
        existing.circle
          .setLatLng(point)
          .setRadius(radius)
          .setStyle({
            color,
            fillColor: color,
            weight: selected ? 2.5 : 1,
            opacity: selected ? 0.8 : 0.32,
            fillOpacity: 0.11 + (Math.min(100, score) / 100) * 0.13,
          });
        existing.circle
          .getElement()
          ?.classList.toggle("way-map-heat-selected", selected);
        existing.circle.setTooltipContent(tooltip);
        existing.inner
          .setLatLng(point)
          .setRadius(radius * 0.62)
          .setStyle({ color, fillColor: color });
        existing.label.setLatLng(point);
        const element = existing.label.getElement();
        const label = element?.querySelector<HTMLElement>(".way-heat-label");
        if (label) {
          label.style.setProperty("--area-color", color);
          label.classList.toggle("way-heat-label-selected", selected);
          label.querySelector("strong")!.textContent = area.name;
          label.querySelector("small")!.textContent = text;
        }
        element?.setAttribute("title", `${area.name}, ${text}`);
        return;
      }
      const outer = L.circle(point, {
        radius: radius * 1.2,
        pane: "density",
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.12,
        className: "way-map-heat-glow",
        interactive: false,
      }).addTo(group);
      const circle = L.circle(point, {
        radius,
        pane: "density",
        color,
        weight: selected ? 2.5 : 1,
        opacity: selected ? 0.8 : 0.32,
        fillColor: color,
        fillOpacity: 0.11 + (Math.min(100, score) / 100) * 0.13,
        className: `way-map-heat ${selected ? "way-map-heat-selected" : ""}`,
        interactive: true,
      }).addTo(group);
      circle.bindTooltip(tooltip, {
        direction: "top",
        className: "way-map-tooltip",
        sticky: true,
      });
      circle.on("click", () => {
        const current = areaDataRef.current.find((item) => item.id === area.id);
        if (current) areaSelectRef.current?.(current);
      });
      const inner = L.circle(point, {
        radius: radius * 0.62,
        pane: "density",
        color,
        weight: 0,
        fillColor: color,
        fillOpacity: 0.065,
        className: "way-map-heat-core",
        interactive: false,
      }).addTo(group);
      const label = L.marker(point, {
        icon: L.divIcon({
          className: "way-heat-label-marker",
          html: `<span class="way-heat-label ${selected ? "way-heat-label-selected" : ""}" style="--area-color:${color}"><strong>${escapeLabel(area.name)}</strong><small>${escapeLabel(text)}</small></span>`,
          iconSize: [174, 46],
          iconAnchor: [87, 23],
        }),
        title: `${area.name}, ${text}`,
        keyboard: true,
        zIndexOffset: -400,
      }).addTo(group);
      label.on("click", () => {
        const current = areaDataRef.current.find((item) => item.id === area.id);
        if (current) areaSelectRef.current?.(current);
      });
      const glow = outer.getElement() as SVGElement | undefined;
      if (glow) glow.style.animationDelay = `${index * -0.7}s`;
      shapes.set(area.id, { outer, circle, inner, label });
    });
  }, [validAreas, heatVisible, category, selectedAreaId]);

  useEffect(() => {
    // A cached response can arrive during the initial zoom. Fit immediately so
    // Leaflet does not discard the area bounds while that zoom is animating.
    fitDay(false);
  }, [coordinatesKey, centerKey, heatVisible, validAreas.length]);

  useEffect(() => {
    const area = validAreas.find((item) => item.id === selectedAreaId);
    if (heatVisible && area)
      mapRef.current?.flyTo([area.center[1], area.center[0]], 14, {
        duration: 0.65,
      });
  }, [selectedAreaId]);

  useEffect(() => {
    const stop = validStops.find((item) => item.id === selectedId);
    const spot = validHotspots.find((item) => item.id === selectedId);
    const point = stop?.coordinates || spot?.coordinates;
    if (point)
      mapRef.current?.flyTo(
        [point[1], point[0]],
        Math.max(mapRef.current.getZoom(), 14),
        { duration: 0.65 },
      );
  }, [selectedId]);

  useEffect(() => {
    const points = validStops.map((stop) => stop.coordinates);
    const fallback: RouteData = { coordinates: points, source: "preview" };
    setRoute(fallback);
    if (points.length < 2 || points.length > 25) return;
    const abort = new AbortController();
    const timer = window.setTimeout(() => abort.abort(), 13000);
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: points,
        mode: "walking",
        mapProvider: "openstreetmap",
        ...(publicToken ? { mapboxToken: publicToken } : {}),
      }),
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Route unavailable");
        const result: RouteData = await response.json();
        if (
          !Array.isArray(result.coordinates) ||
          !result.coordinates.every(validCoordinate) ||
          result.coordinates.length < 2
        )
          throw new Error("Invalid route");
        // Google Routes geometry is licensed for display on a Google map.
        if (!abort.signal.aborted && result.source !== "google-routes")
          setRoute(result);
      })
      .catch(() => {
        /* The preview remains interactive when routing is unavailable. */
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [coordinatesKey, publicToken]);

  useEffect(() => {
    const group = routeRef.current;
    if (!group) return;
    group.clearLayers();
    if (!route || route.coordinates.length < 2) return;
    const points = route.coordinates.map((point) =>
      L.latLng(point[1], point[0]),
    );
    L.polyline(points, {
      color: "#fff",
      weight: 9,
      opacity: 0.94,
      interactive: false,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    L.polyline(points, {
      color: "#007aff",
      weight: 4,
      opacity: 0.95,
      dashArray: route.source === "mapbox" ? undefined : "8 10",
      interactive: false,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
  }, [route]);

  const projection = useMemo(() => {
    const points = [
      ...validStops.map((stop) => stop.coordinates),
      ...validHotspots.map((spot) => spot.coordinates),
      ...(heatVisible ? validAreas.map((area) => area.center) : []),
    ];
    if (!points.length) points.push(center);
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    const minLng = Math.min(...lngs),
      maxLng = Math.max(...lngs),
      minLat = Math.min(...lats),
      maxLat = Math.max(...lats);
    const lngRange = Math.max(maxLng - minLng, 0.015),
      latRange = Math.max(maxLat - minLat, 0.015);
    const midLng = (maxLng + minLng) / 2,
      midLat = (maxLat + minLat) / 2;
    return (point: [number, number]) => [
      500 + ((point[0] - midLng) / lngRange) * 640,
      450 - ((point[1] - midLat) / latRange) * 610,
    ];
  }, [validStops, validHotspots, centerKey, validAreas, heatVisible]);
  const schematicPath = validStops
    .map((stop) => projection(stop.coordinates).join(","))
    .join(" ");
  const routeLabel =
    route?.source === "mapbox" ? "Walking route" : "Preview route";
  const routeDetail =
    route?.source === "mapbox" && route.durationMinutes && route.distanceMeters
      ? `Mapbox · ${Math.round(route.durationMinutes)} min · ${(route.distanceMeters / 1000).toFixed(1)} km`
      : `${validStops.length} stops · ${route?.source === "mapbox" ? "Mapbox Directions" : "straight-line connections"}`;
  const zoom = (direction: number) => {
    if (showSchematic)
      setSchematicZoom((value) =>
        Math.min(2.2, Math.max(0.8, value + direction * 0.2)),
      );
    else if (direction > 0) mapRef.current?.zoomIn();
    else mapRef.current?.zoomOut();
  };

  return (
    <div
      className={`way-map-shell ${layer === "quiet" && !publicToken && !useLocalSmooth ? "way-map-quiet" : ""}`}
    >
      <style>{mapStyles}</style>
      <div
        ref={containerRef}
        className="way-map-canvas"
        role="region"
        aria-label="Interactive map of your itinerary. Use arrow keys to pan and plus or minus to zoom."
      />
      {showSchematic && (
        <div className="way-map-schematic">
          <svg
            viewBox="0 0 1000 900"
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label="Illustrative map preview with your place pins. Streets are schematic, not suitable for navigation."
            style={{ transform: `scale(${schematicZoom})` }}
          >
            <defs>
              <pattern
                id="way-street-grid"
                width="110"
                height="105"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-14)"
              >
                <rect width="110" height="105" fill="#edf0ee" />
                <rect
                  x="12"
                  y="13"
                  width="30"
                  height="36"
                  rx="4"
                  fill="#e4e7e4"
                />
                <rect
                  x="48"
                  y="13"
                  width="47"
                  height="36"
                  rx="4"
                  fill="#e5e8e5"
                />
                <rect
                  x="12"
                  y="56"
                  width="55"
                  height="34"
                  rx="4"
                  fill="#e4e8e5"
                />
                <rect
                  x="73"
                  y="56"
                  width="22"
                  height="34"
                  rx="4"
                  fill="#e6e9e6"
                />
                <path d="M0 0H110M0 0V105" stroke="#fff" strokeWidth="10" />
              </pattern>
              <filter
                id="way-pin-shadow"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <feDropShadow
                  dx="0"
                  dy="3"
                  stdDeviation="5"
                  floodOpacity=".17"
                />
              </filter>
            </defs>
            <rect width="1000" height="900" fill="url(#way-street-grid)" />
            <path
              d="M-50 690C120 560 125 755 345 735S525 905 640 1030"
              fill="none"
              stroke="#cee4ec"
              strokeWidth="108"
            />
            <path
              d="M740 -30C605 190 870 265 770 475S650 540 680 710"
              fill="none"
              stroke="#fff"
              strokeWidth="22"
            />
            <path
              d="M-30 360C170 280 430 430 580 355S870 170 1060 210"
              fill="none"
              stroke="#fff"
              strokeWidth="19"
            />
            <path
              d="M158 108L302 73 360 227 215 267Z"
              fill="#dce8d9"
              stroke="#fff"
              strokeWidth="10"
            />
            <path
              d="M725 505L905 460 956 595 794 657Z"
              fill="#dce8d9"
              stroke="#fff"
              strokeWidth="10"
            />
            {heatVisible &&
              validAreas.map((area) => {
                const [x, y] = projection(area.center);
                const radius = Math.min(
                  115,
                  Math.max(
                    50,
                    Math.abs(
                      projection([
                        area.center[0],
                        area.center[1] + area.radiusMeters / 111000,
                      ])[1] - y,
                    ),
                  ),
                );
                const color = heatColor(
                  area.scores[category],
                  area.sourceKind === "unavailable",
                );
                const density = Math.round(area.densities[category] || 0);
                return (
                  <g
                    key={area.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${area.name}, ${density} mapped places per square kilometer${area.sourceKind === "sample" ? ", sample" : ""}`}
                    className="way-map-svg-pin"
                    transform={`translate(${x},${y})`}
                    onClick={() => onSelectArea?.(area)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectArea?.(area);
                      }
                    }}
                  >
                    <circle r={radius * 1.13} fill={color} opacity=".1" />
                    <circle
                      r={radius}
                      fill={color}
                      fillOpacity=".24"
                      stroke={color}
                      strokeWidth={area.id === selectedAreaId ? 3 : 1.5}
                      strokeOpacity=".6"
                      className={
                        area.id === selectedAreaId
                          ? "way-heat-preview-selected"
                          : ""
                      }
                    />
                    <circle r={radius * 0.65} fill={color} opacity=".1" />
                    <rect
                      x="-78"
                      y="-24"
                      width="156"
                      height="45"
                      rx="12"
                      fill="#fff"
                      fillOpacity=".91"
                      stroke={color}
                      strokeOpacity=".5"
                    />
                    <text
                      y="-7"
                      fill="#37464d"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="650"
                    >
                      {area.name}
                    </text>
                    <text y="9" fill="#68787c" textAnchor="middle" fontSize="9">
                      {area.sourceKind === "unavailable"
                        ? "No data"
                        : `${density} places/km²${area.sourceKind === "sample" ? " · Sample" : ""}`}
                    </text>
                  </g>
                );
              })}
            <polyline
              points={schematicPath}
              fill="none"
              stroke="#fff"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={schematicPath}
              fill="none"
              stroke="#007aff"
              strokeWidth="4"
              strokeDasharray="8 10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {validHotspots.map((spot) => {
              const [x, y] = projection(spot.coordinates);
              return (
                <g
                  key={spot.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Discover ${spot.name}`}
                  className="way-map-svg-pin"
                  transform={`translate(${x},${y})`}
                  onClick={() => onSelectHotspot(spot)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectHotspot(spot);
                    }
                  }}
                >
                  {spot.id === selectedId && (
                    <circle r="28" fill="#e77f6c" opacity=".18" />
                  )}
                  <circle
                    r="17"
                    fill="#e77f6c"
                    stroke="#fff"
                    strokeWidth="4"
                    filter="url(#way-pin-shadow)"
                  />
                  <path
                    d="m0-8 2.2 5.8L8 0 2.2 2.2 0 8l-2.2-5.8L-8 0l5.8-2.2Z"
                    fill="white"
                  />
                </g>
              );
            })}
            {validStops.map((stop, index) => {
              const [x, y] = projection(stop.coordinates);
              return (
                <g
                  key={stop.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${index + 1}. ${stop.title}, ${stop.time}`}
                  className="way-map-svg-pin"
                  transform={`translate(${x},${y})`}
                  onClick={() => onSelect(stop)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(stop);
                    }
                  }}
                >
                  {stop.id === selectedId && (
                    <circle r="32" fill="#007aff" opacity=".16" />
                  )}
                  <circle
                    r={stop.id === selectedId ? "23" : "20"}
                    fill={stop.status === "completed" ? "#6c7f8e" : "#007aff"}
                    stroke="#fff"
                    strokeWidth="4"
                    filter="url(#way-pin-shadow)"
                  />
                  <text
                    y="1"
                    fill="white"
                    fontSize="16"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="way-map-tools">
        <button
          type="button"
          className={`way-map-tool ${layersOpen ? "way-map-tool-active" : ""}`}
          onClick={() => setLayersOpen(!layersOpen)}
          aria-expanded={layersOpen}
          aria-controls="way-map-layers"
          aria-label="Map layers"
          title="Map layers"
        >
          <Layers size={19} />
        </button>
        <button
          type="button"
          className="way-map-tool"
          onClick={() => fitDay()}
          aria-label="Show all stops"
          title="Show all stops"
        >
          <LocateFixed size={20} />
        </button>
      </div>
      {layersOpen && (
        <div className="way-map-layers" id="way-map-layers">
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
          {(
            ["map", "quiet", ...(publicToken ? ["satellite"] : [])] as Array<
              "map" | "quiet" | "satellite"
            >
          ).map((item) => (
            <button
              type="button"
              key={item}
              className={`way-map-layer-row ${layer === item ? "way-map-layer-row-active" : ""}`}
              onClick={() => {
                setLayer(item);
                setLayersOpen(false);
              }}
              aria-pressed={layer === item}
            >
              <span className={`way-map-layer-swatch way-map-layer-${item}`} />
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
          <p>
            {publicToken
              ? "Mapbox maps connected"
              : useLocalSmooth
                ? "Stadia Maps · local preview"
                : "OpenStreetMap"}
          </p>
        </div>
      )}
      <div className="way-map-route-badge" aria-live="polite">
        <span className="way-map-route-icon">
          <Footprints size={18} />
        </span>
        <div>
          <strong>
            {validStops.length < 2
              ? showSchematic
                ? "Map preview"
                : "OpenStreetMap"
              : showSchematic
                ? "Map preview"
                : routeLabel}
          </strong>
          <span>
            {validStops.length < 2
              ? "Neighborhood data · tap an area"
              : showSchematic
                ? "Illustrative streets · place pins"
                : routeDetail}
          </span>
        </div>
        {preview && (
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Retry map
          </button>
        )}
      </div>
      <div className="way-map-zoom">
        <button type="button" onClick={() => zoom(1)} aria-label="Zoom in">
          <Plus size={20} />
        </button>
        <button type="button" onClick={() => zoom(-1)} aria-label="Zoom out">
          <Minus size={20} />
        </button>
      </div>
      {tileState === "loading" && (
        <div className="way-map-loading" role="status">
          <span />
          Loading map
        </div>
      )}
    </div>
  );
}

export const mapStyles = `
.way-map-shell{position:relative;width:100%;height:100%;min-height:380px;overflow:hidden;background:#edf0ed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#252c34}
.way-map-canvas,.way-map-schematic{position:absolute;inset:0;width:100%;height:100%}.way-map-canvas{z-index:0;background:#edf0ed}.way-map-quiet .leaflet-tile-pane{filter:saturate(.4) brightness(1.02)}.way-map-schematic{z-index:1;overflow:hidden;background:#edf0ed}.way-map-schematic svg{width:100%;height:100%;transition:transform .25s}.way-map-svg-pin{cursor:pointer;outline:none}.way-map-svg-pin:focus circle{stroke:#162f68;stroke-width:5}
.way-map-shell .leaflet-container{font:inherit}.way-map-shell .leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,.82);padding:2px 7px;color:#666;border-radius:0 5px 0 0}.way-map-shell .leaflet-control-attribution a{color:#536476}.way-map-shell .leaflet-bottom.leaflet-left{z-index:4}.way-map-shell .leaflet-marker-icon:focus-visible{outline:3px solid #112c61;outline-offset:5px;border-radius:50%}
.way-map-tool,.way-map-route-badge,.way-map-zoom,.way-map-layers{background:rgba(255,255,255,.95);border:1px solid rgba(255,255,255,.86);box-shadow:0 4px 20px #253c5012,0 1px 4px #253c5010;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}

.way-map-tools{position:absolute;top:22px;right:22px;z-index:610;display:flex;flex-direction:column;gap:9px}.way-map-tool{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#3d4855;transition:background .15s,transform .15s}.way-map-tool:hover,.way-map-tool-active{background:#edf4ff;color:#007aff}.way-map-tool:active{transform:scale(.96)}.way-map-shell button:focus-visible{outline:3px solid #007aff;outline-offset:3px}
.way-map-layers{position:absolute;top:22px;right:74px;z-index:650;width:224px;padding:13px;border-radius:18px;animation:way-map-enter .16s ease-out}.way-map-layers-header{display:flex;justify-content:space-between;align-items:center;padding:0 3px 8px;font-size:13px}.way-map-layers-header button{border:0;background:transparent;padding:4px;color:#7b8793;cursor:pointer}.way-map-layer-row{width:100%;display:flex;gap:10px;align-items:center;text-align:left;padding:8px;border:0;background:transparent;border-radius:10px;font-size:12px;color:#3d4855;cursor:pointer}.way-map-layer-row-active{background:#edf4ff;color:#007aff}.way-map-layer-row svg{margin-left:auto}.way-map-layer-swatch{width:37px;height:32px;border-radius:7px;background-color:#e9ece7;background-image:linear-gradient(75deg,transparent 43%,#fff 43%,#fff 53%,transparent 53%),linear-gradient(-20deg,transparent 30%,#fff 30%,#fff 40%,transparent 40%);border:1px solid #dfe5df}.way-map-layer-quiet{background-color:#f1f2f1}.way-map-layer-satellite{background-color:#617e65;background-image:linear-gradient(75deg,transparent 43%,#bfd5b1 43%,#bfd5b1 48%,transparent 48%),linear-gradient(-20deg,transparent 30%,#a6c197 30%,#a6c197 34%,transparent 34%)}.way-map-layers p{font-size:10px;text-align:center;color:#697481;margin:10px 0 0}

.way-map-route-badge{position:absolute;bottom:28px;left:20px;right:auto;z-index:4;border-radius:16px;display:flex;align-items:center;gap:11px;padding:8px 11px;max-width:calc(100% - 102px)}.way-map-route-icon{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:11px;background:#edf4ff;color:#007aff}.way-map-route-badge strong{font-size:12px;font-weight:650;display:block}.way-map-route-badge div>span{font-size:10px;color:#65717e;display:block;margin-top:3px}.way-map-route-badge button{border:0;background:#edf4ff;border-radius:8px;color:#007aff;font-size:10px;font-weight:600;padding:8px;cursor:pointer;margin-left:8px;white-space:nowrap}
.way-map-zoom{position:absolute;top:123px;right:22px;z-index:610;border-radius:13px;overflow:hidden;display:flex;height:40px}.way-map-zoom button{display:flex;align-items:center;justify-content:center;width:42px;height:39px;background:transparent;color:#3d4855;border:0;cursor:pointer}.way-map-zoom button+button{border-left:1px solid #eceff2}.way-map-zoom button:hover{background:#edf4ff;color:#007aff}
.way-map-loading{position:absolute;bottom:112px;left:50%;transform:translateX(-50%);z-index:4;display:flex;gap:7px;align-items:center;background:rgba(255,255,255,.9);padding:8px 12px;border-radius:100px;font-size:10px;color:#697481;box-shadow:0 2px 12px #253c5012}.way-map-loading>span{width:10px;height:10px;border:1.5px solid #d8e2ee;border-top-color:#007aff;border-radius:50%;animation:way-map-spin .8s linear infinite}
.way-map-marker{background:none;border:none}.way-map-pin{box-sizing:border-box;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;border-radius:50%;background:#007aff;color:white;font-size:13px;font-weight:700;box-shadow:0 3px 10px #1f44603b;transition:transform .2s,box-shadow .2s}.way-map-pin-selected{transform:scale(1.18);box-shadow:0 0 0 7px #007aff25,0 4px 14px #1f446044}.way-map-pin-completed{background:#778998}.way-map-pin svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.7;stroke-linecap:round;stroke-linejoin:round}.way-map-discovery-pin{width:32px;height:32px;display:grid;place-items:center;box-sizing:border-box;border-radius:50%;background:#e77f6c;color:white;border:3px solid white;box-shadow:0 3px 8px #54372525}.way-map-discovery-selected{box-shadow:0 0 0 7px #e77f6c25,0 4px 14px #54372532}.way-map-discovery-pin svg{width:17px;height:17px;fill:currentColor}.way-map-shell .way-map-tooltip{font-family:inherit;font-size:11px;font-weight:600;color:#334255;background:#fff;border:0;border-radius:9px;padding:8px 11px;box-shadow:0 3px 12px #253c5022}.way-map-shell .way-map-tooltip:before{border-top-color:#fff}
.way-heat-label-marker{background:none;border:none}.way-heat-label{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;max-width:174px;width:max-content;min-width:104px;margin:auto;padding:7px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--area-color) 60%,white);background:rgba(255,255,255,.91);box-shadow:0 3px 15px #34452c12;color:#41504f;backdrop-filter:blur(12px);cursor:pointer;text-align:center}.way-heat-label strong{font-size:11px;font-weight:650;white-space:nowrap}.way-heat-label small{font-size:8px;color:#6c7a7b;white-space:nowrap}.way-heat-label-selected{box-shadow:0 0 0 4px color-mix(in srgb,var(--area-color) 20%,transparent),0 3px 15px #34452c18}.way-map-heat,.way-map-heat-core,.way-map-heat-glow,.way-heat-preview-selected{transition:fill .75s ease,stroke .75s ease,fill-opacity .75s ease,stroke-opacity .75s ease}.way-map-heat-glow{filter:blur(13px);animation:way-heat-glow 5.5s ease-in-out infinite}.way-map-heat-selected,.way-heat-preview-selected{animation:way-heat-breathe 3.6s ease-in-out infinite}.way-heat-label{transition:border-color .7s ease,box-shadow .7s ease}@keyframes way-heat-glow{0%,100%{fill-opacity:.1}50%{fill-opacity:.2}}.way-heat-tooltip-content{display:flex;flex-direction:column;gap:5px}.way-heat-tooltip-content span{font-size:10px;color:#6c7a7b;font-weight:400}@keyframes way-heat-breathe{0%,100%{stroke-opacity:.45}50%{stroke-opacity:1}}
@keyframes way-map-spin{to{transform:rotate(360deg)}}@keyframes way-map-enter{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:700px){.way-map-shell{min-height:340px}.way-map-tools{top:15px;right:15px;gap:7px}.way-map-tool{width:37px;height:37px;border-radius:11px}.way-map-layers{top:15px;right:60px;width:210px}.way-map-route-badge{left:17px;top:109px;bottom:auto;padding:6px 9px;gap:5px;max-width:calc(100% - 112px);border-radius:8px}.way-map-route-icon{display:none}.way-map-route-badge strong{font-size:9px}.way-map-route-badge div>span{display:none}.way-map-route-badge button{font-size:8px;margin-left:1px;padding:3px 5px}.way-map-zoom{top:105px;bottom:auto;right:15px;height:36px}.way-map-zoom button{width:37px;height:35px}}
@media(prefers-reduced-motion:reduce){.way-map-schematic svg,.way-map-pin,.way-map-tool{transition:none}.way-map-layers,.way-map-loading>span,.way-map-heat-selected,.way-map-heat-glow,.way-heat-preview-selected{animation:none}.way-map-heat,.way-map-heat-core,.way-map-heat-glow,.way-heat-label{transition:none}}
`;
