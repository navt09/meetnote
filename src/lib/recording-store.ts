// Browser-only. Saves recording chunks to IndexedDB every few seconds so a
// crashed tab or closed laptop doesn't lose the meeting.

const DB_NAME = "meetnote";
const DB_VERSION = 1;
const RECORDINGS = "recordings";
const CHUNKS = "chunks";

export type RecordingStatus = "recording" | "stopped" | "uploaded";

export type RecordingMeta = {
  id: string;
  startedAt: number;
  updatedAt: number;
  mimeType: string;
  status: RecordingStatus;
  chunkCount: number;
  bytes: number;
  storagePath?: string;
};

type ChunkRow = { key: string; recordingId: string; index: number; blob: Blob };

export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) db.createObjectStore(RECORDINGS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHUNKS)) {
        const chunks = db.createObjectStore(CHUNKS, { keyPath: "key" });
        chunks.createIndex("byRecording", "recordingId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

function tx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
    const r = run(t);
    if (r instanceof IDBRequest) {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
    } else {
      r.then(resolve, reject);
    }
  });
}

export async function createRecording(meta: Pick<RecordingMeta, "id" | "mimeType">): Promise<void> {
  const db = await openDb();
  const now = Date.now();
  const row: RecordingMeta = { ...meta, status: "recording", startedAt: now, updatedAt: now, chunkCount: 0, bytes: 0 };
  await tx(db, [RECORDINGS], "readwrite", (t) => t.objectStore(RECORDINGS).put(row));
  db.close();
}

export async function appendChunk(recordingId: string, index: number, blob: Blob): Promise<void> {
  const db = await openDb();
  const key = `${recordingId}:${String(index).padStart(6, "0")}`;
  await tx(db, [CHUNKS, RECORDINGS], "readwrite", async (t) => {
    t.objectStore(CHUNKS).put({ key, recordingId, index, blob } satisfies ChunkRow);
    const store = t.objectStore(RECORDINGS);
    const meta = await reqToPromise<RecordingMeta | undefined>(store.get(recordingId));
    if (meta) {
      meta.chunkCount = Math.max(meta.chunkCount, index + 1);
      meta.bytes += blob.size;
      meta.updatedAt = Date.now();
      store.put(meta);
    }
  });
  db.close();
}

export async function updateRecording(id: string, patch: Partial<RecordingMeta>): Promise<void> {
  const db = await openDb();
  await tx(db, [RECORDINGS], "readwrite", async (t) => {
    const store = t.objectStore(RECORDINGS);
    const meta = await reqToPromise<RecordingMeta | undefined>(store.get(id));
    if (meta) store.put({ ...meta, ...patch, updatedAt: Date.now() });
  });
  db.close();
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  const db = await openDb();
  const rows = await tx<RecordingMeta[]>(db, [RECORDINGS], "readonly", (t) => t.objectStore(RECORDINGS).getAll());
  db.close();
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

/** Reassembles the chunks in order into one playable file. */
export async function getRecordingBlob(id: string): Promise<{ blob: Blob; meta: RecordingMeta } | null> {
  const db = await openDb();
  const meta = await tx<RecordingMeta | undefined>(db, [RECORDINGS], "readonly", (t) => t.objectStore(RECORDINGS).get(id));
  if (!meta) {
    db.close();
    return null;
  }
  const rows = await tx<ChunkRow[]>(db, [CHUNKS], "readonly", (t) =>
    t.objectStore(CHUNKS).index("byRecording").getAll(IDBKeyRange.only(id)),
  );
  db.close();
  rows.sort((a, b) => a.index - b.index);
  if (rows.length === 0) return null;
  return { blob: new Blob(rows.map((r) => r.blob), { type: meta.mimeType }), meta };
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, [CHUNKS, RECORDINGS], "readwrite", async (t) => {
    const idx = t.objectStore(CHUNKS).index("byRecording");
    const keys = await reqToPromise<IDBValidKey[]>(idx.getAllKeys(IDBKeyRange.only(id)));
    for (const k of keys) t.objectStore(CHUNKS).delete(k);
    t.objectStore(RECORDINGS).delete(id);
  });
  db.close();
}

function reqToPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}
