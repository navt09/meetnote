// Browser-only. Creates the meeting, uploads its audio straight to storage
// with progress and retries, then asks the server to process it.

import { HttpError, withRetry } from "./retry";
import type { PublicMeeting } from "./meeting";

export async function postJson<T>(url: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function getJson<T>(url: string, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export async function deleteJson(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new HttpError(res.status, json.error ?? `Delete failed (${res.status})`);
  }
}

function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (frac: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new HttpError(xhr.status, `Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new TypeError("Network error during upload"));
    xhr.ontimeout = () => {
      const e = new Error("Upload timed out");
      e.name = "AbortError";
      reject(e);
    };
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(blob);
  });
}

export type CreatedMeeting = { meetingId: string; signedUrl: string; contentType: string };

export async function createMeeting(blob: Blob, durationSeconds: number, recordedAt: Date): Promise<CreatedMeeting> {
  return postJson<CreatedMeeting>("/api/meetings", {
    mimeType: blob.type,
    bytes: blob.size,
    durationSeconds,
    recordedAt: recordedAt.toISOString(),
  });
}

/** Uploads the audio for a meeting. On retry it asks for a fresh upload URL. */
export async function uploadMeetingAudio(created: CreatedMeeting, blob: Blob, onProgress: (frac: number) => void): Promise<void> {
  let signedUrl = created.signedUrl;
  await withRetry(
    async (attempt) => {
      if (attempt > 1) {
        const fresh = await postJson<{ signedUrl: string }>(`/api/meetings/${created.meetingId}/upload-url`, {});
        signedUrl = fresh.signedUrl;
      }
      onProgress(0);
      await putWithProgress(signedUrl, blob, created.contentType, onProgress);
      onProgress(1);
    },
    { attempts: 4, baseMs: 1500 },
  );
}

export async function startProcessing(meetingId: string): Promise<void> {
  await withRetry(() => postJson(`/api/meetings/${meetingId}/process`, {}), { attempts: 3, baseMs: 1000 });
}

export async function fetchMeeting(meetingId: string): Promise<PublicMeeting> {
  const { meeting } = await getJson<{ meeting: PublicMeeting }>(`/api/meetings/${meetingId}`);
  return meeting;
}
