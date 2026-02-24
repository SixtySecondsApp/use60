-- ============================================================================
-- Migration: Command Centre Reconciliation Columns + Dedup Indexes
-- Purpose: Add reconciliation tracking columns and deduplication indexes to
--          command_centre_items so the prioritisation engine can merge
--          duplicate items produced by multiple concurrent agents and track
--          which orchestrator event resolved each item.
-- Story: CC9-001
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- ADDITIVE COLUMNS: reconciliation + dedup support
-- All additions use IF NOT EXISTS for idempotency.
-- NO DROP, NO ALTER TYPE, NO data loss.
-- =============================================================================

-- reconciled_by: which agent or process performed the reconciliation
ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS reconciled_by TEXT;

-- reconciled_event_id: UUID of the fleet job / workflow execution that
-- reconciled (merged / de-duplicated) this item
ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS reconciled_event_id UUID;

-- merged_from: array of item UUIDs that were merged INTO this item during
-- deduplication. The source items are typically auto_resolved after merging.
ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS merged_from UUID[] DEFAULT '{}';

-- =============================================================================
-- COLUMN COMMENTS
-- =============================================================================

COMMENT ON COLUMN command_centre_items.reconciled_by IS
  'Identifier of the agent or process that reconciled (merged/deduped) this item, e.g. prioritisation-engine, morning-brief.';

COMMENT ON COLUMN command_centre_items.reconciled_event_id IS
  'UUID of the fleet job or workflow_execution that performed reconciliation. Useful for audit / replay.';

COMMENT ON COLUMN command_centre_items.merged_from IS
  'Array of command_centre_items UUIDs that were merged into this item during deduplication. Source items are auto_resolved after merging.';

-- =============================================================================
-- DEDUP INDEXES (partial — only on actionable statuses)
-- =============================================================================

-- Deal-scoped dedup: at most one open/ready item per (user, deal, item_type)
-- Used by the reconciliation engine to find existing items before inserting.
CREATE INDEX IF NOT EXISTS idx_cc_dedup
  ON command_centre_items (user_id, deal_id, item_type)
  WHERE status IN ('open', 'ready')
    AND deal_id IS NOT NULL;

-- Contact-scoped dedup: at most one open/ready item per (user, contact, item_type)
CREATE INDEX IF NOT EXISTS idx_cc_contact_dedup
  ON command_centre_items (user_id, contact_id, item_type)
  WHERE status IN ('open', 'ready')
    AND contact_id IS NOT NULL;

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600003_cc_reconciliation_columns.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC9-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Additive columns on command_centre_items:';
  RAISE NOTICE '  reconciled_by        TEXT       — agent/process that reconciled the item';
  RAISE NOTICE '  reconciled_event_id  UUID       — fleet job / execution that reconciled';
  RAISE NOTICE '  merged_from          UUID[]     — source item IDs merged into this row';
  RAISE NOTICE '';
  RAISE NOTICE 'Dedup indexes:';
  RAISE NOTICE '  idx_cc_dedup         — (user_id, deal_id, item_type) WHERE open/ready AND deal_id IS NOT NULL';
  RAISE NOTICE '  idx_cc_contact_dedup — (user_id, contact_id, item_type) WHERE open/ready AND contact_id IS NOT NULL';
  RAISE NOTICE '';
  RAISE NOTICE 'No data dropped or altered. Fully additive migration.';
  RAISE NOTICE '============================================================================';
END $$;
