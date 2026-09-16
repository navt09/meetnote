import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Erasure against a fake bucket.
 *
 * The end-to-end run proves deletion works on a real account, but its account
 * holds one recording, so the paging it depends on only ever runs one page
 * there. A storage list is capped and does not say it was capped, which is
 * exactly the failure that cannot be seen from one file: these pin the walk
 * past the first page, and the order that keeps an account from being deleted
 * around audio that is still in the bucket.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const PAGE = 1000;

type Entry = { name: string };

/** A bucket as a map of folder -> entries, served a page at a time like the real one. */
function fakeAdmin(folders: Record<string, Entry[]>, opts: { removeError?: string } = {}) {
  const calls = { list: [] as { prefix: string; offset: number }[], remove: [] as string[][], deleteUser: [] as string[] };
  const order: string[] = [];
  const client = {
    storage: {
      from: () => ({
        // offset is optional in the real API, and a caller that leaves it out
        // gets the first page, so the fake treats it the same way.
        list: async (prefix: string, { limit, offset = 0 }: { limit: number; offset?: number }) => {
          calls.list.push({ prefix, offset });
          return { data: (folders[prefix] ?? []).slice(offset, offset + limit), error: null };
        },
        remove: async (paths: string[]) => {
          calls.remove.push(paths);
          order.push("remove");
          return { error: opts.removeError ? { message: opts.removeError } : null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.deleteUser.push(id);
          order.push("deleteUser");
          return { error: null };
        },
      },
    },
  };
  return { client, calls, order };
}

function files(n: number, prefix = "m"): Entry[] {
  return Array.from({ length: n }, (_, i) => ({ name: `${prefix}${i}.webm` }));
}

let current: ReturnType<typeof fakeAdmin>;

vi.mock("../supabase-admin", () => ({
  RECORDINGS_BUCKET: "recordings",
  supabaseAdmin: () => current.client,
}));

const { deleteAccount } = await import("../account-delete");

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("deleteAccount", () => {
  it("walks past a full page instead of stopping at the cap", async () => {
    // 2003 recordings in one month: two full pages and a short one.
    current = fakeAdmin({
      [USER]: [{ name: "2026-09" }],
      [`${USER}/2026-09`]: files(2 * PAGE + 3),
    });

    const result = await deleteAccount(USER);

    expect(result.audioFilesRemoved).toBe(2 * PAGE + 3);
    const offsets = current.calls.list.filter((c) => c.prefix === `${USER}/2026-09`).map((c) => c.offset);
    expect(offsets).toEqual([0, PAGE, 2 * PAGE]);
    // Every file named in the removal, none twice.
    const removed = current.calls.remove.flat();
    expect(new Set(removed).size).toBe(2 * PAGE + 3);
  });

  it("removes a page at a time rather than in one request", async () => {
    current = fakeAdmin({
      [USER]: [{ name: "2026-09" }],
      [`${USER}/2026-09`]: files(PAGE + 1),
    });

    await deleteAccount(USER);

    expect(current.calls.remove.map((batch) => batch.length)).toEqual([PAGE, 1]);
  });

  it("asks once more after an exactly full page, then stops on the empty one", async () => {
    current = fakeAdmin({
      [USER]: [{ name: "2026-09" }],
      [`${USER}/2026-09`]: files(PAGE),
    });

    const result = await deleteAccount(USER);

    expect(result.audioFilesRemoved).toBe(PAGE);
    const offsets = current.calls.list.filter((c) => c.prefix === `${USER}/2026-09`).map((c) => c.offset);
    // A full page cannot prove it was the last, so one more is asked for.
    expect(offsets).toEqual([0, PAGE]);
  });

  it("builds full paths across every month folder", async () => {
    current = fakeAdmin({
      [USER]: [{ name: "2026-08" }, { name: "2026-09" }],
      [`${USER}/2026-08`]: files(1, "a"),
      [`${USER}/2026-09`]: files(1, "b"),
    });

    await deleteAccount(USER);

    expect(current.calls.remove.flat()).toEqual([`${USER}/2026-08/a0.webm`, `${USER}/2026-09/b0.webm`]);
  });

  it("deletes the audio before the account, never after", async () => {
    current = fakeAdmin({
      [USER]: [{ name: "2026-09" }],
      [`${USER}/2026-09`]: files(3),
    });

    await deleteAccount(USER);

    expect(current.order).toEqual(["remove", "deleteUser"]);
  });

  it("keeps the account when the audio could not be removed", async () => {
    current = fakeAdmin(
      {
        [USER]: [{ name: "2026-09" }],
        [`${USER}/2026-09`]: files(3),
      },
      { removeError: "storage unavailable" },
    );

    await expect(deleteAccount(USER)).rejects.toThrow(/Could not delete stored audio/);
    // The whole point of the order: an account deleted around surviving audio
    // leaves it unreachable and undeletable.
    expect(current.calls.deleteUser).toEqual([]);
  });

  it("deletes an account that never recorded anything", async () => {
    current = fakeAdmin({});

    const result = await deleteAccount(USER);

    expect(result.audioFilesRemoved).toBe(0);
    expect(current.calls.remove).toEqual([]);
    expect(current.calls.deleteUser).toEqual([USER]);
  });
});
