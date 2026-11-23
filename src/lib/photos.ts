import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "dog-photos";

export function photoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Shrinks a photo to at most `max` pixels on its long side, as a JPEG. */
async function shrink(file: File, max = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that photo"))), "image/jpeg", 0.85),
  );
}

/** Uploads a new photo for a dog and returns its storage path. Removes the old one. */
export async function uploadDogPhoto(
  sb: SupabaseClient,
  dogId: string,
  file: File,
  oldPath: string | null,
): Promise<string> {
  const blob = await shrink(file);
  const path = `${dogId}/${Date.now().toString(36)}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  if (oldPath) await sb.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  return path;
}
