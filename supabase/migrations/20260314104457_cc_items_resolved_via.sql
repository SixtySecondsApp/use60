-- ============================================================================
-- Migration: Add resolved_via + thread_id columns to command_centre_items
-- Purpose: Track HOW items were resolved (copilot, manual, auto, slack) and
--          group related items via thread_id for conversation threading.
-- Story: TRINITY-010
-- Date: 2026-03-14
--
-- Rollback strategy:
--   ALTER TABLE command_centre_items DROP COLUMN IF EXISTS resolved_via;
--   ALTER TABLE command_centre_items DROP COLUMN IF EXISTS resolved_conversation_id;
--   ALTER TABLE command_centre_items DROP COLUMN IF EXISTS thread_id;
--   DROP INDEX IF EXISTS idx_cc_thread_id;
-- ============================================================================

-- =============================================================================
-- ADD COLUMNS (re-runnable via DO $$ BEGIN ... EXCEPTION ... END $$)
-- =============================================================================

-- resolved_via: how the item was resolved — 'copilot', 'manual', 'auto', 'slack'
DO $$ BEGIN
  ALTER TABLE command_centre_items
    ADD COLUMN resolved_via TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- resolved_conversation_id: optional link to the copilot conversation that resolved this item
DO $$ BEGIN
  ALTER TABLE command_centre_items
    ADD COLUMN resolved_conversation_id UUID;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- thread_id: groups related items into a single thread for UI grouping
DO $$ BEGIN
  ALTER TABLE command_centre_items
    ADD COLUMN thread_id UUID;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- =============================================================================
-- INDEX: thread_id partial index for grouping queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cc_thread_id
  ON command_centre_items (thread_id)
  WHERE thread_id IS NOT NULL;

-- =============================================================================
-- Column comments
-- =============================================================================

COMMENT ON COLUMN command_centre_items.resolved_via IS
  'How this item was resolved: copilot, manual, auto, or slack.';
COMMENT ON COLUMN command_centre_items.resolved_conversation_id IS
  'Optional UUID of the copilot conversation that resolved this item.';
COMMENT ON COLUMN command_centre_items.thread_id IS
  'Groups related CC items into a single thread for UI grouping and conversation context.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260314104457_cc_items_resolved_via.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: TRINITY-010';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns on command_centre_items:';
  RAISE NOTICE '  resolved_via              TEXT   — copilot | manual | auto | slack';
  RAISE NOTICE '  resolved_conversation_id  UUID   — optional copilot conversation ref';
  RAISE NOTICE '  thread_id                 UUID   — groups related items';
  RAISE NOTICE '';
  RAISE NOTICE 'New index:';
  RAISE NOTICE '  idx_cc_thread_id — partial index on thread_id WHERE NOT NULL';
  RAISE NOTICE '============================================================================';
END $$;
