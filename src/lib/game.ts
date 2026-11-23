import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSession } from "@/lib/supabase";

export type DogSize = "toy" | "small" | "medium" | "large" | "giant";

export const SIZES: { id: DogSize; label: string; hint: string }[] = [
  { id: "toy", label: "Toy", hint: "Under 10 lb" },
  { id: "small", label: "Small", hint: "10 to 25 lb" },
  { id: "medium", label: "Medium", hint: "25 to 50 lb" },
  { id: "large", label: "Large", hint: "50 to 90 lb" },
  { id: "giant", label: "Giant", hint: "Over 90 lb" },
];
export const sizeLabel = (s: string) => SIZES.find((x) => x.id === s)?.label ?? s;

/** A dog you own, straight from the dogs table. */
export type Dog = {
  id: string;
  name: string;
  size: DogSize;
  breed: string | null;
  bio: string | null;
  photo_path: string | null;
  ghost: boolean;
  created_at: string;
};

/** Public bits of any dog. */
export type DogBasic = Pick<Dog, "id" | "name" | "size" | "breed" | "photo_path">;

export type DogCardData = DogBasic & {
  bio: string | null;
  since: string;
  ghost: boolean;
  mine: boolean | null;
  points_today: number;
  points_week: number;
  points_month: number;
  points_total: number;
  blocks: number;
  streak: number;
  woofs: number;
  badges: Record<string, number>;
  i_woofed: boolean;
};

export type TileState = "mine" | "taken" | "local";
export type BoardTile = { tile: string; state: TileState; points: number };

export type TileDetail = {
  tile: string;
  as_of: string;
  state: TileState | "open";
  leader_points: number;
  holder: DogBasic | null;
  my_points: number;
};

export type Period = "day" | "week" | "month";
export type LeaderRow = DogBasic & { rank: number; dog_id: string; points: number; blocks: number };

export type WoofRow = DogBasic & { dog_id: string; woofed_at: string; pack: boolean };

export type TurfChange = { tile: string; change: "won" | "lost" | "faded"; by_name: string | null; by_local: boolean };

export type MarkResult = {
  id: string;
  tile: string;
  fresh: boolean;
  first_in_tile: boolean;
  near: "hydrant" | "post" | "dog_park" | null;
};

// ---------- dogs ----------

export async function listMyDogs(sb: SupabaseClient): Promise<Dog[]> {
  const { data, error } = await sb.from("dogs").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Dog[];
}

export type DogInput = { name: string; size: DogSize; breed: string | null; bio: string | null };

export async function createDog(sb: SupabaseClient, input: DogInput): Promise<Dog> {
  await ensureSession(sb);
  const { data, error } = await sb.from("dogs").insert(input).select("*").single();
  if (error) throw error;
  return data as Dog;
}

export async function updateDog(
  sb: SupabaseClient,
  id: string,
  patch: Partial<DogInput & { photo_path: string | null; ghost: boolean }>,
): Promise<Dog> {
  const { data, error } = await sb.from("dogs").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Dog;
}

export async function deleteDog(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("dogs").delete().eq("id", id);
  if (error) throw error;
}

export async function getDogCard(sb: SupabaseClient, id: string): Promise<DogCardData | null> {
  const { data, error } = await sb.rpc("dog_card", { p_dog: id });
  if (error) throw error;
  return (data as DogCardData | null) ?? null;
}

// ---------- hidden zone ----------

export async function getHiddenZone(sb: SupabaseClient): Promise<string[] | null> {
  const { data, error } = await sb.from("home_zones").select("tiles").maybeSingle();
  if (error) throw error;
  return (data?.tiles as string[] | undefined) ?? null;
}

