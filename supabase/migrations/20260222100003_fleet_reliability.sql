-- =============================================================================
-- PRD-02: Fleet Orchestrator — Reliability Infrastructure
-- Story: FLT-008
-- =============================================================================
-- Dead-letter queue for failed events and sequence failures.
-- Enables retry, inspection, and abandonment of failed work.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_dead_letter_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  event_type      TEXT NOT NULL,
  event_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_job_id   UUID,                -- parent sequence_jobs.id (nullable)
  error_message   TEXT NOT NULL,
  error_step      TEXT,                -- skill name where failure occurred
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'retrying', 'resolved', 'abandoned')),
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

-- For efficient retry polling
CREATE INDEX IF NOT EXISTS idx_fleet_dlq_retry_poll
  ON fleet_dead_letter_queue (status, next_retry_at)
  WHERE status IN ('pending', 'retrying');

-- For admin inspection
CREATE INDEX IF NOT EXISTS idx_fleet_dlq_org
  ON fleet_dead_letter_queue (org_id, created_at DESC);

-- RLS
ALTER TABLE fleet_dead_letter_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "fleet_dlq_service_all"
  ON fleet_dead_letter_queue FOR ALL
  USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins can read their dead letters
DO $$ BEGIN
  CREATE POLICY "fleet_dlq_org_admin_read"
  ON fleet_dead_letter_queue FOR SELECT
  USING (
    get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins can update (retry/abandon)
DO $$ BEGIN
  CREATE POLICY "fleet_dlq_org_admin_update"
  ON fleet_dead_letter_queue FOR UPDATE
  USING (
    get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_dead_letter_queue TO service_role;
GRANT SELECT, UPDATE ON fleet_dead_letter_queue TO authenticated;
