# Auction Inventory SaaS — roadmap

> Captured 2026-05-02; restructured 2026-05-03 ahead of Phase 4 spec
> discussion. **This is a snapshot, not a contract** — phases are
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
| 4 | Settings + Users + Customers/Jobs polish — `/users` admin UI, `disabled_at` JWT gate, AI Schedule panel + integer-hours schema, customer search + whole-row click | ✅ | `phase-4-settings-users` @ `fc2bb25` |
| 5 | Auction Platform Export — AF360 / HiBid pipeline (CSV + batched image zips via Vercel Blob), Customer + Job edit forms, Customer disable/re-enable, Inventory-level Export entry point | ✅ | `phase-5-auction-platform-export` @ `b089f83` |

## v1 — remaining

### Phase 4 — Settings + Users + Customers/Jobs polish ✅

**Spec:** [`docs/superpowers/specs/2026-05-03-phase-4-design.md`](./superpowers/specs/2026-05-03-phase-4-design.md) — signed off 2026-05-03.

**Branch:** `phase-4-settings-users` @ `fc2bb25` — 7 commits ahead of `phase-3-5-test-infra` (5 area commits + 2 sign-off bug fixes).
**Actual effort:** Single sitting. Estimate was ~3.5 days.

Completes the admin/config surface that was placeholder-only after Phase
3.5. Settings page becomes fully functional; user management graduates
from SQL-only to UI; the existing customer-jobs flow gets a
discoverability bump.

**Scope:**
- **Settings → AI Schedule panel** — replace the current "Configured in a
  future phase" placeholder with a working form: on/off toggle, frequency
  (hourly/daily), time-of-day input. Persists to existing
  `system_settings.aiSchedule*` columns. Form saves regardless of whether
  Phase 6 (AI subsystem) is shipped — values are no-ops until then.
- **Settings → drop the "Organization" placeholder section entirely.** It
  was a misnamed placeholder for user management; now lives at `/users`.
- **`/users` admin UI** — list users, add user (email / password / role /
  displayName), inline role change, deactivate, hard delete. Server is
  done from Phase 1 (POST + GET + PATCH); needs a new DELETE endpoint and
  the `app_user.active` migration.
- **`app_user.active` schema migration** — add `boolean active not null
  default true`. JWT Claims Hook checks this before issuing a role claim;
  deactivated users get no role and effectively can't use the app.
- **Customers/Jobs visibility polish** — bump the existing "View jobs →"
  link in the Customers list to a more prominent button. Job creation
  already exists in `/customers/:id`; the entry point was just easy to
  miss.
- **`/users` nav enable** — flip `enabled: false` to `true` on the Users
  link in `AdminShell.tsx`. Audit nav stays "(later)" — v2 work.

**T-G4** (Phase 3 carry-forward) is fully addressed by this phase.

### Phase 5 — Auction Platform Export ✅

**Spec:** [`docs/superpowers/specs/2026-05-04-phase-5-design.md`](./superpowers/specs/2026-05-04-phase-5-design.md) — signed off 2026-05-05.
**Plan:** [`docs/superpowers/plans/2026-05-04-phase-5.md`](./superpowers/plans/2026-05-04-phase-5.md).
**AF360 source spec:** [`docs/auction-platform/AF360_HiBid_Lot_Import_Spec.md`](./auction-platform/AF360_HiBid_Lot_Import_Spec.md).

**Branch:** `phase-5-auction-platform-export` @ `b089f83` — 14 commits ahead of `phase-4-settings-users` (7 area commits + 4 sign-off bug fixes/cleanups + 2 utility commits + 1 doc commit).
**Actual effort:** Multi-session over ~2 days. Estimate was ~6.25 days; came in faster.

**Shipped:**
- 7-column AF360 CSV per source spec
- Schema additions: `customer.seller_code`, `customer.disabled_at`, `job.start_bid`, `job.shippable` (migration `0011`)
- Customer + Job edit forms built from scratch (no prior editable surface)
- Customer disable/re-enable (mirrors Phase 4 user pattern); disabled customers hidden from cataloging picker AND from new-job creation
- AF360 mapping module (`src/lib/exporters/af360.ts`) — hardcoded TS const, no DB table for v1
- Server endpoints: `POST /api/jobs/:id/export-af360/start` (CSV inline + batch plan) + `POST .../batch` (per-batch zip → Vercel Blob)
- Daily cleanup cron `cleanup-export-blobs` (24h TTL)
- Read-only Settings → Auction Platforms panel
- Two entry points: per-Job button on CustomerDetail + Inventory-level button when Job filtered
- New deps: `archiver`, `@vercel/blob`
- New utility scripts: `apply-migration.ts` (drizzle-kit ^0.28 workaround), `seed-export-stress.ts` (multi-batch sign-off fixture)
- Vercel Blob store `auction-os-exports` (public, iad1)
- Legacy `/api/lots/export` + `ExportCsvDialog` removed entirely

**Sign-off bugs caught + fixed:** disabled-customer-still-creates-jobs UI gap, BlobError private-store rejection (resolved via store recreate as public), Retry-after-/start-failure no-op. Multi-batch verified end-to-end against 120-lot stress fixture.

**Carry-forwards / known limitations:**
- Real-world AF360 import dry-run by the customer not done at sign-off; becomes a Phase 8 (cutover) prerequisite.
- Multi-batch upper bound (1000+ photos) tested at 120 only; architecture accommodates the upper bound but not real-world stress-tested.

### Phase 6 — AI subsystem ⬜ (next)

Drives the largest remaining product surface (Phase 3 carry-forward
**T-G3**). Per current understanding: AI is largely backend with minimal
new UI surface.

