# Project context for Claude Code sessions

## READ FIRST — accumulated lessons

Before making changes that touch the AI subsystem, inventory or catalog UI,
API endpoints written to TanStack Query cache, bulk actions, schedule logic,
or migrations, read **[`docs/dev-notes.md`](docs/dev-notes.md)**. It captures
non-obvious patterns, dependency quirks, cross-surface couplings, and
gotchas accumulated during phase work. Each entry says when to consult it
and what to check.

If you discover a new gotcha during your session — version compat issues,
parallel components that need parallel updates, schema constraints that
test fixtures must respect, etc. — add it to that file before ending the
session. The intent is to stop future sessions from rediscovering the
same things.

## Authoritative project documents

- **Live phase tracker:** [`STATE.md`](STATE.md)
- **Roadmap (snapshot, not contract):** [`docs/roadmap.md`](docs/roadmap.md)
- **Per-phase specs:** [`docs/superpowers/specs/`](docs/superpowers/specs/)
- **Per-phase plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Handoff documents:** [`docs/superpowers/handoffs/`](docs/superpowers/handoffs/)
- **Testing policy:** [`docs/testing-policy.md`](docs/testing-policy.md)
- **Testing patterns:** [`docs/testing-patterns.md`](docs/testing-patterns.md)
- **AI prompt review:** [`docs/superpowers/handoffs/2026-05-08-ai-prompt-review.md`](docs/superpowers/handoffs/2026-05-08-ai-prompt-review.md)

When the spec and the code disagree, the code is authoritative — but flag
the drift so future sessions don't re-read the wrong spec.

## Pre-push trio (non-negotiable)

Before any push that triggers a Vercel deploy:

```
npm run build && npm run lint && npm test
```

All three must be green. Lint warnings count as failures (project uses 0/0
as the bar). See `dev-notes.md` for handling specific warning patterns.

## Branch and deploy discipline

- Phase work lands on `phase-N-<slug>` branches; **never push to `main`**
  unless explicitly cutting over to v1 — the Vercel webhook on main fires
  production deploys.
- Per-commit preview URLs are pinned to the commit they were built from.
  For testing latest, use the branch-pinned URL or check the dashboard.
- Author email must be `Vantheos <ops@vantheos.com>` (repo-local git config)
  or Vercel rejects the deploy.

## Migrations

Apply to BOTH Dev and Test DBs. Use `scripts/apply-migration.ts`, never
`drizzle-kit push --force`. See `dev-notes.md` for the exact invocations.

## Vercel platform reminders

- Crons run on production only — preview branches don't fire `*/15 * * * *`
  schedules. Use curl with `CRON_SECRET` to simulate, or test on prod.
- Vercel CLI is NOT installed by default in this project. Many CLI commands
  (`vercel env pull`, `vercel logs`) require `npm i -g vercel` first.
