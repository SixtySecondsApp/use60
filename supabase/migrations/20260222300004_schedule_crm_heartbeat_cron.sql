-- ============================================================================
-- PRD-03: Schedule CRM Heartbeat Cron Job
-- Story: CRM-010
--
-- Calls agent-crm-heartbeat every 4 hours to:
--   1. Send reminders for stale pending approvals (>12h)
--   2. Auto-expire approvals past 48h
--   3. Alert on high error rates
--   4. Warn on excessive queue depth
-- ============================================================================

-- Wrapper function for the heartbeat edge function
CREATE OR REPLACE FUNCTION public.cron_crm_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.call_proactive_edge_function('agent-crm-heartbeat', '{}'::jsonb);
END;
$$;

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('crm-approval-heartbeat');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule every 4 hours at minute 15 (offset from other crons)
SELECT cron.schedule(
  'crm-approval-heartbeat',
  '15 */4 * * *',
  $$SELECT public.cron_crm_heartbeat()$$
);
