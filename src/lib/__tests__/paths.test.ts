import { describe, expect, it } from "vitest";
import { baseMime, buildStoragePath, extForMime, parseStoragePath, pathBelongsTo } from "../paths";

const U = "11111111-2222-3333-4444-555555555555";
const M = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("mime helpers", () => {
  it("strips codec parameters", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime(" AUDIO/WAV ")).toBe("audio/wav");
    expect(baseMime(null)).toBe("");
  });
  it("maps to extensions or null", () => {
    expect(extForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extForMime("audio/x-wav")).toBe("wav");
    expect(extForMime("video/mp4")).toBeNull();
  });
});

describe("buildStoragePath", () => {
  it("encodes user, month and meeting", () => {
    expect(buildStoragePath(U, M, "audio/webm;codecs=opus", new Date("2026-09-08T23:00:00Z"))).toBe(`${U}/2026-09/${M}.webm`);
  });
  it("uses UTC month", () => {
    expect(buildStoragePath(U, M, "audio/wav", new Date("2026-12-31T23:30:00-05:00"))).toBe(`${U}/2027-01/${M}.wav`);
  });
  it("rejects unknown types", () => {
    expect(() => buildStoragePath(U, M, "text/plain")).toThrow(/Unsupported/);
  });
});

describe("parseStoragePath / pathBelongsTo", () => {
  it("round-trips a valid path", () => {
    const p = parseStoragePath(`${U}/2026-09/${M}.webm`);
    expect(p).toEqual({ userId: U, folder: "2026-09", meetingId: M, ext: "webm" });
  });
  it("rejects traversal, wrong shapes and bad extensions", () => {
    expect(parseStoragePath(`../${U}/2026-09/${M}.webm`)).toBeNull();
    expect(parseStoragePath(`${U}/2026-09/${M}.exe`)).toBeNull();
    expect(parseStoragePath(`${U}/${M}.webm`)).toBeNull();
    expect(parseStoragePath(`2026-09/${M}.webm`)).toBeNull();
  });
  it("checks ownership", () => {
    expect(pathBelongsTo(`${U}/2026-09/${M}.webm`, U)).toBe(true);
    expect(pathBelongsTo(`${U}/2026-09/${M}.webm`, M)).toBe(false);
    expect(pathBelongsTo("garbage", U)).toBe(false);
  });
});
