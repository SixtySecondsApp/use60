-- ============================================================================
-- Migration: Command Centre Backpressure Columns
-- Purpose: Add queue management columns to command_centre_items to support
--          ordered, rate-limited processing with priority lanes and attempt
--          tracking for retry backpressure.
-- Story: BP-001
-- Date: 2026-02-22
-- ============================================================================

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS queue_priority INTEGER NOT NULL DEFAULT 2
    CHECK (queue_priority >= 0 AND queue_priority <= 3);

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

ALTER TABLE command_centre_items
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- Index: backpressure queue ordering
-- Supports ordered dequeue by priority lane then arrival time.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_cc_queue_priority
  ON command_centre_items (queue_priority, queued_at);

-- =============================================================================
-- Column comments
-- =============================================================================

COMMENT ON COLUMN command_centre_items.queue_priority IS
  'Processing priority lane: 0 = critical, 1 = high, 2 = normal (default), 3 = low. Lower value dequeued first.';

COMMENT ON COLUMN command_centre_items.queued_at IS
  'Timestamp when the item entered the processing queue. Used with queue_priority for FIFO ordering within each priority lane.';

COMMENT ON COLUMN command_centre_items.processing_started_at IS
  'Timestamp when a worker last claimed this item for processing. NULL if not yet picked up. Used for stall detection and timeout recovery.';

COMMENT ON COLUMN command_centre_items.processing_attempts IS
  'Number of times processing has been attempted. Incremented on each dequeue. Used to enforce retry limits and trigger dead-letter handling.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222220003_cc_backpressure.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: BP-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns added to command_centre_items:';
  RAISE NOTICE '  queue_priority        — priority lane 0-3 (default 2 = normal)';
  RAISE NOTICE '  queued_at             — queue entry timestamp (default NOW())';
  RAISE NOTICE '  processing_started_at — worker claim timestamp (nullable)';
  RAISE NOTICE '  processing_attempts   — retry counter (default 0)';
  RAISE NOTICE '';
  RAISE NOTICE 'Index:';
  RAISE NOTICE '  idx_cc_queue_priority — ordered dequeue by (queue_priority, queued_at)';
  RAISE NOTICE '============================================================================';
END $$;
