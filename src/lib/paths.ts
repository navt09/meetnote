// Storage object paths encode ownership: <user_id>/<yyyy-mm>/<meeting_id>.<ext>
// Pure functions, unit-tested.

const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID_RE})/(\\d{4}-\\d{2})/(${UUID_RE})\\.(webm|ogg|m4a|mp3|wav)$`);

export const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** "audio/webm;codecs=opus" -> "audio/webm" */
export function baseMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export function extForMime(mime: string | null | undefined): string | null {
  return MIME_TO_EXT[baseMime(mime)] ?? null;
}

export function buildStoragePath(userId: string, meetingId: string, mime: string, now: Date = new Date()): string {
  const ext = extForMime(mime);
  if (!ext) throw new Error(`Unsupported audio type: ${mime}`);
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${userId}/${folder}/${meetingId}.${ext}`;
}

export type ParsedPath = { userId: string; folder: string; meetingId: string; ext: string };

export function parseStoragePath(path: string): ParsedPath | null {
  const m = PATH_RE.exec(path);
  if (!m) return null;
  return { userId: m[1], folder: m[2], meetingId: m[3], ext: m[4] };
}

/** True only if the path is well-formed and belongs to this user. */
export function pathBelongsTo(path: string, userId: string): boolean {
  const p = parseStoragePath(path);
  return !!p && p.userId === userId;
}
