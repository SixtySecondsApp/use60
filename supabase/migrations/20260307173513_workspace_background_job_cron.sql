-- Migration: workspace_background_job_cron
-- Date: 20260307173513
--
-- What this migration does:
--   Enables pg_cron + pg_net extensions and creates scheduled jobs
--   for workspace background operations (token refresh, email sync,
--   classification, reply gap detection, calendar watch renewal, etc.)
--
-- Rollback strategy:
--   SELECT cron.unschedule(jobname) for each job listed below.
--   Extensions can remain enabled.

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant pg_cron access to make HTTP calls
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Helper: resolve the edge function URL
-- Uses the project's SUPABASE_URL env var pattern
DO $$
DECLARE
  base_url text := current_setting('app.settings.supabase_url', true);
  fn_url text;
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  -- If settings not available, use a placeholder that will be replaced at deploy time
  IF base_url IS NULL OR base_url = '' THEN
    base_url := 'https://placeholder.supabase.co';
  END IF;
  fn_url := base_url || '/functions/v1/workspace-background-jobs';

  -- =========================================================================
  -- Token Refresh: every 10 minutes (always runs)
  -- =========================================================================
  PERFORM cron.unschedule('workspace_token_refresh');
  PERFORM cron.schedule(
    'workspace_token_refresh',
    '*/10 * * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"token_refresh"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Email Sync (Pro): every 30 minutes
  -- =========================================================================
  PERFORM cron.unschedule('workspace_email_sync_pro');
  PERFORM cron.schedule(
    'workspace_email_sync_pro',
    '*/30 * * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"email_sync"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Email Classification: every hour
  -- =========================================================================
  PERFORM cron.unschedule('workspace_email_classify');
  PERFORM cron.schedule(
    'workspace_email_classify',
    '0 * * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"email_classify"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Reply Gap Detection (Pro): every 4 hours
  -- =========================================================================
  PERFORM cron.unschedule('workspace_reply_gap_pro');
  PERFORM cron.schedule(
    'workspace_reply_gap_pro',
    '0 */4 * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"reply_gap"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Calendar Watch Renewal: daily at 3am UTC
  -- =========================================================================
  PERFORM cron.unschedule('workspace_calendar_watch');
  PERFORM cron.schedule(
    'workspace_calendar_watch',
    '0 3 * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"calendar_watch"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Sent/Received Ratio: daily at 2am UTC
  -- =========================================================================
  PERFORM cron.unschedule('workspace_ratio_calc');
  PERFORM cron.schedule(
    'workspace_ratio_calc',
    '0 2 * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"ratio_calc"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Document Linking: every 2 hours
  -- =========================================================================
  PERFORM cron.unschedule('workspace_doc_link');
  PERFORM cron.schedule(
    'workspace_doc_link',
    '0 */2 * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"doc_link"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

  -- =========================================================================
  -- Attendee Enrichment: every 15 minutes
  -- =========================================================================
  PERFORM cron.unschedule('workspace_attendee_enrich');
  PERFORM cron.schedule(
    'workspace_attendee_enrich',
    '*/15 * * * *',
    format(
      'SELECT net.http_post(url:=%L, body:=%L::jsonb, headers:=%L::jsonb)',
      fn_url,
      '{"job_type":"attendee_enrich"}',
      format('{"Authorization":"Bearer %s","Content-Type":"application/json"}', service_key)
    )
  );

END $$;
