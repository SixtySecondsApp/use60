-- ============================================================================
-- Migration: Schedule CC Prioritise Cron Job
-- Purpose: Register cron that triggers cc-prioritise every 10 minutes
--          (offset by 3 minutes from enrichment cycle to avoid overlap)
--          so Command Centre items get priority_score and urgency values.
-- Story: CC-006
-- Date: 2026-03-02
-- ============================================================================

-- Wrapper function: calls cc-prioritise via call_proactive_edge_function
CREATE OR REPLACE FUNCTION public.cron_cc_prioritise()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function(
    'cc-prioritise',
    '{"batch": true, "source": "cron"}'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.cron_cc_prioritise IS
  'Cron job: Command Centre prioritisation (every 10 min, offset +3). '
  'Scores all open/enriching/ready items with priority_score and urgency. '
  'Also triggers DEDUP-003 merge group recheck for multi-agent items.';

-- Unschedule if already exists (idempotent re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('cc-prioritise');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule: every 10 minutes, offset by 3 minutes from the quarter-hour
-- Pattern: 3,13,23,33,43,53 * * * *
SELECT cron.schedule(
  'cc-prioritise',
  '3,13,23,33,43,53 * * * *',
  $$SELECT public.cron_cc_prioritise()$$
);
