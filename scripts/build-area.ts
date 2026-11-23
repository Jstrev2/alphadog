// Builds the baseline "where dogs go" data for one pilot area from OpenStreetMap.
//
//   npm run data:andersonville            (uses cached OSM downloads in .cache/osm)
//   npm run data:andersonville -- --refresh   (downloads fresh OSM data)
//
// Output: public/data/areas/<id>.json (see AreaData in src/lib/feature-types.ts).
// The output is derived from OpenStreetMap, so it is ODbL licensed.
//
// Scoring, per H3 cell (resolution 11, about 30 m across):
//   score = walk x stops x homes
//   walk  = how much walking route runs through the cell (sidewalks, quiet streets, park edges)
//   stops = spots dogs stop at, in or next to the cell. Every residential street
//           and sidewalk counts, because city blocks are lined with parkway grass,
//           trees, hydrants and poles whether or not anyone mapped them. Mapped
//           hydrants, trees, poles and parks add a bonus on top.
//   homes = how many homes are within a few hundred meters (more homes, more dogs)
//
// Lesson from the Andersonville pilot: mapped trees and hydrants follow where
// OpenStreetMap volunteers have worked, not where dogs go. Clark Street had
// thousands of mapped trees and quiet side streets like Paulina had none, so
// they must stay a bonus and never decide the score on their own.
// All weights are first guesses. Tune them as walker reports come in.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cellToLatLng, cellToParent, gridDisk, latLngToCell } from "h3-js";
import { AREAS } from "../src/lib/areas.ts";
import { FEATURE_CODE, type AreaData, type FeatureCode } from "../src/lib/feature-types.ts";
import { D_LAT, D_LON, tileCenter, tileOf, tilesIn } from "../src/lib/grid.ts";

const RES = 11;
const RES_HOMES = 9;

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const USER_AGENT = "AlphaDog/0.1 (https://github.com/Jstrev2/alphadog)";

type LatLon = { lat: number; lon: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: LatLon;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
  geometry?: (LatLon | null)[];
  members?: { type: string; role: string; geometry?: (LatLon | null)[] }[];
};

// ---------- Overpass ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(name: string, query: string, cacheDir: string, refresh: boolean): Promise<OsmElement[]> {
  const cacheFile = `${cacheDir}/${name}.json`;
  if (!refresh && existsSync(cacheFile)) {
    console.log(`  ${name}: cached`);
    return JSON.parse(readFileSync(cacheFile, "utf8")).elements;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(180_000),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith("{")) {
          const json = JSON.parse(text);
          if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(json.remark);
          writeFileSync(cacheFile, text);
          console.log(`  ${name}: ${json.elements.length} elements from ${new URL(endpoint).host}`);
          return json.elements;
        }
        console.log(`  ${name}: ${new URL(endpoint).host} returned ${res.status}`);
      } catch (err) {
        console.log(`  ${name}: ${new URL(endpoint).host} failed (${(err as Error).message})`);
      }
    }
    const wait = 10_000 * 2 ** attempt;
    console.log(`  ${name}: all servers busy, retrying in ${wait / 1000}s`);
    await sleep(wait);
  }
  throw new Error(`Could not download ${name} from any Overpass server`);
}

// ---------- geometry helpers ----------

const R = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

function distance(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Points every `step` meters along a line. */
function sampleLine(line: LatLon[], step: number): LatLon[] {
  const out: LatLon[] = [];
  if (line.length === 0) return out;
  out.push(line[0]);
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const len = distance(a, b);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
      d += step;
    }
    carry = len - (d - step);
  }
  return out;
}

function pointInRing(p: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

/** Grid points every `step` meters inside a closed ring. */
function sampleArea(ring: LatLon[], step: number): LatLon[] {
  const lats = ring.map((p) => p.lat);
  const lons = ring.map((p) => p.lon);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const dLat = step / 111_320;
  const dLon = step / (111_320 * Math.cos(toRad((s + n) / 2)));
  const out: LatLon[] = [];
  for (let lat = s + dLat / 2; lat < n; lat += dLat) {
    for (let lon = w + dLon / 2; lon < e; lon += dLon) {
      if (pointInRing({ lat, lon }, ring)) out.push({ lat, lon });
    }
  }
  return out;
}

/** Ring area in square meters (fine for building-sized shapes). */
function ringArea(ring: LatLon[]): number {
  if (ring.length < 3) return 0;
  const lat0 = toRad(ring[0].lat);
  const xy = ring.map((p) => [toRad(p.lon) * R * Math.cos(lat0), toRad(p.lat) * R]);
  let sum = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) sum += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return Math.abs(sum / 2);
}

