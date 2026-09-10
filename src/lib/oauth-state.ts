import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { safeEqual } from "./crypto";
import type { SettingsFlashCode } from "./flash";

/**
 * CSRF protection shared by every connect flow: a random value stored in a
 * short-lived httpOnly cookie and compared when the provider redirects back,
 * so another site can't complete a connection on someone's behalf.
 */

export function stateCookieName(provider: string): string {
  return `oauth_state_${provider}`;
}

export async function issueState(provider: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(stateCookieName(provider), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return state;
}

/** Reads and clears the stored value, then compares in constant time. */
export async function consumeState(provider: string, returned: string | null): Promise<boolean> {
  const jar = await cookies();
  const name = stateCookieName(provider);
  const expected = jar.get(name)?.value ?? "";
  jar.delete(name);
  return !!expected && !!returned && safeEqual(expected, returned);
}

/**
 * Sends the user back to Settings with a message code. Only a code: the page
 * turns it into a sentence, so no text from a provider or a link reaches the
 * screen.
 */
export function backToSettings(origin: string, flash: { error: SettingsFlashCode } | { notice: SettingsFlashCode }): URL {
  const url = new URL("/settings", origin);
  if ("error" in flash) url.searchParams.set("error", flash.error);
  else url.searchParams.set("notice", flash.notice);
  return url;
}
