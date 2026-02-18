-- =============================================================================
-- Meeting Sync Trigger: Auto-sync meetings to Railway PostgreSQL
-- =============================================================================
-- When a meeting gets transcript_text (INSERT or UPDATE), fires a pg_net
-- request to the meeting-analytics edge function which upserts the transcript
-- and generates embeddings in Railway PostgreSQL.
--
-- Prerequisites:
--   - pg_net extension (already enabled)
--   - service_role stored in Supabase Vault
--     (Dashboard > Settings > Vault > name: "service_role")
-- =============================================================================

-- Trigger function: calls meeting-analytics edge function /api/sync/meeting
CREATE OR REPLACE FUNCTION public.sync_meeting_to_railway()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url text := 'https://caerqjzvuerejfrdtygb.supabase.co';
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
          'duration_minutes', NEW.duration_minutes
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

COMMENT ON FUNCTION public.sync_meeting_to_railway() IS
'Trigger function that syncs meetings with transcript_text to Railway PostgreSQL
via the meeting-analytics edge function. Runs asynchronously via pg_net so it
does not block the original INSERT/UPDATE.

The edge function parses the transcript, creates segments, generates embeddings,
and stores everything in Railway PostgreSQL for vector search and analytics.

SETUP REQUIRED:
Add service_role to vault: Dashboard > Settings > Vault > New Secret
  Name: service_role
  Value: <your project service role key>';

-- Create the trigger on the meetings table
DROP TRIGGER IF EXISTS trigger_sync_meeting_to_railway ON public.meetings;

CREATE TRIGGER trigger_sync_meeting_to_railway
  AFTER INSERT OR UPDATE OF transcript_text
  ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_meeting_to_railway();
