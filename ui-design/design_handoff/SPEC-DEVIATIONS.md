# Design ↔ Spec Deviations

> Running log of decisions made during design that diverge from `uploads/ui-design.md`.
> Hand this to engineering with the design files so backend / state-machine logic stays aligned.

Format: each entry has the spec section it touches, what the spec says, what we decided, and why.

---

## D-001 · `sold` is **frozen** (amended 2026-05-01 — original deviation reversed)
- **Original spec:** §11 Frozen-state visual treatment — "Lots in `sold`, `picked-up`, or `not-sellable` state render in the lot detail modal with all field-edit affordances **hidden** (read-only display)."
- **Original design deviation (reversed):** `sold` lots were marked editable. Only `picked-up` and `not-sellable` were read-only.
- **Current decision (Phase 2 sign-off, commit `23c103c`):** `sold` is **frozen** alongside `picked-up` and `not-sellable`. All three states are read-only for field edits. To edit a sold lot, transition `sold → unassigned` first, edit, then re-assign.
- **Why the reversal:** Sold lots have already been published to the third-party auction platform; bidders saw the title, description, price, and photos as they were at sale time. Editing the lot record after sale would create a divergence between what bidders saw and what the audit-trail / platform record shows. Preserving the "sold-time snapshot" is more important than convenience editing. The fall-through path (`sold → unassigned → edit → re-assign`) handles the legitimate case.
- **Touches:** Lot detail modal (frozen rendering for sold), backend PATCH endpoint (returns 422 `FROZEN` for sold lots), state-machine UI affordances.

---

## D-002 · Inventory is the single action hub
- **Spec:** §6 Inventory & §11 Lot detail — implicitly suggests filtering/search lives in the inventory page, but lot-level actions (move, delete, change state) are listed in the lot detail modal.
- **Design:** **All searching and filtering live on the inventory page only.** Actions can be triggered two ways:
  - Single-click a row → lot detail modal with all per-lot actions in the footer.
  - Multi-select rows → bulk action bar replaces the modal flow with bulk-mode dialogs that don't repeat the lot list, just the action.
- **Why:** Reduces duplication and gives users a single mental model: "select what you want, then act." Bulk dialogs strip lot-detail noise — the user already chose the lots, no need to re-display them.
- **Touches:** Lot detail modal, bulk action bar, all bulk-action dialogs (move-to-auction, change-state, delete, run AI).

---

## D-003 · Bulk state-change shows only **shared** legal transitions
- **Spec:** §11 State machine — defines legal transitions per state, but doesn't specify bulk semantics.
- **Design:** Bulk "Change state" only offers target states that are legal for **every** lot in the current selection. If selection has mixed states with no shared legal target, bulk Change-state is disabled with explanation ("Mixed states; no shared transition").
- **Why:** Safest bulk UX — no surprise skips, no per-lot status reports. Power users can refine selection (filter by state) before bulk-acting.
- **Touches:** Bulk Change-state dialog logic.

---

## D-004 · Cataloging: labels print on **explicit button**, not auto on Next
- **Spec:** §5 Cataloging — labels print automatically on Next.
- **Design:** Cataloging screen has an explicit **Print Label** button. Next saves the lot but does not invoke the printer.
- **Why:** Printer issues should not block save. Cataloging operator can print a stack at session end or on demand. Removed cognitive load of "did the printer eat my label?" from every lot.
- **Touches:** Cataloging mobile screen, label print queue.

---

## D-005 · Closed jobs in customer/job picker are **grayed**, not hidden
- **Spec:** §5 Cataloging picker — implies open jobs only.
- **Design:** Closed jobs visible in picker but disabled (grayed). Operator sees full history; can't accidentally catalog into a closed job.
- **Why:** Operators sometimes need to confirm a customer's job history exists before starting a new session. Hiding closed jobs forces them to leave the screen to verify. Grayed rows are a recognition aid.
- **Touches:** Customer/job picker (cataloging entry).

---

## D-006 · No separate "Auctions" page
- **Spec:** §8.3 lists an "Auctions page" with create/edit/delete actions and a lots-assignment picker.
- **Spec (contradicting itself):** §3 — "A `(customer, job)` pair represents an auction — there is no separate Auction entity."
- **Design:** Resolved in favor of §3. **No standalone Auctions page.** The inventory hub already filters by Customer + Job; that filter combination *is* "view this auction." Job lifecycle (create / close / edit) lives on the Customer detail page (where jobs are naturally scoped per §8.2).
- **Why:** A dedicated Auctions page would only duplicate inventory-filtered-by-customer-and-job. Removing it eliminates a third place to manage the same concept and keeps a single source of truth on the inventory page.
- **Touches:** Admin nav, Customer detail page (now hosts job CRUD), inventory deep-link patterns.

---

_Add new entries above this line as we go._
