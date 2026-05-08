# Pre-Phase-7 End-to-End Test Checklist — Balanced (~2-3 hr)

> Created 2026-05-08. Run before Phase 7 (Label printing) work begins.
> Covers Phases 1–6 against the deployed preview for the working branch.
> Cron-fired tests are intentionally **excluded** (deferred to
> [`prod-cutover-test-checklist.md`](prod-cutover-test-checklist.md)).
> If you need broader coverage, see [`2026-05-08-e2e-exhaustive.md`](2026-05-08-e2e-exhaustive.md).
>
> Mark checkboxes as you go. If something fails, capture the symptom and
> stop — don't tick and move on. Carry-forwards / surprises go in the
> **Notes** section at the bottom.

## How to use

- **Section A** is no-token UI/plumbing. Run first; no Anthropic spend.
- **Section B** spends Anthropic tokens (~$0.03–$0.07 per lot).
- **Section M** is mobile-only items where the surface diverges from desktop.
- **Section R** is role-gating sweep — switches users to Office and Warehouse to verify the affordance gates that desktop+mobile already covered as Admin.

Default role for Sections A, B, and M is **Admin** unless stated otherwise.

---

## Before you start

### Environment preflight
- [ ] Latest preview deploy ready: `vercel ls auction-os --scope vantheos-4047s-projects | head -3` shows the most recent commit on the working branch (not stale).
- [ ] `ANTHROPIC_API_KEY` and `CRON_SECRET` set in Vercel preview env (`vercel env ls preview | grep -E "ANTHROPIC|CRON"`).
- [ ] Both Dev and Test DBs at the same migration head (most recent applied migration matches `supabase/migrations/`).

### Account preparation
- [ ] One Admin account with a known password.
- [ ] One Office account (create via /users if needed).
- [ ] One Warehouse account (create via /users if needed).
- [ ] At least one disabled user (any role) — used in A.1.

### Test fixtures (Dev DB)
- [ ] At least one Customer with a sellerCode set, plus one without (to test the AF360 missing-sellerCode path).
- [ ] At least one Job with ≥3 assigned lots, all with photos.
- [ ] At least 5 lots in `assigned`/`unassigned` state with `lastAiRunStatus IS NULL` and at least one of (title, description, price) empty — these will be your AI-eligible test set.
- [ ] If you need fresh data: `npm run seed:test-lots` (creates "Test Estate / 2026-04-Test-001" with 6 lots).

---

## Section A — UI + plumbing (no AI executions)

### A.1 Auth + role redirect
- [ ] Visit /login. Sign in as Admin. Redirected to /inventory (admin home).
- [ ] Sign out via top-right menu. Lands on /login (no `?redirect=` parameter leaking).
- [ ] Sign in as Warehouse. Redirected to /catalog.
- [ ] Sign out. Sign in as Office. Redirected to /inventory.
- [ ] Sign in as the disabled user. Bounced back to /login with banner: *"This account has been disabled. Contact an admin to regain access."*
- [ ] Direct URL test: as Warehouse, navigate to `/users` directly. Either redirected away or "not allowed" — never reach the page.

### A.2 Inventory list, filters, search
- [ ] /inventory loads. Lots display with lot number, customer, job, state pill, title.
- [ ] State filter chips: click `assigned` → URL gains `?state=assigned`; list narrows. Click again to clear.
- [ ] Search field: type a partial title. List narrows. Clear input restores.
- [ ] Customer filter: pick a customer. URL gains `?customerId=...`. List narrows.
- [ ] Job filter: pick a job (within the customer). URL gains `?jobId=...`.
- [ ] **Clear all filters** button: resets state chips, search, customer, job. URL drops all params.
- [ ] Refresh while filters are active: filters survive (URL-driven).

### A.3 Single-lot edit (LotDetail dialog)
- [ ] Click any lot row. Dialog opens with form fields, photo strip, action buttons.
- [ ] Edit the title, click Save. Toast: *"Lot updated"*. Dialog stays open; form reset to saved state.
- [ ] Edit a field, click outside the dialog (or Escape). Unsaved-changes confirm dialog appears. Cancel → dialog stays. Discard → dialog closes, edits dropped.
- [ ] Reopen the same lot — your saved title is there.
- [ ] Sold/picked-up/not-sellable lot: open it. Form is read-only ("🔒 Read-only" pill); photos show as static grid; no Save / Move / Delete buttons.

