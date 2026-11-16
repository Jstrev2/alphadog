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
    id: "sanford-fl",
    name: "Sanford, FL",
    bbox: [-81.38, 28.76, -81.31, 28.82],
    center: [-81.345, 28.79],
    zoom: 13.5,
  },
];

export const DEFAULT_AREA = AREAS[0];

export function isInArea(area: Area, lon: number, lat: number): boolean {
  const [w, s, e, n] = area.bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
