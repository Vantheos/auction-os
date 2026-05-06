import { describe, it, expect } from 'vitest';
import {
  AF360_HIBID,
  buildAF360Csv,
  csvEscape,
  formatBoolean,
  formatCurrency,
  slugify,
  stripNewlines,
  truncate,
  type ExportContext,
} from '../../../src/lib/exporters/af360';

describe('truncate', () => {
  it('returns empty string unchanged', () => {
    expect(truncate('', 50)).toBe('');
  });
  it('returns exact-length string unchanged', () => {
    const s = 'x'.repeat(50);
    expect(truncate(s, 50)).toBe(s);
  });
  it('slices oversize string silently with no error', () => {
    expect(truncate('x'.repeat(60), 50)).toBe('x'.repeat(50));
  });
  it('returns short string unchanged', () => {
    expect(truncate('hello', 50)).toBe('hello');
  });
});

describe('stripNewlines', () => {
  it('replaces \\n with single space', () => {
    expect(stripNewlines('a\nb')).toBe('a b');
  });
  it('replaces \\r\\n with single space', () => {
    expect(stripNewlines('a\r\nb')).toBe('a b');
  });
  it('collapses multiple consecutive newlines to single space', () => {
    expect(stripNewlines('a\n\n\nb')).toBe('a b');
  });
  it('collapses mixed CR/LF runs to single space', () => {
    expect(stripNewlines('a\r\n\r\nb')).toBe('a b');
  });
  it('collapses tab runs into single space', () => {
    expect(stripNewlines('a\t\tb')).toBe('a b');
  });
  it('trims leading/trailing whitespace', () => {
    expect(stripNewlines('  hello world  ')).toBe('hello world');
  });
  it('trims whitespace produced by leading/trailing newlines', () => {
    expect(stripNewlines('\nhello\n')).toBe('hello');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(stripNewlines('\n\n  \r\n')).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats integer string as N.00', () => {
    expect(formatCurrency('5')).toBe('5.00');
  });
  it('formats one-decimal string as N.X0', () => {
    expect(formatCurrency('5.5')).toBe('5.50');
  });
  it('rounds three-decimal input to two decimals (toFixed banker-ish)', () => {
    // toFixed rounds half-to-even on some platforms but most engines round
    // half-away-from-zero. Either '5.55' or '5.56' is acceptable; assert
    // that the result is one of them (real-world StartBids end in .00 or
    // .50 anyway).
    expect(['5.55', '5.56']).toContain(formatCurrency('5.555'));
  });
  it('formats integer number as N.00', () => {
    expect(formatCurrency(5)).toBe('5.00');
  });
  it('returns 0.00 for non-finite input', () => {
    expect(formatCurrency('not-a-number')).toBe('0.00');
    expect(formatCurrency(Infinity)).toBe('0.00');
    expect(formatCurrency(NaN)).toBe('0.00');
  });
  it('handles zero correctly', () => {
    expect(formatCurrency(0)).toBe('0.00');
  });
});

describe('formatBoolean', () => {
  it('outputs literal true / false strings', () => {
    expect(formatBoolean(true)).toBe('true');
    expect(formatBoolean(false)).toBe('false');
  });
});

describe('csvEscape', () => {
  it('passes plain alphanumeric through unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });
  it('passes empty string through as empty', () => {
    expect(csvEscape('')).toBe('');
  });
  it('quotes a string containing comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });
  it('quotes a string containing double-quote and doubles internal quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
  it('quotes a string containing whitespace', () => {
    expect(csvEscape('a b')).toBe('"a b"');
  });
  it('quotes a string containing newline', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });
  it('quotes a string containing tab', () => {
    expect(csvEscape('a\tb')).toBe('"a\tb"');
  });
});

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Acme Auction Co')).toBe('acme-auction-co');
  });
  it('drops non-alphanumeric punctuation', () => {
    expect(slugify('Acme Auction Co.')).toBe('acme-auction-co');
  });
  it('collapses runs of separators', () => {
    expect(slugify('a   b___c!!d')).toBe('a-b-c-d');
  });
  it('trims leading/trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });
  it('caps length at 50 chars and trims any trailing dash', () => {
    const long = slugify('a'.repeat(60));
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('-')).toBe(false);
  });
});

