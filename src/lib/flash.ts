// Messages that travel through a redirect, as short codes.
//
// A callback cannot render anything itself: it can only send the browser to a
// page with something in the URL. Putting free text there meant a crafted link
// could make the login or settings page display any sentence on our domain. So
// the URL carries a code, and the sentence lives here. An unknown code shows
// nothing. Pure, unit-tested.

import { AUTH_CODE_MESSAGES } from "./auth-errors";

export type FlashTone = "error" | "ok";
export type Flash = { text: string; tone: FlashTone };

const SETTINGS: Record<string, Flash> = {
  // Shared by every connect flow.
  google_expired: { text: "That Google connection attempt expired or didn't match. Try again.", tone: "error" },
  google_declined: { text: "You declined the Google permissions.", tone: "error" },
  google_provider_error: { text: "Google reported a problem. Try again in a minute.", tone: "error" },
  google_no_code: { text: "Google didn't return an authorisation code.", tone: "error" },
  google_failed: { text: "Couldn't finish connecting Google. Try again in a minute.", tone: "error" },
  google_connected: { text: "Google connected.", tone: "ok" },
  google_partial_gmail: { text: "Google connected, but permission for sending email wasn't granted. Reconnect to enable it.", tone: "ok" },
  google_partial_calendar: { text: "Google connected, but permission for your calendar wasn't granted. Reconnect to enable it.", tone: "ok" },

  linear_expired: { text: "That Linear connection attempt expired. Try again.", tone: "error" },
  linear_declined: { text: "You declined the Linear permissions.", tone: "error" },
  linear_provider_error: { text: "Linear reported a problem. Try again in a minute.", tone: "error" },
  linear_no_code: { text: "Linear didn't return an authorisation code.", tone: "error" },
  linear_no_teams: { text: "Linear connected, but the account can't see any teams.", tone: "error" },
  linear_failed: { text: "Couldn't finish connecting Linear. Try again in a minute.", tone: "error" },
  linear_connected: { text: "Linear connected. Issues will go to your team.", tone: "ok" },
  linear_pick: { text: "Linear connected. Pick a team.", tone: "ok" },

  jira_expired: { text: "That Jira connection attempt expired. Try again.", tone: "error" },
  jira_declined: { text: "You declined the Jira permissions.", tone: "error" },
  jira_provider_error: { text: "Atlassian reported a problem. Try again in a minute.", tone: "error" },
  jira_no_code: { text: "Atlassian didn't return an authorisation code.", tone: "error" },
  jira_no_site: { text: "Jira connected, but no site was granted. Try again and pick a site.", tone: "error" },
  jira_failed: { text: "Couldn't finish connecting Jira. Try again in a minute.", tone: "error" },
  jira_connected: { text: "Jira connected. Issues will go to your project.", tone: "ok" },
  jira_pick: { text: "Jira connected. Pick a project.", tone: "ok" },

  slack_expired: { text: "That Slack connection attempt expired. Try again.", tone: "error" },
  slack_declined: { text: "You declined the Slack permissions.", tone: "error" },
  slack_provider_error: { text: "Slack reported a problem. Try again in a minute.", tone: "error" },
  slack_no_code: { text: "Slack didn't return an authorisation code.", tone: "error" },
  slack_failed: { text: "Couldn't finish connecting Slack. Try again in a minute.", tone: "error" },
  slack_connected: { text: "Slack connected. Summaries will post to the channel you picked.", tone: "ok" },
};

export type SettingsFlashCode = keyof typeof SETTINGS;

/** The login page shows the auth-link outcomes; the codes come from auth-errors. */
const LOGIN: Record<string, Flash> = Object.fromEntries(
  Object.entries(AUTH_CODE_MESSAGES).map(([code, text]) => [code, { text, tone: "error" as const }]),
);

/** What to show for a code on the settings page, or null for anything unrecognised. */
export function settingsFlash(code: string | null | undefined): Flash | null {
  return (code && Object.prototype.hasOwnProperty.call(SETTINGS, code) && SETTINGS[code]) || null;
}

/** What to show for a code on the login page, or null for anything unrecognised. */
export function loginFlash(code: string | null | undefined): Flash | null {
  return (code && Object.prototype.hasOwnProperty.call(LOGIN, code) && LOGIN[code]) || null;
}