### A.4 Photo management
- [ ] In the lot detail of a non-frozen lot, click a thumbnail. PhotoManager full-screen overlay appears, focused on that photo.
- [ ] Reorder via drag (desktop). Save. Reopen — order persists.
- [ ] Delete a photo. Confirm. Photo gone from grid.
- [ ] If you delete the last photo of a lot, server returns an error (lot must have ≥1 photo); UI shows the error toast.
- [ ] Close the PhotoManager. The parent lot detail dialog is still open and intact.

### A.5 Bulk actions (admin/office only)
- [ ] Select 2+ lots in inventory via checkboxes. Bulk action bar appears.
- [ ] Bulk **Assign to Job** — pick a destination, optionally with reprint. All selected lots move; toast confirms.
- [ ] Bulk **Change state** — pick a state. State machine rules apply (e.g., assigned → sold OK; unassigned → assigned blocked).
- [ ] Bulk **Reset AI** — opens confirm dialog with count and field-preservation language. Cancel and confirm both work; on confirm, status resets, badge increments.
- [ ] Bulk **Delete** — confirm dialog requires typed confirmation; on confirm, lots removed.

### A.6 Single-lot mutations
- [ ] Edit fields → Save → success toast.
- [ ] Move to another job (single-lot **Assign to Job** button) → success toast; reprint checkbox path triggers a label render call.
- [ ] Change state via the menu → success toast (terminal-state confirm dialog appears for sold / picked-up).
- [ ] Delete a single lot via the **Delete** button + DELETE-typed confirmation → toast; lot gone from list.

### A.7 Catalog session (desktop golden path; mobile coverage in §M)
- [ ] As Warehouse (or Admin via role-switch), open /catalog.
- [ ] Customer + Job picker uses native `<select>` dropdowns (not radio lists).
- [ ] Pick a customer + job. Click **Start session**. Lands on `/catalog/session?lotId=<uuid>`.
- [ ] Fields visible: photo strip + capture button, Quantity, Untested toggle, Special Notes (category + text), **Additional Info** chevron-collapse hiding Title/Description/Price/Ref1/Ref2.
- [ ] Header shows customer name + job number.
- [ ] Add at least 1 photo (desktop file picker). Thumbnail shows pending → uploaded transition (within seconds).
- [ ] Click **Save → Next**. Form clears; new lot in progress; URL updates with new `lotId`.
- [ ] Click **End session** (with the session having ≥1 saved lot). Confirm dialog shows accurate count: *"You're about to end the session. N lots saved."*
- [ ] Confirm. Returns to /catalog with picker reset. The N saved lots appear in /inventory.

### A.8 Customer + Job management
- [ ] /customers — list visible with sellerCode (or "—") and disabled badge where applicable.
- [ ] Click **New customer**. Fill name + sellerCode (50-char limit enforced). Save. Toast confirms.
- [ ] Click into the new customer detail page. Click **New job**. Fill jobNumber + startBid + shippable. Save. Job appears in the list.
- [ ] **Edit customer**: change name, save. Persists. Add/edit sellerCode separately. Persists.
- [ ] **Disable customer** → confirm dialog → confirmed. Customer shows disabled pill.
- [ ] On the same disabled customer's detail page, **New job** button is disabled with tooltip about disabled customers; existing jobs remain editable.
- [ ] **Re-enable** the customer. New job button re-enables.
- [ ] **Edit job**: change jobNumber + startBid + shippable in one save. Persists.

### A.9 Settings panel (admin only — verify gating in §R)
- [ ] /settings loads as Admin. Sections visible: Label printer, AI (Schedule + Cost), Auction Platforms.
- [ ] **Label printer**: change Helper URL, click Test. Either ✓ Helper reachable or ✗ Helper unreachable depending on whether you're running Browser Print locally. (Hardware test deferred to Phase 7.) Save. Round-trips after refresh.
- [ ] **AI Schedule**: toggle enabled, change interval to a different value, change time-of-day, save. Toast confirms. Refresh — values round-trip.
- [ ] **AI Cost**: shows MTD dollar amount and "Average per lot" (or "no data yet").
- [ ] **Auction Platforms**: read-only list with at least AF360. Cleanup-cron schedule visible. No edit affordances.

