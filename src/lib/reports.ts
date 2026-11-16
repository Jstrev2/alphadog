import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSession } from "@/lib/supabase";

export type ReportKind = "pee" | "poop" | "mess" | "busy" | "hydrant" | "bag_station" | "trash_can";

type KindInfo = {
  label: string;
  /** Shorter label for buttons */
  short: string;
  group: "dog" | "heads_up" | "missing";
  color: string;
  /** Pee and poop only blend into the heat. Everything else shows as a pin. */
  pin: boolean;
};

export const REPORT_KINDS: Record<ReportKind, KindInfo> = {
  pee: { label: "Pee", short: "Pee", group: "dog", color: "#eab308", pin: false },
  poop: { label: "Poop", short: "Poop", group: "dog", color: "#92400e", pin: false },
  mess: { label: "Mess left behind", short: "Mess left", group: "heads_up", color: "#ea580c", pin: true },
  busy: { label: "Busy with dogs right now", short: "Busy now", group: "heads_up", color: "#db2777", pin: true },
  hydrant: { label: "Fire hydrant", short: "Hydrant", group: "missing", color: "#dc2626", pin: true },
  bag_station: { label: "Bag station", short: "Bag station", group: "missing", color: "#2563eb", pin: true },
  trash_can: { label: "Trash can", short: "Trash can", group: "missing", color: "#0d9488", pin: true },
};

export const REPORT_GROUPS: { id: KindInfo["group"]; title: string }[] = [
  { id: "dog", title: "Your dog went here" },
  { id: "heads_up", title: "Heads up" },
  { id: "missing", title: "Missing from the map" },
];

/** One bucket from report_heat(): reports grouped into ~11 m squares. */
export type ReportBucket = { lon: number; lat: number; kind: ReportKind; n: number; last_at: string };

export async function fetchReportBuckets(
  sb: SupabaseClient,
  [west, south, east, north]: [number, number, number, number],
): Promise<ReportBucket[]> {
  const { data, error } = await sb.rpc("report_heat", {
    min_lon: west,
    min_lat: south,
    max_lon: east,
    max_lat: north,
  });
  if (error) throw error;
  return (data ?? []) as ReportBucket[];
}

/** Saves a report at a spot and returns its id plus how many reports this walker has made. */
export async function submitReport(
  sb: SupabaseClient,
  kind: ReportKind,
  [lon, lat]: [number, number],
): Promise<{ id: string; total: number }> {
  await ensureSession(sb);
  const { data, error } = await sb.from("reports").insert({ kind, lon, lat }).select("id").single();
  if (error) throw error;
  const { count } = await sb.from("reports").select("id", { count: "exact", head: true });
  return { id: data.id as string, total: count ?? 1 };
}

export async function deleteReport(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("reports").delete().eq("id", id);
  if (error) throw error;
}

export function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
