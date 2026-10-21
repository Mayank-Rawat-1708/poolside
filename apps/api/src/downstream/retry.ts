// Bounded retries with "full jitter" exponential backoff:
//   delay = random(0, min(maxDelay, baseDelay * 2^attempt))
// Jitter spreads retries out so clients that failed together don't retry
// together; the bound keeps a struggling dependency from being hammered.

export interface RetryOptions {
  retries: number; // retries after the first attempt (2 => at most 3 attempts)
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; err: unknown }) => void;
  // Injectable for tests.
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, random = Math.random): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export async function retry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || !opts.shouldRetry(err)) throw err;
      const delayMs = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.random);
      opts.onRetry?.({ attempt: attempt + 1, delayMs, err });
      await sleep(delayMs);
    }
  }
}
