-- =============================================================================
-- Fix all cron wrapper functions to use correct URL resolution and HTTP function
-- =============================================================================
-- Problem: Many functions use broken URL resolution methods on production:
--   1. current_database() returns 'postgres' (not 'postgres_<ref>'), producing wrong URL
--   2. current_setting('app.settings.supabase_url') is empty (GUC not configured)
--   3. Some functions use extensions.http_post or bare http_post which don't exist
--   4. get_system_config() had search_path="" so couldn't find system_config table
--   5. call_proactive_edge_function() was missing (used by 7+ cron functions)
--
-- Fix: All functions now use get_system_config('supabase_url') + net.http_post
-- =============================================================================

-- 0. Fix get_system_config: had empty search_path, couldn't find system_config table
CREATE OR REPLACE FUNCTION public.get_system_config(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (SELECT value FROM public.system_config WHERE key = p_key);
END;
$$;

-- 0b. Recreate call_proactive_edge_function (missing on production, used by 7+ cron functions)
CREATE OR REPLACE FUNCTION public.call_proactive_edge_function(function_name TEXT, payload JSONB DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get Supabase URL from system_config (reliable source)
  v_supabase_url := (SELECT value FROM public.system_config WHERE key = 'supabase_url');

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Vault secret service_role_key not found');
    RETURN;
  END IF;

  IF v_supabase_url IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Could not determine Supabase URL from system_config');
    RETURN;
  END IF;

  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := payload,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (function_name, 'triggered', 'Edge function called, request_id: ' || v_request_id, payload);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message)
  VALUES (function_name, 'error', 'Failed to call edge function: ' || SQLERRM);
END;
$$;

-- 1. call_auto_join_scheduler
-- Was: current_database() for URL + extensions.http_post (neither work)
CREATE OR REPLACE FUNCTION public.call_auto_join_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
BEGIN
  -- Get the Supabase URL from system_config
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'Auto-join scheduler: supabase_url not found in system_config';
    RETURN;
  END IF;

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
    RAISE WARNING 'Auto-join scheduler: service_role_key not found in vault';
    RETURN;
  END IF;

  -- Make HTTP request to edge function via pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/auto-join-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE LOG 'Auto-join scheduler called successfully, request_id: %', request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Auto-join scheduler failed: %', SQLERRM;
END;
$$;

-- 2. call_poll_s3_upload_queue
-- Was: current_setting('app.settings.supabase_url') + bare http_post
CREATE OR REPLACE FUNCTION public.call_poll_s3_upload_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Get URL from system_config
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'poll-s3-upload-queue: supabase_url not found in system_config';
    RETURN;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in vault';
  END IF;

  -- Call edge function via pg_net
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/poll-s3-upload-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Called poll-s3-upload-queue, request_id: %', request_id;
END;
$$;

-- 3. call_poll_transcription_queue
-- Was: current_setting('app.settings.supabase_url') + bare http_post
CREATE OR REPLACE FUNCTION public.call_poll_transcription_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'poll-transcription-queue: supabase_url not found in system_config';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in vault';
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/poll-transcription-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Called poll-transcription-queue, request_id: %', request_id;
END;
$$;

-- 4. call_update_s3_metrics
-- Was: current_setting('app.settings.supabase_url') + bare http_post
CREATE OR REPLACE FUNCTION public.call_update_s3_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'update-s3-metrics: supabase_url not found in system_config';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL THEN
    RAISE EXCEPTION 'service_role_key not found in vault';
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/update-s3-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Called update-s3-metrics, request_id: %', request_id;
END;
$$;

-- 5. call_poll_gladia_jobs
-- Was: current_setting('app.settings.supabase_url') with hardcoded staging fallback!
CREATE OR REPLACE FUNCTION public.call_poll_gladia_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_key text;
  supabase_url text;
BEGIN
  -- Get service role key from vault
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Get Supabase URL from system_config
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'poll-gladia-jobs: supabase_url not found in system_config';
    RETURN;
  END IF;

  -- Call the edge function via HTTP
  PERFORM
    net.http_post(
      url := supabase_url || '/functions/v1/poll-gladia-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := '{}'::jsonb
    );
END;
$$;

-- 6. call_backfill_standard_ops_tables
-- Was: current_database() for URL
CREATE OR REPLACE FUNCTION public.call_backfill_standard_ops_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  org_record record;
  request_id bigint;
  synced_count integer := 0;
  error_count integer := 0;
BEGIN
  -- Get URL from system_config
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'Standard ops backfill: supabase_url not found in system_config';
    RETURN;
  END IF;

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
    RAISE WARNING 'Standard ops backfill: service_role_key not found in vault, skipping';
    RETURN;
  END IF;

  -- Find all orgs that have at least one standard table
  FOR org_record IN
    SELECT DISTINCT dt.organization_id
    FROM dynamic_tables dt
    WHERE dt.is_standard = true
      AND dt.organization_id IS NOT NULL
  LOOP
    BEGIN
      SELECT net.http_post(
        url := supabase_url || '/functions/v1/backfill-standard-ops-tables',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object('org_id', org_record.organization_id)
      ) INTO request_id;

      synced_count := synced_count + 1;
      RAISE LOG 'Standard ops backfill: triggered for org % (request %)',
        org_record.organization_id, request_id;
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE WARNING 'Standard ops backfill: failed for org %: %',
        org_record.organization_id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'Standard ops backfill complete: % orgs triggered, % errors',
    synced_count, error_count;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Standard ops backfill scheduler failed: %', SQLERRM;
END;
$$;

-- 7. call_poll_stuck_bots
-- Was: current_database() for URL
CREATE OR REPLACE FUNCTION public.call_poll_stuck_bots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
BEGIN
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'poll-stuck-bots: supabase_url not found in system_config';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'poll-stuck-bots: service_role_key not found in vault';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/poll-stuck-bots',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'max_age_hours', 24,
      'stale_minutes', 3
    )
  ) INTO request_id;

  RAISE LOG 'poll-stuck-bots called, request_id: %', request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'poll-stuck-bots failed: %', SQLERRM;
