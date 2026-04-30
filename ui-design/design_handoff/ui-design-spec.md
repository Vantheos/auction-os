# Auction Inventory SaaS — UI / Design Handoff

> Self-contained design brief for visual mockups. Distilled from `overview.md` v0.9. **All design rounds complete.** This file is the Claude Design handoff.
>
> Last updated: 2026-04-29 (after Round 7).

---

## 1. Product context

A web app used by an auction-selling business to receive, photograph, and catalog used inventory; assign lots to upcoming auctions; and (in v2) export batch upload files to external auction platforms.

The actual auctions run on third-party platforms — this app does **not** conduct live auctions. It manages inventory and prepares it for sale.

The app must work on **both phones and desktops**:

- **Phones** are the primary tool for **cataloging** — staff walk the warehouse with a phone, photograph items, and capture them as lots one at a time.
- **Desktops** are the primary tool for **administration** — managing customers and jobs, browsing/editing inventory, assigning lots to auctions, running AI tasks, and managing users.

The same web app serves both surfaces via a responsive layout — there is no native mobile app.

---

## 2. Roles and surfaces

Three roles. RBAC is role-only (single tenant — no organizational separation).

| Role | Description | Primary surface | Notes |
|---|---|---|---|
| **Admin** | Full system access; manages users, customers, jobs, system config | Desktop | Can use mobile too |
| **Office** | Desk-based work — auction management, inventory editing, lifecycle, AI runs | Desktop | Can use mobile too |
| **Warehouse** | Mobile cataloger; photographs and registers lots; can also browse/edit any lot | Mobile (cataloging) and Mobile/Desktop (browsing) | No bulk actions on mobile |

All three roles can browse inventory and view all lots. Bulk actions (multi-select, mass state change, mass auction assignment) are **desktop-only**.

---

## 3. Core entities

A user-friendly mental model:

- **Customer** — the consignor / source. Has a name. Lives in its own list, managed by admin or office.
- **Job** — owned by a customer. **A `(customer, job)` pair represents an auction** — there is no separate Auction entity. "Auction management" UI operations are operations on jobs.
- **Lot** — the unit of cataloging. One lot record may represent one physical item or several. A lot's `(customer, job, lot_number)` tuple is its **auction assignment** when the lot is in state `assigned`. When the lot becomes `unassigned` or `not-sellable`, the tuple is cleared. Lots can be moved between auctions, which clears the source tuple and assigns a new one in the destination job.
- **Lot states (v1):** `assigned` (default for newly cataloged) · `unassigned` · `sold` · `picked-up` · `not-sellable`. `picked-up` and `not-sellable` are terminal. Lots in terminal or `sold` states are **read-only** in the UI (no field edits; only legal state transitions and label reprint allowed).

A typical chain when the lot is `assigned`: *Customer "Smith Estate" → Job "2026-04-Smith-001" → Lot 13.*

---

## 4. Mobile cataloging flow (Warehouse)

The most-used surface in the app. Optimize for one-handed use, standing in a warehouse, possibly with gloves on. Big tap targets, minimal typing.

### 4.1 Pre-session: pick Customer + Job

After login, the operator lands on a Customer/Job picker.

- **Customer dropdown** — searchable list. Once chosen, the Job dropdown surfaces.
- **Job dropdown** — searchable list scoped to the chosen customer.
- **Begin Session** button — disabled until both are picked.

### 4.2 The cataloging loop — one lot at a time

After session starts, the operator lands on a fresh **Lot in progress** screen with the next available lot number reserved (e.g., "Lot 10"). The screen has roughly this shape:

```
+-----------------------------------+
| Smith Estate · 2026-04-Smith-001  |  <- session header (customer · job)
| Lot 10                            |  <- big lot number
+-----------------------------------+
| [ Camera button ]                 |  <- prominent CTA
+-----------------------------------+
| Thumbnails: [▢] [▢] [▢] [+]       |  <- photos taken so far
+-----------------------------------+
| Special Notes: [ None ▼ ]         |  <- dropdown (required, defaults to None)
| [Size: __________________ ]       |  <- shown only when CLOTHING is selected
| Untested: [ ☐ ]                   |  <- checkbox (defaults to off)
| Title: [          (optional)    ] |  <- optional fields
| Description: [   (optional)     ] |
| Quantity: [  (optional)         ] |
| Price: [    (optional)          ] |
| Ref1 / Ref2: [  (optional)      ] |
+-----------------------------------+
| [ New Catalog ]    [ Next ]       |  <- big buttons at bottom
+-----------------------------------+
```

### 4.3 Camera flow

