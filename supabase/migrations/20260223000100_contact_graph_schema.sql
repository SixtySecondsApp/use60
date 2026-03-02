-- ============================================================================
-- KNW-001: Contact Graph & Company History Schema (PRD-16)
-- Phase 5: Knowledge & Memory — Relationship Graph
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE relationship_type_enum AS ENUM (
    'colleague',
    'former_colleague',
    'manager',
    'report',
    'partner',
    'referral',
    'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE graph_discovery_source_enum AS ENUM (
    'meeting_attendees',
    'crm_import',
    'apollo_enrichment',
    'email_thread',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_history_source_enum AS ENUM (
    'apollo',
    'crm',
    'meeting',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. contact_graph — relationship edges between contacts
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_graph (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id          uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  linked_contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  relationship_type   relationship_type_enum NOT NULL DEFAULT 'unknown',
  shared_company      text,
  overlap_start_date  date,
  overlap_end_date    date,
  interaction_count   integer NOT NULL DEFAULT 0,
  relationship_strength numeric(5,2) DEFAULT 0 CHECK (relationship_strength >= 0 AND relationship_strength <= 100),
  last_interaction_at timestamptz,
  discovery_source    graph_discovery_source_enum NOT NULL DEFAULT 'meeting_attendees',
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_contact_graph_edge UNIQUE NULLS NOT DISTINCT (org_id, contact_id, linked_contact_id, shared_company)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_graph_org_contact
  ON contact_graph (org_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_graph_org_linked
  ON contact_graph (org_id, linked_contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_graph_org_strength
  ON contact_graph (org_id, relationship_strength DESC);
CREATE INDEX IF NOT EXISTS idx_contact_graph_org_type
  ON contact_graph (org_id, contact_id, relationship_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_contact_graph_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS contact_graph_updated_at ON contact_graph;
CREATE TRIGGER contact_graph_updated_at
  BEFORE UPDATE ON contact_graph
  FOR EACH ROW EXECUTE FUNCTION update_contact_graph_updated_at();

-- ----------------------------------------------------------------------------
-- 3. contact_company_history — job history timeline per contact
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contact_company_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_name    text NOT NULL,
  company_domain  text,
  title           text,
  started_at      date,
  ended_at        date,
  is_current      boolean NOT NULL DEFAULT true,
  source          company_history_source_enum NOT NULL DEFAULT 'apollo',
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_contact_company_entry UNIQUE NULLS NOT DISTINCT (org_id, contact_id, company_name, started_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_company_history_org_contact
  ON contact_company_history (org_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_company_history_domain
  ON contact_company_history (org_id, company_domain) WHERE company_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_company_history_current
  ON contact_company_history (org_id, is_current) WHERE is_current = true;

-- ----------------------------------------------------------------------------
-- 4. RLS Policies
-- ----------------------------------------------------------------------------

ALTER TABLE contact_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_company_history ENABLE ROW LEVEL SECURITY;

-- contact_graph: org members can read, service role can write
DROP POLICY IF EXISTS "org_members_select_contact_graph" ON contact_graph;
DO $$ BEGIN
  CREATE POLICY "org_members_select_contact_graph"
  ON contact_graph FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "service_role_all_contact_graph" ON contact_graph;
DO $$ BEGIN
  CREATE POLICY "service_role_all_contact_graph"
  ON contact_graph FOR ALL
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_company_history: org members can read, service role can write
DROP POLICY IF EXISTS "org_members_select_contact_company_history" ON contact_company_history;
DO $$ BEGIN
  CREATE POLICY "org_members_select_contact_company_history"
  ON contact_company_history FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "service_role_all_contact_company_history" ON contact_company_history;
DO $$ BEGIN
  CREATE POLICY "service_role_all_contact_company_history"
  ON contact_company_history FOR ALL
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Helper RPCs
-- ----------------------------------------------------------------------------

-- Get relationship connections for a contact (both directions)
CREATE OR REPLACE FUNCTION get_contact_connections(
  p_org_id uuid,
  p_contact_id uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  edge_id uuid,
  connected_contact_id uuid,
  relationship_type relationship_type_enum,
  shared_company text,
  interaction_count integer,
  relationship_strength numeric,
  last_interaction_at timestamptz,
  discovery_source graph_discovery_source_enum
) LANGUAGE sql STABLE AS $$
  SELECT
    cg.id,
    CASE WHEN cg.contact_id = p_contact_id THEN cg.linked_contact_id ELSE cg.contact_id END,
    cg.relationship_type,
    cg.shared_company,
    cg.interaction_count,
    cg.relationship_strength,
    cg.last_interaction_at,
    cg.discovery_source
  FROM contact_graph cg
  WHERE cg.org_id = p_org_id
    AND (cg.contact_id = p_contact_id OR cg.linked_contact_id = p_contact_id)
  ORDER BY cg.relationship_strength DESC
  LIMIT p_limit;
$$;

-- Find warm introductions: contacts who share company history with a target domain
CREATE OR REPLACE FUNCTION find_warm_intros(
  p_org_id uuid,
  p_target_domain text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  contact_id uuid,
  contact_company text,
  contact_title text,
  target_company text,
  overlap_period text,
  relationship_strength numeric
) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (cch.contact_id)
    cch.contact_id,
    curr.company_name AS contact_company,
    curr.title AS contact_title,
    cch.company_name AS target_company,
    CASE
      WHEN cch.started_at IS NOT NULL AND cch.ended_at IS NOT NULL
        THEN cch.started_at::text || ' – ' || cch.ended_at::text
      WHEN cch.started_at IS NOT NULL
        THEN cch.started_at::text || ' – present'
      ELSE 'unknown period'
    END,
    COALESCE(
      (SELECT MAX(cg.relationship_strength) FROM contact_graph cg
       WHERE cg.org_id = p_org_id AND (cg.contact_id = cch.contact_id OR cg.linked_contact_id = cch.contact_id)),
      0
    )
  FROM contact_company_history cch
  LEFT JOIN contact_company_history curr
    ON curr.org_id = cch.org_id AND curr.contact_id = cch.contact_id AND curr.is_current = true
  WHERE cch.org_id = p_org_id
    AND lower(cch.company_domain) = lower(p_target_domain)
    AND cch.is_current = false  -- they LEFT the target company (know people there)
  ORDER BY cch.contact_id, COALESCE(
    (SELECT MAX(cg.relationship_strength) FROM contact_graph cg
     WHERE cg.org_id = p_org_id AND (cg.contact_id = cch.contact_id OR cg.linked_contact_id = cch.contact_id)),
    0
  ) DESC
  LIMIT p_limit;
$$;
