"use client";

import { useEffect, useRef } from "react";
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { isInArea, type Area } from "@/lib/areas";
import { FEATURE_TYPES, type AreaData, type FeatureCode } from "@/lib/feature-types";
import { fetchReportBuckets, REPORT_KINDS, timeAgo, type ReportKind } from "@/lib/reports";
import { getSupabase } from "@/lib/supabase";

export type Mode = "seek" | "avoid";
export type MapStatus = "loading" | "ready" | "error";

/** What the rest of the app can ask the map to do. */
export type MapApi = {
  /** [lon, lat] at the middle of the screen, where the report pin sits. */
  getCenter: () => [number, number];
  /** Flies to the walker's location. Resolves false if location isn't available. */
  locate: () => Promise<boolean>;
  /** Reloads walker reports for the current view. */
  refreshReports: () => void;
};

type Props = {
  area: Area;
  mode: Mode;
  /** Bump to fly back to the pilot area. */
  recenterKey: number;
  onStatus: (status: MapStatus) => void;
  onOutsideArea: (outside: boolean) => void;
  onApi: (api: MapApi | null) => void;
};

type PointFeature = GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>;
const point = (lon: number, lat: number, properties: Record<string, unknown>): PointFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});
const collection = (features: PointFeature[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features,
});

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

const HEAT_COLORS: Record<Mode, ExpressionSpecification> = {
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

const cellFeatures = (data: AreaData) => data.cells.map(([lon, lat, s]) => point(lon, lat, { s }));
const spotFeatures = (data: AreaData) =>
  data.features.map(([lon, lat, t, name]) => point(lon, lat, { t, name: name ?? null }));

async function loadAreaData(area: Area): Promise<AreaData | null> {
  try {
    const res = await fetch(`/data/areas/${area.id}.json`);
    if (!res.ok) return null;
    return (await res.json()) as AreaData;
  } catch {
    return null;
  }
}

export default function AlphaMap({ area, mode, recenterKey, onStatus, onOutsideArea, onApi }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const modeRef = useRef(mode);
  const callbacksRef = useRef({ onStatus, onOutsideArea, onApi });

  useEffect(() => {
    callbacksRef.current = { onStatus, onOutsideArea, onApi };
  }, [onStatus, onOutsideArea, onApi]);

  // Create the map once per area.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let stopReports = () => {};
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
        minZoom: 10,
        maxZoom: 19,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
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

      // ---- Walker reports ----
      const m = map;
      let baseline: PointFeature[] = [];
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
        fetchReportBuckets(sb, box)
          .then((buckets) => {
            if (cancelled || request !== reportRequest) return;
            // Pee and poop blend into the heat (no exact pins, for privacy).
            // More reports in the same spot add more weight.
            const reportHeat = buckets
              .filter((r) => REPORT_KINDS[r.kind] && !REPORT_KINDS[r.kind].pin)
              .map((r) => point(r.lon, r.lat, { s: Math.min(1, 0.6 + 0.2 * (r.n - 1)) }));
            const pins = buckets
              .filter((r) => REPORT_KINDS[r.kind]?.pin)
              .map((r) => point(r.lon, r.lat, { kind: r.kind, n: r.n, last: r.last_at }));
            (m.getSource("baseline") as GeoJSONSource | undefined)?.setData(collection([...baseline, ...reportHeat]));
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
        refreshReports: loadReports,
      });

      map.on("load", async () => {
        const data = await dataPromise;
        if (cancelled || !map) return;
        if (!data) {
          callbacksRef.current.onStatus("error");
          return;
        }

        baseline = cellFeatures(data);
        map.addSource("baseline", { type: "geojson", data: collection(baseline) });
        map.addSource("spots", { type: "geojson", data: collection(spotFeatures(data)) });
        map.addSource("report-pins", { type: "geojson", data: collection([]) });

        // Draw the heat under street and place labels so names stay readable.
        const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
        map.addLayer(
          {
            id: "baseline-heat",
            type: "heatmap",
            source: "baseline",
            paint: {
              // Push top scores up relative to ordinary streets so hot spots stand out.
              "heatmap-weight": ["^", ["get", "s"], 1.3],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.9, 13, 1.3, 15, 1.4, 17, 1.4, 19, 1.2],
              // Cells are about 50 m apart. Keep the radius at roughly twice that
              // spacing on screen so the hexagon grid never shows through.
              "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 11, 4, 14, 12, 15, 24, 16, 50, 17, 100, 19, 400],
              "heatmap-color": HEAT_COLORS[modeRef.current],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.85, 17, 0.75, 19, 0.6],
            },
          },
          firstLabel,
        );
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

        map.on("click", "report-pins", (e) => {
          const f = e.features?.[0];
          if (!f || f.geometry.type !== "Point" || !map) return;
          const kind = String(f.properties.kind) as ReportKind;
          const n = Number(f.properties.n);
          const box = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = REPORT_KINDS[kind]?.label ?? "Report";
          const sub = document.createElement("div");
          const when = timeAgo(String(f.properties.last));
          sub.textContent = n > 1 ? `Reported ${n} times, last ${when}` : `Reported ${when}`;
          box.append(title, sub);
          new maplibregl.Popup({ closeButton: false, offset: 12 })
            .setLngLat(f.geometry.coordinates as [number, number])
            .setDOMContent(box)
            .addTo(map);
        });

        for (const layer of ["spots", "dog-parks"]) {
          map.on("click", layer, (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point" || !map) return;
            const code = Number(f.properties.t) as FeatureCode;
            const box = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = FEATURE_TYPES[code]?.label ?? "Spot";
            box.append(title);
            if (f.properties.name) {
              const sub = document.createElement("div");
              sub.textContent = String(f.properties.name);
              box.append(sub);
            }
            new maplibregl.Popup({ closeButton: false, offset: 10 })
              .setLngLat(f.geometry.coordinates as [number, number])
              .setDOMContent(box)
              .addTo(map);
          });
        }
        for (const layer of ["spots", "dog-parks", "report-pins"]) {
          map.on("mouseenter", layer, () => map && (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", layer, () => map && (map.getCanvas().style.cursor = ""));
        }

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
    };
  }, [area]);

  // Swap colors when the mode changes.
  useEffect(() => {
    modeRef.current = mode;
    const map = mapRef.current;
    if (map?.getLayer("baseline-heat")) map.setPaintProperty("baseline-heat", "heatmap-color", HEAT_COLORS[mode]);
  }, [mode]);

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
