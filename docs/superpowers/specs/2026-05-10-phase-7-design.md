# Phase 7 — Label printing

> **Status:** ⬜ DRAFT — pending user review (2026-05-10)
>
> **Date:** 2026-05-10
> **Branch:** `phase-7-label-printing` off `phase-6-ai-subsystem` at `f55f761` (cut 2026-05-10)
> **Slot:** Between Phase 6 (AI subsystem, in late-stage manual sign-off) and Phase 8 (v1 cutover)
> **Trigger:** Phase 3 carry-forward **T-G1** (physical Zebra round-trip on real hardware) — surfaced as the only hardware-mandatory gate before Prod cutover. Survey for this spec also turned up real defects in the reprint-flag coverage that Phase 6's compact-lots flow only partly addressed; Phase 7 closes those gaps so the "Reprint pending" pill / filter UX is honest across every label-invalidating mutation, not just compact.
>
> **Source spec:** None — `docs/roadmap.md` lists Phase 7 with a one-line scope ("2″×1″ ZPL template + T-G1 + helper-URL polish if not done in Phase 4"). Survey conducted 2026-05-10 found template + helper-URL + Browser Print plumbing all complete from Phase 2 + Phase 4. The remaining work is the reprint-flag coverage gap and the hardware verification.

## 1. Goal

1. Make `lot.label_reprint_needed` a **trustworthy** signal: the flag is set whenever any of the three printed-label fields (`lot.lot_number`, the lot's `customer.name`, the lot's `job.job_number`) changes, regardless of which endpoint caused the change.
2. Wire the **dead `reprintLabels` checkbox** in `BulkMoveDialog` so it actually reprints labels after a successful bulk move (matching the already-working single-move equivalent).
3. Add a **bulk reprint affordance** — operator selects N lots → fires N prints serially with progress feedback → ends with a "verify and reprint missing ones" popup. Honest about the fact that Browser Print's success response means "ZPL queued" not "label produced."
4. **T-G1** — physical round-trip on the customer's actual Zebra ZP450 with Browser Print. Includes resolving the UPS-locked-or-not question by trying it.
5. Update [`docs/dev-notes.md`](../../dev-notes.md) so its description of the reprint-flag system matches post-Phase-7 reality.

Non-goals:

- **No "wait for printer confirmation."** Browser Print's HTTP 200 means the ZPL was accepted, not that the printer produced a label. Phase 7 explicitly does not pretend otherwise. The verify-popup is the v1 answer.
- **No new label template / no new label fields.** The 2″×1″ template at [`api/_lib/label-render.ts`](../../../api/_lib/label-render.ts) (QR + lot number + customer name + job tail) is correct as-is.
- **No helper-URL polish.** Phase 4 already shipped the LabelPrinterPanel + Test button. Reviewed 2026-05-10 — nothing to do.
- **No fleet-level certification.** T-G1 verifies one specific ZP450 + Browser Print combo. The customer has multiple ZP450 units (various provenances); each additional unit is a customer-side check, not a Phase 7 deliverable.
- **No bulk reprint Cancel / abort.** The serial loop runs to completion. Operator can close the progress toast but in-flight prints continue. Adding cancel mid-flight is out of scope; in practice 30 lots × ~500 ms = ~15 s.
- **No schema migration.** All flag changes are at the application layer; the column + partial index from migration `0014` already exist.

## 2. Why now

1. **Phase 6 is in late-stage sign-off** — the only mandatory item left before v1 cutover is T-G1. Without Phase 7, Prod cutover is blocked even after Phase 6 closes.
2. **The Phase-6 compact-lots flow exposed an asymmetry.** Compact dutifully sets `label_reprint_needed=true`, but bulk move (which also changes `lot_number`) does not — the BulkMoveDialog's "Reprint labels" checkbox is dead UI ([Inventory.tsx:335](../../../src/routes/Inventory.tsx#L335) discards the second arg). Operator can bulk-move 30 lots between jobs and lose every label silently with no signal. Customer / job rename has the same gap. Phase 7 is the natural place to close all of these in one pass since they share the same flag and the same UI.
3. **Hardware on hand.** The customer has a Zebra ZP450 available; bench testing is feasible now without waiting on procurement.

## 3. Scope

Eight areas. Server changes (A–C) are tightly scoped; client changes (D–F) cluster around the bulk-print orchestration. Hardware (G) and docs (H) close out.

