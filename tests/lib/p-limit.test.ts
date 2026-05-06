// tests/lib/p-limit.test.ts
import { describe, it, expect } from 'vitest';
import { pLimit } from '../../src/lib/ai/p-limit';

describe('pLimit', () => {
  it('rejects invalid concurrency', () => {
    expect(() => pLimit(0)).toThrow();
    expect(() => pLimit(-1)).toThrow();
    expect(() => pLimit(1.5)).toThrow();
  });

  it('runs all tasks with concurrency=1 (sequential)', async () => {
    const limit = pLimit(1);
    const order: number[] = [];
    const tasks = [1, 2, 3].map((i) => limit(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(i);
      return i;
    }));
    const results = await Promise.all(tasks);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]); // strict order with concurrency 1
  });

  it('caps in-flight at the configured concurrency', async () => {
    const limit = pLimit(2);
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 8 }).map((_, i) => limit(async () => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return i;
    }));
    await Promise.all(tasks);
    expect(maxInFlight).toBe(2);
  });

  it('propagates errors per-task without affecting siblings', async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => 'ok-1'),
      limit(async () => { throw new Error('boom'); }),
      limit(async () => 'ok-3'),
    ]);
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: 'ok-1' });
    expect(results[1]).toMatchObject({ status: 'rejected' });
    expect(results[2]).toMatchObject({ status: 'fulfilled', value: 'ok-3' });
  });
});
