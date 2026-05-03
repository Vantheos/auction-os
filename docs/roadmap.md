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

## v1 — remaining

### Phase 4 — Settings + Users + Customers/Jobs polish ⬜

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

### Phase 5 — Auction Platform Export ⬜

Replaces the current hardcoded 15-column CSV export with a configurable
multi-platform system. v1 ships with one platform but the structure
supports adding more without further code work.

**Scope:**
- New `auction_platform` table — at minimum: `id`, `name`, `columns`
  (JSONB ordered list), `createdAt` / `updatedAt`. Possibly `separator`,
  `filenamePattern`, `includeHeaderRow`.
- `/api/auction-platforms` CRUD endpoints (admin only).
- Settings → "Auction Platforms" section: list / add / edit / delete.
- Augment `POST /api/lots/export` to accept a `platformId` parameter and
  apply that platform's column mapping.
- Inventory bulk-actions Export: replace single button with a platform
  picker.
- Seed first platform from real auction-site specs (provided at Phase 5
  planning time — NOT the current arbitrary 15-column layout, which was
  placeholder).

**Captured design decisions (tentative — revisit during Phase 5 spec):**
- **Column mapping shape:** Option B from the planning round —
  `{ header, lotField, formatter? }` per column. Formatter is optional
  and handles platform-specific quirks (date formats, currency formatting,
  enum value remapping, etc.). Final formatter list locked during the
  planning round.
- **Default platform:** Seeded via migration with the real first auction
  platform's specs (provided at planning time). Not the current
  placeholder format.
- **Existing 15-column hardcoded export:** Deprecated and replaced
  entirely. No backward-compatibility shim — the format was never used by
  a real platform.

**Open / deferred for Phase 5 planning:**
- **Image upload to auction platform** — noted as a real requirement for
  the export workflow but deferred. Out of scope for Phase 5 unless specs
  reveal it's small once we see the real platform's image handling. If
  non-trivial, splits to its own follow-up phase or v1.5.
- **Multi-platform support concrete count:** v1 ships with one configured
  platform; structure supports more without additional phases.
- **Sample CSV from first platform** — user provides during Phase 5
  planning; informs final schema shape.

### Phase 6 — AI subsystem ⬜

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
| T-G4 | `/users` admin UI | → Phase 4 (Settings + Users) |
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
