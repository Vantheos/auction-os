# Phase 2 Design Spec — Lot Lifecycle + Label Printing

> **Companion documents:**
> - `docs/superpowers/specs/2026-04-29-v1-design.md` — overall v1 design (authoritative product/data spec)
> - `ui-design/design_handoff/` — high-fidelity UI mockups + tokens (Option C · Mica Slate)
> - `STATE.md` — current working state of the repo
>
> This spec defines what Phase 2 builds. The implementation plan (next document) sequences the work into discrete tasks.

---

## 1. Overview

**Phase 2 = "Lot lifecycle + label printing."** Builds the desktop tool for managing the lot inventory: viewing lots, editing them, transitioning state, moving them between auctions, deleting them, exporting them, and (re)printing labels. Mobile cataloging — the workflow that *creates* lots — is deferred to Phase 3.

**Sequencing rationale:** The original phase order (mobile cataloging first, inventory second) was reconsidered against the design handoff's recommended sequence (inventory + lot detail modal first, mobile cataloging second) and the user's constraints (no interim users; minimize rework and throwaway). Building the lot detail modal first means it serves as the spine — Phase 3 mobile cataloging reuses its form fields, photo display, status pills, confirmation patterns, and label printing. Zero throwaway.

### 1.1 Success criteria (Phase 2 sign-off)

1. Test lots can be created via Supabase dashboard or API and they appear correctly in the inventory list
2. Inventory list loads, filters work (Customer, Job, Lot Status, AI Status, Date), pagination works, multi-select works
3. Clicking a row opens the lot detail modal in the correct variant for the lot's state
4. Single-lot actions all functional: edit fields and save, change state (legal transitions only, with confirms for terminal states), Move to another auction (`assigned` or `unassigned` source — moving an unassigned lot transitions it to `assigned` per the schema CHECK), Reprint label, Delete (admin only)
5. Bulk action bar appears on multi-select; Move / Change-status / Delete (admin) / Export CSV all work end-to-end
6. Frozen modals (`picked-up`, `not-sellable`) correctly disable edit affordances; Change-state still shows legal transitions
7. Label printing: ZPL renders correctly per Labelary visual check, Browser Print integration sends to localhost (verifiable independently of physical printer), Test button on Settings reports connection status
8. The `/lot/:id` route renders the lot detail UI in a responsive full-page layout: form fields stack vertically on narrow viewports (<640px), photo grid wraps, footer actions stay reachable without horizontal scroll. Verified by resizing a desktop browser to 375px wide AND by loading the URL on a real phone
9. All audit-tracked changes record actor correctly via `audit_log.changed_by` (verify a sample after each kind of mutation)
10. 21 existing Phase 1 vitest tests still pass; new vitest tests cover lot CRUD endpoints, state transition validation, bulk action permissions, ZPL render
11. End-to-end manual click-through on Vercel preview against Dev Supabase

### 1.2 Out of scope (deferred)

- **Mobile cataloging flow** (picker → lot in progress → photo manager → save splash → end-session) → Phase 3
- **Photo capture / upload pipeline** (browser → Supabase Storage with IndexedDB queue) → Phase 3. The lot detail modal in Phase 2 *displays* existing photos read-only — no upload, delete, or reorder UI in Phase 2. Photo edit affordances all come in Phase 3 alongside the cataloging UI that creates them
- **AI subsystem** (any UI; the bulk Run AI button is dropped from Phase 2 entirely rather than shipping a disabled placeholder) → Phase 4
- **Audit reporting view** (`/audit` route) → later phase
- **Users management page** (`/users` route) → later phase
- **AI schedule + Organization sections** of Settings → later phases
- **Saved filter presets** (per-user persistence)
- **Global search** across customers / jobs / lots
- **Native mobile app**, **direct API integration with auction platforms** → post-v1

### 1.3 Physical-printer test deferral

Label printing implementation is fully shipped in Phase 2 (button + render endpoint + Browser Print client integration + toast feedback). The only deferred verification is the round trip from Browser Print helper to the physical Zebra ZD450 printer, which requires hardware on hand. This is a verification gap, not an implementation gap. Tracked as a Phase 2 acceptance step that fires when the printer is available.

---

## 2. Backend architecture

Continues the Phase 1 native Vercel handler pattern (`(req, res) => Promise<void>`). All mutations go through `asActor(userId, fn)` so the audit trail captures the real actor.

