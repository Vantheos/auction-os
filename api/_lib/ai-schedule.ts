// api/_lib/ai-schedule.ts
// Pure helpers for the AI scheduled-run grid. The cron heartbeat uses
// `mostRecentScheduledTime(now, timeOfDay, intervalHours)` to determine
// whether a scheduled time has passed since the last completed drain.
//
// The schedule is a regular grid: {timeOfDay} + N * {intervalHours} for
// non-negative integer N. E.g., timeOfDay=00:00 + interval=4h → grid is
// 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 every day. timeOfDay=06:00 +
// interval=8h → 06:00, 14:00, 22:00, then wraps to 06:00 next day.
//
// Both functions are timezone-aware in the sense that they operate in the
// process's local time. Postgres `time` columns store wall-clock without a
// zone; we interpret them in the server's local zone (Vercel deployments
// run in UTC). Operators set timeOfDay via the Settings UI; native HTML
// `<input type="time">` emits HH:MM strings.

/**
 * Parse a Postgres `time` column value (HH:MM[:SS][.fff]) to a tuple.
 * Throws if the format is invalid. Seconds and fractional seconds default
 * to 0.
 */
export function parseTimeOfDay(s: string): { h: number; m: number; sec: number } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(s);
  if (!match) throw new Error(`Invalid timeOfDay: ${s}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  const sec = match[3] ? Number(match[3]) : 0;
  if (h > 23 || m > 59 || sec > 59) throw new Error(`Out-of-range timeOfDay: ${s}`);
  return { h, m, sec };
}

/**
 * Return the most recent scheduled grid time at or before `now`.
 *
 * Algorithm: anchor today's date at timeOfDay; if that anchor is after now,
 * step back one day so it sits at or before now. Then advance by
 * intervalHours until the next step would overshoot now. The returned time
 * is the most recent "tick" on the operator's schedule grid.
 *
 * Edge cases:
 * - If intervalHours doesn't divide 24 evenly, the grid simply runs as an
 *   unbounded arithmetic progression — the wrap to the next day's anchor
 *   isn't aligned, but operators choosing 4/8/12/24 (the UI's intervals)
 *   always see clean alignment.
 * - For the very first run after a config change, the anchor of "today"
 *   establishes the new grid; previous-grid runs are simply ignored
 *   (matches user intent: "adopt new schedule values from this point
 *   going forward").
 */
export function mostRecentScheduledTime(
  now: Date,
  timeOfDay: string,
  intervalHours: number,
): Date {
  if (intervalHours <= 0) throw new Error(`intervalHours must be > 0, got ${intervalHours}`);
  const { h, m, sec } = parseTimeOfDay(timeOfDay);

  const anchor = new Date(now);
  anchor.setHours(h, m, sec, 0);
  if (anchor.getTime() > now.getTime()) {
    anchor.setDate(anchor.getDate() - 1);
  }

  const intervalMs = intervalHours * 3600 * 1000;
  const elapsedMs = now.getTime() - anchor.getTime();
  const stepsPast = Math.floor(elapsedMs / intervalMs);
  return new Date(anchor.getTime() + stepsPast * intervalMs);
}
