# Phase 3 Design Spec — Mobile Cataloging + Photo Pipeline + Mobile Inventory

> **Companion documents:**
> - `docs/superpowers/specs/2026-04-29-v1-design.md` — overall v1 design (authoritative product/data spec)
> - `docs/superpowers/specs/2026-04-30-phase-2-design.md` — Phase 2 spec (lot lifecycle + label printing, signed off)
> - `ui-design/design_handoff/` — high-fidelity UI mockups + tokens (Option C · Mica Slate). Phase 3 references `option-c-flow.jsx` (cataloging) + `option-c-mobile-inventory.jsx` (mobile inventory, added 2026-05-01).
> - `STATE.md` — current working state of the repo
>
> This spec defines what Phase 3 builds. The implementation plan (next document) sequences the work into discrete tasks.

---

## 1. Overview

**Phase 3 = "Mobile cataloging + photo capture pipeline + mobile inventory."** Builds the warehouse-primary surfaces:

- **Mobile cataloging flow** — picker → lot in progress → photo capture → save → photo manager → end-session. The workflow that *creates* lots.
- **Photo capture pipeline** — direct browser → Supabase Storage upload via signed URLs, IndexedDB-backed queue surviving tab close, status tracking on `lot_photo` rows.
- **Mobile inventory page** — sticky search + slide-out filter drawer + single-column rows + full-screen lot detail. Closes the original handoff's mobile-inventory gap.
- **Login routing + role gating** — warehouse → `/catalog`, others → `/inventory`; per-route role gate added to `ProtectedRoute`.
- **Inventory pagination** — virtualized infinite scroll on the existing desktop inventory (latent bug: current code silently truncates at 50 lots; fixed as part of Phase 3 since the same hooks power the new mobile inventory).

**Sequencing rationale:** Phase 2 shipped the lot detail spine (modal, edit form, state machine, label printing). Phase 3 reuses every one of those pieces inside the cataloging flow and the new mobile surfaces. AI generation is deferred to Phase 4 — Phase 3 produces lots with all operator-supplied fields and photos; AI fills title / description / reference price afterward.

### 1.1 Success criteria (Phase 3 sign-off)

1. Warehouse user logs in → lands on `/catalog` (customer/job picker)
2. Picker shows customers + their jobs; closed jobs visible-but-disabled (D-005); Begin Session enabled only when both selected
3. Lot-in-progress screen appears with next `lot_number` reserved; `Special Notes` defaults to None; `Quantity` defaults to 1
4. First camera tap creates the `lot` DB row in `assigned` (advisory lock per `jobId` serializes lot_number allocation) AND the first `lot_photo` row in `pending` AND begins the signed-URL upload to Supabase Storage; UI shows the photo immediately from a local blob URL
5. Subsequent photos add `lot_photo` rows and queue uploads; pending count visible; photo count gated to 1–12 per spec §6.1
6. Field edits autosave 1.5s after typing stops AND on field-blur AND on Next; PATCH failures retry once silently then show "Saving paused" indicator
7. IndexedDB form mirror persists field state per-keystroke (200ms debounce) so tab-close-mid-edit doesn't lose the most recent typing
8. Photo manager: tap a thumbnail → full-screen viewer with retake / delete / reorder; cover badge follows slot 1
9. Print Label button on cataloging screen: 1 silent retry on failure → toast "Label print failed — Lot N saved. Reprint from Inventory." Lot save is unaffected (D-004)
10. Next: increments `lot_number`, presents fresh in-progress screen; existing pending uploads continue in background and link via `lot_photo.lot_id`
11. End Session → confirm modal with Discard/Keep choice. Discard deletes the in-progress lot row (cascades photo rows + Storage objects). Keep leaves it; cleanup sweep handles it after 30 minutes if it remains photo-less
12. Vercel cron `/api/cron/cleanup-orphan-lots` runs every 15 min, sweeps `(state IN ('assigned', 'unassigned')) AND zero lot_photo rows AND created_at < now() - interval '30 minutes'`. Storage objects deleted along with rows
13. Mobile inventory page: sticky top bar with search + filter button (count badge when active); single-column rows; tap → full-screen lot detail modal; no bulk affordances
14. Filter sheet (bottom drawer): same filter set as desktop (customer, job, lot status, AI status, date range); apply / clear-all
15. Lot detail modal full-screen on mobile (< md breakpoint), centered modal at md+; same component, responsive variants
16. Inventory virtualized infinite scroll on both desktop and mobile (`useLots` returns paginated data; row virtualization handles thousands of lots)
17. Role gating: `ProtectedRoute` accepts an optional `roles?: Role[]` prop; warehouse blocked from `/customers` and `/settings`; office blocked from `/settings`; failed gate redirects to that role's home (`/catalog` for warehouse, `/inventory` for office/admin); state-change menu hides sold / picked-up / not-sellable transitions for warehouse users
18. Login redirects: warehouse → `/catalog`; office/admin → `/inventory`; deep-links survive (auth gate captures the original target and resumes after login)
19. All Phase 1 + Phase 2 vitest tests still pass (105/105); new vitest tests cover photo endpoints, advisory-lock concurrency on lot create, cleanup sweep, role-gate enforcement
20. End-to-end manual click-through on Vercel preview against Dev Supabase: full cataloging session on a real phone, mobile inventory browsing, role-gate verification on each role

