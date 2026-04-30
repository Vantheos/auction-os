CREATE TYPE "public"."ai_run_status" AS ENUM('success', 'partial', 'failure');--> statement-breakpoint
CREATE TYPE "public"."ai_schedule_frequency" AS ENUM('hourly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."audit_change_type" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."condition" AS ENUM('used');--> statement-breakpoint
CREATE TYPE "public"."lot_state" AS ENUM('assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('pending', 'uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'office', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."special_notes_category" AS ENUM('None', 'TOOL ONLY', 'READ', 'CLOTHING');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"display_name" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"change_type" "audit_change_type" NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"job_number" text NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"lot_number" integer,
	"quantity" integer,
	"title" text,
	"description" text,
	"price" numeric(10, 2),
	"condition" "condition" DEFAULT 'used' NOT NULL,
	"ref1" text,
	"ref2" text,
	"special_notes_category" "special_notes_category" DEFAULT 'None' NOT NULL,
	"special_notes_text" text,
	"untested" boolean DEFAULT false NOT NULL,
	"state" "lot_state" DEFAULT 'assigned' NOT NULL,
	"last_ai_run_status" "ai_run_status",
	"last_ai_run_error" text,
	"intake_operator_id" uuid NOT NULL,
	"intake_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_tuple_consistent" CHECK ((
    ("lot"."state" IN ('assigned','sold','picked-up') AND "lot"."job_id" IS NOT NULL AND "lot"."lot_number" IS NOT NULL)
    OR
    ("lot"."state" IN ('unassigned','not-sellable') AND "lot"."job_id" IS NULL AND "lot"."lot_number" IS NULL)
  ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lot_photo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"display_order" integer NOT NULL,
	"status" "photo_status" DEFAULT 'pending' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ai_schedule_enabled" boolean DEFAULT true NOT NULL,
	"ai_schedule_frequency" "ai_schedule_frequency" DEFAULT 'daily' NOT NULL,
	"ai_schedule_time_of_day" time DEFAULT '23:00:00' NOT NULL,
	"ai_last_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_singleton" CHECK ("system_settings"."id" = 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_app_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job" ADD CONSTRAINT "job_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot" ADD CONSTRAINT "lot_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot" ADD CONSTRAINT "lot_intake_operator_id_app_user_id_fk" FOREIGN KEY ("intake_operator_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot_photo" ADD CONSTRAINT "lot_photo_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lot_photo" ADD CONSTRAINT "lot_photo_captured_by_app_user_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_customer_job_number" ON "job" USING btree ("customer_id","job_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_job_lot_number" ON "lot" USING btree ("job_id","lot_number") WHERE "lot"."job_id" IS NOT NULL;