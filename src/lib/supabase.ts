import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Browser Supabase client, or null when this copy of the app has no Supabase
 * settings (for example a fresh clone without .env.local). Callers hide the
 * report features in that case instead of crashing.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  return client;
}

/** Signs the walker in anonymously the first time they report. */
export async function ensureSession(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signedIn, error } = await sb.auth.signInAnonymously();
  if (error || !signedIn.user) throw error ?? new Error("Could not start a session");
  return signedIn.user.id;
}
