# Phase 6 — AI subsystem

> **Status:** ⬜ DRAFT — pending user review (2026-05-06, after seven brainstorming rounds)
>
> **Date:** 2026-05-06 (brainstorming round)
> **Branch:** `phase-6-ai-subsystem` off `phase-5-auction-platform-export`
> **Slot:** Between Phase 5 sign-off (2026-05-05) and Phase 7 (Label printing)
> **Trigger:** Phase 3 carry-forward **T-G3**. The largest remaining v1 product surface — per-lot AI generation of title, description, and reference price. Phase 4 already shipped the schedule-config UI surface and the lot status columns; Phase 6 wires up the actual generation pipeline that consumes them.
>
> **Source spec:** This document supersedes `docs/superpowers/specs/2026-04-29-v1-design.md` §9 (banner added 2026-05-06). Where this doc and v1 §9 disagree, this doc wins.

## 1. Goal

Ship a working **per-lot AI generation pipeline** that:

- Generates `title`, `description`, and `price` for a lot from its photos plus operator-entered fields, using **Claude Sonnet 4.6** via the Anthropic TypeScript SDK with the built-in `web_search` tool.
- Runs in three triggers: a **manual button** on the lot detail modal, a **manual "Run Now"** in Settings → AI, and a **scheduled cron** that consumes the existing `system_settings.aiSchedule*` configuration.
- Drains backlogs eagerly (the operator's interval is the idle re-check cadence, not a throttle).
- Tracks **per-month and lifetime cost** via a small set of counters on `system_settings`, surfaced in a new Cost sub-card under Settings → AI.
- Adds a **per-lot processing lock** so the lot detail UI prevents edits while a run is in flight.
- Adds a new **"Needs Info." inventory filter** so operators can find any lot that lacks complete AI output (whether AI never ran, partially failed, or a field was later cleared).

Non-goals:

- Bulk "Run AI on selected" from the inventory bulk action bar (dropped during brainstorming Round 4 — operator can't usefully select lots without title/description visible at the row level; "Run Now" plus the Needs Info. filter cover the use case).
- Re-runs of any kind. AI runs **once per lot** (with one transient-error retry inside that single run). If the operator wants different output, they edit the lot manually.
- Per-lot AI run history. Cost spikes are investigated via the Anthropic billing dashboard.
- Field-level status columns. The single existing `lastAiRunStatus` enum + field-presence checks cover the eligibility and filter needs without per-field schema.
- Model selection by the operator. Sonnet 4.6 is hardcoded as a constant in code; switching to a different model requires editing one constant and deploying.
- AI determination of `condition`, `untested`, or `quantity` — these stay operator-driven.
- A v2 monthly budget cap with hard cutoff. Cost monitoring is informational only in v1.

## 2. Why now

1. **Phase 5 closed the export pipeline.** Customers can now ship lots from this system to AF360, but only if the lots have title / description / price. AI is what populates those fields at scale; without it the system is half-shipped.
2. **All Phase 6 prerequisites are already in place.** Phase 4 shipped the AI Schedule panel (with the `{4, 8, 12, 24}` interval dropdown), the `system_settings.aiSchedule*` columns, and the `lot.lastAiRunStatus` / `lastAiRunError` columns. Phase 3 added the `aiLastRunAt` column on `system_settings`. The infrastructure is sitting there waiting to be consumed.
3. **Format constraints are now stable.** Phase 5 locked the AF360 export columns and their character semantics — Phase 6's prompts and composition rules can be tuned to AF360's actual requirements (≤50 char title, plain-text description) instead of guessing.
4. **Cost is bounded and predictable.** At ~$0.065/lot on Sonnet 4.6 × ~1000 lots/month = ~$65/month — well below "needs hard guardrails" territory for a single-tenant install. Suitable for a "ship it and watch the dashboard" launch.

## 3. Scope

Eight areas. Each is locked from the seven-round brainstorming.

### 3.1 Area A — Schema migration

**Migration `0012_phase_6_ai_subsystem.sql`** — additive on `system_settings`, additive on `lot`, plus a small tightening of `lot.quantity` to remove an app/schema mismatch.

```sql
-- ────────────────────────────────────────────────────────────────────
-- LOT additions
-- ────────────────────────────────────────────────────────────────────

-- Per-lot processing lock. Set to NOW() when the AI runner starts on
-- this lot; set back to NULL on completion (success or failure).
-- A row whose timestamp is older than 5 minutes is treated as stale
-- (crash recovery — see eligibility query in §3.4).
ALTER TABLE lot
  ADD COLUMN ai_processing_started_at timestamptz;

-- Tighten quantity: app layer (api/lots POST + cataloging UI) already
-- defaults to 1, but the schema has been nullable. Backfill any
-- historical nulls (defensive — should be 0 rows in Dev or Prod) and
-- enforce at the DB layer so future import paths can't bypass.
UPDATE lot SET quantity = 1 WHERE quantity IS NULL;
ALTER TABLE lot
  ALTER COLUMN quantity SET DEFAULT 1,
  ALTER COLUMN quantity SET NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- SYSTEM_SETTINGS additions — cost counters + system-level run lock
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE system_settings
  -- Month-to-date cost in cents. Reset by the run handler when it
  -- detects ai_cost_mtd_started_at is in a previous calendar month.
  ADD COLUMN ai_cost_mtd_cents integer NOT NULL DEFAULT 0,
  -- Lifetime cost in cents (denominator-side: never resets).
  ADD COLUMN ai_cost_lifetime_cents bigint NOT NULL DEFAULT 0,
  -- Lifetime count of API calls — incremented by 1 on every run, no
  -- distinction between first-run and re-run. Used as the denominator
  -- for the "Average per lot" display (label is "per lot"; math is
  -- per-call; Round 4 final clarification — most lots have exactly
  -- one call so the label is operator-meaningful).
  ADD COLUMN ai_run_count_lifetime integer NOT NULL DEFAULT 0,
  -- Tracks the calendar month the MTD counter is currently
  -- attributed to. When the run handler observes month(now()) >
  -- month(this), it resets MTD before incrementing.
  ADD COLUMN ai_cost_mtd_started_at timestamptz NOT NULL DEFAULT now(),
  -- System-level single-runner lock. Set to NOW() + 5 min when an
  -- invocation acquires the lock; cleared on completion. Used by the
  -- backlog endpoint (cron + Run Now) to prevent overlap.
  ADD COLUMN ai_run_lock_until timestamptz;
```

**Drizzle schema update** in `db/schema.ts`:
- `lot.aiProcessingStartedAt: timestamp('ai_processing_started_at', { withTimezone: true })`
- `lot.quantity: integer('quantity').notNull().default(1)` (changed from nullable)
- `systemSettings.aiCostMtdCents: integer('ai_cost_mtd_cents').notNull().default(0)`
- `systemSettings.aiCostLifetimeCents: bigint('ai_cost_lifetime_cents', { mode: 'number' }).notNull().default(0)`
- `systemSettings.aiRunCountLifetime: integer('ai_run_count_lifetime').notNull().default(0)`
- `systemSettings.aiCostMtdStartedAt: timestamp('ai_cost_mtd_started_at', { withTimezone: true }).notNull().defaultNow()`
- `systemSettings.aiRunLockUntil: timestamp('ai_run_lock_until', { withTimezone: true })`

**DTO updates** in `shared/types.ts`:
- `LotDTO` gains `aiProcessingStartedAt: string | null`
- `SystemSettingsDTO` gains `aiCostMtdCents`, `aiCostLifetimeCents`, `aiRunCountLifetime`, `aiCostMtdStartedAt`, `aiRunLockUntil`
- `UpdateSystemSettingsRequest` does **not** gain the cost or lock fields — those are managed exclusively by the AI run code, never by user PATCH.

**Apply procedure:** Use `npx tsx scripts/apply-migration.ts supabase/migrations/0012_phase_6_ai_subsystem.sql` against Dev and Test (per the Phase 5 workaround for `drizzle-kit ^0.28` crashing on the existing `state_tuple_consistent` constraint).

### 3.2 Area B — Anthropic client + prompts module

> **Amendment 2026-05-06 (REQ-3, prompt caching):** the static system prompt (SCAFFOLD + RULES) is now passed as a `TextBlockParam` array with `cache_control: { type: 'ephemeral' }`. Cache pricing for Sonnet 4.6 (5-min ephemeral): writes at 1.25x base input ($3.75/M, `cacheWriteCentsPerMillion: 375`); reads at 0.10x base input ($0.30/M, `cacheReadCentsPerMillion: 30`). `computeCostCents` extended with two optional cache-token params (zero-default for backward compat). `AiRunResult` gains `cacheCreationTokens` + `cacheReadTokens`. The first call in a 5-min window pays the cache-write surcharge; subsequent calls pay ~10% of normal input rate for the system-prompt portion. Net break-even is ~3 lots/window; typical drain (≥5 lots) is a clear win.

New folder `src/lib/ai/` (used by both client-shared types and server runner; the actual Anthropic call happens in the server runner only):

#### `src/lib/ai/model.ts`
Single source of truth for the model ID and the per-token rates used for cost calculation.

```ts
// Sonnet 4.6 — chosen as v1 default per Round 4 / Round 7 analysis
// (quality matters more than $50/mo cost difference at this scale).
// Switching models requires editing this file + the rate table + a deploy.
export const AI_MODEL = 'claude-sonnet-4-6';

// Per-million-token rates, USD. Used for cost-cents calculation.
// Update when Anthropic publishes new pricing. Cache rates not used
// in v1 — we don't enable prompt caching yet (revisit if cost spikes).
export const AI_RATES = {
  inputCentsPerMillion: 300,    // $3.00 per million input tokens
  outputCentsPerMillion: 1500,  // $15.00 per million output tokens
} as const;

export function computeCostCents(inputTokens: number, outputTokens: number): number {
  const inputCents = (inputTokens * AI_RATES.inputCentsPerMillion) / 1_000_000;
  const outputCents = (outputTokens * AI_RATES.outputCentsPerMillion) / 1_000_000;
  // Round to nearest cent. Fractional cents accumulate over many runs
  // but the rounding error is bounded by # of runs × $0.005 — trivial.
  return Math.round(inputCents + outputCents);
}
```

#### `src/lib/ai/prompts.ts`
Three independently-editable prompt sections plus the scaffold. **Editing requires a deploy** (Round 5 = Option A locked: TS file in repo). All sections versioned via git for rollback.

```ts
export const SYSTEM_SCAFFOLD = `
You are an expert cataloger of used auction inventory. Your job is to
look at photos of one auction lot and produce three pieces of structured
content: a brand and brief description (used to compose the title), a
description body, and a numeric reference price.

The lot may show one item or several distinct items. Operator-entered
fields are provided as context — do not override them.

You have access to the web_search tool. Use it to look up reference
prices and product identification when the item is identifiable. Do
not search for the operator's own listings or unrelated content.

Return null for any field you cannot determine reliably from the photos
+ operator fields + at most a few web_search calls. The application
will surface partial output for operator review rather than guessing.

You must NOT speculate on tested/untested status — the application
appends an UNTESTED suffix to the description independently when the
operator marks the lot as untested. Do not write "tested" or "untested"
in your description body.
`;

export const TITLE_RULES = `
Brand: extract the brand name (manufacturer / make) if visible. Return
null if no brand can be determined.

Brief description: a 4-8 word summary of what the item is and its
notable features. Examples: "FATMAX Adjustable Wrench Set",
"Ceramic Mixing Bowl 5qt", "Vintage Brass Lamp". Return null if you
cannot describe the item meaningfully.
`;

export const DESCRIPTION_RULES = `
Description body: a single paragraph describing the item, its visible
condition, and any details a buyer would want to know. Keep under
~450 characters to leave room for appended suffixes; the application
hard-truncates to 500 total characters.

Use natural language. Plain text only — no bullet points, no
newlines, no markdown. The word "clothing" may appear naturally if
relevant; the application will append clothing size separately when
applicable.

Multi-item lots: if you see several distinct items, mention this in
the body (e.g., "Lot includes a hammer, two wrenches, and a tape
measure"). Do not override the operator's quantity field.
`;

export const PRICE_RULES = `
Price: numeric reference price in USD, representing best-available
new-condition retail price for the item (or for the most prominent
item in a multi-item lot). Use web_search to find current retail
prices. Return null if you cannot determine a reliable reference price.

Format: a number with up to 2 decimal places (e.g., 120 or 120.00 or
8.99). Do not include the currency symbol.
`;
```

#### `src/lib/ai/anthropic.ts`
Server-only wrapper around the Anthropic SDK. Owns: the SDK client construction, structured-output schema (Zod), per-call timeout, transient-error retry (one shot), token usage extraction, cost calculation. Never imported by client code.

```ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AI_MODEL, computeCostCents } from './model.js';
import { SYSTEM_SCAFFOLD, TITLE_RULES, DESCRIPTION_RULES, PRICE_RULES } from './prompts.js';

// The structured output Claude returns. All fields nullable — the
// application handles null per-field per the composition rules in §3.6.
export const AiOutputSchema = z.object({
  brand: z.string().nullable(),
  brief_description: z.string().nullable(),
  description_body: z.string().nullable(),
  price: z.number().nullable(),
  multi_item_detected: z.boolean(),
});
export type AiOutput = z.infer<typeof AiOutputSchema>;

export type AiRunResult = {
  output: AiOutput;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

const PER_CALL_TIMEOUT_MS = 60_000;

// Photos arrive as signed Supabase Storage URLs (sized 1568px).
// Operator fields arrive shaped as a small object; the prompt
// embeds them as a JSON string in the user message for clarity.
export type AiRunInput = {
  photoUrls: string[];          // up to ~10
  operatorFields: {
    quantity: number;
    specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
    specialNotesText: string | null;
    untested: boolean;
    ref1: string | null;
    ref2: string | null;
  };
};

export async function runAiForLot(input: AiRunInput): Promise<AiRunResult> {
  const userContent = [
    ...input.photoUrls.map((url) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    })),
    {
      type: 'text' as const,
      text: `Operator-entered fields:\n${JSON.stringify(input.operatorFields, null, 2)}`,
    },
  ];

  // One in-flight retry on transient errors (network / 5xx / 429).
  // Permanent errors (400 schema validation, etc.) fail immediately.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await getClient().messages.parse({
        model: AI_MODEL,
        max_tokens: 1500,
        system: SYSTEM_SCAFFOLD + '\n' + TITLE_RULES + '\n' + DESCRIPTION_RULES + '\n' + PRICE_RULES,
        messages: [{ role: 'user', content: userContent }],
        tools: [{ name: 'web_search', type: 'web_search_20250305' }],
        output_config: { format: zodOutputFormat(AiOutputSchema) },
      }, {
        timeout: PER_CALL_TIMEOUT_MS,
      });
      const output = message.parsed_output ?? { brand: null, brief_description: null, description_body: null, price: null, multi_item_detected: false };
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      return {
        output,
        inputTokens,
        outputTokens,
        costCents: computeCostCents(inputTokens, outputTokens),
      };
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt >= 1) throw err;
      // Brief backoff before retry — covers 429 burst windows + 5xx flickers.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

function isTransient(err: unknown): boolean {
  // Anthropic SDK throws APIError subclasses with .status; treat 408/429/5xx as transient.
  // Network errors don't have .status; treat those as transient too.
  const status = (err as { status?: number })?.status;
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
}
```

### 3.3 Area C — Title / description composition rules

**Where it lives:** `src/lib/ai/compose.ts`. Pure functions, no I/O, fully unit-testable. Used by the server runner after the Anthropic call returns.

#### Title composition algorithm

Format (from v1 §9.4, refined in Round 7):
```
$<price>- <quantity>x <brand> <brief description>[ <special note>]
```

Hard cap: **50 characters total**. Quantity is now NOT NULL with default 1 (Area A) — always included.

**Slots and their substitutions when AI returns null:**

| Slot | When AI returns null |
|---|---|
| `<price>` | Render as `$$$` (visible placeholder) |
| `<quantity>` | Always present (DB-enforced post-Area A); rendered as `<n>x ` |
| `<brand>` | Skip the brand chunk entirely |
| `<brief description>` | Skip the brief-description chunk entirely |
| `<special note>` | Append ` TOOL ONLY` or ` READ` only when special-notes selection is TOOL ONLY or READ. Skip for None or CLOTHING. |

**Truncation order when over 50 chars:**
1. Truncate `<brief description>` from the right.
2. If still over, truncate `<brand>` from the right.

Fixed parts (`$<price>- `, `<quantity>x `, ` <SPECIAL_NOTE>`) are never truncated.

**Worked example:**
- Inputs: price=120, quantity=3, brand="Stanley", brief_description="FATMAX 10-Piece Adjustable Wrench Set Heavy-Duty Chrome", special_notes="TOOL ONLY"
- Fixed left: `$120- 3x ` (9 chars)
- Brand: `Stanley ` (8 chars)
- Fixed right: ` TOOL ONLY` (10 chars)
- Available for brief_description: 50 - 9 - 8 - 10 = **23 chars**
- Brief truncated to 23 chars: `FATMAX 10-Piece Adjusta`
- Composed: `$120- 3x Stanley FATMAX 10-Piece Adjusta TOOL ONLY` (50 chars exactly) ✓

**Storage rule for `lot.title`:** Always store the best-effort composed title even when some slots are null/skipped. Only store NULL if literally nothing meaningful can be composed (all of brand, brief_description, AND price are null).

#### Description composition

Format:
```
<AI-generated description body>[ CLOTHING - <size>][ UNTESTED]
```

**Suffix rules:**
- Append ` CLOTHING - <size>` when special-notes selection is CLOTHING **and** the Size field is non-null. Defensive: if Size is null, skip the CLOTHING suffix (defense in depth — UI enforces required-when-CLOTHING, but the suffix appender shouldn't crash).
- Append ` UNTESTED` when the untested checkbox is true.
- Both never co-apply in real-world (clothing has no tested/untested concept) but if both fire defensively, both append.

**Hard length cap: 500 characters total** (body + suffixes). Two-layer enforcement:
1. Prompt soft target (`DESCRIPTION_RULES` instructs AI to keep body under ~450 chars).
2. Hard cap in `compose.ts`: if final composed string exceeds 500 chars, truncate the body from the right (preserving suffixes) and append `…` to mark truncation.

**Storage rule for `lot.description`:** Store composed string when AI returned a non-null, non-empty body. Store NULL when body is null or empty (suffixes alone are not a description).

#### Field-level success determination

After composition, the run handler determines per-field success and the lot-level `lastAiRunStatus`:

| Field | Succeeds when |
|---|---|
| `price` | AI returned a non-null numeric value |
| `title` | AI returned non-null brand AND non-null brief_description AND non-null price |
| `description` | AI returned non-null, non-empty `description_body` |

**Lot-level status:**
- All three fields succeed → `lastAiRunStatus = 'success'`
- All three fields fail → `'failure'`
- Mixed → `'partial'`

**`lastAiRunError`:** populated when status is `'partial'` or `'failure'`. Format: a short comma-separated list of failed fields, e.g. `"price"` or `"title, price"`. (Per-field error detail isn't surfaced in v1 — the operator just needs to know which slots need manual fill.)

### 3.4 Area D — Backlog runner (cron + Run Now)

**One handler, two callers.** The handler does the work; the cron path adds the schedule check, the Run Now path skips it.

#### Endpoint: `POST /api/ai/backlog`

Native `(req, res)` handler. Auth: requires `requireCronAuth` if called via the cron path (Vercel injects the bearer); requires `requireAuth(req, 'admin', 'office')` if called via Run Now (operator-driven). The handler distinguishes via a query param: `?source=cron` for cron, anything else (or absent) for user-driven.

**Per-invocation flow:**

1. **Auth** based on `?source=cron`.
2. **Schedule gate** (cron only): read `system_settings`. If `aiScheduleEnabled = false`, return `{ skipped: true, reason: 'disabled' }`. Otherwise:
   - If `aiDrainInProgress = true` → bypass the schedule check entirely (a drain is open and must continue across heartbeats until empty).
   - Else compute `mostRecentScheduledTime(now, aiScheduleTimeOfDay, aiScheduleIntervalHours)` from the regular grid `timeOfDay + N * intervalHours`. If `aiLastRunAt` is set AND `aiLastRunAt >= mostRecentScheduledTime` → `{ skipped: true, reason: 'too_soon' }` (no scheduled tick has passed since the last completed drain).
   - Otherwise: a scheduled grid time has passed since the last drain — proceed.

   Run Now bypasses the schedule gate entirely.

   > **Amendment 2026-05-06 (Schedule-gate fix):** the gate previously compared `now` vs `aiLastRunAt + intervalHours` — a last-run-anchored heuristic that drifted with each drain and didn't honor the operator's time-of-day anchor. Migration `0013` adds `system_settings.ai_drain_in_progress`; the gate now keys on (a) drain-in-progress for cross-heartbeat continuation and (b) the operator's grid (Round 1 = strict time-of-day anchor) for scheduled kickoff. Helper: `api/_lib/ai-schedule.ts` exposes `mostRecentScheduledTime`. Operator config changes (timeOfDay or intervalHours) take effect on the next heartbeat with no migration logic — the helper recomputes from the current settings each call.

   **Drain-eagerly tail (Round 3, refined):** after processing, the handler re-counts `remaining`. If `remaining = 0`, set `ai_last_run_at = NOW()` AND clear `ai_drain_in_progress`. If `remaining > 0`, leave both as is — the next heartbeat continues the cycle. The bump happens whenever `remaining = 0`, including the no-eligible-lots case, so the operator's schedule actually throttles instead of polling every 15 min.

3. **Acquire system-level lock** atomically:
   ```sql
   UPDATE system_settings
     SET ai_run_lock_until = NOW() + INTERVAL '5 minutes'
     WHERE id = 1
       AND (ai_run_lock_until IS NULL OR ai_run_lock_until < NOW())
     RETURNING ai_run_lock_until;
   ```
   If 0 rows affected → another invocation is running. Return `{ skipped: true, reason: 'in_progress' }` with status 200.

4. **Fetch eligible lots** (up to cap):
   ```sql
   SELECT l.id, l.quantity, l.special_notes_category, l.special_notes_text,
          l.untested, l.ref1, l.ref2
     FROM lot l
    WHERE l.last_ai_run_status IS NULL
      AND l.state IN ('assigned', 'unassigned')
      AND (l.ai_processing_started_at IS NULL
           OR l.ai_processing_started_at < NOW() - INTERVAL '5 minutes')
    ORDER BY l.intake_timestamp ASC
    LIMIT 20;
   ```
   The 5-minute staleness check is the per-lot lock's crash-recovery — if an invocation crashed mid-flight, the lot self-heals on the next pass.

5. **Process with bounded concurrency = 3.** Use a small `pLimit(3)`-style helper (own implementation; no new dependency). For each lot:
   - **Per-lot claim** (atomic): `UPDATE lot SET ai_processing_started_at = NOW() WHERE id = $X AND (ai_processing_started_at IS NULL OR ai_processing_started_at < NOW() - INTERVAL '5 minutes') RETURNING id`. If 0 rows, another invocation grabbed it (shouldn't happen with the system lock, but defense in depth) — skip this lot.
   - **Sign read URLs** for the lot's photos (size 1568 px, `resize: 'contain'`). Use existing `bulkSignReadUrls` from `api/_lib/storage.ts`.
   - **Call `runAiForLot`** with photo URLs + operator fields.
   - **Compose** title and description (Area C).
   - **Atomically update** lot row + system_settings counters in a single transaction:
     ```sql
     BEGIN;
       UPDATE lot SET
         title = $title,
         description = $description,
         price = $price,
         last_ai_run_status = $status,
         last_ai_run_error = $error,
         ai_processing_started_at = NULL,
         updated_at = NOW()
        WHERE id = $lotId;

       -- Reset MTD if calendar month flipped
       UPDATE system_settings SET
         ai_cost_mtd_cents = CASE
           WHEN date_trunc('month', ai_cost_mtd_started_at) < date_trunc('month', NOW())
             THEN $costCents
           ELSE ai_cost_mtd_cents + $costCents
         END,
         ai_cost_mtd_started_at = CASE
           WHEN date_trunc('month', ai_cost_mtd_started_at) < date_trunc('month', NOW())
             THEN NOW()
           ELSE ai_cost_mtd_started_at
         END,
         ai_cost_lifetime_cents = ai_cost_lifetime_cents + $costCents,
         ai_run_count_lifetime = ai_run_count_lifetime + 1,
         updated_at = NOW()
        WHERE id = 1;
     COMMIT;
     ```
   - On failure (Anthropic call threw after the in-flight retry, or compose threw): write `last_ai_run_status = 'failure'`, `last_ai_run_error = err.message.slice(0, 500)`, clear `ai_processing_started_at`. Cost handling: if the thrown error carries usage data (Anthropic SDK surfaces this on `APIError` for some failure modes — e.g., Zod schema validation failure where the model produced billable output), compute cost from it and increment counters as normal. If usage is unavailable (network failure, timeout, 5xx before any output), increment `ai_run_count_lifetime` by 1 with cost = 0. Either way the run counts toward the denominator.

   **Audit trail:** Lot UPDATEs are attributed by source:
   - **Cron-driven runs** (`?source=cron`): lot UPDATEs run as a direct Drizzle write (no `asActor` wrapper) so the audit trigger records `changed_by = NULL`. Correct attribution for system-driven changes.
   - **Run Now (operator-driven):** lot UPDATEs route through `asActor(operatorUserId)` so the audit trigger records the operator who clicked Run Now. This matches how all other operator-driven mutations attribute today.
   - **`system_settings` counter UPDATEs** (both sources): always direct Drizzle write, no `asActor`. The counters are accumulator state, not user-attributable mutations; system_settings has no audit-log relevance for these specific columns.

6. **Release system lock** and return:
   ```sql
   UPDATE system_settings SET ai_run_lock_until = NULL WHERE id = 1;
   ```
   Response shape:
   ```json
   { "processed": 17, "remaining": 23, "errors": 1 }
   ```
   `remaining` is computed by re-counting eligible lots after processing. The Run Now toast surfaces both `processed` and `remaining` so the operator sees whether the cron will catch the rest.

7. **Update `ai_last_run_at` when backlog is empty** (drain-eagerly tail): if `remaining = 0` (regardless of source — cron or Run Now), set `ai_last_run_at = NOW()`. This advances the schedule anchor so the next cron tick does the schedule-gate skip until `intervalHours` have passed. If `remaining > 0`, leave `ai_last_run_at` unchanged so the next 15-min tick re-enters and continues draining.

**Per-Anthropic-call timeout:** 60s (set in `runAiForLot`). Even if every call goes to the timeout, 20 lots × 60s / 3 concurrency = 400s — over the 300s function budget. In practice average is ~28s/lot and 20 lots fit in ~190s. The 60s per-call timeout protects against a single stuck call dragging the whole batch; if that fires often we tune cap or concurrency.

#### Vercel cron config update

`vercel.ts` `crons` array gains:

```ts
{ path: '/api/ai/backlog?source=cron', schedule: '*/15 * * * *' },
```

Rationale for 15 min (Round 3):
- Operator's schedule precision floor = 15 min from intended `timeOfDay`. Adequate for any practical use of this product.
- 4 ticks/hour × 20 lots/cap = 80 lots/hour throughput target.
- Below the noise threshold for logs.

### 3.5 Area E — Manual single-lot run

#### Endpoint: `POST /api/ai/run`

Native `(req, res)`. Auth: `requireAuth(req, 'admin', 'office')` (warehouse cannot trigger AI per v1 spec §2 permission matrix).

Body: `{ "lotId": "<uuid>" }` (Zod validated).

Flow:
1. Verify lot exists, fetch state.
2. **Reject** with 422 `LOT_NOT_ELIGIBLE` if `lastAiRunStatus IS NOT NULL` (no re-runs rule from Round 4) OR if `state NOT IN ('assigned', 'unassigned')`.
3. **Reject** with 423 `LOT_AI_IN_PROGRESS` if `ai_processing_started_at` is non-stale-non-null.
4. **Per-lot claim** (atomic, same shape as the backlog runner).
5. Sign photo URLs + call `runAiForLot` (single lot, not pooled).
6. Compose + atomic update (lot row + system_settings counters, same as backlog).
7. Return the updated lot DTO (so the client can refresh without an extra GET).

This endpoint **does NOT touch the system-level lock**. Single-lot runs are short and operator-driven; if the operator triggers a single-lot run while the backlog runner is mid-flight, both can run simultaneously without contention because they grab different lots via the per-lot lock (the system-lock-holding backlog won't be processing the operator's specific clicked-on lot — and even if it is mid-flight, the per-lot lock prevents collision).

### 3.6 Area F — Lot PATCH lock check

Modify `api/lots/[id].ts` PATCH handler. After fetching `current`, before the update:

```ts
const isAiInFlight =
  current.aiProcessingStartedAt !== null &&
  current.aiProcessingStartedAt > new Date(Date.now() - 5 * 60 * 1000);
if (isAiInFlight && hasFieldEdits) {
  return jsonError(res, 423, 'LOT_AI_IN_PROGRESS', 'AI is currently generating content for this lot');
}
```

Only field edits are blocked — state changes pass through (the operator should still be able to move the lot to `not-sellable` even mid-AI-run). The 5-min staleness check matches the eligibility query so a crashed run doesn't permanently lock the lot.

### 3.7 Area G — UI surface

#### G.1 — Settings → AI section (renamed + restructured)

Current: single "AI schedule" card with enabled / interval / time-of-day controls.

After Phase 6: section renamed to **"AI"** containing two sub-cards:

**Sub-card 1: "Schedule"** — keeps existing controls (enabled / interval / time-of-day) plus new **"Run Now"** button and a **pending-AI badge** (REQ-2, added 2026-05-06). The badge sits to the left of the Run Now / Save buttons and reads `"N lots pending AI"` (singular for N=1). N comes from a new `aiPendingLotCount` field on the GET `/api/system-settings` response, computed server-side as `COUNT(*) FROM lot WHERE last_ai_run_status IS NULL AND state IN ('assigned','unassigned')`. The count is read off the existing `useSystemSettings()` cache — no separate fetch — so it refreshes whenever the settings query is invalidated (after a Run Now completes, after a lot is created/edited, etc.).

Clicking Run Now calls `POST /api/ai/backlog` (no `?source=cron`); on response, shows toast:

| Outcome | Toast |
|---|---|
| `processed > 0, remaining = 0` | `"Processed N lots. Backlog cleared."` (success) |
| `processed > 0, remaining > 0` | `"Processed N lots. M remaining — click Run Now again or wait for the next scheduled run at HH:MM."` (info) |
| `processed = 0, remaining = 0` | `"No lots are pending AI processing."` (info) |
| `skipped: in_progress` | `"AI run already in progress. Try again in a moment."` (warning) |
| HTTP error | `"Could not start AI run: {message}"` (danger) |

The Run Now button is disabled while the request is in flight (button-local pending state, no system-wide polling).

**Sub-card 2: "Cost"** — read-only displays:
- "Month-to-date cost: **${(ai_cost_mtd_cents / 100).toFixed(2)}**"
- "Average per lot: **${(ai_cost_lifetime_cents / ai_run_count_lifetime / 100).toFixed(3)}**" (or "no data yet" if `ai_run_count_lifetime = 0`)

No save/refresh buttons — values reflect what's in the singleton. The Settings page already wraps in `useSystemSettings()` which returns the current row; we just read the new fields off it.

The hooks file (`src/hooks/useSystemSettings.ts`) needs no changes — the DTO update flows through automatically.

#### G.2 — Lot detail modal "Run AI" button

Add a button in the LotDetail modal header (admin/office only, `useRole`-gated). Conditions:

| Condition | Button state |
|---|---|
| `lastAiRunStatus IS NULL` AND state IN ('assigned', 'unassigned') AND not in-flight | Enabled, label `"Run AI"` |
| `lastAiRunStatus IS NOT NULL` (any value) | Hidden — no re-runs |
| State is sold / picked-up / not-sellable | Hidden |
| `aiProcessingStartedAt` non-stale-non-null | Replaced by a banner: `"AI is generating content for this lot. Inputs are read-only until done."` Field inputs disabled. Auto-refetches every 5s while banner is shown so it clears promptly when run completes. |

On click: `POST /api/ai/run` with `{ lotId }`. On response:
- 200 → invalidate `['lot', id]` and `['lots-infinite']` queries; show success toast `"AI run complete: {status}"` (success / partial / failure).
- 422 / 423 / 500 → show error toast with the server's message.

Hook follows the existing `useLotMutations.ts` pattern — same invalidation, same toast wiring, same testing-policy compliance.

#### G.3 — Inventory "Awaiting AI" + "Needs review" filters

> **Amendment 2026-05-06 (REQ-1):** the original single "Needs Info." chip was split into two independent chips. The legacy `?needsInfo=true` query param is preserved server-side as a compatibility union (matches lots in either new bucket).

Two filter chips, each toggled independently via `InventoryFilters.tsx`:

| Chip | `Filters` field | Server query param | SQL clause |
|---|---|---|---|
| **Awaiting AI** | `awaitingAi?: boolean` | `?awaitingAi=true` | `last_ai_run_status IS NULL AND state IN ('assigned','unassigned')` |
| **Needs review** | `needsReview?: boolean` | `?needsReview=true` | `last_ai_run_status IN ('partial','failure') OR (last_ai_run_status IS NOT NULL AND state IN ('assigned','unassigned') AND (title IS NULL OR title = '' OR description IS NULL OR description = '' OR price IS NULL))` |

Both flags active = SQL `OR` of the two clauses (everything needing attention).

**Empty-fields rule.** "Needs review" treats a lot as needing attention if any of `title`, `description`, or `price` is empty AFTER a completed AI run — typically because the operator manually cleared the field. Empty = `NULL` or `''` for text columns; `NULL` only for `price` (the numeric `0` is a valid operator decision, not "missing"). The empty-fields branch is gated by `last_ai_run_status IS NOT NULL` so a status=NULL lot stays exclusively in the Awaiting AI bucket and the two queues remain disjoint.

The state-restriction (`assigned`/`unassigned`) on the empty-fields branch keeps sold/picked-up/not-sellable lots out of the queue — those are conceptually done; cleared fields don't drag them back into review.

**URL handling** in `Inventory.tsx`: `parseFiltersFromUrl` reads both flags from the query string. `writeFiltersToUrl` writes both AND deletes the legacy `?needsInfo` param so old bookmarks resolve cleanly to the new chip set. `activeFilterCount` counts each flag independently.

#### G.4 — `LotDTO` and `useLot` updates

`LotDTO` gains `aiProcessingStartedAt: string | null`. The lot detail modal reads it directly off the existing `useLot` hook return value to drive the banner / button state. No new hook needed.

### 3.8 Area H — Tests, env vars, scripts

#### H.1 Vitest mocks the Anthropic SDK

`tests/helpers/mock-anthropic.ts` (new):
```ts
import { vi } from 'vitest';

// Replaces the runAiForLot function in the anthropic module so tests
// don't touch the network. Tests pass canned outputs.
export function mockAiRunResult(output: Partial<{ brand: string|null; brief_description: string|null; description_body: string|null; price: number|null; multi_item_detected: boolean }>, tokens = { input: 5000, output: 200 }) {
  return {
    output: { brand: null, brief_description: null, description_body: null, price: null, multi_item_detected: false, ...output },
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    costCents: Math.round((tokens.input * 300 + tokens.output * 1500) / 1_000_000),
  };
}

vi.mock('../../src/lib/ai/anthropic', () => ({
  runAiForLot: vi.fn(),
}));
```

Tests opt in to mocking by importing the helper and using `vi.mocked(runAiForLot).mockResolvedValueOnce(mockAiRunResult({...}))` per test case.

#### H.2 New test files

Following Phase 3.5 testing-policy + Phase 5's structure:

- `tests/lib/ai-compose.test.ts` — pure-function unit tests for title composition (truncation, slot skipping, special-note appending, $$$ substitution) and description composition (suffix appending, defensive size-null skip, hard cap with ellipsis).
- `tests/lib/ai-model.test.ts` — `computeCostCents` unit tests (rounding, large/small values).
- `tests/lib/ai-status.test.ts` — field-level success determination + status mapping unit tests.
- `tests/api/ai-run.test.ts` — single-lot endpoint: eligibility (existing status, state filter), per-lot lock acquisition, mock Anthropic call, atomic lot+counter update, error path with status='failure'.
- `tests/api/ai-backlog.test.ts` — backlog endpoint: schedule gate (cron path), Run Now bypass, system-level lock acquisition / refusal / release, eligibility query, cap enforcement, drain-eagerly tail (ai_last_run_at update only when remaining=0), response shape, error attribution.
- `tests/api/lots-id.test.ts` — extension of existing PATCH tests: 423 LOT_AI_IN_PROGRESS rejection when in-flight, state changes still allowed during in-flight (no 423).
- `tests/api/lots.test.ts` — extension of existing GET tests: `?needsInfo=true` filter clause behavior with success / partial / failure / null status combinations and field-null permutations.
- `tests/client/components/Settings.test.tsx` — extension: cost sub-card renders MTD + average correctly with N=0 and N>0; Run Now button disabled while pending; toast variants on each response shape.
- `tests/client/hooks/useAiRun.test.tsx` — new hook test (mutation): invalidation of `['lot', id]` + `['lots-infinite']` after successful run; error toast on 422/423/500.
- `tests/client/components/InventoryFilters.test.tsx` — Needs Info. chip toggles boolean filter; clear-filters resets it.

Total estimated new tests: **~50** (taking the suite from 346 → ~395+).

#### H.3 New script: `scripts/probe-ai.ts`

Real-Anthropic end-to-end probe. Usage: `npm run probe:ai -- --lots 5` — picks N eligible lots from Dev DB, runs the full pipeline against the real API, prints results, exits. Used for prompt tuning during development and as part of manual sign-off.

```ts
// Pseudo-shape:
import 'dotenv/config';
import { runAiForLot } from '../src/lib/ai/anthropic';
import { composeTitle, composeDescription } from '../src/lib/ai/compose';
// ...connect to DB, fetch N lots with last_ai_run_status IS NULL,
// for each: sign photo URLs, run AI, compose, print {input, output, cost}.
// Does NOT write back to the DB by default; --write flag opts in.
```

`package.json` gains: `"probe:ai": "tsx scripts/probe-ai.ts"`.

#### H.4 Env vars

`.env.example` gains:
```
# Anthropic API key — required for the AI subsystem (Phase 6).
# Get from console.anthropic.com → Settings → API Keys.
ANTHROPIC_API_KEY=
```

`.env` and `.env.test` files (not tracked): add `ANTHROPIC_API_KEY` for local dev / probe runs. The vitest suite mocks the SDK so the test-side var is only consumed by the probe script.

`.env.setup` (the user's gitignored credentials registry — already exists per STATE.md) gains the Anthropic key for the env-setup script to propagate.

`scripts/verify-env.ts` and `scripts/env-setup.ts`: extend to recognize `ANTHROPIC_API_KEY` (verify presence; add to `.env` write).

**Vercel project env vars** (manual via Vercel dashboard or `vercel env add ANTHROPIC_API_KEY`): set for production AND preview scopes. No development scope needed (local uses `.env`).

#### H.5 New dependency

```
npm install @anthropic-ai/sdk
```

Single dependency. Per session-start knowledge update, the SDK is current and supports `messages.parse()` + zod helpers + web_search tool.

## 4. Effort estimate

Coarse breakdown by area, single-developer, Sonnet-assisted:

| Area | Estimate | Notes |
|---|---|---|
| A — Schema migration + DTO updates | 0.5 day | Mechanical; uses Phase 5's `apply-migration.ts` workaround. |
| B — Anthropic client + prompts module | 1 day | Most of the time is prompt iteration via `probe:ai`, not code. |
| C — Composition rules | 0.5 day | Pure functions; ~12 unit tests. |
| D — Backlog runner | 1.5 days | Most complex area: lock semantics, drain-eagerly, transaction shape, error attribution. |
| E — Single-lot endpoint | 0.5 day | Smaller surface than D, shares helpers. |
| F — Lot PATCH lock check | 0.25 day | Localized addition. |
| G — UI (Settings + LotDetail + InventoryFilters) | 1.5 days | Three components touched, hooks, toasts, banner with auto-refetch. |
| H — Tests + env wiring + probe script | 1.5 days | ~50 new tests, env-setup integration, probe script. |
| **Total** | **~7 days** | Includes prompt-tuning time via probe runs against real Anthropic. |

Phase 5 estimate was 6.25 days, actual was 2 days because the spec/plan were tight. Phase 6 is comparable in surface (one schema migration + ~3 endpoints + UI work + tests) so 7 days is an upper bound; could come in 3-4.

## 5. Sequencing

1. **Area A** first — schema migration applied to Dev + Test (no app code can compile against the new columns until then).
2. **Areas B + C in parallel** — they depend only on Area A's DTOs and have no internal coupling.
3. **Area D** — requires B + C complete. Deepest area; build test-first to lock the lock semantics.
4. **Area E** — small, follows D and reuses its helpers.
5. **Area F** — small, can land any time after Area A.
6. **Area G** — depends on D + E (the endpoints to call); add a deploy preview check after each component lands.
7. **Area H** — tests run alongside each area as it's built (TDD per Phase 3.5 testing-policy); env wiring + probe script land last.

## 6. Acceptance gate

All must be true before Phase 6 sign-off:

| # | Item |
|---|---|
| 1 | Migration `0012` applied to Dev and Test |
| 2 | Vitest suite green (target: 395+ tests, lint 0/0, build clean) |
| 3 | `ANTHROPIC_API_KEY` present in Vercel production + preview env vars |
| 4 | `vercel.ts` updated with the `*/15 * * * *` cron entry; first deployed cron tick observed in Vercel logs returning 200 with `skipped: too_soon` (or `processed: 0`) |
| 5 | Manual sign-off batch: probe-ai script run against ≥30 real lots in Dev with real Anthropic, output reviewed for quality (titles within 50 chars, descriptions natural language, prices reasonable) |
| 6 | Manual sign-off click-through (deployed preview): |
|   | a. Settings → AI section shows Schedule + Cost sub-cards correctly |
|   | b. Run Now button works, shows correct toast for both `remaining = 0` and `remaining > 0` cases |
|   | c. Lot detail "Run AI" button visible only on eligible lots; runs and updates lot in place |
|   | d. Lot detail "AI generating" banner appears during in-flight run; field inputs disabled; banner clears within 5s of run completion |
|   | e. PATCH on a lot with active in-flight returns 423; UI handles gracefully |
|   | f. Inventory "Needs Info." filter chip toggles correctly; results match the SQL semantics (catches all status≠success AND any field-null cases) |
|   | g. Cost displays update after AI runs |
| 7 | Cron trigger observed in production preview: at least one full eligible-backlog drain completing within reasonable wall time |
| 8 | No "stuck lock" observed: after a deliberate Anthropic 5xx triggered via probe with mock failure, `ai_processing_started_at` and `ai_run_lock_until` clear within 5 minutes |
| 9 | Branch `phase-6-ai-subsystem` ready for promotion to next-phase parent (Phase 7); commits pushed to GitHub |

## 7. Captured decisions (locked during the seven brainstorming rounds)

- **Round 1 — Q1 firing behavior:** Strict time-of-day anchor (Option A). The schedule = pinned to time-of-day clock; interval = spacing between runs.
- **Round 2 — Settings panel restructure:** Renamed "AI" with two sub-cards (Schedule + Model & cost; later "Model" dropped → just "Cost"). MTD displayed; cost computed from token usage + per-model rates table.
- **Round 2 — Cost storage:** Counter-style on `system_settings` (not a per-run history table). Three counters: MTD, lifetime, run count. MTD reset on calendar-month flip.
- **Round 2 — Cost denominator:** Every API call counts; no first-run-only check. Re-runs would have counted separately if they existed (which they don't, post-Round-4).
- **Round 3 — Concurrency:** Bounded parallelism with concurrency = 3. Per-call timeout 60s. Per-invocation cap 20 lots.
- **Round 3 — Schedule semantics:** Drain-eagerly. Operator's interval is the idle re-check cadence, not a throttle. Vercel cron at 15-min intervals; when backlog non-empty, work happens every tick.
- **Round 3 — Single-runner lock:** `ai_run_lock_until` on `system_settings`, 5-min TTL, atomic acquire. UI disables Run Now while a run is in-flight.
- **Round 3 — Bulk action removed:** "Run AI on selected" dropped from inventory bulk action bar (impractical without title/description visible at row level). Run Now + Needs Info. filter cover the use case.
- **Round 3 — Run Now:** New button on Settings → AI Schedule sub-card. Same backlog handler, bypasses schedule gate. Returns `{processed, remaining}`.
- **Round 4 — No re-runs:** AI runs exactly once per lot. One transient-error retry inside the single run handles network/5xx/429 blips. Permanent failure → operator manually fills via Needs Info.
- **Round 4 — Drop field-level status:** Without re-runs, the field-level columns proposed earlier became unnecessary. Single existing `lastAiRunStatus` enum + field-presence checks suffice.
- **Round 4 — Sonnet only:** Model selector dropped. Sonnet 4.6 hardcoded as a constant. `ai_model_used` column on lot also dropped.
- **Round 4 — Per-lot lock:** New `ai_processing_started_at` column on lot. Atomic claim + 5-min staleness self-heal. PATCH returns 423 LOCKED when set; UI shows banner + disables inputs.
- **Round 4 — Needs Info. filter:** New inventory filter on `(status != 'success' OR any-field IS NULL)`. Comprehensive negative filter — both clauses fire in normal cases.
- **Round 5 — Prompts in TS file:** `src/lib/ai/prompts.ts` with three independently-editable rules sections. Deploy required to change. Git-versioned for rollback.
- **Round 6 — API key:** `ANTHROPIC_API_KEY` in Vercel env (production + preview), `.env`, `.env.test`, `.env.example` placeholder.
- **Round 6 — Test strategy:** Vitest mocks the Anthropic SDK (no real API in CI). New `scripts/probe-ai.ts` for end-to-end real-API testing on demand. Manual sign-off batch uses real API at scale.
- **Round 7 — Composition vs. trust:** Compose in code. AI returns `{ brand, brief_description, description_body, price, multi_item_detected }`. App composes title and description per the algorithm in Area C.
- **Round 7 — Title format:** 50-char hard cap. Truncate brief_description first, then brand. Fixed parts (price, quantity, special note) preserved. Best-effort composition when AI returns null on any slot. `$$$` substitutes for null price (visible placeholder); title field still flagged failed.
- **Round 7 — Description format:** AI body + suffixes. CLOTHING suffix only when category=CLOTHING with non-null Size (defensive skip if size missing). UNTESTED suffix when checkbox true. 500-char hard cap with body truncation + `…` ellipsis.
- **Round 7 — Quantity tightening:** Schema enforced NOT NULL DEFAULT 1 in migration 0012. Aligns DB with the long-standing app-layer default.
- **v1 spec deviation, formalized:** v1 §9.4–9.6 is superseded; banner added to v1 spec at the top and inline at §9.

## 8. Open questions / carry-forwards

None blocking sign-off. Items observed but explicitly deferred:

- **Anthropic prompt caching.** Could meaningfully cut input-token cost on repeated runs that share the system prompt. v2 optimization; not worth the complexity until cost actually pressures.
- **Per-call cost variability monitoring.** No real-time alerting if cost-per-lot exceeds e.g. 2× expected. Operator notices via the MTD display + Anthropic dashboard. v2 if it becomes a problem.
- **Tiered model selection** (Round 1 Option C — fall back to Sonnet only when Haiku self-reports low confidence). Considered and rejected for v1; revisit if cost ever becomes a concern.
- **Multi-platform prompts** (per-customer prompt variants). v2 if multiple customers with different cataloging conventions onboard.
- **AI-driven `condition` enum population.** v1 has only `'used'`. When the enum expands post-v1, Phase 6's prompt + composition will need a corresponding extension.
- **Real-time Run Now progress UI.** Currently the button greys out during the ~190s invocation; no progress bar. If operators find the wait painful in practice, add a polling-based "X of Y processed" indicator. Not v1.
