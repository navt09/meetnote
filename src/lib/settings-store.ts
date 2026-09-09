import "server-only";
import { supabaseAdmin } from "./supabase-admin";

/**
 * The name the notes use for the person recording. Kept beside the other
 * per-user settings in user_settings; written with the service role like the
 * rest of them, read by the pipeline after the HTTP response has gone.
 */

/** Long enough for any real name, short enough that it cannot be a paragraph. */
export const DISPLAY_NAME_MAX = 60;

/**
 * Trims and bounds a name. Returns null for empty, which means "call them You".
 * Letters from any script, spaces, apostrophes, hyphens and dots are allowed;
 * anything else is dropped rather than rejected, so a stray emoji does not
 * block saving.
 */
export function cleanDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .replace(/[^\p{L}\p{M}\s'\-.]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DISPLAY_NAME_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

export async function getDisplayName(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("user_settings").select("display_name").eq("user_id", userId).maybeSingle();
  if (error) {
    // A missing name only costs the "for you" labels; log and carry on.
    console.error(JSON.stringify({ event: "display_name_read_error", message: error.message }));
    return null;
  }
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

export async function setDisplayName(userId: string, name: string | null): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("user_settings").upsert({ user_id: userId, display_name: name }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save the name: ${error.message}`);
}
