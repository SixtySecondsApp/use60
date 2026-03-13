-- Migration: follow_up_chain_and_buyer_signals
-- Date: 20260310193503
--
-- What this migration does:
--   Adds chain_id, chain_position, and chain_type to follow_up_drafts for multi-email sequences.
--   Adds buyer_signal_score column for persisting computed buyer signal scores.
--
-- Rollback strategy:
--   ALTER TABLE follow_up_drafts DROP COLUMN IF EXISTS chain_id;
--   ALTER TABLE follow_up_drafts DROP COLUMN IF EXISTS chain_position;
--   ALTER TABLE follow_up_drafts DROP COLUMN IF EXISTS chain_type;
--   ALTER TABLE follow_up_drafts DROP COLUMN IF EXISTS buyer_signal_score;
--   DROP INDEX IF EXISTS follow_up_drafts_chain_idx;

-- Add chain columns for multi-email follow-up sequences
ALTER TABLE follow_up_drafts ADD COLUMN IF NOT EXISTS chain_id uuid;
ALTER TABLE follow_up_drafts ADD COLUMN IF NOT EXISTS chain_position integer;
ALTER TABLE follow_up_drafts ADD COLUMN IF NOT EXISTS chain_type text;

-- Add buyer signal score (0-100)
ALTER TABLE follow_up_drafts ADD COLUMN IF NOT EXISTS buyer_signal_score integer;

-- Index for querying chain drafts together
CREATE INDEX IF NOT EXISTS follow_up_drafts_chain_idx
  ON follow_up_drafts (chain_id)
  WHERE chain_id IS NOT NULL;

COMMENT ON COLUMN follow_up_drafts.chain_id IS 'Groups drafts into a multi-email follow-up chain (shared UUID)';
COMMENT ON COLUMN follow_up_drafts.chain_position IS 'Order within a chain: 0=recap, 1=value-add, 2=nudge, 3=re-engage';
COMMENT ON COLUMN follow_up_drafts.chain_type IS 'Type label: meeting_recap, value_add, gentle_nudge, re_engagement';
COMMENT ON COLUMN follow_up_drafts.buyer_signal_score IS 'Computed buyer signal confidence score (0-100)';
