# Phase 5 — Auction Platform Export

> **Status:** ⬜ DRAFT — pending review (revised 2026-05-04 after planning round resolved batched architecture, reconnaissance findings, and resilience strategy)
>
> **Date:** 2026-05-04 (planning round)
> **Branch:** `phase-5-auction-platform-export` off `phase-4-settings-users`
> **Slot:** Between Phase 4 sign-off and Phase 6 (AI subsystem)
> **Trigger:** Phase 4 closed the admin/config surface. Phase 5 ships the first end-to-end export pipeline so a Job's lots can be moved to the live auction platform (AF360 → HiBid). The current placeholder 15-column hardcoded export has no real-world consumer and is replaced entirely.
>
> **Source spec:** [`docs/auction-platform/AF360_HiBid_Lot_Import_Spec.md`](../../auction-platform/AF360_HiBid_Lot_Import_Spec.md) — authoritative for AF360 CSV format, image naming, and known constraints.

## 1. Goal

Ship a working Customer → Job → "Export to AF360" flow that produces:
- A 7-column **CSV** mapped exactly to AF360's import wizard fields
- A sequence of **batched image zips** (renamed per AF360's `{LotNumber}.jpg` / `{LotNumber}-{Order}.jpg` convention) — each batch covers up to 100 lots so a single Vercel Function invocation always completes well under the 300s timeout

The CSV downloads instantly when the user clicks Export. Each image batch is built server-side, uploaded to **Vercel Blob** temp storage, and delivered to the user as a native browser download via a signed URL. The user receives 1 CSV + N image zips, drops them into AF360's Lot Import + Lot Images wizards.

v1 ships one platform (AF360 / HiBid). The structure supports a second platform later but multi-platform UI work is v2.

Plus three supporting changes: Customer `seller_code` (required for export), Customer disable/re-enable (gap surfaced during planning), Job-level `start_bid` + `shippable` defaults (required CSV columns the system doesn't yet model). The disable/re-enable + the new fields all require **new edit forms for both Customer and Job** — neither entity has an editable surface in the system today (verified via codebase reconnaissance 2026-05-04).

Non-goals:
- Direct API integration with AF360 (no public API exists; CSV is the only path)
- Multi-platform configuration UI (v2)
- Tracking export history (stateless — every export is fresh)
- Lot state changes after export (no `exported_at` flag, no transition)
- Estimate / Reserve fields in the CSV (customer doesn't use them; can be added later if needed)
- Single-zip output (rejected during planning — batched output eliminates 300s timeout cliff at the upper bound)

## 2. Why now

1. **Phase 4 just landed Settings + Customer ergonomics.** Phase 5 layers Auction Platforms onto the same Settings surface and reuses the Phase 4 Users disable/re-enable pattern for Customers.
2. **The current placeholder 15-column export blocks any realistic test of an auction.** Until Phase 5, nothing the customer ships from this system is actually usable in their AF360 workflow.
3. **Schema additions are concentrated on Customer + Job.** Adding `seller_code` and `disabled_at` to Customer plus `start_bid` and `shippable` to Job in one migration costs a fraction of doing them piecemeal across multiple phases.
4. **Pre-Phase-6 (AI) anchor.** Phase 6 will write `Title` (≤50 chars) and `Description` (no newlines, plain text) directly into the lot. Locking the AF360 column requirements in Phase 5 means Phase 6's prompt can be tuned to those constraints without retrofitting.

## 3. Scope

Seven areas. Each is locked from the planning round.

### 3.1 Area 1 — Schema migration

**Migration `0011_phase_5_auction_platform_export.sql`** — additive only, no destructive changes.

```sql
-- Customer: seller code (per-Customer, used as AF360 SellerCode at export).
-- Nullable at DB layer — existing customers carry NULL until admin updates
-- them via the Customer edit UI. Required-ness is enforced at the
-- application layer (Zod on form input + export endpoint pre-flight).
ALTER TABLE customer
  ADD COLUMN seller_code text;

-- Customer: soft-deactivation (mirrors app_user.disabled_at from Phase 4)
ALTER TABLE customer
  ADD COLUMN disabled_at timestamptz;

-- Job: AF360 StartBid default — required, currency, default $5.00
ALTER TABLE job
  ADD COLUMN start_bid numeric(10,2) NOT NULL DEFAULT 5.00;

-- Job: AF360 Shippable default — required boolean, default false (No)
ALTER TABLE job
  ADD COLUMN shippable boolean NOT NULL DEFAULT false;
```

Existing rows: the DEFAULT clauses cover existing jobs (start_bid=$5.00, shippable=false). Existing customers carry `seller_code = NULL`; the Customer list UI surfaces these visibly so admin knows which still need real values.

**Drizzle schema update** in `db/schema.ts`:
- `customer.sellerCode: text('seller_code')` (nullable)
- `customer.disabledAt: timestamp('disabled_at', { withTimezone: true })`
- `job.startBid: numeric('start_bid', { precision: 10, scale: 2 }).notNull().default('5.00')`
- `job.shippable: boolean('shippable').notNull().default(false)`

**DTO consolidation:** `JobDTO` is currently inlined in [src/hooks/useJobs.ts:4-11](../../../src/hooks/useJobs.ts#L4-L11), inconsistent with `CustomerDTO` which lives in [shared/types.ts](../../../shared/types.ts). Phase 5 moves `JobDTO` to `shared/types.ts` while it's already touching the type to add `startBid` + `shippable`. Small refactor that aligns the two before downstream code further depends on the inline type.

### 3.2 Area 2 — Customer schema integration (edit form + seller_code + disable/re-enable)

**Pre-Phase-5 reality (verified):**
- [src/routes/CustomerDetail.tsx](../../../src/routes/CustomerDetail.tsx) renders the customer name as a heading + a Jobs section. **No edit affordance for any customer field exists.**
- The Customer create dialog is a 15-LOC inline `<Dialog>` in [src/routes/Customers.tsx:51-66](../../../src/routes/Customers.tsx#L51-L66) with a single name input.
- [src/hooks/useCustomers.ts](../../../src/hooks/useCustomers.ts) has only `useCustomers` and `useCreateCustomer` — **no update or disable hooks**, despite the server API supporting both since Phase 1.

Phase 5 builds the missing pieces.

**New mutation hooks** in `src/hooks/useCustomers.ts`:
- `useUpdateCustomer()` — `PATCH /api/customers/:id` with `{ name?, sellerCode? }`. Invalidation: `['customers']`, `['customer', id]`. Success/error toast per testing-policy.
- `useToggleCustomerDisabled()` — `PATCH /api/customers/:id` with `{ disabled: boolean }`. Same invalidation. Same test pattern.

**Customer create dialog** ([src/routes/Customers.tsx](../../../src/routes/Customers.tsx)) — add required `sellerCode` input alongside `name`. Both required at create.

**New: Customer edit dialog** — opened via "Edit" button on `CustomerDetail.tsx`. Fields:
- `name` (required, 1-200 chars)
- `sellerCode` (1-50 chars when present; allowed empty for existing customers carrying null)
- Disable / Re-enable button inside the dialog (or as a sibling action; UX detail) with confirm: "Disable customer X? They will be hidden from cataloging and new job creation."

**Customer list** ([src/routes/Customers.tsx](../../../src/routes/Customers.tsx)) — add two columns:
- SellerCode — value or `(not set)` muted text for null
- Status — `Active` / `Disabled` pill; disabled rows visually de-emphasized

**Cataloging picker** ([src/components/catalog/CustomerJobPicker.tsx](../../../src/components/catalog/CustomerJobPicker.tsx)) — filter out disabled customers entirely.

**Server changes** in [api/customers/[id].ts](../../../api/customers/[id].ts):
- PATCH schema accepts `name?` (existing), `sellerCode?` (1-50 chars when present), `disabled?: boolean`
- When `disabled === true`: set `disabled_at = now()`. When `false`: set `disabled_at = null`.
- Admin + Office allowed (matches existing PATCH gate)
- No "last customer protection" — zero-customer state is fine

In [api/customers/index.ts](../../../api/customers/index.ts) POST: accept `sellerCode` as a required field (1-50 chars, non-empty).

**Validation copy:**
- New customer with empty seller_code: "Seller Code is required. Get this value from AF360 → Customers → Customer List → Customer Code."
- Existing customer edit with empty seller_code: allowed (we don't force admin to fix it just to save other edits) — but export endpoint blocks until updated.

### 3.3 Area 3 — Job schema integration (edit form + start_bid + shippable)

**Pre-Phase-5 reality (verified):**
- The Job create dialog is an inline `<Dialog>` in [src/routes/CustomerDetail.tsx:49-64](../../../src/routes/CustomerDetail.tsx#L49-L64) with only a `jobNumber` input.
- **No job edit form exists.** Each row has only an Open/Close toggle button, no other edit affordance.
- [src/hooks/useJobs.ts](../../../src/hooks/useJobs.ts) has `useJobs`, `useCreateJob`, `useToggleJobClosed`. **No general `useUpdateJob`.**

Phase 5 builds the missing pieces.

**New mutation hook** in `src/hooks/useJobs.ts`:
- `useUpdateJob(customerId)` — `PATCH /api/jobs/:id` with `{ jobNumber?, startBid?, shippable? }`. Invalidation: `['jobs', customerId]`. Test per testing-policy.

**Job create dialog** — add two new fields:
- **Start Bid** — currency input, required, defaults to `$5.00`. Storage decimal(10,2).
- **Shippable** — boolean toggle (`Yes` / `No`), required, defaults to `false`.

**New: Job edit dialog** — opened via Edit button per row in CustomerDetail's Jobs table. Fields: `jobNumber`, `startBid`, `shippable`.

**Job list table** — add two columns: Start Bid (formatted `$5.00`), Shippable (`Yes` / `No`).

**Validation:**
- start_bid: positive decimal, ≥ $0.01, ≤ $999,999.99
- shippable: boolean

**Why Job-level:** the customer's workflow uses one StartBid value per auction (uniform $5 floor today; configurable per-Job for any future variation). Same for Shippable (whole-auction shipping policy). Per-lot override is unlikely; manual CSV edit is the escape hatch if it happens.

### 3.4 Area 4 — AF360 export module

**New file `src/lib/exporters/af360.ts`** — pure functions, no IO. Imported by both server endpoints (Area 5) and the Settings panel (Area 7).

```ts
// Shape of the platform mapping — mirrors what a future
// auction_platform DB row would store. Single source of truth.
export const AF360_HIBID = {
  id: 'af360-hibid',
  name: 'AF360 / HiBid',
  description: 'Auction Flex 360 → HiBid.com',
  csvHeaders: [
    'LotNumber', 'Title', 'Description',
    'Quantity', 'SellerCode', 'StartBid', 'Shippable',
  ] as const,
  // Per-column transformation from internal context (lot, job, customer)
  formatters: {
    LotNumber: (ctx) => String(ctx.lot.lotNumber),
    Title: (ctx) => truncate(ctx.lot.title ?? '', 50),
    Description: (ctx) => stripNewlines(ctx.lot.description ?? ''),
    Quantity: (ctx) => String(ctx.lot.quantity ?? 1),
    SellerCode: (ctx) => ctx.customer.sellerCode ?? '',
    StartBid: (ctx) => formatCurrency(ctx.job.startBid),     // "5.00"
    Shippable: (ctx) => ctx.job.shippable ? 'true' : 'false',
  },
};

export function buildAF360Csv(rows: ExportContext[]): string { ... }
```

**Pure utility functions:**
- `truncate(s, n)` — slices to N chars (silent; matches AF360 behavior). Phase 6 will enforce 50-char ceiling at AI generation time so this should rarely fire in practice.
- `stripNewlines(s)` — replaces `\r\n` and `\n` with single space, collapses multiple spaces.
- `formatCurrency(numeric)` — outputs `5.00` style (no `$`, no thousands separators — AF360 expects raw decimal).
- `formatBoolean(b)` — outputs `true` / `false` literal strings.
- `csvEscape(s)` — RFC 4180; wrap in `"..."` if contains `,` `"` or whitespace; double internal `"`.
- `slugify(s)` — lowercase, alphanumeric + dashes, max 50 chars (used in zip filenames).

**No header-row option, no separator option for v1.** All AF360-specific. When v2 adds a second platform, those become per-platform settings.

### 3.5 Area 5 — Server export endpoints (batched architecture)

**Two endpoints + one cron.**

#### `POST /api/jobs/:id/export-af360/start`

Lightweight — returns CSV inline + the batch plan.

**Auth:** admin or office (warehouse cannot export — exporting commits inventory to a public auction; matches the role boundary established in Phase 3).

**Behavior:**
1. Resolve job + its customer
2. Reject `400 SELLER_CODE_REQUIRED` if customer.seller_code is `null` or empty string
3. Reject `400 NO_LOTS` if job has zero `assigned`-state lots
4. Query lots: `state = 'assigned' AND job_id = :id`, ordered by `lotNumber ASC`
5. Build CSV via `buildAF360Csv(...)` from Area 4
6. Compute batch plan: chunks of **100 lots each** (`BATCH_SIZE = 100`)
7. Return JSON:
   ```json
   {
     "csv": "LotNumber,Title,...\n1,Vintage Oak Table,...",
     "csvFilename": "JobExport-AcmeAuctions-Job001-2026-05-04.csv",
     "batchSize": 100,
     "totalBatches": 10,
     "totalLots": 1000,
     "batches": [
       { "batchNum": 1, "lotIds": ["uuid-1", "uuid-2", ...] },
       { "batchNum": 2, "lotIds": [...] },
       ...
     ],
     "exportLabel": "JobExport-AcmeAuctions-Job001-2026-05-04"
   }
   ```

CSV is small enough (~hundreds of KB at the upper bound) to ship inline in the response. Client converts to Blob and triggers download immediately.

#### `POST /api/jobs/:id/export-af360/batch`

Heavy — fetches photos, builds zip, uploads to Vercel Blob.

**Body:** `{ batchNum: number, lotIds: string[], exportLabel: string }`

**Behavior:**
1. Re-validate auth + role
2. Re-validate `lotIds` belong to this job + are in `assigned` state (defense against tampered batch payloads)
3. Query `lot_photo` rows for these lots, ordered by display position
4. Compute filenames per AF360 convention:
   - 1 photo on lot: `{lotNumber}.jpg`
   - 2+ photos on lot: `{lotNumber}-{order}.jpg` where `order` is 1-indexed display position
5. **Reject** `500 EXPORT_FAILED` if any photo's MIME or extension is not JPEG; include affected lot numbers
6. **Fetch each photo from Supabase Storage with image transform** `?width=1568&quality=80&resize=contain` (matches existing display transform; ~15× egress reduction vs. originals). High parallelism (~50 concurrent fetches).
7. Stream photos through **`archiver`** zip stream (no compression — `store` mode; photos already JPEG-compressed)
8. Upload zip stream directly to **Vercel Blob** with path: `exports/{jobId}/{exportLabel}-batch-{N}-of-{M}.zip` and `addRandomSuffix: false` so re-export of the same job overwrites cleanly
9. Return JSON:
   ```json
   {
     "downloadUrl": "https://blob.vercel-storage.com/exports/.../...batch-3-of-10.zip",
     "expiresAt": "2026-05-05T18:00:00Z",
     "batchNum": 3,
     "totalBatches": 10,
     "filename": "JobExport-AcmeAuctions-Job001-2026-05-04-batch-3-of-10.zip",
     "photoCount": 847
   }
   ```

**Estimated function time per batch** (100 lots × up to 12 photos × ~200 KB transformed):
- Photo fetches at parallelism 50: ~10-30s
- Zip stream + Vercel Blob upload: ~10-30s
- **Total: ~30-60s per batch** (well under 300s)

#### `POST /api/cron/cleanup-export-blobs`

New cron, daily, mirrors the existing `cleanup-orphan-lots` cron. Lists `exports/` prefix in Vercel Blob, deletes any object older than **24 hours**.

**Schedule:** daily, off-hours, registered in [vercel.ts](../../../vercel.ts).

**Reject conditions across both endpoints surface as user-facing toasts:**
- `SELLER_CODE_REQUIRED — Seller Code is not set for {customer name}. Update via Customers → {customer name} before exporting.`
- `NO_LOTS — Job has no assigned lots ready for export.`
- `EXPORT_FAILED — Some lots have unsupported photo formats: {lot numbers}.` (per-batch)

### 3.6 Area 6 — Client export action (sequential orchestration)

**New hook `useExportJobAF360(jobId)`** in `src/hooks/useExportJobAF360.ts`:

State machine:
1. `idle` → user clicks Export button
2. `starting` — POST `/start`. On success: receive CSV + batch plan
3. **CSV download** — convert CSV string to Blob, trigger anchor download (`csvFilename`)
4. `batch-{N}-of-{M}` — for each batch in plan, sequentially:
   - POST `/batch` with `{ batchNum, lotIds, exportLabel }`
   - On success: receive `downloadUrl` → trigger anchor download
   - On failure: error toast, halt, allow user to retry from this batch
5. `done` — final success toast: `"Exported {totalLots} lots / {totalPhotos} photos in {totalBatches} files for {customer} / {jobNumber}"`

**Sequential, not parallel.** Per planning round, sequential gives clearer progress UX and avoids any Vercel function concurrency / Supabase rate-limit considerations. Parallelism can be added later if needed (it's not).

**No invalidation needed** (export is read-only; doesn't mutate state).

**Entry point** — Job list table in [src/routes/CustomerDetail.tsx](../../../src/routes/CustomerDetail.tsx). Each Job row gets an "Export to AF360" action (button or kebab-menu item — UX detail). Visible to admin + office; hidden for warehouse.

**Loading / progress UI** — when export is running, button replaced by progress copy:
- During `/start`: "Preparing export..."
- During each `/batch` call: "Building batch {N} of {M}..."
- During each download: "Downloading batch {N} of {M}..."
- Final state: "Export complete. {M+1} files downloaded."

**Resume on failure** — if a batch call fails, user clicks "Retry batch {N}" and the hook resumes from that batch. Earlier batches are not re-run.

### 3.7 Area 7 — Settings → Auction Platforms (read-only panel)

**New section in [src/routes/Settings.tsx](../../../src/routes/Settings.tsx):**
- Heading: "Auction Platforms"
- Card showing the AF360 platform:
  - Name: "AF360 / HiBid"
  - Description: "Auction Flex 360 → HiBid.com"
  - Status pill: "Default platform"
  - Collapsible "Field Mapping" section showing the 7-column CSV layout for admin reference
- No edit affordance, no add button. v1 ships one platform; multi-platform is v2.

Pulls metadata directly from `AF360_HIBID` const (single source of truth — no DB call).

## 4. Effort estimate

| Area | Effort |
|---|---|
| 1 — Schema migration + DTO move | ~0.25 day |
| 2 — Customer edit form + seller_code + disable + tests + new hooks | ~1.5 days |
| 3 — Job edit form + start_bid + shippable + tests + new hook | ~1 day |
| 4 — AF360 mapping module + pure-fn tests | ~0.5 day |
| 5 — Server export endpoints (start + batch) + cleanup cron + tests | ~1.5 days |
| 6 — Client export orchestration + tests | ~0.75 day |
| 7 — Settings → Auction Platforms read-only panel + tests | ~0.25 day |
| Sign-off testing + STATE.md / roadmap.md updates | ~0.5 day |
| **Total** | **~6.25 days** |

Larger than the original ~5-day estimate because:
- Customer + Job each need new edit forms built from scratch (no existing surface to extend)
- Two server endpoints + cleanup cron instead of one server endpoint
- Several new mutation hooks that didn't exist (`useUpdateCustomer`, `useToggleCustomerDisabled`, `useUpdateJob`)

## 5. Sequencing

1. **Branch** — create `phase-5-auction-platform-export` off `phase-4-settings-users`
2. **Area 1** — schema migration + DTO move first; everything depends on the new columns
3. **Area 4** — pure mapping module (no UI/IO; testable in isolation; locks the contract for Areas 5–6)
4. **Area 2** — Customer edit form + seller_code + disable (independent of Job changes)
5. **Area 3** — Job edit form + start_bid + shippable
6. **Area 5** — server export endpoints + cleanup cron (depends on 1, 2, 3, 4)
7. **Area 6** — client export orchestration (depends on 5)
8. **Area 7** — Settings panel (independent; can ship anytime after Area 4)
9. **Pre-sign-off** — pre-push trio (build + lint + test, all green), preview deploy, manual click-through (see §6)
10. **Sign off Phase 5** — same gate as other phases: all trio green, all new mutation hooks have tests per `docs/testing-policy.md`, manual sign-off click-through clean, STATE.md + roadmap.md updated, real-world AF360 import dry-run via the customer if practical (otherwise track as Phase 8 cutover prerequisite)

## 6. Acceptance gate

- [ ] Migration `0011_phase_5_auction_platform_export.sql` applied to Dev + Test
- [ ] `npm test` 250+ tests, all green (214 baseline + Phase 5 additions, ~45-55 new tests)
- [ ] `npm run lint` 0/0
- [ ] `npm run build` clean
- [ ] All new mutation hooks (`useUpdateCustomer`, `useToggleCustomerDisabled`, `useUpdateJob`, `useExportJobAF360`) have tests per `docs/testing-policy.md` — invalidation + error toast where applicable
- [ ] AF360 mapping pure-fn tests cover: title truncation, description newline stripping, CSV escaping, currency formatting, boolean formatting, slugify
- [ ] Server export endpoint tests cover: `/start` happy path, `/start` SELLER_CODE_REQUIRED rejection, `/start` NO_LOTS rejection, `/batch` happy path, `/batch` photo URL signing, `/batch` zip filename pattern, role gates on both endpoints, cleanup cron auth + correct deletion
- [ ] Manual sign-off click-through:
  - **Customer flows:**
    - [ ] Create customer with seller_code → success
    - [ ] Try to create customer with empty seller_code → blocked with copy from spec
    - [ ] Edit existing customer (null seller_code) → save without seller_code allowed; UI hint visible
    - [ ] Edit customer name + seller_code → both persist
    - [ ] Disable customer → confirm dialog → success → hidden from cataloging picker, hidden from job creation
    - [ ] Re-enable customer → confirm → reappears in pickers
    - [ ] Disabled customer remains visible in admin Customers list with status pill
    - [ ] Customer list shows SellerCode column with "(not set)" for null values
  - **Job flows:**
    - [ ] Create job with default start_bid ($5.00) and shippable (false) → values persisted
    - [ ] Create job with custom values → persisted
    - [ ] Edit job → change job_number + start_bid + shippable → reload page → all persist
    - [ ] Job list shows Start Bid + Shippable columns
  - **Export flow:**
    - [ ] Pick a customer with real seller_code + a job with assigned lots → click Export to AF360
    - [ ] CSV downloads immediately with filename `JobExport-{slug}-{jobNumber}-{date}.csv`
    - [ ] Loading state cycles through "Building batch N of M..." for each batch
    - [ ] Each batch zip downloads automatically with filename `JobExport-{slug}-{jobNumber}-{date}-batch-{N}-of-{M}.zip`
    - [ ] Final toast: "Export complete. {M+1} files downloaded."
    - [ ] Unzip all batches into one folder; verify:
      - [ ] CSV has correct 7 columns matching AF360 spec
      - [ ] CSV row count matches assigned lot count for that job
      - [ ] Photo filenames match `{lotNumber}.jpg` / `{lotNumber}-{order}.jpg` pattern
      - [ ] Title field properly truncated (if any are >50 chars from AI)
      - [ ] Description field has no embedded newlines
      - [ ] Special chars in title/description correctly CSV-escaped
  - **Export error paths:**
    - [ ] Customer with null seller_code → click Export → error toast with copy from spec §3.5
    - [ ] Job with no assigned lots → click Export → error toast `NO_LOTS`
    - [ ] Single-batch failure (forced for testing) → error toast with retry button → retry resumes from that batch only
    - [ ] (If feasible to construct) Lot with non-JPEG photo → batch-level `EXPORT_FAILED` listing affected lot numbers
  - **Settings panel:**
    - [ ] Settings → Auction Platforms section renders
    - [ ] Field Mapping collapsible expands and shows all 7 columns
    - [ ] No add / edit affordance present
- [ ] Cleanup cron verified: trigger manually, confirm 24h+ Vercel Blob objects removed
- [ ] STATE.md updated with Phase 5 sign-off summary + any spec deviations
- [ ] roadmap.md updated to mark Phase 5 ✅ (and Phase 6 becomes "next")

## 7. Captured decisions (locked during planning round)

| Decision | Outcome |
|---|---|
| Multi-platform architecture for v1 | One platform (AF360). Hardcoded TS const, no `auction_platform` DB table, no CRUD endpoints. v2 migrates to DB-backed when a second platform shows up. |
| Image bundle in scope | Yes — corrected from initial roadmap deferral. |
| SellerCode shape | Per-Customer field (`customer.seller_code`). DB nullable; required-ness enforced at the application layer (Zod-required at create, export endpoint hard-blocks when null/empty). Existing customers carry NULL post-migration; UI shows "(not set)" so admin can spot them. |
| Customer disable/re-enable | Bundled into Phase 5 since the migration was already touching the Customer table. Mirrors Phase 4 user disable pattern. |
| Customer + Job edit forms | Built from scratch in Phase 5. Neither entity has any editable surface in the codebase today (verified 2026-05-04). |
| Job-level export defaults | `start_bid` (decimal, default $5.00) + `shippable` (boolean, default false) on the Job entity. Required at create, editable. |
| Estimate / Reserve fields | Dropped from CSV scope. Customer doesn't use them. Add later if requirement appears. |
| Title 50-char enforcement | Phase 6 (AI subsystem) — prompt ceiling. Phase 5 only does silent truncation as a defensive last-line guard. |
| Fallback Consignor ID | AF360-wizard-time setting. Not in our CSV, not in our Settings. Skipped. |
| Output mechanism | **CSV (inline, instant) + N batched image zips (Vercel Blob signed URLs).** Not a single zip. Eliminates 300s timeout cliff at the upper bound. |
| Batch size | **100 lots per batch.** Comfortable margin under 300s function timeout (estimated 30-60s per batch). 1000-lot job = 10 image zips + 1 CSV = 11 files total. |
| Client orchestration | **Sequential.** Client calls `/batch` for each batch in order, waits for each download to start before kicking the next. Simpler progress UX, no concurrency edge cases. |
| Resume on failure | Single-batch failure → user retries that batch. Earlier batches preserved. No need to rebuild the whole export. |
| Temp store | **Vercel Blob.** Faster ingress from Vercel Functions than Supabase Storage. Egress free up to 100 GB/month on Pro. |
| Server-side zip dependency | **`archiver`** (Node, ~1MB unpacked, mature). Approved as a new server-side dep. Used in `store` mode (no compression — JPEGs already compressed). |
| Photo transform at fetch | `?width=1568&quality=80&resize=contain` — matches existing display transform. ~15× egress reduction vs. originals; visual quality more than sufficient for AF360 / HiBid. |
| Photo signed-URL handling | Fetched server-side directly via Supabase admin client (not signed URLs); the function streams them straight into the zip. No client-facing photo URLs. |
| Settings panel | Read-only display of AF360 platform card + collapsible field-mapping reference. No edits in v1. |
| Export history tracking | None. Stateless — every export is fresh. No `exported_at` flag, no transition. |
| Lot eligibility | Only lots with `state = 'assigned'` in the target job. `unassigned` and `not-sellable` excluded. Re-export allowed; no state change after export. |
| Export role gating | Admin + Office. Warehouse cannot export. |
| Image format handling | Pass-through. JPEG-only at v1 (matches existing photo pipeline). HEIC/PNG photos cause that batch to fail with explicit error listing the affected lot numbers. No transcoding in this phase. |
| Customer name slug in zip filename | Lowercase + alphanumeric + dashes, max 50 chars. Standard slugify. |
| Cleanup cron | New daily cron `cleanup-export-blobs` deletes Vercel Blob objects under `exports/` older than 24 hours. |
| Browser support | Any modern browser (no FSA requirement). Native browser downloads work universally for the CSV anchor click + the Vercel Blob signed URLs. |

## 8. Open questions / carry-forwards

These don't block Phase 5 implementation but should be addressed at the right time.

1. **Sample CSV from current customer workflow** — user will provide as a sanity check post-implementation. Eyeball-comparison test only; not blocking.
2. **Real-world AF360 import dry-run** — ideally the customer runs an exported set through their AF360 wizard before Phase 5 is signed off. If the customer's not available during the sign-off window, dry-run becomes a Phase 8 (cutover) prerequisite.
3. **HEIC photo handling** — current pipeline shouldn't produce HEIC files (iPhone setting "Most Compatible" is a one-time device config; storage bucket also rejects HEIC at the MIME level). If batch-level `EXPORT_FAILED` fires in production, server-side transcoding is a v1.5 add. Track but don't gate Phase 5.
4. **Re-export naming collisions** — same job exported twice on the same day produces zips with identical filenames. Vercel Blob path uses `addRandomSuffix: false` so the new export overwrites the old objects in storage; the user's downloaded zips collide with existing files in their download folder (browser appends `(1)` automatically). Acceptable for v1.
5. **Multi-platform UI shape** — when a second platform arrives in v2, the Settings panel grows from read-only to add/edit, and `auction_platform` DB table replaces the TS const. Migration path is straightforward (INSERT INTO from the const) — no v1 design changes needed.
6. **Vercel Blob storage cost at scale** — at upper bound (10× ~200 MB zips per export = ~2 GB) and 24h TTL, peak storage is roughly 8 GB across 4 monthly exports. Negligible cost. Track if export frequency increases significantly.
