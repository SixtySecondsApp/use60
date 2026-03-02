-- ============================================================================
-- Migration: CRM Field Updates Table
-- Purpose: Track AI-initiated CRM field changes with undo support
-- Feature: Proactive Agent V2 - Post-Meeting CRM Sync
-- Date: 2026-02-15
-- ============================================================================

-- =============================================================================
-- Enum: Confidence Level
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE crm_update_confidence AS ENUM (
    'high',     -- High confidence (0.8+) - from explicit meeting discussion
    'medium',   -- Medium confidence (0.5-0.8) - inferred from context
    'low'       -- Low confidence (<0.5) - speculative/suggested
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE crm_update_confidence IS 'Confidence level for AI-initiated CRM field changes';

-- =============================================================================
-- Table: crm_field_updates
-- Tracks AI-initiated CRM field changes with full audit trail and undo support
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_field_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and deal context
  org_id TEXT NOT NULL,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- User context (the rep whose meeting triggered the update)
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Field change details
  field_name TEXT NOT NULL CHECK (field_name IN (
    'stage',           -- Pipeline stage change
    'next_steps',      -- Next steps/action items
    'close_date',      -- Expected close date
    'deal_value',      -- Deal amount/value
    'stakeholders',    -- Key stakeholders identified
    'blockers',        -- Deal blockers/risks
    'summary',         -- Deal summary/notes
    'custom_field'     -- Custom field (field_name stored separately)
  )),

  -- Change tracking
  old_value JSONB DEFAULT NULL,  -- Value before AI update (null if field was empty)
  new_value JSONB NOT NULL,       -- Value after AI update
  confidence crm_update_confidence NOT NULL,
  reasoning TEXT,                 -- AI explanation of why this field changed

  -- Source tracking (orchestrator job that made this change)
  source_job_id UUID REFERENCES sequence_jobs(id) ON DELETE SET NULL,

  -- Undo tracking
  undone_at TIMESTAMPTZ DEFAULT NULL,
  undone_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_crm_field_updates_deal
  ON crm_field_updates(deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_field_updates_org
  ON crm_field_updates(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_field_updates_job
  ON crm_field_updates(source_job_id)
  WHERE source_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_field_updates_user
  ON crm_field_updates(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_field_updates_undone
  ON crm_field_updates(undone_at)
  WHERE undone_at IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE crm_field_updates ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view updates
DROP POLICY IF EXISTS "Users can view org CRM field updates" ON crm_field_updates;
DO $$ BEGIN
  CREATE POLICY "Users can view org CRM field updates"
  ON crm_field_updates FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to crm_field_updates" ON crm_field_updates;
DO $$ BEGIN
  CREATE POLICY "Service role has full access to crm_field_updates"
  ON crm_field_updates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE crm_field_updates IS 'Tracks AI-initiated CRM field changes with full audit trail and undo support. Part of Proactive Agent V2 post-meeting flow.';

COMMENT ON COLUMN crm_field_updates.org_id IS 'Organization identifier (clerk_org_id)';
COMMENT ON COLUMN crm_field_updates.deal_id IS 'Deal that was updated';
COMMENT ON COLUMN crm_field_updates.user_id IS 'User whose meeting triggered this update';
COMMENT ON COLUMN crm_field_updates.field_name IS 'CRM field that was changed (stage, next_steps, close_date, etc.)';
COMMENT ON COLUMN crm_field_updates.old_value IS 'Value before AI update (null if field was empty)';
COMMENT ON COLUMN crm_field_updates.new_value IS 'Value after AI update';
COMMENT ON COLUMN crm_field_updates.confidence IS 'AI confidence level (high/medium/low)';
COMMENT ON COLUMN crm_field_updates.reasoning IS 'AI explanation of why this field was changed';
COMMENT ON COLUMN crm_field_updates.source_job_id IS 'Orchestrator job (sequence_jobs) that made this change';
COMMENT ON COLUMN crm_field_updates.undone_at IS 'Timestamp when user clicked undo (null if not undone)';
COMMENT ON COLUMN crm_field_updates.undone_by IS 'User who clicked undo';

-- =============================================================================
-- RPC: Create CRM field update (for edge functions)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_crm_field_update(
  p_org_id TEXT,
  p_deal_id UUID,
  p_user_id UUID,
  p_field_name TEXT,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_confidence TEXT DEFAULT 'medium',
  p_reasoning TEXT DEFAULT NULL,
  p_source_job_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update_id UUID;
BEGIN
  -- Validate confidence level
  IF p_confidence NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid confidence level: %', p_confidence;
  END IF;

  -- Insert the update record
  INSERT INTO crm_field_updates (
    org_id,
    deal_id,
    user_id,
    field_name,
    old_value,
    new_value,
    confidence,
    reasoning,
    source_job_id
  ) VALUES (
    p_org_id,
    p_deal_id,
    p_user_id,
    p_field_name,
    p_old_value,
    p_new_value,
    p_confidence::crm_update_confidence,
    p_reasoning,
    p_source_job_id
  )
  RETURNING id INTO v_update_id;

  RETURN v_update_id;
END;
$$;

COMMENT ON FUNCTION create_crm_field_update IS 'Creates a new CRM field update record from edge functions';

GRANT EXECUTE ON FUNCTION create_crm_field_update TO authenticated;
GRANT EXECUTE ON FUNCTION create_crm_field_update TO service_role;

-- =============================================================================
-- RPC: Undo CRM field update
-- =============================================================================

CREATE OR REPLACE FUNCTION undo_crm_field_update(
  p_update_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update RECORD;
BEGIN
  -- Get the update record
  SELECT * INTO v_update
  FROM crm_field_updates
  WHERE id = p_update_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CRM field update not found: %', p_update_id;
  END IF;

  -- Check if already undone
  IF v_update.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'CRM field update already undone';
  END IF;

  -- Verify user has access to this org
  IF NOT EXISTS (
    SELECT 1
    FROM organization_memberships
    WHERE user_id = p_user_id
      AND org_id::text = v_update.org_id
  ) THEN
    RAISE EXCEPTION 'User does not have access to this organization';
  END IF;

  -- Mark as undone
  UPDATE crm_field_updates
  SET
    undone_at = NOW(),
    undone_by = p_user_id
  WHERE id = p_update_id;

  -- Revert the field value on the deal
  -- (This is a simplified implementation - in production you may want
  -- to handle field-specific logic or use dynamic SQL)
  EXECUTE format(
    'UPDATE deals SET %I = $1 WHERE id = $2',
    v_update.field_name
  ) USING v_update.old_value, v_update.deal_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION undo_crm_field_update IS 'Marks a CRM field update as undone and reverts the field value';

GRANT EXECUTE ON FUNCTION undo_crm_field_update TO authenticated;

-- =============================================================================
-- RPC: Get recent CRM updates for a deal
-- =============================================================================

CREATE OR REPLACE FUNCTION get_deal_crm_updates(
  p_deal_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  field_name TEXT,
  old_value JSONB,
  new_value JSONB,
  confidence crm_update_confidence,
  reasoning TEXT,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  user_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    cfu.id,
    cfu.field_name,
    cfu.old_value,
    cfu.new_value,
    cfu.confidence,
    cfu.reasoning,
    cfu.undone_at,
    cfu.created_at,
    COALESCE(CONCAT_WS(' ', p.first_name, p.last_name), p.email) as user_name
  FROM crm_field_updates cfu
  LEFT JOIN profiles p ON p.id = cfu.user_id
  WHERE cfu.deal_id = p_deal_id
  ORDER BY cfu.created_at DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_deal_crm_updates IS 'Returns recent CRM field updates for a deal with user info';

GRANT EXECUTE ON FUNCTION get_deal_crm_updates TO authenticated;

-- =============================================================================
-- RPC: Get CRM update stats for a user
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_crm_update_stats(
  p_user_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  total_updates BIGINT,
  updates_by_confidence JSONB,
  updates_by_field JSONB,
  undo_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.total_updates,
    COALESCE(c.updates_by_confidence, '{}'::jsonb),
    COALESCE(f.updates_by_field, '{}'::jsonb),
    t.undo_rate
  FROM (
    SELECT
      COUNT(*)::bigint as total_updates,
      ROUND(
        COUNT(*) FILTER (WHERE undone_at IS NOT NULL)::NUMERIC /
        NULLIF(COUNT(*)::NUMERIC, 0) * 100, 2
      ) as undo_rate
    FROM crm_field_updates
    WHERE user_id = p_user_id
      AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  ) t
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(confidence::text, cnt) as updates_by_confidence
    FROM (
      SELECT confidence, COUNT(*) as cnt
      FROM crm_field_updates
      WHERE user_id = p_user_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY confidence
    ) sub
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(field_name, cnt) as updates_by_field
    FROM (
      SELECT field_name, COUNT(*) as cnt
      FROM crm_field_updates
      WHERE user_id = p_user_id
        AND created_at >= NOW() - (p_days || ' days')::INTERVAL
      GROUP BY field_name
    ) sub
  ) f ON true;
$$;

COMMENT ON FUNCTION get_user_crm_update_stats IS 'Returns CRM update statistics for a user over the last N days';

GRANT EXECUTE ON FUNCTION get_user_crm_update_stats TO authenticated;
