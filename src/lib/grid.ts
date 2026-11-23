// Turf blocks follow Chicago's address grid. The city runs 800 address numbers
// per mile, so one "hundred block" is 1/8 mile. Each turf block is centered on
// a grid crossing (for example 5300 N and 1700 W), so streets run through the
// middle of a block instead of along its edge.
//
// The same math lives in SQL (public.grid_tile and public.grid_spot in
// supabase/migrations/20261123120000_turf_game.sql). Change both together.

// The grid drifts a few hundred meters from downtown to the North Side, so
// these numbers are fitted to Andersonville's own streets (Lawrence 4800 N to
// Hollywood 5700 N, Glenwood 1400 W to Damen 2000 W) rather than measured from
// State and Madison. Re-fit them if the game spreads far from Andersonville.
const LAT0 = 41.88094;
const LON0 = -87.63108;
/** One hundred block, in degrees. */
export const D_LAT = 0.001833;
export const D_LON = 0.002413;

export type Bbox = [west: number, south: number, east: number, north: number];

export function tileOf(lon: number, lat: number): string {
  const tx = Math.floor((lon - LON0) / D_LON + 0.5);
  const ty = Math.floor((lat - LAT0) / D_LAT + 0.5);
  return `${tx},${ty}`;
}

export function parseTile(key: string): [number, number] {
  const [tx, ty] = key.split(",").map(Number);
  return [tx, ty];
}

export function tileBounds(key: string): Bbox {
  const [tx, ty] = parseTile(key);
  return [
    LON0 + (tx - 0.5) * D_LON,
    LAT0 + (ty - 0.5) * D_LAT,
    LON0 + (tx + 0.5) * D_LON,
    LAT0 + (ty + 0.5) * D_LAT,
  ];
}

export function tileCenter(key: string): [number, number] {
  const [tx, ty] = parseTile(key);
  return [LON0 + tx * D_LON, LAT0 + ty * D_LAT];
}

export function tilePolygon(key: string): GeoJSON.Polygon {
  const [w, s, e, n] = tileBounds(key);
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

/** Every tile whose center sits inside the box. */
export function tilesIn([w, s, e, n]: Bbox): string[] {
  const [x0, y0] = parseTile(tileOf(w, s));
  const [x1, y1] = parseTile(tileOf(e, n));
  const out: string[] = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) out.push(`${tx},${ty}`);
  return out;
}

/** "5300 N & 1700 W": the address-grid crossing at the middle of the block. */
export function tileAddress(key: string): string {
  const [tx, ty] = parseTile(key);
  const ns = ty >= 0 ? `${ty * 100} N` : `${-ty * 100} S`;
  const ew = tx <= 0 ? `${-tx * 100} W` : `${tx * 100} E`;
  return `${ns} & ${ew}`;
}

/**
 * A hidden zone: a random 2 by 2 square of blocks that includes home, plus
 * sometimes one extra block on the side so the shape is lumpy. Home could be
 * any of the four, so the zone never points at it. Only these block keys are
 * saved, never the home spot itself.
 */
export function makeHiddenZone(homeLon: number, homeLat: number, rand: () => number = Math.random): string[] {
  const [hx, hy] = parseTile(tileOf(homeLon, homeLat));
  const x0 = hx - (rand() < 0.5 ? 0 : 1);
  const y0 = hy - (rand() < 0.5 ? 0 : 1);
  const zone = [`${x0},${y0}`, `${x0 + 1},${y0}`, `${x0},${y0 + 1}`, `${x0 + 1},${y0 + 1}`];
  if (rand() < 0.7) {
    const sides = [
      [x0 - 1, y0 + (rand() < 0.5 ? 0 : 1)],
      [x0 + 2, y0 + (rand() < 0.5 ? 0 : 1)],
      [x0 + (rand() < 0.5 ? 0 : 1), y0 - 1],
      [x0 + (rand() < 0.5 ? 0 : 1), y0 + 2],
    ];
    const [ex, ey] = sides[Math.floor(rand() * sides.length)];
    zone.push(`${ex},${ey}`);
  }
  return zone;
}
