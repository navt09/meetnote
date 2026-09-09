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

const MAP: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "That email and password don't match. Check both, or reset your password."],
  [/email not confirmed/i, "Confirm your email first. Check your inbox for the link we sent when you signed up."],
  [/user already registered|already been registered/i, "An account with that email already exists. Sign in instead."],
  [/password should be at least/i, `Use at least ${PASSWORD_MIN_LENGTH} characters.`],
  [/weak password|password is known to be weak/i, "That password is too easy to guess. Try a longer one."],
  [/rate limit|too many requests|over_email_send_rate/i, "Too many attempts just now. Wait a few minutes and try again."],
  [/signups not allowed|signup is disabled/i, "New sign-ups are turned off at the moment."],
  [/same password/i, "That's already your password. Choose a different one."],
  [/token has expired|otp_expired|invalid or has expired/i, "That link has expired. Request a new one."],
  [/for security purposes/i, "Wait a moment before trying that again."],
  [/failed to fetch|network/i, "Couldn't reach the server. Check your connection and try again."],
];

export function friendlyAuthError(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  if (!m) return "Something went wrong. Try again.";
  for (const [re, friendly] of MAP) if (re.test(m)) return friendly;
  return m;
}
