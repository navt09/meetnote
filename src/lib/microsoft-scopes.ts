/**
 * What to ask Microsoft for, and when.
 *
 * Asking for everything at once is the obvious thing and it is wrong. Two of
 * these permissions reach organisation-wide resources — every SharePoint site
 * the person can see, and posting as them into Teams channels — so a company
 * tenant routinely makes them admin-only, and a **personal** Microsoft account
 * cannot grant them at all because Teams channels and SharePoint sites are not
 * part of such an account. There is nothing to grant them against.
 *
 * In both cases a single all-or-nothing consent fails, and takes Outlook,
 * calendar, To Do and OneDrive down with it. Permissions nobody can grant were
 * blocking the ones everybody can.
 *
 * So consent is incremental, which Microsoft supports: a base set any account
 * can approve on its own, and the two organisation-wide ones asked for
 * separately, only when somebody wants them and only where they could work.
 */

export type MicrosoftProduct = "outlook" | "calendar" | "tasks" | "files" | "teams" | "sharepoint";

/** Every account can consent to these alone, personal ones included. */
export const BASE_SCOPES = [
  "offline_access",
  // Returns an id_token, which is the only cheap way to tell a personal
  // account from a work one. See personalAccount().
  "openid",
  "User.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Tasks.ReadWrite",
  "Files.ReadWrite",
] as const;

/** Asked for one at a time, and only on a work or school account. */
export const OPTIONAL_SCOPES: Record<"teams" | "sharepoint", string> = {
  teams: "ChannelMessage.Send",
  sharepoint: "Sites.ReadWrite.All",
};

/** Microsoft's own tenant id for every personal account. A documented constant. */
export const MSA_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

export const PRODUCTS: { key: MicrosoftProduct; label: string; scope: string; workOnly: boolean }[] = [
  { key: "outlook", label: "Outlook mail", scope: "Mail.Send", workOnly: false },
  { key: "calendar", label: "Calendar", scope: "Calendars.ReadWrite", workOnly: false },
  { key: "tasks", label: "To Do", scope: "Tasks.ReadWrite", workOnly: false },
  { key: "files", label: "Excel on OneDrive", scope: "Files.ReadWrite", workOnly: false },
  { key: "teams", label: "Teams", scope: OPTIONAL_SCOPES.teams, workOnly: true },
  { key: "sharepoint", label: "SharePoint", scope: OPTIONAL_SCOPES.sharepoint, workOnly: true },
];

/**
 * The scopes to request. `add` names one optional product; the base always
 * rides along, because Microsoft issues the refresh token against what was
 * asked for and leaving the base out would trade the working half for the
 * new one.
 */
export function scopesToRequest(add?: string | null): string[] {
  const extra = add === "teams" || add === "sharepoint" ? [OPTIONAL_SCOPES[add]] : [];
  return [...BASE_SCOPES, ...extra];
}

/**
 * Graph echoes granted scopes fully qualified. Compared bare, since that is
 * how they are written everywhere else.
 */
export function normaliseScope(scope: string): string {
  return scope.trim().replace(/^https:\/\/graph\.microsoft\.com\//i, "");
}

/**
 * What the connection can do after a consent, which is the union of what it
 * could already do and what was just granted.
 *
 * A union rather than a replacement: incremental consent returns only the
 * scopes of the request that was just made, so taking it literally would
 * forget Outlook the moment somebody enabled Teams.
 */
export function mergeScopes(existing: string[] | undefined, granted: string[]): string[] {
  const all = new Set([...(existing ?? []), ...granted].map(normaliseScope).filter(Boolean));
  // The ones that gate nothing are noise on the Settings card.
  for (const noise of ["offline_access", "openid", "profile", "email"]) all.delete(noise);
  return [...all].sort();
}

export function hasScope(scopes: string[] | undefined, scope: string): boolean {
  return (scopes ?? []).includes(scope);
}

/** Which products this connection can actually reach today. */
export function availableProducts(scopes: string[] | undefined): MicrosoftProduct[] {
  return PRODUCTS.filter((p) => hasScope(scopes, p.scope)).map((p) => p.key);
}

/**
 * The products still worth offering. On a personal account the two work-only
 * ones are not "not yet granted", they are "will never exist", so offering an
 * Enable button for them would be a button that cannot work.
 */
export function enableableProducts(scopes: string[] | undefined, personal: boolean): ("teams" | "sharepoint")[] {
  if (personal) return [];
  return (["teams", "sharepoint"] as const).filter((k) => !hasScope(scopes, OPTIONAL_SCOPES[k]));
}

/**
 * Is this a personal Microsoft account? Read from the id_token's tenant claim,
 * which every personal account shares.
 *
 * The token is not verified here, and does not need to be: it arrived directly
 * from Microsoft's token endpoint over TLS in response to our own request, and
 * this decides nothing but which buttons to draw. Nothing is authorised on it.
 */
export function personalAccount(idToken: string | undefined): boolean {
  const payload = readJwtPayload(idToken);
  return payload?.tid === MSA_TENANT_ID;
}

export function readJwtPayload(token: string | undefined): { tid?: string; [k: string]: unknown } | null {
  const part = (token ?? "").split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as { tid?: string };
  } catch {
    return null;
  }
}
