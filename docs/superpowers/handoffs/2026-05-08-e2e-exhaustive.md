# Pre-Phase-7 End-to-End Test Checklist — Exhaustive (~half-day)

> Created 2026-05-08. The deeper variant of [`2026-05-08-e2e-balanced.md`](2026-05-08-e2e-balanced.md).
> Adds every error path, every state transition, every role on every gated
> affordance, every filter combination, every toast variant, every confirm
> path. Run before Phase 7 (Label printing) when you want maximum
> regression coverage. Cron-fired tests deferred to
> [`prod-cutover-test-checklist.md`](prod-cutover-test-checklist.md).
>
> If you want a faster regression sweep, run the balanced doc instead.
> The balanced doc is a strict subset of this one.

## How to use

- **Section A** is no-token UI/plumbing. Run first; no Anthropic spend.
- **Section B** spends Anthropic tokens (~$0.03–$0.07 per lot).
- **Section M** is mobile-only items where the surface diverges from desktop.
- **Section R** is exhaustive role gating — every gated affordance verified for every role.
- **Section X** is concurrency / race / edge-case coverage.

Default role for Sections A, B, and M is **Admin** unless stated otherwise.

If something fails, capture the symptom, mark the box, and continue or stop based on severity. Carry-forwards / surprises go in **Notes** at the bottom.

---

## Before you start

