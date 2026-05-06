// tests/lib/ai-schedule.test.ts
// Unit tests for the schedule-grid helpers used by the cron gate.
import { describe, it, expect } from 'vitest';
import { mostRecentScheduledTime, parseTimeOfDay } from '../../api/_lib/ai-schedule';

// Builds a Date in local time (the server's interpretation of `time` columns).
function localDate(y: number, mo: number, d: number, h: number, mi: number, s = 0) {
  return new Date(y, mo - 1, d, h, mi, s, 0);
}

describe('parseTimeOfDay', () => {
  it('parses HH:MM', () => {
    expect(parseTimeOfDay('09:30')).toEqual({ h: 9, m: 30, sec: 0 });
  });

  it('parses HH:MM:SS', () => {
    expect(parseTimeOfDay('23:59:42')).toEqual({ h: 23, m: 59, sec: 42 });
  });

  it('parses HH:MM:SS.fff (Postgres time output)', () => {
    expect(parseTimeOfDay('06:00:00.000')).toEqual({ h: 6, m: 0, sec: 0 });
  });

  it('throws on garbage', () => {
    expect(() => parseTimeOfDay('not-a-time')).toThrow();
    expect(() => parseTimeOfDay('25:00')).toThrow();
    expect(() => parseTimeOfDay('00:60')).toThrow();
  });
});

describe('mostRecentScheduledTime', () => {
  it('returns the anchor time itself when now equals the anchor', () => {
    const now = localDate(2026, 5, 6, 4, 0);
    const result = mostRecentScheduledTime(now, '00:00', 4);
    expect(result).toEqual(localDate(2026, 5, 6, 4, 0));
  });

  it('returns the most recent grid step at or before now (interval=4h, anchor=00:00)', () => {
    // Grid: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 each day.
    // At 14:30, most recent should be 12:00.
    const result = mostRecentScheduledTime(localDate(2026, 5, 6, 14, 30), '00:00', 4);
    expect(result).toEqual(localDate(2026, 5, 6, 12, 0));
  });

  it('handles non-midnight anchor (anchor=06:00, interval=8h)', () => {
    // Grid: 06:00, 14:00, 22:00, then wraps to 06:00 next day.
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 7, 0), '06:00', 8))
      .toEqual(localDate(2026, 5, 6, 6, 0));
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 13, 59), '06:00', 8))
      .toEqual(localDate(2026, 5, 6, 6, 0));
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 14, 0), '06:00', 8))
      .toEqual(localDate(2026, 5, 6, 14, 0));
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 22, 0), '06:00', 8))
      .toEqual(localDate(2026, 5, 6, 22, 0));
  });

  it("steps back to yesterday's anchor when now is before today's anchor", () => {
    // anchor=23:00, interval=24h. At 02:00 today, most recent grid time
    // is yesterday at 23:00.
    const result = mostRecentScheduledTime(localDate(2026, 5, 6, 2, 0), '23:00', 24);
    expect(result).toEqual(localDate(2026, 5, 5, 23, 0));
  });

  it("uses today's anchor when now equals it (24h interval)", () => {
    const result = mostRecentScheduledTime(localDate(2026, 5, 6, 23, 0), '23:00', 24);
    expect(result).toEqual(localDate(2026, 5, 6, 23, 0));
  });

  it('config change picks up the new grid on the next call (no special migration logic)', () => {
    // Setting changed mid-day — caller just passes new values; helper has
    // no memory of prior config. anchor=00:00/4h grid: 12:00 most recent
    // at 14:30 → switch to 06:00/8h: 14:00 most recent at 14:30.
    const now = localDate(2026, 5, 6, 14, 30);
    expect(mostRecentScheduledTime(now, '00:00', 4))
      .toEqual(localDate(2026, 5, 6, 12, 0));
    expect(mostRecentScheduledTime(now, '06:00', 8))
      .toEqual(localDate(2026, 5, 6, 14, 0));
  });

  it('rejects intervalHours <= 0', () => {
    const now = localDate(2026, 5, 6, 14, 30);
    expect(() => mostRecentScheduledTime(now, '00:00', 0)).toThrow();
    expect(() => mostRecentScheduledTime(now, '00:00', -1)).toThrow();
  });

  it('handles 1-hour interval (every hour on the hour)', () => {
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 14, 30), '00:00', 1))
      .toEqual(localDate(2026, 5, 6, 14, 0));
  });

  it('handles 24-hour interval (once per day)', () => {
    // At 23:30 with anchor 12:00 daily → 12:00 today.
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 23, 30), '12:00', 24))
      .toEqual(localDate(2026, 5, 6, 12, 0));
    // At 11:30 → 12:00 yesterday.
    expect(mostRecentScheduledTime(localDate(2026, 5, 6, 11, 30), '12:00', 24))
      .toEqual(localDate(2026, 5, 5, 12, 0));
  });
});
