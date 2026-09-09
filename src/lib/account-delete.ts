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

/** Every object under `<user_id>/`, walking the month folders the paths are built from. */
async function listUserObjects(userId: string): Promise<string[]> {
  const admin = supabaseAdmin();
  const paths: string[] = [];

  const { data: months, error } = await admin.storage.from(RECORDINGS_BUCKET).list(userId, { limit: 1000 });
  if (error) throw new Error(`Could not list stored audio: ${error.message}`);

  for (const month of months ?? []) {
    const folder = `${userId}/${month.name}`;
    const { data: files, error: fileError } = await admin.storage.from(RECORDINGS_BUCKET).list(folder, { limit: 1000 });
    if (fileError) throw new Error(`Could not list stored audio: ${fileError.message}`);
    for (const f of files ?? []) paths.push(`${folder}/${f.name}`);
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

  const paths = await listUserObjects(userId);
  if (paths.length > 0) {
    const { error } = await admin.storage.from(RECORDINGS_BUCKET).remove(paths);
    if (error) throw new Error(`Could not delete stored audio: ${error.message}`);
  }

  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw new Error(`Could not delete the account: ${userError.message}`);

  console.log(JSON.stringify({ event: "account_deleted", userId, audioFilesRemoved: paths.length }));
  return { audioFilesRemoved: paths.length };
}
