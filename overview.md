# Auction Inventory SaaS — Project Overview (v1.0 — design phase complete)

> Supersedes `overview.pdf`. All 7 brainstorming rounds complete plus a UI design pass (Option C · Mica Slate). Reviewed and updated 2026-04-29 to incorporate accepted deviations from the design pass.
>
> **Source of truth files:**
> - `docs/superpowers/specs/2026-04-29-v1-design.md` — the consolidated v1 design spec (engineering reference)
> - `ui-design/design_handoff/` — visual mockups (HTML + JSX) and `SPEC-DEVIATIONS.md`
> - This overview — working narrative, refined per round
>
> Six tracked deviations (D-001 to D-006) and several additional items have been accepted and folded into this overview. See spec §15 for the consolidated list.

---

## Purpose

A web application that an auction-selling business uses to receive, photograph, catalog, and manage used/pre-owned inventory; assign that inventory into specific auctions; and (in v2) prepare batch upload files for external auction platforms. The actual auctions run on third-party platforms — this system does not conduct live auctions.

---

## Versioned roadmap

| Version | Scope |
|---|---|
| **v1** | Mobile-first cataloging, pre-session admin setup (customer + job), lot-based intake with photos and structured attributes, label printing at intake, AI-assisted description / pricing / title generation (manual or scheduled), desktop inventory management (browse, filter, edit, state changes), auction assignment, audit log. |
| **v2** | Multi-platform export — admin-configurable platform mapping templates and batch upload file generation for external auction platforms. **Scheduled batch-removal of audit_log entries** to manage Supabase storage. |

The original `overview.pdf` mentioned a v3; v1+v2 absorb that scope.

---

## Core concepts

