-- Migration: brain_calendar_meeting_event_triggers
-- Date: 20260313142155
--
-- What this migration does:
--   Creates PG triggers on calendar_events (INSERT) and meetings (UPDATE)
--   that invoke agent-trigger edge function via pg_net.
--   Calendar: fires when new event has external attendees (attendees_count > 0).
--   Meetings: fires when summary_status transitions to 'complete' or recording appears.
--
-- Rollback strategy:
--   DROP TRIGGER IF EXISTS brain_calendar_event_created_trigger ON calendar_events;
--   DROP TRIGGER IF EXISTS brain_meeting_completed_trigger ON meetings;
--   DROP FUNCTION IF EXISTS _brain_trigger_calendar_event_created();
--   DROP FUNCTION IF EXISTS _brain_trigger_meeting_completed();

-- Trigger function: calendar_event_created (external attendees)
CREATE OR REPLACE FUNCTION _brain_trigger_calendar_event_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
  _org_id UUID;
BEGIN
  -- Only fire for events with attendees (external meetings)
  IF COALESCE(NEW.attendees_count, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Skip AI-generated events to prevent loops
  IF NEW.ai_generated = true THEN
    RETURN NEW;
  END IF;

  -- Resolve org_id: calendar_events may have org_id directly
  _org_id := NEW.org_id;
  IF _org_id IS NULL THEN
    -- Fallback: look up org from user's membership
    SELECT om.org_id INTO _org_id
    FROM public.organization_memberships om
    WHERE om.user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RAISE WARNING '[brain] Missing credentials for calendar_event_created trigger';
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'calendar_event_created',
    'organization_id', _org_id,
    'user_id', NEW.user_id,
    'payload', jsonb_build_object(
      'event_id', NEW.id,
      'title', NEW.title,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'attendees_count', NEW.attendees_count,
      'meeting_url', NEW.meeting_url,
      'deal_id', NEW.deal_id,
      'calendar_id', NEW.calendar_id
    )
  );

  PERFORM net.http_post(
    url := _creds.supabase_url || '/functions/v1/agent-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _creds.service_role_key,
      'x-internal-call', 'true'
    ),
    body := _payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[brain] calendar_event_created trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger function: meeting_completed
CREATE OR REPLACE FUNCTION _brain_trigger_meeting_completed()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _creds RECORD;
  _payload JSONB;
  _org_id UUID;
  _summary_changed BOOLEAN;
  _recording_appeared BOOLEAN;
BEGIN
  -- Fire when summary_status transitions to 'complete'
  _summary_changed := (
    OLD.summary_status IS DISTINCT FROM NEW.summary_status
    AND NEW.summary_status = 'complete'
  );

  -- Or when share_url / calls_url first appears (recording ready)
  _recording_appeared := (
    OLD.share_url IS NULL AND NEW.share_url IS NOT NULL
  );

  IF NOT _summary_changed AND NOT _recording_appeared THEN
    RETURN NEW;
  END IF;

  _org_id := COALESCE(NEW.org_id, NEW.clerk_org_id::uuid);
  IF _org_id IS NULL THEN
    -- Fallback: look up org from owner
    SELECT om.org_id INTO _org_id
    FROM public.organization_memberships om
    WHERE om.user_id = NEW.owner_user_id
    LIMIT 1;
  END IF;

  IF _org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _creds FROM public._brain_get_credentials();

  IF _creds.supabase_url IS NULL OR _creds.service_role_key IS NULL THEN
    RAISE WARNING '[brain] Missing credentials for meeting_completed trigger';
    RETURN NEW;
  END IF;

  _payload := jsonb_build_object(
    'event', 'meeting_completed',
    'organization_id', _org_id,
    'user_id', NEW.owner_user_id,
    'payload', jsonb_build_object(
      'meeting_id', NEW.id,
      'title', NEW.title,
      'share_url', NEW.share_url,
      'summary', LEFT(NEW.summary, 500),
      'company_id', NEW.company_id,
      'primary_contact_id', NEW.primary_contact_id,
      'meeting_start', NEW.meeting_start,
      'meeting_end', NEW.meeting_end,
      'duration_minutes', NEW.duration_minutes,
      'source_type', NEW.source_type
    )
  );

  PERFORM net.http_post(
    url := _creds.supabase_url || '/functions/v1/agent-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _creds.service_role_key,
      'x-internal-call', 'true'
    ),
    body := _payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[brain] meeting_completed trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS brain_calendar_event_created_trigger ON calendar_events;
CREATE TRIGGER brain_calendar_event_created_trigger
  AFTER INSERT ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_calendar_event_created();

DROP TRIGGER IF EXISTS brain_meeting_completed_trigger ON meetings;
CREATE TRIGGER brain_meeting_completed_trigger
  AFTER UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION _brain_trigger_meeting_completed();
