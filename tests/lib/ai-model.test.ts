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
});
