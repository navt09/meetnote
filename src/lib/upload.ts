// Browser-only. Uploads a recording straight to storage using a one-time URL
// from our server, with progress and retries.

import { HttpError, withRetry } from "./retry";

export type UploadTicket = { path: string; signedUrl: string; token: string; contentType: string };

export async function requestUploadTicket(blob: Blob): Promise<UploadTicket> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mimeType: blob.type, bytes: blob.size }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, json.error ?? `Upload setup failed (${res.status})`);
  return json as UploadTicket;
}

function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (frac: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
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

/**
 * Full upload: get a ticket, PUT the file, return the storage path.
 * Retries the PUT (with a fresh ticket) on network blips or 5xx.
 */
export async function uploadRecording(blob: Blob, onProgress: (frac: number) => void): Promise<string> {
  return withRetry(
    async () => {
      const ticket = await requestUploadTicket(blob);
      onProgress(0);
      await putWithProgress(ticket.signedUrl, blob, ticket.contentType, onProgress);
      onProgress(1);
      return ticket.path;
    },
    { attempts: 4, baseMs: 1500 },
  );
}

export async function postJson<T>(url: string, body: unknown, timeoutMs = 290_000): Promise<T> {
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
