// src/lib/ai/model.ts
// Model ID + per-token rates. Single source of truth for both the
// Anthropic call and cost calculation. Update rates when Anthropic
// publishes pricing changes.

export const AI_MODEL = 'claude-sonnet-4-6';

export const AI_RATES = {
  inputCentsPerMillion: 300,    // $3.00 per million input tokens
  outputCentsPerMillion: 1500,  // $15.00 per million output tokens
} as const;

export function computeCostCents(inputTokens: number, outputTokens: number): number {
  const inputCents = (inputTokens * AI_RATES.inputCentsPerMillion) / 1_000_000;
  const outputCents = (outputTokens * AI_RATES.outputCentsPerMillion) / 1_000_000;
  return Math.round(inputCents + outputCents);
}
