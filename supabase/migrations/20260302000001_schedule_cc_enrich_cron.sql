-- ============================================================================
-- Migration: Schedule CC Enrich Cron Job
-- Purpose: Register cron that triggers cc-enrich every 15 minutes so
--          Command Centre items progress from pending → enriched with
--          drafted actions populated by actionDrafter.
-- Story: CC-005
-- Date: 2026-03-02
-- ============================================================================

-- Wrapper function: calls cc-enrich via call_proactive_edge_function
CREATE OR REPLACE FUNCTION public.cron_cc_enrich()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'cc-enrich',
    '{"source": "cron"}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_cc_enrich IS
  'Cron job: Command Centre enrichment (every 15 min). '
  'Picks up pending CC items (batch of 20), runs AI enrichment via actionDrafter, '
  'and populates drafted_action + confidence_score fields.';

-- Unschedule if already exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('cc-enrich');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every 15 minutes
SELECT cron.schedule(
  'cc-enrich',
  '*/15 * * * *',
  $$SELECT public.cron_cc_enrich()$$
);