- Operator taps the camera button.
- The **device's native camera** opens (no in-app viewfinder — uses `<input type="file" accept="image/*" capture="environment">`).
- One photo per camera invocation. Operator returns to the Lot in progress screen with the new photo as a thumbnail.
- Operator can take up to 12 photos per lot (minimum 1). Tap any thumbnail to **retake / delete / reorder**.
- Photos upload **asynchronously in the background** while the operator continues. A small indicator shows pending uploads if a backlog forms.

### 4.4 Special Notes + Untested

**Special Notes dropdown** (required, defaults to `None`):

| Option | Surfaces text input? (label) | Where it shows on AI output |
|---|---|---|
| `None` | no | nowhere |
| `TOOL ONLY` | no | end of title |
| `READ` | no | end of title |
| `CLOTHING` | yes — labeled `Size` | end of description as `CLOTHING - <size>` |

**Untested checkbox** (defaults to off): when checked, AI's description gets `UNTESTED` (capitalized) appended at the end.

These settings are operator-set at intake. AI consumes them when generating the title and description.

### 4.5 Saving the lot

- **Next** button — saves the current lot, prints the label (see §7), increments the lot number by 1, and presents a fresh Lot in progress screen.
- **New Catalog** button — exits the session and returns to the Customer/Job picker.

Most fields (title, description, quantity, price, ref1, ref2) are **optional at intake**. They're routinely backfilled later by AI or by Office staff on desktop.

---

## 5. Lot detail modal (used everywhere — desktop + mobile)

This modal opens whenever someone clicks a lot row in the Inventory page (desktop) or taps a lot row (mobile). It also shows up after multi-select to step through selected lots.

### 5.1 Structure

```
+---------------------------------------------+
| < ›  ‹ ›   Lot 13 — Smith Estate · 2026-04 |  <- title row + nav arrows (when multi-select)
+---------------------------------------------+
| [    LARGE PHOTO    ]   [ all attributes ] |
| [                   ]   [ title          ] |
| [   ‹ image arrows › ]   [ description    ] |
| [   thumbnail strip ]   [ price          ] |
| [   ▢ ▢ ▢ ▢ ▢       ]   [ state badge    ] |
|                          [ special notes  ] |
|                          [ ref1 / ref2    ] |
|                          [ quantity       ] |
|                          [ intake info    ] |
|                          [ history        ] |  <- audit (Round 6)
+---------------------------------------------+
| [ Edit ] [ Reprint Label ] [ State ▼ ] [Close]
+---------------------------------------------+
```

### 5.2 Behaviors

- **Photo gallery** — large image with thumbnail strip below; arrow controls on the image to step through the lot's photos. Click any thumbnail to switch to it.
- **Forward / back lot navigation** at the top — visible only when entered from a multi-select context. Lets the user step through selected lots without closing.
- **Editable fields** — most lot attributes can be edited inline when the lot is in `assigned` or `unassigned` state. **In `sold`, `picked-up`, or `not-sellable` states, all fields are read-only** — edit affordances disappear from the modal.
- **Reprint Label** — re-sends the label to the printer. Available in **all states**, including frozen ones.
- **State** — opens a state-change action menu. Legal transitions per the state machine (see §11). Transitioning into `picked-up` or `not-sellable` shows a **confirmation modal** before commit.
- **Move to another auction** — composite action shown for `assigned` lots. Internally clears the current `(customer, job, lot_number)` and reassigns to a new job. Triggers a "Reprint label?" prompt (no — per the model, relabeling on reassignment is not required).
- **Delete** — admin-only. Hard delete with confirmation modal.
- **No history tab** — audit information is admin-only via a dedicated reporting view, not in this modal.

### 5.3 Mobile rendering

- Modal renders **full-screen** on mobile.
- Photo gallery moves to the top; attribute fields stack below.
- Navigation arrows remain at top of screen.

---

## 6. Inventory page (desktop + mobile)

The main browsing/searching/managing surface.

### 6.1 Desktop layout

```
+--------------------------------------------------------------+
| [ Search... ]   Saved presets ▼   [ Save current as preset ] |
+--------------------------------------------------------------+
| FILTERS         | RESULTS                                    |
|                 |                                            |
| Customer [▼]    | Sort: [Date cataloged, newest ▼]   12,403 |
| Job [▼]         | [☐ select all]   [ ▤ rows | ▦ cards ]      |
| State [▼]       |                                            |
| Auction [▼]     | [☐] [▢ thumb] Smith·2026-04·13  Antique vase  | sold |
| Date range      | [☐] [▢ thumb] Smith·2026-04·12  Walnut chair  | unassigned |
|                 | [☐] [▢ thumb] Jones·2026-03·47  Pocket watch  | assigned |
| Special Notes   | ...                                        |
|                 | (virtualized infinite scroll)              |
| Has title       |                                            |
| Has description |                                            |
| Has price       |                                            |
| AI'd yet        |                                            |
+--------------------------------------------------------------+
| (when selection non-empty:)                                  |
| 5 selected · [ Assign to auction ] [ Change state ] [ Run AI ] [ Export CSV ] |
+--------------------------------------------------------------+
```

