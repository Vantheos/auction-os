import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, time, jsonb, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['admin', 'office', 'warehouse']);
export const lotStateEnum = pgEnum('lot_state', ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable']);
export const photoStatusEnum = pgEnum('photo_status', ['pending', 'uploaded', 'failed']);
export const aiRunStatusEnum = pgEnum('ai_run_status', ['success', 'partial', 'failure']);
export const specialNotesCategoryEnum = pgEnum('special_notes_category', ['None', 'TOOL ONLY', 'READ', 'CLOTHING']);
export const conditionEnum = pgEnum('condition', ['used']); // single value in v1; vocab expanded post-v1
// Phase 4 Area 3: replaced by `ai_schedule_interval_hours` integer column
// (see migration 0010). Enum kept removed from the schema.
export const auditChangeTypeEnum = pgEnum('audit_change_type', ['insert', 'update', 'delete']);
// Phase 3: tags how a lot got into the system. `cataloging` (default) goes
// through the mobile capture flow and must have ≥1 photo (enforced by
// deferrable trigger in 0008). `imported` is reserved for future bulk
// import paths (Amazon returns spreadsheets, etc.) which create photo-less
// lots and allow photos to be added later.
export const lotSourceEnum = pgEnum('lot_source', ['cataloging', 'imported']);

// ── app_user (mirrors auth.users) ────────────────────────────────────────
export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().notNull(), // FK to auth.users.id, enforced by trigger
  role: roleEnum('role').notNull(),
  displayName: text('display_name').notNull(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── customer ─────────────────────────────────────────────────────────────
export const customer = pgTable('customer', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Phase 5: AF360 SellerCode for this consignor. DB-nullable; the
  // application layer enforces required-ness at create + at export. Existing
  // customers carry NULL until admin updates them via the edit UI.
  sellerCode: text('seller_code'),
  // Phase 5: soft-deactivation marker (mirrors app_user.disabled_at).
  // Disabled customers are hidden from cataloging picker and new-job flow.
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── job ──────────────────────────────────────────────────────────────────
export const job = pgTable('job', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customer.id, { onDelete: 'restrict' }),
  jobNumber: text('job_number').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  // Phase 5: Job-level export defaults. AF360 StartBid (required column;
  // currency) and Shippable (boolean). Both have DB defaults so existing
  // rows are valid post-migration.
  startBid: numeric('start_bid', { precision: 10, scale: 2 }).notNull().default('5.00'),
  shippable: boolean('shippable').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uniq_customer_job_number').on(t.customerId, t.jobNumber),
]);

// ── lot ──────────────────────────────────────────────────────────────────
export const lot = pgTable('lot', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => job.id, { onDelete: 'restrict' }),
  lotNumber: integer('lot_number'),
  quantity: integer('quantity'),
  title: text('title'),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }),
  condition: conditionEnum('condition').notNull().default('used'),
  ref1: text('ref1'),
  ref2: text('ref2'),
  specialNotesCategory: specialNotesCategoryEnum('special_notes_category').notNull().default('None'),
  specialNotesText: text('special_notes_text'),
  untested: boolean('untested').notNull().default(false),
  state: lotStateEnum('state').notNull().default('assigned'),
  source: lotSourceEnum('source').notNull().default('cataloging'),
  lastAiRunStatus: aiRunStatusEnum('last_ai_run_status'),
  lastAiRunError: text('last_ai_run_error'),
  intakeOperatorId: uuid('intake_operator_id').notNull().references(() => appUser.id),
  intakeTimestamp: timestamp('intake_timestamp', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Partial unique index: enforce (job_id, lot_number) uniqueness only when both are NOT NULL
  uniqueIndex('uniq_job_lot_number').on(t.jobId, t.lotNumber).where(sql`${t.jobId} IS NOT NULL`),
  // CHECK: state ∈ {assigned, sold, picked-up} requires job_id and lot_number; state ∈ {unassigned, not-sellable} requires both null
  check('state_tuple_consistent', sql`(
    (${t.state} IN ('assigned','sold','picked-up') AND ${t.jobId} IS NOT NULL AND ${t.lotNumber} IS NOT NULL)
    OR
    (${t.state} IN ('unassigned','not-sellable') AND ${t.jobId} IS NULL AND ${t.lotNumber} IS NULL)
  )`),
]);

// ── lot_photo ────────────────────────────────────────────────────────────
export const lotPhoto = pgTable('lot_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  lotId: uuid('lot_id').notNull().references(() => lot.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  displayOrder: integer('display_order').notNull(),
  status: photoStatusEnum('status').notNull().default('pending'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  capturedBy: uuid('captured_by').notNull().references(() => appUser.id),
});

// ── system_settings (singleton) ──────────────────────────────────────────
export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().notNull().default(1),
  aiScheduleEnabled: boolean('ai_schedule_enabled').notNull().default(true),
  aiScheduleIntervalHours: integer('ai_schedule_interval_hours').notNull().default(24),
  aiScheduleTimeOfDay: time('ai_schedule_time_of_day').notNull().default('23:00:00'),
  aiLastRunAt: timestamp('ai_last_run_at', { withTimezone: true }),
  labelPrinterHelperUrl: text('label_printer_helper_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('system_settings_singleton', sql`${t.id} = 1`),
]);

// ── audit_log ────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id').notNull(),
  changeType: auditChangeTypeEnum('change_type').notNull(),
  changedFields: jsonb('changed_fields').notNull(),
  changedBy: uuid('changed_by').references(() => appUser.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
