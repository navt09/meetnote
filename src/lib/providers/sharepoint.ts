import "server-only";
import { accessTokenFor, graph } from "./microsoft";
import type { MicrosoftConfig, MicrosoftCredentials } from "../connectors";

/**
 * Keeping a meeting's notes in SharePoint.
 *
 * A document in a site's library, not a SharePoint *page*. A page is a layout
 * of web parts that has to be created, populated and published through three
 * different calls, and what people asked for is the notes somewhere the team
 * can find and search them. A Markdown file does that, opens in the browser,
 * and is one call.
 *
 * Work and school accounts only: a personal Microsoft account has OneDrive but
 * no SharePoint sites, so there is nowhere for this to write.
 */

export type Site = { id: string; name: string; url?: string };

/**
 * The sites this person can reach.
 *
 * `search=*` is Graph's documented way to ask for all of them; an empty search
 * returns nothing rather than everything, which reads as "you have no sites"
 * and is wrong.
 */
export async function listSites(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
): Promise<Site[]> {
  const token = await accessTokenFor(userId, creds, config);
  const res = await graph<{ value: { id: string; displayName?: string; name?: string; webUrl?: string }[] }>(
    token,
    "/sites",
    { query: { search: "*", $top: "50" } },
  );
  return (res.value ?? []).map((s) => ({ id: s.id, name: s.displayName ?? s.name ?? "Site", url: s.webUrl }));
}

/**
 * Writes the notes into the site's default document library.
 *
 * `conflictBehavior=rename` rather than replace: re-saving a meeting whose
 * notes were re-extracted should not quietly overwrite whatever somebody has
 * since edited by hand. A second copy is visible and recoverable; a silent
 * overwrite is neither.
 *
 * The path is built from the meeting's own title, so the library reads as a
 * list of meetings. Anything a filename cannot hold is replaced rather than
 * stripped, or two meetings an hour apart collapse onto one name.
 */
export async function saveNotes(
  userId: string,
  creds: MicrosoftCredentials,
  config: MicrosoftConfig,
  siteId: string,
  file: { title: string; recordedAt: string; markdown: string },
): Promise<{ url: string; name: string }> {
  const token = await accessTokenFor(userId, creds, config);
  const name = fileNameFor(file.title, file.recordedAt);

  const created = await graph<{ webUrl?: string; name?: string }>(
    token,
    `/sites/${siteId}/drive/root:/${encodeURIComponent(name)}:/content`,
    {
      method: "PUT",
      query: { "@microsoft.graph.conflictBehavior": "rename" },
      raw: file.markdown,
      contentType: "text/markdown; charset=utf-8",
    },
  );
  return { url: created.webUrl ?? "", name: created.name ?? name };
}

/** `2026-09-12 Weekly standup.md`, dated first so the library sorts by meeting. */
export function fileNameFor(title: string, recordedAt: string): string {
  const d = new Date(recordedAt);
  const day = Number.isNaN(d.getTime()) ? "undated" : d.toISOString().slice(0, 10);
  // Replaced with a space rather than removed: "Q3/Q4 review" must not become
  // "Q3Q4 review", and a name that collapses two meetings into one is worse
  // than a slightly longer one.
  const safe = (title ?? "")
    .replace(/[\\/:*?"<>|#%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return `${day} ${safe || "Meeting"}.md`;
}
