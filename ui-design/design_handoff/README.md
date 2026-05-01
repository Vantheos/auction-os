# Liquidation OS — Design Handoff

> **What this is:** UI design references for **Liquidation OS**, an internal SaaS for cataloging warehouse items, assigning them to auction lots, and managing the lifecycle from intake → sale → pickup. Designs cover three workflows: **mobile cataloging**, **desktop inventory & lot lifecycle**, and **admin (customers / users / settings / audit)**.
>
> **What you do with it:** Recreate these designs in the target codebase using its existing patterns and component library. The bundled HTML files are **prototypes**, not production code — don't ship them as-is. Use them to drive pixel-level decisions (color, spacing, typography, layout, interaction) when building the real app.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, copy, and interaction behavior. Layouts are pixel-accurate to a 1180–1200 px desktop canvas and a 412 px mobile canvas (Pixel-class device frame). Every screen state has been designed (default, selection, error, frozen, modal-open, AI-partial, AI-failed, etc.) — recreate them faithfully.

If your codebase has an established UI library (Material, Fluent, Chakra, internal kit), prefer **its** primitives; map the visual tokens below to that kit's nearest equivalent rather than reinventing button/input components. Layout and interaction logic should still match these designs exactly.

---

## How to view the designs

Open any of the four HTML files directly in a browser — they are self-contained (React + Babel + JSX from CDN). All four files share a **Tweaks** panel (bottom-right) that toggles between:

- **Canvas mode** — every screen and state laid out side-by-side (best for reference / comparison).
- **Play mode** — a live, interactive walkthrough where you can click through the flow.

| File | What it covers |
|---|---|
| `00-three-directions-overview.html` | The three Win11-flavored visual directions explored before the customer chose **Option C · Mica Slate**. Useful for context only — not for implementation. |
| `01-cataloging-and-inventory.html` | The mobile cataloging loop (customer/job picker → lot in progress → save → photo manager → end-session) plus the desktop inventory list with lot detail modal. |
| `02-lot-lifecycle.html` | All lot-state behavior: editable vs frozen modals, single-lot and bulk actions, state-change confirmations, move-to-auction picker, AI run states (success / partial / failure). |
| `03-admin-shell.html` | Admin-only area: Customers list + jobs detail, Users page, Settings (printer + AI schedule + org), Audit reporting view. Shared rail-nav chrome. |

Files 01–03 are the implementation targets. File 00 is reference for "why does it look this way." (Options A and B are kept for that context but **only Option C is to be implemented**.)

---

## Source materials in this folder

```
design_handoff/
├─ README.md                          ← you are here
├─ ui-design-spec.md                  ← the original product spec from the customer
├─ SPEC-DEVIATIONS.md                 ← decisions where the design diverges from the spec, with rationale
│
├─ 00-three-directions-overview.html  ← reference only (Options A / B / C compared)
├─ 01-cataloging-and-inventory.html   ← IMPLEMENT
├─ 02-lot-lifecycle.html              ← IMPLEMENT
├─ 03-admin-shell.html                ← IMPLEMENT
├─ 04-mobile-inventory.html           ← IMPLEMENT (added 2026-05-01 for Phase 3 — closes the mobile inventory gap from the original handoff)
│
├─ shared.jsx                         ← sample data, icons, photo placeholder, state labels
├─ option-c.jsx                       ← inventory list + lot detail modal (used by file 00; logic ported into option-c-lifecycle.jsx)
├─ option-c-flow.jsx                  ← cataloging mobile screens + sample customer/job data
├─ option-c-lifecycle.jsx             ← lifecycle: bulk action bar, dialogs, frozen modals, AI states
├─ option-c-admin.jsx                 ← admin shell, customers, users, settings, audit
├─ option-c-mobile-inventory.jsx      ← mobile inventory list + filter sheet + full-screen lot detail (Phase 3 addendum)
├─ option-a.jsx, option-b.jsx         ← reference only (other directions)
├─ tweaks-panel.jsx                   ← in-design tweak controls (not part of the product)
├─ android-frame.jsx                  ← phone bezel for mobile mockups (not part of the product)
└─ design-canvas.jsx                  ← canvas-mode chrome (not part of the product)
```

