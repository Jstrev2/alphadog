/** Map spots shown as dots at high zoom. Codes are stored in the area data files. */
export const FEATURE_TYPES = {
  1: { key: "hydrant", label: "Fire hydrant", color: "#dc2626" },
  2: { key: "tree", label: "Tree", color: "#16a34a" },
  3: { key: "post", label: "Pole or lamp post", color: "#64748b" },
  4: { key: "waste_station", label: "Dog waste station", color: "#2563eb" },
  5: { key: "trash", label: "Trash can", color: "#0d9488" },
  6: { key: "bench", label: "Bench", color: "#a16207" },
  7: { key: "dog_park", label: "Dog park", color: "#9333ea" },
} as const;

export type FeatureCode = keyof typeof FEATURE_TYPES;

export const FEATURE_CODE = {
  hydrant: 1,
  tree: 2,
  post: 3,
  waste_station: 4,
  trash: 5,
  bench: 6,
  dog_park: 7,
} as const satisfies Record<string, FeatureCode>;

/** Shape of /public/data/areas/<id>.json */
export type AreaData = {
  v: 1;
  area: string;
  name: string;
  generatedAt: string;
  license: string;
  h3Res: number;
  /** [lon, lat, score 0..1] for each scored H3 cell center */
  cells: [number, number, number][];
  /** [lon, lat, type code, optional name] */
  features: ([number, number, FeatureCode] | [number, number, FeatureCode, string])[];
  /** Turf block key (see src/lib/grid.ts) to a street name like "Clark & Berwyn" */
  tiles?: Record<string, string>;
  /** Heat along sidewalks and paths: [score 0..1 in tenths, lon, lat, lon, lat, ...] */
  streets?: number[][];
};
