# Phase 4 — Settings + Users + Customers/Jobs polish

> **Date:** 2026-05-03 (planning round)
> **Status:** Drafted, not started — agreed scope locked in
> **Branch:** `phase-4-settings-users` off `phase-3-5-test-infra`
> **Slot:** Between Phase 3.5 sign-off and Phase 5 (Auction Platform Export)
> **Trigger:** Phase 3.5 left the Settings page partially placeholder (`AI schedule` and `Organization` sections shipped as "Configured in a future phase"), the `/users` nav link greyed-out as `(later)`, and the customer-jobs flow with a discoverable-but-easy-to-miss entry point. This phase completes the admin/config surface so the bootstrap admin can manage users + configure AI scheduling without raw SQL access, and bumps customer-list ergonomics ahead of Phase 5's auction-platform configuration arriving in the same Settings page.

## 1. Goal

Complete the admin/config surface so the bootstrap admin can fully manage the system through the UI: configure AI scheduling, add/configure other users, and find customers efficiently as the list grows. Settings page becomes fully functional. `/users` graduates from SQL-only to UI. Customer search + visibility polish lay the ergonomics groundwork for Phase 5's auction-platform configuration arriving in the same Settings page.

Non-goal: shipping anything that depends on the Phase 6 AI subsystem (the schedule UI persists configuration values that Phase 6 reads on startup; the "Run now" button + actual cron implementation are Phase 6 scope).

## 2. Why now

Three reasons:

1. **Bootstrap admin needs UI to add other users.** v1 cutover seeds one admin via `npm run seed:admin`; that admin must add Office and Warehouse users before opening the app to real users. Doing this via raw SQL against `app_user` + Supabase Admin API is ops-only territory; bringing it into the UI is required for a real user to onboard the team.
2. **AI schedule configuration is a Phase 6 dependency.** Phase 6 (AI subsystem) reads `system_settings.aiSchedule*` on startup to know when to run. Phase 4 ships the form that writes those values so Phase 6 has functional configuration the moment it lands.
3. **Customer search + row prominence get bigger payoff if shipped before Phase 5.** Phase 5 adds an "Auction Platforms" section to Settings; Customers page polish at the same time keeps the admin-UX work coherent. Plus the search will only matter more as customer count grows.

## 3. Scope

The phase splits into five areas. Each was discussed top-down in a focused planning round and locked.

### 3.1 Area 1 — `app_user.disabled_at` + JWT hook

The `app_user.disabled_at` column was added in Phase 1 as a forward-looking schema choice; the PATCH endpoint already accepts a `disabled: boolean` toggle that writes the timestamp. The missing piece is the JWT Custom Access Token Hook checking it before issuing a role claim.

**Migration `0009_jwt_hook_check_disabled.sql`** — recreates `public.custom_access_token_hook` with one additional WHERE clause:

```sql
SELECT role::text INTO user_role
FROM public.app_user
WHERE id = (event->>'user_id')::uuid
  AND disabled_at IS NULL;
```

If disabled, the SELECT returns no row → `user_role IS NULL` → existing `ELSE` branch writes `app_metadata.role = null`. Downstream behavior unchanged; just adds the gate.

**Server policy additions** in `api/users/[id].ts` PATCH handler:
- **Self-disable rejection** — return `403 CANNOT_DISABLE_SELF` when an admin PATCHes `disabled: true` on their own user. Same logic for hard delete (which we are NOT shipping in this phase, but the rule is permanent).
- **Last-admin protection** — count remaining active admins after the proposed change; return `403 CANNOT_DISABLE_LAST_ADMIN` if zero would remain.

**Token refresh latency accepted as documented limitation:** a disabled user keeps their existing JWT until it refreshes (~1 hour Supabase default). For a 3-user team this is acceptable; admin can manually revoke session via Supabase dashboard if urgent. Document in the disable confirm dialog: "They will lose access" implies "at next token refresh, within 1 hour."

**Hook differentiation deferred:** the hook writes `app_metadata.role = null` for both missing and disabled users (indistinguishable). v1 doesn't need user-facing copy distinguishing the two; Area 2's `/users` table shows admins the disabled status directly.

**Tests:**
- API: disable toggle round-trip, self-disable rejection (403), last-admin rejection (403), JWT-claim-null verification on disabled user.

### 3.2 Area 2 — `/users` admin UI

Build the page that's been a `(later)` placeholder in `AdminShell` nav since Phase 1. Server endpoints (`GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`) already exist; this area is mostly client work plus one small server change.