function centroid(points: LatLon[]): LatLon {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}

const cleanGeom = (g?: (LatLon | null)[]) => (g ?? []).filter((p): p is LatLon => p !== null);

/** Outer rings of a way or multipolygon relation. */
function rings(el: OsmElement): LatLon[][] {
  if (el.type === "way") return [cleanGeom(el.geometry)];
  return (el.members ?? []).filter((m) => m.role !== "inner").map((m) => cleanGeom(m.geometry));
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

// ---------- turf block names ----------

const NAMED_ROADS = new Set(["residential", "living_street", "unclassified", "tertiary", "secondary", "primary", "pedestrian"]);

/** "North Clark Street" -> "Clark" */
function shortStreetName(name: string): string {
  return name
    .replace(/^(North|South|East|West) /, "")
    .replace(/ (Street|Avenue|Road|Drive|Boulevard|Place|Court|Parkway|Terrace|Lane)$/, "");
}

/**
 * Names each turf block after the streets through its middle, like
 * "Clark & Berwyn". Streets near the center line of a block count most.
 */
function blockNames(roads: OsmElement[], bbox: [number, number, number, number]): Record<string, string> {
  const votes = new Map<string, Map<string, number>>();
  const vote = (key: string, name: string, w: number) => {
    const m = votes.get(key) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + w);
    votes.set(key, m);
  };
  for (const el of roads) {
    const t = el.tags ?? {};
    if (!t.name || !NAMED_ROADS.has(t.highway ?? "")) continue;
    const name = shortStreetName(t.name);
    const line = cleanGeom(el.geometry);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const dx = (b.lon - a.lon) * Math.cos(toRad(a.lat)) * 111_320;
      const dy = (b.lat - a.lat) * 111_320;
      const dir = Math.abs(dx) > Math.abs(dy) ? "ew" : "ns";
      for (const p of sampleLine([a, b], 10)) {
        const key = tileOf(p.lon, p.lat);
        const [cx, cy] = tileCenter(key);
        const off = dir === "ns" ? Math.abs(p.lon - cx) / (D_LON / 2) : Math.abs(p.lat - cy) / (D_LAT / 2);
        const w = Math.max(0, 1 - off);
        if (w > 0) vote(`${key}|${dir}`, name, w);
      }
    }
  }
  const best = (key: string, skip?: string) =>
    [...(votes.get(key) ?? new Map<string, number>())]
      .filter(([name, w]) => name !== skip && w >= 3)
      .sort((x, y) => y[1] - x[1])[0]?.[0];
  const out: Record<string, string> = {};
  for (const key of tilesIn(bbox)) {
    const ns = best(`${key}|ns`);
    const ew = best(`${key}|ew`, ns);
    const label = ns && ew ? `${ns} & ${ew}` : (ns ?? ew);
    if (label) out[key] = label;
  }
  return out;
}

// ---------- street heat ----------

const HEAT_WAYS = new Set(["footway", "path", "pedestrian", "living_street", "residential", "unclassified", "tertiary", "secondary", "primary"]);
const ROADS = new Set(["living_street", "residential", "unclassified", "tertiary", "secondary", "primary"]);

/**
 * The heat drawn as lines along the sidewalks and paths where dogs actually
 * walk, colored by the cell scores underneath. Road centerlines only count
 * where no sidewalk is mapped next to them, so streets don't draw three times.
 * Each line is [score, lon, lat, lon, lat, ...] with the score in tenths.
 */
