-- DOSS-004: Trigger dossier update when meeting summary completes
-- Uses pg_net to call the update-deal-dossier edge function when
-- a meeting's summary_status transitions to 'complete'.

-- Trigger function: fire pg_net HTTP POST to update-deal-dossier
CREATE OR REPLACE FUNCTION public.notify_dossier_on_meeting_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only fire when summary_status changes TO 'complete'
  IF NEW.summary_status = 'complete' AND
     (OLD.summary_status IS NULL OR OLD.summary_status != 'complete') THEN

    v_url := get_system_config('supabase_url') || '/functions/v1/update-deal-dossier';

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key';

    IF v_service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object('meeting_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to meetings table
DROP TRIGGER IF EXISTS trg_dossier_meeting_summary ON public.meetings;
CREATE TRIGGER trg_dossier_meeting_summary
  AFTER UPDATE OF summary_status ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_dossier_on_meeting_summary();
