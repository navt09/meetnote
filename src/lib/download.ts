// Browser-only. Object URLs for "Download audio" links, created once per
// recording and revoked so memory isn't leaked.

export type DownloadLink = { url: string; name: string };

export function makeDownloadLink(blob: Blob, now: Date = new Date()): DownloadLink {
  const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  return { url: URL.createObjectURL(blob), name: `meeting-${now.toISOString().slice(0, 10)}.${ext}` };
}

export function revokeDownloadLink(link: DownloadLink | null | undefined): void {
  if (link) URL.revokeObjectURL(link.url);
}
