import "server-only";
import { RECORDINGS_BUCKET, supabaseAdmin } from "./supabase-admin";

// Supabase free tier caps one upload at 50 MB (~3.5 h at our bitrate).
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** One-time URL the browser can PUT the audio to. Upsert so a retry can overwrite a partial upload. */
export async function mintUploadUrl(path: string): Promise<{ signedUrl: string } | { error: string }> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return { error: `Could not create upload URL: ${error?.message ?? "unknown"}` };
    return { signedUrl: data.signedUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Storage error" };
  }
}

/** Size in bytes if the object exists, else null. */
export async function storedObjectSize(path: string): Promise<number | null> {
  const admin = supabaseAdmin();
  const folder = path.slice(0, path.lastIndexOf("/"));
  const file = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).list(folder, { search: file, limit: 10 });
  if (error) throw new Error(`Storage check failed: ${error.message}`);
  const found = data?.find((o) => o.name === file);
  if (!found) return null;
  const size = (found.metadata as { size?: number } | null)?.size;
  return typeof size === "number" ? size : 0;
}