### Environment preflight
- [ ] Latest preview deploy ready: `vercel ls auction-os --scope vantheos-4047s-projects | head -3` shows the most recent commit on the working branch.
- [ ] `ANTHROPIC_API_KEY` and `CRON_SECRET` set in Vercel preview env (`vercel env ls preview | grep -E "ANTHROPIC|CRON"`).
- [ ] Both Dev and Test DBs at the same migration head as `supabase/migrations/`.
- [ ] `.env` DATABASE_URL points to Dev DB (preview's database — not Test, not Prod).
- [ ] Browser cache cleared on test devices (or use an Incognito / private window).
- [ ] Anthropic billing dashboard open in another tab (for Section B).
- [ ] Supabase Studio SQL editor open against Dev DB (for manual SQL items).

### Account preparation
- [ ] One Admin (e.g., `admin@example.com`) with a known password.
- [ ] A second Admin available — needed for last-admin-protection round-trip.
- [ ] One Office account.
- [ ] One Warehouse account.
- [ ] One disabled user of any role.

### Test fixtures (Dev DB)
Create these up front so individual checks don't have to seed during the run.

- [ ] **Customers**:
  - C1: with sellerCode set + active.
  - C2: without sellerCode + active.
  - C3: with sellerCode + disabled (will use for re-enable).
- [ ] **Jobs**:
  - J1 under C1: ≥3 assigned lots, all with photos and (title, description, price) populated → fully export-ready.
  - J2 under C1: ≥3 assigned lots, at least one missing title/description/price → export gate disabled.
  - J3 under C1: 0 assigned lots (all sold/picked-up/not-sellable) → export gate disabled (no assigned).
  - J4 under C2: ≥1 assigned lot fully populated → export gate disabled (no sellerCode).
- [ ] **Lots**:
  - L_ELIGIBLE: ≥5 lots in assigned/unassigned, `lastAiRunStatus IS NULL`, ≥1 of (title, description, price) empty.
  - L_FILLED: 1 lot with status=NULL but all 3 fields populated by operator (eligibility-skip case).
  - L_SUCCESS: 1 lot with `lastAiRunStatus = 'success'`, all fields filled.
  - L_PARTIAL: 1 lot with `lastAiRunStatus = 'partial'`, with `lastAiRunError` non-NULL.
  - L_FAILURE: 1 lot with `lastAiRunStatus = 'failure'`, with `lastAiRunError` non-NULL.
- [ ] If you need fresh data: `npm run seed:test-lots` then create the variants above via the UI / SQL.
- [ ] For multi-batch export: `npm run seed:export-stress` creates a 120-lot job (not required for this checklist; reserve for future stress runs).

---

## Section A — UI + plumbing (no AI executions)

### A.1 Auth + role redirect (every role)
- [ ] Sign in as Admin → redirected to /inventory.
- [ ] Sign in as Office → redirected to /inventory.
- [ ] Sign in as Warehouse → redirected to /catalog.
- [ ] Sign out from each role: lands on /login with no `?redirect=` parameter; toaster cleared (no leftover toasts from previous session).
- [ ] Sign in as a disabled user → bounced to /login with banner: *"This account has been disabled. Contact an admin to regain access."*
- [ ] /login with `?redirect=/inventory`: after a successful sign-in, lands at /inventory.
- [ ] /login with `?inactive=1` shows the disabled-account banner without a sign-in attempt.
- [ ] Sign out from /catalog (warehouse): lands on /login (no `?redirect=/catalog` leak that would honor warehouse home).
- [ ] Direct URL sanity: as Warehouse, navigate to `/users`, `/customers`, `/settings`. Each is either redirected or "not allowed" — never reached.

### A.2 Inventory list, filters, search, URL persistence
- [ ] /inventory loads. Lots display in expected order (intake_timestamp DESC by default).
- [ ] **State chips**: each of `assigned`, `unassigned`, `sold`, `picked-up`, `not-sellable` toggles independently. URL reflects each state. Multiple states = OR within state filter.
- [ ] **Search**: type partial title; list narrows. Backspace to clear restores list.
- [ ] **Customer filter**: pick a customer; URL gains `?customerId=...`. Job picker becomes scoped to that customer's jobs.
- [ ] **Job filter**: pick a job; URL gains `?jobId=...`.
- [ ] **Awaiting AI** chip (covered in A.11b also): toggle.
- [ ] **Needs review** chip (covered in A.11b also): toggle.
- [ ] **Clear all filters**: button resets every chip, search, customer, job; URL drops all params; list restores to full.
- [ ] Browser back / forward: filter state survives navigation (URL-driven).
- [ ] Refresh on a filtered URL: filters survive.
- [ ] Open lot detail then close: URL filter params survive (don't get wiped — uses `setSearchParams` with merge, not Link replacement).
- [ ] Bookmark a filtered URL, open in new tab: filters apply.
- [ ] Active-filter badge in the page header: count includes every active flag.

### A.3 Single-lot edit (LotDetail dialog)
- [ ] Click any lot row → dialog opens.
- [ ] **Save successful**: edit title, save → success toast *"Lot updated"*; form reset to saved state; dialog stays open.
- [ ] **Save failure**: with the dialog open, enter a malformed price (e.g., letters). Server rejects. Danger toast with server error message. Form stays dirty.
- [ ] **Unsaved-changes guard — Cancel**: edit a field, click outside the dialog. Confirm dialog appears: *"Discard unsaved changes?"*. Click Cancel. Edit dialog stays.
- [ ] **Unsaved-changes guard — Discard**: same as above, but click Discard. Edit dialog closes; edits dropped.
- [ ] **Unsaved-changes guard — Escape key**: confirm dialog also fires.
- [ ] **Unsaved-changes guard — X button**: confirm dialog also fires.
- [ ] **Frozen lot — sold**: open a sold lot. Form is read-only ("🔒 Read-only" pill). Photos render as static grid (no add, no manage). No Save / Move / Delete buttons.
- [ ] **Frozen lot — picked-up**: same as sold.
- [ ] **Frozen lot — not-sellable**: form read-only. Static photo grid (with `opacity-60` styling). State change to unassigned is the only allowed transition (in admin/office; warehouse cannot change state).
- [ ] **Photo cover thumbnail**: lot detail header shows the actual cover image (not an empty styled div) when at least one photo exists.

### A.4 Photo management
- [ ] **Capture (desktop)**: in a non-frozen lot, click camera icon. File picker opens. Pick a JPG. Thumbnail appears, pending → uploaded within ~10s. PhotoStrip count updates.
- [ ] **Capture rejected (non-image MIME)**: try to upload a `.webp` file. Pre-server validation catches it. Error toast appears. No orphan `lot_photo` row created (verify via SQL: `SELECT COUNT(*) FROM lot_photo WHERE lot_id = '<lotId>' AND status = 'failed';` is unchanged).
- [ ] **PhotoManager — open**: tap a thumbnail. Full-screen overlay opens; focused on the tapped photo.
- [ ] **PhotoManager — reorder**: drag-reorder photos. Save. Reopen lot detail → cover thumbnail updates to the new first photo.
- [ ] **PhotoManager — delete one**: confirm prompt → confirmed → photo gone. Display order re-indexed (slot 1 cover follows whoever is in slot 1 now).
- [ ] **PhotoManager — delete last photo**: server returns 422 (`enforce_lot_has_photo`). Danger toast with server error message.
- [ ] **PhotoManager — close**: returns to LotDetail dialog (still open and intact). PhotoManager rendered inside the parent dialog's tree (not portaled), so this round-trip works.
- [ ] **Pending uploads indicator (catalog)**: failed pill appears when any upload terminally fails. Click → popover lists failed entries with **Retry** and **Discard**. Discard also DELETEs the orphan `lot_photo` row server-side (verify via SQL).
- [ ] **Long photo strip layout**: lot with 12 photos. Each thumbnail is 80px fixed-width. Strip horizontally scrolls. Chevron arrows visible when overflowing. Strip does NOT widen the dialog past `max-w-sm` cap.

### A.5 Bulk actions
- [ ] **Bulk Assign to Job**: select 2+ assigned/unassigned lots, click bulk Assign to Job. Pick destination, optionally check Reprint. Toast confirms; selected lots moved; reprint triggers a label render call per lot (no error if printer helper unreachable — failure is non-blocking).
- [ ] **Bulk Change state — assigned → sold**: select 2+ assigned lots, change state to `sold`. Confirm dialog (terminal state). Confirmed → state flipped; lots become frozen.
- [ ] **Bulk Change state — sold → unassigned (forbidden)**: select sold lots, try to change to unassigned. Server rejects (state machine doesn't allow this transition); danger toast.
- [ ] **Bulk Change state — partial mix**: select assigned + sold lots, attempt change to unassigned. Mixed handling: state machine rejects on per-lot basis. Danger toast itemizing affected lots.
- [ ] **Bulk Reset AI**: select lots with status=success/partial/failure → confirm dialog showing count + field-preservation language → Cancel → no change. Re-open → confirm → dialog closes; status cleared on all selected lots; pending-AI badge increments.
- [ ] **Bulk Reset AI — lock conflict**: set `ai_processing_started_at` to NOW on one of the selected lots; bulk Reset AI → that one lot rejected with 409 LOT_AI_IN_PROGRESS; others succeed; toast itemizes the rejected lot. Cleanup the lock.
- [ ] **Bulk Delete**: select 2+ lots; bulk Delete → confirm dialog requires DELETE typed in. Cancel and confirm both work. Confirmed → lots gone from list; success toast.
- [ ] **Bulk action with 0 selected**: bulk action bar not visible. Clicking checkboxes 0→1 reveals the bar.
- [ ] **Toolbar position**: bulk action bar is fixed at the bottom on desktop, integrated with mobile filter sheet on mobile.

### A.6 Single-lot mutations + state transitions
- [ ] **State assigned → sold (terminal)**: confirm dialog appears; on confirm, state flips, lot frozen.
- [ ] **State assigned → picked-up (terminal)**: same shape.
- [ ] **State assigned → not-sellable**: terminal-style confirm; state flips.
- [ ] **State unassigned → not-sellable**: confirm; flips. (Only legal transition from unassigned via PATCH.)
- [ ] **State sold → not-sellable (forbidden)**: option not shown in menu (frozen state). Direct PATCH attempt returns 422 INVALID_STATE_TRANSITION.
- [ ] **State unassigned → assigned (forbidden via PATCH)**: option not shown. Move endpoint is the only path.
- [ ] **State not-sellable → unassigned (allowed)**: confirm dialog; state flips back; lot un-frozen.
- [ ] **Move to another job**: select a destination customer + job, optionally Reprint. Toast confirms. Lot relocates; lot_number updates.
- [ ] **Delete single lot — confirm typed text**: dialog requires `DELETE` typed in. Empty / wrong text → button disabled. Confirmed → lot removed; dialog closes; success toast; URL filter params preserved.
- [ ] **Delete during dirty form**: open lot detail, edit a field (don't save), click Delete → confirm → confirmed. Should NOT prompt unsaved-changes guard (delete reset the dirty state).

### A.7 Catalog session — desktop (mobile in §M)
- [ ] /catalog landing page. Customer + Job pickers via native `<select>`.
- [ ] Disabled customer hidden from picker (Phase 5 fix).
- [ ] Pick C1 + J1, click **Start session**. URL becomes `/catalog/session?lotId=<uuid>`.
- [ ] Form layout: photo strip + camera button at top, Quantity + Untested toggle row, full-width Special Notes (category + text), **Additional Info** chevron-collapse hiding Title/Description/Price/Ref1/Ref2.
- [ ] Header shows customer name + job number.
- [ ] Pending uploads indicator visible below photo strip.
- [ ] Add 1 photo (file picker, JPG). Thumbnail pending → uploaded.
- [ ] Open Additional Info; fill Title and Price; close collapse.
- [ ] **Save → Next**: form clears; new lot's URL with new lotId.
- [ ] **Save → Done**: ends session immediately; returns to /catalog.
- [ ] **End session — empty session**: confirm dialog says 0 lots saved; confirm → returns to /catalog.
- [ ] **End session — N lots**: confirm dialog shows accurate count; confirm → returns; the N lots appear in /inventory.
- [ ] **Quantity input**: backspace works (free-edit until blur). Empty defers; on blur, snaps to 1 if empty/invalid. Typing `0` → snaps to 1 on blur.
- [ ] **Special notes — TOOL ONLY / READ / CLOTHING**: pick category; fill text. Saved correctly.
- [ ] **Untested toggle**: flip on; saved on the lot.

### A.8 Customer + Job management
- [ ] /customers list shows sellerCode (or "—"), disabled badge for disabled customers, name.
- [ ] **Create customer**: name + sellerCode. Save. Customer appears.
- [ ] **Create customer — empty sellerCode**: allowed; saved as null.
- [ ] **Create customer — sellerCode > 50 chars**: server rejects; danger toast with reason.
- [ ] **Customer detail page**: customer name + sellerCode + jobs list visible.
- [ ] **Create job**: jobNumber + startBid + shippable. Save. Job appears.
- [ ] **Create job — duplicate jobNumber within same customer**: server rejects; danger toast.
- [ ] **Edit customer — name change**: PATCH only sends `name`; save; persists.
- [ ] **Edit customer — sellerCode change**: PATCH only sends `sellerCode`; save; persists.
- [ ] **Edit customer — blank existing sellerCode**: blanking out doesn't send `sellerCode` (no-op rather than null override).
- [ ] **Disable customer**: confirm dialog → confirmed → disabled badge appears; cataloging picker hides this customer.
- [ ] **Disabled customer — new job blocked**: detail page shows New job button disabled with tooltip.
- [ ] **Re-enable customer**: confirm → confirmed → badge gone; cataloging picker shows again.
- [ ] **Edit job — jobNumber + startBid + shippable in one save**: combined PATCH; persists.
- [ ] **Edit job — startBid validation**: malformed startBid (letters) → server rejects.

### A.9 Settings panel — admin
- [ ] /settings loads. Sections: Label printer, AI (Schedule + Cost), Auction Platforms.
- [ ] **Label printer — save URL**: enter URL; save; toast; persists.
- [ ] **Label printer — Test reachable**: with Browser Print running locally, Test → ✓ Helper reachable.
- [ ] **Label printer — Test unreachable**: stop Browser Print; Test → ✗ Helper unreachable.
- [ ] **AI Schedule — toggle off + save**: toggle off; save; toast confirms; refresh — value persists.
- [ ] **AI Schedule — interval round-trip**: change interval to each of 4 / 8 / 12 / 24; save each; round-trip after refresh.
- [ ] **AI Schedule — time-of-day round-trip**: change to a known time; save; refresh; HH:MM displayed correctly (server stores HH:MM:SS).
- [ ] **AI Schedule — invalid time format**: try to PATCH `aiScheduleTimeOfDay: 'bogus'` directly via DevTools/network. Server rejects 400.
- [ ] **AI Schedule — interval < 1**: PATCH `aiScheduleIntervalHours: 0`. Server rejects 400.
- [ ] **AI Cost panel**: MTD dollar amount, lifetime dollar amount, "Average per lot" or "no data yet". Numbers update after AI runs (verify in §B).
- [ ] **Auction Platforms panel**: read-only; AF360 row visible; cron schedule for cleanup visible; no edit affordances.

### A.10 Users admin
- [ ] /users loads. Table with email, role, status (active/disabled).
- [ ] **Add user — happy path**: fill email + role; submit. One-time password toast persists 30s with a Copy action. Copy button → clipboard (paste anywhere to verify).
- [ ] **Add user — email already exists**: server returns 409; danger toast.
- [ ] **Add user — invalid email**: client rejects on submit (or server returns 400).
- [ ] **Change role of an existing user**: confirm dialog mentions old → new role. Cancel → no change. Confirm → role updated; table refreshes.
- [ ] **Disable another user**: confirm dialog → confirmed → status updated to disabled.
- [ ] **Re-enable a disabled user**: confirm → confirmed → status flips.
- [ ] **Last-admin protection — disable**: with only one active admin, try to disable that admin. Server rejects with `CANNOT_REMOVE_LAST_ADMIN`; danger toast: *"Cannot remove last admin"*. Verify the user remains active.
- [ ] **Last-admin protection — role demote**: try to change the last active admin's role to office or warehouse. Server rejects with same error.
- [ ] **Self-disable allowed only with disabled=false (no-op)**: PATCH disabled=false on yourself → no error (no-op self-enable). PATCH disabled=true on yourself → server rejects (you can't kick yourself out).
- [ ] **Disable an admin when 2+ active admins exist**: succeeds.

### A.11 AI subsystem — UI/plumbing only

#### A.11a Pending-AI badge
- [ ] Settings shows `N lots pending AI` matching count of L_ELIGIBLE.
- [ ] Singular form: when N=1, badge reads `1 lot pending AI`.
- [ ] Move L_ELIGIBLE lot to sold. Reload. Badge decrements.
- [ ] Set back to assigned. Reload. Badge increments.
- [ ] L_FILLED (operator-completed) lot does NOT count toward the badge despite status=NULL.

#### A.11b Filter chips — Awaiting AI / Needs review
- [ ] Two chips visible. Legacy "Needs Info." chip is gone.
- [ ] **Awaiting AI**: list = lots with status=NULL + eligible state + ≥1 of (title, description, price) empty. Count matches badge. L_FILLED NOT shown.
- [ ] **Needs review**: list = lots with status='partial' or 'failure' (after AI has run). L_PARTIAL and L_FAILURE both shown.
- [ ] **Both chips on**: list = union; active-filter count goes up by 2.
- [ ] **Awaiting AI off, Needs review off**: list returns to no-AI-filter state.
- [ ] **Clear all filters**: both AI chips clear; URL drops both flags.
- [ ] **Legacy `?needsInfo=true`**: URL alone loads the union; subsequent UI interaction rewrites to the new flags.
- [ ] **Mobile parity**: mobile filter sheet has same two chips with same behavior (covered in §M).

#### A.11c Run AI button visibility (no execution)
- [ ] Eligible lot (status NULL): Run AI visible.
- [ ] L_FILLED (status NULL but all 3 fields filled): Run AI visible but **disabled** with title tooltip about clearing a field.
- [ ] L_SUCCESS: Run AI hidden; Reset AI visible (admin/office).
- [ ] L_PARTIAL: Run AI hidden; Reset AI visible.
- [ ] L_FAILURE: Run AI hidden; Reset AI visible.
- [ ] Frozen states (sold/picked-up/not-sellable): both buttons hidden.
- [ ] As Warehouse: both buttons hidden on every lot.

#### A.11d Reset AI — single-lot
- [ ] On L_SUCCESS, click Reset AI. Toast: *"AI status reset"* with description *"Clear a field to re-run AI."* (because all 3 fields are filled).
- [ ] Verify status went back to NULL via badge increment + filter chip.
- [ ] Run AI button now visible but disabled (all fields filled).
- [ ] Clear one field manually + save. Reset AI is now meaningless (already cleared) — Run AI is now enabled.
- [ ] On L_PARTIAL: Reset AI works; toast description omits "Clear a field" (since at least one field was empty already).
- [ ] On L_FAILURE: Reset AI works; toast confirms.
- [ ] **Lock conflict**: set `ai_processing_started_at = NOW()` on a lot with `lastAiRunStatus = 'success'`. Click Reset AI. Server returns 409 LOT_AI_IN_PROGRESS; danger toast: *"AI is currently running on this lot; wait for it to complete"*. Cleanup: set the timestamp back to NULL.

#### A.11e Bulk Reset AI
- [ ] Select 3+ status≠NULL lots → bulk Reset AI → confirm dialog with count + field-preservation language.
- [ ] Cancel → no change.
- [ ] Confirm → all selected statuses cleared; pending-AI badge increments by the count of those that have ≥1 empty field.
- [ ] Mixed selection (status=success + status=NULL): only the status≠NULL lots get reset; status=NULL ones are silent no-ops server-side.

#### A.11f PATCH lock guard (manual SQL)
- [ ] `UPDATE lot SET ai_processing_started_at = NOW() WHERE id = '<id>';`
- [ ] Refresh the lot in UI. Banner appears; field inputs disabled.
- [ ] Edit a non-state field via PATCH (manually trigger by editing in UI). Server returns 423; toast shows error.
- [ ] State change PATCH succeeds (state edits not lock-guarded).
- [ ] Wait 5 minutes (or set timestamp 6 minutes ago). Banner clears within ~5s.
- [ ] Field inputs re-enable.
- [ ] Cleanup: `UPDATE lot SET ai_processing_started_at = NULL WHERE id = '<id>';`

#### A.11g Server-state-aware Run Now button (post-2026-05-08 fix)
- [ ] Set `UPDATE system_settings SET ai_run_lock_until = NOW() + INTERVAL '5 minutes' WHERE id = 1;`
- [ ] Open Settings. Run Now button shows **Running…**, disabled — even though the local mutation observer never fired.
- [ ] Refresh the page. Still **Running…**.
- [ ] Navigate to /inventory and back. Still **Running…**.
- [ ] Watch for ~5s — `useSystemSettings` polls; `aiPendingLotCount` may update if any lots finalize concurrently (none should during this manual test).
- [ ] Cleanup: `UPDATE system_settings SET ai_run_lock_until = NULL WHERE id = 1;`
- [ ] Refresh. Button re-enables to **Run Now**.

### A.12 AF360 export — per-job batch
- [ ] **J1 fully ready**: filter to C1 + J1 in inventory. Export to AF360 button enabled. Click → progress copy *"Building batch 1 of M..."* → success → Vercel Blob URL appears.
- [ ] Open the URL in a new tab. ZIP downloads. Inspect: `lots.csv` matches AF360 spec column set; `photos/<lot_number>/<n>.jpg` files for each lot.
- [ ] **J2 missing-fields gate**: filter to J2. Button **disabled** with tooltip indicating not all assigned lots have title + description + price.
- [ ] **J3 no-assigned gate**: filter to J3 (all sold/picked-up). Button **disabled** with tooltip *"No lots in assigned state for this job"*.
- [ ] **J4 missing-sellerCode gate**: filter to C2 + J4. Button **disabled** with tooltip about sellerCode requirement, or click → server returns SELLER_CODE_REQUIRED → danger toast (depending on whether the gate is client-side or server-side).
- [ ] **Customer detail page**: open C1 detail; per-job export buttons rendered with the same gating logic.
- [ ] **Inventory-level Export to AF360 button**: filtered to a job, button visible alongside filter bar; click works the same as the per-job button.
- [ ] **Retry after `/start` failure**: simulate by restoring a sellerCode mid-export. (Or: trigger an error path artificially via SQL — set sellerCode to NULL temporarily, click Export, see SELLER_CODE_REQUIRED, set sellerCode back, click Retry. Should re-run the full flow, not silently no-op.)
- [ ] **Vercel Blob cleanup**: cleanup-export-blobs cron is scheduled; deferred to prod test.

### A.13 Audit log spot-check (read-only)
- [ ] After any of the above writes, query Supabase Studio:
  ```sql
  SELECT changed_at, table_name, change_type, changed_by
  FROM audit_log ORDER BY changed_at DESC LIMIT 10;
  ```
- [ ] Verify entries exist for the writes you performed; `changed_by` is your user-id (not NULL — that's only for cron-driven AI claims).

### A.14 Toast pipeline regression
- [ ] Toaster mounts globally (verify by triggering a toast on /inventory and seeing it appear at bottom-right).
- [ ] `z-[60]` on Toaster — toast visible above an open Dialog.
- [ ] Toast auto-dismiss timing: 5s default; 30s for AI run completion / users dialog; 60s for danger AI errors.
- [ ] Manual dismiss via × button works.
- [ ] `clearAll()` fires on sign-out (no leftover toasts in the next user's session).

---

## Section B — AI executions (real Anthropic tokens)

### B.1 Probe smoke test — caching verification
- [ ] `npm run probe:ai -- --lots 5` against Dev. First call: `cache_write=NNNN` (no cache_read). Subsequent calls within ~5 min: `cache_read=NNNN` non-zero; per-call cost lower.
- [ ] Output spot-check (5 lots): titles ≤50 chars; descriptions plain prose; prices reasonable USD numbers.
- [ ] Total cost matches estimate (~5 × $0.03 = ~$0.15).
- [ ] Cost counters NOT bumped (probe skips counters by design).

### B.2 Probe sign-off batch — quality review
- [ ] `npm run probe:ai -- --lots 30 --write` (the write flag persists outputs).
- [ ] Spot-check 10 lots: title format `$NNN- Qx Brand brief description` (with TOOL ONLY / READ suffix where applicable); descriptions are single-paragraph plain text with visible-condition mentions, no "tested/untested" speak (UNTESTED appended separately); prices not implausibly off.
- [ ] Note any wrong/weird outputs with lot IDs for prompt-tuning.
- [ ] **Cost counters NOT bumped** despite `--write` (counters are only bumped through finalizeLotRun → bumpAiCounters, not the probe path).

### B.3 Run AI per-lot
- [ ] Open a fresh eligible lot. Click **Run AI**.
- [ ] Banner appears within ~1s; field inputs disabled.
- [ ] Within ~30-60s, banner clears; title/description/price populated.
- [ ] `lastAiRunStatus` = success / partial / failure visible. On non-success, `lastAiRunError` set with a meaningful string.
- [ ] Settings → Cost panel: MTD bumped; run count incremented.
- [ ] Pending-AI badge decremented by 1.
- [ ] Repeat with a lot that has manually-entered title (only). Expect: title preserved; description + price filled by AI; status='success' or 'partial' depending on which fields AI set.
- [ ] **Run AI on L_FILLED** (operator-filled all 3 fields, status NULL): Run AI button is disabled (already covered in A.11c). Manually trigger via API: should be a no-op or skip — finalizeLotRun's status-aware logic preserves all 3 fields; outcome is wasted spend. Server-side, the call still happens. Confirm cost bumped but no field changes.

### B.4 Run Now full drain — small batch
> Pre-condition: 3-5 lots queued, each likely to AI-succeed.

- [ ] Click **Run Now**. Immediate info toast (30s): *"AI run started — N lots queued..."*.
- [ ] Button text → **Running…**, disabled.
- [ ] Pending-AI badge ticks down live (5s polling).
- [ ] On success completion (remaining=0): success toast *"Processed N lots. Backlog cleared."* (30s).
- [ ] Cost counters increment. Pending-AI badge → 0.

### B.5 Run Now — partial completion (CAP_PER_INVOCATION reached)
> Pre-condition: 25+ lots queued.

- [ ] Click Run Now. Toast at completion: *"Processed 20 lots. M remaining — click Run Now again or wait for the next scheduled run."* (info, 30s).
- [ ] `system_settings.ai_drain_in_progress = true` immediately after the toast.
- [ ] Click Run Now again. Continues drain until remaining=0.
- [ ] After remaining=0, `ai_drain_in_progress` flips to false; `ai_last_run_at` is fresh.

### B.6 Run Now — function timeout (300s)
> Pre-condition: 10+ lots queued, web_search-heavy items so processing is slow.

- [ ] Click Run Now. Wait. If the function runs ~5 min and returns 504 from Vercel:
- [ ] Danger toast (60s): *"Could not start AI run: HTTP 504"*.
- [ ] Some lots completed before timeout (status set), others remain status=NULL.
- [ ] Run Now button stays **Running…** for up to 5 more minutes (lock TTL) before re-enabling.
- [ ] After lock clears, click Run Now again. Drains remaining lots.

### B.7 Run Now — concurrent click rejection
- [ ] Click Run Now. Immediately click again before it returns. Second click is bounced server-side with `reason: 'in_progress'` → warning toast: *"AI run already in progress. Try again in a moment."*.

### B.8 Operator-entry preservation (status-aware finalize)
- [ ] Lot with manually-entered title only: Run AI. Title unchanged; description + price filled.
- [ ] Lot with manually-entered description only: Run AI. Description unchanged; title + price filled.
- [ ] Lot with manually-entered price only: Run AI. Price unchanged; title + description filled.
- [ ] Lot with all 3 manually entered (L_FILLED): does not appear in Awaiting AI; doesn't show in pending-AI badge; eligible for Run AI button only if button is enabled (which it isn't — disabled per A.11c). If forced via API, AI runs but output is discarded (status-aware finalize), only cost is logged.

### B.9 Bulk Reset AI + bulk re-drain
- [ ] Select 3+ status='success'/'partial'/'failure' lots → bulk Reset AI → confirm. Status reset; badge increments.
- [ ] Click Run Now. Drain re-runs AI on those lots. Outputs may differ from prior run (model is non-deterministic).
- [ ] Cost counters: incremented as expected; total spend tracks correctly.

### B.10 Stuck-lock self-heal — manual simulation
- [ ] Pick an eligible lot. `UPDATE lot SET ai_processing_started_at = NOW() - INTERVAL '6 minutes' WHERE id = '<id>';`
- [ ] Click Run Now. The cron/Run Now eligibility filter `(ai_processing_started_at IS NULL OR ai_processing_started_at < NOW() - INTERVAL '5 minutes')` matches; the lot is re-claimed.
- [ ] After the run completes, `ai_processing_started_at` cleared back to NULL.

### B.11 Anthropic 429 rate-limit handling
> Tests the SDK's Retry-After-aware retry loop (post-2026-05-08 fix).

- [ ] Pre-condition: 11+ lots queued.
- [ ] Click Run Now. With `CONCURRENCY = 3` and 30K input-TPM cap, expect 429s after the first 2-3 lots burst the bucket.
- [ ] Watch the per-lot finalize timestamps via `npx tsx scripts/inspect-ai-run.ts`. Some lots will show 60-180s+ end-to-end durations (SDK Retry-After backoff).
- [ ] All lots eventually finalize successfully (status=success or partial), NONE finalize as 'failure' with a 429 error message (that was the regression in the `maxRetries: 0` commit). If you see 'failure' with a 429 error, the SDK retry is broken.

---

## Section M — Mobile-only

### M.1 Cataloging session on mobile
- [ ] Sign in as Warehouse on iPhone Safari and Android Chrome.
- [ ] Customer + Job pickers are native dropdowns.
- [ ] Start session. Camera icon → camera permission prompt → camera UI → take photo. Thumbnail pending → uploaded.
- [ ] Add 4+ photos. PhotoStrip horizontally scrolls; chevron arrows visible if overflowing.
- [ ] Form fields don't trigger iOS auto-zoom on focus (font-size ≥16px).
- [ ] After typing in a field and tapping out, iOS zoom restores.
- [ ] **Save → Next**: form clears; URL updates with new lotId.
- [ ] **Pull-to-refresh**: page reloads; current in-progress lot survives (lotId in URL).
- [ ] **End session — confirm count**: dialog accurately shows N saved lots.
- [ ] **Tab close + reopen**: in-progress lot still available (URL persistence).
- [ ] **Browser back gesture**: doesn't accidentally end the session unexpectedly.

### M.2 Mobile inventory bottom-drawer filters
- [ ] /inventory on mobile shows **Filters** button (not the desktop filter bar).
- [ ] Tap Filters. Bottom sheet slides up. State chips, **Awaiting AI**, **Needs review**, search, customer, job — all present.
- [ ] Toggle a chip. Tap **Apply**. Sheet closes; list narrows; URL updates.
- [ ] Open the sheet again. Tap **Clear all**. List restores; URL drops params.
- [ ] Sheet has safe-area padding at bottom (above iOS home indicator).
- [ ] Sheet `dvh`-sized — doesn't overflow when keyboard appears for the search input.

### M.3 Mobile lot detail (full-screen Dialog)
- [ ] Tap a lot row. Dialog opens full-screen on mobile.
- [ ] PhotoStrip horizontally scrolls; tapping a thumb opens PhotoManager full-screen overlay (still inside the parent Dialog tree, not portaled).
- [ ] Form fields don't auto-zoom.
- [ ] Save / Move / Delete buttons reachable above iOS safe-area-inset-bottom.
- [ ] Closing via X or back gesture: unsaved-changes confirm dialog appears if dirty.
- [ ] On a frozen lot: read-only view; no Save / Delete / Move buttons.

### M.4 Mobile inventory list (separate component)
- [ ] /inventory uses `InventoryMobile` (not desktop table). Each row: lot number, customer, state pill, title preview.
- [ ] Long titles truncate with ellipsis.
- [ ] Tap → opens LotDetail full-screen dialog.
- [ ] Bulk select via checkboxes works; bulk action bar appears integrated with mobile UI.

### M.5 Mobile photo upload — failed pill flow
- [ ] Cause an upload failure (e.g., upload during airplane-mode toggle, or network throttling). Failed pill appears.
- [ ] Tap the failed pill. Popover lists failed entries with Retry / Discard.
- [ ] Tap Retry — re-attempts upload.
- [ ] Tap Discard — removes the entry; orphan `lot_photo` row deleted server-side.

### M.6 iOS Safari / Chrome quirks
- [ ] All overlays (`Dialog`, `Sheet`) use `100dvh`, not `100vh`. Keyboard appearing doesn't push action buttons offscreen.
- [ ] After auto-zoom (form focus), tapping outside restores zoom (font-size `!important` rule + 16px global).
- [ ] Cache headers: HTML always revalidates; assets immutable. Pull-to-refresh on the preview URL picks up a fresh build.
- [ ] **No stale-build issue** across deploys: deploy a small change while the user has the app open; pull-to-refresh shows the new build without manual cache clear.
- [ ] Sign out from mobile: clears session; lands on /login.

### M.7 Mobile AF360 export
- [ ] Filter inventory to a fully-ready job on mobile. Export button visible.
- [ ] Tap Export. Progress copy renders. Success toast → Blob URL appears.
- [ ] Tap the URL. Download initiated; ZIP file in iOS Files / Android Downloads.

---

## Section R — Role gating sweep

### R.1 Warehouse — what works
- [ ] /catalog: full cataloging session.
- [ ] /inventory: list + filters + search.
- [ ] Lot detail (assigned / unassigned, own intake): edit non-state fields. Save works.
- [ ] Lot detail: Move to Job button visible; works.
- [ ] Lot detail: Delete button visible only on own active assigned lot. Works on those.

### R.2 Warehouse — what's blocked
- [ ] Lot detail: state-change menu hidden or grayed.
- [ ] Lot detail: Run AI button hidden.
- [ ] Lot detail: Reset AI button hidden.
- [ ] Bulk action bar: hidden.
- [ ] /users: unreachable.
- [ ] /settings: unreachable (or read-only — verify).
- [ ] /customers (create/edit): visibility/affordances need verification per current spec.
- [ ] AF360 export: button hidden.
- [ ] Direct PATCH from DevTools: state change → 403 / 422.

### R.3 Office — what works
- [ ] /catalog accessible (cataloging works).
- [ ] /inventory: full edit, state changes, bulk actions (except Delete which is admin-only).
- [ ] Lot detail: all single-lot affordances visible; Run AI / Reset AI both available.
- [ ] /customers: create + edit + disable/re-enable allowed.
- [ ] /settings: schedule + cost panels visible; can save AI schedule; can save label printer URL.
- [ ] AF360 export: full access.

### R.4 Office — what's blocked
- [ ] /users: unreachable.
- [ ] Bulk Delete: not visible on the bulk action bar (only Change state, Move, Reset AI).
- [ ] /settings → Users-related items if any: unreachable.

### R.5 Admin — full access
- [ ] All affordances visible.
- [ ] /users: full CRUD with last-admin protection.
- [ ] Bulk Delete works.
- [ ] Last-admin protection prevents disabling/role-demoting the only active admin.

---

## Section X — Concurrency and edge cases

### X.1 Two-tab edits
- [ ] Open the same lot in two tabs as the same user.
- [ ] Edit title in tab 1, save. Tab 2 still shows the old value until refetch.
- [ ] Edit title in tab 2 (different value), save. Server accepts (last-write-wins). Tab 1 needs to refetch to see tab 2's value.

### X.2 Concurrent lock acquisition (manual SQL)
- [ ] In two SQL sessions, run `UPDATE system_settings SET ai_run_lock_until = NOW() + INTERVAL '5 minutes' WHERE id = 1 AND (ai_run_lock_until IS NULL OR ai_run_lock_until < NOW()) RETURNING ai_run_lock_until;` simultaneously.
- [ ] Only one returns a row. The other returns 0 rows (lock conflict — the WHERE guard prevents double-grab).
- [ ] Cleanup: `UPDATE system_settings SET ai_run_lock_until = NULL WHERE id = 1;`

### X.3 Photo upload during AI run
- [ ] Start an AI run on a lot. While the banner is up, try to upload a photo via the catalog session (different lot — same user). Upload should proceed normally; no interaction with the per-lot AI lock.

### X.4 Bulk action with mixed-state lots
- [ ] Select assigned + sold + unassigned lots together.
- [ ] Bulk Change state to `not-sellable`: only the legal transitions succeed (assigned → not-sellable, unassigned → not-sellable, sold rejected).
- [ ] Server returns per-lot results; toast itemizes which lots failed and why.

### X.5 Sign out during mutation
- [ ] Click Save on a lot detail edit. Immediately click Sign out before the response returns.
- [ ] Sign out completes. The mutation may still be in-flight server-side; the client sees no toast (Toaster cleared on sign out).
- [ ] Re-sign in. The lot reflects the saved state (or doesn't, if the request was canceled by the navigation — verify deterministically via Supabase).

### X.6 Stale TanStack Query cache after navigation
- [ ] On /inventory with filters applied, click into a lot, edit + save, close the dialog, navigate away, navigate back.
- [ ] The lot list should reflect the saved title (cache invalidation on `['lots-infinite']` works).
- [ ] If it doesn't, the cache invalidation regressed.

### X.7 PhotoManager click-outside behavior
- [ ] Open a lot detail dialog. Tap a thumbnail to open PhotoManager.
- [ ] Click on the PhotoManager backdrop (away from photos). PhotoManager closes.
- [ ] The parent lot detail dialog stays open (because PhotoManager is rendered inside, not portaled).

### X.8 Dialog scroll within modal
- [ ] Open a lot detail with very long content (long description, many photos). The dialog body scrolls within the `max-h-[90vh]` cap; doesn't push the dialog past the viewport.

---

## Notes / carry-forwards

Capture anything surprising, weird interactions, or items to land in
STATE.md / the next phase plan:

-
-
-