### A.10 Users admin (admin only — verify gating in §R)
- [ ] /users loads. Table with email, role, status (active/disabled).
- [ ] **Add user** dialog: fill email + role. Submit. One-time password toast appears with **Copy** action; toast persists ~30s.
- [ ] **Change role** of an existing user → confirm dialog → confirmed. Role updates in the table.
- [ ] **Disable** another user → confirm → confirmed. Status shows disabled.
- [ ] **Re-enable** that user. Status flips back.
- [ ] **Last-admin protection**: try to disable the only active admin. Server rejects; danger toast: *"Cannot remove last admin"*. (If you only have one admin account, create a second admin first to test, then revert.)

### A.11 AI subsystem — UI/plumbing only (no executions)

#### A.11a Pending-AI badge correctness
- [ ] Settings shows `N lots pending AI` matching your AI-eligible test set.
- [ ] Singular form: when count is exactly 1, badge reads `1 lot pending AI` (not `1 lots`).
- [ ] Move an eligible lot to `sold`. Reload Settings. Badge decrements.
- [ ] Set the lot back to `assigned`. Badge increments.

#### A.11b Filter chips — Awaiting AI / Needs review
- [ ] /inventory shows two AI chips: **Awaiting AI** and **Needs review**, plus state chips. The legacy single "Needs Info." chip is gone.
- [ ] Click **Awaiting AI**. URL gains `?awaitingAi=true`. List = lots that AI will pick up next: status NULL, eligible state, ≥1 of title/description/price empty. Count matches the badge.
- [ ] Status=NULL lots whose 3 fields are all populated (operator-completed) do NOT appear in this filter.
- [ ] Toggle off. Toggle **Needs review**. URL gains `?needsReview=true`. Empty until AI has run with partial/failure outcomes.
- [ ] Both chips on simultaneously: union shown; active-filter count goes up by 2.
- [ ] **Clear filters** resets both. URL drops both flags.
- [ ] Legacy `?needsInfo=true` URL still loads as the union of both new chips. Subsequent interaction rewrites the URL.

#### A.11c Run AI button visibility (no execution)
- [ ] Open an eligible lot (status NULL, state assigned/unassigned). **Run AI** button visible.
- [ ] Open a `lastAiRunStatus = 'success'` lot. Run AI button hidden; **Reset AI** button visible (admin/office).
- [ ] Open a sold/picked-up/not-sellable lot. Both buttons hidden.

#### A.11d Reset AI single-lot (no execution)
- [ ] On a `lastAiRunStatus = 'success'` lot, click **Reset AI**. Toast confirms; if all 3 fields are populated, the toast description reads *"Clear a field to re-run AI"*. The Run AI button reappears (disabled when all 3 fields filled, enabled when at least one is empty).
- [ ] Verify status went back to NULL (refresh the lot or check the badge increment).

#### A.11e PATCH lock guard (manual SQL, no AI)
> Use Supabase Studio SQL editor on the Dev DB.

- [ ] Pick an assigned lot. `UPDATE lot SET ai_processing_started_at = NOW() WHERE id = '<id>';`
- [ ] Refresh the lot in the UI. Banner appears: *"AI is generating content for this lot. Inputs are read-only until done."* Field inputs disabled. **Run AI** button hidden (in-progress state).
- [ ] Edit a non-state field via PATCH (e.g., title). Server returns 423; toast shows error.
- [ ] Try a state change — succeeds (state PATCHes are not lock-guarded).
- [ ] Wait ~5 minutes (or set the timestamp 6 minutes ago). Banner clears within ~5s of next refetch.
- [ ] Cleanup: `UPDATE lot SET ai_processing_started_at = NULL WHERE id = '<id>';`