### 6.2 Filters (left sidebar)

- **Customer** — searchable dropdown
- **Job** — cascades from Customer
- **Lot state** — multi-select: `assigned` · `unassigned` · `sold` · `picked-up` · `not-sellable`
  (**Default browse hides `picked-up` and `not-sellable`** — terminal states. Both remain queryable when explicitly included via this filter.)
- **Date cataloged** — range picker
- **Special Notes category** — multi-select
- **Boolean filters** — `Has title` · `Has description` · `Has price`
- **AI run status** — multi-select: `success` · `partial` · `failure` · `not yet run` (see §6.11)

### 6.3 Search bar

- Free-text search across title, description, ref1, ref2, customer name, job number.

### 6.4 Saved filter presets

- User can name and save the current filter combination.
- Surfaced as a dropdown at the top (e.g., "Needs description", "Ready to assign", "Recent intake").
- Persistence model is implementation-level.

### 6.5 View toggle

- **Compact rows (default)** — thumbnail · `Customer · Job · Lot` · title · state badge · row checkbox
- **Cards with thumbnails** — grid layout, larger thumbnails, same fields

### 6.6 Sort

Default: **Date cataloged, newest first.**

Options: Date cataloged (newest/oldest) · Customer (A→Z / Z→A) · Lot number (ASC/DESC) · State.

### 6.7 Pagination

**Virtualized infinite scroll.** Selection persists as the user scrolls.

### 6.8 Selection + bulk actions

- Per-row checkbox toggles selection. Click on the row body opens the detail modal.
- When selection is non-empty, a **bulk-action bar** appears at the bottom (or top — designer's call) with:
  - Assign to auction (opens auction picker)
  - Change state
  - Run AI on selected
  - Export selected to CSV (basic; template-driven export is v2)

### 6.9 Mobile inventory page

Tighter, single-lot focused. **No bulk actions.**

```
+---------------------------+
| [ Search... ]    [ ⌕ ]   |  <- sticky top bar
+---------------------------+
| [▢ thumb] Smith·2026-04·13 |  <- single-column rows
|           Antique vase     |
|           ● sold           |
+---------------------------+
| [▢ thumb] Smith·2026-04·12 |
|           Walnut chair     |
|           ○ unassigned     |
+---------------------------+
| ...                       |
+---------------------------+
```

- **Sticky top bar:** search input · filter button (opens slide-out drawer)
- **Slide-out filter drawer:** same filter set as desktop, mobile-friendly
- **Tap a row:** opens the lot detail modal full-screen

---

## 6.10 Lot lifecycle UI surfaces

These behaviors apply across the inventory page and lot detail modal.

### State machine (visualized)

```
       (creation: first photo) → assigned
                                    │
                  ┌─────────────────┼──────────────────┐
                  ↓                 ↓                  ↓
              unassigned          sold           not-sellable
                  ↑                 ↓               (terminal)
                  │             picked-up
        ┌─────────┘             (terminal)
        │
   (reassign to
   different auction)
```

### Confirmation prompts

These transitions show a confirmation modal before commit:

- `assigned` → `not-sellable`
- `unassigned` → `not-sellable`
- `sold` → `picked-up`
- Hard-delete (admin only)

### Frozen-state visual treatment

Lots in `sold`, `picked-up`, or `not-sellable` state render in the lot detail modal with:

- All field-edit affordances **hidden** (read-only display).
- A small visual indicator on the modal header (e.g., a "🔒 Read-only" badge or grayed-out edit pencil).
- State-change menu still available for **legal next transitions** (e.g., `sold → picked-up`).
- **Reprint Label** button still available.

### "Move to another auction" composite action

Available on lots in state `assigned`. Opens a destination-job picker (Customer → Job cascade), confirms, then atomically:
1. Clears the lot's current `(customer, job, lot_number)`.
2. Sets the new tuple — `lot_number` = next available in the destination job.

The lot's state remains `assigned` throughout (it doesn't visibly pass through `unassigned`).

### Audit visibility

Audit history is **admin-only** via a dedicated reporting view inside the admin section. The lot detail modal does **not** show audit history. Non-admin roles never see audit data.

---

## 6.11 AI surfaces

