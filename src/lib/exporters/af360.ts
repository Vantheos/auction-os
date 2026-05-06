// src/lib/exporters/af360.ts
//
// AF360 / HiBid CSV mapping module. Pure functions, no IO. Imported by
// both server endpoints (api/jobs/[id]/export-af360/*) and the read-only
// Settings → Auction Platforms panel for the field-mapping reference.
//
// Spec: docs/superpowers/specs/2026-05-04-phase-5-design.md §3.4
// AF360 source spec: docs/auction-platform/AF360_HiBid_Lot_Import_Spec.md

const TITLE_MAX = 50;
const SLUG_MAX = 50;

// ── Types ────────────────────────────────────────────────────────────────

// Narrow per-row context. Server endpoint joins lot/job/customer rows and
// passes only the fields the CSV formatter needs.
export type ExportContext = {
  lot: {
    lotNumber: number | null;
    title: string | null;
    description: string | null;
    quantity: number | null;
  };
  job: {
    startBid: string; // numeric(10,2) serialized as string by Drizzle
    shippable: boolean;
  };
  customer: {
    sellerCode: string | null;
  };
};

export type AF360HeaderName =
  | 'LotNumber'
  | 'Title'
  | 'Description'
  | 'Quantity'
  | 'SellerCode'
  | 'StartBid'
  | 'Shippable';

export type FieldMappingNote = {
  header: AF360HeaderName;
  source: string;
  notes?: string;
};

// ── Pure utilities ───────────────────────────────────────────────────────

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

export function stripNewlines(s: string): string {
  // Replace any CR or LF (or runs of either) with a single space, then
  // collapse internal whitespace runs. Trim leading/trailing whitespace.
  return s.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function formatCurrency(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function formatBoolean(b: boolean): string {
  return b ? 'true' : 'false';
}

export function csvEscape(s: string): string {
  if (s === '') return '';
  // Per RFC 4180: wrap in "..." if contains comma, double-quote, CR, LF, or
  // (defensively) tab. Whitespace alone (space) doesn't strictly require
  // quoting per the RFC, but AF360's importer strips trailing whitespace
  // unless quoted — quote anything with whitespace to be safe.
  const needsQuote = /[",\r\n\t ]/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.length > SLUG_MAX ? base.slice(0, SLUG_MAX).replace(/-+$/, '') : base;
}

// ── Platform definition ──────────────────────────────────────────────────

// Single source of truth for the AF360 / HiBid CSV mapping. Mirrors the
// shape a future auction_platform DB row would store. v1 ships one
// platform; v2 multi-platform migrates this const to a DB-backed table.
export const AF360_HIBID = {
  id: 'af360-hibid',
  name: 'AF360 / HiBid',
  description: 'Auction Flex 360 → HiBid.com',
  csvHeaders: [
    'LotNumber',
    'Title',
    'Description',
    'Quantity',
    'SellerCode',
    'StartBid',
    'Shippable',
  ] as const satisfies readonly AF360HeaderName[],

  // Per-column transformation from internal context to CSV cell string.
  // Consumers should pass the cell through csvEscape() before joining.
  formatters: {
    LotNumber: (ctx: ExportContext) =>
      ctx.lot.lotNumber == null ? '' : String(ctx.lot.lotNumber),
    Title: (ctx: ExportContext) => truncate(ctx.lot.title ?? '', TITLE_MAX),
    Description: (ctx: ExportContext) => stripNewlines(ctx.lot.description ?? ''),
    Quantity: (ctx: ExportContext) => String(ctx.lot.quantity),
    SellerCode: (ctx: ExportContext) => ctx.customer.sellerCode ?? '',
    StartBid: (ctx: ExportContext) => formatCurrency(ctx.job.startBid),
    Shippable: (ctx: ExportContext) => formatBoolean(ctx.job.shippable),
  } satisfies Record<AF360HeaderName, (ctx: ExportContext) => string>,

  // Field-mapping reference shown in the read-only Settings panel.
  fieldMapping: [
    { header: 'LotNumber', source: 'Lot.lotNumber' },
    { header: 'Title', source: 'Lot.title', notes: 'Truncated silently to 50 chars' },
    { header: 'Description', source: 'Lot.description', notes: 'Newlines stripped and replaced with spaces' },
    { header: 'Quantity', source: 'Lot.quantity', notes: 'Defaults to 1 when null' },
    { header: 'SellerCode', source: 'Customer.sellerCode', notes: 'Required at export — admin sets per Customer' },
    { header: 'StartBid', source: 'Job.startBid', notes: 'Decimal currency (e.g. 5.00)' },
    { header: 'Shippable', source: 'Job.shippable', notes: 'true / false literal strings' },
  ] satisfies FieldMappingNote[],
} as const;

// ── CSV builder ──────────────────────────────────────────────────────────

const ROW_SEPARATOR = '\r\n';
const CELL_SEPARATOR = ',';

export function buildAF360Csv(rows: ExportContext[]): string {
  const headerRow = AF360_HIBID.csvHeaders.map(csvEscape).join(CELL_SEPARATOR);
  const dataRows = rows.map((ctx) =>
    AF360_HIBID.csvHeaders
      .map((header) => csvEscape(AF360_HIBID.formatters[header](ctx)))
      .join(CELL_SEPARATOR)
  );
  // Trailing CRLF after the last row matches AF360's expected line endings.
  return [headerRow, ...dataRows].join(ROW_SEPARATOR) + ROW_SEPARATOR;
}