**Layout** — single-page table, matches the Customers page pattern. Default sort `createdAt DESC`. No filters needed at this scale.

**Columns:**
- displayName
- email — **enriched server-side** via Supabase admin client per GET. Adds one admin-API call per list fetch (negligible at this scale; admin client is already imported in `api/users/index.ts` for POST). No schema change.
- role
- status (Active / Disabled)
- created

**Add-user dialog** — fields per existing POST endpoint: email, password, role, displayName. On success, toast displays the initial password back to the admin: "User created. Initial password: xyz — share securely with the user." Matches the existing admin-creates-passwords auth model; no SMTP / invite-email path.

**Inline role change** — `<select>` per row with confirm dialog before save. Role changes are infrequent and consequential (admin can grant other admins); confirm catches mis-clicks.

**Disable / Re-enable button** per row — confirm dialog before save with copy: "Disable user X? They will lose access." Mirrors the consequence of the JWT hook gate. Same shape for re-enable.

**No hard delete in UI.** Hard delete only succeeds on users with zero referenced lots (FK constraint on `lot.intake_operator_id` is `ON DELETE no action`). For the narrow legitimate use case (typo'd email, test user from setup), the admin can clean up via Supabase dashboard. Disable is the primary operational path for separating departed users. Saves Area 2 from: a new DELETE endpoint, FK-violation handling, lot-count tracking, foot-gun-prevention UI.

**UI gates** — self-disable button hidden on the admin's own row; last-admin disable button disabled with tooltip when triggering would leave zero admins. Server still enforces (defense in depth).

**Server change** — extend `GET /api/users` to enrich each row with email from the Supabase admin client.

**Nav enable** — flip `enabled: false` to `true` on the Users entry in `src/components/shell/AdminShell.tsx`. Audit nav stays `(later)` (v2 work).

**Tests:**
- Hook: invalidation on add/role-change/disable
- Component: list renders, add-user dialog flow, role-change confirm dialog renders, disable confirm dialog renders, role-gating (warehouse can't reach this page — already enforced by `ProtectedRoute`)
- API: email-enrichment GET response

### 3.3 Area 3 — Settings → AI Schedule panel

Replace the current "Configured in a future phase" placeholder with a working form. Phase 6 will read these values at startup; until then, saving + displaying works correctly but the cron isn't wired.

**Schema migration** — replace `aiScheduleFrequency` enum with `aiScheduleIntervalHours int not null default 24`. Drop the `ai_schedule_frequency` enum type. Time-of-day column unchanged (still anchors the daily schedule; for non-24h intervals, the cron in Phase 6 will compute subsequent run times as offsets from this anchor).

Migration `0010_ai_schedule_interval_hours.sql`:
```sql
ALTER TABLE system_settings ADD COLUMN ai_schedule_interval_hours int NOT NULL DEFAULT 24;
ALTER TABLE system_settings DROP COLUMN ai_schedule_frequency;
DROP TYPE ai_schedule_frequency;
```

(v1 hasn't shipped to Prod, so destructive migration is safe.)

**Form fields:**
- Enable toggle (`aiScheduleEnabled`)
- Interval-hours `<select>` with options 4 / 8 / 12 / 24 (default 24)
- Time-of-day input (native `<input type="time">`, persists to `aiScheduleTimeOfDay`)

**Form behavior** — always editable regardless of toggle state. Toggle controls whether the cron runs (Phase 6 reads it); configuration is independent. Lets admin pre-configure without click-back-and-forth.

**No "Run now" button in Phase 4.** Ships in Phase 6 alongside the AI backend (the button needs a live event handler, not just persisted config — would require pulling the entire AI subsystem into Phase 4).

**No schedule preview, no toggle confirm dialog.** KISS.

**Save UX** — single "Save changes" button + success toast "Settings saved" (matches existing Label Printer panel pattern); danger toast with server message on failure.

**Server change** — extend `/api/system-settings` PATCH zod schema to accept the AI fields. Currently only accepts `labelPrinterHelperUrl`.

**Hook change** — extend `useUpdateSystemSettings` input type to include the AI fields. Currently typed only for `labelPrinterHelperUrl`.

**Frequency rationale** (captured for posterity):

The original schema had `aiScheduleFrequency` as an enum of `('hourly', 'daily')`. During planning, we re-thought this: hourly batching has marginal cost benefit over real-time (if you're processing N lots/hour individually vs N lots/hour in one batch, the API call savings are minimal). The actual cost benefit of scheduling comes from larger batches at less-frequent intervals — daily / 12h / 8h / 4h. Integer-hours schema is more flexible than an enum (future intervals don't need a migration).

Real-time on-lot-create vs scheduled batching is a Phase 6 design question — not certain at this point. Captured for the Phase 6 spec discussion.

**Tests:**
- Hook: invalidation on save, error toast wiring
- Component: form save round-trip
- API: PATCH accepts AI fields with valid + invalid payloads

### 3.4 Area 4 — Drop "Organization" placeholder

Trivial. The "Organization" section in `Settings.tsx` was a misnamed placeholder for what would become user management; user mgmt now lives at `/users` (Area 2). Delete the placeholder section block:

```tsx
<section className="rounded-lg border border-border bg-surfaceAlt p-4 opacity-60">
  <h2 className="text-base font-semibold text-text">Organization</h2>
  <p className="text-sm text-textDim mt-1">Configured in a future phase.</p>
</section>
```

No replacement — clean removal.

(Phase 5's Auction Platforms section will be ADDED later as a fresh section, structured around its real CRUD content rather than reusing this placeholder.)

### 3.5 Area 5 — Customers/Jobs polish + customer search

Two small UX improvements on the Customers page. Job creation already exists in `/customers/:id` (verified during Phase 4 planning) — the entry point was just easy to miss.

**Whole-row-clickable customer rows** — clicking anywhere on a customer row navigates to `/customers/:id`. Replace the current "View jobs →" link.

**Discoverability layer (three signals stacked):**
1. One-line description below the "Customers" page heading: "Click a customer row to view and manage their jobs." Explicit for first-time users; fades into background after a few visits.
2. Persistent `ChevronRight` icon (lucide-react) right-aligned per row. Universal "navigate into" affordance; no language dependency.
3. Hover state per row — `hover:bg-surfaceAlt` + `cursor-pointer`. Confirms interactivity at the moment of mouse-over.

**Customer search** — text input above the table (next to the "New customer" button). Case-insensitive substring match on customer name, client-side filter on the existing query result. Empty-state when filtered: "No customers match '<query>'."

Search-by-job-number is NOT in scope for v1 (different data, different scope; jobs are nested under customers — cross-customer job search is a separate feature). Defer to v1.5+ if needed.

**Tests:**
- Component: row click navigates, search filters list, empty-state renders when no matches.

## 3.6 Out of scope (deliberately)

- **Hard delete user via UI** — see Area 2 rationale (FK constraint blocks for users with lots; narrow legitimate use case handled via Supabase dashboard out-of-band)
- **Per-customer job filter / cross-customer job search** — different data model; defer to v1.5+ if needed
- **`/audit` page** — v2 work (T-G5)
- **Auction Platforms section in Settings** — Phase 5 scope
- **AI "Run now" button** — Phase 6 scope (needs live event handler / backend)
- **AI scheduled cron implementation** — Phase 6 scope (Phase 4 ships the configuration values; Phase 6 reads them)
- **First-run / empty-states polish** — eliminated entirely (T-G6 dropped during Phase 3.5 wrap-up; single-tenant hands-on install per client)

## 4. Effort estimate

| Area | Effort |
|---|---|
| 1 — `app_user.disabled_at` + JWT hook | ~0.5 day |
| 2 — `/users` admin UI | ~1.5 days |
| 3 — Settings → AI Schedule panel | ~0.5 day |
| 4 — Drop Organization placeholder | ~10 minutes |
| 5 — Customers/Jobs polish + customer search | ~0.5 day |
| Sign-off testing + STATE.md / roadmap.md updates | ~0.25 day |
| **Total** | **~3.5 days** |

## 5. Sequencing

1. **Branch** — create `phase-4-settings-users` off `phase-3-5-test-infra`
2. **Area 1 first** — schema + JWT hook + server policy. Foundation for Area 2.
3. **Area 2** — `/users` UI. Largest area. Uses Area 1.
4. **Area 3** — Settings → AI Schedule panel. Self-contained.
5. **Area 4** — Drop Organization placeholder. Trivial; can interleave with Area 3.
6. **Area 5** — Customers/Jobs polish + customer search. Self-contained.
7. **Pre-sign-off** — pre-push trio (build + lint + test, all green), preview deploy, manual click-through covering: add user via UI, role change with confirm, disable + re-enable with token refresh observation, AI schedule save + reload, dropped Organization section, whole-row-click navigation, customer search filter
8. **Sign off Phase 4** — same gate as other phases: all trio green, all new mutation hooks have tests per `docs/testing-policy.md`, manual sign-off click-through clean, STATE.md + roadmap.md updated

## 6. Acceptance gate

- [ ] All migrations applied to Dev + Test
- [ ] `npm test` 200+ tests, all green (181 baseline + Phase 4 additions)
- [ ] `npm run lint` 0/0
- [ ] `npm run build` clean
- [ ] All new mutation hooks (deactivate user, save AI schedule) have tests per `docs/testing-policy.md` — invalidation + error toast
- [ ] Manual sign-off click-through:
  - Bootstrap admin can add a new user via `/users` UI
  - Bootstrap admin can change another user's role
  - Bootstrap admin can disable + re-enable another user; disabled user loses access at next JWT refresh
  - Self-disable + last-admin attempts blocked at server with clear error toast
  - AI Schedule form saves + reloads with persisted values
  - Settings page no longer shows "Organization" placeholder
  - Customers page row click navigates to detail; search filters the list; empty-state renders correctly
- [ ] STATE.md updated with Phase 4 sign-off summary + any spec deviations
- [ ] roadmap.md updated to mark Phase 4 ✅ (and Phase 5 becomes "next")

## 7. Captured decisions (locked during planning round)

For traceability if anything is reconsidered later:

| Decision | Outcome |
|---|---|
| Token refresh latency on disable (Area 1) | Accept the ~1-hour gap as documented limitation. No forced revocation; no per-request DB lookup. |
| Self-disable prevention (Area 1) | Server returns 403 `CANNOT_DISABLE_SELF`. UI hides the button on own row. |
| Last-admin protection (Area 1) | Server returns 403 `CANNOT_DISABLE_LAST_ADMIN`. UI disables the button + tooltip when triggering would leave zero admins. |
| Hook differentiation between missing and disabled (Area 1) | None — both write `app_metadata.role = null`. UI surfaces disabled status in `/users` directly. |
| Email in `/users` list (Area 2) | Show. Enriched server-side via Supabase admin client per GET. No schema change. |
| Add-user password handling (Area 2) | Admin sets initial password; success toast displays it back for handoff. No invite-email flow. |
| Role change UX (Area 2) | Inline `<select>` + confirm dialog before save. |
| Disable toggle UX (Area 2) | Inline button + confirm dialog: "Disable user X? They will lose access." |
| Hard delete in UI (Area 2) | Dropped entirely. Disable is primary; out-of-band cleanup via Supabase dashboard for the narrow typo case. |
| AI schedule frequency shape (Area 3) | Integer hours (`aiScheduleIntervalHours int`) replacing the `(hourly, daily)` enum. Schema migration drops the old enum type. |
| AI schedule frequency options (Area 3) | 4 / 8 / 12 / 24 hours. Hourly removed (marginal benefit over real-time). |
| AI form behavior when disabled (Area 3) | Always editable. Toggle controls cron; configuration is independent. |
| Time picker (Area 3) | Native `<input type="time">`. |
| AI "Run now" button (Area 3) | Deferred to Phase 6 alongside the AI backend. |
| Schedule preview / toggle confirm (Area 3) | None. KISS. |
| Organization placeholder (Area 4) | Drop entirely. No reuse for Phase 5's Auction Platforms section. |
| Customer row interaction (Area 5) | Whole row clickable; navigates to `/customers/:id`. |
| Customer row discoverability (Area 5) | Description text + persistent ChevronRight icon + hover state — three signals stacked. |
| Customer search shape (Area 5) | Client-side substring match on name; text input above table. No job-number search. |

## 8. Open questions / carry-forwards

These don't block Phase 4 implementation but are worth surfacing so they're addressed at the right time.

1. **Email enrichment implementation detail** — admin-client-per-GET (current plan) vs caching email in `app_user`. Decide during Area 2 implementation if the admin-client call ends up being slower or flakier than expected. Default to admin-client per the planning decision.
2. **Phase 6 AI design — real-time on lot creation vs scheduled batching only.** Captured during Area 3 planning. Belongs in the Phase 6 spec discussion.
3. **Phase 6 AI design — "Run now" button placement.** Phase 4's AI Schedule panel is the natural home; Phase 6 just adds the button. Phase 6 spec should confirm.
4. **Customer search server-side migration path** — current scope is client-side. If customer count grows beyond a few hundred, server-side ILIKE search would be a small addition (debounced query parameter on GET). Not blocking; track as a v1.5+ consideration.