**Scope (rough — locked in during spec discussion):**
- Per-lot title / description / reference-price generation
- Trigger: button on lot detail (manual run); scheduled cron reads from
  `system_settings.aiSchedule*` (configured in Phase 4)
- Run status flips: `success` / `partial` / `failure` written to
  `lot.lastAiRunStatus` + error to `lot.lastAiRunError`
- Cost tracking (per-call token + dollar accounting)
- Output examined via existing inventory views — no new UI for
  examination
- AI mutation hooks must follow `docs/testing-policy.md` — invalidation +
  error toast tests at minimum

### Phase 7 — Label printing ⬜

Decoupled from earlier phases because Zebra hardware availability is
uncertain and not strictly required for v1 in worst case.

**Scope:**
- Label design: 2″ × 1″ ZPL template
- **T-G1** — Physical Zebra ZD450 round-trip test on real hardware
  (requires hardware on hand; mandatory before Prod cutover per Phase 2
  sign-off)
- Any helper-URL polish if not already covered in Phase 4

### Phase 8 — v1 cutover ⬜

Dedicated phase, not loose items. **Strict ordering — not flexible:** the
Supabase bootstrap requirements constrain the sequence.

1. Apply migrations to Prod via `npx supabase db push --db-url "$PROD_DATABASE_URL"`
2. Activate JWT Claims Hook in Prod's Supabase dashboard
3. Run `npm run seed:admin` against Prod (`.env` pointed at Prod) — creates the bootstrap admin
4. **T-G2** — Audit-log SQL spot-check via Supabase Dashboard SQL Editor against Prod (verify the audit trigger fires correctly with the right `user_id` + before/after fields)
5. Change seeded admin's default password before non-test use
6. Open the app to real users — admin uses Settings → Users (built in Phase 4) to add Office and Warehouse users
7. Promote final pre-cutover branch → `main` via merge; Vercel deploys to Prod via the existing Git webhook

## Beyond v1

### v1.5 — Playwright e2e ⬜

Locked during Phase 3.5 deferral discussion (**T-3.5-G3**) and reaffirmed
during Phase 4 grouping discussion. Insurance for visual / cross-page
regressions that unit tests + manual sign-off can miss. Specifically
valuable for catching iOS Safari / Chrome quirks (the class of bug that
surfaced during Phase 3 sign-off as the auto-zoom issue).

**Rough scope (defined during v1.5 planning):**
- 5-10 golden-path specs covering: login per role + correct landing
  route, inventory edit → list refresh, bulk delete, move dialog → state
  transition, catalog session → first photo → lot creation, role gating,
  pull-to-refresh persistence
- Test-data scaffolding: extend `seed:test-lots` into `seed:e2e` with
  idempotent reset + dedicated playwright users

### v2 — Reporting module ⬜

Includes **T-G5** (audit reporting view — audit log captured in Phase 1,
surface it in the UI for compliance + ops review) and any other reporting
surfaces that emerge from v1 production use.

## Eliminated

- **T-G6 — First-run / empty-states polish:** Skipped entirely. Practical
  value low for a single-tenant app with hands-on install per client.
  Decided during Phase 3.5 wrap-up (2026-05-03).

## Carry-forward index (where each Phase 3 / 3.5 item landed)

| ID | Original deferral | Resolution |
|---|---|---|
| T-G1 | Physical Zebra ZD450 round-trip test | → Phase 7 (Label printing) |
| T-G2 | Audit-log SQL spot-check | → Phase 8 (Cutover) step 4 |
| T-G3 | AI subsystem | → Phase 6 (AI subsystem) |
| ~~T-G4~~ | `/users` admin UI | **CLOSED 2026-05-03** in Phase 4. Branch `phase-4-settings-users` @ `fc2bb25`. |
| T-G5 | Audit reporting view | → v2 (Reporting module) |
| T-G6 | First-run / empty-states polish | **ELIMINATED** |
| T-3.5-G1 | LotDetail state-change + move toast tests | **CLOSED 2026-05-02** in commit `e271015` |
| T-3.5-G2 | upload-processor retry/backoff path tests | **CLOSED 2026-05-02** in commit `e271015` |
| T-3.5-G3 | Playwright e2e for golden-path flows | → v1.5 |

## Anchors

- **Live tracker:** [`STATE.md`](../STATE.md)
- **Design specs (per-phase):** [`docs/superpowers/specs/`](./superpowers/specs/)
  - [v1 design](./superpowers/specs/2026-04-29-v1-design.md) — authoritative for product decisions
  - [Phase 2 design](./superpowers/specs/2026-04-30-phase-2-design.md) — signed off
  - [Phase 3 design](./superpowers/specs/2026-05-01-phase-3-design.md) — signed off
  - [Phase 3.5 design](./superpowers/specs/2026-05-02-phase-3-5-design.md) — signed off
  - [Phase 4 design](./superpowers/specs/2026-05-03-phase-4-design.md) — drafted 2026-05-03, not started
- **Implementation plans (per-phase):** [`docs/superpowers/plans/`](./superpowers/plans/)
- **Testing policy:** [`docs/testing-policy.md`](./testing-policy.md)
- **Testing patterns:** [`docs/testing-patterns.md`](./testing-patterns.md)

## Honest caveats

- The phase structure has been incremental: **Phase 3.5 was unplanned**
  when Phase 3 sign-off testing exposed the test-infrastructure gap.
  Expect similar insertions if any phase's sign-off uncovers something
  larger than a polish PR.
- v1 cutover ordering (Phase 8) is not flexible; the migrations + JWT
  hook + admin seed sequence is constrained by Supabase's bootstrap
  requirements.
- Phase boundaries are deliverable units, not enforced ones — small
  cross-phase polish (e.g., adding a missing toast on a pre-existing
  flow) can land in whichever phase is open at the time.
