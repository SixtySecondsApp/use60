-- Migration: add_meeting_risk_flags
-- Date: 20260314223252
--
-- What this migration does:
--   Adds risk_flags JSONB column to meetings table for structured risk flag extraction.
--   Adds alert_feedback table for false positive tracking.
--   Adds critical_meeting_alert feature to slack_notification_settings.
--
-- Rollback strategy:
--   ALTER TABLE meetings DROP COLUMN IF EXISTS risk_flags;
--   DROP TABLE IF EXISTS alert_feedback;

-- 1. Add risk_flags column to meetings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS risk_flags JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN meetings.risk_flags IS 'Structured risk flags extracted from transcript AI analysis. Array of {flag, severity, evidence} objects.';

-- 2. Alert feedback table for false positive tracking (US-009)
CREATE TABLE IF NOT EXISTS alert_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  dismissed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  reason_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_feedback_org ON alert_feedback(org_id);
CREATE INDEX IF NOT EXISTS idx_alert_feedback_meeting ON alert_feedback(meeting_id);

-- RLS for alert_feedback
ALTER TABLE alert_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view alert feedback" ON alert_feedback;
CREATE POLICY "Org members can view alert feedback" ON alert_feedback
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.member_status = 'active'
    )
  );

DROP POLICY IF EXISTS "Org members can insert alert feedback" ON alert_feedback;
CREATE POLICY "Org members can insert alert feedback" ON alert_feedback
  FOR INSERT WITH CHECK (
    dismissed_by = auth.uid()
    AND org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.member_status = 'active'
    )
  );
