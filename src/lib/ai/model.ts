// src/lib/ai/model.ts
// Model ID + per-token rates. Single source of truth for both the
// Anthropic call and cost calculation. Update rates when Anthropic
// publishes pricing changes.

export const AI_MODEL = 'claude-sonnet-4-6' as const;

// Sonnet 4.6 ephemeral (5-minute) prompt-cache rates: writes are 1.25x
// base input; reads are 0.10x base input. Verify against Anthropic
// pricing when input rates change.
export const AI_RATES = {
  inputCentsPerMillion: 300,           // $3.00 per million input tokens
  outputCentsPerMillion: 1500,         // $15.00 per million output tokens
  cacheWriteCentsPerMillion: 375,      // $3.75 per million (1.25x input, 5-min ephemeral)
  cacheReadCentsPerMillion: 30,        // $0.30 per million (0.10x input)
} as const;

export function computeCostCents(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
): number {
  const inputCents = (inputTokens * AI_RATES.inputCentsPerMillion) / 1_000_000;
  const outputCents = (outputTokens * AI_RATES.outputCentsPerMillion) / 1_000_000;
  const cacheWriteCents = (cacheCreationTokens * AI_RATES.cacheWriteCentsPerMillion) / 1_000_000;
  const cacheReadCents = (cacheReadTokens * AI_RATES.cacheReadCentsPerMillion) / 1_000_000;
  return Math.round(inputCents + outputCents + cacheWriteCents + cacheReadCents);
}
