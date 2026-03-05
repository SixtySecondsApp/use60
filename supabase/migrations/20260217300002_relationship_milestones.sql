-- ============================================================================
-- MIL-001: Relationship Milestones table
-- Tracks key relationship events that trigger proactive outreach
-- (renewals, onboarding check-ins, QBRs, trial endings, contract expirations)
-- ============================================================================

-- Relationship Milestones table
CREATE TABLE IF NOT EXISTS relationship_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  milestone_type TEXT NOT NULL,
  target_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add CHECK constraints
ALTER TABLE relationship_milestones DROP CONSTRAINT IF EXISTS relationship_milestones_type_check;
DO $$ BEGIN
  ALTER TABLE relationship_milestones ADD CONSTRAINT relationship_milestones_type_check
  CHECK (milestone_type IN (
    'onboarding_checkin',
    'qbr_due',
    'renewal_reminder',
    'trial_ending',
    'contract_expiring'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE relationship_milestones DROP CONSTRAINT IF EXISTS relationship_milestones_status_check;
DO $$ BEGIN
  ALTER TABLE relationship_milestones ADD CONSTRAINT relationship_milestones_status_check
  CHECK (status IN (
    'pending',
    'signal_sent',
    'completed',
    'skipped'
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Performance index for scanner queries
CREATE INDEX IF NOT EXISTS idx_relationship_milestones_scanner
  ON relationship_milestones (org_id, status, target_date)
  WHERE status = 'pending';

-- Index for contact/deal lookups
CREATE INDEX IF NOT EXISTS idx_relationship_milestones_contact
  ON relationship_milestones (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relationship_milestones_deal
  ON relationship_milestones (deal_id)
  WHERE deal_id IS NOT NULL;

-- RLS
ALTER TABLE relationship_milestones ENABLE ROW LEVEL SECURITY;

-- Org members can read milestones for their org
DROP POLICY IF EXISTS "Org members can view milestones" ON relationship_milestones;
DO $$ BEGIN
  CREATE POLICY "Org members can view milestones"
  ON relationship_milestones FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can do everything (for cron scanner)
DROP POLICY IF EXISTS "Service role full access" ON relationship_milestones;
DO $$ BEGIN
  CREATE POLICY "Service role full access"
  ON relationship_milestones FOR ALL
  USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_relationship_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS relationship_milestones_updated_at ON relationship_milestones;
CREATE TRIGGER relationship_milestones_updated_at
  BEFORE UPDATE ON relationship_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_milestones_updated_at();

-- Add comments
COMMENT ON TABLE relationship_milestones IS 'Tracks key relationship events that trigger proactive outreach';
COMMENT ON COLUMN relationship_milestones.milestone_type IS 'Type of milestone: onboarding_checkin, qbr_due, renewal_reminder, trial_ending, contract_expiring';
COMMENT ON COLUMN relationship_milestones.status IS 'Milestone status: pending, signal_sent, completed, skipped';
COMMENT ON COLUMN relationship_milestones.target_date IS 'When this milestone is scheduled to trigger';
COMMENT ON COLUMN relationship_milestones.metadata IS 'Additional context (e.g., contract_value, days_in_trial, qbr_topics)';
