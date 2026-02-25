-- ============================================================
-- Migration: fleet_health_snapshots
-- Purpose:   Stores periodic health check snapshots for each
--            autonomous fleet agent. Written every 5 minutes by
--            the fleet-health cron edge function. Used for
--            observability dashboards and trend analysis.
-- Story:     OBS2-003
-- Date:      2026-02-22
-- ============================================================

-- ============================================================
-- 1. TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fleet_health_snapshots (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  agent_name           TEXT          NOT NULL,
  status               TEXT          NOT NULL
                                     CHECK (status IN ('healthy', 'warning', 'critical', 'stale')),
  last_success_at      TIMESTAMPTZ,
  failure_rate_24h     NUMERIC(5,2),
  avg_duration_ms      INT,
  credits_consumed_24h NUMERIC(10,4),
  alerts_fired         INT           NOT NULL DEFAULT 0,
  metadata             JSONB         NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

-- Primary query pattern: latest snapshot per agent
CREATE INDEX IF NOT EXISTS fleet_health_snapshots_agent_name_snapshot_at_idx
  ON public.fleet_health_snapshots (agent_name, snapshot_at DESC);

-- Dashboard timeline query
CREATE INDEX IF NOT EXISTS fleet_health_snapshots_snapshot_at_idx
  ON public.fleet_health_snapshots (snapshot_at DESC);

-- Filter by status for alerting queries
CREATE INDEX IF NOT EXISTS fleet_health_snapshots_status_idx
  ON public.fleet_health_snapshots (status, snapshot_at DESC);

-- ============================================================
-- 3. AUTO-CLEANUP POLICY (rows older than 30 days)
-- ============================================================

-- Cleanup function called by the fleet-health cron itself to keep
-- the table lean. Separate from logs-cleanup to allow independent scheduling.
CREATE OR REPLACE FUNCTION public.cleanup_fleet_health_snapshots()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.fleet_health_snapshots
  WHERE snapshot_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_fleet_health_snapshots() IS
  'Deletes fleet_health_snapshots rows older than 30 days. '
  'Called by the fleet-health cron edge function at the end of each run.';

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE public.fleet_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role has full write access (edge function writes snapshots)
DROP POLICY IF EXISTS "service_role_all_fleet_health_snapshots" ON public.fleet_health_snapshots;
CREATE POLICY "service_role_all_fleet_health_snapshots"
  ON public.fleet_health_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Platform admins can read all snapshots
DROP POLICY IF EXISTS "admins_select_fleet_health_snapshots" ON public.fleet_health_snapshots;
CREATE POLICY "admins_select_fleet_health_snapshots"
  ON public.fleet_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- ============================================================
-- 5. GRANTS
-- ============================================================

GRANT SELECT ON public.fleet_health_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_health_snapshots TO service_role;

-- ============================================================
-- 6. COMMENTS
-- ============================================================

COMMENT ON TABLE public.fleet_health_snapshots IS
  'Periodic health snapshots for each autonomous fleet agent (OBS2-003). '
  'Written every 5 minutes by the fleet-health cron. One row per agent per run. '
  'Auto-cleaned after 30 days by cleanup_fleet_health_snapshots().';

COMMENT ON COLUMN public.fleet_health_snapshots.snapshot_at IS
  'Timestamp when this health check was performed.';

COMMENT ON COLUMN public.fleet_health_snapshots.agent_name IS
  'Logical agent identifier matching agent_executions.agent_name, '
  'e.g. ''morning-briefing'', ''deal-risk-batch'', ''cc-enrich''.';

COMMENT ON COLUMN public.fleet_health_snapshots.status IS
  'Health status at this point in time: '
  'healthy = running within expected cadence, no recent failures; '
  'warning = degraded (elevated failure rate or slightly overdue); '
  'critical = agent down, pipeline stalled, or circuit breaker open; '
  'stale = no executions recorded in the past 2× cadence interval.';

COMMENT ON COLUMN public.fleet_health_snapshots.last_success_at IS
  'Timestamp of the most recent completed execution with status = ''completed''.';

COMMENT ON COLUMN public.fleet_health_snapshots.failure_rate_24h IS
  'Percentage of executions in the last 24 hours that ended in a failed state. '
  'NULL when there are no executions in the window.';

COMMENT ON COLUMN public.fleet_health_snapshots.avg_duration_ms IS
  'Average execution duration in milliseconds over the past 24 hours.';

COMMENT ON COLUMN public.fleet_health_snapshots.credits_consumed_24h IS
  'Total platform credits consumed by this agent in the last 24 hours.';

COMMENT ON COLUMN public.fleet_health_snapshots.alerts_fired IS
  'Number of Slack alerts fired during this health check run for this agent.';

COMMENT ON COLUMN public.fleet_health_snapshots.metadata IS
  'Additional diagnostic context: open circuit breakers, DLQ counts, '
  'stuck execution IDs, cadence details, etc.';
