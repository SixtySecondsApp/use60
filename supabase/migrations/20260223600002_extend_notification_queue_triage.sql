-- ============================================================================
-- Migration: Extend notification_queue with triage columns + notification_batches
-- Purpose: Add triage/suppression layer for always-on agent notification intelligence
-- Story: AOA-002 — Extend notification_queue with triage columns
-- Date: 2026-02-23
-- ============================================================================

-- =============================================================================
-- Extend notification_queue with triage columns
-- =============================================================================

-- Notification type for triage routing (e.g., 'meeting_debrief', 'deal_risk', 'pre_meeting')
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS notification_type TEXT;

-- Triage status: tracks notification through the triage pipeline
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'pending'
    CHECK (triage_status IN ('pending', 'suppressed', 'batched', 'queued', 'delivered', 'failed'));

-- Delivery channel decided by triage engine
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT
    CHECK (delivery_channel IS NULL OR delivery_channel IN ('slack_dm', 'in_app', 'email', 'batch'));

-- Entity reference for deduplication and threading
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS entity_type TEXT;

ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Batch reference (nullable FK to notification_batches)
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Triage timestamp
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;

-- Source job reference (links back to orchestrator sequence_jobs)
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS source_job_id UUID;

-- =============================================================================
-- New indexes for triage queries
-- =============================================================================

-- Triage engine: find pending notifications to triage
CREATE INDEX IF NOT EXISTS idx_notification_queue_triage_pending
  ON notification_queue(user_id, triage_status, created_at)
  WHERE triage_status = 'pending';

-- Deduplication: find recent notifications for same entity+type
CREATE INDEX IF NOT EXISTS idx_notification_queue_dedup
  ON notification_queue(user_id, entity_type, entity_id, notification_type, created_at DESC)
  WHERE entity_type IS NOT NULL;

-- Batch assembly: find batched notifications for a batch
CREATE INDEX IF NOT EXISTS idx_notification_queue_batch
  ON notification_queue(batch_id)
  WHERE batch_id IS NOT NULL;

-- Morning briefing: find suppressed/batched items for last 24h
CREATE INDEX IF NOT EXISTS idx_notification_queue_briefing
  ON notification_queue(user_id, triage_status, created_at)
  WHERE triage_status IN ('suppressed', 'batched');

-- =============================================================================
-- Table: notification_batches
-- Groups related notifications into digests (morning briefing, daily digest, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,

  -- Batch type
  batch_type TEXT NOT NULL CHECK (batch_type IN (
    'morning_briefing', 'meeting_digest', 'risk_roundup',
    'daily_digest', 'weekly_digest', 'coaching_digest'
  )),

  -- Content
  item_count INT NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting', 'ready', 'delivered', 'cancelled')),

  -- Delivery
  delivery_channel TEXT DEFAULT 'slack_dm' CHECK (delivery_channel IN ('slack_dm', 'in_app', 'email')),
  delivery_result JSONB,
  delivered_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes for notification_batches
-- =============================================================================

-- Find user's collecting batches (for adding items)
CREATE INDEX IF NOT EXISTS idx_notification_batches_collecting
  ON notification_batches(user_id, batch_type, status)
  WHERE status = 'collecting';

-- Find batches ready for delivery
CREATE INDEX IF NOT EXISTS idx_notification_batches_ready
  ON notification_batches(scheduled_for, status)
  WHERE status = 'ready';

-- =============================================================================
-- RLS for notification_batches
-- =============================================================================

ALTER TABLE notification_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own batches"
  ON notification_batches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to notification_batches"
  ON notification_batches FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- FK: notification_queue.batch_id -> notification_batches.id
-- =============================================================================

ALTER TABLE notification_queue
  ADD CONSTRAINT fk_notification_queue_batch
  FOREIGN KEY (batch_id) REFERENCES notification_batches(id)
  ON DELETE SET NULL;

-- =============================================================================
-- Trigger: Update updated_at on notification_batches
-- =============================================================================

CREATE OR REPLACE FUNCTION update_notification_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_batches_updated_at
  BEFORE UPDATE ON notification_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_batches_updated_at();

-- =============================================================================
-- Permissions
-- =============================================================================

GRANT SELECT ON notification_batches TO authenticated;
GRANT ALL ON notification_batches TO service_role;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE notification_batches IS
  'Groups related notifications into digests. Morning briefing, daily/weekly digests are assembled from batched notifications.';

COMMENT ON COLUMN notification_queue.notification_type IS 'Agent output type for triage routing (e.g., meeting_debrief, deal_risk, pre_meeting)';
COMMENT ON COLUMN notification_queue.triage_status IS 'Triage pipeline status: pending -> suppressed/batched/queued -> delivered/failed';
COMMENT ON COLUMN notification_queue.delivery_channel IS 'Delivery channel decided by triage: slack_dm, in_app, email, or batch';
COMMENT ON COLUMN notification_queue.entity_type IS 'Entity type for deduplication (e.g., deal, meeting, contact)';
COMMENT ON COLUMN notification_queue.entity_id IS 'Entity ID for deduplication and threading';
COMMENT ON COLUMN notification_queue.batch_id IS 'Reference to notification_batches for batched/digest items';
COMMENT ON COLUMN notification_queue.triaged_at IS 'When this notification was processed by the triage engine';
COMMENT ON COLUMN notification_queue.source_job_id IS 'Reference to orchestrator sequence_jobs that generated this notification';