function streetHeat(paths: OsmElement[], scoreByCell: Map<string, number>): number[][] {
  const near = new Set<string>();
  for (const el of paths) {
    if (el.tags?.footway !== "sidewalk") continue;
    for (const p of sampleLine(cleanGeom(el.geometry), 8)) for (const c of gridDisk(latLngToCell(p.lat, p.lon, 12), 2)) near.add(c);
  }
  const scoreAt = (p: LatLon) => {
    const cell = latLngToCell(p.lat, p.lon, RES);
    let sum = 0;
    let w = 0;
    for (const nb of gridDisk(cell, 1)) {
      const s = scoreByCell.get(nb);
      if (s === undefined) continue;
      const k = nb === cell ? 2 : 1;
      sum += s * k;
      w += k;
    }
    return w ? sum / w : 0;
  };
  const out: number[][] = [];
  for (const el of paths) {
    const t = el.tags ?? {};
    if (!HEAT_WAYS.has(t.highway ?? "") || t.footway === "crossing" || t.access === "private") continue;
    const isRoad = ROADS.has(t.highway ?? "");
    const pts = sampleLine(cleanGeom(el.geometry), 10);
    let run: LatLon[] = [];
    let runScore = -1;
    const flush = () => {
      if (run.length >= 2 && runScore >= 0.1) out.push([runScore, ...run.flatMap((q) => [+q.lon.toFixed(5), +q.lat.toFixed(5)])]);
      run = [];
      runScore = -1;
    };
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      if (isRoad && near.has(latLngToCell(q.lat, q.lon, 12))) {
        flush();
        continue;
      }
      const s = Math.round(scoreAt(q) * 10) / 10;
      if (s !== runScore && run.length) {
        run.push(q);
        flush();
      }
      if (!run.length) runScore = s;
      run.push(q);
    }
    flush();
  }
  return out;
}

// ---------- main ----------