export async function saveHiddenZone(sb: SupabaseClient, tiles: string[]): Promise<void> {
  const owner_id = await ensureSession(sb);
  const { error } = await sb
    .from("home_zones")
    .upsert({ owner_id, tiles, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw error;
}

export async function clearHiddenZone(sb: SupabaseClient): Promise<void> {
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  const { error } = await sb.from("home_zones").delete().eq("owner_id", uid);
  if (error) throw error;
}

// ---------- marks ----------

export async function submitMark(
  sb: SupabaseClient,
  dogId: string,
  lon: number,
  lat: number,
  accuracy: number,
): Promise<MarkResult> {
  await ensureSession(sb);
  const { data, error } = await sb
    .from("marks")
    .insert({ dog_id: dogId, lon, lat, accuracy_m: Math.round(accuracy) })
    .select("id, tile, fresh, first_in_tile, near")
    .single();
  if (error) throw error;
  return data as MarkResult;
}

export async function undoMark(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("marks").delete().eq("id", id);
  if (error) throw error;
}

// ---------- turf ----------

export async function getBoard(sb: SupabaseClient): Promise<BoardTile[]> {
  const { data, error } = await sb.rpc("turf_board");
  if (error) throw error;
  return (data ?? []) as BoardTile[];
}

export async function getTileDetail(sb: SupabaseClient, tile: string, dogId: string | null): Promise<TileDetail> {
  const { data, error } = await sb.rpc("tile_detail", { p_tile: tile, p_dog: dogId });
  if (error) throw error;
  return data as TileDetail;
}

export async function getTurfChanges(sb: SupabaseClient, dogId: string, since: string): Promise<TurfChange[]> {
  const { data, error } = await sb.rpc("turf_changes", { p_dog: dogId, p_since: since });
  if (error) throw error;
  return (data ?? []) as TurfChange[];
}

// ---------- leaderboards ----------

export async function getLeaderboard(sb: SupabaseClient, period: Period, size: DogSize | null): Promise<LeaderRow[]> {
  const { data, error } = await sb.rpc("leaderboard", { p_period: period, p_size: size });
  if (error) throw error;
  return ((data ?? []) as LeaderRow[]).map((r) => ({ ...r, id: r.dog_id }));
}

// ---------- woofs ----------

export async function sendWoof(sb: SupabaseClient, from: string, to: string): Promise<"woofed" | "pack"> {
  const { data, error } = await sb.rpc("woof", { p_from: from, p_to: to });
  if (error) throw error;
  return data as "woofed" | "pack";
}

export async function getMyWoofs(sb: SupabaseClient, dogId: string): Promise<WoofRow[]> {
  const { data, error } = await sb.rpc("my_woofs", { p_dog: dogId });
  if (error) throw error;
  return ((data ?? []) as WoofRow[]).map((r) => ({ ...r, id: r.dog_id }));
}

// ---------- heat ----------

export type HeatSpot = { lon: number; lat: number; n: number };

export async function getDogHeat(sb: SupabaseClient, [w, s, e, n]: [number, number, number, number]): Promise<HeatSpot[]> {
  const { data, error } = await sb.rpc("dog_heat", { min_lon: w, min_lat: s, max_lon: e, max_lat: n });
  if (error) throw error;
  return (data ?? []) as HeatSpot[];
}

// ---------- errors ----------

export function friendlyError(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err ? String(err.message) : "";
  if (/too fast for a walk/i.test(msg)) return "Whoa, that's fast for a walk. Marks have to be made on foot.";
  if (/pilot area/i.test(msg)) return "Marks only count inside the Andersonville pilot area for now.";
  if (/not precise enough/i.test(msg)) return "Your location isn't precise enough yet. Step outside or wait a few seconds.";
  if (/too many marks/i.test(msg)) return "That's a lot of marks for one hour. Give it a little break.";
  if (/too many reports/i.test(msg)) return "That's a lot of reports for one hour. Try again a bit later.";
  if (/up to 4 dogs/i.test(msg)) return "You can have up to 4 dogs.";
  if (/lot of woofs/i.test(msg)) return "That's a lot of woofs for one day. Try again tomorrow.";
  if (/ghost dogs cannot woof/i.test(msg)) return "Ghost dogs can't woof. Turn off ghost mode first.";
  if (/anonymous sign-ins are disabled/i.test(msg)) return "Sign-ups are switched off right now.";
  if (/rate limit|security purposes/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/token has expired|invalid/i.test(msg)) return "That code didn't work. Check it, or send a new one.";
  return "Something went wrong. Check your connection and try again.";
}
