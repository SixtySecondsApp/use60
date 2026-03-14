-- Migration: copilot_memories_retention_decay
-- Date: 20260314104349
--
-- What this migration does:
--   1. Add decay_score column (0.0-1.0) to copilot_memories for relevance decay
--   2. Add partial index on decay_score for efficient Brain page queries
--   3. Schedule pg_cron retention job: delete memories older than 365 days with low decay
--
-- Rollback strategy:
--   ALTER TABLE copilot_memories DROP COLUMN IF EXISTS decay_score;
--   SELECT cron.unschedule('copilot-memories-retention');

-- Add decay_score column
DO $$ BEGIN
  ALTER TABLE copilot_memories ADD COLUMN decay_score NUMERIC(3,2) DEFAULT 1.0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add constraint
DO $$ BEGIN
  ALTER TABLE copilot_memories
    ADD CONSTRAINT chk_decay_score CHECK (decay_score >= 0 AND decay_score <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Partial index for Brain page: active memories sorted by decay
CREATE INDEX IF NOT EXISTS idx_copilot_memories_decay
  ON copilot_memories (user_id, decay_score DESC)
  WHERE decay_score > 0.1;

-- Retention: delete stale memories (365+ days old, low decay, no recent access)
-- Runs daily at 4am UTC
SELECT cron.schedule(
  'copilot-memories-retention',
  '0 4 * * *',
  $$
    DELETE FROM copilot_memories
    WHERE created_at < NOW() - INTERVAL '365 days'
      AND decay_score < 0.1
      AND (last_accessed_at IS NULL OR last_accessed_at < NOW() - INTERVAL '90 days');
  $$
);
