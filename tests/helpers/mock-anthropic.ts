// tests/helpers/mock-anthropic.ts
// Vitest mock for src/lib/ai/anthropic. Tests opt in via vi.mock; this
// helper builds canned AiRunResult objects with sane defaults.

import { vi } from 'vitest';
import type { AiRunResult, AiOutput } from '../../src/lib/ai/anthropic';
import { computeCostCents } from '../../src/lib/ai/model';

export type MockTokens = {
  input: number;
  output: number;
  cacheCreation?: number;
  cacheRead?: number;
};
const DEFAULT_TOKENS: MockTokens = { input: 5000, output: 200 };

export function mockAiRunResult(
  overrides: Partial<AiOutput>,
  tokens: MockTokens = DEFAULT_TOKENS,
): AiRunResult {
  const output: AiOutput = {
    brand: null,
    brief_description: null,
    description_body: null,
    price: null,
    multi_item_detected: false,
    ...overrides,
  };
  const cacheCreationTokens = tokens.cacheCreation ?? 0;
  const cacheReadTokens = tokens.cacheRead ?? 0;
  return {
    output,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheCreationTokens,
    cacheReadTokens,
    costCents: computeCostCents(tokens.input, tokens.output, cacheCreationTokens, cacheReadTokens),
  };
}

// Default success fixture used in many tests.
export const SUCCESS_FIXTURE = mockAiRunResult({
  brand: 'Stanley',
  brief_description: 'FATMAX Adjustable Wrench Set',
  description_body: 'Heavy-duty adjustable wrench set in original case.',
  price: 120,
  multi_item_detected: false,
});

// Convenience: invoke at top of a test file.
//   import { installAnthropicMock } from '../helpers/mock-anthropic';
//   installAnthropicMock();
//
// Uses the `@/` Vite alias (configured in vitest.config.ts → resolve.alias)
// so this works from any test file regardless of nesting depth.
export function installAnthropicMock() {
  vi.mock('@/lib/ai/anthropic', () => ({
    runAiForLot: vi.fn(),
    isTransient: (err: unknown) => {
      const status = (err as { status?: number })?.status;
      if (status === undefined) return true;
      return status === 408 || status === 429 || status >= 500;
    },
    tryExtractUsageFromError: () => ({ inputTokens: 0, outputTokens: 0 }),
    AiOutputSchema: undefined as unknown,
  }));
}