### 1.2 Out of scope (deferred)

- **AI subsystem** — title / description / reference price generation, manual + scheduled triggers, AI status filters wiring → Phase 4
- **Audit reporting view** (`/audit` route) → later phase
- **Users management page** (`/users` route) → later phase
- **AI schedule + Organization sections** of Settings → later phases
- **Saved filter presets** (per-user persistence) → later phase
- **Global search** across customers / jobs / lots → later phase
- **HEIC conversion** — handled by phone-side iOS setting per v1 spec §5.3 (one-time device setup); no client-side conversion
- **Stateful resume across sessions** — no "Resume your last lot" UX; abandoned lots are reaped by cleanup sweep
- **Service Worker for upload survival across tab close** — out of scope for v1; pending uploads die with the tab and resume on next session via the IndexedDB queue
- **Image transformation per-thumbnail** at first display — Phase 3 ships signed URLs with `?width=300&quality=80` style params on Inventory thumbnails and `?width=1568&quality=80` on lot detail; rely on Supabase's edge cache for repeat views
- **Native mobile app**, **direct API integration with auction platforms** → post-v1

### 1.3 Carry-forwards from earlier phases

- Physical Zebra ZD450 round-trip test (Phase 2 carry-forward — fires when hardware on hand)
- Audit-log spot-check via Supabase Studio SQL Editor (Phase 2 carry-forward — low risk; Phase 1 verified actor capture works)

---

## 2. Spec amendments to v1 (already applied in this branch's prep commit)

The following amendments were made to keep all docs in sync with Phase 3 decisions before this spec was written:

| Document | Section | Change |
|---|---|---|
| `docs/superpowers/specs/2026-04-29-v1-design.md` | §5.2 | Lot DB row created on first photo capture (was: "no DB row exists yet"). Resolves contradiction with §6.2's "lot_photo row created at capture time" given `lot_photo.lotId NOT NULL` |
| `ui-design/design_handoff/SPEC-DEVIATIONS.md` | D-001 | Reversed: sold is now frozen alongside picked-up and not-sellable (Phase 2 sign-off decision). Preserves what bidders saw on the auction platform |
| `ui-design/design_handoff/ui-design-spec.md` | §7 | Manual Print Label button per D-004, not auto-print on Next. Phase 2 shipped manual; section was stale |
| `ui-design/design_handoff/README.md` | State machine + pill colors | State names hyphenated (`picked-up`, `not-sellable`) to match shipped schema; sold annotated as frozen; picked-up / not-sellable annotated as terminal |

---

## 3. Backend architecture

Continues the Phase 1+2 native Vercel handler pattern (`(req, res) => Promise<void>`). All mutations through `asActor(userId, fn)` for audit-trail actor capture.

### 3.1 New endpoints

