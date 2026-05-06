// tests/lib/ai-model.test.ts
import { describe, it, expect } from 'vitest';
import { computeCostCents } from '../../src/lib/ai/model';

describe('computeCostCents', () => {
  it('returns 0 for 0 tokens', () => {
    expect(computeCostCents(0, 0)).toBe(0);
  });

  it('rounds to nearest cent for typical lot run (~5000 in, ~200 out)', () => {
    // 5000 * 300 / 1M = 1.5 cents, 200 * 1500 / 1M = 0.3 cents → 1.8 → 2
    expect(computeCostCents(5000, 200)).toBe(2);
  });

  it('rounds to nearest cent (round-half-away-from-zero per Math.round)', () => {
    // 1666 * 300 / 1M = 0.4998 → rounds down to 0
    expect(computeCostCents(1666, 0)).toBe(0);
    // 1667 * 300 / 1M = 0.5001 → rounds up to 1
    expect(computeCostCents(1667, 0)).toBe(1);
  });

  it('handles a 20-lot batch worst-case (heavy vision input)', () => {
    // 20000 input tokens (10 photos at ~1.6k + prompt overhead) + 500 output
    // = 20000 * 300 / 1M + 500 * 1500 / 1M = 6 + 0.75 = 6.75 → 7
    expect(computeCostCents(20000, 500)).toBe(7);
  });

  it('handles million-token edge', () => {
    // 1M input + 1M output = 300 + 1500 = 1800 cents = $18
    expect(computeCostCents(1_000_000, 1_000_000)).toBe(1800);
  });

  it('charges cache writes at 1.25x input rate', () => {
    // 1M cache_creation tokens at 375 cents/M = 375 cents
    expect(computeCostCents(0, 0, 1_000_000, 0)).toBe(375);
  });

  it('charges cache reads at 0.10x input rate', () => {
    // 1M cache_read tokens at 30 cents/M = 30 cents
    expect(computeCostCents(0, 0, 0, 1_000_000)).toBe(30);
  });

  it('combines uncached input + cache read for a typical post-cache-warm call', () => {
    // First call wrote ~3000 tokens of system prompt to cache.
    // Second call: input_tokens=200 (user content only), cache_read=3000, output=200.
    // 200 * 300 / 1M = 0.06, 3000 * 30 / 1M = 0.09, 200 * 1500 / 1M = 0.30 → 0.45 → 0
    expect(computeCostCents(200, 200, 0, 3000)).toBe(0);
    // Verified savings vs uncached equivalent:
    // 3200 * 300 / 1M + 200 * 1500 / 1M = 0.96 + 0.30 = 1.26 → 1
    expect(computeCostCents(3200, 200)).toBe(1);
  });

  it('charges cache write on the cache-creating call', () => {
    // First-ever call: input_tokens=200, cache_creation=3000, output=200.
    // 200 * 300 / 1M = 0.06, 3000 * 375 / 1M = 1.125, 200 * 1500 / 1M = 0.30 → 1.485 → 1
    expect(computeCostCents(200, 200, 3000, 0)).toBe(1);
  });

  it('omitted cache args default to zero (backward compat)', () => {
    expect(computeCostCents(5000, 200)).toBe(computeCostCents(5000, 200, 0, 0));
  });
});
