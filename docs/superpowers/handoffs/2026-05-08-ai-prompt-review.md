# AI prompt + context review

> Created 2026-05-08. Snapshot of the full prompt and user-message
> shape that gets sent to Anthropic on every AI run, plus notes on what
> the call carries and where to add more context if you want it.
>
> Source of truth lives in `src/lib/ai/prompts.ts`. This file is a
> read-only review companion — edits made here aren't picked up by the
> running app.

## Anthropic call shape

The server makes one `messages.parse` call per lot via [`runAiForLot`](../../../src/lib/ai/anthropic.ts):

| Field | Value |
|---|---|
| `model` | `claude-sonnet-4-6` |
| `max_tokens` | `1500` |
| `system` | A single text block (concatenation of the four sections below), marked `cache_control: { type: 'ephemeral' }` so subsequent calls within ~5 min reuse it at ~10% input rate. |
| `messages` | A single user message with the photos as `image` blocks (signed Supabase Storage URLs, transformed to 1568px wide, quality 80) followed by a text block containing operator-entered fields as JSON. |
| `tools` | `[{ name: 'web_search', type: 'web_search_20250305' }]` — Anthropic's hosted web-search tool. |
| `output_config.format` | Zod schema enforcing the four-field structured output (see "Expected output" below). |
| Per-call timeout | 60 seconds. One transient-error retry (network / 429 / 5xx) per run. |

---

## System prompt (concatenated, exactly as sent)

The four sections below are concatenated with `\n` separators and sent as the `system` text block. The whole thing is what gets cache-stored.

### Section 1 — `SYSTEM_SCAFFOLD`

```text
You are an expert cataloger of used auction inventory. Your job is to
look at photos of one auction lot and produce four pieces of structured
content: a brand, a brief description (together used to compose the
title), a description body, and a numeric reference price.

A lot may contain one item or several distinct items. Some photos
exist to document damage, wear, accessories, or other characteristics
the bidder should be able to see — you don't have to enumerate every
observation in the title or description. Pick what a buyer would
materially want to know.

ALWAYS produce a usable brief_description and description_body, even
if specific identifiers (brand, model, size) aren't determinable. A
generic but accurate label ("Wooden Side Table", "Adjustable Wrench
Set") is better than null. brand and price may be null when no basis
exists; brief_description and description_body should not be.

NEVER fabricate facts. Brand names, model numbers, sizes, materials,
and capacities should only appear in your output when they're plainly
visible in the photos or stated in the operator fields. If a fact
isn't there, omit it rather than guess. Setting brand to null is the
right move when no manufacturer mark is visible.

Keep your output simple and neutral. No marketing language, no
embellishments, no commentary on quality or value, no opinions on
condition beyond plainly visible facts.

You have access to the web_search tool. Use it to identify items and
look up retail reference prices when the item is identifiable. Do
not search for the operator's own listings or unrelated content.

Operator-entered context (provided in the user message as JSON) — do
not override these values, do not include them verbatim in your
output unless the same fact is also visible in the photos:
  - quantity: number of distinct items in the lot. The operator has
    counted these; reflect the count naturally if it's > 1 (e.g.,
    "Set of 4 ceramic bowls") but don't restate the raw number.
  - specialNotesCategory: one of None / TOOL ONLY / READ / CLOTHING.
    The application will append a TOOL ONLY or READ suffix to the
    title automatically when those are set, and append a clothing
    size to the description for CLOTHING. Do not write these labels
    yourself.
  - specialNotesText: free-form notes from the operator. May include
    information not visible in the photos.
  - untested: when true, the operator could not verify the item
    works. The application appends an UNTESTED suffix to the
    description independently. Do NOT write "tested" or "untested"
    in your description body.
  - ref1, ref2: free-form reference info captured by the operator —
    often packaging text, model numbers, or brand marks they noted.
    Use these to inform brand/model identification when they
    correspond to visible details.
```

### Section 2 — `TITLE_RULES`

