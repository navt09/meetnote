import "server-only";
import { RECORDINGS_BUCKET, supabaseAdmin } from "./supabase-admin";

/**
 * Erasing an account, for real.
 *
 * Order matters and is the whole reason this is not a one-liner. Deleting the
 * auth user cascades every table that references it, but storage is not part
 * of that cascade: delete the user first and their audio is orphaned in the
 * bucket under a user id that no longer exists, unreachable and undeletable
 * through the app. So the bucket goes first, and the account only goes if that
 * succeeded.
 *
 * The privacy policy promises erasure. This is what has to be true for that
 * promise to be kept.
 */

export type DeletionResult = { audioFilesRemoved: number };

/**
 * One folder, every entry, paged.
 *
 * A single list call is capped, and it does not say that it was capped: it
 * just returns a full page. Asking once would quietly leave everything past
 * the cap in the bucket while the account was deleted around it, which is the
 * one failure this file exists to prevent and the one it could not see. So the
 * pages are walked until one comes back short.
 */
const PAGE = 1000;

async function listFolder(prefix: string): Promise<string[]> {
  const admin = supabaseAdmin();
  const names: string[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`Could not list stored audio: ${error.message}`);
    const page = data ?? [];
    for (const entry of page) names.push(entry.name);
    if (page.length < PAGE) return names;
  }
}

/** Every object under `<user_id>/`, walking the month folders the paths are built from. */
async function listUserObjects(userId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const month of await listFolder(userId)) {
    const folder = `${userId}/${month}`;
    for (const name of await listFolder(folder)) paths.push(`${folder}/${name}`);
  }
  return paths;
}

/**
 * Deletes everything belonging to one account: audio first, then the account,
 * which cascades meetings, tasks, drafts, connectors, settings and the tier row.
 *
 * Throws rather than half-finishing. A caller that sees an error should assume
 * nothing was deleted and say so, because a partial deletion the user believes
 * succeeded is worse than a failure they can retry.
 */
export async function deleteAccount(userId: string): Promise<DeletionResult> {
  const admin = supabaseAdmin();

  // Removed a page at a time for the same reason they are listed a page at a
  // time: one very long request is the shape that gets truncated or refused,
  // and the failure would look like a deletion that worked.
  const paths = await listUserObjects(userId);
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await admin.storage.from(RECORDINGS_BUCKET).remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(`Could not delete stored audio: ${error.message}`);
  }

  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`Could not delete the account: ${userError.message}`);

  console.log(JSON.stringify({ event: "account_deleted", userId, audioFilesRemoved: paths.length }));
  return { audioFilesRemoved: paths.length };
}
