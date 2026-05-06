// src/lib/ai/p-limit.ts
// Minimal in-house concurrency limiter — avoids adding the p-limit
// npm dep for ~30 lines of logic. Returns a function that wraps any
// async producer; at most `concurrency` produced promises are in flight.

export type LimitedRunner = <T>(fn: () => Promise<T>) => Promise<T>;

export function pLimit(concurrency: number): LimitedRunner {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('pLimit: concurrency must be a positive integer');
  }
  let inFlight = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (inFlight >= concurrency) return;
    const resolve = queue.shift();
    if (!resolve) return;
    inFlight++;
    resolve();
  };

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await fn();
    } finally {
      inFlight--;
      next();
    }
  };
}
