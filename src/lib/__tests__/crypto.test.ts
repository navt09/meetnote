import { beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson, maskSecret, safeEqual } from "../crypto";

beforeAll(() => {
  process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("encryptJson / decryptJson", () => {
  it("round-trips an object", () => {
    const value = { apiKey: "lin_api_abc123", nested: { teamId: "t1" } };
    expect(decryptJson(encryptJson(value))).toEqual(value);
  });

  it("produces different ciphertext each time for the same input", () => {
    const a = encryptJson({ apiKey: "same" });
    const b = encryptJson({ apiKey: "same" });
    expect(a).not.toBe(b);
    expect(decryptJson(a)).toEqual(decryptJson(b));
  });

  it("never contains the plaintext", () => {
    const blob = encryptJson({ apiKey: "SUPER_SECRET_VALUE" });
    expect(blob).not.toContain("SUPER_SECRET_VALUE");
    expect(blob).not.toContain("apiKey");
  });

  it("rejects a tampered payload rather than returning garbage", () => {
    const blob = encryptJson({ apiKey: "abc" });
    const parts = blob.split(".");
    const flipped = Buffer.from(parts[3], "base64url");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64url");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const parts = encryptJson({ apiKey: "abc" }).split(".");
    parts[2] = Buffer.alloc(16, 1).toString("base64url");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });

  it("rejects an unrecognised format", () => {
    expect(() => decryptJson("not-a-blob")).toThrow(/unrecognised format/i);
    expect(() => decryptJson("v9.a.b.c")).toThrow(/unrecognised format/i);
  });

  it("fails loudly when no key is configured", () => {
    const saved = process.env.CREDENTIALS_KEY;
    delete process.env.CREDENTIALS_KEY;
    expect(() => encryptJson({ a: 1 })).toThrow(/CREDENTIALS_KEY/);
    process.env.CREDENTIALS_KEY = saved;
  });

  it("accepts a hex key and a passphrase as well as base64", () => {
    const saved = process.env.CREDENTIALS_KEY;
    for (const k of ["a".repeat(64), "a passphrase that is not 32 bytes"]) {
      process.env.CREDENTIALS_KEY = k;
      expect(decryptJson(encryptJson({ v: k }))).toEqual({ v: k });
    }
    process.env.CREDENTIALS_KEY = saved;
  });

  it("cannot be decrypted with a different key", () => {
    const blob = encryptJson({ apiKey: "abc" });
    const saved = process.env.CREDENTIALS_KEY;
    process.env.CREDENTIALS_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptJson(blob)).toThrow();
    process.env.CREDENTIALS_KEY = saved;
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("maskSecret", () => {
  it("shows enough to recognise the key but not to use it", () => {
    expect(maskSecret("sk-ant-api03-abcdefghijklmnop")).toBe("sk-ant…mnop");
  });
  it("hides short values entirely", () => {
    expect(maskSecret("short")).toBe("•••••");
    expect(maskSecret("")).toBe("••••");
  });
});
