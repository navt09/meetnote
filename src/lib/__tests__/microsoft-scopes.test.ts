import { describe, it, expect } from "vitest";
import {
  availableProducts,
  BASE_SCOPES,
  enableableProducts,
  mergeScopes,
  MSA_TENANT_ID,
  normaliseScope,
  OPTIONAL_SCOPES,
  personalAccount,
  scopesToRequest,
} from "../microsoft-scopes";

/** A token is three dot-separated parts; only the middle one is read. */
const idToken = (payload: object) =>
  `header.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}.signature`;

describe("scopesToRequest", () => {
  it("asks only for what any account can grant by default", () => {
    const asked = scopesToRequest();
    expect(asked).toEqual([...BASE_SCOPES]);
    expect(asked).not.toContain(OPTIONAL_SCOPES.teams);
    expect(asked).not.toContain(OPTIONAL_SCOPES.sharepoint);
  });

  it("adds one organisation-wide permission when asked for it", () => {
    expect(scopesToRequest("teams")).toContain(OPTIONAL_SCOPES.teams);
    expect(scopesToRequest("teams")).not.toContain(OPTIONAL_SCOPES.sharepoint);
    expect(scopesToRequest("sharepoint")).toContain(OPTIONAL_SCOPES.sharepoint);
  });

  it("always carries the base along", () => {
    // Microsoft issues the refresh token against what was asked for, so
    // requesting Teams alone would trade the working half for the new one.
    for (const add of ["teams", "sharepoint"]) {
      expect(scopesToRequest(add)).toEqual(expect.arrayContaining([...BASE_SCOPES]));
    }
  });

  it("ignores anything it was not expecting", () => {
    expect(scopesToRequest("Mail.ReadWrite")).toEqual([...BASE_SCOPES]);
    expect(scopesToRequest(null)).toEqual([...BASE_SCOPES]);
  });
});

describe("normaliseScope", () => {
  it("strips the Graph prefix Microsoft echoes back", () => {
    expect(normaliseScope("https://graph.microsoft.com/Mail.Send")).toBe("Mail.Send");
    expect(normaliseScope("Mail.Send")).toBe("Mail.Send");
  });
});

describe("mergeScopes", () => {
  it("keeps what was already granted", () => {
    // Incremental consent returns only the scopes of the request just made, so
    // taking it literally would forget Outlook the moment Teams was enabled.
    const merged = mergeScopes(["Mail.Send", "Calendars.ReadWrite"], ["ChannelMessage.Send"]);
    expect(merged).toContain("Mail.Send");
    expect(merged).toContain("ChannelMessage.Send");
  });

  it("drops the scopes that gate nothing", () => {
    expect(mergeScopes([], ["offline_access", "openid", "profile", "email", "Mail.Send"])).toEqual(["Mail.Send"]);
  });

  it("de-duplicates across the qualified and bare spellings", () => {
    expect(mergeScopes(["Mail.Send"], ["https://graph.microsoft.com/Mail.Send"])).toEqual(["Mail.Send"]);
  });

  it("survives never having been connected", () => {
    expect(mergeScopes(undefined, ["Mail.Send"])).toEqual(["Mail.Send"]);
  });
});

describe("availableProducts", () => {
  it("lists what the connection can actually reach", () => {
    expect(availableProducts(["Mail.Send", "Calendars.ReadWrite"])).toEqual(["outlook", "calendar"]);
    expect(availableProducts([])).toEqual([]);
    expect(availableProducts(undefined)).toEqual([]);
  });
});

describe("enableableProducts", () => {
  it("offers the two that were not granted yet", () => {
    expect(enableableProducts(["Mail.Send"], false)).toEqual(["teams", "sharepoint"]);
    expect(enableableProducts(["Mail.Send", OPTIONAL_SCOPES.teams], false)).toEqual(["sharepoint"]);
    expect(enableableProducts(Object.values(OPTIONAL_SCOPES), false)).toEqual([]);
  });

  it("offers neither on a personal account", () => {
    // Not "not yet granted" but "will never exist": Teams channels and
    // SharePoint sites are not part of a personal Microsoft account, so an
    // Enable button would be a button that cannot work.
    expect(enableableProducts(["Mail.Send"], true)).toEqual([]);
  });
});

describe("personalAccount", () => {
  it("recognises Microsoft's shared tenant for personal accounts", () => {
    expect(personalAccount(idToken({ tid: MSA_TENANT_ID }))).toBe(true);
  });

  it("treats a company tenant as work", () => {
    expect(personalAccount(idToken({ tid: "c0ffee00-1111-2222-3333-444455556666" }))).toBe(false);
  });

  it("does not crash on a missing or broken token", () => {
    // A failure to read this must never fail a connection; it only decides
    // which buttons are drawn.
    expect(personalAccount(undefined)).toBe(false);
    expect(personalAccount("not-a-token")).toBe(false);
    expect(personalAccount("a.!!!not-base64!!!.c")).toBe(false);
  });
});