| Route | Methods | Roles | Notes |
|---|---|---|---|
| `/api/lots/[id]/photos` | `GET`, `POST` | GET: any auth · POST: admin/office/warehouse | GET shipped in Phase 2. POST creates a `lot_photo` row in `pending`, generates signed upload URL via Supabase `createSignedUploadUrl`, returns `{ photoId, uploadUrl, storagePath, displayOrder }`. Body: `{ displayOrder: number }` |
| `/api/lots/[id]/photos/[photoId]` | `PATCH`, `DELETE` | admin/office/warehouse (DELETE: admin/office) | PATCH `{ status: 'uploaded' \| 'failed' }` flips the row's status after the client's PUT to Storage completes (or fails permanently). DELETE removes the row AND the Storage object atomically |
| `/api/lots/[id]/photos/order` | `PATCH` | admin/office/warehouse | Body: `{ order: photoId[] }`. Reorders by rewriting `display_order` values in a single transaction. Cover photo (`display_order = 1`) follows whichever id is first |
| `/api/cron/cleanup-orphan-lots` | `POST` (Vercel cron) | system (cron-only header check) | Sweeps `state IN ('assigned', 'unassigned') AND zero lot_photo rows AND created_at < now() - interval '30 minutes'`. Deletes rows; for safety also deletes any Storage objects under `lots/{lotId}/` (typically zero for orphans by definition). Returns `{ deleted: number }` |

### 3.2 Modified endpoints

| Route | Change |
|---|---|
| `POST /api/lots` | Wrap insert in `pg_advisory_xact_lock(hashtext($1))` keyed by `jobId` to serialize `lot_number` allocation per-job. Existing 409 `LOT_NUMBER_CONFLICT` path becomes defense-in-depth; concurrent POSTs for the same job queue rather than collide |
| `DELETE /api/lots/[id]` | After DB delete (cascades `lot_photo` rows), enumerate Storage objects under `lots/{lotId}/` and remove them. Atomic at the DB level; Storage cleanup is best-effort with logging on failure |
| `GET /api/lots` | Response augmented with `coverSignedUrl` per row — joined from `lot_photo WHERE display_order = 1`, signed at response time with 1h TTL via `createSignedUrl(path, 3600, { transform: { width: 300, quality: 80 } })`. Adds one LEFT JOIN per query; per-row HMAC is microseconds |
| `GET /api/lots/[id]/photos` | Response augmented with `signedUrl` per photo — signed at response time with 1h TTL and `?width=1568&quality=80` for lot detail use |

### 3.3 Lot creation timing — first photo capture (amended §5.2)

The mobile cataloging flow creates the lot DB row inside the same transaction that inserts the first `lot_photo`. Concretely:

```ts
// POST /api/lots/with-first-photo (or POST /api/lots/[id]/photos when lotId is null in body)
await asActor(userId, async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${jobId}))`);
  const nextLotNumber = await reserveNextLotNumber(tx, jobId);
  const [lotRow] = await tx.insert(lot).values({
    jobId, lotNumber: nextLotNumber, state: 'assigned',
    intakeOperatorId: userId, /* sparse fields filled later */
  }).returning();
  const [photoRow] = await tx.insert(lotPhoto).values({
    lotId: lotRow.id, storagePath: `lots/${lotRow.id}/${photoId}.jpg`,
    displayOrder: 1, status: 'pending', capturedBy: userId,
  }).returning();
  return { lot: lotRow, photo: photoRow };
});
const uploadUrl = await supabaseAdmin.storage.from('lot-photos').createSignedUploadUrl(photoRow.storagePath);
return { lot, photo, uploadUrl };
```

After the first photo, subsequent photos hit `POST /api/lots/[id]/photos` (lot_id known). Field PATCHes hit `PATCH /api/lots/[id]` as usual.

### 3.4 Storage bucket + RLS migration

New migration `0007_lot_photos_storage_policies.sql`:

- Bucket `lot-photos` (private; manually created in Supabase Studio per setup steps in plan)
- RLS on `storage.objects` for `bucket_id = 'lot-photos'`:
  - SELECT: any authenticated role (admin/office/warehouse) — needed for signed URL generation
  - INSERT: any authenticated role — direct browser uploads via signed URL
  - UPDATE: admin/office/warehouse — for re-upload over the same path (rare; mostly for retake)
  - DELETE: admin only — physical file removal happens via the API endpoint, which uses service-role; this policy guards direct-API-key abuse

CORS: not explicitly configured. The standard Supabase Storage API endpoint auto-handles CORS for cross-origin signed-URL uploads (verified during Phase 3 area-2 round; the "S3 configuration" tab in Studio is for the separate S3-compatible protocol, not used here).

### 3.5 Vercel cron registration

Add to `vercel.ts`:

```ts
crons: [
  { path: '/api/cron/cleanup-orphan-lots', schedule: '*/15 * * * *' },
],
```

Cron handler verifies `Authorization: Bearer ${CRON_SECRET}` header; rejects any other request. `CRON_SECRET` is a new env var (added to `.env.setup` and pushed via `npm run env:setup`).

---

## 4. Photo capture pipeline

### 4.1 Upload state machine

```
[client capture]
    ↓
