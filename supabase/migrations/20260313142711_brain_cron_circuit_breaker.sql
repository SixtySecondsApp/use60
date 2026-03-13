-- Migration: brain_cron_circuit_breaker
-- Date: 20260313142711
--
-- What this migration does:
--   Creates cron_circuit_breaker table to track consecutive failures for cron jobs.
--   When a job hits 5+ failures, it gets disabled with exponential backoff cooldown.
--
-- Rollback strategy:
--   DROP TABLE IF EXISTS cron_circuit_breaker;

CREATE TABLE IF NOT EXISTS public.cron_circuit_breaker (
  job_name TEXT PRIMARY KEY,
  consecutive_failures INT DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  disabled_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  cooldown_minutes INT DEFAULT 60,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.cron_circuit_breaker ENABLE ROW LEVEL SECURITY;

-- Service role full access (edge functions manage circuit breaker state)
DROP POLICY IF EXISTS "Service role full access to cron_circuit_breaker" ON public.cron_circuit_breaker;
CREATE POLICY "Service role full access to cron_circuit_breaker"
  ON public.cron_circuit_breaker
  FOR ALL
  USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
