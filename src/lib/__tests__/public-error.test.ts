import { describe, expect, it } from "vitest";
import { publicErrorMessage, toPublicFailure } from "../public-error";

describe("toPublicFailure", () => {
  it("never leaks the vendor name or status code", () => {
    for (const raw of [
      "Deepgram 503: <html>upstream connect error</html>",
      "Deepgram 429: rate limited",
      "AnthropicError: 529 overloaded_error",
      "Recording not found in storage: /var/task/x",
    ]) {
      const out = toPublicFailure(new Error(raw));
      expect(out.message).not.toMatch(/deepgram|anthropic|claude|\d{3}|html|\/var/i);
      expect(out.message.length).toBeGreaterThan(10);
    }
  });

  it("keeps messages the user can act on", () => {
    expect(toPublicFailure(new Error("No speech was detected in the recording."))).toMatchObject({ code: "no_speech", retryable: false });
    expect(toPublicFailure(new Error("The audio file hasn't finished uploading."))).toMatchObject({ code: "upload_incomplete", retryable: true });
    expect(toPublicFailure(new Error("Transcript has 90000 words; the limit is 60000."))).toMatchObject({ code: "too_long", retryable: false });
  });

  it("classifies vendor failures as retryable", () => {
    expect(toPublicFailure(new Error("Deepgram 502: bad gateway"))).toMatchObject({ code: "transcription_failed", retryable: true });
    expect(toPublicFailure(new Error("The model returned malformed notes. Please retry."))).toMatchObject({ code: "notes_failed", retryable: true });
  });

  it("treats a refusal as not retryable", () => {
    expect(toPublicFailure(new Error("The model declined to process this transcript."))).toMatchObject({ code: "notes_declined", retryable: false });
  });

  it("falls back safely for anything unrecognised", () => {
    const out = toPublicFailure(new Error("ECONNRESET at /var/task/node_modules/foo"));
    expect(out.code).toBe("unknown");
    expect(out.message).not.toMatch(/ECONNRESET|\/var/);
  });

  it("handles non-Error values", () => {
    expect(publicErrorMessage(null)).toMatch(/Something went wrong/);
    expect(publicErrorMessage(undefined)).toMatch(/Something went wrong/);
    expect(publicErrorMessage({ weird: true })).toMatch(/Something went wrong/);
  });
});
