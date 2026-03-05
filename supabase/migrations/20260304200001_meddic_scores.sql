-- ============================================================================
-- Migration: meddic_scores table
-- Story: MEDDIC-007
-- Purpose:
--   Store per-deal, per-field MEDDIC qualification scores (0-4) with evidence
--   text, source meeting reference, and whether the value was AI or user set.
-- ============================================================================

CREATE TABLE IF NOT EXISTS meddic_scores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  field                 TEXT NOT NULL
                          CHECK (field IN (
                            'metrics',
                            'economic_buyer',
                            'decision_criteria',
                            'decision_process',
                            'identify_pain',
                            'champion',
                            'competition'
                          )),
  score                 INTEGER NOT NULL DEFAULT 0
                          CHECK (score BETWEEN 0 AND 4),
  evidence              TEXT DEFAULT NULL,
  source_meeting_id     UUID REFERENCES meetings(id) ON DELETE SET NULL,
  source_meeting_title  TEXT DEFAULT NULL,
  updated_by            TEXT NOT NULL DEFAULT 'ai'
                          CHECK (updated_by IN ('ai', 'user')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_meddic_per_deal_field UNIQUE (deal_id, field)
);

CREATE INDEX IF NOT EXISTS idx_meddic_scores_deal_id
  ON meddic_scores (deal_id);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE meddic_scores ENABLE ROW LEVEL SECURITY;

-- Read: org members can read scores for deals they have access to
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can read meddic scores" ON meddic_scores;
CREATE POLICY "Org members can read meddic scores"
    ON meddic_scores FOR SELECT
    USING (
      deal_id IN (
        SELECT d.id FROM deals d
        JOIN organization_memberships om ON om.org_id = d.clerk_org_id::uuid
        WHERE om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Write: org members can upsert scores for their org's deals
DO $$ BEGIN
  DROP POLICY IF EXISTS "Org members can write meddic scores" ON meddic_scores;
CREATE POLICY "Org members can write meddic scores"
    ON meddic_scores FOR ALL
    USING (
      deal_id IN (
        SELECT d.id FROM deals d
        JOIN organization_memberships om ON om.org_id = d.clerk_org_id::uuid
        WHERE om.user_id = auth.uid()
      )
    )
    WITH CHECK (
      deal_id IN (
        SELECT d.id FROM deals d
        JOIN organization_memberships om ON om.org_id = d.clerk_org_id::uuid
        WHERE om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role full access meddic_scores" ON meddic_scores;
CREATE POLICY "Service role full access meddic_scores"
    ON meddic_scores FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- RPC: get_meddic_scores
-- Returns all MEDDIC scores for a deal. Caller must be an org member.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_meddic_scores(p_deal_id UUID)
RETURNS TABLE (
  id                    UUID,
  deal_id               UUID,
  field                 TEXT,
  score                 INTEGER,
  evidence              TEXT,
  source_meeting_id     UUID,
  source_meeting_title  TEXT,
  updated_by            TEXT,
  created_at            TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller has access to the deal's org
  IF NOT EXISTS (
    SELECT 1
    FROM deals d
    JOIN organization_memberships om ON om.org_id = d.clerk_org_id::uuid
    WHERE d.id = p_deal_id AND om.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ms.id,
    ms.deal_id,
    ms.field,
    ms.score,
    ms.evidence,
    ms.source_meeting_id,
    ms.source_meeting_title,
    ms.updated_by,
    ms.created_at,
    ms.updated_at
  FROM meddic_scores ms
  WHERE ms.deal_id = p_deal_id
  ORDER BY ms.field;
END;
$$;

GRANT EXECUTE ON FUNCTION get_meddic_scores(UUID) TO authenticated;

COMMENT ON TABLE meddic_scores IS
  'Per-deal MEDDIC qualification scores. score 0=Unknown, 1=Identified, 2=Developing, 3=Confirmed, 4=Locked. updated_by indicates whether AI or a user last set the value.';

COMMENT ON FUNCTION get_meddic_scores IS
  'Returns all MEDDIC field scores for a deal. Caller must be an org member with access to the deal.';