### A.12 AF360 export — per-job batch
- [ ] /inventory: filter to a customer + job that has ≥1 assigned lot, all with at least one JPG/PNG photo and (title, description, price) populated. **Export to AF360** button is enabled.
- [ ] Filter to a job with no assigned lots. Button disabled with hover tooltip *"No lots in assigned state for this job"*.
- [ ] Filter to a job with assigned lots that are missing title/description/price on at least one. Button disabled with tooltip indicating not all lots are export-ready.
- [ ] On a fully-ready job, click Export. Progress copy: *"Building batch 1 of M..."*. After completion, download link or toast appears with a Vercel Blob URL.
- [ ] Open the URL in a new tab. ZIP downloads. Inspect: contains `lots.csv` matching the AF360 spec column set, plus `photos/<lot_number>/<n>.jpg` files.
- [ ] On a customer without sellerCode, the Export button is disabled (or fails with clear toast on click).

---

## Section B — AI executions (real Anthropic tokens)

> Each Run Now or Run AI click costs ~$0.03–$0.07 per lot. Keep the
> Anthropic billing dashboard open in another tab.

### B.1 Probe smoke test
- [ ] `npm run probe:ai -- --lots 5` against Dev (`.env`).
- [ ] Output lines: `status: ... (Nms, Nin/Nout, ..., NN¢)`. First call has `cache_write=`; subsequent calls within ~5 min show `cache_read=` with non-zero count and lower per-call cost.
- [ ] Titles ≤50 chars; descriptions are plain prose (no bullets/markdown); prices are reasonable USD numbers.
- [ ] Total cost matches a rough mental estimate (~5 × $0.03 = ~$0.15).
- [ ] Cost counters NOT bumped (probe deliberately skips counters).

### B.2 Run AI per-lot
- [ ] Open a fresh eligible lot. Click **Run AI**.
- [ ] Banner appears almost immediately. Field inputs disable.
- [ ] Within ~30s the banner clears; title/description/price are populated. `lastAiRunStatus` reflects outcome (success/partial/failure).
- [ ] Settings → Cost panel: MTD bumped, run count incremented.
- [ ] Pending-AI badge decremented by 1.

### B.3 Run Now full drain (state-aware button + polling)
> Set up: have ≥3 AI-eligible lots queued.

- [ ] Click **Run Now**. Immediate info toast: *"AI run started — N lots queued. This may take several minutes…"* (30s persist).
- [ ] Button text → **Running…**, disabled.
- [ ] Pending-AI badge ticks down live (5s polling) without page refresh.
- [ ] Navigate to /inventory and back to /settings. Run Now button still shows **Running…** (server-state-aware disable). Don't click it.
- [ ] Run completes. Final toast (success / info / danger as appropriate). Examples:
  - All done → *"Processed N lots. Backlog cleared."* (success, 30s)
  - Some remaining → *"Processed N lots. M remaining — click Run Now again or wait for the next scheduled run."* (info, 30s)
  - Function timeout → *"Could not start AI run: HTTP 504"* (danger, 60s)
