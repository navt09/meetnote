// Turns Supabase auth errors and password rules into plain language.
// Pure functions, unit-tested.

export const PASSWORD_MIN_LENGTH = 8;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Returns a problem to show the user, or null when the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length === 0) return "Enter a password.";
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  const local = email.trim().toLowerCase().split("@")[0];
  if (local.length >= 3 && password.toLowerCase().includes(local)) return "Don't use your email address in the password.";
  if (/^(password|12345678|qwertyui|letmein)/i.test(password)) return "That password is too easy to guess.";
  return null;
}

/**
 * Every message we know how to phrase, keyed by a short code. The code is what
 * an email-link redirect puts in the URL (see flash.ts), so the login page can
 * only ever show one of these sentences, never text a link supplied.
 */
export const AUTH_CODE_MESSAGES = {
  bad_credentials: "That email and password don't match. Check both, or reset your password.",
  unconfirmed: "Confirm your email first. Check your inbox for the link we sent when you signed up.",
  exists: "An account with that email already exists. Sign in instead.",
  short_password: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  weak_password: "That password is too easy to guess. Try a longer one.",
  rate_limited: "Too many attempts just now. Wait a few minutes and try again.",
  signups_off: "New sign-ups are turned off at the moment.",
  same_password: "That's already your password. Choose a different one.",
  link_expired: "That link has expired. Request a new one.",
  slow_down: "Wait a moment before trying that again.",
  offline: "Couldn't reach the server. Check your connection and try again.",
  link_missing: "That link is missing its code. Open it again from the email, or request a new one.",
  unknown: "Something went wrong with that link. Try again, or request a new one.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_CODE_MESSAGES;

const MAP: Array<[RegExp, AuthErrorCode]> = [
  [/invalid login credentials/i, "bad_credentials"],
  [/email not confirmed/i, "unconfirmed"],
  [/user already registered|already been registered/i, "exists"],
  [/password should be at least/i, "short_password"],
  [/weak password|password is known to be weak/i, "weak_password"],
  [/rate limit|too many requests|over_email_send_rate/i, "rate_limited"],
  [/signups not allowed|signup is disabled/i, "signups_off"],
  [/same password/i, "same_password"],
  [/token has expired|otp_expired|invalid or has expired/i, "link_expired"],
  [/for security purposes/i, "slow_down"],
  [/failed to fetch|network/i, "offline"],
  [/missing its code/i, "link_missing"],
];

/** The code for a Supabase message, or "unknown". Safe to put in a URL. */
export function authErrorCode(message: string | null | undefined): AuthErrorCode {
  const m = (message ?? "").trim();
  for (const [re, code] of MAP) if (re.test(m)) return code;
  return "unknown";
}

/** In-page use: a friendly rewrite when we recognise the message, else the message itself. */
export function friendlyAuthError(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "Something went wrong. Try again.";
  const code = authErrorCode(m);
  return code === "unknown" ? m : AUTH_CODE_MESSAGES[code];
}
