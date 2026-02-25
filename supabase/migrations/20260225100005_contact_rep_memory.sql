-- ============================================================================
-- DM-011: Contact Memory & Rep Memory Tables (PRD-DM-001)
-- The Institutional Knowledge Graph — Persistent People Intelligence
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table: contact_memory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_memory (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id              TEXT NOT NULL,
  communication_style     JSONB NOT NULL DEFAULT '{}',
  decision_style          JSONB NOT NULL DEFAULT '{}',
  interests               JSONB NOT NULL DEFAULT '[]',
  buying_role_history     JSONB NOT NULL DEFAULT '[]',
  relationship_strength   FLOAT NOT NULL DEFAULT 0.5,
  total_meetings          INT NOT NULL DEFAULT 0,
  total_emails_sent       INT NOT NULL DEFAULT 0,
  total_emails_received   INT NOT NULL DEFAULT 0,
  last_interaction_at     TIMESTAMPTZ,
  avg_response_time_hours FLOAT,
  summary                 TEXT,
  summary_updated_at      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_contact_memory UNIQUE (org_id, contact_id),
  CONSTRAINT chk_cm_relationship_strength CHECK (relationship_strength >= 0 AND relationship_strength <= 1)
);

-- ---------------------------------------------------------------------------
-- Indexes: contact_memory
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_cm_org_contact
  ON contact_memory (org_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_cm_last_interaction
  ON contact_memory (org_id, last_interaction_at DESC);

-- ---------------------------------------------------------------------------
-- Row-Level Security: contact_memory
-- ---------------------------------------------------------------------------

ALTER TABLE contact_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_contact_memory" ON contact_memory;
DO $$ BEGIN
  CREATE POLICY "org_members_select_contact_memory"
  ON contact_memory FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "service_role_all_contact_memory" ON contact_memory;
DO $$ BEGIN
  CREATE POLICY "service_role_all_contact_memory"
  ON contact_memory FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger: contact_memory
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_contact_memory_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS contact_memory_updated_at ON contact_memory;
DROP TRIGGER IF EXISTS contact_memory_updated_at ON contact_memory;
CREATE TRIGGER contact_memory_updated_at
  BEFORE UPDATE ON contact_memory
  FOR EACH ROW EXECUTE FUNCTION update_contact_memory_updated_at();

-- ---------------------------------------------------------------------------
-- Table comment: contact_memory
-- ---------------------------------------------------------------------------

COMMENT ON TABLE contact_memory IS
  'Persistent per-contact intelligence accumulated over time. Tracks communication style, decision-making patterns, relationship strength, and interaction history to enable personalised outreach and meeting prep.';

-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table: rep_memory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rep_memory (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval_stats              JSONB NOT NULL DEFAULT '{}',
  autonomy_profile            JSONB NOT NULL DEFAULT '{}',
  talk_ratio_avg              FLOAT,
  discovery_depth_avg         FLOAT,
  objection_handling_score    FLOAT,
  follow_up_speed_avg_hours   FLOAT,
  win_patterns                JSONB NOT NULL DEFAULT '[]',
  loss_patterns               JSONB NOT NULL DEFAULT '[]',
  working_hours_observed      JSONB NOT NULL DEFAULT '{}',
  feature_usage               JSONB NOT NULL DEFAULT '{}',
  coaching_summary            TEXT,
  coaching_summary_updated_at TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_rep_memory UNIQUE (org_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Index: rep_memory
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_rm_org_user
  ON rep_memory (org_id, user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: rep_memory
-- ---------------------------------------------------------------------------

ALTER TABLE rep_memory ENABLE ROW LEVEL SECURITY;

-- Reps can see their own memory
DROP POLICY IF EXISTS "users_select_own_rep_memory" ON rep_memory;
DO $$ BEGIN
  CREATE POLICY "users_select_own_rep_memory"
  ON rep_memory FOR SELECT
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Managers and admins can see all rep memory in their org
DROP POLICY IF EXISTS "managers_select_org_rep_memory" ON rep_memory;
DO $$ BEGIN
  CREATE POLICY "managers_select_org_rep_memory"
  ON rep_memory FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om
    WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'manager', 'owner')
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role full access
DROP POLICY IF EXISTS "service_role_all_rep_memory" ON rep_memory;
DO $$ BEGIN
  CREATE POLICY "service_role_all_rep_memory"
  ON rep_memory FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger: rep_memory
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_rep_memory_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS rep_memory_updated_at ON rep_memory;
DROP TRIGGER IF EXISTS rep_memory_updated_at ON rep_memory;
CREATE TRIGGER rep_memory_updated_at
  BEFORE UPDATE ON rep_memory
  FOR EACH ROW EXECUTE FUNCTION update_rep_memory_updated_at();

-- ---------------------------------------------------------------------------
-- Table comment: rep_memory
-- ---------------------------------------------------------------------------

COMMENT ON TABLE rep_memory IS
  'Persistent per-rep intelligence accumulated over time. Tracks approval patterns, autonomy profile, talk ratios, win/loss patterns, and coaching insights to enable personalised AI behaviour and manager coaching views.';
