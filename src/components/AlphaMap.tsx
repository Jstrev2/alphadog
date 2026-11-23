"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isInArea, type Area } from "@/lib/areas";
import { FEATURE_TYPES, type AreaData, type FeatureCode } from "@/lib/feature-types";
import { getDogHeat, type BoardTile } from "@/lib/game";
import { tileOf, tilePolygon, tilesIn } from "@/lib/grid";
import { fetchReportBuckets, REPORT_KINDS, timeAgo, type ReportKind } from "@/lib/reports";
import { getSupabase } from "@/lib/supabase";

export type View = "turf" | "seek" | "avoid";
export type MapStatus = "loading" | "ready" | "error";

/** What the rest of the app can ask the map to do. */
export type MapApi = {
  /** [lon, lat] at the middle of the screen, where the placement pin sits. */
  getCenter: () => [number, number];
  /** Flies to the walker's location. Resolves false if location isn't available. */
  locate: () => Promise<boolean>;
  flyTo: (lon: number, lat: number, zoom?: number) => void;
  /** Reloads walker reports and heat for the current view. */
  refreshReports: () => void;
};

type Props = {
  area: Area;
  view: View;
  board: BoardTile[];
  /** Blocks drawn as the hidden zone (yours, or a preview while picking one) */
  zone: string[] | null;
  selectedTile: string | null;
  /** Bump to fly back to the pilot area. */
  recenterKey: number;
  onStatus: (status: MapStatus) => void;
  onData: (data: AreaData) => void;
  onOutsideArea: (outside: boolean) => void;
  onTileClick: (tile: string | null) => void;
  onApi: (api: MapApi | null) => void;
};

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>;
const point = (lon: number, lat: number, properties: Record<string, unknown>): Feature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});
const collection = (features: Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const tileFeature = (key: string, properties: Record<string, unknown> = {}): Feature => ({
  type: "Feature",
  geometry: tilePolygon(key),
  properties: { key, ...properties },
});

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

const HEAT_COLORS: Record<View, ExpressionSpecification> = {
  turf: [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(16,185,129,0)",
    0.2, "rgba(167,243,208,0.2)",
    0.6, "rgba(52,211,153,0.35)",
    1, "rgba(5,150,105,0.5)",
  ],
  seek: [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(16,185,129,0)",
    0.1, "rgba(167,243,208,0.25)",
    0.3, "rgba(52,211,153,0.55)",
    0.55, "rgba(16,185,129,0.72)",
    0.8, "rgba(4,120,87,0.85)",
    1, "rgba(6,78,59,0.92)",
  ],
  avoid: [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(253,224,71,0)",
    0.1, "rgba(254,215,170,0.25)",
    0.3, "rgba(251,146,60,0.55)",
    0.55, "rgba(239,68,68,0.72)",
    0.8, "rgba(185,28,28,0.85)",
    1, "rgba(127,29,29,0.92)",
  ],
};

/** Street heat: color by score. Most city blocks score 0.6 to 1, so the ramp spends its range there. */
const STREET_COLORS: Record<View, ExpressionSpecification> = {
  turf: ["interpolate", ["linear"], ["get", "s"], 0.2, "#ccfbf1", 0.6, "#5eead4", 0.85, "#14b8a6", 1, "#0f766e"],
  seek: ["interpolate", ["linear"], ["get", "s"], 0.3, "#ecfdf5", 0.6, "#a7f3d0", 0.75, "#34d399", 0.88, "#059669", 1, "#064e3b"],
  avoid: ["interpolate", ["linear"], ["get", "s"], 0.3, "#fffbeb", 0.6, "#fde68a", 0.75, "#fb923c", 0.88, "#dc2626", 1, "#7f1d1d"],
};
const STREET_OPACITY: Record<View, [core: number, glow: number]> = {
  turf: [0.5, 0.12],
  seek: [0.95, 0.4],
  avoid: [0.95, 0.4],
};

export const TURF_COLORS = { mine: "#10b981", taken: "#f97316", local: "#71717a" } as const;

const SPOT_COLOR = [
  "match", ["get", "t"],
  ...Object.entries(FEATURE_TYPES).flatMap(([code, type]) => [Number(code), type.color]),
  "#64748b",
] as unknown as ExpressionSpecification;

const PIN_KINDS = (Object.keys(REPORT_KINDS) as ReportKind[]).filter((k) => REPORT_KINDS[k].pin);
const REPORT_PIN_COLOR = [
  "match", ["get", "kind"],
  ...PIN_KINDS.flatMap((k) => [k, REPORT_KINDS[k].color]),
  "#64748b",
] as unknown as ExpressionSpecification;

const TURF_LAYERS = ["turf-fill", "turf-grid", "turf-mine"];

async function loadAreaData(area: Area): Promise<AreaData | null> {
  try {
    const res = await fetch(`/data/areas/${area.id}.json`);
    if (!res.ok) return null;
    return (await res.json()) as AreaData;
  } catch {
    return null;
  }
}

export default function AlphaMap(props: Props) {
  const { area, view, board, zone, selectedTile, recenterKey } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const viewRef = useRef(view);
  const callbacksRef = useRef(props);
  const stateRef = useRef({ board, zone, selectedTile });

  useEffect(() => {
    callbacksRef.current = props;
    stateRef.current = { board, zone, selectedTile };
  });

  // Create the map once per area.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let stopReports = () => {};
    loadedRef.current = false;
    callbacksRef.current.onStatus("loading");

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker.js?v=${maplibregl.getVersion()}`);

      const dataPromise = loadAreaData(area);

      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: area.center,
        zoom: area.zoom,
        minZoom: 11,
        maxZoom: 19,
        dragRotate: false,
        pitchWithRotate: false,
        // Full credits sit behind the (i) button. The page keeps an always
        // visible OpenStreetMap credit of its own at the bottom left.
        attributionControl: { compact: true, customAttribution: "Heat and turf: AlphaDog, from OpenStreetMap data" },
      });
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __alphaMap?: MapLibreMap }).__alphaMap = map;
      }

      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        fitBoundsOptions: { maxZoom: 16 },
      });
      map.addControl(geolocate, "bottom-right");
      geolocate.on("geolocate", (e) => {
        callbacksRef.current.onOutsideArea(!isInArea(area, e.coords.longitude, e.coords.latitude));
      });

      // ---- Walker reports and dog heat ----
      const m = map;
      let reportTimer: ReturnType<typeof setTimeout> | undefined;
      let reportRequest = 0;

      const loadReports = () => {
        const sb = getSupabase();
        if (!sb || cancelled || !m.getSource("report-pins") || m.getZoom() < 12) return;
        const b = m.getBounds();
        const padX = (b.getEast() - b.getWest()) * 0.2;
        const padY = (b.getNorth() - b.getSouth()) * 0.2;
        const box: [number, number, number, number] = [
          b.getWest() - padX,
          b.getSouth() - padY,
          b.getEast() + padX,
          b.getNorth() + padY,
        ];
        if (box[2] - box[0] > 0.5 || box[3] - box[1] > 0.5) return;
        const request = ++reportRequest;
        Promise.all([fetchReportBuckets(sb, box), getDogHeat(sb, box)])
          .then(([buckets, heat]) => {
            if (cancelled || request !== reportRequest) return;
            // Marks and pee/poop reports blend into the heat, only where 3 or
            // more people went (the database enforces that). Never pins.
            const dogHeat = heat.map((h) => point(h.lon, h.lat, { s: Math.min(1, 0.5 + 0.1 * h.n) }));
            const pins = buckets
              .filter((r) => REPORT_KINDS[r.kind]?.pin)
              .map((r) => point(r.lon, r.lat, { kind: r.kind, n: r.n, last: r.last_at }));
            (m.getSource("dog-heat") as GeoJSONSource | undefined)?.setData(collection(dogHeat));
            (m.getSource("report-pins") as GeoJSONSource | undefined)?.setData(collection(pins));
          })
          .catch(() => {});
      };
      m.on("moveend", () => {
        clearTimeout(reportTimer);
        reportTimer = setTimeout(loadReports, 300);
      });
      stopReports = () => clearTimeout(reportTimer);

      callbacksRef.current.onApi({
        getCenter: () => {
          const c = m.getCenter();
          return [c.lng, c.lat];
        },
        locate: () =>
          new Promise<boolean>((resolve) => {
            if (!navigator.geolocation) return resolve(false);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (cancelled) return resolve(false);
                m.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: Math.max(17, m.getZoom()) });
                resolve(true);
              },
              () => resolve(false),
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
            );
          }),
        flyTo: (lon, lat, zoom) => m.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(16, m.getZoom()) }),
        refreshReports: loadReports,
      });

      map.on("load", async () => {
        const data = await dataPromise;
        if (cancelled || !map) return;
        if (!data) {
          callbacksRef.current.onStatus("error");
          return;
        }
        callbacksRef.current.onData(data);

        const streets: Feature[] = (data.streets ?? []).map(([s, ...flat]) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i], flat[2 * i + 1]]),
          },
          properties: { s },
        }));
        map.addSource("streets", { type: "geojson", data: collection(streets) });
        map.addSource("dog-heat", { type: "geojson", data: collection([]) });
        map.addSource("spots", {
          type: "geojson",
          data: collection(data.features.map(([lon, lat, t, name]) => point(lon, lat, { t, name: name ?? null }))),
        });
        map.addSource("report-pins", { type: "geojson", data: collection([]) });
        map.addSource("turf", { type: "geojson", data: collection([]) });
        map.addSource("zone", { type: "geojson", data: collection([]) });
        map.addSource("selected", { type: "geojson", data: collection([]) });

        // Draw heat and turf under street and place labels so names stay readable.
        const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
        // Where dogs walk: the sidewalks and paths, glowing by score.
        map.addLayer(
          {
            id: "street-glow",
            type: "line",
            source: "streets",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": STREET_COLORS[viewRef.current],
              "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 12, 3, 15, 9, 17, 20, 19, 44],
              "line-blur": ["interpolate", ["exponential", 1.6], ["zoom"], 12, 2, 15, 6, 17, 14, 19, 30],
              "line-opacity": STREET_OPACITY[viewRef.current][1],
            },
          },
          firstLabel,
        );
        map.addLayer(
          {
            id: "street-core",
            type: "line",
            source: "streets",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": STREET_COLORS[viewRef.current],
              "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 12, 0.8, 15, 2, 17, 4.5, 19, 9],
              "line-opacity": STREET_OPACITY[viewRef.current][0],
            },
          },
          firstLabel,
        );
        // Marks, once 3 or more dogs have used a spot, as warm glows on top.
        map.addLayer(
          {
            id: "dog-heat",
            type: "heatmap",
            source: "dog-heat",
            paint: {
              "heatmap-weight": ["get", "s"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 17, 1.4],
              "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 12, 6, 15, 22, 17, 60, 19, 200],
              "heatmap-color": HEAT_COLORS[viewRef.current],
              "heatmap-opacity": 0.8,
            },
          },
          firstLabel,
        );
        map.addLayer(
          {
            id: "turf-fill",
            type: "fill",
            source: "turf",
            paint: {
              "fill-color": ["match", ["get", "state"], "mine", TURF_COLORS.mine, "taken", TURF_COLORS.taken, "local", TURF_COLORS.local, "#000000"],
              "fill-opacity": ["match", ["get", "state"], "mine", 0.42, "taken", 0.32, "local", 0.22, 0],
            },
          },
          firstLabel,
        );
        map.addLayer(
          {
            id: "turf-grid",
            type: "line",
            source: "turf",
            minzoom: 13,
            paint: { "line-color": "#0f172a", "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.05, 16, 0.12], "line-width": 1 },
          },
          firstLabel,
        );
        map.addLayer(
          {
            id: "turf-mine",
            type: "line",
            source: "turf",
            filter: ["==", ["get", "state"], "mine"],
            paint: { "line-color": "#047857", "line-width": 2 },
          },
          firstLabel,
        );
        map.addLayer({
          id: "zone-fill",
          type: "fill",
          source: "zone",
          paint: { "fill-color": "#7c3aed", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "zone-line",
          type: "line",
          source: "zone",
          paint: { "line-color": "#7c3aed", "line-width": 2, "line-dasharray": [2, 1.5] },
        });
        map.addLayer({
          id: "selected-line",
          type: "line",
          source: "selected",
          paint: { "line-color": "#18181b", "line-width": 3 },
        });
        map.addLayer({
          id: "spots",
          type: "circle",
          source: "spots",
          minzoom: 15.5,
          filter: ["!=", ["get", "t"], 7],
          paint: {
            "circle-color": SPOT_COLOR,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 15.5, 3.5, 17, 6, 19, 9],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0, 16, 1],
            "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0, 16, 1],
          },
        });
        map.addLayer({
          id: "dog-parks",
          type: "circle",
          source: "spots",
          minzoom: 12,
          filter: ["==", ["get", "t"], 7],
          paint: {
            "circle-color": FEATURE_TYPES[7].color,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 16, 9, 19, 12],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
        // Walker-reported pins get a dark ring so they read differently from map data.
        map.addLayer({
          id: "report-pins",
          type: "circle",
          source: "report-pins",
          minzoom: 12,
          paint: {
            "circle-color": REPORT_PIN_COLOR,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 8, 19, 11],
            "circle-stroke-color": "#18181b",
            "circle-stroke-width": 2,
          },
        });

        const popup = (lngLat: [number, number], title: string, sub?: string) => {
          const box = document.createElement("div");
          const t = document.createElement("strong");
          t.textContent = title;
          box.append(t);
          if (sub) {
            const s = document.createElement("div");
            s.textContent = sub;
            box.append(s);
          }
          new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat(lngLat).setDOMContent(box).addTo(m);
        };

        // One click handler: map spots and report pins first, then turf blocks.
        map.on("click", (e) => {
          const hit = m.queryRenderedFeatures(e.point, { layers: ["report-pins", "dog-parks", "spots"] })[0];
          if (hit && hit.geometry.type === "Point") {
            const at = hit.geometry.coordinates as [number, number];
            if (hit.layer.id === "report-pins") {
              const kind = String(hit.properties.kind) as ReportKind;
              const n = Number(hit.properties.n);
              const when = timeAgo(String(hit.properties.last));
              popup(at, REPORT_KINDS[kind]?.label ?? "Report", n > 1 ? `Reported ${n} times, last ${when}` : `Reported ${when}`);
            } else {
              const code = Number(hit.properties.t) as FeatureCode;
              popup(at, FEATURE_TYPES[code]?.label ?? "Spot", hit.properties.name ? String(hit.properties.name) : undefined);
            }
            return;
          }
          if (viewRef.current !== "turf") return;
          const { lng, lat } = e.lngLat;
          callbacksRef.current.onTileClick(isInArea(area, lng, lat) ? tileOf(lng, lat) : null);
        });
        for (const layer of ["spots", "dog-parks", "report-pins"]) {
          map.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
        }

        // MapLibre opens the compact credits on load. Fold them into the (i).
        containerRef.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        loadedRef.current = true;
        drawTurf(m, area, stateRef.current.board);
        drawZone(m, stateRef.current.zone);
        drawSelected(m, stateRef.current.selectedTile);
        applyView(m, viewRef.current);
        callbacksRef.current.onStatus("ready");
        loadReports();

        // Jump to the walker's location right away if they already allowed it.
        navigator.permissions
          ?.query({ name: "geolocation" })
          .then((p) => {
            if (p.state === "granted" && !cancelled) geolocate.trigger();
          })
          .catch(() => {});
      });
    })();

    return () => {
      cancelled = true;
      stopReports();
      callbacksRef.current.onApi(null);
      map?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [area]);

  useEffect(() => {
    viewRef.current = view;
    if (mapRef.current && loadedRef.current) applyView(mapRef.current, view);
  }, [view]);

  useEffect(() => {
    if (mapRef.current && loadedRef.current) drawTurf(mapRef.current, area, board);
  }, [board, area]);

  useEffect(() => {
    if (mapRef.current && loadedRef.current) drawZone(mapRef.current, zone);
  }, [zone]);

  useEffect(() => {
    if (mapRef.current && loadedRef.current) drawSelected(mapRef.current, selectedTile);
  }, [selectedTile]);

  useEffect(() => {
    if (recenterKey > 0) mapRef.current?.flyTo({ center: area.center, zoom: area.zoom });
  }, [recenterKey, area]);

  // MapLibre's CSS sets the container to position: relative, so the container
  // fills a positioned wrapper instead of positioning itself.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" aria-label={`Map of ${area.name}`} role="region" />
    </div>
  );
}

function applyView(map: MapLibreMap, view: View) {
  map.setPaintProperty("dog-heat", "heatmap-color", HEAT_COLORS[view]);
  for (const id of ["street-glow", "street-core"]) map.setPaintProperty(id, "line-color", STREET_COLORS[view]);
  map.setPaintProperty("street-core", "line-opacity", STREET_OPACITY[view][0]);
  map.setPaintProperty("street-glow", "line-opacity", STREET_OPACITY[view][1]);
  for (const id of TURF_LAYERS) map.setLayoutProperty(id, "visibility", view === "turf" ? "visible" : "none");
}

function drawTurf(map: MapLibreMap, area: Area, board: BoardTile[]) {
  const held = new Map(board.map((b) => [b.tile, b]));
  const keys = new Set([...tilesIn(area.bbox), ...held.keys()]);
  const features = [...keys].map((key) => {
    const b = held.get(key);
    return tileFeature(key, { state: b?.state ?? "open", points: b?.points ?? 0 });
  });
  (map.getSource("turf") as GeoJSONSource | undefined)?.setData(collection(features));
}

function drawZone(map: MapLibreMap, zone: string[] | null) {
  (map.getSource("zone") as GeoJSONSource | undefined)?.setData(collection((zone ?? []).map((k) => tileFeature(k))));
}

function drawSelected(map: MapLibreMap, tile: string | null) {
  (map.getSource("selected") as GeoJSONSource | undefined)?.setData(collection(tile ? [tileFeature(tile)] : []));
}
