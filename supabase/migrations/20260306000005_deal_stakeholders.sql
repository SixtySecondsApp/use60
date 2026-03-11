-- ============================================================================
-- Migration: deal_stakeholders table
-- Purpose: Stakeholder mapping & buying committee tracking per deal
-- Feature: PRD-121 Stakeholder Mapping & Buying Committee
-- Date: 2026-03-03
-- ============================================================================

-- =============================================================================
-- Enum: stakeholder_role
-- Roles a contact can play in a deal
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE stakeholder_role AS ENUM (
    'economic_buyer',
    'champion',
    'technical_evaluator',
    'end_user',
    'blocker',
    'coach',
    'influencer',
    'legal',
    'procurement',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Enum: stakeholder_influence
-- Influence level of a stakeholder on the buying decision
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE stakeholder_influence AS ENUM (
    'high',
    'medium',
    'low',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Enum: stakeholder_engagement_status
-- Engagement status calculated from activity data
-- active  : last contact < 7 days
-- warming : last contact 7-21 days
-- cold    : last contact > 21 days
-- unknown : no activity data
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE stakeholder_engagement_status AS ENUM (
    'active',
    'warming',
    'cold',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Table: deal_stakeholders
-- One row per contact-deal relationship in the buying committee
-- =============================================================================

CREATE TABLE IF NOT EXISTS deal_stakeholders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  deal_id               UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id            UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id                TEXT NOT NULL,  -- matches deals.clerk_org_id

  -- Role & influence
  role                  stakeholder_role NOT NULL DEFAULT 'unknown',
  influence             stakeholder_influence NOT NULL DEFAULT 'unknown',

  -- Sentiment: -1.0 (negative) to 1.0 (positive), null = not assessed
  sentiment_score       NUMERIC(3, 2) CHECK (sentiment_score BETWEEN -1 AND 1),

  -- Engagement
  engagement_status     stakeholder_engagement_status NOT NULL DEFAULT 'unknown',
  days_since_last_contact INTEGER,        -- cached, recalculated on activity sync
  meeting_count         INTEGER NOT NULL DEFAULT 0,
  email_count           INTEGER NOT NULL DEFAULT 0,
  last_contacted_at     TIMESTAMPTZ,

  -- Attribution
  auto_detected         BOOLEAN NOT NULL DEFAULT false,
  source_meeting_id     UUID REFERENCES meetings(id) ON DELETE SET NULL,
  confidence_score      NUMERIC(3, 2) CHECK (confidence_score BETWEEN 0 AND 1),
  needs_review          BOOLEAN NOT NULL DEFAULT false,  -- low-confidence detections

  -- Notes
  notes                 TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One stakeholder entry per deal-contact pair
  CONSTRAINT unique_deal_contact_stakeholder UNIQUE (deal_id, contact_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_deal_id
  ON deal_stakeholders(deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_contact_id
  ON deal_stakeholders(contact_id);

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_org_id
  ON deal_stakeholders(org_id);

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_role
  ON deal_stakeholders(deal_id, role);

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_engagement
  ON deal_stakeholders(deal_id, engagement_status);

CREATE INDEX IF NOT EXISTS idx_deal_stakeholders_needs_review
  ON deal_stakeholders(org_id, needs_review)
  WHERE needs_review = true;

-- =============================================================================
-- Trigger: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_deal_stakeholders_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stakeholders_updated_at ON deal_stakeholders;
DROP TRIGGER IF EXISTS trg_deal_stakeholders_updated_at ON deal_stakeholders;
CREATE TRIGGER trg_deal_stakeholders_updated_at
  BEFORE UPDATE ON deal_stakeholders
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_stakeholders_updated_at();

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE deal_stakeholders ENABLE ROW LEVEL SECURITY;

-- Org members can view stakeholders for their deals
DROP POLICY IF EXISTS "Org members can view deal stakeholders" ON deal_stakeholders;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can view deal stakeholders" ON deal_stakeholders;
CREATE POLICY "Org members can view deal stakeholders"
  ON deal_stakeholders FOR SELECT
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

-- Org members can insert stakeholders for their deals
DROP POLICY IF EXISTS "Org members can insert deal stakeholders" ON deal_stakeholders;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can insert deal stakeholders" ON deal_stakeholders;
CREATE POLICY "Org members can insert deal stakeholders"
  ON deal_stakeholders FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org members can update stakeholders for their deals
DROP POLICY IF EXISTS "Org members can update deal stakeholders" ON deal_stakeholders;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can update deal stakeholders" ON deal_stakeholders;
CREATE POLICY "Org members can update deal stakeholders"
  ON deal_stakeholders FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org members can delete stakeholders for their deals
DROP POLICY IF EXISTS "Org members can delete deal stakeholders" ON deal_stakeholders;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can delete deal stakeholders" ON deal_stakeholders;
CREATE POLICY "Org members can delete deal stakeholders"
  ON deal_stakeholders FOR DELETE
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

-- Service role has full access
DROP POLICY IF EXISTS "Service role has full access to deal_stakeholders" ON deal_stakeholders;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role has full access to deal_stakeholders" ON deal_stakeholders;
CREATE POLICY "Service role has full access to deal_stakeholders"
  ON deal_stakeholders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE deal_stakeholders IS 'Tracks buying committee members per deal with roles, influence levels, sentiment, and engagement status. Part of PRD-121 Stakeholder Mapping.';

COMMENT ON COLUMN deal_stakeholders.role IS 'Stakeholder role in the buying process (economic_buyer, champion, technical_evaluator, etc.)';
COMMENT ON COLUMN deal_stakeholders.influence IS 'Influence level on the buying decision (high, medium, low)';
COMMENT ON COLUMN deal_stakeholders.sentiment_score IS 'Sentiment score from -1 (negative) to 1 (positive), null if not assessed';
COMMENT ON COLUMN deal_stakeholders.engagement_status IS 'Calculated from activity data: active (<7d), warming (7-21d), cold (>21d), unknown';
COMMENT ON COLUMN deal_stakeholders.auto_detected IS 'True if auto-populated from meeting attendees or transcript extraction';
COMMENT ON COLUMN deal_stakeholders.source_meeting_id IS 'Meeting from which this stakeholder was auto-detected';
COMMENT ON COLUMN deal_stakeholders.confidence_score IS 'AI confidence score for auto-detected role assignments (0-1)';
COMMENT ON COLUMN deal_stakeholders.needs_review IS 'True if low-confidence detection needs human review';
