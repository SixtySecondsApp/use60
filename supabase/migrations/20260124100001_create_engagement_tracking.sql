-- ENGAGE-001: Create agent engagement analytics table
-- Tracks user engagement with agent messages and actions for optimization

-- Create the engagement events table
CREATE TABLE IF NOT EXISTS copilot_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Event classification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'message_sent',        -- Agent sent a message (proactive or reactive)
    'message_opened',      -- User opened/viewed a message (for Slack)
    'action_taken',        -- User clicked a button or took action
    'action_dismissed',    -- User dismissed or ignored
    'sequence_executed',   -- A sequence was run
    'skill_executed',      -- A skill was run
    'confirmation_given',  -- User confirmed a HITL action
    'confirmation_denied', -- User denied a HITL action
    'clarification_asked', -- Agent asked clarifying question
    'clarification_answered' -- User answered clarifying question
  )),
  
  -- Event context
  trigger_type TEXT CHECK (trigger_type IN ('proactive', 'reactive', 'scheduled', 'slack')),
  channel TEXT CHECK (channel IN ('copilot', 'slack', 'email', 'in_app')),
  
  -- References
  conversation_id UUID,
  message_id UUID,
  sequence_key TEXT,
  skill_key TEXT,
  
  -- Timing
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_to_action_ms INTEGER, -- Time from message sent to action taken
  
  -- Value tracking
  estimated_time_saved_minutes INTEGER,
  outcome_type TEXT CHECK (outcome_type IN (
    'email_sent', 'task_created', 'deal_updated', 'meeting_scheduled',
    'research_completed', 'prep_generated', 'no_outcome'
  )),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_engagement_org_user 
  ON copilot_engagement_events(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_engagement_event_type 
  ON copilot_engagement_events(event_type);

CREATE INDEX IF NOT EXISTS idx_engagement_timestamp 
  ON copilot_engagement_events(event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_trigger_type 
  ON copilot_engagement_events(trigger_type);

CREATE INDEX IF NOT EXISTS idx_engagement_sequence 
  ON copilot_engagement_events(sequence_key) 
  WHERE sequence_key IS NOT NULL;

-- RLS policies
ALTER TABLE copilot_engagement_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can read own engagement events" ON copilot_engagement_events;
DROP POLICY IF EXISTS "Admins can read org engagement events" ON copilot_engagement_events;
DROP POLICY IF EXISTS "Service role can insert engagement events" ON copilot_engagement_events;

-- Users can only see their own engagement events
DO $$ BEGIN
  CREATE POLICY "Users can read own engagement events"
  ON copilot_engagement_events FOR SELECT
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admins can see all events in their org
DO $$ BEGIN
  CREATE POLICY "Admins can read org engagement events"
  ON copilot_engagement_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      JOIN profiles p ON p.id = om.user_id
      WHERE om.org_id = copilot_engagement_events.organization_id
        AND om.user_id = auth.uid()
        AND p.is_admin = true
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can insert (for backend tracking)
DO $$ BEGIN
  CREATE POLICY "Service role can insert engagement events"
  ON copilot_engagement_events FOR INSERT
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add comment
COMMENT ON TABLE copilot_engagement_events IS 
  'Tracks user engagement with the AI copilot for optimization and value measurement';

-- ============================================================================
-- Engagement Metrics View
-- ============================================================================

CREATE OR REPLACE VIEW copilot_engagement_summary AS
SELECT 
  organization_id,
  user_id,
  DATE_TRUNC('day', event_timestamp) AS event_date,
  
  -- Message metrics
  COUNT(*) FILTER (WHERE event_type = 'message_sent') AS messages_sent,
  COUNT(*) FILTER (WHERE event_type = 'action_taken') AS actions_taken,
  COUNT(*) FILTER (WHERE event_type = 'action_dismissed') AS actions_dismissed,
  
  -- Proactive vs reactive
  COUNT(*) FILTER (WHERE trigger_type = 'proactive') AS proactive_count,
  COUNT(*) FILTER (WHERE trigger_type = 'reactive') AS reactive_count,
  
  -- Confirmation metrics
  COUNT(*) FILTER (WHERE event_type = 'confirmation_given') AS confirmations_given,
  COUNT(*) FILTER (WHERE event_type = 'confirmation_denied') AS confirmations_denied,
  
  -- Time saved
  COALESCE(SUM(estimated_time_saved_minutes), 0) AS total_time_saved_minutes,
  
  -- Response time
  AVG(time_to_action_ms) FILTER (WHERE time_to_action_ms IS NOT NULL) AS avg_time_to_action_ms,
  
  -- Outcomes
  COUNT(*) FILTER (WHERE outcome_type = 'email_sent') AS emails_sent,
  COUNT(*) FILTER (WHERE outcome_type = 'task_created') AS tasks_created,
  COUNT(*) FILTER (WHERE outcome_type = 'prep_generated') AS preps_generated
  
FROM copilot_engagement_events
GROUP BY organization_id, user_id, DATE_TRUNC('day', event_timestamp);

-- ============================================================================
-- Function to log engagement events
-- ============================================================================

CREATE OR REPLACE FUNCTION log_copilot_engagement(
  p_org_id UUID,
  p_user_id UUID,
  p_event_type TEXT,
  p_trigger_type TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT 'copilot',
  p_conversation_id UUID DEFAULT NULL,
  p_message_id UUID DEFAULT NULL,
  p_sequence_key TEXT DEFAULT NULL,
  p_skill_key TEXT DEFAULT NULL,
  p_time_to_action_ms INTEGER DEFAULT NULL,
  p_estimated_time_saved INTEGER DEFAULT NULL,
  p_outcome_type TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO copilot_engagement_events (
    organization_id,
    user_id,
    event_type,
    trigger_type,
    channel,
    conversation_id,
    message_id,
    sequence_key,
    skill_key,
    time_to_action_ms,
    estimated_time_saved_minutes,
    outcome_type,
    metadata
  ) VALUES (
    p_org_id,
    p_user_id,
    p_event_type,
    p_trigger_type,
    p_channel,
    p_conversation_id,
    p_message_id,
    p_sequence_key,
    p_skill_key,
    p_time_to_action_ms,
    p_estimated_time_saved,
    p_outcome_type,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION log_copilot_engagement TO authenticated;
GRANT EXECUTE ON FUNCTION log_copilot_engagement TO service_role;