END;
$$;

-- 8. call_refresh_organization_skills
-- Was: current_database() for URL
CREATE OR REPLACE FUNCTION public.call_refresh_organization_skills()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  request_id bigint;
  pending_count integer;
BEGIN
  -- Check if there are any skills needing recompile before making the HTTP call
  SELECT count(*) INTO pending_count
  FROM public.organization_skills
  WHERE needs_recompile = true AND is_active = true;

  -- Skip if nothing to do
  IF pending_count = 0 THEN
    RETURN;
  END IF;

  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING '[call_refresh_organization_skills] supabase_url not found in system_config';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING '[call_refresh_organization_skills] No service_role_key found in vault. Skipping.';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/refresh-organization-skills',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'action', 'refresh_pending',
      'limit', 50
    )
  ) INTO request_id;

  RAISE LOG '[call_refresh_organization_skills] Dispatched refresh for % pending skills, request_id: %',
    pending_count, request_id;
END;
$$;

-- 9. call_sync_savvycal_events
-- Was: current_database() for URL
CREATE OR REPLACE FUNCTION public.call_sync_savvycal_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  cron_secret_val text;
  request_id bigint;
BEGIN
  supabase_url := get_system_config('supabase_url');
  IF supabase_url IS NULL THEN
    RAISE WARNING 'sync-savvycal-events cron: supabase_url not found in system_config';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  BEGIN
    SELECT decrypted_secret INTO cron_secret_val
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    cron_secret_val := NULL;
  END;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'sync-savvycal-events cron: service_role_key not found in vault, skipping';
    RETURN;
  END IF;

  IF cron_secret_val IS NULL OR cron_secret_val = 'REPLACE_WITH_ACTUAL_CRON_SECRET' THEN
    RAISE WARNING 'sync-savvycal-events cron: cron_secret not configured in vault, skipping';
    RETURN;
  END IF;

  SELECT net.http_post(
    url := supabase_url || '/functions/v1/sync-savvycal-events?since_hours=5',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'x-cron-secret', cron_secret_val
    ),
    body := '{"cron_mode": true}'::jsonb
  ) INTO request_id;

  RAISE LOG 'sync-savvycal-events cron: triggered (request %)', request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync-savvycal-events cron failed: %', SQLERRM;
END;
$$;

-- =============================================================================
-- Fix inline cron jobs that use current_setting('app.settings.*')
-- These are direct SQL commands in cron.job, not wrapper functions.
-- We need to update the cron job commands to use get_system_config().
-- =============================================================================

-- Job 20: process-notification-queue (every 5 min)
SELECT cron.unschedule(20);
SELECT cron.schedule(
  'process-notification-queue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/process-notification-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Job 21: send-feedback-requests (daily 10am)
SELECT cron.unschedule(21);
SELECT cron.schedule(
  'send-feedback-requests',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/send-feedback-requests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Job 28: process-reengagement (every 4 hours)
SELECT cron.unschedule(28);
SELECT cron.schedule(
  'process-reengagement',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/process-reengagement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Job 49: meeting-analytics-cron daily (8am)
SELECT cron.unschedule(49);
SELECT cron.schedule(
  'meeting-analytics-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/meeting-analytics-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := jsonb_build_object('type', 'daily')
  )
  $$
);

-- Job 50: meeting-analytics-cron weekly (Monday 9am)
SELECT cron.unschedule(50);
SELECT cron.schedule(
  'meeting-analytics-weekly',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/meeting-analytics-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := jsonb_build_object('type', 'weekly')
  )
  $$
);

-- Job 61: agent-engagement-patterns (Sunday 2am)
SELECT cron.unschedule(61);
SELECT cron.schedule(
  'agent-engagement-patterns',
  '0 2 * * 0',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/agent-engagement-patterns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{"mode": "batch"}'::jsonb
  );
  $$
);

-- Job 62: agent-org-learning (Sunday 6am)
SELECT cron.unschedule(62);
SELECT cron.schedule(
  'agent-org-learning',
  '0 6 * * 0',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/agent-org-learning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{"mode": "analyse"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Job 63: agent-pipeline-snapshot (Monday 5:30am)
SELECT cron.unschedule(63);
SELECT cron.schedule(
  'agent-pipeline-snapshot',
  '30 5 * * 1',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/agent-pipeline-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{"action": "snapshot"}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);

-- Job 64: memory-commitment-tracker (daily 8am)
SELECT cron.unschedule(64);
SELECT cron.schedule(
  'memory-commitment-tracker',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := get_system_config('supabase_url') || '/functions/v1/memory-commitment-tracker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || get_system_config('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
