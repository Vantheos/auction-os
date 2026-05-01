-- supabase/migrations/0006_system_settings_label_printer.sql
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS label_printer_helper_url text;
