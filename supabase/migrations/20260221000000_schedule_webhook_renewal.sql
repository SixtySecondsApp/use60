-- Schedule daily Google Calendar webhook channel auto-renewal
-- Channels expire after 7 days. This cron finds channels expiring within 2 days
-- and fires async HTTP requests via pg_net to the google-calendar edge function.

-- Helper function: find expiring channels and queue renewal calls via pg_net
CREATE OR REPLACE FUNCTION public.renew_expiring_calendar_webhooks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expiring RECORD;
  queued_count int := 0;
  skipped_count int := 0;
  max_per_run int := 20;
  supabase_url text;
  service_key text;
  result jsonb;
BEGIN
  -- Read runtime config
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key  := current_setting('app.settings.service_role_key', true);

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Missing app.settings.supabase_url or app.settings.service_role_key',
      'queued', 0
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
    WHERE gcc.is_active = true
      AND gcc.expiration_time < (NOW() + INTERVAL '2 days')
      AND gcc.expiration_time > NOW()
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
      -- Fire async HTTP POST via pg_net (non-blocking)
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/google-calendar',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || service_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'action', 'watch',
          'userId', expiring.user_id::text,
          'calendarId', COALESCE(expiring.calendar_id, 'primary'),
          'channelId', 'auto-renew-' || gen_random_uuid()::text,
          'webhookUrl', expiring.webhook_url
        )
      );

      -- Optimistically deactivate the old channel.
      -- The edge function will create the replacement; if it fails the user
      -- simply loses push-notification sync until the next daily run.
      UPDATE google_calendar_channels
      SET is_active = false,
          updated_at = NOW()
      WHERE id = expiring.channel_row_id;

      queued_count := queued_count + 1;

    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
      RAISE WARNING '[webhook-renewal] Exception for user %: %', expiring.user_id, SQLERRM;
    END;
  END LOOP;

  result := jsonb_build_object(
    'success', true,
    'queued', queued_count,
    'skipped', skipped_count,
    'run_at', NOW()
  );

  RAISE NOTICE '[webhook-renewal] Complete: %', result;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.renew_expiring_calendar_webhooks() IS
  'Finds Google Calendar webhook channels expiring within 2 days and queues renewal calls via pg_net to the google-calendar edge function. Max 20 per run.';

-- Schedule: daily at 3 AM UTC
SELECT cron.schedule(
  'renew-calendar-webhooks',
  '0 3 * * *',
  $$SELECT public.renew_expiring_calendar_webhooks()$$
);