```text
brand: extract the brand name (manufacturer / make) only if it's
clearly visible on the item, its packaging, or stated by the
operator's reference fields when those correspond to visible marks.
Return null if no brand mark is visible. Do not infer brand from
appearance, style, or quality.

brief_description: a 4-8 word noun-phrase summary of what the item
is. ALWAYS provide one. Examples:
  - With brand: "FATMAX Adjustable Wrench Set"
  - Without brand: "Adjustable Wrench Set", "Ceramic Mixing Bowl 5qt",
    "Wooden Side Table", "Vintage Brass Lamp", "Glass Decanter"
Use plain, neutral nouns. Avoid superlatives ("premium", "luxury",
"high-quality") unless the brand explicitly markets that way and the
phrasing is on the packaging.
```

### Section 3 — `DESCRIPTION_RULES`

```text
description_body: a single short paragraph describing the item.
ALWAYS provide one. Plain text only — no bullet points, no newlines,
no markdown.

Cover what a buyer materially needs to know: what the item is, key
visible features, intended use if not obvious, and a brief overall
condition note if condition is materially different from "used,
fair." Do not enumerate every flaw shown in photos — the photos
themselves serve that purpose.

Avoid marketing language ("beautiful", "stunning", "high-quality"),
value commentary ("a great deal", "worth more than"), and opinions on
desirability. State facts.

Multi-item lots: when you see several distinct items, list them in
the body (e.g., "Lot includes a hammer, two wrenches, and a tape
measure"). Do not override the operator's quantity field.

Keep under ~450 characters; the application hard-truncates to 500
total characters to leave room for any operator suffix.
```

### Section 4 — `PRICE_RULES`

```text
price: a numeric reference price in USD representing the best-
available NEW-condition retail price for the item (or for the most
prominent item in a multi-item lot). This is a reference for bidders
— it does not need to match the operator's start bid.

Use web_search to find current retail prices when the item or a
close equivalent is identifiable. If the specific model isn't
identifiable but the item category is clear, fall back to a
typical retail price for items of that general category.

Return null only when even a category-level estimate isn't
defensible (e.g., the photos are unclear or the item type is
ambiguous). Don't fabricate exact model prices — a rough
category-typical price is better than no value, but no value is
better than an invented one.

Format: a number with up to 2 decimal places (e.g., 120 or 120.00
or 8.99). Do not include the currency symbol.
```

---

## User message structure (per lot)

Built in [`runAiForLot`](../../../src/lib/ai/anthropic.ts) as a single user message containing N+1 content blocks:

1. **N image blocks** — one per uploaded photo, in display order:
   ```ts
   { type: 'image', source: { type: 'url', url: '<signed Supabase URL>' } }
   ```
   Photos are signed at runtime against the `lot-photos` bucket with `transform: { width: 1568, quality: 80, resize: 'contain' }` so Anthropic receives a normalized image regardless of capture device.

2. **1 text block with operator-entered fields**:
   ```ts
   {
     type: 'text',
     text: 'Operator-entered fields:\n' + JSON.stringify(input.operatorFields, null, 2)
   }
   ```
   Where `operatorFields` is shaped:
   ```ts
   {
     quantity: number,                                                       // 1, 2, 3, ...
     specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING',
     specialNotesText: string | null,
     untested: boolean,
     ref1: string | null,
     ref2: string | null
   }
   ```

Example user-message text block:
```text
Operator-entered fields:
{
  "quantity": 4,
  "specialNotesCategory": "TOOL ONLY",
  "specialNotesText": "Box has Stanley logo on top",
  "untested": false,
  "ref1": "Model #4500",
  "ref2": null
}
```

---

## Expected output