**Read first**, in order: this README → `ui-design-spec.md` → `SPEC-DEVIATIONS.md` → the three implementation HTML files.

---

## Product overview (1-minute version)

Liquidation OS catalogs items in a warehouse, groups them into auction lots, and tracks each lot's lifecycle through to pickup.

**Roles:**
- **Admin** — full access; manages users, settings, audit. Desktop-primary.
- **Office** — runs auctions, edits inventory, triggers AI. Desktop-primary.
- **Warehouse** — walks the warehouse with a phone, photographs items, registers them as lots. Mobile-primary.

**Core entities:**
- **Customer** — the consignor (a name).
- **Job** — owned by a customer. **A `(customer, job)` pair *is* an auction.** There is no separate Auction entity. (See `SPEC-DEVIATIONS.md` D-006.)
- **Lot** — the unit. May represent one or several physical items. A lot's `(customer, job, lot_number)` triple is its auction assignment when its state is `assigned`.

**Lot states (state machine):**
```
in_progress → unassigned ⇄ assigned → sold ⇄ unassigned
                ↓             ↓        ↓
            not-sellable ←────┘    picked-up
```
- `sold → unassigned` is legal (sale falls through; lot returns to inventory)
- `sold → picked-up` is the normal "buyer collects" path
- `picked-up` and `not-sellable` are **terminal**
- `sold` is **frozen** for field edits per amended D-001 — preserves what bidders saw on the auction platform
- `in_progress` is client-side only (during cataloging before first save)
- Plus admin-only hard delete from any state

(Schema uses **hyphenated** state values: `picked-up`, `not-sellable`. Earlier doc revisions used underscores; hyphens are authoritative.)

**AI:** generates title / description / reference price for each lot. Runs manually (button) or on a schedule (admin-configurable in Settings). Each AI field is independently `success | partial | failure` — partial = some fields populated, failure = none.

**Label printing:** 2″×1″ thermal labels via Zebra ZD450 + Zebra Browser Print local helper. Triggered manually by a button (see `SPEC-DEVIATIONS.md` D-004 for why we removed auto-print). (Original handoff documented 4″×2″; downsized to 2″×1″ post-handoff per user direction.)

---

## Design system / tokens

### Color (Option C — Mica Slate)

CSS variables are surfaced under `--c-accent` (user-tweakable). Treat the token names as canonical; map to your kit's nearest equivalents.

```
Brand
  --c-accent              #1E40AF   (slate blue; primary actions, focus, selection)

Surface (light, "Mica" wash)
  bgWash                  linear-gradient(180deg, #EFF1F4 0%, #E5E7EC 100%)
  surface                 rgba(255,255,255,0.72)   ← topbars over wash
  surfaceAlt              rgba(248,250,252,1)      ← table headers, panels
  surfaceSolid            #FFFFFF                  ← cards, inputs, list rows

Text
  text                    #0F172A
  textDim                 #475569
  textFaint               #94A3B8

Border
  border                  rgba(15,23,42,0.08)
  borderStrong            rgba(15,23,42,0.14)

Status / semantic
  success                 #15803D  on #DCFCE7
  warning                 #92400E  on #FEF3C7
  danger                  #B91C1C  on #FEE2E2
  info                    #1E40AF  on #DBEAFE

Lot state pills
  in_progress             #475569  on #F1F5F9
  unassigned              #92400E  on #FEF3C7
  assigned                #1E40AF  on #DBEAFE
  sold                    #15803D  on #DCFCE7  (frozen — D-001 amended)
  picked-up               #475569  on #E2E8F0  (frozen, terminal)
  not-sellable            #B91C1C  on #FEE2E2  (frozen, terminal)

AI state
  success                 #15803D
  partial                 #B45309   (amber)
  failure                 #B91C1C
  not_run                 #94A3B8   (faint)

Role pills
  admin                   #B91C1C  on #FEE2E2
  office                  #1E40AF  on #DBEAFE
  warehouse               #92400E  on #FEF3C7

Window chrome (the dark frame around mockups)
  #1F1F1F                 ← topbar of canvas-mode chrome only; NOT part of the product
```

