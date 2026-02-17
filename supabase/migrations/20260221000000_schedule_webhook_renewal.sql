-- Schedule daily Google Calendar webhook channel auto-renewal
-- Channels expire after 7 days. This cron finds channels expiring within 2 days
-- and invokes the google-calendar edge function to create replacement channels.

-- Helper function: find expiring channels and call the edge function for renewal
CREATE OR REPLACE FUNCTION public.renew_expiring_calendar_webhooks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expiring RECORD;
  renewed_count int := 0;
  skipped_count int := 0;
  error_count int := 0;
  max_per_run int := 20;
  supabase_url text;
  service_key text;
  result jsonb;
  response extensions.http_response;
BEGIN
  -- Read runtime config (set via vault or app_settings)
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key  := current_setting('app.settings.service_role_key', true);

  -- If config is not available, try environment-based approach via net._http_response
  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Missing app.settings.supabase_url or app.settings.service_role_key',
      'renewed', 0
    );
  END IF;

  FOR expiring IN
    SELECT
      gcc.id AS channel_row_id,
      gcc.user_id,
      gcc.org_id,
      gcc.channel_id,
      gcc.resource_id,
      gcc.calendar_id,
      gcc.webhook_url,
      gcc.expiration_time
    FROM google_calendar_channels gcc
    -- Only active channels expiring within 2 days
    WHERE gcc.is_active = true
      AND gcc.expiration_time < (NOW() + INTERVAL '2 days')
      AND gcc.expiration_time > NOW()  -- Not already expired
    -- Only for users with active Google integration
    AND EXISTS (
      SELECT 1 FROM google_integrations gi
      WHERE gi.user_id = gcc.user_id
        AND gi.is_active = true
        AND gi.token_status = 'valid'
    )
    ORDER BY gcc.expiration_time ASC
    LIMIT max_per_run
  LOOP
    BEGIN
      -- Call the google-calendar edge function with action: 'watch'
      SELECT * INTO response FROM extensions.http((
        'POST',
        supabase_url || '/functions/v1/google-calendar',
        ARRAY[
          extensions.http_header('Authorization', 'Bearer ' || service_key),
          extensions.http_header('Content-Type', 'application/json')
        ],
        'application/json',
        jsonb_build_object(
          'action', 'watch',
          'userId', expiring.user_id::text,
          'calendarId', COALESCE(expiring.calendar_id, 'primary'),
          'channelId', 'auto-renew-' || gen_random_uuid()::text,
          'webhookUrl', expiring.webhook_url
        )::text
      )::extensions.http_request);

      IF response.status_code BETWEEN 200 AND 299 THEN
        -- Deactivate the old channel (new one was created by the edge function)
        UPDATE google_calendar_channels
        SET is_active = false,
            updated_at = NOW()
        WHERE id = expiring.channel_row_id;

        renewed_count := renewed_count + 1;
      ELSE
        error_count := error_count + 1;
        RAISE WARNING '[webhook-renewal] Failed for user %, channel %: HTTP %',
          expiring.user_id, expiring.channel_id, response.status_code;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING '[webhook-renewal] Exception for user %: %', expiring.user_id, SQLERRM;
    END;
  END LOOP;

  result := jsonb_build_object(
    'success', true,
    'renewed', renewed_count,
    'skipped', skipped_count,
    'errors', error_count,
    'run_at', NOW()
  );

  RAISE NOTICE '[webhook-renewal] Complete: %', result;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.renew_expiring_calendar_webhooks() IS
  'Finds Google Calendar webhook channels expiring within 2 days and creates replacement channels via the google-calendar edge function. Max 20 renewals per run.';

-- Schedule: daily at 3 AM UTC
SELECT cron.schedule(
  'renew-calendar-webhooks',
  '0 3 * * *',
  $$SELECT public.renew_expiring_calendar_webhooks()$$
);