POST /api/lots/[id]/photos
    ↓
lot_photo INSERT (status='pending')  +  signed upload URL returned
    ↓
[browser PUTs file to signed URL]
    ↓
        success                                    failure
            ↓                                          ↓
PATCH .../photos/[id] {status:'uploaded'}    [retry up to 3 times w/ exp backoff]
            ↓                                          ↓
[done — image rendered from signed URL]      [on final failure: PATCH {status:'failed'}]
                                                       ↓
                                          [photo strip shows retry/discard affordance]
```

### 4.2 IndexedDB upload queue

A single IndexedDB store `photo-upload-queue` keyed by `photoId`, holding:

```ts
{
  photoId: string;
  lotId: string;
  blob: Blob;             // the captured file, before upload
  uploadUrl: string;      // signed URL from server
  storagePath: string;
  retries: number;        // 0..3
  createdAt: number;
}
```

Queue lifecycle:
- **Enqueue** on photo capture, after the server returns `{ photoId, uploadUrl }`
- **Process** runs N=3 concurrent uploads at a time; pause when total pending exceeds 20 (configurable)
- **Success** → PATCH status to `uploaded`, remove from queue
- **Failure with retries left** → exponential backoff (1s, 4s, 16s)
- **Final failure** → PATCH status to `failed`, leave in queue with `retries: -1`, surface in photo strip with retry/discard

Queue survives tab close because it's in IndexedDB. Tab close kills in-flight HTTP requests; on next mount, the queue processor picks up where it left off (entries in `pending` resume; entries in `failed` are surfaced for user action).

### 4.3 IndexedDB form mirror

Separate IndexedDB store `lot-form-cache` keyed by `lotId`, holding `{ fields: Partial<LotDTO>, lastTouchedAt: number }`. Updated on every keystroke (200ms debounce). Reconciled with server state on autosave success (server response is authoritative). Cleared when the lot leaves the in-progress state (Next or End Session → Discard / Keep).

Purpose: covers the gap between last server PATCH (1.5s debounced) and tab close. The mirror is faster (200ms) so worst-case unsynced data is ≤200ms of typing.

### 4.4 Storage path scheme

```
lot-photos/lots/{lotId}/{photoId}.jpg
```

Flat lot-scoped layout. Survives lot moves between jobs without storage reshuffle (path is keyed on lot id, not customer/job). Customer/job context is recoverable via DB join when needed.

---

## 5. Mobile cataloging flow

Five screens. Implementation references `ui-design/design_handoff/option-c-flow.jsx` (mockup is the visual target).

### 5.1 `/catalog` — Customer/Job picker

- Fetches customers via `useCustomers` hook (already shipped)
- Selecting a customer fetches that customer's jobs via `useJobs(customerId)` (already shipped)
- Closed jobs (`closedAt IS NOT NULL`) shown disabled (D-005)
- Begin Session enabled only when both selected
- On Begin: navigate to `/catalog/session?customer={id}&job={id}` (URL-encoded so deep-link refresh works); reset session state

### 5.2 `/catalog/session` — Lot in progress

Fields, in mobile-priority order matching the new mobile lot-detail mockup (Phase 3 area 4 decision):
1. Camera CTA (large gradient when no photos; compact "Add Photo" when photos exist)
2. Photo strip (cover badge on slot 1; tap thumbnail → photo manager)
3. Quantity stepper + Untested toggle (row)
4. Special Notes dropdown (required; defaults to None — `None` is a valid required value)
5. Conditional Size (when Special Notes = CLOTHING)
6. Additional Info expandable: Title, Description, Price, Ref1, Ref2 (all optional)
7. Print Label button (D-004 manual)
8. End Session / Next footer

State changes:
- Camera tap with no photos → POST to lot-create-with-first-photo endpoint → set local `lotId`
- Camera tap with photos → POST `/api/lots/[id]/photos` → enqueue upload
- Field changes → autosave (1.5s debounce, 200ms IndexedDB mirror)
- Print Label → fire print → 1 silent retry on failure → toast on second failure → continue
- Next → flush autosave → increment `lotNumber` (UI; server-side already exists) → reset photo state → fresh in-progress
- End Session → confirm modal

### 5.3 `/catalog/session/photos` — Photo manager

Full-screen viewer per `option-c-flow.jsx → PhotoMgrScreen`:
- Large hero photo
- Thumbnail strip
- Actions row: Retake, Move ←, Move →, Delete
- Cover badge follows slot 1

Reorder writes `display_order` via `PATCH /api/lots/[id]/photos/order`. Delete writes via `DELETE /api/lots/[id]/photos/[photoId]`.

### 5.4 Save success splash

Per `option-c-flow.jsx → SaveSuccessScreen`. Brief 800ms confirmation between Next and the next in-progress screen. Visual only (no server calls).

### 5.5 End session confirm

Per `option-c-flow.jsx → EndConfirmScreen`. Two actions:
- **Keep going** → close modal, return to lot in progress
- **Discard & end** → DELETE the current in-progress lot if it exists (cascades photo rows + Storage objects) → navigate back to `/catalog` picker
- (No "Keep without committing" option in v1 — either commit via Next or discard. Cleanup sweep handles edge cases of true abandonment.)

---

## 6. Mobile inventory page + responsive shell

Implementation references `ui-design/design_handoff/option-c-mobile-inventory.jsx` (mockup is the visual target).

### 6.1 Architecture — hybrid responsive split

Single `/inventory` route. `Inventory.tsx` parent owns: filters state (URL-synced), selection state, `useLots` data, mutations, toasts, dialogs. Children render conditionally on viewport:

```tsx
<Inventory>
  <InventoryFiltersDesktop className="hidden md:flex" />
  <InventoryFiltersMobileSheet className="md:hidden" />
  <InventoryTable className="hidden md:block" />
  <InventoryMobile className="md:hidden" />
  <BulkActionBar className="hidden md:flex" />  {/* mobile has no bulk affordances */}
  <Dialog ... />  {/* responsive: full-screen on mobile, centered on desktop */}
