import { describe, expect, it } from 'vitest';
import { isPoolTimeout } from '../src/db/instrumented-pool.js';

describe('isPoolTimeout', () => {
  it('recognises both of pg-pool\'s timeout messages', () => {
    expect(isPoolTimeout(new Error('timeout exceeded when trying to connect'))).toBe(true);
    // Seen on a cold CI runner while the pool was opening new connections.
    expect(isPoolTimeout(new Error('Connection terminated due to connection timeout: Connection terminated unexpectedly'))).toBe(true);
  });

  it('leaves other connection errors alone', () => {
    expect(isPoolTimeout(new Error('getaddrinfo ENOTFOUND postgres'))).toBe(false);
    expect(isPoolTimeout(new Error('connect ECONNREFUSED 127.0.0.1:5432'))).toBe(false);
    expect(isPoolTimeout('timeout exceeded when trying to connect')).toBe(false);
  });
});