describe('AF360_HIBID const', () => {
  it('declares 7 csv headers in spec order', () => {
    expect(AF360_HIBID.csvHeaders).toEqual([
      'LotNumber',
      'Title',
      'Description',
      'Quantity',
      'SellerCode',
      'StartBid',
      'Shippable',
    ]);
  });
  it('has a formatter for each header', () => {
    for (const header of AF360_HIBID.csvHeaders) {
      expect(typeof AF360_HIBID.formatters[header]).toBe('function');
    }
  });
  it('has a fieldMapping entry for each header', () => {
    const mappingHeaders = AF360_HIBID.fieldMapping.map((m) => m.header);
    expect(mappingHeaders).toEqual([...AF360_HIBID.csvHeaders]);
  });
});

// ── Sample contexts ──

function ctx(overrides: Partial<ExportContext['lot']> = {}, jobOverrides: Partial<ExportContext['job']> = {}, customerOverrides: Partial<ExportContext['customer']> = {}): ExportContext {
  return {
    lot: {
      lotNumber: 1,
      title: 'Vintage Oak Dining Table',
      description: 'Solid oak table circa 1940s. Seats 8.',
      quantity: 1,
      ...overrides,
    },
    job: {
      startBid: '5.00',
      shippable: false,
      ...jobOverrides,
    },
    customer: {
      sellerCode: 'SMTH001',
      ...customerOverrides,
    },
  };
}

describe('buildAF360Csv', () => {
  it('produces header row + N data rows + trailing CRLF', () => {
    const csv = buildAF360Csv([
      ctx({ lotNumber: 1, title: 'A', description: 'a desc', quantity: 1 }),
      ctx({ lotNumber: 2, title: 'B', description: 'b desc', quantity: 2 }),
    ]);
    const expected =
      'LotNumber,Title,Description,Quantity,SellerCode,StartBid,Shippable\r\n' +
      '1,A,"a desc",1,SMTH001,5.00,false\r\n' +
      '2,B,"b desc",2,SMTH001,5.00,false\r\n';
    expect(csv).toBe(expected);
  });

  it('produces only header + trailing CRLF for empty input', () => {
    const csv = buildAF360Csv([]);
    expect(csv).toBe('LotNumber,Title,Description,Quantity,SellerCode,StartBid,Shippable\r\n');
  });

  it('quotes title containing comma', () => {
    const csv = buildAF360Csv([ctx({ title: 'Vintage table, oak' })]);
    expect(csv).toContain(',"Vintage table, oak",');
  });

  it('strips embedded newlines from description', () => {
    const csv = buildAF360Csv([ctx({ description: 'line one\nline two\nline three' })]);
    expect(csv).toContain(',"line one line two line three",');
    expect(csv).not.toContain('\nline two');
  });

  it('truncates title silently to 50 chars', () => {
    const longTitle = 'A'.repeat(60);
    const csv = buildAF360Csv([ctx({ title: longTitle })]);
    expect(csv).toContain('A'.repeat(50));
    expect(csv).not.toContain('A'.repeat(51));
  });

  // (Phase 6) The "defaults quantity to 1 when null" test was dropped:
  // migration 0012 made lot.quantity NOT NULL DEFAULT 1, so the LotDTO
  // type now guarantees a number and the defensive `?? 1` in the
  // exporter became dead code. The test couldn't be expressed without
  // a type-error or unsafe cast.

  it('renders empty string for null sellerCode (defensive — server pre-flight should block this)', () => {
    const csv = buildAF360Csv([ctx({}, {}, { sellerCode: null })]);
    const dataRow = csv.split('\r\n')[1];
    const cells = dataRow.split(',');
    // SellerCode column is index 4
    expect(cells[4]).toBe('');
  });

  it('formats startBid as 5.00 from string "5"', () => {
    const csv = buildAF360Csv([ctx({}, { startBid: '5' })]);
    expect(csv).toContain(',5.00,');
  });

  it('formats shippable true correctly', () => {
    const csv = buildAF360Csv([ctx({}, { shippable: true })]);
    const dataRow = csv.split('\r\n')[1];
    expect(dataRow.endsWith(',true')).toBe(true);
  });

  it('escapes a title containing both comma and quote', () => {
    const csv = buildAF360Csv([ctx({ title: 'Lot, "rare"' })]);
    expect(csv).toContain('"Lot, ""rare"""');
  });

  it('handles a title with embedded newline (truncated by stripNewlines? — no, only Description strips)', () => {
    // Title formatter does NOT strip newlines (only Description does).
    // A title with a newline gets quoted via csvEscape; the newline is
    // preserved in the cell. AF360 spec says no line breaks in cells —
    // but Title from AI output is already constrained to single-line in
    // Phase 6. Defensive behavior: csvEscape quotes it correctly.
    const csv = buildAF360Csv([ctx({ title: 'Title\nwith newline' })]);
    expect(csv).toContain('"Title\nwith newline"');
  });
});