</Inventory>
```

URL params, hooks, mutations all shared in the parent. Tailwind responsive classes do the swap.

### 6.2 Mobile inventory components

- **`InventoryMobile`** — single-column rows per mockup screen 1. Each row: 56×56 photo · stacked customer·job·#N (mono small) + title (body bold) + state pill + AI annotation. Tap → opens lot detail modal (URL `?openLot=...` pattern from Phase 2)
- **`InventoryFiltersMobileSheet`** — shadcn `<Sheet>` (bottom drawer, mockup screen 3). Same fields as desktop filter bar: customer dropdown, job dropdown (cascading), lot status chips, AI status chips, date range. Apply / Clear all
- **Filter button** in the sticky top bar with count badge when ≥1 filter active

### 6.3 Lot detail modal — responsive variant

Update `<Dialog>` content to apply full-screen styles below `md`:

```tsx
<DialogContent className="max-w-2xl max-md:inset-0 max-md:max-w-none max-md:rounded-none max-md:h-screen max-md:max-h-screen">
```

`LotDetail` component itself adapts to width via existing responsive classes (Phase 2's `/lot/:id` route already verified responsive layout).

### 6.4 Virtualized infinite scroll

Replace the current "fetch 50, stop" behavior with paginated infinite scroll. Hook changes:

- `useLots` becomes `useInfiniteLots` using TanStack Query's `useInfiniteQuery`
- Each page is `limit=50, offset=N*50`
- Server response already includes `total`; hook computes `hasNextPage = data.length < total`
- IntersectionObserver on a sentinel row at the end of the visible list triggers `fetchNextPage`
- Row virtualization library: `@tanstack/react-virtual` (~5 KB gzipped) for desktop table and mobile rows
- Selection state survives scroll (Phase 2's existing `Set<string>` keyed by `id`)

This addresses the latent Phase 2 bug (silent truncation at 51 lots) AND powers the new mobile inventory in the same pass.

---

## 7. Login routing + role gating

### 7.1 Login redirect

`Login.tsx` (after successful auth):

```ts
const role = decodeRoleFromJwt(session.access_token);  // existing useRole pattern
const home = role === 'warehouse' ? '/catalog' : '/inventory';
const target = searchParams.get('redirect') ?? home;
navigate(target);
```

### 7.2 ProtectedRoute role gate

```tsx
type Props = { children: ReactNode; roles?: Role[] };

