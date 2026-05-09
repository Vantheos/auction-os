# Auction OS — User Guide

This guide covers day-to-day use of Auction OS for Admin, Office, and
Warehouse users. It assumes the app is already deployed and your account
exists.

> **Status:** prose complete. Some screenshots in the master checklist
> below are marked `[-]` — those weren't captured and are not referenced
> in the guide. If you capture them later, add them to the relevant page
> at that point.

## Table of contents

1. [Getting started](./getting-started.md) — sign-in, navigation, account basics
2. [Roles and permissions](./roles-and-permissions.md) — what Admin / Office / Warehouse can do
3. [Catalog session (mobile)](./catalog-session.md) — capturing lots from the floor
4. [Inventory](./inventory.md) — list, filters, search, bulk actions
5. [Lot detail](./lot-detail.md) — viewing, editing, photos, state changes
6. [Customers and jobs](./customers-and-jobs.md) — managing sellers and auctions
7. [Export to AF360 / HiBid](./export-to-af360.md) — auction platform pipeline
8. [AI generation](./ai-generation.md) — manual run, schedule, status
9. [Label printing](./label-printing.md) — *coming soon (Phase 7)*
10. [Settings](./settings.md) — AI schedule, auction platforms, users admin
11. [Troubleshooting](./troubleshooting.md) — sign-in, cache, common issues

## How to take screenshots

- **Windows:** `Win + Shift + S` → rectangular crop → save to
  `docs/user-guide/images/`.
- **iPhone (for mobile flows):** side-button + volume-up → AirDrop / send
  to PC → save to the same folder.
- Use lowercase-hyphen file names that match the per-page lists below
  (e.g. `inventory-list-default.png`, not `Screenshot 2026-05-08.png`).
- Keep crops tight — exclude the OS chrome / browser tabs unless they
  matter for context.
- For mobile shots, please include both portrait orientation and any
  state where keyboard is open if relevant.

## Master image checklist

Each per-page doc has its own list. The combined set is below so you can
batch-capture in one session if you prefer.

### Login & navigation
- [x] `login-screen.png` — empty login form
- [x] `login-error-invalid.png` — login with wrong creds, error visible
- [x] `login-disabled-account.png` — disabled-account banner
- [x] `nav-sidebar-admin.png` — sidebar as Admin (all items visible)
- [x] `nav-sidebar-office.png` — sidebar as Office
- [x] `nav-sidebar-warehouse.png` — sidebar as Warehouse (Catalog/Inventory only)

### Catalog (mobile)
- [x] `catalog-customer-job-picker.png` — start of a session, picker open
- [x] `catalog-empty-session.png` — session active, no lot in progress
- [x] `catalog-lot-in-progress-top.png` — top of LotInProgress with header (customer/job)
- [x] `catalog-photo-strip.png` — photos added, strip filled
- [x] `catalog-additional-info-collapsed.png` — Additional Info collapsed
- [x] `catalog-additional-info-expanded.png` — Additional Info expanded
- [-] `catalog-pending-uploads-indicator.png` — uploads in progress
- [x] `catalog-discard-confirm.png` — discard confirmation dialog
- [-] `catalog-advance-success.png` — toast after advancing to next lot

### Inventory
- [x] `inventory-list-default.png` — list, no filters
- [x] `inventory-filters-open.png` — filter sheet/panel open
- [x] `inventory-search-results.png` — search query with matches
- [x] `inventory-bulk-selected.png` — multiple rows selected, action bar visible
- [-] `inventory-bulk-action-menu.png` — bulk action menu open (state change / move / delete)
- [x] `inventory-export-button.png` — Inventory-level Export button when Job filter is active
- [x] `inventory-empty-no-results.png` — list with zero results

### Lot detail
- [x] `lot-detail-overview.png` — modal open on a lot
- [x] `lot-detail-edit-fields.png` — edit form populated
- [x] `lot-detail-additional-info.png` — Additional Info section expanded
- [x] `lot-detail-photo-manager.png` — photo manager (add/delete photos)
- [x] `lot-detail-state-change-menu.png` — state change menu/dialog
- [x] `lot-detail-move-dialog.png` — Move / Assign to Job dialog
- [x] `lot-detail-delete-confirm.png` — delete confirmation
- [x] `lot-detail-unsaved-changes-dialog.png` — unsaved-changes warning
- [x] `lot-detail-ai-badges.png` — AI status badge variants (success / partial / failure / running)
- [x] `lot-detail-run-now-button.png` — manual AI Run Now button

### Customers & jobs
- [x] `customers-list.png` — Customers list with search
- [x] `customers-search-results.png` — search query active
- [-] `customer-detail.png` — customer detail page with jobs list
- [x] `customer-edit-dialog.png` — edit customer dialog (incl. seller_code)
- [x] `customer-disable-confirm.png` — disable customer confirmation
- [x] `customer-disabled-state.png` — customer page in disabled state
- [x] `job-create-dialog.png` — new job dialog
- [x] `job-edit-dialog.png` — edit job dialog (start_bid, shippable)

### AF360 / HiBid export
- [x] `export-button-job.png` — Export button on customer/job page
- [x] `export-button-inventory.png` — Inventory-level Export button
- [-] `export-progress-running.png` — progress UI during batches
- [x] `export-success-download.png` — completed state with download links
- [-] `export-error-no-lots.png` — NO_LOTS error
- [-] `export-error-seller-code.png` — SELLER_CODE_REQUIRED error
- [-] `export-retry-button.png` — Retry button after a batch failure

### AI generation
- [x] `ai-run-now-button.png` — manual run button
- [x] `ai-status-running.png` — running badge
- [x] `ai-status-success.png` — success badge
- [x] `ai-status-partial.png` — partial badge
- [-] `ai-status-failure.png` — failure badge with error tooltip / message

### Settings
- [x] `settings-ai-schedule.png` — AI Schedule panel
- [x] `settings-auction-platforms.png` — Auction Platforms read-only panel
- [x] `users-list.png` — Users list
- [x] `users-add-dialog.png` — add user dialog
- [x] `users-role-change.png` — inline role change menu / confirm
- [x] `users-disable-confirm.png` — disable user confirmation
- [-] `users-new-toast.png` — new-user creation toast (with password)

### Label printing (Phase 7 preview)
- Skip for now — feature not built. Will list when scope is finalized.

### Troubleshooting
- [-] `troubleshoot-stale-cache.png` — example of stale build behavior
- [-] `troubleshoot-pull-to-refresh.png` — pull-to-refresh on mobile preview
