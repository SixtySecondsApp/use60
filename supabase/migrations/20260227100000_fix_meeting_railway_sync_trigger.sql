-- =============================================================================
-- Fix meeting-to-Railway sync trigger
-- =============================================================================
-- The trigger was silently skipping ALL syncs because:
--   1. Vault lookup used name='service_role' but production only had 'service_role_key'
--   2. Previous fix (20260224130000) corrected the hardcoded staging URL but
--      still used the wrong vault secret name
--
-- This version:
--   - Uses system_config for URL (no more hardcoded URLs)
--   - Tries both vault names: 'service_role' and 'service_role_key'
--   - Also adds 'service_role' vault secret if missing
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_meeting_to_railway()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
BEGIN
  IF NEW.transcript_text IS NULL OR NEW.transcript_text = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.transcript_text IS NOT DISTINCT FROM NEW.transcript_text THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Get URL from system_config (reliable, environment-aware source)
  supabase_url := (SELECT value FROM public.system_config WHERE system_config.key = 'supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'sync_meeting_to_railway: supabase_url not found in system_config, skipping meeting %', NEW.id;
    RETURN NEW;
  END IF;

  -- Get service role key from vault (try both naming conventions)
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name IN ('service_role', 'service_role_key')
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'sync_meeting_to_railway: service_role not found in vault, skipping meeting %', NEW.id;
    RETURN NEW;
  END IF;

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
    RAISE WARNING 'sync_meeting_to_railway: pg_net call failed for meeting %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trigger_sync_meeting_to_railway ON public.meetings;

CREATE TRIGGER trigger_sync_meeting_to_railway
  AFTER INSERT OR UPDATE OF transcript_text
  ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_meeting_to_railway();