export function ProtectedRoute({ children, roles }: Props) {
  const { session, role } = useAuth();
  if (!session) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  if (roles && !roles.includes(role)) {
    const home = role === 'warehouse' ? '/catalog' : '/inventory';
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
```

Route gating per the v1 spec §3 permission matrix:

| Route | `roles` prop |
|---|---|
| `/catalog`, `/catalog/session`, `/catalog/session/photos` | `['admin', 'office', 'warehouse']` (default — pass nothing) |
| `/inventory`, `/lot/:id` | none (auth only — all roles) |
| `/customers`, `/customers/:id` | `['admin', 'office']` |
| `/settings` | `['admin']` |
| `/users` (future) | `['admin']` |
| `/design-system` | none (auth only — internal/dev) |

### 7.3 State-change menu role gate

`ChangeStateMenu` accepts a `role` prop and filters `LEGAL_TRANSITIONS[currentState]` to drop transitions warehouse cannot trigger (sold, picked-up, not-sellable). Server-side `validateTransition` is unchanged — UI gate is convenience only; PATCH handler also enforces via the existing role check on `requireAuth(req, 'admin', 'office')` for state transitions.

---

## 8. Things still to design (carry-forward gaps)

Per the design handoff README:
- Tablet/phone fallback for Customers / Users / Settings / Audit (only mobile cataloging + mobile inventory designed for v1)
- First-run / empty states for Customers, Jobs, Users, Audit pages (handled implicitly via Phase 2 components, not designed)
- Saved filter presets management

These are not Phase 3 work. They get folded into later phase scoping when those surfaces ship.

---

## 9. Open questions resolved during Phase 3 design (for the record)

| # | Question | Resolution |
|---|---|---|
| 1 | When does the lot DB row get created? | First photo capture (amended §5.2). Cleanup sweep handles abandoned in-progress lots |
| 2 | Concurrent lot_number reservation? | Postgres advisory lock per `hashtext(jobId)` inside `asActor` transaction |
| 3 | Storage cleanup policy? | Clean-as-we-go everywhere: lot delete cascades photo rows + Storage objects; photo delete removes row + object; cleanup sweep removes orphans |
| 4 | Photo bucket layout? | `lots/{lotId}/{photoId}.jpg` — flat, lot-scoped; survives lot moves |
| 5 | Signed-URL flow? | One-shot create-and-sign: `POST /api/lots/[id]/photos` returns row + uploadUrl in one response |
| 6 | Public vs. private bucket? | Private; bulk-signed URLs returned in list/detail responses |
| 7 | CORS configuration? | Not needed — standard Supabase Storage API auto-handles cross-origin |
| 8 | Autosave timing? | 1.5s debounce server PATCH + 200ms IndexedDB mirror + flush on blur/Next |
| 9 | Tab close mid-edit? | Server autosave covers ≥1.5s-old changes; IndexedDB mirror covers ≥200ms-old changes; lot DB row survives; orphans reaped if no photos |
| 10 | Resume session UX? | None. Cleanup sweep handles abandonment. Operators start fresh sessions |
| 11 | Title required on Next? | No. Spec §5.2 step 5 says optional + backfillable; gate is 1+ photo and Special Notes selection (defaults to None) |
| 12 | Label-print recovery? | 1 silent retry → toast "Saved. Reprint from Inventory." Lot save unaffected |
| 13 | Mobile inventory architecture? | Hybrid responsive: shared parent, viewport-swapped children. Single `/inventory` route |
| 14 | Lot detail modal on mobile? | Same component; responsive class flips it to full-screen below `md` |
| 15 | Login routing? | warehouse → `/catalog`; office/admin → `/inventory`. Per-route role gate added |
