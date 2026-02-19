-- Fix: renew_expiring_calendar_webhooks() silent failure
--
-- The original function (20260221000000_schedule_webhook_renewal.sql) reads
-- app.settings.supabase_url and app.settings.service_role_key via
-- current_setting(), but nothing initialises these settings. This causes the
-- daily Google Calendar webhook renewal cron job to silently exit early every
-- single run (the NULL guard returns false immediately).
--
-- Fix approach (matches existing codebase patterns):
--   1. Service role key → read from vault.decrypted_secrets (same as
--      call_fathom_token_refresh and call_proactive_edge_function).
--      NEVER hardcode secrets in migrations.
--   2. Supabase URL → COALESCE(current_setting('app.settings.supabase_url', true), hardcoded fallback)
--      (same as call_fathom_token_refresh pattern).
--   3. All failure paths → INSERT into public.cron_job_logs so failures are
--      visible instead of silent. Individual channel errors use RAISE WARNING
--      (already present) plus a log row.
--   4. The cron schedule (already registered by the original migration) is
--      left unchanged — we just replace the function body.

CREATE OR REPLACE FUNCTION public.renew_expiring_calendar_webhooks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expiring      RECORD;
  queued_count  int  := 0;
  skipped_count int  := 0;
  max_per_run   int  := 20;
  supabase_url  text;
  service_key   text;
  result        jsonb;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Resolve Supabase URL
  --    Prefer the database-level setting; fall back to the known
  --    project URL so the function still works on environments where
  --    the setting has not been configured via ALTER DATABASE.
  --    Production ref: ygdpgliavpxeugaajgrb
  --    Staging ref:    caerqjzvuerejfrdtygb
  -- ----------------------------------------------------------------
  supabase_url := COALESCE(
    NULLIF(current_setting('app.settings.supabase_url', true), ''),
    'https://ygdpgliavpxeugaajgrb.supabase.co'
  );

  -- ----------------------------------------------------------------
  -- 2. Resolve service role key from Vault (never hardcoded)
  --    Add the secret in the Supabase Dashboard:
  --    Settings > Vault > New secret, name = "service_role_key"
  -- ----------------------------------------------------------------
  SELECT decrypted_secret
    INTO service_key
    FROM vault.decrypted_secrets
   WHERE name = 'service_role_key'
   LIMIT 1;

  IF service_key IS NULL THEN
    result := jsonb_build_object(
      'success', false,
      'error',   'Vault secret "service_role_key" not found. Add it in Supabase Dashboard > Settings > Vault.',
      'queued',  0
    );

    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES ('renew-calendar-webhooks', 'error', result->>'error');

    RAISE WARNING '[webhook-renewal] %', result->>'error';
    RETURN result;
  END IF;

  -- ----------------------------------------------------------------
  -- 3. Find channels expiring within 2 days and queue renewal calls
  -- ----------------------------------------------------------------
  FOR expiring IN
    SELECT
      gcc.id            AS channel_row_id,
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
        SELECT 1
          FROM google_integrations gi
         WHERE gi.user_id    = gcc.user_id
           AND gi.is_active  = true
           AND gi.token_status = 'valid'
      )
    ORDER BY gcc.expiration_time ASC
    LIMIT max_per_run
  LOOP
    BEGIN
      -- Fire async HTTP POST via pg_net (non-blocking)
      PERFORM net.http_post(
        url     := supabase_url || '/functions/v1/google-calendar',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || service_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'action',     'watch',
          'userId',     expiring.user_id::text,
          'calendarId', COALESCE(expiring.calendar_id, 'primary'),
          'channelId',  'auto-renew-' || gen_random_uuid()::text,
          'webhookUrl', expiring.webhook_url
        )
      );

      -- Optimistically deactivate the old channel.
      -- The edge function will create the replacement; if it fails the user
      -- simply loses push-notification sync until the next daily run.
      UPDATE google_calendar_channels
         SET is_active  = false,
             updated_at = NOW()
       WHERE id = expiring.channel_row_id;

      queued_count := queued_count + 1;

    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
      RAISE WARNING '[webhook-renewal] Exception for user %: %', expiring.user_id, SQLERRM;

      -- Log individual channel failures so they are visible in the audit trail
      INSERT INTO public.cron_job_logs (job_name, status, message, error_details)
      VALUES (
        'renew-calendar-webhooks',
        'error',
        'Channel renewal failed for user ' || expiring.user_id::text,
        SQLERRM
      );
    END;
  END LOOP;

  -- ----------------------------------------------------------------
  -- 4. Log the run summary and return
  -- ----------------------------------------------------------------
  result := jsonb_build_object(
    'success', true,
    'queued',  queued_count,
    'skipped', skipped_count,
    'run_at',  NOW()
  );

  INSERT INTO public.cron_job_logs (job_name, status, message)
  VALUES (
    'renew-calendar-webhooks',
    'triggered',
    'Webhook renewal complete — queued: ' || queued_count || ', skipped: ' || skipped_count
  );

  RAISE NOTICE '[webhook-renewal] Complete: %', result;
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.renew_expiring_calendar_webhooks() IS
  'Finds Google Calendar webhook channels expiring within 2 days and queues renewal '
  'calls via pg_net to the google-calendar edge function. Max 20 per run. '
  'Reads service_role_key from vault.decrypted_secrets (never hardcoded). '
  'Logs all outcomes to public.cron_job_logs.';