AI generates **title**, **description**, and **reference price** for each lot. It runs manually (button) or on a schedule (admin-configurable). Office or Warehouse can edit AI output afterward (when the lot is in `assigned` or `unassigned` state — see §6.10 frozen-state rules).

### Manual triggers

- **Single-lot:** **Run AI** button on the lot detail modal (§5).
- **Bulk:** **Run AI on selected** in the inventory bulk-action bar (§6.8).

### AI run status — surfaced in the inventory list and lot detail

Each lot tracks an AI run status from its most recent run:

- ✅ `success` — AI ran cleanly; no UI indicator beyond standard row appearance
- ⚠️ `partial` — AI generated some fields but not others (e.g., description set but price lookup failed). Row shows a small warning icon; clicking the row opens the modal which displays the error details
- ❌ `failure` — AI failed entirely. Row shows an error icon; modal shows error text
- (none) `not yet run` — initial state for new lots; no indicator

### AI status filter

Inventory left sidebar (§6.2) gains an **AI run status** filter — multi-select with `success` / `partial` / `failure` / `not yet run`.

### Title rendering

Titles displayed anywhere in the UI follow a strict format generated by AI. Hard maximum 50 characters:

```
$<price>- <quantity>x <brand> <brief description>[ <special note suffix>]
```

When `lot.price` is null, the title is rendered with `$$$` in place of `$<price>` (e.g., `$$$- 1x Stanley 16oz Hammer`). The substitution lives in the rendering layer, not the database.

### Description rendering

AI-generated description body, with conditional appended suffixes:

- `CLOTHING - <size>` if Special Notes = CLOTHING (size from the conditional input)
- `UNTESTED` (capitalized) if the operator's untested checkbox was true

Both can apply to the same lot.

### Admin Settings — AI schedule

Admin Settings page gets a new section:

```
AI Schedule
[ ✓ ] Enabled
Frequency:    ( ) Hourly   (•) Daily
Time of day:  [ 23:00 ]    <-- visible when Daily is selected
```

Saving updates the `system_settings` row. The hourly Vercel cron then reads the row and decides whether to run.

---

## 7. Label printing (touchpoints in the UI)

Labels print automatically when the operator taps **Next** (mobile cataloging). They're 4" × 2" thermal labels via a Zebra ZD450 + Zebra Browser Print local helper.

UI touchpoints:

- **No new screen for printing** — happens silently on **Next**.
- **Print failure indicator** — if the printer isn't responding, surface a non-blocking notice ("Label print failed — retry"). The lot still saves.
- **Reprint button** — on the lot detail modal (§5), accessible to all roles.

Label content (for designer reference — fixed format printed via ZPL):

```
+--------------------------------------------+
|   [QR code]   Lot 13                       |
|               Customer: Smith Estate       |
|   ~90×90 px   Job: 2026-04-Smith-001       |
|               2026-04-29  •  Op: AM        |
+--------------------------------------------+
```

QR encodes `https://<domain>/lot/<lot-id>` so any phone QR scanner opens the lot page.

---

## 8. Admin / Office desktop pages (light detail — for layout planning)

These pages exist but aren't deeply specced yet. Mockups should sketch their general shape.

### 8.1 Customers page

- List of customers with a search.
- Create / edit customer (name only is required; CRM data lives elsewhere).
- Click a customer → see jobs and lots scoped to them.

### 8.2 Jobs page (likely scoped under Customers)

- For a chosen customer, list of jobs with their `job_number` and creation date.
- Create / edit / delete (admin only) a job.
- Click a job → see lots scoped to that (customer, job).

### 8.3 Auctions page

- List of auctions with date / status / lot count.
- Create / edit / delete (admin only) an auction.
- Click an auction → see assigned lots; ability to assign more lots (likely opens a multi-select picker).

### 8.4 Users page (admin only)

- List of users with name, email, role, status.
- Add user, change role, deactivate.

### 8.5 Settings (admin only)

- Printer settings (Browser Print helper URL, etc.).
- AI scheduling configuration (see §6.11 — Enabled toggle, Frequency, Time of day).

---

## 9. Visual / branding open items

These are **not yet decided** and are open for designer input:

- Color palette — currently no brand guidance.
- Typography — open.
- App name / wordmark / logo — open.
- Iconography — open (we'll use shadcn/ui defaults unless something better is proposed).
- Empty states / error states styling — open.

Tech-stack constraint: the app is built on **React + Vite + TailwindCSS + shadcn/ui** components, so the visual system should be expressible in those tools.

---

## 10. Status

**All design rounds complete.** This file is ready to hand to Claude Design (or any UI/UX designer) for visual mockups. It is independent of the implementation plan — designer work can proceed in parallel with engineering.
