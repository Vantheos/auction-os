-- Trigger function: write a row to audit_log on any insert/update/delete
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_change_type audit_change_type;
  v_record_id uuid;
  v_changed jsonb;
BEGIN
  -- Identify the actor from the JWT subject; null on system inserts
  v_actor := NULLIF(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  IF TG_OP = 'INSERT' THEN
    v_change_type := 'insert';
    v_record_id := (row_to_json(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_change_type := 'update';
    v_record_id := (row_to_json(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'delete';
    v_record_id := (row_to_json(OLD)->>'id')::uuid;
    v_changed := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, change_type, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, v_record_id, v_change_type, v_changed, v_actor);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to tracked tables
CREATE TRIGGER audit_lot       AFTER INSERT OR UPDATE OR DELETE ON public.lot       FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_customer  AFTER INSERT OR UPDATE OR DELETE ON public.customer  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_job       AFTER INSERT OR UPDATE OR DELETE ON public.job       FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_app_user  AFTER INSERT OR UPDATE OR DELETE ON public.app_user  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
