// src/lib/ai/anthropic.ts
// Server-only Anthropic SDK wrapper. Owns: client construction,
// structured-output schema, per-call timeout, transient-error retry,
// token usage extraction, cost calculation. Never imported by client.
//
// Uses the direct @anthropic-ai/sdk on purpose — not @ai-sdk/anthropic
// or ai-gateway. This app is locked to a single Anthropic model
// (Sonnet 4.6) with bespoke web_search + ephemeral prompt caching;
// AI Gateway adds latency and a dependency without unlocking value here.

import Anthropic from '@anthropic-ai/sdk';
// Anthropic SDK 0.95+'s zodOutputFormat helper imports `zod/v4` and calls
// `z.toJSONSchema()` (a Zod 4 API that accesses `schema.def`). We must
// hand it a Zod 4 schema or the SDK crashes with "Cannot read properties
// of undefined reading 'def'". Importing from `zod/v4` (available in
// 3.25+) gives us the Zod 4 API for this file only — the rest of the
// codebase keeps `import { z } from 'zod'` (Zod 3) unchanged.
import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AI_MODEL, computeCostCents } from './model.js';
import { SYSTEM_SCAFFOLD, TITLE_RULES, DESCRIPTION_RULES, PRICE_RULES } from './prompts.js';

export const AiOutputSchema = z.object({
  brand: z.string().nullable(),
  brief_description: z.string().nullable(),
  description_body: z.string().nullable(),
  price: z.number().nullable(),
  multi_item_detected: z.boolean(),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

export type AiRunInput = {
  photoUrls: string[];
  operatorFields: {
    quantity: number;
    specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
    specialNotesText: string | null;
    untested: boolean;
    ref1: string | null;
    ref2: string | null;
  };
};

export type AiRunResult = {
  output: AiOutput;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costCents: number;
};

// 180s gives web_search-heavy lots room to finish on the first try. The
// previous 60s was too tight: legitimate calls timed out, our outer retry
// kicked in, and the second attempt typically succeeded after 60-135s — net
// double token cost for no information gain. Forensic data from the 6-lot
// drain on 2026-05-08 (see scripts/inspect-ai-run.ts output) showed three
// of six lots took 127-197s end-to-end, all retry-induced.
const PER_CALL_TIMEOUT_MS = 180_000;
const RETRY_BACKOFF_MS = 1_500;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  // maxRetries: 0 disables the SDK's internal retry (default 2) so it can't
  // compound with our outer retry below. With both layers active a single
  // 5xx on the Anthropic side could produce 6 HTTP attempts; we only want 2.
  _client = new Anthropic({ apiKey, maxRetries: 0 });
  return _client;
}

export async function runAiForLot(input: AiRunInput): Promise<AiRunResult> {
  const userContent: Anthropic.MessageParam['content'] = [
    ...input.photoUrls.map((url) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    })),
    {
      type: 'text' as const,
      text: `Operator-entered fields:\n${JSON.stringify(input.operatorFields, null, 2)}`,
    },
  ];

  // First attempt + one retry on transient errors. The catch block always
  // throws (immediately on non-transient or after second attempt), so the
  // loop never falls through.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await getClient().messages.parse({
        model: AI_MODEL,
        max_tokens: 1500,
        // System prompt marked ephemeral-cacheable. The static SCAFFOLD +
        // RULES block is identical across runs, so subsequent calls within
        // the cache TTL pay ~10% input rate for these tokens.
        system: [{
          type: 'text',
          text: SYSTEM_SCAFFOLD + '\n' + TITLE_RULES + '\n' + DESCRIPTION_RULES + '\n' + PRICE_RULES,
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{ role: 'user', content: userContent }],
        tools: [{ name: 'web_search', type: 'web_search_20250305' }],
        // SDK 0.95's zodOutputFormat .d.ts types its arg as Zod 3
        // (`ZodType` from 'zod'), but the runtime imports `zod/v4` and
        // calls Zod 4 APIs on the schema. We import Zod 4 above to
        // match the runtime; the cast bridges the type system to
        // satisfy the .d.ts. Drop the cast when the SDK ships Zod 4
        // types upstream.
        output_config: { format: zodOutputFormat(AiOutputSchema as unknown as Parameters<typeof zodOutputFormat>[0]) },
      }, {
        timeout: PER_CALL_TIMEOUT_MS,
      });
      const output = message.parsed_output ?? {
        brand: null, brief_description: null, description_body: null, price: null, multi_item_detected: false,
      };
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const cacheCreationTokens = message.usage.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = message.usage.cache_read_input_tokens ?? 0;
      return {
        output,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        costCents: computeCostCents(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens),
      };
    } catch (err) {
      // Don't retry on our own 180s timeout: a slow call won't be faster on
      // retry, just doubles token cost. Reserve the retry for genuine
      // transient infrastructure errors (5xx/429/408 — see isTransient).
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw err;
      if (!isTransient(err) || attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }
  }
  // Unreachable — every loop iteration either returns or throws.
  throw new Error('runAiForLot: retry loop exited without resolution');
}

export function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === undefined) return true; // network errors etc.
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Extract usage from a thrown error if the SDK surfaced it
 * (e.g., zod validation failure where the model still produced billable output).
 * Returns zero-zero if not available.
 */
export function tryExtractUsageFromError(err: unknown): { inputTokens: number; outputTokens: number } {
  const usage = (err as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  return {
    inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
    outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
  };
}
