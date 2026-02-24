-- ============================================================================
-- Migration: Fix pg_net calls + re-register morning briefing cron
-- Purpose: Three older cron wrapper functions call http_post() without the
--          net. schema prefix, causing every invocation to fail with
--          "function http_post() does not exist". This migration recreates
--          them using the proven call_proactive_edge_function() pattern
--          (vault-based secrets, net.http_post, error logging).
--
--          Also re-registers the enhanced-morning-briefing cron job which
--          was defined in migration 20260222500005 but did not persist
--          in cron.job (likely failed silently during that migration).
-- Date: 2026-02-23
-- ============================================================================

-- ============================================================================
-- 1. Fix call_poll_s3_upload_queue — use call_proactive_edge_function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.call_poll_s3_upload_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'poll-s3-upload-queue',
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.call_poll_s3_upload_queue() IS
  'Triggers poll-s3-upload-queue edge function via pg_cron. '
  'Processes pending S3 uploads for 60 Notetaker recordings. '
  'Fixed 2026-02-23: now delegates to call_proactive_edge_function (net.http_post).';

-- ============================================================================
-- 2. Fix call_update_s3_metrics — use call_proactive_edge_function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.call_update_s3_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'update-s3-metrics',
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.call_update_s3_metrics() IS
  'Triggers update-s3-metrics edge function via pg_cron. '
  'Calculates daily S3 storage and bandwidth metrics for cost tracking. '
  'Fixed 2026-02-23: now delegates to call_proactive_edge_function (net.http_post).';

-- ============================================================================
-- 3. Fix call_poll_transcription_queue — use call_proactive_edge_function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.call_poll_transcription_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'poll-transcription-queue',
    '{}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.call_poll_transcription_queue() IS
  'Triggers poll-transcription-queue edge function via pg_cron. '
  'Processes pending/failed transcriptions with tiered fallback. '
  'Fixed 2026-02-23: now delegates to call_proactive_edge_function (net.http_post).';

-- ============================================================================
-- 4. Re-register enhanced-morning-briefing cron job
--    (cron_morning_briefing() function already exists from migration 500005)
-- ============================================================================

-- Unschedule if somehow partially registered
DO $$
BEGIN
  PERFORM cron.unschedule('enhanced-morning-briefing');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: 08:00 UTC daily, Monday–Friday
SELECT cron.schedule(
  'enhanced-morning-briefing',
  '0 8 * * 1-5',
  $$SELECT public.cron_morning_briefing()$$
);

-- ============================================================================
-- 5. Verification notice
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260223104100_fix_pgnet_and_morning_cron.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed functions (http_post -> call_proactive_edge_function):';
  RAISE NOTICE '  - call_poll_s3_upload_queue()';
  RAISE NOTICE '  - call_update_s3_metrics()';
  RAISE NOTICE '  - call_poll_transcription_queue()';
  RAISE NOTICE '';
  RAISE NOTICE 'Re-registered cron:';
  RAISE NOTICE '  - enhanced-morning-briefing (0 8 * * 1-5)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
