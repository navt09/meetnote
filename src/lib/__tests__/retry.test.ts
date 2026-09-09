import { describe, expect, it, vi } from "vitest";
import { HttpError, isRetryable, withRetry } from "../retry";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns on first success without sleeping", async () => {
    const sleep = vi.fn(noSleep);
    const result = await withRetry(async () => 42, { sleep });
    expect(result).toBe(42);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a 503 and eventually succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError(503, "down");
        return "ok";
      },
      { attempts: 3, sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry a 400", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(400, "bad");
        },
        { attempts: 3, sleep: noSleep },
      ),
    ).rejects.toThrow("bad");
    expect(calls).toBe(1);
  });

  it("gives up after the configured attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(500, "boom");
        },
        { attempts: 4, sleep: noSleep },
      ),
    ).rejects.toThrow("boom");
    expect(calls).toBe(4);
  });

  it("backs off exponentially", async () => {
    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 4) throw new TypeError("network");
        return 1;
      },
      { attempts: 4, baseMs: 100, maxMs: 10_000, sleep: async (ms) => { delays.push(ms); } },
    );
    expect(delays).toHaveLength(3);
    // jitter is 0.85x..1.15x of 100, 200, 400
    expect(delays[0]).toBeGreaterThanOrEqual(85);
    expect(delays[0]).toBeLessThanOrEqual(115);
    expect(delays[1]).toBeGreaterThanOrEqual(170);
    expect(delays[2]).toBeGreaterThanOrEqual(340);
  });
});

describe("isRetryable", () => {
  it("classifies statuses", () => {
    expect(isRetryable(new HttpError(429, ""))).toBe(true);
    expect(isRetryable(new HttpError(502, ""))).toBe(true);
    expect(isRetryable(new HttpError(404, ""))).toBe(false);
    expect(isRetryable(new HttpError(401, ""))).toBe(false);
  });
  it("treats network and timeout errors as retryable", () => {
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
    const abort = new Error("t");
    abort.name = "AbortError";
    expect(isRetryable(abort)).toBe(true);
    expect(isRetryable(new Error("plain"))).toBe(false);
    expect(isRetryable("string")).toBe(false);
  });
});