async function main() {
  const areaId = process.argv[2];
  const refresh = process.argv.includes("--refresh");
  const area = AREAS.find((a) => a.id === areaId);
  if (!area) throw new Error(`Unknown area "${areaId}". Known: ${AREAS.map((a) => a.id).join(", ")}`);

  const [w, s, e, n] = area.bbox;
  const bbox = `${s},${w},${n},${e}`;
  const cacheDir = `.cache/osm/${area.id}`;
  mkdirSync(cacheDir, { recursive: true });

  console.log(`Downloading OpenStreetMap data for ${area.name}`);
  const points = await overpass(
    "points",
    `[out:json][timeout:180][bbox:${bbox}];
    (
      node["emergency"="fire_hydrant"];
      node["natural"="tree"];
      node["highway"="street_lamp"];
      node["power"="pole"];
      node["man_made"="utility_pole"];
      nwr["vending"="excrement_bags"];
      nwr["waste"~"dog_excrement"];
      node["amenity"="waste_basket"];
      node["amenity"="bench"];
    );
    out center;`,
    cacheDir,
    refresh,
  );
  await sleep(2000);
  const ways = await overpass(
    "ways",
    `[out:json][timeout:180][bbox:${bbox}];
    (
      way["highway"~"^(footway|path|pedestrian|steps|cycleway|track|living_street|residential|unclassified|service|tertiary|secondary)$"];
      way["natural"="tree_row"];
      way["leisure"~"^(park|dog_park|playground)$"];
      relation["leisure"~"^(park|dog_park)$"];
      way["landuse"~"^(grass|recreation_ground|village_green)$"];
    );
    out geom;`,
    cacheDir,
    refresh,
  );
  await sleep(2000);
  // Main roads (Foster, Ashland and the like). Kept separate so the big ways
  // download above stays cached. Used for block names and a little walk weight.
  const mainRoads = await overpass(
    "main-roads",
    `[out:json][timeout:180][bbox:${bbox}];
    way["highway"="primary"]["name"];
    out geom;`,
    cacheDir,
    refresh,
  );
  await sleep(2000);
  // Bounding boxes, not full outlines: a much lighter download, and close
  // enough to tell a house from an apartment building.
  const buildings = await overpass(
    "buildings",
    `[out:json][timeout:180][bbox:${bbox}];
    way["building"];
    out bb;`,
    cacheDir,
    refresh,
  );

  const walk = new Map<string, number>();
  const stops = new Map<string, number>();
  const homes = new Map<string, number>();
  const features: AreaData["features"] = [];

  const add = (map: Map<string, number>, p: LatLon, weight: number, res = RES) => {
    const cell = latLngToCell(p.lat, p.lon, res);
    map.set(cell, (map.get(cell) ?? 0) + weight);
  };
  const feature = (p: LatLon, code: FeatureCode, name?: string) => {
    const lon = +p.lon.toFixed(5);
    const lat = +p.lat.toFixed(5);
    features.push(name ? [lon, lat, code, name] : [lon, lat, code]);
  };

  // Stop spots (points)
  for (const el of points) {
    const t = el.tags ?? {};
    const p = el.type === "node" ? { lat: el.lat!, lon: el.lon! } : el.center;
    if (!p) continue;
    if (t.emergency === "fire_hydrant") {
      add(stops, p, 3);
      feature(p, FEATURE_CODE.hydrant);
    } else if (t.vending === "excrement_bags" || /dog_excrement/.test(t.waste ?? "")) {
      add(stops, p, 2.5);
      feature(p, FEATURE_CODE.waste_station);
    } else if (t.natural === "tree") {
      add(stops, p, 0.3);
      feature(p, FEATURE_CODE.tree);
    } else if (t.highway === "street_lamp" || t.power === "pole" || t.man_made === "utility_pole") {
      add(stops, p, 0.6);
      feature(p, FEATURE_CODE.post);
    } else if (t.amenity === "waste_basket") {
      add(stops, p, 0.4);
      feature(p, FEATURE_CODE.trash);
    } else if (t.amenity === "bench") {
      add(stops, p, 0.3);
      add(walk, p, 0.2);
      feature(p, FEATURE_CODE.bench);
    }
  }

  // Walking routes, green edges, dog parks (ways and relations)
  const walkWeight: Record<string, number> = {
    footway: 0.35, path: 0.35, pedestrian: 0.35, steps: 0.2, cycleway: 0.25, track: 0.2,
    living_street: 0.3, residential: 0.25, unclassified: 0.15, service: 0.15, tertiary: 0.08, secondary: 0.05,
    primary: 0.04,
  };
  const PARKWAY: Record<string, number> = {
    sidewalk: 0.5, living_street: 0.45, residential: 0.45, unclassified: 0.3, tertiary: 0.3, secondary: 0.25, primary: 0.2,
  };
  for (const el of [...ways, ...mainRoads]) {
    const t = el.tags ?? {};
    if (t.highway && walkWeight[t.highway] !== undefined) {
      let weight = walkWeight[t.highway];
      if (t.footway === "sidewalk") weight = 0.45;
      if (t.service === "driveway" || t.service === "drive-through") weight = 0.05;
      if (t.access === "private" && t.highway !== "service") weight *= 0.5;
      // Parkways: the grass strip, trees, hydrants and poles that line city
      // sidewalks and residential streets, mapped or not.
      const parkway = PARKWAY[t.footway === "sidewalk" ? "sidewalk" : t.highway] ?? 0;
      for (const p of sampleLine(cleanGeom(el.geometry), 15)) {
        add(walk, p, weight);
        if (parkway) add(stops, p, parkway);
      }
    } else if (t.natural === "tree_row") {
      for (const p of sampleLine(cleanGeom(el.geometry), 10)) add(stops, p, 0.5);
    } else if (t.leisure === "dog_park") {
      const outer = rings(el).filter((r) => r.length >= 3);
      const all = outer.flat();
      if (all.length === 0) continue;
      for (const ring of outer) {
        for (const p of sampleArea(ring, 10)) {
          add(stops, p, 1.5);
          add(walk, p, 0.3);
        }
        for (const p of sampleLine(ring, 10)) add(walk, p, 0.3);
      }
      feature(centroid(all), FEATURE_CODE.dog_park, t.name);
    } else if (t.leisure === "park" || t.leisure === "playground") {
      for (const ring of rings(el)) {
        for (const p of sampleLine(ring, 15)) {
          add(walk, p, 0.3);
          add(stops, p, 0.3);
        }
        for (const p of sampleArea(ring, 30)) add(walk, p, 0.15);
      }
    } else if (t.landuse) {
      for (const ring of rings(el)) for (const p of sampleLine(ring, 15)) {
        add(stops, p, 0.25);
        add(walk, p, 0.1);
      }
    }
  }

  // Homes (more homes nearby means more dogs)
  const houseTypes = new Set(["house", "detached", "semidetached_house", "bungalow", "cabin", "farm"]);
  const flatTypes = new Set(["apartments", "residential", "dormitory", "terrace"]);
  let homeCount = 0;
  for (const el of buildings) {
    const kind = el.tags?.building ?? "yes";
    const b = el.bounds;
    if (!b) continue;
    const corners = [
      { lat: b.minlat, lon: b.minlon },
      { lat: b.minlat, lon: b.maxlon },
      { lat: b.maxlat, lon: b.maxlon },
      { lat: b.maxlat, lon: b.minlon },
    ];
    // Buildings fill roughly three quarters of their bounding box.
    const footprint = ringArea(corners) * 0.75;
    let weight = 0;
    if (houseTypes.has(kind)) weight = 1;
    else if (flatTypes.has(kind)) weight = Math.min(40, Math.max(2, footprint / 100));
    else if (kind === "yes") weight = footprint < 400 ? 0.8 : 0.2;
    if (weight === 0) continue;
    homeCount++;
    add(homes, centroid(corners), weight, RES_HOMES);
  }

  // Smooth homes over neighboring res-9 cells (roughly a 400 m walk from home)
  const homesNear = new Map<string, number>();
  for (const [cell, weight] of homes) {
    for (const nb of gridDisk(cell, 1)) {
      homesNear.set(nb, (homesNear.get(nb) ?? 0) + (nb === cell ? weight : weight * 0.5));
    }
  }

  // Combine
  const cellsWithWalk = [...walk.keys()];
  const homeRef = percentile(cellsWithWalk.map((c) => homesNear.get(cellToParent(c, RES_HOMES)) ?? 0), 0.5) || 1;
  const raw: [string, number][] = [];
  for (const cell of cellsWithWalk) {
    let stopSum = 0;
    for (const nb of gridDisk(cell, 1)) stopSum += (stops.get(nb) ?? 0) * (nb === cell ? 1 : 0.5);
    const walkN = 1 - Math.exp(-(walk.get(cell) ?? 0) / 1.0);
    const stopN = 1 - Math.exp(-stopSum / 2.5);
    const homeN = 0.15 + 0.85 * (1 - Math.exp(-(homesNear.get(cellToParent(cell, RES_HOMES)) ?? 0) / homeRef));
    raw.push([cell, walkN * (0.35 + 0.65 * stopN) * homeN]);
  }
  const top = percentile(raw.map(([, v]) => v), 0.97) || 1;
  const cells: AreaData["cells"] = [];
  for (const [cell, value] of raw) {
    const score = Math.min(1, value / top);
    if (score < 0.03) continue;
    const [lat, lon] = cellToLatLng(cell);
    cells.push([+lon.toFixed(5), +lat.toFixed(5), +score.toFixed(3)]);
  }

  const tiles = blockNames([...ways, ...mainRoads], area.bbox);
  const scoreByCell = new Map(raw.map(([cell, value]) => [cell, Math.min(1, value / top)]));
  const streets = streetHeat([...ways, ...mainRoads], scoreByCell);

  const out: AreaData = {
    v: 1,
    area: area.id,
    name: area.name,
    generatedAt: new Date().toISOString(),
    license: "ODbL 1.0. Derived from OpenStreetMap data, © OpenStreetMap contributors.",
    h3Res: RES,
    cells,
    features,
    tiles,
    streets,
  };
  mkdirSync("public/data/areas", { recursive: true });
  const file = `public/data/areas/${area.id}.json`;
  writeFileSync(file, JSON.stringify(out));

  const counts: Record<string, number> = {};
  for (const f of features) counts[f[2]] = (counts[f[2]] ?? 0) + 1;
  console.log(`\nWrote ${file}`);
  console.log(`  ${cells.length} scored cells, ${features.length} map spots, ${homeCount} homes`);
  console.log(`  spots by type code: ${JSON.stringify(counts)}`);
  console.log(`  ${Object.keys(tiles).length} named turf blocks, ${streets.length} street heat lines`);
  console.log(`  size: ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
