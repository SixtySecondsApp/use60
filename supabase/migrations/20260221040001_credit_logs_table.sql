-- ============================================================================
-- Credit Logs & Monthly Summaries
-- ============================================================================
-- Per-user credit usage log (30-day rolling window for users, 45-day retention
-- for purge jobs) plus a monthly rollup table for analytics and billing summaries.
-- action_id references credit_menu by convention but has no FK — actions may
-- be renamed or removed from the menu without breaking historical logs.

-- ============================================================================
-- 1. credit_logs — per-action usage log
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL,
  org_id  UUID NOT NULL,

  -- Action reference (soft link — no FK so deleted actions don't break history)
  action_id    TEXT NOT NULL,
  display_name TEXT NOT NULL,

  -- Cost
  credits_charged DECIMAL(10,4) NOT NULL DEFAULT 0,

  -- Intelligence tier used for this action
  intelligence_tier TEXT CHECK (intelligence_tier IN ('low', 'medium', 'high')),

  -- Balance snapshot
  balance_before DECIMAL(10,4),
  balance_after  DECIMAL(10,4),

  -- Optional context
  context_summary TEXT,
  context_refs    JSONB NOT NULL DEFAULT '{}',

  -- How this charge was initiated
  source TEXT NOT NULL DEFAULT 'user_initiated'
    CHECK (source IN ('user_initiated', 'agent_automated', 'sequence_step', 'scheduled', 'grace_threshold')),

  -- Agent type (e.g. 'copilot_autonomous', 'workflow_ai_node')
  agent_type TEXT,

  -- Timestamps (immutable — no updated_at)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Final status of the charge
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'refunded'))
);

-- ============================================================================
-- 2. credit_log_summaries — monthly rollup per user / org / category
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_log_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID NOT NULL,
  org_id  UUID NOT NULL,

  -- First day of the calendar month (e.g. 2026-02-01)
  month DATE NOT NULL,

  -- Category (maps to credit_menu.category)
  category TEXT NOT NULL,

  -- Aggregated values
  total_credits DECIMAL(10,4) NOT NULL DEFAULT 0,
  action_count  INTEGER       NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per (org, user, month, category)
  UNIQUE (org_id, user_id, month, category)
);

-- ============================================================================
-- 3. Indexes
-- ============================================================================

-- Fast per-user history queries (most common read path)
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_time
  ON credit_logs(user_id, created_at DESC);

-- Fast per-org reporting queries
CREATE INDEX IF NOT EXISTS idx_credit_logs_org_time
  ON credit_logs(org_id, created_at DESC);

-- Efficient 45-day purge scans (no leading user_id/org_id column)
CREATE INDEX IF NOT EXISTS idx_credit_logs_purge
  ON credit_logs(created_at);

-- Per-action analytics
CREATE INDEX IF NOT EXISTS idx_credit_logs_action
  ON credit_logs(action_id, created_at DESC);

-- Summary lookup
CREATE INDEX IF NOT EXISTS idx_credit_log_summaries_lookup
  ON credit_log_summaries(org_id, user_id, month);

-- ============================================================================
-- 4. updated_at trigger for credit_log_summaries
-- ============================================================================

CREATE OR REPLACE FUNCTION update_credit_log_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_credit_log_summaries_updated_at ON credit_log_summaries;
CREATE TRIGGER trigger_credit_log_summaries_updated_at
  BEFORE UPDATE ON credit_log_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_log_summaries_updated_at();

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE credit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_log_summaries ENABLE ROW LEVEL SECURITY;

-- --- credit_logs ---

-- Authenticated users can read their own logs within the last 30 days
DROP POLICY IF EXISTS "Users can read own credit_logs (30 days)" ON credit_logs;
CREATE POLICY "Users can read own credit_logs (30 days)"
  ON credit_logs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > NOW() - INTERVAL '30 days'
  );

-- Service role has unrestricted access (for edge functions and purge jobs)
DROP POLICY IF EXISTS "Service role has full access to credit_logs" ON credit_logs;
CREATE POLICY "Service role has full access to credit_logs"
  ON credit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- --- credit_log_summaries ---

-- Authenticated users can read their own summaries (all months)
DROP POLICY IF EXISTS "Users can read own credit_log_summaries" ON credit_log_summaries;
CREATE POLICY "Users can read own credit_log_summaries"
  ON credit_log_summaries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role has unrestricted access
DROP POLICY IF EXISTS "Service role has full access to credit_log_summaries" ON credit_log_summaries;
CREATE POLICY "Service role has full access to credit_log_summaries"
  ON credit_log_summaries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 6. RPC get_user_credit_logs — user-scoped log retrieval (max 30 days)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_credit_logs(
  p_user_id UUID,
  p_days    INT DEFAULT 30
)
RETURNS SETOF credit_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM credit_logs
  WHERE user_id = p_user_id
    -- Non-admin callers cannot request more than 30 days of history
    AND created_at > NOW() - (LEAST(p_days, 30) || ' days')::INTERVAL
  ORDER BY created_at DESC;
$$;

-- ============================================================================
-- 7. Comments
-- ============================================================================

COMMENT ON TABLE credit_logs IS 'Per-action credit usage log. Rolling 30-day window for user queries; purge job removes rows older than 45 days.';
COMMENT ON COLUMN credit_logs.log_id          IS 'Unique identifier for this log entry';
COMMENT ON COLUMN credit_logs.action_id       IS 'Soft reference to credit_menu.action_id — no FK so history survives action deletion';
COMMENT ON COLUMN credit_logs.display_name    IS 'Human-readable action name captured at charge time';
COMMENT ON COLUMN credit_logs.credits_charged IS 'Credits deducted for this action (DECIMAL for fractional billing)';
COMMENT ON COLUMN credit_logs.intelligence_tier IS 'AI model tier used: low | medium | high';
COMMENT ON COLUMN credit_logs.balance_before  IS 'Org credit balance immediately before this charge';
COMMENT ON COLUMN credit_logs.balance_after   IS 'Org credit balance immediately after this charge';
COMMENT ON COLUMN credit_logs.context_summary IS 'Short free-text description of what triggered this charge';
COMMENT ON COLUMN credit_logs.context_refs    IS 'JSONB bag of related entity IDs (deal_id, meeting_id, contact_id, etc.)';
COMMENT ON COLUMN credit_logs.source          IS 'How the charge was initiated: user_initiated | agent_automated | sequence_step | scheduled | grace_threshold';
COMMENT ON COLUMN credit_logs.agent_type      IS 'Agent subsystem that triggered the charge (e.g. copilot_autonomous, workflow_ai_node)';
COMMENT ON COLUMN credit_logs.status          IS 'Final disposition: completed | failed | refunded';

COMMENT ON TABLE credit_log_summaries IS 'Monthly credit usage rollup per user / org / category. Upserted by the credit-write edge function after each charge.';
COMMENT ON COLUMN credit_log_summaries.month    IS 'First day of the calendar month (e.g. 2026-02-01)';
COMMENT ON COLUMN credit_log_summaries.category IS 'Action category (maps to credit_menu.category)';
COMMENT ON COLUMN credit_log_summaries.total_credits IS 'Sum of credits_charged for this user/org/month/category';
COMMENT ON COLUMN credit_log_summaries.action_count  IS 'Number of individual actions in this bucket';

COMMENT ON FUNCTION get_user_credit_logs IS 'Returns credit_logs for a given user ordered by recency. p_days is capped at 30 to prevent non-admin data dumps.';
