-- Migration: proposals_sent_at
-- Date: 20260314215554
--
-- What this migration does:
--   DOC-006: Add sent_at timestamp column to proposals table.
--   Tracks when a document was emailed to the prospect after Slack approval.
--
-- Rollback strategy:
--   ALTER TABLE proposals DROP COLUMN IF EXISTS sent_at;

DO $$ BEGIN
  ALTER TABLE proposals ADD COLUMN sent_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposals_sent_at
  ON proposals (sent_at)
  WHERE sent_at IS NOT NULL;
