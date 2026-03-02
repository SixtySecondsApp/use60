-- =============================================================================
-- PRD-CC-001: Conversational Copilot Schema Extensions
-- Extends slack_copilot_threads with entity tracking and multi-turn context.
-- Creates slack_copilot_analytics for per-query tracking.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend slack_copilot_threads with entity tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE slack_copilot_threads
  ADD COLUMN IF NOT EXISTS active_deal_id UUID,
  ADD COLUMN IF NOT EXISTS active_contact_id UUID,
  ADD COLUMN IF NOT EXISTS active_company_id UUID,
  ADD COLUMN IF NOT EXISTS turns JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS loaded_context JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intents_used TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actions_taken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS credits_consumed NUMERIC(10,4) DEFAULT 0;

-- Index for finding active threads per user (ordered by recency)
CREATE INDEX IF NOT EXISTS idx_slack_threads_active
  ON slack_copilot_threads (user_id, last_message_at DESC);

-- Index for finding threads by active deal
CREATE INDEX IF NOT EXISTS idx_slack_threads_deal
  ON slack_copilot_threads (active_deal_id)
  WHERE active_deal_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Analytics table for conversational usage tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slack_copilot_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  thread_ts TEXT NOT NULL,
  intent TEXT NOT NULL,
  entities JSONB,
  confidence NUMERIC(3,2),
  data_sources_used TEXT[],
  credits_consumed NUMERIC(10,4),
  response_time_ms INTEGER,
  model_used TEXT,
  action_taken TEXT,
  user_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for per-user analytics queries
CREATE INDEX IF NOT EXISTS idx_copilot_analytics_user
  ON slack_copilot_analytics (user_id, created_at DESC);

-- Index for per-intent analytics queries
CREATE INDEX IF NOT EXISTS idx_copilot_analytics_intent
  ON slack_copilot_analytics (intent, created_at DESC);

-- Index for org-wide analytics
CREATE INDEX IF NOT EXISTS idx_copilot_analytics_org
  ON slack_copilot_analytics (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS policies for analytics table
-- ---------------------------------------------------------------------------
ALTER TABLE slack_copilot_analytics ENABLE ROW LEVEL SECURITY;

-- Users can read their own analytics
DO $$ BEGIN
  CREATE POLICY "Users can read own copilot analytics"
    ON slack_copilot_analytics
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can do everything (for edge functions)
DO $$ BEGIN
  CREATE POLICY "Service role full access to copilot analytics"
    ON slack_copilot_analytics
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
