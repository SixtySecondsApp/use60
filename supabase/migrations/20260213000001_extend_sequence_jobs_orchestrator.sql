-- Migration: Extend Sequence Jobs for Orchestrator
-- Purpose: Add event tracking, chaining, and idempotency for orchestrator system
-- Feature: proactive-agent-v2 (ORCH-001)
-- Date: 2026-02-13

-- =============================================================================
-- Extend sequence_jobs table with orchestrator fields
-- =============================================================================

-- Event source tracking (what triggered this sequence)
ALTER TABLE sequence_jobs
  ADD COLUMN IF NOT EXISTS event_source TEXT;
COMMENT ON COLUMN sequence_jobs.event_source IS
  'Event that triggered this sequence. Examples: webhook:meetingbaas, cron:morning, slack:button, orchestrator:chain';

-- Event chain tracking (links parent/child sequence_jobs)
ALTER TABLE sequence_jobs
  ADD COLUMN IF NOT EXISTS event_chain JSONB DEFAULT '{}';
COMMENT ON COLUMN sequence_jobs.event_chain IS
  'Links to parent/child sequence_jobs for orchestration chains. Format: {parent_job_id: UUID, child_job_ids: UUID[], chain_depth: INT}';

-- Raw trigger payload (the event data that started this)
ALTER TABLE sequence_jobs
  ADD COLUMN IF NOT EXISTS trigger_payload JSONB DEFAULT '{}';
COMMENT ON COLUMN sequence_jobs.trigger_payload IS
  'Raw event data that triggered this sequence. Enables event replay and debugging.';

-- Idempotency key for deduplication
ALTER TABLE sequence_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
COMMENT ON COLUMN sequence_jobs.idempotency_key IS
  'Unique key for event deduplication. Format: {event_type}:{event_id}. Example: meetingbaas:rec_123abc';

-- Unique constraint on idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_jobs_idempotency
  ON sequence_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index for event source queries
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_event_source
  ON sequence_jobs(event_source);

-- Index for event chain queries
CREATE INDEX IF NOT EXISTS idx_sequence_jobs_event_chain
  ON sequence_jobs USING GIN (event_chain);

-- =============================================================================
-- Materialized View: deal_last_activity
-- Purpose: Efficiently query last activity timestamp for deals
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS deal_last_activity AS
SELECT
  d.id as deal_id,
  MAX(a.created_at) as last_activity_at
FROM deals d
LEFT JOIN activities a ON a.deal_id = d.id
GROUP BY d.id;

-- Index for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_deal_last_activity_deal_id
  ON deal_last_activity(deal_id);

-- Index for filtering by last activity time
CREATE INDEX IF NOT EXISTS idx_deal_last_activity_time
  ON deal_last_activity(last_activity_at);

COMMENT ON MATERIALIZED VIEW deal_last_activity IS
  'Pre-computed last activity timestamp for each deal. Refresh periodically for orchestrator queries.';

-- =============================================================================
-- Helper Function: Refresh deal_last_activity view
-- =============================================================================

CREATE OR REPLACE FUNCTION refresh_deal_last_activity()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY deal_last_activity;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_deal_last_activity TO authenticated;

COMMENT ON FUNCTION refresh_deal_last_activity IS
  'Refreshes the deal_last_activity materialized view. Call after bulk activity changes.';