- **Customer** — the consignor or source of inventory. Has its own table; only `name` is required.
- **Job** — owned by a customer; **a (customer, job) pair represents an auction**. There is no separate Auction entity; "Auction management" UI operations are operations on jobs.
- **Lot** — the unit of cataloging. One lot = one record. A lot usually contains one physical item but may contain several (~10% of the time). A lot's `(customer, job, lot_number)` tuple **is** its auction assignment when the lot is in state `assigned`. Lots can be moved between auctions, which clears the source tuple and assigns a new tuple in the destination job.
- **Lot state** — `assigned` (initial) · `unassigned` · `sold` · `picked-up` · `not-sellable`. Full state machine in the [Lifecycle section](#lifecycle-edit-delete-audit-round-6-outcome).

---

## Primary user surfaces

### Mobile (primary intake surface)

Used during a cataloging session by intake / cataloging staff. A session is started after an admin has entered the customer and job number for the batch, so those values are pre-applied to every lot in the session.

**Per-lot intake flow:**

1. Operator opens auction-os in their phone browser, signs in, and picks the active **Customer + Job** for the session.
2. Operator taps **New lot** — system reserves the next lot number for the active (customer, job).
3. Operator taps the camera button — the device's native camera opens. Take one photo, control returns to the lot details screen with the new photo appearing as a thumbnail in the strip below the lot fields. Repeat for additional photos (min 1, max 12 — both config-driven).
4. Each thumbnail can be tapped to retake, delete, or reorder before the lot is saved.
5. Operator optionally fills editable fields — **Special Notes** selection (with a conditional free-text input if the chosen option requires it), and any of Title, Description, Quantity, Price, Ref1, Ref2 if desired. Anything left blank is backfillable later (desktop, scheduled AI run, or another mobile pass).
6. A label is printed at the time of cataloging (label content + size TBD in Round 4).
7. Operator taps **Next** to save the lot and advance to a fresh lot screen (lot number auto-increments by 1), or **New Catalog** to exit the session and return to the Customer/Job picker.

Photos upload asynchronously in the background — see [Photo capture pipeline](#photo-capture-pipeline-round-2-outcome) for the full mechanics. The operator never waits on uploads to advance.

### Desktop (admin + inventory management)

Used by admins and auction managers between or after intake sessions.

- **Pre-session setup:** create or select customer, create or select job, configure anything else required before a session can start.
- **Inventory browse:** list, filter, and search across all lots. Filters use the structured attribute schema.
- **Inventory operations:** edit lot details, change lot state, mark not-sellable.
- **Auction management:** create / manage auctions, assign multiple lots to an auction (visual multi-select), reassign or unassign as needed.
- **AI runs:** trigger description / title / pricing generation manually for outstanding lots (scheduled runs also supported — see below).

---

## Data model — v1 entities (Round 1 outcome)

Schema is **flat**. There are no category-specific columns; polymorphism is handled by the `special_notes` mechanism, which feeds the AI prompt.

### `customer`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `name` | text (free-form) | yes | Only required field. CRM data lives elsewhere. |
| `created_at`, `updated_at` | timestamptz | yes | Audit |

### `job`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `customer_id` | uuid (FK → customer) | yes | A job is owned by exactly one customer |
| `job_number` | text (free-form) | yes | Admin-entered. **Unique within (customer_id, job_number)** |
| `closed_at` | timestamptz | no | NULL = open; non-NULL = closed. Closed jobs appear **grayed (visible-but-disabled)** in the cataloging picker (D-005). Closed jobs can still be selected as filter values on Inventory. |
| `created_at`, `updated_at` | timestamptz | yes | Audit |

Admin pre-populates jobs before a cataloging session begins. Warehouse staff pick Customer, then Job, then start the session. Job CRUD lives on the Customer detail page in the admin shell — there is no separate Auctions page (D-006).

### `lot`

| # | Field | Type | Required at intake | Notes |
|---|---|---|---|---|
| — | `id` | uuid | yes (auto) | PK |
| — | `job_id` | uuid (FK → job) | conditional | Required when `state ∈ {assigned, sold, picked-up}`; **NULL when state = `unassigned` or `not-sellable`**. Customer is derivable via `job → customer`. |
| 2 | `lot_number` | integer | conditional | Required when `state ∈ {assigned, sold, picked-up}`; **NULL when state = `unassigned` or `not-sellable`**. Starts at 10 per job, +1 per new lot. Partial unique index: `UNIQUE(job_id, lot_number) WHERE job_id IS NOT NULL`. |
| 3 | `quantity` | integer | no | Backfill |
| 4 | `title` | text (≤ 50 chars) | no | Backfill / AI. Generated by AI per the [title format spec](#ai-specifications-round-7-outcome). |
| 5 | `description` | long text | no | Backfill / AI. Generated by AI per the [description format spec](#ai-specifications-round-7-outcome). |
| 6 | `price` | numeric, **nullable** | no | Reference price (best available new-condition retail). When null, title rendering substitutes `$$$`. |
| 7 | `condition` | enum | auto-set, **hidden in v1 UI** | Default value; vocab + UI exposed in a later iteration |
| 8 | `ref1` | text (single line) | no | General-purpose |
| 9 | `ref2` | text (single line) | no | General-purpose |
| 10 | `special_notes_category` | enum | yes (defaults to `None`) | Each option carries a per-option `requires_text` flag in front-end config (e.g., `Clothing` requires text; `READ` and `TOOL ONLY` do not — they're canned shortcuts that flow into Title/Description). Drives the AI prompt. |
| 10 | `special_notes_text` | text | conditional | Shown and required only when the selected option's `requires_text` flag is true. For `CLOTHING`, the input is labeled and stored as **size**. |
| — | `untested` | boolean (default `false`) | yes (auto, defaults false) | Operator-set checkbox at intake. When `true`, description rendering appends ` UNTESTED` (capitalized). |
| — | `last_ai_run_status` | enum (`success` / `partial` / `failure`), nullable | no | Set after each AI run for the lot. Drives status icon on inventory list. |
| — | `last_ai_run_error` | text, nullable | no | Short error message (failure / partial cases), shown on lot detail modal for office review. |
| — | `state` | enum | auto-set on create | Values: `assigned` · `unassigned` · `sold` · `picked-up` · `not-sellable`. Initial state on cataloging is `assigned`. Full state machine and transition rules in [Lifecycle section](#lifecycle-edit-delete-audit-round-6-outcome). |
| — | `intake_operator_id` | uuid (FK → app_user) | yes (auto) | Set from auth context |
| — | `intake_timestamp` | timestamptz | yes (auto) | Set on create |
| — | `created_at`, `updated_at` | timestamptz | yes | Audit |

**Numbering on the right column** maps to the user-supplied field list (`Customer` is captured via `job_id → customer_id`, hence #1 isn't a column on lot).

### `lot_photo`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK |
| `lot_id` | uuid (FK → lot) | yes | One lot has one or more photos |
| `storage_path` | text | yes | Supabase Storage object path; deterministic, set at capture time |
| `display_order` | integer | yes | For ordering / picking primary photo |
| `status` | enum (`pending` / `uploaded` / `failed`) | yes | Created at capture as `pending`; flipped to `uploaded` when the file lands in storage |
| `captured_at` | timestamptz | yes | Audit |
| `captured_by` | uuid (FK → app_user) | yes | Audit |

See [Photo capture pipeline](#photo-capture-pipeline-round-2-outcome) for the full upload + serving model.

### Required vs. backfillable summary

**Mobile intake required** (the gate to advance to next lot):
- ≥ 1 photo
- `special_notes_category` selection (defaults to `None`; if non-`None`, accompanying text required)
- `untested` (checkbox — default unchecked; required as a deliberate boolean)
- Customer + Job (pre-session, applied to every lot in the session)
- All system fields (auto)

**Backfillable later** (desktop, scheduled AI run, or another mobile pass):
- `quantity`, `title`, `description`, `price`, `ref1`, `ref2`

**Hidden in v1 UI:**
- `condition` (carried in schema with a default; exposable later without migration)

### `system_settings` (small reference table)

Single-row table holding admin-configurable system settings. Used in v1 for the AI scheduling config; can grow to hold other admin-tunable values (printer URL, etc.).

| Field | Type | Notes |
|---|---|---|
| `id` | int (always `1`, single-row) | Singleton-row enforcement via check constraint |
| `ai_schedule_enabled` | boolean (default `true`) | |
| `ai_schedule_frequency` | enum (`hourly` / `daily`) (default `daily`) | |
| `ai_schedule_time_of_day` | time (default `23:00`) | Used when frequency = `daily` |
| `ai_last_run_at` | timestamptz, nullable | Updated by the AI batch endpoint after each run |
| `updated_at` | timestamptz | Audit |

### Open items deferred from Round 1

- Exact `condition` enum values (vocab) — defer until UI is exposed
- `special_notes_category` enum values — finalized in Round 7 (AI specs), since the list IS part of the AI prompt design
- Lot `state` enum and valid transitions — Round 6
- Currency / decimal precision for `price` — covered in Round 7 alongside AI pricing
- Field length limits — finalized when DDL is generated

---

## Photo capture pipeline (Round 2 outcome)

### Capture mechanism

- **Native device camera**, invoked via `<input type="file" accept="image/*" capture="environment">`. No in-app viewfinder.
- **Phone setting:** lowest resolution (12 MP). Configure iPhones to **Settings → Camera → Formats → Most Compatible** so output is JPEG, not HEIC. One-time device setup; eliminates the need for client-side HEIC conversion.
- **One photo per camera invocation.** Control returns to the lot details screen with the new photo appearing as a thumbnail in the strip below the lot fields.
- Operator can tap any thumbnail to **retake, delete, or reorder** before saving the lot.

### Photo bounds

- Minimum: **1** per lot (gate to advance).
- Maximum: **12** per lot.
- Both values are config-driven and changeable later without code work.

### Upload model — async, non-blocking

- Direct **browser → Supabase Storage** via signed URLs. The Hono API never proxies image bytes.
- A `lot_photo` row is created **at capture time** with `status='pending'` and a deterministic `storage_path`. Status flips to `'uploaded'` when the file lands. Photo identity is stable from the moment of capture.
- Upload queue is **IndexedDB-backed** so pending uploads survive a tab close, browser refresh, or device sleep.
- Operator can save the lot (tap **Next**) while photos are still uploading. The lot record is committed; outstanding uploads continue in the background and link to the saved lot via `lot_photo.lot_id`.
- A small persistent indicator shows pending-upload count. If it exceeds a threshold (tunable, ~10–20 is the rough range), captures pause until the queue drains.

### Storage and serving strategy

Originals are stored once. Right-sized variants are served on demand via **Supabase Image Transformations** (URL parameters like `?width=1568&quality=80`). Supabase caches transformed outputs server-side, so repeat requests are cheap.

| Use case | Size served | ~Per-image egress |
|---|---|---|
| Inventory browse thumbnails (desktop) | ~300 px | ~30 KB |
| Lot detail / mobile preview | ~1200–1600 px | ~250 KB |
| AI vision evaluation | 1568 px | ~400 KB |
| Auction platform export (v2) | original 12 MP | ~3–4 MB |
| "View full size" on demand | original 12 MP | ~3–4 MB |

Claude vision auto-resizes to ~1568 px regardless, so larger inputs offer no quality gain but cost extra egress on both Supabase and the Vercel→Anthropic leg.

### Open items deferred from Round 2

- **Retry / backoff strategy** and **max-retry policy** for failed uploads — implementation detail, will appear in the spec.
- **Permanent-failure UX** (after retries exhausted) — implementation detail.
- **Backlog-pause threshold** — tunable, set when building.
- **Multi-item lot operator behavior** (does the operator do anything different when the lot contains multiple physical items, or just take more photos?) — Round 7, since AI determines multi-item from photo content.

---

## AI specifications (Round 7 outcome)

### What AI does in v1

For each lot, AI generates the **title**, **description**, and **reference price**, and detects multi-item lots. It runs on lots that have null fields (typically: titled / descriptioned / priced not yet set) and is always editable by Office or Warehouse afterward.

### Path 1 — Lookup (preferred when item is identifiable)

When AI can identify the lot's product (brand, model, recognizable item), it uses a tool call to look up product information and pull a description and a new-condition retail price.

**v1 lookup tool: Anthropic web search.** Built into Claude's tool-use capability — no separate vendor contract or per-call billing. Quality is good enough for v1; human review fills the remaining gap.

The integration is **architecturally pluggable**: AI uses Claude's tool-calling system. v1 ships with `web_search` as the only tool. A structured product-data API (RapidAPI / SerpAPI / eBay Browse / etc.) can be added later as a `product_lookup` tool that Claude chooses between as appropriate. No refactor required.

### Path 2 — Generation (fallback when item is not identifiable)

When the item can't be identified, AI generates a best approximation from:

- The lot's photos (served at 1568 px via Supabase Image Transformations — see Round 2)
- The operator-provided structured fields: `quantity`, `special_notes_category` (and `special_notes_text` if applicable), `untested`, `ref1`, `ref2`

### Title format spec

**Hard maximum: 50 characters.**

```
$<price>- <quantity>x <brand> <brief description>[ <special note>]
```

Where:
- `<price>`: the lot's reference price as a numeric value (e.g., `45.00`). When `lot.price IS NULL`, **substitute `$$$`** for `$<price>` (so the title starts with `$$$- ...`).
- `<quantity>`: from `lot.quantity`.
- `<brand>`: AI-extracted from photos / lookup data — not stored as a column.
- `<brief description>`: AI-generated short item description — not stored as a column.
- `<special note>`: appended **only** for `TOOL ONLY` and `READ`. **Not** appended for `CLOTHING` (CLOTHING is appended to the description instead) or `None`.
- **Truncation:** if the assembled title exceeds 50 chars, the brief description is truncated to fit the special-note suffix.

### Description format spec

AI generates the description body. Conditional suffixes:

- If `special_notes_category = CLOTHING` → append `" CLOTHING - <special_notes_text>"` (the `special_notes_text` is the operator-entered size).
- If `untested = true` → append `" UNTESTED"` (capitalized).

Both suffixes can apply to the same lot.

### `special_notes_category` v1 list

| Option | Surfaces text input? (and label) | Appends where? |
|---|---|---|
| `None` (default) | no | nowhere |
| `TOOL ONLY` | no | end of title |
| `READ` | no | end of title |
| `CLOTHING` | yes (label and stored as `size`, in `special_notes_text`) | end of description as `CLOTHING - <size>` |

The list is config-driven (small reference table). Adding a new option that fits the existing append patterns requires no code changes; an option needing custom append logic does.

### Multi-item lot detection

AI inspects the lot's photos. If multiple distinct items are visible (~10% case), the brief description and description reflect that (e.g., "Lot of 3 vintage tools — claw hammer, mallet, screwdriver set"). No new schema or UI surface — this is a prompt instruction. AI does **not** override the operator's `quantity` value.

### Triggers

**Manual:**
- `Run AI` button on the lot detail modal (single-lot)
- `Run AI on selected` in the inventory bulk-action bar (multi-lot)

**Scheduled:**
- Driven by `system_settings` (admin-configurable):
  - `ai_schedule_enabled` — on/off
  - `ai_schedule_frequency` — `hourly` or `daily`
  - `ai_schedule_time_of_day` — when frequency = `daily`
- **Implementation pattern:** Vercel Cron runs every hour, hits a Hono endpoint that reads `system_settings`, decides whether to run, and processes lots needing AI.
- Default config: enabled, daily, 23:00.

### Per-run logic

For each lot the AI flow processes:

1. Fetch photos at 1568 px from Supabase Storage via Image Transformations.
2. Build the prompt with photos + operator-entered fields (`quantity`, `special_notes_category`, `special_notes_text`, `untested`, `ref1`, `ref2`) + the title/description format rules.
3. Call Claude (with web_search tool available).
4. Parse the structured response: `title`, `description`, `price`, `brand`, `brief_description`, `multi_item_detected`.
5. Render the final title using the format spec; render the final description with appended suffixes (CLOTHING, UNTESTED).
6. Update lot fields. Audit log captures the change.
7. Set `last_ai_run_status` = `success` / `partial` / `failure`. Populate `last_ai_run_error` on partial / failure with a short message.

### Failure / partial-result UX

- **Inventory list rows** show a small status icon when `last_ai_run_status` is `failure` or `partial`.
- **Inventory filter** includes "AI run status" — multi-select with `success` / `partial` / `failure` / `not yet run`.
- **Lot detail modal** displays `last_ai_run_error` near the AI-generated fields when the status is `failure` or `partial`.
- **No automatic retry queue in v1** — Office can manually re-run via the bulk-action bar. (`Run AI on selected` re-runs regardless of prior status.)

**Status semantics:**
- `success` — all three target fields (`title`, `description`, `price`) were generated.
- `partial` — at least one target field was generated and at least one was missing/failed. UI derives per-field state from which fields are null.
- `failure` — none of the target fields were generated.
- `null` — the lot has not yet been processed by AI.

### Cost guardrails

For v1: **no hard cap on AI spend.** Image inputs are served at 1568 px (already established in Round 2) which keeps per-call cost low. Per-lot cost is roughly $0.01–$0.05 with web search active; 1,000 lots ≈ $50–$100/month. Monitoring is via Anthropic's billing dashboard. **v2 can add a configurable monthly budget** if usage scales; the addition is purely additive (no schema or architecture change).

### Open items deferred from Round 7

- Exact prompt text — implementation detail.
- Anthropic model selection (e.g., `claude-opus-4-7` vs `claude-sonnet-4-6`) — implementation; pick at build time, can swap later.
- Currency / decimal precision for `price` — `numeric(10, 2)` USD assumed; revise if needed.
- Field length limits — pinned when DDL is generated.
- v2 configurable monthly budget guard — deferred.

---

## Label printing (Round 4 outcome)

### Hardware and integration

- **Printer:** Zebra ZD450 (already owned by the business — no purchase needed).
- **Integration:** **Zebra Browser Print** — free helper service from Zebra running on the workstation. The web app sends ZPL over `localhost`; the helper relays to the printer over USB. No vendor lock-in beyond the helper; ZPL is stable and well-documented.

### Label format

- **Size:** 4" wide × 2" tall (landscape).
- **Print trigger:** **manual (D-004)** — the mobile cataloging UI has an explicit **Print Label** button. Tapping **Next** saves the lot but does **not** invoke the printer. Reasoning: printer issues should never block save. Reprint Label is also available on the lot detail modal in all states for desktop reprinting.

### Label content

```
+--------------------------------------------+
|   [QR code]   Lot 13                       |
|               Customer: Smith Estate       |
|   ~90×90 px   Job: 2026-04-Smith-001       |
|               2026-04-29  •  Op: AM        |
+--------------------------------------------+
```

Fields, in order of visual prominence:

1. **QR code** — left side, ~90 × 90 px at 203 dpi (≈ 0.45") so it scans from arm's length.
2. **Lot number** — large, human-readable (top of right column).
3. **Customer name** — second line.
4. **Job number** — third line.
5. **Date cataloged · Operator initials** — small, bottom line.

Intentionally **not** on the label: title, description, price, category, special notes. Those live in the system; the QR provides the lookup.

### QR encoding

The QR encodes a **URL** of the form `https://<auction-os-domain>/lot/<lot_id>`. Any phone's built-in camera or QR app opens it directly — no special scanner app required. Auth gates the lot view, so the URL itself is safe if the label is photographed.

The exact production domain is set at deployment time.

### Open items deferred from Round 4

- **Reprint flow** — UI for an operator or admin to reprint a damaged / missed label after the lot is saved. Likely a button on the lot detail screen.
- **Print failure UX** — what the operator sees if the helper service is unreachable, the printer is offline, or out of label stock. Implementation detail; the spec will define a minimum (lot still saves; user alerted; retry / reprint surfaces).
- **Exact ZPL template** — generated at implementation time once layout is set.
- **Business logo / branding on the label** — not requested for v1; can be added later without schema change.

---

## Inventory browse and search (Round 5 outcome)

### Architecture

Single **Inventory** page covers all browse use cases — and is the **single action hub** (D-002). All filtering, search, and selection live here. Per-lot actions reached by clicking a row (lot detail modal). Bulk actions reached via row selection + bulk-action bar; bulk dialogs do **not** re-list the selected lots.

There is **no separate Auctions page** (D-006). "View this auction" = filter Inventory by Customer + Job. Job CRUD lives on the Customer detail page in the admin shell.

### Desktop layout

- **Top bar:** free-text search · saved-filter-preset dropdown · "Save current as preset"
- **Left sidebar — faceted filters:**
  - Customer
  - Job (cascades when a customer is selected)
  - Lot state (`assigned` · `unassigned` · `sold` · `picked-up` · `not-sellable`)
  - Auction (specific auction or "unassigned")
  - Date cataloged (range)
  - Special Notes category
  - Boolean filters: `Has title` · `Has description` · `Has price`
  - AI run status (multi-select: `success` · `partial` · `failure` · `not yet run`) — added in Round 7, supersedes the earlier "AI-generated content yet" placeholder
- **Main pane:** results list, **compact rows by default**, with a toggle to switch to **cards-with-thumbnails**
  - Compact-row content: thumbnail of first photo · `Customer · Job · Lot` · title · state badge
- **Toolbar above results:** sort dropdown · results count · multi-select toggle / row checkboxes
- **Bulk-action bar (when selection is non-empty):** Move (to another auction) · Change state (only target states legal for every selected lot — D-003) · Run AI on selected · Export selected to CSV (basic; template-driven export is v2) · Delete (admin only). Bulk dialogs do **not** re-list selected lots (D-002).

### Sort

- **Default:** date cataloged, newest first.
- **Available options (toolbar dropdown):**
  - Date cataloged — newest / oldest
  - Customer (A→Z / Z→A)
  - Lot number — ASC / DESC (most useful when filtered to one Customer + Job)
  - State

### Pagination

**Virtualized infinite scroll.** List loads more as the user scrolls; selection persists across loaded results; smooth for bulk workflows.

### Selection interaction

- Each row has a checkbox; toggling adds the row to the selection.
- Clicking the row body (anywhere outside the checkbox) opens the **lot detail modal**.

### Lot detail modal

- Opens on row click or "View" action.
- Displays all lot attributes (full data — photos, fields, history).
- When multiple lots are in the current selection, modal shows **forward / back arrows** to navigate through them.
- Within the modal, the active photo displays large, with a **thumbnail strip below** and forward / back arrows on the image to step through the lot's photos.

### Mobile browse (Warehouse-focused)

Tight, single-lot-focused. No bulk actions on mobile.

- **Sticky top bar:** search input · filter button (opens slide-out drawer)
- **Slide-out filter drawer:** same filter set as desktop, mobile-friendly
- **Results:** single-column compact rows — thumbnail · `Customer · Job · Lot` · title · state badge
- **Tap a row:** opens the same lot detail modal as desktop, full-screen

### Open items deferred from Round 5

- Saved-filter-preset persistence model (per-user vs. shared; how presets are managed) — implementation detail.
- Bulk-export CSV column set — implementation detail; v2 will replace this with template-driven export.

---

## Lifecycle, edit, delete, audit (Round 6 outcome)

### Conceptual model

**Auction = Job.** A `(customer, job)` pair represents an auction; lots within an auction have lot numbers within that pair. There is no separate Auction entity.

**Lots are born `assigned`.** When a lot is created in a cataloging session, its `(customer, job, lot_number)` tuple is set automatically from the active session. That tuple **is** the auction assignment.

**Reassignment is a tuple change.** Moving a lot from auction A to auction B clears the source tuple (cleared values pass through `unassigned`) and writes a new tuple in the destination job (`lot_number` = next available in that job). The freed slot in the source job is **not** reused; gaps are acceptable. Audit log captures the prior values.

### State machine

| State | Meaning | (cust, job, lot) | Editable fields? |
|---|---|---|---|
| `assigned` | In an auction; default for newly cataloged lots | NOT NULL | yes |
| `unassigned` | Not currently in an auction; available for re-assignment | NULL | yes |
| `sold` | Sold at the auction it was in; awaiting pickup | NOT NULL | **yes (editable, per D-001)** — sale can fall through |
| `picked-up` | Sold and collected; **terminal** | NOT NULL | **frozen — no edits** |
| `not-sellable` | Determined unsellable; **terminal** | NULL | **frozen — no edits** |

`in_progress` is a UI-only transient state during mobile cataloging, before a lot is first saved. Not persisted as a DB state.

### Transitions

| From → To | Trigger | Roles | Side effect on `(customer, job, lot_number)` |
|---|---|---|---|
| (creation: first photo) → `assigned` | Auto on lot creation | Warehouse, Office, Admin | Set from active session |
| `assigned` → `sold` | Manual: marked sold after auction | Office, Admin | No change |
| `assigned` → `unassigned` | Manual: removed from auction | Office, Admin | **Cleared** |
| `assigned` → `not-sellable` | Manual: marked not-sellable | Office, Admin | **Cleared** |
| `unassigned` → `assigned` | Manual: assigned to a different auction | Office, Admin | New tuple set; lot# = next available in destination job |
| `unassigned` → `not-sellable` | Manual: marked not-sellable | Office, Admin | (already cleared) |
| `sold` → `picked-up` | Manual: buyer collects | Office, Admin | No change |
| **`sold` → `unassigned`** | Manual: sale falls through (buyer never pays / picks up); lot returns to inventory | Office, Admin | **Cleared** |
| `picked-up` | **Terminal** — no exit transitions | — | — |
| `not-sellable` | **Terminal** — no exit transitions | — | — |

### Confirmation prompts

Transitioning into a terminal state (`picked-up` or `not-sellable`) prompts the user with a confirmation modal before committing. Once committed, truly terminal.

Hard-delete operations also surface a confirmation modal (admin-only — see below).

### "Move to another auction" composite action

A common operation. The UI surfaces it as a single **"Move to another auction"** action that internally executes `assigned → unassigned → assigned (with new tuple)`.

### Editing rules

| State | Edit allowed? |
|---|---|
| `assigned` | Yes — any editable field |
| `unassigned` | Yes — any editable field |
| `sold` | **Yes — any editable field (per D-001)** — sale can fall through, fields must remain correctable for relisting |
| `picked-up` | **No — read-only** |
| `not-sellable` | **No — read-only** |

Frozen states still permit:
- **Legal state transitions** (e.g., `sold → picked-up`)
- **Reprint label** (it's a re-issue, not an edit)

In the UI, the lot detail modal hides edit affordances when the lot is in a frozen state.

### Default browse filtering

The default Inventory view hides `picked-up` and `not-sellable` lots. Both remain queryable by selecting the State filter explicitly.

### Stable identifier (no new field)

When a lot is `unassigned` or `not-sellable`, its `(customer, job, lot_number)` is null. The system identifies such lots by `lot.id` (the existing UUID PK) — never displayed to users, never on a label, but always queryable internally. No new column is added.

For inventory list rows of unassigned lots, the primary identifier slot displays the lot's title (or `—` if title is null). Thumbnail and state badge are always present.

### Delete semantics

- **Hard delete**, no soft-delete.
- **Admin-only** (per Round 3 RBAC matrix).
- **Confirmation modal** before commit.
- **Audit log captures** the deletion event.
- Rare in practice — lifecycle states (`not-sellable`, `picked-up`) cover day-to-day "remove from inventory" needs. Hard delete is reserved for genuine mistakes (e.g., wrong lot accidentally created).

### Audit trail

A single `audit_log` table populated by **Postgres triggers** on tracked tables. No app-level audit calls; the database captures everything automatically.

**Tracked tables:** `lot`, `customer`, `job`, `app_user`. (`lot_photo` is excluded — `captured_by` on the photo row is enough.)

**Captured per change:** full before/after diff (insert / update / delete).

**Schema sketch:**

```
audit_log
- id              uuid PK
- table_name      text
- record_id       uuid
- change_type     enum (insert / update / delete)
- changed_fields  jsonb     -- { field: { old, new }, ... }
- changed_by      uuid FK → app_user
- changed_at      timestamptz
```

**Visibility:** **admin-only**, surfaced via a dedicated reporting view inside the admin UI. The lot detail modal does **not** show a history tab; non-admin roles never see audit data.

**Retention:**
- v1: indefinite.
- v2: scheduled batch-removal of old `audit_log` entries to manage Supabase storage. Retention policy details to be defined when v2 begins.

### Open items deferred from Round 6

- Exact `audit_log` table DDL and trigger code — generated with schema migrations.
- Admin reporting view UI and filtering — implementation detail.
- v2 audit-log retention policy — deferred to v2.

---

## Roles, access, and permissions (Round 3 outcome)

### Roles

Three roles. Single-tenant, role-only RBAC (no tenant dimension):

- **Admin** — full system access; manages users, customers, jobs, system config
- **Office** — desk-based work; manages auctions, inventory, lot lifecycle, runs AI
- **Warehouse** — primary mobile cataloger; can also view and edit all lots from any surface

### `app_user` table

Mirror of `auth.users` carrying app-level user data. RLS policies and FKs reference this table.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | PK; FK to `auth.users.id` |
| `role` | enum (`admin` / `office` / `warehouse`) | yes | Synced to JWT via Custom Access Token Hook |
| `display_name` | text | yes | Free-form |
| `disabled_at` | timestamptz | no | Soft-deactivation marker; non-null = deactivated |
| `created_at`, `updated_at` | timestamptz | yes | Audit |

Role is synced into the JWT (`app_metadata.role`) at token issuance via a Postgres function configured as Supabase's **Custom Access Token Hook**. RLS reads the role from `auth.jwt() -> 'app_metadata' -> 'role'` — no JOIN per query.

`lot.intake_operator_id`, `lot_photo.captured_by`, and any future audit fields FK to `app_user.id`.

### Permission matrix

| Capability | Admin | Office | Warehouse |
|---|---|---|---|
| **Customer & Job** | | | |
| View customers / jobs | ✓ | ✓ | ✓ (limited — pick from list to start session) |
| Create / edit customer | ✓ | ✓ | ✗ |
| Create / edit job | ✓ | ✓ | ✗ |
| Delete customer / job | ✓ | ✗ | ✗ |
| **Cataloging session** | | | |
| Start a session | ✓ | ✓ | ✓ |
| Capture lot (photos + fields) | ✓ | ✓ | ✓ |
| Save lot (Next) | ✓ | ✓ | ✓ |
| **Lot — view & edit** | | | |
| View all lots | ✓ | ✓ | ✓ |
| Edit lot fields post-save | ✓ | ✓ | ✓ |
| Edit / add lot photos post-save | ✓ | ✓ | ✓ |
| Delete lot | ✓ | ✗ | ✗ |
| **Lot state changes** | | | |
| Mark sold / picked-up / not-sellable | ✓ | ✓ | ✗ |
| **Auction management** | | | |
| View auctions | ✓ | ✓ | ✗ |
| Create / edit / delete auction | ✓ | ✓ | ✗ |
| Assign lots to auction | ✓ | ✓ | ✗ |
| **AI** | | | |
| Trigger AI run manually | ✓ | ✓ | ✗ |
| Configure AI prompts / schedules | ✓ | ✗ | ✗ |
| **System / users** | | | |
| Manage users + role assignments | ✓ | ✗ | ✗ |
| System config (printer settings, etc.) | ✓ | ✗ | ✗ |

Activity attribution (who changed what) flows through the audit trail — scoped in Round 6 but **confirmed as v1**.

### Surface mapping

| Role | Mobile | Desktop |
|---|---|---|
| Warehouse | **Primary** (cataloging) | Allowed via responsive layout |
| Office | Allowed | **Primary** (admin / inventory / auctions) |
| Admin | Allowed | **Primary** |

App UI is responsive; "primary" indicates expected workflow shape, not access restriction.

### Role assignment

- Initial admin user provisioned via seed script or one-time Supabase dashboard action.
- Ongoing user / role management lives in an **admin-only UI inside the app** (list users, change role, deactivate).
- Supabase dashboard remains available as fallback but isn't the routine path.

### RLS strategy summary

All public-schema tables have RLS enabled. Policies read `role` from `auth.jwt() -> 'app_metadata' -> 'role'`.

- `customer`, `job`: SELECT open to all authenticated; mutations gated to `role IN ('admin', 'office')`; DELETE admin-only
- `lot`, `lot_photo`: SELECT and INSERT open to all authenticated roles; UPDATE open when lot.state ∈ {`assigned`, `unassigned`}; UPDATE blocked when lot.state ∈ {`sold`, `picked-up`, `not-sellable`} except for legal state transitions (which are restricted to `('admin', 'office')`); DELETE admin-only.
- `auction` and related: SELECT open to authenticated; mutations gated to `('admin', 'office')`
- `app_user`: SELECT and UPDATE admin-only

### Open items deferred from Round 3

- Exact RLS policy DDL — generated alongside schema migrations
- Initial-admin provisioning script — implementation level
- Audit trail scope, retention, and table shape — **Round 6**
- Whether Warehouse needs a tailored mobile UI for browsing / editing other users' lots, or whether the responsive desktop browse is enough on a phone — **Round 5**

---

## Tech stack (proposed)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + TailwindCSS + shadcn/ui | Mobile-friendly responsive layout for intake; desktop layout for management screens. |
| API | Hono on Vercel | Server-side endpoints, AI orchestration, scheduled jobs. |
| Database | Supabase Postgres | Single instance. |
| ORM | Drizzle | Schema migrations checked into the repo. |
| Auth | Supabase Auth + custom JWT claims | Role claims drive RLS policies. |
| Authorization | Supabase RLS policies | Enforced in the database, not just the API. |
| Photo storage | Supabase Storage, signed URLs | Browser-direct upload from mobile camera flow. |
| Scheduled jobs | Vercel Cron (or Supabase scheduled functions) | Runs periodic AI batch jobs. |
| AI | Anthropic Claude API with vision | Description, title, pricing generation. |
| Label printing | Thermal printer + Zebra Browser Print or PrintNode | TBD in label spec round. |
| Deployment | Vercel (frontend + API) + Supabase (managed) | — |

The original overview's tech stack is treated as a guideline. Open to substitutions during specification rounds (e.g., if a different framework better fits the mobile intake UX).

---

## Out of scope for v1

- Batch upload file preparation for external auction platforms (deferred to v2).
- Multi-platform export templates (deferred to v2).
- Buyer-facing or public-facing UI.
- Multi-tenancy (never planned).
- Sale tracking fields on lot (sold price, buyer reference, picked-up date, not-sellable reason) — design exposes them visually but not in v1 schema; revisit if needed.
- **Native mobile app** — out of scope for v1; **may be added in a future version**. v1 is browser-only via the device camera API.
- **Direct API integration with auction platforms** — out of scope for v1; **may be added in a future version**. v2 covers file-based batch upload, which may suffice indefinitely.

---

## Open items (all carry-forwards from completed rounds — implementation-level unless noted)

- **Round 1:** `condition` enum vocab (UI exposed post-v1), currency / decimal precision (`numeric(10, 2)` USD assumed), field length limits.
- **Round 2:** upload retry/backoff + permanent-failure UX, backlog-pause threshold, prompt-design coupling for multi-item.
- **Round 3:** exact RLS policy DDL (generated with schema), initial-admin provisioning script.
- **Round 4:** reprint flow UI, print failure UX, exact ZPL template.
- **Round 5:** saved-filter-preset persistence model, bulk-export CSV column set.
- **Round 6:** exact `audit_log` DDL + trigger code, admin reporting view UI, v2 audit-log retention policy.
- **Round 7:** exact prompt text, Anthropic model selection, v2 configurable monthly AI-spend budget.

---

## Detailed-spec round order

| # | Round | Status |
|---|---|---|
| 1 | Item / lot attribute schema | **Complete** (2026-04-29) |
| 2 | Photo capture UX (mobile flow, count, angles, handoff) | **Complete** (2026-04-29) |
| 3 | RBAC — roles and permission matrix | **Complete** (2026-04-29) |
| 4 | Label specifications | **Complete** (2026-04-29) |
| 5 | Inventory browse / search / filter / bulk actions | **Complete** (2026-04-29) |
| 6 | Item / lot lifecycle, edit, delete, audit | **Complete** (2026-04-29) |
| 7 | AI specifications | **Complete** (2026-04-29) |

Each round produces an addition or refinement to this overview and a section in the eventual v1 design spec.