Strict structured output (Anthropic's structured-output feature, enforced via Zod):

```ts
{
  brand: string | null,
  brief_description: string | null,
  description_body: string | null,
  price: number | null,
  multi_item_detected: boolean,
}
```

Per the prompt rules:
- `brand` and `price` may be null when no basis exists.
- `brief_description` and `description_body` should always be filled with at least a generic accurate value.
- `multi_item_detected` is informational; the operator's `quantity` is the source of truth for the count.

The application then composes this into the final lot fields:
- **Title** (≤50 chars): `$<price>- <quantity>x <brand> <brief_description>` with TOOL ONLY / READ suffix from operator. Truncates `brief_description` first, then `brand` if needed. `$$$` substituted when price is null.
- **Description** (≤500 chars): `<description_body>` plus operator suffixes — clothing size, untested marker, special-notes text.
- **Price column**: numeric copy of the AI's `price` value.

If the AI returns null where a value was expected, [`mapStatus`](../../../src/lib/ai/compose.ts) sets `lastAiRunStatus` to `'partial'` (some fields null) or `'failure'` (all of brand / brief / body / price null). Those lots show up in the **Needs review** filter for operator follow-up.

---

## What changed in this revision (vs the version that was deployed before today)

| Behavior | Before | After |
|---|---|---|
| Default for ambiguous fields | Return null when uncertain | Best-effort; null only for brand/price when no basis exists |
| Title without brand | Could be null | Always a generic noun-phrase ("Adjustable Wrench Set") |
| Description body without brand | Could be null | Always a short paragraph describing what the item is |
| Damage photos | Implicit "describe details" could lead to enumeration | Explicit: photos serve that purpose, don't enumerate every flaw |
| Marketing/commentary language | Not addressed | Explicitly prohibited |
| Operator field semantics | JSON dumped in user message with no glossary | Each field's meaning + how the app uses it explained in SYSTEM_SCAFFOLD |
| Brand fabrication | "Return null if no brand can be determined" | Strengthened to "NEVER fabricate. Don't infer brand from style or quality." |

---

## Open questions for the review

These are the items you flagged for discussion #2 and #3:

### Context (item #2 — what else could we send?)

Today the AI sees: photos + operator fields (quantity / special-notes category + text / untested / ref1 / ref2). Possible additions, with tradeoffs:

| Candidate | Why it might help | Why it might hurt |
|---|---|---|
| **Customer name** | Anchors industry context — "Smith Estate" implies general residential, "ABC Tool Liquidators" implies tool-heavy lots. AI could lean into that for ambiguous items. | Could bias output (e.g., classify a generic wrench as a tool-brand wrench because the customer sells tools). |
| **Job number / job context** | Almost no signal. Job numbers are operator-formatted strings. | Adds tokens for negligible gain. |
| **Photo capture order** | The first photo is usually the "main" view; later photos often show damage, scale, or accessories. Telling the AI which photo is primary could focus the title on it. | Operators don't always shoot in a deliberate order. May not be reliable signal. |
| **Other lots in the same job** | Consistency — if the operator has been cataloging tools all session, this lot is probably also a tool. | Significant token cost; complex to wire up. |
| **Operator-entered title/desc/price** (when partial) | Lets AI fill only the gaps and respect operator's wording. | Status-aware finalize already preserves operator entries; AI doesn't need to know about them server-side. |

My recommendation: add **customer name** as a single line of context in the user message. Cheap, occasionally informative, low risk if the AI is told to use it as a hint not a directive. Skip the rest unless you have a specific scenario in mind.

### Training (item #3 — how to improve over time)

Anthropic's API doesn't allow fine-tuning. Improvement paths available to us:

1. **Iterate on prompts.** What you're doing now. Cheap, fast.
2. **Few-shot examples in the prompt.** Embed 2–3 example lots (operator fields → AI output) directly in the system prompt. Gives the AI concrete patterns to mimic. Adds tokens but cache-stored so the per-call cost is tiny.
3. **Feedback capture.** When operators edit AI-generated values in the lot detail modal, log the before/after so we can spot systematic biases (e.g., "AI always overestimates price by 30% on power tools"). Use as input for prompt refinement.
4. **A/B per-prompt variant.** Run two prompt variants in parallel for a week, compare operator edit rates. Heavyweight; premature.

My recommendation: start with (1) — your own iteration on the current prompts as you observe results from the probe-ai run and the click-through tests. Add (2) after you've identified 3–5 representative lot types where the AI consistently struggles. Defer (3) until production volume justifies the wiring.

---

## File paths

- **Editable source of truth** for the prompts: [`src/lib/ai/prompts.ts`](../../../src/lib/ai/prompts.ts)
- **Anthropic call assembler** (where the system prompt is concatenated and the user message is built): [`src/lib/ai/anthropic.ts`](../../../src/lib/ai/anthropic.ts)
- **Composition rules** (how AI output → title/description columns): [`src/lib/ai/compose.ts`](../../../src/lib/ai/compose.ts)
- **Status mapping** (how nulls/values → `lastAiRunStatus`): same file, `mapStatus` + `determineFieldStatus`
- **This review file**: `docs/superpowers/handoffs/2026-05-08-ai-prompt-review.md`
