-- Migration: Setup Proactive AI Cron Jobs
-- Purpose: Schedule proactive AI functions for automated pipeline/task analysis
-- Date: 2026-01-24
--
-- Functions scheduled:
-- 1. proactive-meeting-prep: Daily at 7:00 AM (prepare for day's meetings)
-- 2. proactive-pipeline-analysis: Daily at 8:00 AM (analyze pipeline health)
-- 3. proactive-task-analysis: Every 4 hours (check for overdue/stale tasks)
-- 4. auto-re-enrich: Weekly on Monday at 6:00 AM (refresh stale enrichments)
--
-- ⚠️ IMPORTANT: Database settings must already be configured for cron to work!
-- See 20260122000001_setup_fathom_cron_sync_v2.sql for instructions.

-- ============================================================================
-- 1. Ensure extensions exist
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- 2. Create wrapper functions for each proactive job
-- ============================================================================

-- Add metadata column to cron_job_logs if not exists
ALTER TABLE public.cron_job_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Helper function to call edge functions with service role
-- Uses vault secrets instead of database settings (Supabase hosted doesn't allow ALTER DATABASE)
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
  -- Get Supabase URL from environment or default
  -- For staging: caerqjzvuerejfrdtygb, for production: ygdpgliavpxeugaajgrb
  v_supabase_url := coalesce(
    current_setting('app.supabase_url', true),
    'https://' || current_setting('request.headers', true)::json->>'host'
  );

  -- Fallback to checking which project we're on
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    -- Try to detect from existing data
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key')
      THEN 'https://caerqjzvuerejfrdtygb.supabase.co'  -- Will be overwritten per-environment
      ELSE NULL
    END INTO v_supabase_url;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  -- Validate
  IF v_service_role_key IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Vault secret "service_role_key" not found. Add it in Supabase Dashboard > Settings > Vault');
    RETURN;
  END IF;

  IF v_supabase_url IS NULL THEN
    INSERT INTO public.cron_job_logs (job_name, status, message)
    VALUES (function_name, 'error', 'Could not determine Supabase URL');
    RETURN;
  END IF;

  -- Make async HTTP request to edge function using net schema
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := payload,
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  -- Log the trigger
  INSERT INTO public.cron_job_logs (job_name, status, message, metadata)
  VALUES (
    function_name,
    'triggered',
    'Edge function called via pg_net',
    jsonb_build_object('request_id', v_request_id, 'payload', payload)
  );

EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_logs (job_name, status, message, error_details)
  VALUES (function_name, 'error', 'Failed to call edge function', SQLERRM);
END;
$$;

-- ============================================================================
-- 3. Create individual job wrapper functions
-- ============================================================================

-- Meeting prep: Sends prep for all users with meetings in next 2 hours
CREATE OR REPLACE FUNCTION public.cron_proactive_meeting_prep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('proactive-meeting-prep', '{"scope": "all"}'::jsonb);
END;
$$;

-- Pipeline analysis: Analyze pipeline health for all orgs
CREATE OR REPLACE FUNCTION public.cron_proactive_pipeline_analysis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('proactive-pipeline-analysis', '{"scope": "all"}'::jsonb);
END;
$$;

-- Task analysis: Check for overdue and stale tasks
CREATE OR REPLACE FUNCTION public.cron_proactive_task_analysis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('proactive-task-analysis', '{"scope": "all"}'::jsonb);
END;
$$;

-- Auto re-enrich: Refresh stale organization enrichments
CREATE OR REPLACE FUNCTION public.cron_auto_re_enrich()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('auto-re-enrich', '{"stale_days": 30}'::jsonb);
END;
$$;

-- ============================================================================
-- 4. Schedule the cron jobs
-- ============================================================================

-- Remove existing jobs if they exist (for idempotency)
SELECT cron.unschedule('proactive-meeting-prep') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'proactive-meeting-prep'
);
SELECT cron.unschedule('proactive-pipeline-analysis') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'proactive-pipeline-analysis'
);
SELECT cron.unschedule('proactive-task-analysis') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'proactive-task-analysis'
);
SELECT cron.unschedule('auto-re-enrich') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-re-enrich'
);

-- Schedule: Meeting prep at 7:00 AM UTC daily
SELECT cron.schedule(
  'proactive-meeting-prep',
  '0 7 * * *',  -- 7:00 AM UTC daily
  $$SELECT public.cron_proactive_meeting_prep()$$
);

-- Schedule: Pipeline analysis at 8:00 AM UTC daily
SELECT cron.schedule(
  'proactive-pipeline-analysis',
  '0 8 * * *',  -- 8:00 AM UTC daily
  $$SELECT public.cron_proactive_pipeline_analysis()$$
);

-- Schedule: Task analysis every 4 hours
SELECT cron.schedule(
  'proactive-task-analysis',
  '0 */4 * * *',  -- Every 4 hours at :00
  $$SELECT public.cron_proactive_task_analysis()$$
);

-- Schedule: Auto re-enrich weekly on Monday at 6:00 AM UTC
SELECT cron.schedule(
  'auto-re-enrich',
  '0 6 * * 1',  -- 6:00 AM UTC every Monday
  $$SELECT public.cron_auto_re_enrich()$$
);

-- ============================================================================
-- 5. Add comments
-- ============================================================================

COMMENT ON FUNCTION public.call_proactive_edge_function IS
  'Generic wrapper to call proactive AI edge functions via pg_net';

COMMENT ON FUNCTION public.cron_proactive_meeting_prep IS
  'Cron job: Send meeting prep for upcoming meetings (runs daily at 7 AM)';

COMMENT ON FUNCTION public.cron_proactive_pipeline_analysis IS
  'Cron job: Analyze pipeline health and send alerts (runs daily at 8 AM)';

COMMENT ON FUNCTION public.cron_proactive_task_analysis IS
  'Cron job: Check for overdue/stale tasks (runs every 4 hours)';

COMMENT ON FUNCTION public.cron_auto_re_enrich IS
  'Cron job: Refresh stale organization enrichments (runs weekly on Monday)';
