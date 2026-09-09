// Retry with exponential backoff. Used for uploads and vendor calls that
// fail for transient reasons (flaky wifi, a 503, a rate limit).

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return RETRYABLE_STATUSES.has(err.status);
  // fetch throws TypeError on network failure; AbortError on timeout
  if (err instanceof Error) return err.name === "TypeError" || err.name === "AbortError";
  return false;
}

export type RetryOptions = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  shouldRetry?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseMs = opts.baseMs ?? 800;
  const maxMs = opts.maxMs ?? 8000;
  const shouldRetry = opts.shouldRetry ?? isRetryable;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !shouldRetry(err)) throw err;
      const jitter = Math.random() * 0.3 + 0.85; // 0.85x to 1.15x
      const delay = Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * jitter;
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
