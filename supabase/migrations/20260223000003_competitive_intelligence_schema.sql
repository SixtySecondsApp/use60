-- ============================================================================
-- KNW-005: Competitive Intelligence Schema (PRD-17)
-- Phase 5: Knowledge & Memory — Competitive Intelligence System
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE competitor_mention_sentiment AS ENUM ('positive', 'negative', 'neutral');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE competitor_mention_category AS ENUM (
    'pricing', 'features', 'support', 'brand', 'integration', 'performance', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE competitor_deal_outcome AS ENUM ('won', 'lost', 'pending', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE competitor_detection_source AS ENUM ('post_meeting_analysis', 'manual', 'email_signal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. competitive_mentions — individual mentions from meetings/emails
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS competitive_mentions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id             uuid REFERENCES deals(id) ON DELETE SET NULL,
  meeting_id          uuid REFERENCES meetings(id) ON DELETE SET NULL,
  competitor_name     text NOT NULL,
  mention_context     text,
  sentiment           competitor_mention_sentiment NOT NULL DEFAULT 'neutral',
  category            competitor_mention_category NOT NULL DEFAULT 'other',
  strengths_mentioned text[] NOT NULL DEFAULT '{}',
  weaknesses_mentioned text[] NOT NULL DEFAULT '{}',
  pricing_discussed   boolean NOT NULL DEFAULT false,
  pricing_detail      text,
  deal_outcome        competitor_deal_outcome NOT NULL DEFAULT 'unknown',
  detected_by         competitor_detection_source NOT NULL DEFAULT 'post_meeting_analysis',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitive_mentions_org_competitor
  ON competitive_mentions (org_id, lower(competitor_name), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitive_mentions_org_deal
  ON competitive_mentions (org_id, deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competitive_mentions_org_meeting
  ON competitive_mentions (org_id, meeting_id) WHERE meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competitive_mentions_org_created
  ON competitive_mentions (org_id, created_at DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_competitive_mentions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS competitive_mentions_updated_at ON competitive_mentions;
CREATE TRIGGER competitive_mentions_updated_at
  BEFORE UPDATE ON competitive_mentions
  FOR EACH ROW EXECUTE FUNCTION update_competitive_mentions_updated_at();

-- ----------------------------------------------------------------------------
-- 3. competitor_profiles — aggregated competitor intelligence
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS competitor_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  competitor_name     text NOT NULL,
  mention_count       integer NOT NULL DEFAULT 0,
  win_count           integer NOT NULL DEFAULT 0,
  loss_count          integer NOT NULL DEFAULT 0,
  win_rate            numeric(5,2),
  common_strengths    jsonb NOT NULL DEFAULT '[]',
  common_weaknesses   jsonb NOT NULL DEFAULT '[]',
  effective_counters  jsonb NOT NULL DEFAULT '[]',
  battlecard_content  text,
  auto_battlecard     text,
  last_mentioned_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index (cannot use lower() in table UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS uq_competitor_profile_org_name
  ON competitor_profiles (org_id, lower(competitor_name));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_org
  ON competitor_profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_org_mentions
  ON competitor_profiles (org_id, mention_count DESC);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_competitor_profiles_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS competitor_profiles_updated_at ON competitor_profiles;
CREATE TRIGGER competitor_profiles_updated_at
  BEFORE UPDATE ON competitor_profiles
  FOR EACH ROW EXECUTE FUNCTION update_competitor_profiles_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE competitive_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_profiles ENABLE ROW LEVEL SECURITY;

-- competitive_mentions: org members can read, service role can write
DROP POLICY IF EXISTS "org_members_select_competitive_mentions" ON competitive_mentions;
CREATE POLICY "org_members_select_competitive_mentions"
  ON competitive_mentions FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "org_members_insert_competitive_mentions" ON competitive_mentions;
CREATE POLICY "org_members_insert_competitive_mentions"
  ON competitive_mentions FOR INSERT
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "service_role_all_competitive_mentions" ON competitive_mentions;
CREATE POLICY "service_role_all_competitive_mentions"
  ON competitive_mentions FOR ALL
  USING (true) WITH CHECK (true);

-- competitor_profiles: org members can read + admin can update battlecard, service role full
DROP POLICY IF EXISTS "org_members_select_competitor_profiles" ON competitor_profiles;
CREATE POLICY "org_members_select_competitor_profiles"
  ON competitor_profiles FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "org_admins_update_competitor_profiles" ON competitor_profiles;
CREATE POLICY "org_admins_update_competitor_profiles"
  ON competitor_profiles FOR UPDATE
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS "service_role_all_competitor_profiles" ON competitor_profiles;
CREATE POLICY "service_role_all_competitor_profiles"
  ON competitor_profiles FOR ALL
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. Helper RPCs
-- ----------------------------------------------------------------------------

-- Get competitor profile with recent mentions
CREATE OR REPLACE FUNCTION get_competitor_profile(
  p_org_id uuid,
  p_competitor_name text
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_profile jsonb;
  v_recent_mentions jsonb;
BEGIN
  SELECT to_jsonb(cp.*) INTO v_profile
  FROM competitor_profiles cp
  WHERE cp.org_id = p_org_id AND lower(cp.competitor_name) = lower(p_competitor_name);

  IF v_profile IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at DESC), '[]'::jsonb)
  INTO v_recent_mentions
  FROM (
    SELECT cm.id, cm.deal_id, cm.meeting_id, cm.mention_context, cm.sentiment,
           cm.category, cm.strengths_mentioned, cm.weaknesses_mentioned,
           cm.pricing_discussed, cm.deal_outcome, cm.created_at
    FROM competitive_mentions cm
    WHERE cm.org_id = p_org_id AND lower(cm.competitor_name) = lower(p_competitor_name)
    ORDER BY cm.created_at DESC
    LIMIT 10
  ) cm;

  RETURN v_profile || jsonb_build_object('recent_mentions', v_recent_mentions);
END;
$$;

-- Get all competitor profiles for an org (summary view)
CREATE OR REPLACE FUNCTION get_org_competitors(
  p_org_id uuid
)
RETURNS TABLE (
  id uuid,
  competitor_name text,
  mention_count integer,
  win_count integer,
  loss_count integer,
  win_rate numeric,
  last_mentioned_at timestamptz,
  has_battlecard boolean
) LANGUAGE sql STABLE AS $$
  SELECT
    cp.id,
    cp.competitor_name,
    cp.mention_count,
    cp.win_count,
    cp.loss_count,
    cp.win_rate,
    cp.last_mentioned_at,
    (cp.battlecard_content IS NOT NULL OR cp.auto_battlecard IS NOT NULL) AS has_battlecard
  FROM competitor_profiles cp
  WHERE cp.org_id = p_org_id
  ORDER BY cp.mention_count DESC;
$$;

-- Get competitors mentioned in a specific deal
CREATE OR REPLACE FUNCTION get_deal_competitors(
  p_org_id uuid,
  p_deal_id uuid
)
RETURNS TABLE (
  competitor_name text,
  mention_count bigint,
  latest_sentiment competitor_mention_sentiment,
  latest_category competitor_mention_category,
  has_battlecard boolean
) LANGUAGE sql STABLE AS $$
  SELECT
    cm.competitor_name,
    count(*) AS mention_count,
    (array_agg(cm.sentiment ORDER BY cm.created_at DESC))[1] AS latest_sentiment,
    (array_agg(cm.category ORDER BY cm.created_at DESC))[1] AS latest_category,
    EXISTS (
      SELECT 1 FROM competitor_profiles cp
      WHERE cp.org_id = p_org_id AND lower(cp.competitor_name) = lower(cm.competitor_name)
        AND (cp.battlecard_content IS NOT NULL OR cp.auto_battlecard IS NOT NULL)
    ) AS has_battlecard
  FROM competitive_mentions cm
  WHERE cm.org_id = p_org_id AND cm.deal_id = p_deal_id
  GROUP BY cm.competitor_name
  ORDER BY count(*) DESC;
$$;
