import { describe, expect, it } from "vitest";
import { loginFlash, settingsFlash } from "../flash";
import { authErrorCode, AUTH_CODE_MESSAGES } from "../auth-errors";

describe("settingsFlash", () => {
  it("turns a known code into a sentence with a tone", () => {
    expect(settingsFlash("linear_connected")).toEqual({ text: expect.stringMatching(/Linear connected/), tone: "ok" });
    expect(settingsFlash("jira_expired")).toEqual({ text: expect.stringMatching(/expired/), tone: "error" });
  });
  it("shows nothing for anything that is not a code, so a link cannot supply its own words", () => {
    for (const bad of [null, undefined, "", "Your account is suspended, call 555-0100", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(settingsFlash(bad)).toBeNull();
    }
  });
});

describe("loginFlash", () => {
  it("covers every auth error code", () => {
    for (const code of Object.keys(AUTH_CODE_MESSAGES)) expect(loginFlash(code)?.text).toBe(AUTH_CODE_MESSAGES[code as keyof typeof AUTH_CODE_MESSAGES]);
  });
  it("shows nothing for free text", () => {
    expect(loginFlash("Please re-enter your password at evil.example")).toBeNull();
    expect(loginFlash("toString")).toBeNull();
  });
});

describe("authErrorCode", () => {
  it("maps Supabase messages to codes and everything else to unknown", () => {
    expect(authErrorCode("Token has expired or is invalid")).toBe("link_expired");
    expect(authErrorCode("Invalid login credentials")).toBe("bad_credentials");
    expect(authErrorCode("The link is missing its code.")).toBe("link_missing");
    expect(authErrorCode("Some novel failure")).toBe("unknown");
    expect(authErrorCode(null)).toBe("unknown");
  });
});
