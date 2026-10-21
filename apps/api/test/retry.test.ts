import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, retry, type RetryOptions } from '../src/downstream/retry.js';
import { DownstreamError } from '../src/errors.js';

const noSleep = () => Promise.resolve();

function options(overrides: Partial<RetryOptions> = {}): RetryOptions {
  return { retries: 2, baseDelayMs: 100, maxDelayMs: 1000, shouldRetry: () => true, sleep: noSleep, ...overrides };
}

describe('backoffDelay', () => {
  it('grows the ceiling exponentially', () => {
    const max = () => 0.999999;
    expect(backoffDelay(0, 100, 10_000, max)).toBe(99);
    expect(backoffDelay(1, 100, 10_000, max)).toBe(199);
    expect(backoffDelay(3, 100, 10_000, max)).toBe(799);
  });

  it('never exceeds maxDelayMs', () => {
    expect(backoffDelay(20, 100, 1000, () => 0.999999)).toBeLessThan(1000);
  });

  it('is jittered between 0 and the ceiling', () => {
    expect(backoffDelay(2, 100, 1000, () => 0)).toBe(0);
    expect(backoffDelay(2, 100, 1000, () => 0.5)).toBe(200);
  });
});

describe('retry', () => {
  it('returns the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retry(fn, options())).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValue('ok');
    await expect(retry(fn, options())).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([0, 1, 2]);
  });

  it('gives up after `retries` retries and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(retry(fn, options({ retries: 2 }))).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry errors shouldRetry rejects', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad request'));
    await expect(retry(fn, options({ shouldRetry: () => false }))).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sleeps the backoff delay between attempts and reports each retry', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await retry(fn, options({ sleep, onRetry, random: () => 0.5 })).catch(() => {});
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([50, 100]);
    expect(onRetry.mock.calls.map((c) => c[0].attempt)).toEqual([1, 2]);
  });

  it('with retries=0 makes exactly one attempt', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await expect(retry(fn, options({ retries: 0 }))).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('DownstreamError.retryable', () => {
  it.each([
    ['timeout', undefined, true],
    ['network_error', undefined, true],
    ['http_error', 500, true],
    ['http_error', 503, true],
    ['http_error', 429, true],
    ['http_error', 400, false],
    ['http_error', 409, false],
  ] as const)('%s %s -> %s', (failure, status, expected) => {
    expect(new DownstreamError(failure, status).retryable).toBe(expected);
  });
});
