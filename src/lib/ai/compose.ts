// src/lib/ai/compose.ts
// Pure composition functions for AI output. No I/O. Used by the AI
// run code path after Anthropic responds.

import type { LotDTO } from '../../../shared/types';

const TITLE_MAX_CHARS = 50;
const DESCRIPTION_MAX_CHARS = 500;
const ELLIPSIS = '…';

export type TitleComposeInput = {
  brand: string | null;
  briefDescription: string | null;
  price: number | null;
  quantity: number; // NOT NULL post-migration 0012; default 1
  specialNotesCategory: LotDTO['specialNotesCategory'];
};

/**
 * Composes the lot title per the format spec:
 *   $<price>- <quantity>x <brand> <brief description>[ <special note>]
 *
 * Hard cap: 50 chars total.
 *
 * Truncation order when over: brief_description first, then brand.
 * Fixed parts (price chunk, quantity chunk, special-note suffix) are
 * never truncated. When AI returns null for a slot, that slot is
 * skipped (or in price's case, substituted with $$$).
 *
 * Returns null only when literally nothing meaningful can be composed
 * (all of brand, briefDescription, AND price are null).
 */
export function composeTitle(input: TitleComposeInput): string | null {
  // Empty case: nothing useful from AI
  if (input.brand === null && input.briefDescription === null && input.price === null) {
    return null;
  }

  // Build fixed left chunk
  const priceStr = input.price === null
    ? '$$$'
    : `$${formatPrice(input.price)}`;
  const fixedLeft = `${priceStr}- ${input.quantity}x `;

  // Build fixed right chunk (special-note suffix)
  let fixedRight = '';
  if (input.specialNotesCategory === 'TOOL ONLY') fixedRight = ' TOOL ONLY';
  else if (input.specialNotesCategory === 'READ') fixedRight = ' READ';
  // CLOTHING and None: no title suffix

  // Compute available space for brand + brief description
  const fixedLen = fixedLeft.length + fixedRight.length;
  const availForVariable = TITLE_MAX_CHARS - fixedLen;

  // If fixed parts alone exceed the cap, truncate the variable region to 0
  // and accept the result (will exceed 50 — but spec calls fixed parts
  // never-truncated; this is the rare-case escape valve).
  if (availForVariable <= 0) {
    return (fixedLeft + fixedRight).trim();
  }

  // Build the variable middle: "<brand> <brief>" with each part skipped
  // if null. Whitespace handling: a single trailing space after fixedLeft
  // already covers the gap if both brand and brief are null.
  const brandPart = input.brand ?? '';
  const briefPart = input.briefDescription ?? '';

  // Truncate brief first
  let composedMiddle: string;
  if (brandPart === '' && briefPart === '') {
    composedMiddle = '';
  } else if (brandPart === '') {
    composedMiddle = briefPart.slice(0, availForVariable);
  } else if (briefPart === '') {
    composedMiddle = brandPart.slice(0, availForVariable);
  } else {
    // Both present: try full, then truncate brief, then truncate brand
    const full = `${brandPart} ${briefPart}`;
    if (full.length <= availForVariable) {
      composedMiddle = full;
    } else {
      // Drop chars from brief first; keep "brand " prefix intact
      const brandPrefix = `${brandPart} `;
      const briefBudget = availForVariable - brandPrefix.length;
      if (briefBudget > 0) {
        composedMiddle = brandPrefix + briefPart.slice(0, briefBudget);
      } else {
        // Brand alone exceeds — truncate brand from right, drop brief entirely
        composedMiddle = brandPart.slice(0, availForVariable);
      }
    }
  }

  // Trim trailing space if middle is empty (avoids "$120- 3x  TOOL ONLY")
  const result = (fixedLeft + composedMiddle + fixedRight);
  return result.replace(/\s{2,}/g, ' ').replace(/\s+ TOOL ONLY/, ' TOOL ONLY').replace(/\s+ READ/, ' READ').trimEnd();
}