### 3.1 Area A — Flag on lot moves (server)

Add `labelReprintNeeded: true` to the update sets in:

- [`api/lots/[id]/move.ts:74-79`](../../../api/lots/[id]/move.ts#L74-L79) — single-lot move.
- [`api/lots/bulk.ts:156-161`](../../../api/lots/bulk.ts#L156-L161) — bulk move (inside `applyMove`'s per-lot SAVEPOINT).

Both already update `jobId`, `lotNumber`, and conditionally `state` in the same UPDATE. The flag is added to the same set — no extra round trip, no transaction-shape change, runs inside the existing per-lot SAVEPOINT in the bulk case so failures stay isolated.

**Tests:**
- [`tests/api/lots-id-move.test.ts`](../../../tests/api/lots-id-move.test.ts) — existing happy-path test gains an assertion that the moved lot's `labelReprintNeeded` is `true` post-move.
- [`tests/api/lots-bulk.test.ts`](../../../tests/api/lots-bulk.test.ts) — existing bulk-move test gains a per-lot assertion. Failure cases (illegal-move, FK-violation) should leave `labelReprintNeeded` unchanged on the failed lots.

### 3.2 Area B — Cascade flag on Customer.name and Job.jobNumber rename (server)

`PATCH /api/customers/[id]` ([`api/customers/[id].ts`](../../../api/customers/%5Bid%5D.ts)) and `PATCH /api/jobs/[id]` ([`api/jobs/[id].ts`](../../../api/jobs/%5Bid%5D.ts)) currently update the row and return. Phase 7 adds:

- **Customer**: when `parsed.data.name !== undefined` AND the new name differs from the existing row's name, in the same transaction execute:
  ```sql
  UPDATE lot SET label_reprint_needed = true, updated_at = NOW()
  WHERE job_id IN (SELECT id FROM job WHERE customer_id = $1)
  ```
- **Job**: when `parsed.data.jobNumber !== undefined` AND the new jobNumber differs from the existing row's jobNumber, in the same transaction execute:
  ```sql
  UPDATE lot SET label_reprint_needed = true, updated_at = NOW()
  WHERE job_id = $1
  ```

Field-change detection (not just "did this field appear in the patch") prevents spurious flag-flips when the operator opens the edit dialog and saves without changing the relevant field. For Customer, fetch the current row inside the transaction before applying the update; same pattern for Job.

Other Customer fields (`sellerCode`, `disabledAt`) and Job fields (`startBid`, `shippable`, `closedAt`) **do not** trigger the cascade — none of them appear on the printed label.

**Tests:**
- [`tests/api/customers-id.test.ts`](../../../tests/api/customers-id.test.ts) — new tests:
  - Renaming `customer.name` flags every lot in every job belonging to that customer.
  - PATCHing only `sellerCode` does not flip the flag on any lot.
  - PATCH that includes `name` but with the same value as before does not flip the flag (no spurious updates).
- [`tests/api/jobs-id.test.ts`](../../../tests/api/jobs-id.test.ts) — new tests:
  - Renaming `job.jobNumber` flags every lot in that specific job; lots in sibling jobs (same customer) untouched.
  - PATCHing `startBid` or `shippable` alone does not flip any flag.
  - Same-value `jobNumber` PATCH is a no-op for the flag.

### 3.3 Area C — Clear flag on terminal state transitions (server)

`stateTransitionFields()` in [`api/_lib/lot-state.ts`](../../../api/_lib/lot-state.ts) already nulls `jobId` and `lotNumber` when the target state is `unassigned` or `not-sellable` (per the `state_tuple_consistent` CHECK constraint). Phase 7 adds `labelReprintNeeded: false` to the field set returned for those two target states.

Rationale: a lot with `lotNumber === null` cannot be rendered (`POST /api/labels/render` returns `422 NOT_LABELLABLE`), so the flag has no actionable meaning on it. The "Reprint pending" filter would otherwise surface non-labelable lots that the operator can't clear by reprinting. If the lot later transitions back to `assigned` via Move, Area A re-sets the flag — round-trip stays consistent.

**Tests:**
- [`tests/api/lot-state.test.ts`](../../../tests/api/lot-state.test.ts) (or wherever `stateTransitionFields` is unit-tested) — assert the returned field set for `unassigned` and `not-sellable` includes `labelReprintNeeded: false`; for `assigned`, `sold`, `picked-up` it does not include the field at all (those preserve whatever the lot had).
- Bulk and single PATCH state-change tests: after transitioning a lot with `labelReprintNeeded=true` to `not-sellable`, assert the flag is now `false`.

### 3.4 Area D — Wire BulkMoveDialog reprintLabels checkbox + bulk-print orchestration

Two parts:

**D.1 — New hook `useBulkLabelPrint`** at `src/hooks/useBulkLabelPrint.ts`. Runs N print operations in series, mirrors `useLabelPrint`'s render-then-POST-to-helper pattern, but consolidates feedback into a single static toast + the verify-popup at the end (no per-lot toasts).

- Input: `lotIds: string[]`.
- Before the loop: fire a single static toast `Sending {N} labels to the printer` (duration 0 — held until the loop ends). Wording is intentionally "Sending," not "Printing" — Browser Print's 200 means "ZPL accepted," not "label produced," so the toast doesn't claim per-iteration progress we can't actually verify. The toast is purely a "system is alive" signal during the ~15-second window for a 30-lot batch.
- Per-lot loop (serial): call `POST /api/labels/render` → POST ZPL to `{helperUrl}/write` → tally success/failure → continue regardless of per-lot outcome.
- After the loop: dismiss the static toast; resolve the mutation with `{ sentCount, failedCount }`. The caller opens `BulkPrintVerifyDialog` with those counts.
- Per-lot failures (Browser Print unreachable, render endpoint 5xx, etc.) are tallied; the loop continues. Final tally distinguishes "sent" (server render OK + helper POST OK) from "failed" (either side errored).
- **Cache invalidation:** after the loop completes, invalidate `['lots-infinite']` once (not per-lot — avoids 30 refetches in series).
- Uses the existing `useSystemSettings()` to read `labelPrinterHelperUrl`. If the helper URL is missing, abort immediately with a "Printer not configured" toast (same wording as `useLabelPrint`); the static "Sending…" toast is not fired in this case.

**D.2 — Wire the checkbox.** [`src/routes/Inventory.tsx:330-349`](../../../src/routes/Inventory.tsx#L330-L349) — `BulkMoveDialog`'s `onConfirm` currently destructures only `destinationJobId`. Updated to:

```ts
onConfirm={async (destinationJobId, reprint) => {
  try {
    const r = await bulk.mutateAsync({ action: 'move', lotIds: [...selected], params: { destinationJobId } });
    summarizeBulk(r.results);
    setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
    setBulkDialog(null);
    if (reprint) {
      const successfulIds = r.results.filter((x) => x.ok).map((x) => x.id);
      if (successfulIds.length > 0) {
        await bulkPrint.mutateAsync(successfulIds);
        // BulkPrintVerifyDialog opens from useBulkLabelPrint's onSuccess.
      }
    }
  } catch (err) { /* existing handler */ }
}}
```

**Tests:**
- New `tests/client/hooks/useBulkLabelPrint.test.ts` — mocks `api()` + `fetch` for the helper URL; verifies serial execution (N prints fire in order, not in parallel), progress toast updates in place, final tally distinguishes sent vs failed.
- New client test for Inventory bulk-move with reprint=true: bulk endpoint is called once, then `useBulkLabelPrint` is called with the successful lot IDs, then verify-popup opens.
- Existing `BulkMoveDialog` component test (likely [`tests/client/components/BulkMoveDialog.test.tsx`](../../../tests/client/components/BulkMoveDialog.test.tsx) if it exists; create if not) — covers the checkbox state.

### 3.5 Area E — Bulk reprint affordance from inventory selection

Add a new bulk action — operator selects lots → opens `BulkReprintDialog` (a small confirm dialog: "Reprint labels for N lots?") → on confirm, fires `useBulkLabelPrint` with the selected IDs → ends with the verify-popup.

Design:

- New component `src/components/bulk/BulkReprintDialog.tsx` — same shape as `BulkDeleteDialog` (count + confirm + cancel). No additional input needed.
- Wire it into [`src/routes/Inventory.tsx`](../../../src/routes/Inventory.tsx) alongside the existing bulk dialogs (BulkChangeStateDialog, BulkMoveDialog, BulkDeleteDialog, BulkResetAiDialog).
- Add a "Reprint labels" entry to the bulk action menu (mobile + desktop bars). Available to admin / office / warehouse — same auth as printing a single label.
- **Operator workflow:** filter Inventory by "Reprint pending" → select all visible → "Reprint labels" → progress → verify-popup. Independent of the filter (operator can also bulk-reprint any selection), but the filter chip is the natural entry point.

**Tests:**
- Component test for `BulkReprintDialog`: confirm fires the bulk-print mutation; cancel does nothing.
- Inventory integration test: open bulk action menu → click "Reprint labels" → confirm → verify `useBulkLabelPrint` is invoked with the selected IDs.

### 3.6 Area F — BulkPrintVerifyDialog (the "verify and reprint individually" popup)

New component at `src/components/labels/BulkPrintVerifyDialog.tsx` (new folder `labels/` since this is the first non-hook label-related UI).

```tsx
type Props = {
  open: boolean;
  onClose: () => void;
  sentCount: number;
  failedCount: number;
};
```

Body copy when `failedCount === 0`:
> Sent N label print jobs to the printer. Please check your stack of labels — if any are missing, find the affected lots in Inventory and reprint them individually or via the **Reprint pending** filter.

Body copy when `failedCount > 0`:
> Sent X of N label print jobs. The remaining Y could not reach the printer (helper offline / printer disconnected). The Reprint pending pill is still set on those lots — find them via the **Reprint pending** filter and try again. Please also check the printed stack for any missing labels and reprint individually.

Single OK button. Triggered automatically from `useBulkLabelPrint`'s `onSuccess`.

**Tests:**
- Component test: renders correct copy for both success and partial-failure cases.

### 3.7 Area G — T-G1 hardware round-trip

Sequence with the actual ZP450 + Browser Print on the operator workstation:

1. **Pre-flight:** confirm Browser Print is installed and the helper URL in Settings → Label printer responds 200 to the existing Test button. If the printer is the UPS-locked variant, the Test may pass (helper is alive) but `/write` may reject the ZPL. Expected behavior either way — the failure mode is what we're learning about.
2. **Single print:** click Print Label after a fresh cataloging save; verify a 2″×1″ label exits the printer with QR + "Lot N" + customer name + job tail.
3. **Reprint from Inventory:** open a lot detail; click Reprint label; verify identical output. Confirm the Reprint pill (if set) clears after success.
4. **Bulk reprint:** select 5 lots from inventory (any state with `lot_number` set); click Reprint labels; verify all 5 emerge in order; verify verify-popup wording.
5. **Failure exercise:** unplug the printer mid-bulk-reprint of 5 lots; confirm the verify-popup reports partial failure correctly; confirm the Reprint pill remains visible on lots whose ZPL didn't make it through; confirm the operator can re-trigger Reprint to clear them.
6. **Compact + reprint flow:** create a fixture job with gaps (use [`scripts/seed-export-stress.ts`](../../../scripts/seed-export-stress.ts) or hand-curate); click Compact in the export-prep modal; verify pills appear on renumbered lots; bulk-reprint via the filter.

If the ZP450 is UPS-locked and rejects ZPL, T-G1 cannot complete on this unit. Document the failure mode (HTTP code from `/write`, body content if any) and switch to a non-UPS Zebra (per discussion: code stays the same, only the hardware swaps). Keep the bench-test artifacts with the spec for future reference.

**Acceptance:** verbal sign-off from the operator that printed labels match expected content + that pill / filter / bulk flow behaves as described.

### 3.8 Area H — Documentation updates

Two files:

- [`docs/dev-notes.md`](../../dev-notes.md) line 81 — rewrite the `label_reprint_needed` paragraph to enumerate every set site (compact + single move + bulk move + customer name rename cascade + job number rename cascade), every clear site (`/api/labels/render` success + terminal state transitions to `unassigned` / `not-sellable`), and document the convenience-checkbox semantics so future sessions don't assume the checkbox is the source of truth.
- [`docs/superpowers/handoffs/prod-cutover-test-checklist.md`](../handoffs/prod-cutover-test-checklist.md) — already updated 2026-05-10 (P3.1 acceptance line corrected to match the actual label content). Re-verify after Phase 7 ships in case the bulk-reprint affordance changes the wording of the test step.

## 4. Acceptance criteria

- ✅ Single-lot move and bulk move both set `labelReprintNeeded=true` on every successfully moved lot. Failed lots in a bulk move have unchanged flag values.
- ✅ Customer.name PATCH cascades the flag to all lots whose job belongs to that customer; PATCH that doesn't change `name` is a no-op for the flag.
- ✅ Job.jobNumber PATCH cascades the flag to all lots in that job; PATCH that doesn't change `jobNumber` is a no-op.
- ✅ Transitioning a lot to `unassigned` or `not-sellable` clears the flag.
- ✅ BulkMoveDialog's "Reprint labels" checkbox triggers serial bulk print after the move; verify-popup appears at the end.
- ✅ A new "Reprint labels" bulk action exists in the inventory bulk action bar; same code path as D.1.
- ✅ T-G1 has been run on the actual ZP450 + Browser Print and the outcome (success or specific failure mode) is recorded in this doc as an addendum.
- ✅ `docs/dev-notes.md` reflects post-Phase-7 reality.
- ✅ Pre-push trio green: `npm run build && npm run lint && npm test` (lint 0/0; net new tests pass; existing tests still pass).
- ✅ Lot count in `581/581` baseline grows by net-new test count; no regressions.

## 5. Estimate

Single sitting if T-G1 cooperates; two sittings if hardware swap is needed.

| Area | Estimated effort |
|---|---|
| A — Flag on moves (server) | ~1 hr |
| B — Cascade on rename (server) | ~2 hr |
| C — Flag-clear on terminal states | ~30 min |
| D — Bulk-print hook + BulkMoveDialog wire | ~3 hr |
| E — Bulk reprint dialog + action wire | ~2 hr |
| F — Verify-popup component | ~1 hr |
| G — T-G1 bench (best case) | ~1 hr |
| H — Docs | ~30 min |
| **Total (server + client + tests + docs)** | **~10 hr** |
| **Plus T-G1** | **+1–2 hr bench** |

## 6. Risks

| Risk | Mitigation |
|---|---|
| **ZP450 is UPS-locked.** `/write` rejects arbitrary ZPL → T-G1 cannot complete on this unit. | Fall back to a non-UPS Zebra ZPL printer. Code is unchanged (Browser Print abstracts). Spec acceptance updated to reference whichever unit succeeded. |
| **Browser Print version compatibility with ZP450.** The Zebra Developer Portal says ZP450 ≈ GK420d and "should work" but not officially tested. | Verify in T-G1 step 1; if it fails, switch hardware (see above). |
| **Customer.name cascade UPDATE perf on a customer with many jobs.** | Bounded by lot count for the customer. The partial unique index `uniq_job_lot_number` and FK `lot.job_id → job.id` indexes support the subquery. Verify with EXPLAIN if customer has >1000 lots; otherwise unmeasurable cost. |
| **30-lot bulk reprint takes ~15 s with no Cancel button.** | Acknowledged non-goal. Operator can navigate away; in-flight prints complete in the background. v2 candidate if pain surfaces. |
| **Browser Print returns 200 on `/write` even when the printer is offline.** | Already documented in dev-notes line 81 + reinforced by the verify-popup. The popup explicitly tells the operator "check your stack." Phase 7 doesn't try to be cleverer than the hardware allows. |
| **Test-cascade churn from D + E client tests.** Phase 6 had a `unhandledRejection` listener-leak fix that stabilized cascades; new client tests should follow the same patterns. | Reuse `tests/helpers/render-with-providers.tsx` + `mock-api.ts`. Don't introduce raw `fetch` mocks at the global level. |

## 7. Out-of-band reminders for the implementer

- Apply test-DB and dev-DB **schema migrations** are not needed (no schema changes in Phase 7).
- The pre-push trio is non-negotiable: `npm run build && npm run lint && npm test` all green before any push.
- Commit author email must be `Vantheos <ops@vantheos.com>` per repo-local config.
- Phase work on `phase-7-label-printing` branch; do not push `main`.
- Mobile UI: `BulkReprintDialog` follows the established mobile checklist (dvh, safe-area-insets, touch targets) — reuse existing Dialog / Sheet primitives that already encode this.
- After T-G1 completes, add a Phase 7 section to [`STATE.md`](../../../STATE.md) mirroring the Phase 5 / 6 structure.
- After all areas merge and T-G1 passes, mark Phase 7 ✓ in [`docs/roadmap.md`](../../roadmap.md).