The `#1F1F1F` topbar in the HTML files is **chrome around the design** (canvas-mode wrapper, like a picture frame). The product itself is the lighter Mica-style content inside. Don't ship the dark frame.

### Typography

```
Font stack:  "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, sans-serif
Mono:        "JetBrains Mono", ui-monospace, "SF Mono", monospace   (lot numbers, IDs, timestamps)

Type scale (px / weight / letter-spacing):
  Display      28 / 700 / -0.5     page hero (rare)
  Title        22 / 700 / -0.4     customer detail header
  H1           18 / 700 / -0.3     page title in PageHeader
  H2           14 / 600 /  0       card headers
  Body         13 / 500 /  0       table rows, modal body
  Small        12 / 500 /  0       secondary metadata
  Caption      11 / 600 / +0.4     pill labels (UPPERCASE)
  Tiny         10 / 600 / +0.4     column headers (UPPERCASE)
  Mono small   11 / 500 / -0.2     IDs, timestamps, job numbers
```

If your codebase doesn't have Segoe UI Variable licensed, fall back gracefully — Inter or Public Sans render acceptably; **avoid system-ui only** because it ships SF Pro on macOS, which is wrong for the Win11 flavor we're going for.

### Spacing & shape

```
Radius
  small        4         (status pills inside dense rows)
  default      6         (--radius)
  large        10        (--radius-lg; cards, modals, dialogs)
  pill         12        (role/status pills)

Spacing (px)
  base 4 / row 8 / cluster 10 / section 14 / card-pad 18 / page-pad 24

Shadow (used sparingly — Mica is mostly elevation-by-translucency)
  card     0 1px 2px rgba(0,0,0,0.04)
  modal    0 24px 64px -12px rgba(0,0,0,0.5)
  toggle   0 1px 4px rgba(0,0,0,0.2)

Border
  hairline:  1px solid rgba(15,23,42,0.08)
  strong:    1px solid rgba(15,23,42,0.14)
```

### Iconography

