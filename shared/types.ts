// shared/types.ts
export type CustomerDTO = {
  id: string;
  name: string;
  // Phase 5: AF360 SellerCode (per-Customer). Nullable for existing customers
  // until admin updates via Customer edit UI.
  sellerCode: string | null;
  // Phase 5: soft-deactivation marker (mirrors app_user.disabledAt).
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerRequest = {
  name: string;
  sellerCode: string;
};

export type UpdateCustomerRequest = Partial<{
  name: string;
  sellerCode: string;
  disabled: boolean;
}>;

// ── Job ──────────────────────────────────────────────────────────────────
// Moved from src/hooks/useJobs.ts in Phase 5 (DTO consolidation — matches
// where CustomerDTO and others live).
export type JobDTO = {
  id: string;
  customerId: string;
  jobNumber: string;
  closedAt: string | null;
  // Phase 5: Job-level export defaults. Numeric serialized as string by
  // Drizzle/Postgres for the CSV pipeline.
  startBid: string;
  shippable: boolean;
  // Counts powering the AF360 export button gate. Computed server-side
  // by GET /api/jobs/:id; optional because the list endpoint doesn't
  // compute them (would be N+1 on the jobs list page).
  // - assignedLotCount: lots in 'assigned' state.
  // - totalLotCount: lots in any state (job's full size).
  // - exportReadyLotCount: lots that are 'assigned' AND have title +
  //   description + price all populated. Button enables only when
  //   totalLotCount > 0 AND exportReadyLotCount === totalLotCount.
  assignedLotCount?: number;
  totalLotCount?: number;
  exportReadyLotCount?: number;
  // Number of gaps in this job's lot_number sequence (positions in
  // [10..MAX] with no lot — created by deletes / outbound moves /
  // unassigns). 0 = sequential. Surfaces in the export-prep modal
  // alongside a Compact action.
  lotNumberGapCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobRequest = {
  customerId: string;
  jobNumber: string;
  startBid?: string;
  shippable?: boolean;
};

export type UpdateJobRequest = Partial<{
  jobNumber: string;
  startBid: string;
  shippable: boolean;
  closed: boolean;
}>;

// ── Auction platform export ──────────────────────────────────────────────
// Phase 5: response shapes for the two-step export endpoint.

export type ExportBatchPlanItem = {
  batchNum: number;
  lotIds: string[];
};

export type ExportStartResponse = {
  csv: string;
  csvFilename: string;
  batchSize: number;
  totalBatches: number;
  totalLots: number;
  batches: ExportBatchPlanItem[];
  exportLabel: string;
};

export type ExportBatchRequest = {
  batchNum: number;
  lotIds: string[];
  exportLabel: string;
  totalBatches: number;
};

export type ExportBatchResponse = {
  downloadUrl: string;
  expiresAt: string;
  batchNum: number;
  totalBatches: number;
  filename: string;
  photoCount: number;
};

export type ApiError = { error: { code: string; message: string } };

export type UserRole = 'admin' | 'office' | 'warehouse';

export type UserDTO = {
  id: string;
  role: UserRole;
  displayName: string;
  email: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserRequest = {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
};

export type UpdateUserRequest = Partial<{
  role: UserRole;
  displayName: string;
  disabled: boolean;
}>;

export type LotState = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable';
export type LotSource = 'cataloging' | 'imported';

export type LotDTO = {
  id: string;
  jobId: string | null;
  customerId: string | null;        // resolved server-side via job join
  customerName: string | null;
  jobNumber: string | null;
  lotNumber: number | null;
  quantity: number;                 // NOT NULL DEFAULT 1 since migration 0012 (Phase 6)
  title: string | null;
  description: string | null;
  price: string | null;             // numeric serialized as string
  condition: 'used';
  ref1: string | null;
  ref2: string | null;
  specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText: string | null;
  untested: boolean;
  state: LotState;
  source: LotSource;
  lastAiRunStatus: 'success' | 'partial' | 'failure' | null;
  lastAiRunError: string | null;
  aiProcessingStartedAt: string | null;
  labelReprintNeeded: boolean;
  intakeOperatorId: string;
  intakeTimestamp: string;
  createdAt: string;
  updatedAt: string;
  // Phase 3: cover thumbnail signed URL (only present on list responses)
  coverSignedUrl?: string | null;
};

export type LotPhotoDTO = {
  id: string;
  lotId: string;
  storagePath: string;
  displayOrder: number;
  status: 'pending' | 'uploaded' | 'failed';
  capturedAt: string;
  capturedBy: string;
  // Phase 3: signed read URL — present on GET responses for uploaded photos
  signedUrl?: string | null;
};

// Returned in CreateLotResponse.firstPhoto when the request included
// firstPhoto: { displayOrder: 1 }. Client uses uploadUrl to PUT the file.
export type CreatedFirstPhotoDTO = {
  id: string;
  lotId: string;
  storagePath: string;
  displayOrder: 1;
  status: 'pending';
  uploadUrl: string;
  token: string;
};

// Returned in POST /api/lots/[id]/photos for subsequent photos
export type CreatedPhotoDTO = LotPhotoDTO & {
  uploadUrl: string;
  token: string;
};

export type LotsListResponse = { lots: LotDTO[]; total: number };

export type CreateLotRequest = {
  jobId: string;
  quantity?: number;
  title?: string;
  description?: string;
  price?: string;
  ref1?: string;
  ref2?: string;
  specialNotesCategory?: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText?: string;
  untested?: boolean;
  // Phase 3: when present, the server creates the first lot_photo row in the
  // same transaction as the lot row and returns it (with a signed upload URL)
  // in CreateLotResponse.firstPhoto.
  firstPhoto?: { displayOrder: 1 };
};

export type CreateLotResponse = LotDTO & {
  firstPhoto?: CreatedFirstPhotoDTO | null;
};

export type SystemSettingsDTO = {
  id: 1;
  aiScheduleEnabled: boolean;
  // Hours between scheduled AI runs. UI exposes 4 / 8 / 12 / 24; server
  // accepts any positive int so future intervals don't need a migration.
  // Phase 4 Area 3 replaced the (hourly, daily) enum with this column.
  aiScheduleIntervalHours: number;
  aiScheduleTimeOfDay: string;
  aiLastRunAt: string | null;
  aiCostMtdCents: number;
  aiCostLifetimeCents: number;
  aiRunCountLifetime: number;
  aiCostMtdStartedAt: string;
  aiRunLockUntil: string | null;
  // True while a drain cycle is open across cron heartbeats. Set when a
  // scheduled or Run Now drain begins; cleared when the queue is fully
  // drained. The cron gate uses this to keep continuing across heartbeats
  // until empty, regardless of where on the schedule grid we are.
  aiDrainInProgress: boolean;
  // Count of lots eligible for AI processing right now: state in
  // ('assigned','unassigned') and last_ai_run_status IS NULL. Computed
  // server-side on each GET; rendered as a badge in Settings → AI → Schedule.
  aiPendingLotCount: number;
  labelPrinterHelperUrl: string | null;
  updatedAt: string;
};

export type UpdateSystemSettingsRequest = Partial<{
  aiScheduleEnabled: boolean;
  aiScheduleIntervalHours: number;
  aiScheduleTimeOfDay: string;
  labelPrinterHelperUrl: string | null;
}>;

// Phase 6: AI run endpoints
export type AiRunRequest = { lotId: string };
export type AiRunResponse = LotDTO;
export type AiBacklogResponse =
  | { processed: number; remaining: number; errors: number }
  | { skipped: true; reason: 'disabled' | 'too_soon' | 'in_progress' };
