-- Migration: Add deduplication columns to command_centre_items
-- Story: DEDUP-001 — V2 Architecture Foundations

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS merge_group_id UUID,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS merged_evidence JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS merged_confidence DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS contributing_agents TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS merge_window_expires TIMESTAMPTZ;

-- Index for efficient merge lookups
CREATE INDEX IF NOT EXISTS idx_cc_items_dedup_key_merge_window
  ON command_centre_items (dedup_key, merge_window_expires);

-- Column comments
COMMENT ON COLUMN command_centre_items.dedup_key IS
  'Deduplication key computed as entity_type:entity_id:action_type — used to identify and merge duplicate items';

COMMENT ON COLUMN command_centre_items.merge_group_id IS
  'UUID grouping merged items together — all items sharing a merge_group_id represent the same logical action';

COMMENT ON COLUMN command_centre_items.is_primary IS
  'Whether this item is the primary representative in its merge group — non-primary items are suppressed from display';

COMMENT ON COLUMN command_centre_items.merged_evidence IS
  'Aggregated evidence from all merged items in this group — JSON array of evidence objects from contributing agents';

COMMENT ON COLUMN command_centre_items.merged_confidence IS
  'Aggregated confidence score (0.0000–1.0000) computed from all contributing agents in the merge group';

COMMENT ON COLUMN command_centre_items.contributing_agents IS
  'Array of agent names that contributed to this item via merging — used for attribution and debugging';

COMMENT ON COLUMN command_centre_items.merge_window_expires IS
  'Timestamp when the merge window closes — after expiry, new items with the same dedup_key start a new group';