Inline SVG, 12–14 px, stroke-only (1.5–2.0). The handful of icons used are defined as `d` strings in `shared.jsx → ICONS`. They're intentionally simple — replace with your kit's icon set (Lucide / Phosphor / Fluent UI Icons all work; **don't** use emoji). Icons used: search, plus, edit, trash, printer, photo, chevron-right, dots, calendar, lock.

---

## Screens to implement

### 1. Mobile cataloging (file `01-cataloging-and-inventory.html`)

Played in a 412 px Android frame. Five screens form the loop. **Warehouse role only.**

#### 1a. Customer / Job picker
Two-step disclosure: customer list → jobs for that customer. Search box at top. Closed jobs are **visible but disabled** (grayed) — see D-005. Title: "Customer · Job" (just the relationship, no app name yet). On select-job: navigate to lot-in-progress with a fresh lot.

#### 1b. Lot in progress (the main cataloging surface)
- **Header**: customer + job on the left, big lot number on the right.
- **Top row**: Quantity stepper (default 1) and Untested toggle, both 38 px tall.
- **Title** input (single line). **Description** textarea.
- **Special Notes** required dropdown.
- **Size** field shows **only** when `category === 'CLOTHING'`.
- **Additional Info** chevron — reveals optional fields (brand, condition, dimensions, etc).
- **Photo strip** — first photo gets a "Cover" badge; "+" tile to add (max 12). First photo CTA is a large gradient button; subsequent adds use a compact "Add Photo" button.
- **Footer**: **Print Label** button (manual, see D-004) and **Next** button (saves and starts a new lot in the same job).

#### 1c. Save success
Compact confirmation. "Lot N saved. Print queue: 0. Network: ok." Auto-advance to a new in-progress lot after ~800 ms (or on Next).

#### 1d. Photo manager
Reorderable grid of all photos for the current lot. Long-press to drag; tap to set cover; trash icon to delete; "+" to add. Cover badge follows whichever is in slot 1.

#### 1e. End-session confirm
"End cataloging session? N lots completed in this session." Confirm clears local state.

**Toasts/transient feedback:** print failures appear as a top-of-screen amber toast that doesn't block save.

### 2. Desktop inventory + lot detail modal (also file `01`, also `02`)

#### 2a. Inventory list (the action hub — see D-002)
- Filter chips above the table: Customer, Job, **Lot Status**, **AI Status**, Date.
  - Filter chip behavior: when zero options selected → label is the bare filter name ("Lot Status"). When one or more selected → label includes the selected values comma-joined, truncated with "+N more" if many. (Currently both Lot Status and AI Status chips show their bare label by default; this is the no-selection state.)
- Header checkbox = select all on this page.
- Table columns: checkbox, photo thumb, customer/job/lot triple, title, status pill, AI status icon, row-actions (`···`).
- Click a row → lot detail modal (single-lot actions).
- Multi-select → **bulk action bar** appears at the bottom, with: Move, Change status, Run AI, Export CSV, Delete (admin). All bulk actions go through dialogs that **don't re-list the lots** — see D-002.

#### 2b. Lot detail modal — editable variants
Header: photo, title, customer/job/lot, status pill. Body: editable fields matching the cataloging surface (title, description, price, photos, special notes, etc.). Footer actions: Edit / Reprint label / Move to another auction (only for `assigned`) / Change status / Delete (admin) / Close.

#### 2c. Lot detail modal — frozen variants (see D-001)
For `picked-up` and `not-sellable` only. **Sold is editable** (D-001). Frozen modals show:
- A "🔒 Read-only" pill in the header.
- All fields rendered as static text, not inputs.
- Photo dimmed slightly for `not-sellable`.
- Footer: Reprint label and Close. Change-status is **not** disabled — it shows the (limited) legal transitions out of frozen states (e.g. picked-up has none; not-sellable can go back to unassigned per spec).

#### 2d. State menu + confirm modals
Tapping "Change status" opens a popover listing only **legal transitions per the state machine**. Items requiring confirmation are flagged. On select → confirm modal (e.g. "Mark Lot 13 as picked up?"). The same modal pattern is reused for bulk.

#### 2e. Bulk dialogs
- **Move** — destination picker (customer → job → lot number). "Reprint labels?" checkbox.
- **Change status** — only shows transitions legal for **every** selected lot (D-003). If selection is mixed with no shared target, shows an empty state with refine-selection guidance.
- **Run AI** — single confirmation; warns that existing AI fields will be overwritten on success.
- **Delete** (admin) — destructive styling; requires typing-confirm or a held-press button.
- **Export CSV** — light dialog showing the column manifest.

#### 2f. AI states in the lot modal
- **Success** — green check, fields populated.
- **Partial** — amber warning, lists which subfields succeeded vs failed; inline "Re-run AI" on the failed subfield.
- **Failure** — red, full error message, primary action is Re-run AI.

### 3. Admin shell (file `03-admin-shell.html`)

Shared chrome: **left rail nav** with Inventory · Customers · Users · Settings · Audit. Account chip pinned to bottom of the rail. Top-right of each page: search box + filter chips + primary action.

#### 3a. Customers
Two-pane: customer list (360 px) | detail panel.
- List item: avatar (initials, hashed color), name, "N jobs · N lots", recent-activity dot.
- Detail panel: customer header (avatar, name, metadata, Edit / Delete). **Jobs section below** — a table of the customer's jobs (job number, created date, lot count, status pill). Per-row "View lots →" deep-links to inventory pre-filtered. **+ New job** button. (Per spec §8.2, jobs live under Customers; per D-006, no separate Auctions page.)

#### 3b. Users
Single table. Columns: name (avatar + name), email (mono), role pill, status pill (active / inactive / pending — with a colored dot), last sign-in (mono timestamp), `···`. Filters: role, status. **Invite user** primary action.

#### 3c. Settings
Three card sections, each with labeled rows:
- **Label printer** — Helper URL (text input), **Test** button + connection status pill (Connected / Unreachable / Pending), Printer model (read-only), Label size (select).
- **AI schedule** — Enabled toggle, Frequency segmented (Hourly / Daily), Time of day (when Daily), Last run summary + "View runs" link.
- **Organization** — Org name, Timezone select, Logo upload.
Footer: Discard / Save changes.

#### 3d. Audit (admin-only reporting view)
Dense log table. Columns: When (mono timestamp), Actor (avatar + name; AI runs show ✦ icon and amber bg), Action (color-coded mono pill: `state.change`, `lot.move`, `lot.delete`, `lot.create`, `ai.run`, `user.role`, `job.create`, `customer.create`, `settings.update`), Target, Detail (from → to deltas with optional note). Filters: action, actor, date. Export CSV button. **Lot detail modal does NOT show audit data** — it lives only here. (Spec §6.10.)

---

## Interaction & behavior notes

### Selection model (inventory)
- Clicking the row checkbox or anywhere on the row body that isn't the title selects/deselects.
- Clicking the title (or anywhere outside of the checkbox cell) opens the lot detail modal — but only when nothing is selected. If selection > 0, row clicks toggle selection. (This avoids accidentally opening modals when sweep-selecting.)
- Header checkbox = "select all on this page" (not all matching the filter — that's a separate "select all 247 matching" affordance shown in the bulk action bar).

### Modal stacking
Confirm modals open over the lot detail modal, dimming it. Closing the confirm returns focus to the modal. Closing the modal returns focus to the inventory row that was opened.

### Form validation
- Lot in progress: title and special-notes are required to advance via Next. Inline errors only after first submit attempt.
- Save is debounced — assume background save every 1.5 s while editing; explicit save on Next.

### Optimistic UI
- State changes apply immediately in the UI; rollback if the server rejects (rare). No spinner blocks.
- AI runs show an inline pulsing indicator on the AI fields; does not block other interactions.

### Mobile interaction
- 44 px minimum hit target on all controls.
- Long-press to drag photos; haptic tick on reorder commit.
- Network-down / printer-down banners persist until resolved.

### Keyboard
- `/` focuses the inventory search.
- `j` / `k` move the selection cursor up/down a row (no modifier).
- `space` toggles selection on the cursor row.
- `enter` opens the modal on the cursor row when nothing is selected.
- `esc` closes any modal / popover / dialog.
- `cmd/ctrl+a` selects all on the current page.

### Accessibility
- All interactive elements need accessible names. Avatars are decorative — alt name comes from sibling text.
- Status pills use both color **and** dot/icon to encode state — never color alone.
- Frozen modals announce read-only on focus to screen readers.
- Focus rings: 2 px solid `--c-accent` with 2 px offset, on every interactive element. Don't suppress focus rings even if the kit defaults to do so for mouse users.

---

## State management (suggested shape — adapt to your stack)

```
ui:
  selectedLotIds: Set<string>           # inventory selection
  openLotId: string | null              # which lot's modal is open
  modalOverlay: 'state' | 'confirm:from:to' | 'move' | null
  filters: { customer?, job?, state[]?, ai[]?, dateRange? }
  bulkAction: 'move' | 'state' | 'ai' | 'delete' | 'export' | null

session (mobile cataloging):
  customerId / jobId / currentLotId
  lotsCompletedThisSession: number
  printQueueLength: number
  networkOnline: boolean
  printerStatus: 'connected' | 'unreachable' | 'pending'

server-cached:
  lots, customers, jobs, users, auditEntries, systemSettings
```

State transitions are driven by the spec's state machine — the design enforces it via what's offered in the UI (legal transitions only); the server is still the source of truth.

---

## Data shapes

See `shared.jsx`, `option-c-flow.jsx`, `option-c-lifecycle.jsx`, `option-c-admin.jsx` for sample data. The shapes are illustrative — your real schema may differ. Notable fields used across the design:

```
Lot {
  id, lot_number,
  customer_id, customer_name,
  job_id, job_number,
  title, description,
  price?, ref_price?,
  state: 'in_progress' | 'unassigned' | 'assigned' | 'sold' | 'picked-up' | 'not-sellable',
  ai: { title, description, ref_price } each: 'success' | 'partial' | 'failure' | 'not_run',
  ai_error?: string,
  photos: [{ url, isCover }],
  special_notes: string,
  category?: 'CLOTHING' | 'ELECTRONICS' | …,
  size?: string,         # only when category=CLOTHING
  untested: boolean,
  quantity: number,
  created_at, updated_at,
}

AuditEntry { id, ts, actor, action, target, from, to, note }
```

---

## Spec deviations (must read)

The design diverges from the spec in 6 documented places. **Honor these in the implementation**, and tell the customer if any block adoption — they were all customer-confirmed during design but engineering may surface tradeoffs we missed.

See `SPEC-DEVIATIONS.md` for full rationale. Summary:

| ID | Topic | What changed |
|---|---|---|
| D-001 | `sold` is editable | Only `picked-up` and `not-sellable` are frozen. `sold` stays fully editable so a fall-through sale can be corrected. |
| D-002 | Inventory is the single action hub | All filtering / search / selection lives on the inventory page. Bulk dialogs don't re-list the selected lots. |
| D-003 | Bulk state-change shows shared transitions only | Mixed selections with no shared legal target → bulk Change-state disabled, with explanation. |
| D-004 | Manual label print | Cataloging Next saves but does **not** print. Explicit Print Label button instead. |
| D-005 | Closed jobs grayed, not hidden | Closed jobs visible-but-disabled in the picker. |
| D-006 | No separate Auctions page | `(customer, job)` filter on Inventory replaces the spec's "Auctions" page. Job CRUD lives on Customer detail. |

---

## Things still to design (out of scope for this handoff)

The customer ended the design pass with these as known gaps. Build to spec where it covers them, leave hooks where it doesn't:

- **Label-printing recovery flow** during cataloging (printer offline mid-batch).
- **Empty / first-run states** for every list (no customers, no jobs, no lots, no users, no audit entries).
- **Toast/notification system** for save success, AI complete, label sent, errors.
- **Global search** across customers / jobs / lots from the topbar.
- **Tablet/phone fallback** for Customers / Users / Settings / Audit (mobile cataloging and mobile inventory are designed; the rest are desktop-only for v1).
- **Login / forbidden / role-gated empty states** (e.g. Warehouse hitting `/admin`).
- **Saved filter presets** management.

Implement these using the same visual system (tokens above) and the same patterns established in the designed screens. Ask the customer when behavior is ambiguous.

---

## Sequencing suggestion for implementation

1. **Foundations** — token files (colors, type, spacing), base components (Button, Input, Select, Pill, Toggle, Segmented, Modal, Toast, Avatar, Icon).
2. **Inventory + lot detail modal** (file 01 + 02) — this is the spine of the app and exercises most components.
3. **Mobile cataloging** (file 01) — reuses many of the same primitives but in 412 px frame.
4. **Admin shell** (file 03) — rail nav, Customers, Users, Settings, Audit.
5. **Spec gaps** (the list above) — tackle as the customer prioritizes.

---

## Questions to ask before starting

1. Which UI library is the codebase committed to? (Determines whether to wrap or replace the kit's Button/Input/etc.)
2. Is real-time multi-user editing in scope? (Currently the design assumes optimistic UI with eventual consistency; collisions aren't designed.)
3. Auth/role enforcement — server-side, client-side, or both?
4. Internationalization — is en-US the only locale for v1?
5. Are timestamps stored UTC and rendered in user TZ, or in `system_settings.timezone`?
6. Is there a feature flag system, or do we ship gates as code paths?

Bring answers back to the customer; don't assume.
