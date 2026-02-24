-- ============================================================================
-- AC-001: Create Action Centre tables
-- Personal inbox for AI-generated suggestions awaiting user approval
-- ============================================================================

-- Main table for action centre items
CREATE TABLE IF NOT EXISTS action_centre_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Action details
  action_type TEXT NOT NULL CHECK (action_type IN (
    'email',           -- Draft email to send
    'task',            -- Task to create
    'slack_message',   -- Slack message to post
    'field_update',    -- CRM field update
    'alert',           -- Deal/pipeline alert
    'insight',         -- AI insight/recommendation
    'meeting_prep'     -- Meeting preparation brief
  )),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'info')),
  title TEXT NOT NULL,
  description TEXT,
  preview_data JSONB DEFAULT '{}',  -- Full action payload for preview/edit

  -- Related entities
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,

  -- State management
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed', 'done', 'expired')),

  -- Source tracking
  source_type TEXT NOT NULL CHECK (source_type IN (
    'proactive_pipeline',    -- From daily pipeline analysis
    'proactive_meeting',     -- From meeting prep
    'copilot_conversation',  -- From copilot chat
    'sequence'               -- From sequence execution
  )),
  source_id TEXT,  -- Reference to workflow_execution or conversation

  -- Slack sync
  slack_message_ts TEXT,
  slack_channel_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ,  -- When approved/dismissed
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_action_centre_user_status
  ON action_centre_items(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_centre_org_status
  ON action_centre_items(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_centre_slack
  ON action_centre_items(slack_channel_id, slack_message_ts)
  WHERE slack_message_ts IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_centre_expires
  ON action_centre_items(expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_action_centre_source
  ON action_centre_items(source_type, source_id);

-- RLS policies
ALTER TABLE action_centre_items ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role has full access to action_centre_items"
  ON action_centre_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own items
CREATE POLICY "Users can view own action centre items"
  ON action_centre_items
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own items (approve/dismiss)
CREATE POLICY "Users can update own action centre items"
  ON action_centre_items
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Comment
COMMENT ON TABLE action_centre_items IS 'Personal inbox for AI-generated suggestions awaiting user approval';

-- ============================================================================
-- Function to expire old pending items
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_action_centre_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE action_centre_items
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

COMMENT ON FUNCTION expire_action_centre_items IS 'Expires action centre items that have passed their expiration time';

-- ============================================================================
-- Function to get pending count for badge
-- ============================================================================

CREATE OR REPLACE FUNCTION get_action_centre_pending_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM action_centre_items
  WHERE user_id = p_user_id
    AND status = 'pending'
    AND expires_at > NOW();
$$;

COMMENT ON FUNCTION get_action_centre_pending_count IS 'Returns count of pending action centre items for nav badge';

-- ============================================================================
-- RPC to create action centre item (for edge functions)
-- ============================================================================

CREATE OR REPLACE FUNCTION create_action_centre_item(
  p_user_id UUID,
  p_org_id UUID,
  p_action_type TEXT,
  p_risk_level TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_preview_data JSONB DEFAULT '{}',
  p_source_type TEXT DEFAULT 'copilot_conversation',
  p_source_id TEXT DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL,
  p_slack_channel_id TEXT DEFAULT NULL,
  p_slack_message_ts TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id UUID;
BEGIN
  INSERT INTO action_centre_items (
    user_id,
    organization_id,
    action_type,
    risk_level,
    title,
    description,
    preview_data,
    source_type,
    source_id,
    contact_id,
    deal_id,
    meeting_id,
    slack_channel_id,
    slack_message_ts
  ) VALUES (
    p_user_id,
    p_org_id,
    p_action_type,
    p_risk_level,
    p_title,
    p_description,
    p_preview_data,
    p_source_type,
    p_source_id,
    p_contact_id,
    p_deal_id,
    p_meeting_id,
    p_slack_channel_id,
    p_slack_message_ts
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;

COMMENT ON FUNCTION create_action_centre_item IS 'Creates a new action centre item from edge functions';
