-- ============================================================================
-- DM-010: Commitment Tracker Cron Job (PRD-DM-001)
-- Runs daily at 8am UTC to check for overdue commitments
-- ============================================================================

-- Schedule daily commitment check
-- Note: pg_cron extension must be enabled. If it doesn't exist, this migration
-- is documentation-only — the function can be triggered via fleet orchestrator instead.

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any
    PERFORM cron.unschedule('deal-memory-commitment-tracker')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deal-memory-commitment-tracker');

    -- Schedule: daily at 8am UTC
    PERFORM cron.schedule(
      'deal-memory-commitment-tracker',
      '0 8 * * *',
      $cron$
        SELECT net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/memory-commitment-tracker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
          ),
          body := '{}'::jsonb
        );
      $cron$
    );

    RAISE NOTICE 'Scheduled deal-memory-commitment-tracker cron job (daily 8am UTC)';
  ELSE
    RAISE NOTICE 'pg_cron not available — commitment tracker will be triggered via fleet orchestrator';
  END IF;
END $outer$;