### 2.1 New endpoints

| Route | Methods | Roles | Notes |
|---|---|---|---|
| `/api/lots` | `GET`, `POST` | GET: any auth · POST: admin/office/warehouse | GET supports filters via query: `customerId`, `jobId`, `state[]`, `aiStatus[]`, `dateFrom`, `dateTo`, `limit`, `offset`. POST creates a new `assigned` lot with `lot_number` auto-assigned (next available in the destination job) |
| `/api/lots/[id]` | `GET`, `PATCH`, `DELETE` | GET: any auth · PATCH: admin/office · DELETE: admin only | PATCH handles field edits AND state transitions (request body discriminates); illegal transitions return 422 with `code: 'ILLEGAL_TRANSITION'` |
| `/api/lots/[id]/move` | `POST` | admin/office | Composite action: changes `(customer_id, job_id, lot_number)` triple atomically inside a single transaction; allocates next `lot_number` in destination job |
| `/api/lots/[id]/photos` | `GET` | any auth | Read-only in Phase 2 (capture endpoint comes in Phase 3) |
| `/api/lots/bulk` | `POST` | admin/office (delete: admin only) | Bulk endpoint for `move`, `change-state`, `delete`. Body = `{ action, lotIds[], params }`. Returns per-lot `results[]` with `ok: boolean` and optional `error`. Server validates each lot independently |
| `/api/lots/export` | `POST` | admin/office | CSV export of lots matching the given filter spec; returns `text/csv` with the v1 column manifest (see §7) |
| `/api/labels/render` | `POST` | admin/office/warehouse | Body = `{ lotId }`. Returns `{ zpl: string }` JSON. Server-side render so the template lives in version control |
| `/api/system-settings` | `GET`, `PATCH` | GET: any auth · PATCH: admin only | Phase 2 only exposes `label_printer_helper_url`. AI fields and Organization fields are read in the response but PATCH only accepts `label_printer_helper_url` |

### 2.2 State transition validation

Centralized in `api/_lib/lot-state.ts`:

```ts
type State = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable';

const LEGAL_TRANSITIONS: Record<State, State[]> = {
  assigned:     ['sold', 'unassigned', 'not-sellable'],
  unassigned:   ['assigned', 'not-sellable'],
  sold:         ['picked-up', 'unassigned'],   // sold is frozen for field edits (amended D-001); sold→unassigned for fall-through
  'picked-up':  [],                             // terminal
  'not-sellable': ['unassigned'],               // can revert per handoff
};

export function legalTransitions(from: State): State[];
export function validateTransition(from: State, to: State): void;  // throws TypedError
```

Both PATCH `/api/lots/[id]` and the bulk endpoint call `validateTransition`. UI mirrors `legalTransitions` (the change-state popover only offers legal options) but server is authoritative.

### 2.3 Move-to-auction atomicity

Wrap the lot `lot_number` reservation + update in a single transaction inside `asActor`:

```ts
await asActor(userId, async (tx) => {
  const nextLotNumber = await reserveNextLotNumber(tx, destinationJobId);
  const [updated] = await tx.update(lot).set({
    customerId: destinationCustomerId,
    jobId: destinationJobId,
    lotNumber: nextLotNumber,
    updatedAt: new Date(),
  }).where(eq(lot.id, lotId)).returning();
  return updated;
});
```

A unique index on `(job_id, lot_number) WHERE state IN ('assigned','sold','picked-up')` (already in Phase 1 schema) catches the race where two operators move into the same destination — the second gets a 409 we surface in the bulk-result.

### 2.4 Bulk endpoint shape

```json
POST /api/lots/bulk
Body: { "action": "change-state", "lotIds": ["...", "..."], "params": { "to": "sold" } }

Response: {
  "results": [
    { "id": "...", "ok": true },
    { "id": "...", "ok": false, "error": { "code": "ILLEGAL_TRANSITION", "message": "..." } }
  ]
}
```

Per-lot pass/fail enables the partial-success UI pattern (see §6).

### 2.5 Label render endpoint

