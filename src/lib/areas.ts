/** A pilot area with prebuilt baseline data in /public/data/areas/<id>.json */
export type Area = {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** [lon, lat] */
  center: [number, number];
  zoom: number;
};

export const AREAS: Area[] = [
  {
    // Andersonville as OpenStreetMap outlines it (Lawrence to Ardmore,
    // Ravenswood to Broadway), padded a few blocks so walks that start in the
    // neighborhood are covered, plus the lakefront dog parks from Bryn Mawr
    // down to Montrose Dog Beach.
    id: "andersonville",
    name: "Andersonville",
    bbox: [-87.68, 41.966, -87.64, 41.991],
    center: [-87.668, 41.979],
    zoom: 14.5,
  },
];

export const DEFAULT_AREA = AREAS[0];

export function isInArea(area: Area, lon: number, lat: number): boolean {
  const [w, s, e, n] = area.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