- [ ] Button re-enables once the lock clears (may take up to 5 min after a 504; that's the lock TTL).

### B.4 Operator-entry preservation (status-aware finalize)
- [ ] Pick an eligible lot. Manually enter a **title** in the lot detail form, save.
- [ ] Click **Run AI**. Wait for completion.
- [ ] After the run: title unchanged; description and price filled by AI; `lastAiRunStatus` = success or partial.
- [ ] Repeat with a different lot, this time entering only **price** manually. AI fills title + description; price untouched.
- [ ] Pick a third lot, manually enter all three fields. The lot does NOT appear in the **Awaiting AI** filter or the pending-AI badge (eligibility skip).

### B.5 Bulk Reset AI + bulk re-drain
- [ ] In /inventory, select 3+ lots that have `lastAiRunStatus` = success or partial. Open the bulk action bar → Reset AI → confirm dialog with count → confirm.
- [ ] Toast confirms. Pending-AI badge increments accordingly (only lots with empty fields enter the queue).
- [ ] Run Now in Settings to drain the just-reset lots. Verify they finalize again as expected.

---

## Section M — Mobile-only

> Open the preview URL on a real iPhone and Android device. Test in
> Safari (iOS) and Chrome (Android). DevTools mobile emulation is fine
> for layout but does NOT test iOS auto-zoom, safe-area insets, or
> pull-to-refresh — use real devices for those.

### M.1 Mobile cataloging session
- [ ] Sign in as Warehouse on iPhone Safari. Redirected to /catalog.
- [ ] Customer + Job pickers are native iOS `<select>` (not radio lists).
- [ ] Start session. Click the camera icon. iOS prompts for camera permission. Take a photo. Thumbnail appears, pending → uploaded.
- [ ] Add 3+ photos. Photo strip horizontally scrolls; chevron arrows visible if overflowing.
- [ ] Form fields don't auto-zoom on focus (iOS font-size ≥16px enforced).
- [ ] Save → Next. Form clears. URL updates with new lotId.
- [ ] Pull-to-refresh on the session URL. Page reloads; current in-progress lot survives (lotId in URL).

### M.2 Mobile inventory bottom-drawer filters
- [ ] On mobile /inventory, the desktop filter bar is replaced by a **Filters** button.
- [ ] Tap **Filters**. Bottom sheet drawer slides up. Same chips as desktop: state, **Awaiting AI**, **Needs review**, plus search and customer/job pickers.
- [ ] Toggle a chip. Tap **Apply**. Sheet closes; list narrows; URL updates.
- [ ] Open the sheet again. Tap **Clear all**. List restores.
- [ ] The sheet has safe-area padding at the bottom; action buttons reachable above the iOS home indicator.

### M.3 Mobile lot detail (full-screen dialog)
- [ ] Tap any lot row. Dialog opens full-screen on mobile (not centered modal).
- [ ] Photo strip horizontally scrolls; tapping a thumbnail opens PhotoManager full-screen overlay (no portal — clicks stay inside the parent dialog so it doesn't accidentally close).
- [ ] Form fields don't auto-zoom on focus.
- [ ] Action buttons at the bottom are reachable above the iOS safe-area inset.
- [ ] Closing via the X button or hardware back gesture: unsaved-changes confirm dialog appears if dirty.

### M.4 Mobile inventory list rendering
- [ ] Inventory list on mobile uses `InventoryMobile` component, not the desktop table. Each row shows lot number, customer, state pill, title preview.
- [ ] Long titles truncate with ellipsis; no horizontal scroll on the list.
- [ ] Tap → opens the same LotDetail full-screen dialog.

### M.5 iOS Safari/Chrome quirks
- [ ] Catalog and lot detail dialogs use `100dvh`, not `100vh` — keyboard appearing doesn't push content offscreen.
- [ ] After typing in a form field (which auto-zooms on iOS Safari), tapping outside restores the zoom level (font-size rule + `!important` global override).
- [ ] After switching between Inventory and Catalog tabs in iOS, returning shows the latest data (cache headers force HTML revalidate).
- [ ] No "stale build" issues across deploys: pull-to-refresh picks up a fresh build without manual cache clearing.

---

## Section R — Role gating sweep

> Run quickly through each role to verify gates that are visible/invisible.
> Don't repeat the full feature tests — just confirm the affordances.

### R.1 Warehouse role
- [ ] /catalog accessible. Cataloging session works.
- [ ] /inventory accessible. Lots visible. Filters and search work.
- [ ] On a lot detail dialog: can edit non-state fields (title/description/price/quantity/special-notes). Can move to another job. Can delete (own active assigned lot only). **Cannot** change state via the menu (state options not shown or grayed).
- [ ] Inventory bulk action bar: NOT shown.
- [ ] **Reset AI** button on lot detail: NOT shown.
- [ ] **Run AI** button on lot detail: NOT shown.
- [ ] **Run Now** in Settings: NOT shown (or page entirely inaccessible — verify).
- [ ] /users: NOT accessible.
- [ ] AF360 Export button: NOT shown / disabled.

### R.2 Office role
- [ ] /catalog accessible.
- [ ] /inventory accessible. All single-lot affordances visible (state changes included).
- [ ] Inventory bulk action bar: shown. Delete option may be hidden (admin-only).
- [ ] **Reset AI** + **Run AI** + **Run Now** all available.
- [ ] /users: NOT accessible.
- [ ] AF360 Export button: shown; export works.

### R.3 Admin role
- [ ] All affordances available.
- [ ] /users accessible.
- [ ] Bulk delete works (admin-only).
- [ ] Last-admin protection prevents disabling the only active admin (already covered in A.10).

---

## Notes / carry-forwards

Capture anything surprising or anything that should land in STATE.md /
the next phase plan:

-
-
-
