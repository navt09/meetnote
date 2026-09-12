import { describe, it, expect } from "vitest";
import {
  availableProducts,
  BASE_SCOPES,
  enableableProducts,
  mergeScopes,
  MSA_TENANT_ID,
  normaliseScope,
  OPTIONAL_SCOPES,
  PRIMARY_SCOPE,
  canPickTeamsChannel,
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
    for (const s of [...OPTIONAL_SCOPES.teams, ...OPTIONAL_SCOPES.sharepoint]) expect(asked).not.toContain(s);
  });

  it("adds one organisation-wide product when asked for it", () => {
    const teams = scopesToRequest("teams");
    expect(teams).toEqual(expect.arrayContaining(OPTIONAL_SCOPES.teams));
    expect(teams).not.toContain(PRIMARY_SCOPE.sharepoint);
    expect(scopesToRequest("sharepoint")).toContain(PRIMARY_SCOPE.sharepoint);
  });

  it("asks for the two Teams read permissions, not only the send", () => {
    // ChannelMessage.Send posts to a channel but cannot see that any channel
    // exists. Without the read pair you get a connection that can write to a
    // channel nobody is able to choose.
    const teams = scopesToRequest("teams");
    expect(teams).toContain("Team.ReadBasic.All");
    expect(teams).toContain("Channel.ReadBasic.All");
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
    expect(enableableProducts(["Mail.Send", PRIMARY_SCOPE.teams], false)).toEqual(["sharepoint"]);
    expect(enableableProducts(Object.values(PRIMARY_SCOPE), false)).toEqual([]);
  });

  it("offers neither on a personal account", () => {
    // Not "not yet granted" but "will never exist": Teams channels and
    // SharePoint sites are not part of a personal Microsoft account, so an
    // Enable button would be a button that cannot work.
    expect(enableableProducts(["Mail.Send"], true)).toEqual([]);
  });
});

describe("canPickTeamsChannel", () => {
  it("needs both read permissions, not just the send", () => {
    // A tenant admin can approve some and not the rest, so "can post" and
    // "can choose where" are different states and have to look different.
    expect(canPickTeamsChannel(["ChannelMessage.Send"])).toBe(false);
    expect(canPickTeamsChannel(["ChannelMessage.Send", "Team.ReadBasic.All"])).toBe(false);
    expect(canPickTeamsChannel(OPTIONAL_SCOPES.teams)).toBe(true);
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