Server holds the ZPL template. Renders it with substituted lot data + a QR URL of the form `https://<deploy-host>/lot/<id>`. Returns ZPL text. The client posts the ZPL to Browser Print at the configured helper URL (which must be `localhost:<port>` since Vercel functions cannot reach the operator's workstation).

```
[Reprint button] → useLabelPrint(lotId)
                     ├─ POST /api/labels/render → { zpl }
                     └─ POST helperUrl/write    → 200 OK or error
                          ├─ success → toast "Label sent"
                          └─ error   → amber toast (Retry / Dismiss)
```

Deploy host comes from `process.env.VERCEL_URL` with a fallback to a configured public domain stored in `system_settings`.

### 2.6 Audit-actor capture (no change from Phase 1)

Every mutation handler routes through `asActor(userId, fn)` from `api/_lib/db.ts`, which sets `request.jwt.claim.sub` GUC inside a transaction so `audit_log_trigger` records `changed_by` correctly. Read-only handlers do not need this.

---

## 3. Frontend architecture

Continues Phase 1 stack: React 18 + Vite + React Router 6 + TanStack Query 5 + shadcn primitives + Mica Slate tokens (already bridged). React Hook Form + Zod for forms.

### 3.1 New routes

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/inventory` | `InventoryPage` | any auth (warehouse hidden by sidebar permissions; route still accessible if URL typed) | Composes filters + table + bulk action bar + lot detail modal mount |
| `/lot/:id` | `LotDetailPage` | any auth | Standalone, mobile-friendly view of the lot detail UI. The same `<LotDetail>` component used in the desktop modal, wrapped as a full-page layout. This is what QR codes resolve to |
| `/settings` | `SettingsPage` | admin only | Three sections per spec; only Label printer is interactive in Phase 2 |

The lot detail modal on `/inventory` is **not its own route** — it's overlay state stored in the URL search param `?openLot=<id>` so back-button closes the modal. Closing returns focus to the previously-clicked row (handoff §"Modal stacking").

The AdminShell sidebar's two existing-but-disabled nav items (`Inventory`, `Settings`) are flipped to `enabled: true`.

### 3.2 Code-splitting from the start

To avoid the bundle-size warning Phase 1 already triggers and prevent it from worsening:

- `React.lazy()` on each new route: `Inventory`, `Settings`, `LotDetailPage`
- `React.lazy()` on the `<LotDetail>` component itself (it carries the form + photo grid + actions)
- `React.lazy()` on each bulk dialog (loaded on first open)
- `vite.config.ts` adds `build.rollupOptions.output.manualChunks` to split vendor bundles (React core, TanStack Query, shadcn primitives) from app code
- A `<Suspense>` wrapper at each route boundary with a tiny "Loading…" fallback

Phase 1 routes (`/login`, `/customers`) are not retroactively converted — they're already loaded; converting them is risk for no benefit.

### 3.3 State model

| Domain | Where it lives | Why |
|---|---|---|
| Lot list, single lot, lot photos, system settings | TanStack Query | Server cache; revalidates on mutation success; handles optimistic updates with `onMutate` snapshots |
| **Selection set** (`Set<lotId>`) | **Component state** lifted to `InventoryPage` (`useState`) | Selection is transient action state; not bookmarkable; lost on refresh is acceptable |
| Filters (customer, job, state[], etc.) | URL search params | Shareable, browser back works, refresh-safe |
| Modal-open state (`openLot`, `bulkAction`, `confirmOverlay`) | URL search params | Shareable + back-button-safe |
| Toast queue | Lightweight context (`<ToastProvider>`) | App-wide ephemeral state; one mount in `App.tsx` |

### 3.4 New shared primitives in `src/components/ui/`

- `toast.tsx` — minimal toast component + `useToast()` hook + `<Toaster>` mount
- `pill.tsx` — status / role pill with color-by-token mapping (lot states, AI states, role)
- `dropdown.tsx` — wrap shadcn primitive for the change-state popover and `···` row actions
- `checkbox.tsx` — wrap shadcn primitive for inventory row selection

Already in repo from Phase 1: `button`, `input`, `label`, `dialog`, `form`, `select`, `table`.

### 3.5 New feature components in `src/components/`

```
src/components/
├─ inventory/
│  ├─ InventoryFilters.tsx     ← chip-based filter row above table
│  ├─ InventoryTable.tsx       ← table with selection, click-to-open, status pills
│  └─ BulkActionBar.tsx        ← sticky bottom bar; visible on selection.size > 0
├─ lot/
│  ├─ LotDetail.tsx            ← shared lot UI (used by modal AND /lot/:id full-page)
│  ├─ LotEditForm.tsx          ← extracted form fields (Phase 3 mobile cataloging will reuse)
│  ├─ ChangeStateMenu.tsx      ← popover listing legal transitions for the lot's current state
│  └─ MoveLotDialog.tsx        ← destination customer → job picker
└─ bulk/
   ├─ BulkChangeStateDialog.tsx
   ├─ BulkMoveDialog.tsx
   ├─ BulkDeleteDialog.tsx     ← destructive treatment, type-`DELETE`-to-confirm
   └─ ExportCsvDialog.tsx      ← read-only column manifest display
```

### 3.6 New hooks in `src/hooks/`

- `useLots(filters)` — list with filters
- `useLot(id)` — single lot
- `useLotPhotos(lotId)` — read-only in Phase 2
- `useUpdateLot()`, `useChangeLotState()`, `useMoveLot()`, `useDeleteLot()` — mutations with optimistic rollback
- `useBulkLotAction()` — POST to `/api/lots/bulk`, returns per-lot result array
- `useLabelPrint()` — fetches ZPL from server, posts to helper URL, returns success/error
- `useSystemSettings()` — read + admin-only mutate

### 3.7 New pages in `src/routes/`

- `Inventory.tsx` — composes filters + table + bulk bar + modal mount; handles selection state
- `LotDetailPage.tsx` — full-page wrapper around `<LotDetail>` for `/lot/:id`
- `Settings.tsx` — Label printer section interactive; AI schedule + Organization sections rendered as read-only placeholders so the layout matches the design handoff

### 3.8 Design system additions

To `tailwind.config.ts` (extending the bridged Mica system from this session):

**Lot state pills:**
```
unassigned     → text #92400E on bg #FEF3C7
assigned       → text #1E40AF on bg #DBEAFE
sold           → text #15803D on bg #DCFCE7
picked-up      → text #475569 on bg #E2E8F0    (frozen)
not-sellable   → text #B91C1C on bg #FEE2E2    (frozen)
```

**AI state pills (added now even though AI is Phase 4 — needed for inventory column):**
```
success → #15803D
partial → #B45309 (amber, distinct from warning)
failure → #B91C1C
not_run → #94A3B8 (faint)
```

**Role pills:**
```
admin     → text #B91C1C on bg #FEE2E2
office    → text #1E40AF on bg #DBEAFE
warehouse → text #92400E on bg #FEF3C7
```

These extend the existing semantic palette — same colors, just named for state semantics.

---

## 4. Lot lifecycle and modal variants

### 4.1 State machine (recap from §2.2)

5 stored states:

| State | Stored | Editable? | `(customer, job, lot_number)` |
|---|---|---|---|
| `assigned` | YES | yes | NOT NULL |
| `unassigned` | YES | yes | NULL |
| `sold` | YES | **frozen** (amended D-001 — see note) | NOT NULL |
| `picked-up` | YES | **frozen** | NOT NULL |
| `not-sellable` | YES | **frozen** | NULL |

> **D-001 amended (2026-05-01):** sold lots are now **frozen for field edits**. Original D-001 made sold editable to support corrections; in practice, sold preserves what was shown to bidders on the auction platform (price, quantity, etc.) and edits would mutate the record of what was sold. Edits required after sale are made by transitioning sold → unassigned, editing, then re-assigning. State transitions out of sold (`picked-up`, `unassigned`) and Reprint Label remain available.

> **Note on the Phase 3 cataloging flow:** the v1 design spec (`2026-04-29-v1-design.md`) describes a "Lot in progress" screen during mobile cataloging. That is a screen name, not a stored state and not a pill-rendered state. The first photo creates a row directly in `assigned`. There is no `in_progress` `LotState` member in the type system or pill primitive.

### 4.2 Modal variant strategy

One `<LotDetail>` component, prop-discriminated by `lot.state`:

- **Editable** (`assigned`, `unassigned`): full RHF form, fields rendered as inputs, footer actions: `Save changes` · `Reprint label` · `Move to another auction` · `Change status` · `Delete` *(admin)* · `Close`
- **Frozen** (`sold`, `picked-up`, `not-sellable`): same data, fields rendered as static `<dl>`-style display, "🔒 Read-only" pill in modal header, footer: `Reprint label` · `Change status` *(legal transitions only)* · `Delete` *(admin)* · `Close`. `not-sellable` photo dimmed slightly per handoff
- **Mobile/standalone view (`/lot/:id`)**: same `<LotDetail>` mounted in a full-page wrapper; respects the same editable/frozen variant logic; warehouse role can read but not edit (server enforces)

### 4.3 Confirmation patterns

- Transitions into terminal states (`→ picked-up`, `→ not-sellable`) → confirm modal
- Hard delete → confirm modal with destructive treatment + type-`DELETE` to enable submit
- All other transitions commit immediately (optimistic UI)
- Confirm modals stack over the lot detail modal with backdrop dim; closing returns focus to the parent modal

### 4.4 Optimistic UI

TanStack Query `onMutate` snapshots the lot row → applies the optimistic update (e.g. state pill flips to `sold` immediately) → on `onError` restores the snapshot + surfaces a toast. Each mutation hook (`useChangeLotState`, `useUpdateLot`, etc.) follows this pattern.

### 4.5 Editing rules per spec §7.5

- Editable states (`assigned`, `unassigned`): `title` (≤50 chars per §9.4), `description` (length open per §14 Round 1; UI uses 2000 char soft limit pending DDL pin), `price` (`numeric(10,2)`), `special_notes_category` (enum), `special_notes_text` (required when category surfaces text input — only `CLOTHING` in v1), `untested` (bool), `quantity` (int ≥ 1), `ref1` / `ref2` (optional text)
- Frozen states (`sold`, `picked-up`, `not-sellable`): only Change-state, Reprint, and Delete (admin). Field edits return 422 `FROZEN` from the server.
- The `(customer, job, lot_number)` triple is never edited inline — only via the Move action (which is available on `assigned` and `unassigned`)

---

## 5. Label printing

### 5.1 Pipeline

```
[Reprint Label / Print Label button]
   │
   ▼
useLabelPrint(lotId)  ──► POST /api/labels/render?lotId=...
   │                          │
   │                          ▼
   │                     server reads lot, generates QR (server-side qrcode lib),
   │                     fills ZPL template, returns { zpl }
   │                          │
   ◄──────────────────────────┘
   │
   ▼
POST helperUrl/write   ──► Zebra Browser Print HTTP API on operator's localhost
   │
   ├─ success → toast "Label sent to printer"
   └─ error   → amber toast (Retry / Dismiss)
```

### 5.2 Why server-side ZPL render

- Template lives in version control, one source of truth, no client-cache drift
- QR encoding runs once in a server library
- Future-proof: a CSV export, an admin-side reprint, or a CLI tool can all reach the same render endpoint

### 5.3 Why client-side POST to the helper

- Zebra Browser Print runs on the operator's workstation at `http://localhost:<port>`. Vercel functions cannot reach localhost. The browser must talk to localhost directly. Documented Zebra pattern.
- Browser Print serves CORS-permissive headers explicitly so the cross-origin browser-to-localhost call is allowed.

### 5.4 Helper URL configuration

Stored in `system_settings.label_printer_helper_url`. Default: blank (admin must configure before printing works). Test button on Settings page fires `GET helperUrl/available` and reports the response (Connected / Unreachable / Pending).

### 5.5 ZPL template (Phase 2 starting point)

```zpl
^XA
^PW406       ; print width 2" at 203 dpi
^LL203       ; label length 1"
^FO16,16^BQN,2,5^FDQA,https://<deploy-host>/lot/<id>^FS  ; QR ~120px
^FO156,20^A0N,40,40^FDLot <number>^FS                    ; lot # large
^FO156,72^A0N,22,22^FB246,1,0,L,0^FD<customer>^FS        ; customer (truncate)
^FO156,108^A0N,22,22^FB246,1,0,L,0^FD<job-tail>^FS       ; job (last segment of "2026-04-Smith-001" → "001")
^XZ
```

Field substitutions happen on the server. Exact template tuning is open per spec §14 Round 4 — to be refined when physical printer is available.

### 5.6 Library choice

- QR: `qrcode` npm package — server-side render to either ZPL `^BQN` native QR field (preferred) or `^GFA` raster fallback
- HTTP POST to helper: `fetch` from the browser, no library needed

### 5.7 Testing without a printer

- **Server unit:** vitest tests for `renderZpl(lot)` — exact ZPL string output for sample lots
- **Visual:** paste rendered ZPL into [Labelary's web renderer](https://labelary.com/viewer.html). A dev-only "Open ZPL in Labelary" button on the lot detail modal opens Labelary in a new tab with ZPL pre-loaded — removed before v1 cutover (intentional throwaway, tiny)
- **Integration:** in vitest, mock the helper endpoint (e.g. `msw`) and verify the client posts the right ZPL

### 5.8 Print failure UX

| Failure mode | Detection | UX |
|---|---|---|
| Helper unreachable | fetch rejects / 404 | Amber toast: "Printer offline. Lot saved. [Retry] [Dismiss]" |
| Helper reachable, printer error | Browser Print returns non-2xx with error body | Amber toast surfaces error text + Retry / Dismiss |
| Browser offline | `navigator.onLine === false` | Suppress retry button; toast says "Offline — try again when connected." Local queueing is Phase 3 concern |

### 5.9 Phase 2 success criteria

- ✅ Print Label / Reprint Label buttons present in lot detail modal + bulk Move dialog
- ✅ Server `/api/labels/render` returns valid ZPL
- ✅ Client `useLabelPrint()` hook fetches ZPL and POSTs to configured helper
- ✅ Toast feedback on both outcomes
- ✅ ZPL visually verified via Labelary
- 🟡 Physical printer round-trip test deferred until hardware is on hand

---

## 6. Bulk action mechanics

### 6.1 Selection model

- Stored in `useState` lifted to `InventoryPage` (NOT in URL — selection is transient)
- Capped at a sane number (~500) on the client to avoid huge selections; "Select all 247 matching lots" affordance sends the filter spec to the server instead of materializing IDs

### 6.2 Selection interactions (per handoff §"Selection model")

- Row click when `selection.size === 0` → opens lot detail modal
- Row click when `selection.size > 0` → toggles selection on that row (avoids accidentally opening modal during sweep-select)
- Row checkbox click → always toggles selection regardless
- Header checkbox → toggles "select all on this page"
- "Select all 247 matching" affordance appears in bulk action bar, sets a server-side flag

### 6.3 Bulk action bar

Sticky bottom bar visible iff `selection.size > 0`:

- Left: selection count + "Clear selection" button
- Right: **Move** · **Change status** · **Export CSV** · **Delete** *(admin only)*
- *Note: the Run AI button is intentionally absent from Phase 2 (rather than disabled). Reintroduced in Phase 4 when the AI subsystem ships.*

Each action opens a modal dialog. Per D-002, dialogs do **not** re-list the selected lots.

### 6.4 Bulk dialog patterns

| Dialog | Inputs | Submit behavior |
|---|---|---|
| **Move** | Destination customer → job picker; "Reprint labels?" checkbox (default on) | POST `/api/lots/bulk` with `action: 'move'`. On success, optionally fires `useLabelPrint()` for each affected lot in series |
| **Change status** | Popover lists only **shared legal transitions** for ALL selected lots (per D-003). Mixed selection with no shared target → empty state + "Refine selection by status" guidance, action disabled | POST `/api/lots/bulk` with `action: 'change-state', params: { to }` |
| **Delete (admin)** | Destructive solid-red treatment. Type-confirm: user must type `DELETE` to enable submit | POST `/api/lots/bulk` with `action: 'delete'` |
| **Export CSV** | Read-only display of which columns will be exported (the v1 column manifest from §7) | GET `/api/lots/export?<filters>` returns `text/csv`; browser triggers download |

### 6.5 Partial-failure UX

The bulk endpoint returns per-lot results. UI behavior:

- All-success: green toast "8 lots updated", close dialog, clear selection
- All-failure: keep dialog open, show inline error summary
- Partial-success: amber toast "7 of 8 lots updated · 1 failed: see details" (expandable to show which lots failed and why). Failed lots remain selected so user can retry / inspect

### 6.6 Shared legal transitions (UI mirror of server logic)

```ts
function sharedLegalTransitions(lots: Lot[]): State[] {
  const perLotLegal = lots.map(l => legalTransitions(l.state));
  return intersectAll(perLotLegal);  // intersection across all lots
}
```

If empty → bulk Change-state is disabled with the empty-state message.

### 6.7 Permission gating

- Bulk action bar fully visible to admin/office; warehouse role does not see `/inventory` (sidebar conditional + route guard)
- Delete action visible only when `role === 'admin'`
- Server enforces same rules independently — UI is convenience, server is authoritative
- Race conditions (state changed between view and submit) are handled by the per-lot validation returning `ILLEGAL_TRANSITION`; partial-failure UX surfaces it naturally

---

## 7. Open implementation items resolved at plan time

From spec §14, items relevant to Phase 2:

| Item | Phase 2 resolution |
|---|---|
| Description max length (§14 R1) | UI soft limit 2000 chars; DDL stays `text` (no DDL change). Revisit if real content needs more |
| Currency precision (§14 R1) | `numeric(10,2)` USD per Phase 1 schema; no change |
| Field length limits in general (§14 R1) | Pinned in the implementation plan when DDL/UI is built |
| Exact ZPL template (§14 R4) | Phase 2 ships the working template in §5.5; tuning happens when physical printer is on hand |
| Reprint flow UI placement (§14 R4) | Lot detail modal Reprint button + bulk Move dialog "Reprint labels?" checkbox |
| Print failure UX (§14 R4) | Amber toast pattern in §5.8 |
| Export CSV column manifest (§14 R5) | Fixed at: `id, customer, job, lot_number, state, title, description, price, special_notes_category, special_notes_text, untested, quantity, ai_status, created_at, updated_at`. Additions require an explicit spec amendment |
| Saved filter presets (§14 R5) | NOT addressed in Phase 2 |
| Audit_log DDL + trigger code (§14 R6) | Already shipped in Phase 1; actor capture wired this session |

---

## 8. Testing strategy

| Layer | What | Where |
|---|---|---|
| **Backend unit (vitest)** | All new endpoint handlers (lot CRUD, bulk, label render, system settings); `legalTransitions()` map; `validateTransition()`; `renderZpl()` exact-string assertions | `tests/api/lots.test.ts`, `tests/api/lots-bulk.test.ts`, `tests/api/labels.test.ts`, `tests/api/system-settings.test.ts`, `tests/lib/lot-state.test.ts` |
| **Frontend unit (vitest)** | UI mirror of `legalTransitions`, `sharedLegalTransitions`, filter parsing, selection state derivations, optimistic-rollback hooks | colocated `*.test.ts` next to the helper |
| **Integration (vitest, Test Supabase)** | Audit-actor capture confirms `audit_log.changed_by` non-NULL after each mutation type. State-machine validation rejects illegal transitions server-side. Move-to-auction atomicity (no orphaned `lot_number` slots) | `tests/integration/audit-actor.test.ts`, `tests/integration/lot-lifecycle.test.ts` |
| **Visual ZPL** | Server-rendered ZPL pasted into Labelary for visual confirmation against sample lot data | Manual checklist; documented in plan |
| **Preview manual test** | End-to-end click-through on Vercel preview against Dev Supabase, with pre-seeded test data | Sign-off checklist mirrors Phase 1 pattern in STATE.md |

### 8.1 Probe script extensions

`npm run probe:preview` extends to assert:
- `GET /api/lots` returns 200 (list endpoint works)
- `POST /api/labels/render` returns valid-shaped ZPL for a known lot
- `GET /api/system-settings` returns 200

A fresh deploy is gated on more than just `/api/health`.

---

## 9. Risks

1. **Phase size.** Inventory + modal + bulk dialogs + label printing + settings is substantial — likely 25–40 implementation tasks. The plan-writing step will produce a more accurate count. If it's too large to execute in one session, we split at plan time, not now.

2. **Browser Print CORS in practice.** The pipeline relies on Zebra's documented CORS-permissive headers on the helper. If the helper version on the actual workstation behaves differently, a thin Vercel-proxy fallback may be needed (out-of-spec but feasible). Won't surface until physical-printer test.

3. **Code-splitting trade-offs.** First-load is faster but routes carry a small additional latency on first navigation. With Vercel edge caching and shared vendor chunks the perceptible difference is small. Acceptable.

4. **Description length.** Soft-capping at 2000 chars in UI without DDL enforcement leaves room for disagreement later. If a real-world description blows past 2000, we revisit.

5. **Sample data dependency for Phase 2 testing.** The success criteria assume test lots can be created via Supabase dashboard or API. The plan should include a small seed script (or document the Supabase dashboard procedure) so the developer can quickly bootstrap a meaningful inventory for manual testing.

---

## 10. Things explicitly NOT in Phase 2 (to prevent scope creep at plan time)

- AI subsystem (any UI; bulk Run AI button is dropped, not disabled)
- Audit reporting view
- Users management page
- AI schedule + Organization sections of Settings
- Saved filter presets
- Global search across customers / jobs / lots
- Photo capture pipeline → Phase 3
- Mobile cataloging flows → Phase 3
- Native mobile app, auction platform integrations → post-v1