function formatPrice(value: number): string {
  // Drop trailing .00 for cleaner display: 120.00 → "120", 8.99 → "8.99"
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? String(Math.trunc(rounded)) : rounded.toFixed(2);
}

export type DescriptionComposeInput = {
  body: string | null;
  specialNotesCategory: LotDTO['specialNotesCategory'];
  specialNotesText: string | null; // size when category=CLOTHING
  untested: boolean;
};

/**
 * Composes the lot description per the format spec:
 *   <body>[ CLOTHING - <size>][ UNTESTED]
 *
 * Hard cap: 500 chars total. Truncates body from the right with an
 * ellipsis if needed, preserving suffixes intact.
 *
 * Returns null when body is null or empty (suffixes alone are not a
 * description).
 */
export function composeDescription(input: DescriptionComposeInput): string | null {
  const body = input.body?.trim();
  if (!body) return null;

  // Build suffixes
  let suffix = '';
  if (input.specialNotesCategory === 'CLOTHING' && input.specialNotesText) {
    suffix += ` CLOTHING - ${input.specialNotesText}`;
  }
  if (input.untested) {
    suffix += ' UNTESTED';
  }

  const full = body + suffix;
  if (full.length <= DESCRIPTION_MAX_CHARS) return full;

  // Need to truncate body. Reserve room for ellipsis + suffix.
  const bodyBudget = DESCRIPTION_MAX_CHARS - suffix.length - ELLIPSIS.length;
  if (bodyBudget <= 0) {
    // Defensive: suffix alone exceeds cap (shouldn't happen with sane sizes,
    // but handle gracefully). Return suffix-only string trimmed to cap.
    return (body.slice(0, DESCRIPTION_MAX_CHARS - suffix.length) + suffix).slice(0, DESCRIPTION_MAX_CHARS);
  }
  return body.slice(0, bodyBudget) + ELLIPSIS + suffix;
}

export type AiOutputForStatus = {
  brand: string | null;
  briefDescription: string | null;
  descriptionBody: string | null;
  price: number | null;
};

export type FieldStatuses = {
  title: 'success' | 'failure';
  description: 'success' | 'failure';
  price: 'success' | 'failure';
};

export type LotAiStatus = 'success' | 'partial' | 'failure';

/**
 * Per-field success determination from AI output (Round 7 Q7a final).
 *
 * - price: succeeds when AI returned a non-null numeric value
 * - title: succeeds when AI returned non-null brand AND non-null
 *   briefDescription AND non-null price (all three needed for a
 *   complete title)
 * - description: succeeds when AI returned a non-null, non-empty
 *   description_body
 */
export function determineFieldStatus(output: AiOutputForStatus): FieldStatuses {
  const titleOk = output.brand !== null
    && output.briefDescription !== null
    && output.price !== null;
  const descOk = output.descriptionBody !== null
    && output.descriptionBody.trim().length > 0;
  const priceOk = output.price !== null;
  return {
    title: titleOk ? 'success' : 'failure',
    description: descOk ? 'success' : 'failure',
    price: priceOk ? 'success' : 'failure',
  };
}

/**
 * Maps per-field statuses to the lot-level lastAiRunStatus enum.
 * - all three success → 'success'
 * - all three failure → 'failure'
 * - mixed → 'partial'
 */
export function mapStatus(fields: FieldStatuses): LotAiStatus {
  const okCount = [fields.title, fields.description, fields.price]
    .filter((s) => s === 'success').length;
  if (okCount === 3) return 'success';
  if (okCount === 0) return 'failure';
  return 'partial';
}

/**
 * Builds a comma-separated short error string from field statuses.
 * Used to populate lot.lastAiRunError.
 */
export function buildErrorString(fields: FieldStatuses): string | null {
  const failed = (Object.entries(fields) as [keyof FieldStatuses, 'success' | 'failure'][])
    .filter(([, s]) => s === 'failure')
    .map(([k]) => k);
  return failed.length > 0 ? failed.join(', ') : null;
}
