# Auction Inventory SaaS — roadmap

> Captured 2026-05-02 after Phase 3.5 sign-off, before Phase 4 spec
> discussion begins. **This is a snapshot, not a contract** — phases are
> expected to shift as work progresses, deferred items surface, or new
> requirements emerge. `STATE.md` is the live tracker; this doc is the
> higher-altitude view of where v1 is going and what sits beyond it.

## Status legend

- ✅ signed off
- 🟡 in progress / spec drafted
- ⬜ not started

## v1 — completed

| Phase | Scope | Status | Branch / HEAD |
|---|---|---|---|
| 1 | Foundation — Supabase, auth, JWT custom claims, base API + DB schema | ✅ | `phase-1-foundation` @ `70cc776` |
| 2 | Lot lifecycle — CRUD, state machine, bulk actions, label print | ✅ | `phase-2-lot-lifecycle` @ `a517f9d` |
| 3 | Mobile cataloging + photo pipeline + login routing + role gating + cleanup-orphan-lots cron | ✅ | `phase-3-mobile-cataloging` @ `7d15a35` |
| 3.5 | Client test infrastructure — RTL + happy-dom + canonical patterns + 19-item sign-off bug backfill | ✅ | `phase-3-5-test-infra` @ `f189cc6` |

## v1 — remaining

### Phase 4 — AI subsystem + Playwright workstream ⬜

Drives the largest remaining product surface (per Phase 3 carry-forward
**T-G3**) plus the e2e safety net (per Phase 3.5 deferral **T-3.5-G3**).

**AI scope (rough — locked in during spec discussion):**
- Per-lot title / description / reference-price generation
- Schedule configuration (frequency, time-of-day) — wiring to `system_settings.aiSchedule*` columns from Phase 1
- Run status flips: `success` / `partial` / `failure` written to `lot.lastAiRunStatus`
- Cost tracking (per-call token + dollar accounting)
- AI mutation hooks must follow `docs/testing-policy.md` — invalidation + error toast tests at minimum

**Playwright scope (rough):**
- 5-10 golden-path specs covering: login per role + correct landing route, inventory edit → list refresh, bulk delete, move dialog → state transition, catalog session → first photo → lot creation, role gating (warehouse can't reach `/settings`), pull-to-refresh persistence
- Test-data scaffolding: extend `seed:test-lots` into `seed:e2e` with idempotent reset + dedicated playwright users

**Process:** spec drafted top-down using the same one-focused-round-per-area
pattern as Phases 2 and 3. Branch `phase-4-ai` (or similar) off
`phase-3-5-test-infra` once spec is locked.

### Phase 5 (or polish PR) — pre-cutover polish ⬜

Could collapse into Phase 4 sign-off depending on scope at the time.

- **T-G6** — First-run / empty-states polish (no test data yet → what does
  the inventory list look like? what does a brand-new install see at
  `/catalog` with no jobs? what does AI status pill show with no AI run
  yet?)
- Any deferred items that surface during Phase 4 sign-off

### v1 cutover — deployment runbook (not a development phase) ⬜

Reproducible steps captured in `STATE.md` "What still must happen before
Prod is real":

- Apply 8 migrations to Prod via `npx supabase db push --db-url "$PROD_DATABASE_URL"`
- Activate JWT Claims Hook in Prod's Supabase dashboard
- Run `npm run seed:admin` against Prod (`.env` pointed at Prod)
- **Change seeded admin's default password** before non-test use
- **T-G1** — Physical Zebra ZD450 label round-trip test (requires hardware on hand; mandatory before Prod cutover per Phase 2 sign-off)
- **T-G2** — Audit-log SQL spot-check via Supabase Dashboard SQL Editor against Prod
- Promote `phase-4-ai` (or final pre-cutover branch) → `main` via merge; Vercel deploys to Prod via the existing Git webhook

## Beyond v1 — v1.5 candidates ⬜

Tracked from Phase 3 carry-forwards; deferred to a later release once v1 is
on Prod and stable.

- **T-G4** — `/users` admin UI (manage role assignments via UI rather than
  raw SQL against `app_user`)
- **T-G5** — Audit reporting view (audit log is captured by all mutations
  in Phase 1; surface it in the UI for compliance + ops review)

## Anchors

- **Live tracker:** [`STATE.md`](../STATE.md)
- **Design specs (per-phase):** [`docs/superpowers/specs/`](./superpowers/specs/)
  - [v1 design](./superpowers/specs/2026-04-29-v1-design.md) — authoritative for product decisions
  - [Phase 2 design](./superpowers/specs/2026-04-30-phase-2-design.md) — signed off
  - [Phase 3 design](./superpowers/specs/2026-05-01-phase-3-design.md) — signed off
  - [Phase 3.5 design](./superpowers/specs/2026-05-02-phase-3-5-design.md) — signed off
- **Implementation plans (per-phase):** [`docs/superpowers/plans/`](./superpowers/plans/)
- **Testing policy:** [`docs/testing-policy.md`](./testing-policy.md)
- **Testing patterns:** [`docs/testing-patterns.md`](./testing-patterns.md)

## Honest caveats

- The phase structure has been incremental: **3.5 was unplanned** when
  Phase 3 sign-off testing exposed the test-infrastructure gap. Expect
  similar insertions if Phase 4 sign-off uncovers something larger than
  a polish PR.
- "Phase 5" above is a placeholder — could end up as a small polish PR
  bundled with Phase 4 cutover prep, or as its own short phase. Decide
  during Phase 4 sign-off based on T-G6 scope.
- v1 cutover ordering is not flexible; the migrations + JWT hook + admin
  seed sequence is constrained by Supabase's bootstrap requirements.
