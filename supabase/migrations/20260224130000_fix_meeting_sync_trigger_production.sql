-- =============================================================================
-- Fix meeting sync trigger for production
-- =============================================================================
-- The original trigger (20260217100000) had the staging URL hardcoded.
-- The owner_user_id patch (20260218000000_sync_trigger_add_owner_user_id)
-- was never applied to production due to a duplicate timestamp conflict.
-- This migration corrects both issues.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_meeting_to_railway()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text := 'https://ygdpgliavpxeugaajgrb.supabase.co';
  service_role_key text;
  request_id bigint;
BEGIN
  -- Only fire when transcript_text is present and was just added/changed
  IF NEW.transcript_text IS NULL OR NEW.transcript_text = '' THEN
    RETURN NEW;
  END IF;

  -- For UPDATE, only fire if transcript_text actually changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.transcript_text IS NOT DISTINCT FROM NEW.transcript_text THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get service role key from vault
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'sync_meeting_to_railway: service_role not found in vault, skipping sync for meeting %', NEW.id;
    RETURN NEW;
  END IF;

  -- Call meeting-analytics edge function via pg_net (async, non-blocking)
  BEGIN
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/meeting-analytics/api/sync/meeting',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', 'meetings',
        'schema', 'public',
        'record', jsonb_build_object(
          'id', NEW.id,
          'title', NEW.title,
          'transcript_text', NEW.transcript_text,
          'meeting_start', NEW.meeting_start,
          'duration_minutes', NEW.duration_minutes,
          'owner_user_id', NEW.owner_user_id
        )
      )
    ) INTO request_id;

    RAISE LOG 'sync_meeting_to_railway: queued sync for meeting %, request_id: %', NEW.id, request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Don't block the original INSERT/UPDATE if sync fails
    RAISE WARNING 'sync_meeting_to_railway: pg_net call failed for meeting %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Recreate trigger (DROP IF EXISTS so it's idempotent)
DROP TRIGGER IF EXISTS trigger_sync_meeting_to_railway ON public.meetings;

CREATE TRIGGER trigger_sync_meeting_to_railway
  AFTER INSERT OR UPDATE OF transcript_text
  ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_meeting_to_railway();
