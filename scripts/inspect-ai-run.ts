// scripts/inspect-ai-run.ts — forensics for "did Run Now process all lots in
// one invocation, or did the run split?" Looks at the 6 most-recently-finalized
// AI lots, their audit_log finalize events (timestamp + changed_by — NULL for
// cron, user-id for Run Now), and the system_settings AI snapshot.
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

(async () => {
  console.log('\n── system_settings AI snapshot ─────────────────────────────');
  const settings = await sql`
    SELECT ai_schedule_enabled, ai_schedule_interval_hours, ai_schedule_time_of_day,
           ai_last_run_at, ai_run_lock_until, ai_drain_in_progress, updated_at
      FROM system_settings WHERE id = 1`;
  console.table(settings);

  console.log('\n── 10 most-recently-touched AI lots ────────────────────────');
  const lots = await sql`
    SELECT lot_number, state,
           last_ai_run_status AS status,
           CASE WHEN title IS NULL THEN '(null)'
                WHEN length(title) > 50 THEN substr(title, 1, 47) || '...'
                ELSE title END AS title,
           ai_processing_started_at AS proc_started,
           updated_at,
           id
      FROM lot
     WHERE last_ai_run_status IS NOT NULL OR ai_processing_started_at IS NOT NULL
     ORDER BY GREATEST(
                COALESCE(ai_processing_started_at, '1970-01-01'::timestamptz),
                updated_at
              ) DESC
     LIMIT 10`;
  console.table(lots);

  if (lots.length === 0) { await sql.end(); return; }

  console.log('\n── audit_log entries that touched last_ai_run_status (last 24h) ─');
  const lotIds = lots.map((l) => l.id);
  const events = await sql`
    SELECT a.changed_at,
           l.lot_number,
           a.changed_by,
           CASE WHEN a.changed_by IS NULL THEN 'cron/system' ELSE 'operator' END AS actor,
           a.changed_fields->>'last_ai_run_status' AS new_status
      FROM audit_log a
      JOIN lot l ON l.id = a.record_id
     WHERE a.table_name = 'lot'
       AND a.record_id = ANY(${lotIds}::uuid[])
       AND a.changed_fields ? 'last_ai_run_status'
       AND a.changed_at > NOW() - INTERVAL '24 hours'
     ORDER BY a.changed_at ASC`;
  console.table(events);

  if (events.length >= 2) {
    const first = new Date(events[0].changed_at).getTime();
    const last = new Date(events[events.length - 1].changed_at).getTime();
    const span = (last - first) / 1000;
    console.log(`\nFinalize span: ${span.toFixed(1)}s across ${events.length} events`);

    const gaps: number[] = [];
    for (let i = 1; i < events.length; i++) {
      const dt = (new Date(events[i].changed_at).getTime() - new Date(events[i-1].changed_at).getTime()) / 1000;
      gaps.push(dt);
    }
    const maxGap = Math.max(...gaps);
    console.log(`Max gap between consecutive finalizes: ${maxGap.toFixed(1)}s`);
    if (maxGap > 60) {
      console.log(`-> Suggests ≥2 invocations (gap > 60s implies a function restart or second Run Now).`);
    } else {
      console.log(`-> Consistent with a single continuous invocation.`);
    }
  }

  await sql.end();
})();
