-- ============================================================================
-- DM-002: Deal Memory Snapshots Table (PRD-DM-001)
-- The Institutional Knowledge Graph — Pre-computed Deal Briefings
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_memory_snapshots (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id                 TEXT        NOT NULL,
  narrative               TEXT        NOT NULL,
  key_facts               JSONB       NOT NULL,
  stakeholder_map         JSONB       NOT NULL,
  risk_assessment         JSONB       NOT NULL,
  sentiment_trajectory    JSONB       NOT NULL,
  open_commitments        JSONB       NOT NULL DEFAULT '[]',
  events_included_through TIMESTAMPTZ NOT NULL,
  event_count             INT         NOT NULL,
  generated_by            TEXT        NOT NULL,
  model_used              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dms_deal_latest
  ON deal_memory_snapshots (org_id, deal_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Table comment
-- ---------------------------------------------------------------------------
COMMENT ON TABLE deal_memory_snapshots IS
  'Pre-computed AI briefings for HubSpot deals — narrative, key facts, stakeholder map, risk assessment and sentiment trajectory. Each row is an immutable snapshot; the most recent row per (org_id, deal_id) is the live briefing.';

-- ---------------------------------------------------------------------------
-- Column comments
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN deal_memory_snapshots.deal_id IS
  'HubSpot deal ID (string) — not a FK because HubSpot data lives outside the DB.';

COMMENT ON COLUMN deal_memory_snapshots.narrative IS
  'AI-generated prose summary of the deal state at the time of snapshot generation.';

COMMENT ON COLUMN deal_memory_snapshots.key_facts IS
  'Structured deal metadata: { close_date, amount, stage, champion, blockers, competitors, open_commitments }.';

COMMENT ON COLUMN deal_memory_snapshots.stakeholder_map IS
  'Array of stakeholder objects: [{ contact_id, name, role, engagement_level, last_active }].';

COMMENT ON COLUMN deal_memory_snapshots.risk_assessment IS
  'Risk scoring: { overall_score, factors: [{ type, severity, detail }] }.';

COMMENT ON COLUMN deal_memory_snapshots.events_included_through IS
  'The source_timestamp of the latest event that was included when this snapshot was generated.';

COMMENT ON COLUMN deal_memory_snapshots.generated_by IS
  'Trigger that caused this snapshot: ''scheduled'', ''on_demand'', or ''event_threshold''.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE deal_memory_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_deal_memory_snapshots" ON deal_memory_snapshots;
DO $$ BEGIN
  CREATE POLICY "org_members_select_deal_memory_snapshots"
  ON deal_memory_snapshots FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "service_role_all_deal_memory_snapshots" ON deal_memory_snapshots;
DO $$ BEGIN
  CREATE POLICY "service_role_all_deal_memory_snapshots"
  ON deal_memory_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
