-- =============================================================================
-- Add owner_user_id to sync_meeting_to_railway payload
-- =============================================================================
-- Runs after 20260217100000_meeting_sync_trigger.sql
-- Enables meeting-analytics to resolve org_id via organization_memberships
-- for multi-tenant scoping of Railway transcripts.
-- =============================================================================

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
  IF NEW.transcript_text IS NULL OR NEW.transcript_text = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.transcript_text IS NOT DISTINCT FROM NEW.transcript_text THEN
      RETURN NEW;
    END IF;
  END IF;

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
