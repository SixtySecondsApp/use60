-- Fix: CASE types jsonb and text cannot be matched (42804)
-- The trigger_auto_record_for_new_event() function has a CASE expression
-- where one branch returns TEXT (elem->>'email') and the other returns JSONB (elem).
-- PostgreSQL cannot reconcile these types. Fix by casting both branches to TEXT.

CREATE OR REPLACE FUNCTION "public"."trigger_auto_record_for_new_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  org_settings jsonb;
  auto_record_enabled boolean;
  auto_record_external_only boolean;
  auto_record_lead_time_minutes integer;
  company_domain text;
  has_external boolean;
  attendee_email text;
  supabase_url text;
  service_role_key text;
  request_id bigint;
  minutes_until_start integer;
BEGIN
  -- Only process events with meeting URLs
  IF NEW.meeting_url IS NULL OR NEW.meeting_url = '' THEN
    RETURN NEW;
  END IF;

  -- Only process events starting in the future
  IF NEW.start_time <= NOW() THEN
    RETURN NEW;
  END IF;

  -- Get org settings
  SELECT
    o.recording_settings,
    o.company_domain
  INTO org_settings, company_domain
  FROM organizations o
  WHERE o.id = NEW.org_id;

  -- Check if auto-record is enabled
  auto_record_enabled := COALESCE((org_settings->>'auto_record_enabled')::boolean, false);
  IF NOT auto_record_enabled THEN
    RETURN NEW;
  END IF;

  -- Get configuration
  auto_record_external_only := COALESCE((org_settings->>'auto_record_external_only')::boolean, true);
  auto_record_lead_time_minutes := COALESCE((org_settings->>'auto_record_lead_time_minutes')::integer, 2);

  -- Check if external-only is enabled
  IF auto_record_external_only AND company_domain IS NOT NULL THEN
    -- Check attendees for external participants
    has_external := false;

    IF NEW.attendees IS NOT NULL THEN
      FOR attendee_email IN
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(NEW.attendees) = 'array' THEN
              (SELECT jsonb_agg(
                CASE
                  WHEN jsonb_typeof(elem) = 'object' THEN to_jsonb(elem->>'email')
                  ELSE elem
                END
              ) FROM jsonb_array_elements(NEW.attendees) AS elem)
            ELSE '[]'::jsonb
          END
        )
      LOOP
        -- Check if this attendee is external (not matching company domain)
        IF attendee_email IS NOT NULL
           AND attendee_email NOT LIKE '%@' || company_domain
           AND attendee_email NOT LIKE '%.' || company_domain THEN
          has_external := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT has_external THEN
      -- No external attendees, skip recording
      RETURN NEW;
    END IF;
  END IF;

  -- Calculate minutes until meeting starts
  minutes_until_start := EXTRACT(EPOCH FROM (NEW.start_time - NOW())) / 60;

  -- Only trigger if meeting is within the next hour (cron handles farther out meetings)
  -- This prevents unnecessary API calls for meetings scheduled far in advance
  IF minutes_until_start > 60 THEN
    RETURN NEW;
  END IF;

  -- Queue the bot deployment via pg_net
  -- Get service role key from vault
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    -- Can't deploy without service role key, let cron job handle it
    RAISE WARNING 'Auto-record trigger: service_role_key not found in vault';
    RETURN NEW;
  END IF;

  -- Get Supabase URL
  supabase_url := 'https://' ||
    regexp_replace(current_database(), '^postgres_', '') ||
    '.supabase.co';

  -- Call deploy-recording-bot edge function
  BEGIN
    SELECT extensions.http_post(
      url := supabase_url || '/functions/v1/deploy-recording-bot',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key,
        'x-user-id', NEW.user_id::text
      ),
      body := jsonb_build_object(
        'meeting_url', NEW.meeting_url,
        'meeting_title', COALESCE(NEW.title, 'Meeting'),
        'calendar_event_id', NEW.id::text
      )
    ) INTO request_id;

    RAISE LOG 'Auto-record triggered for event %, request_id: %', NEW.id, request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Don't fail the insert if the bot deployment fails
    RAISE WARNING 'Failed to trigger auto-record for event %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
