import { describe, expect, it } from "vitest";
import { friendlyAuthError, isValidEmail, passwordProblem, PASSWORD_MIN_LENGTH } from "../auth-errors";

describe("isValidEmail", () => {
  it("accepts normal addresses and trims", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  someone@company.com  ")).toBe(true);
  });
  it("rejects malformed ones", () => {
    for (const bad of ["", "a", "a@b", "a b@c.com", "@b.com", "a@.com"]) expect(isValidEmail(bad)).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("accepts a decent password", () => {
    expect(passwordProblem("correct-horse-battery", "sam@work.com")).toBeNull();
  });
  it("requires a minimum length", () => {
    expect(passwordProblem("short")).toMatch(new RegExp(String(PASSWORD_MIN_LENGTH)));
    expect(passwordProblem("")).toBe("Enter a password.");
  });
  it("rejects passwords containing the email name", () => {
    expect(passwordProblem("naveen12345", "naveen@company.com")).toMatch(/email address/);
  });
  it("ignores very short email names when checking", () => {
    expect(passwordProblem("abcdefgh", "ab@company.com")).toBeNull();
  });
  it("rejects obvious choices", () => {
    expect(passwordProblem("password123")).toMatch(/easy to guess/);
    expect(passwordProblem("12345678")).toMatch(/easy to guess/);
  });
});

describe("friendlyAuthError", () => {
  it("rewrites the common Supabase messages", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/don't match/);
    expect(friendlyAuthError("Email not confirmed")).toMatch(/Confirm your email/);
    expect(friendlyAuthError("User already registered")).toMatch(/already exists/);
    expect(friendlyAuthError("email rate limit exceeded")).toMatch(/Too many attempts/);
    expect(friendlyAuthError("Token has expired or is invalid")).toMatch(/expired/);
  });
  it("passes through anything it doesn't recognise", () => {
    expect(friendlyAuthError("Some novel failure")).toBe("Some novel failure");
  });
  it("handles empty input", () => {
    expect(friendlyAuthError(null)).toBe("Something went wrong. Try again.");
    expect(friendlyAuthError("   ")).toBe("Something went wrong. Try again.");
  });
});
