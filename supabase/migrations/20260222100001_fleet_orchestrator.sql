-- =============================================================================
-- PRD-02: Fleet Orchestrator & Event Router
-- Migration: Fleet Configuration Schema + Resolution Functions
-- Stories: FLT-001, FLT-002, FLT-003, FLT-004
-- =============================================================================

-- =============================================================================
-- FLT-001: fleet_event_routes — configurable event routing
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_event_routes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = platform default
  event_type    TEXT NOT NULL,
  sequence_key  TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  priority      INT NOT NULL DEFAULT 0,  -- highest wins when multiple routes match
  conditions    JSONB,                    -- optional payload filter conditions
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- UNIQUE with COALESCE to handle NULL org_id correctly
  CONSTRAINT fleet_event_routes_unique
    UNIQUE (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_event_routes_lookup
  ON fleet_event_routes (event_type, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fleet_event_routes_org
  ON fleet_event_routes (org_id, event_type)
  WHERE org_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION fleet_event_routes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fleet_event_routes_updated_at
  BEFORE UPDATE ON fleet_event_routes
  FOR EACH ROW EXECUTE FUNCTION fleet_event_routes_updated_at();

-- RLS
ALTER TABLE fleet_event_routes ENABLE ROW LEVEL SECURITY;

-- Service role: full access
CREATE POLICY "fleet_event_routes_service_all"
  ON fleet_event_routes FOR ALL
  USING (auth.role() = 'service_role');

-- Authenticated: read platform defaults (org_id IS NULL)
CREATE POLICY "fleet_event_routes_read_defaults"
  ON fleet_event_routes FOR SELECT
  USING (org_id IS NULL AND auth.role() = 'authenticated');

-- Org admins: manage their org routes
CREATE POLICY "fleet_event_routes_org_admin"
  ON fleet_event_routes FOR ALL
  USING (
    org_id IS NOT NULL
    AND get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );

-- Org members: read their org routes
CREATE POLICY "fleet_event_routes_org_read"
  ON fleet_event_routes FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = fleet_event_routes.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_event_routes TO service_role;
GRANT SELECT ON fleet_event_routes TO authenticated;


-- =============================================================================
-- FLT-002: fleet_sequence_definitions — DB-driven step definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_sequence_definitions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_key          TEXT NOT NULL,
  org_id                UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = platform default
  version               INT NOT NULL DEFAULT 1,
  steps                 JSONB NOT NULL,  -- array of SequenceStep objects
  context_requirements  JSONB,           -- ContextTierSpec array
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Steps must be a non-empty array
  CONSTRAINT fleet_sequence_definitions_steps_check
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) >= 1),

  -- UNIQUE with COALESCE for NULL org_id
  CONSTRAINT fleet_sequence_definitions_unique
    UNIQUE (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_sequence_definitions_lookup
  ON fleet_sequence_definitions (sequence_key, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fleet_sequence_definitions_org
  ON fleet_sequence_definitions (org_id, sequence_key)
  WHERE org_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION fleet_sequence_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fleet_sequence_definitions_updated_at
  BEFORE UPDATE ON fleet_sequence_definitions
  FOR EACH ROW EXECUTE FUNCTION fleet_sequence_definitions_updated_at();

-- RLS
ALTER TABLE fleet_sequence_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_sequence_definitions_service_all"
  ON fleet_sequence_definitions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "fleet_sequence_definitions_read_defaults"
  ON fleet_sequence_definitions FOR SELECT
  USING (org_id IS NULL AND auth.role() = 'authenticated');

CREATE POLICY "fleet_sequence_definitions_org_admin"
  ON fleet_sequence_definitions FOR ALL
  USING (
    org_id IS NOT NULL
    AND get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );

CREATE POLICY "fleet_sequence_definitions_org_read"
  ON fleet_sequence_definitions FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = fleet_sequence_definitions.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_sequence_definitions TO service_role;
GRANT SELECT ON fleet_sequence_definitions TO authenticated;


-- =============================================================================
-- FLT-003: fleet_handoff_routes — agent-to-agent handoff definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS fleet_handoff_routes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL = platform default
  source_sequence_key   TEXT NOT NULL,
  source_step_skill     TEXT NOT NULL,
  target_event_type     TEXT NOT NULL,
  context_mapping       JSONB,           -- maps source step outputs to target event payload
  conditions            JSONB,           -- conditional handoff (only if step output matches)
  delay_minutes         INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_handoff_routes_lookup
  ON fleet_handoff_routes (source_sequence_key, source_step_skill, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_fleet_handoff_routes_org
  ON fleet_handoff_routes (org_id)
  WHERE org_id IS NOT NULL;

-- RLS
ALTER TABLE fleet_handoff_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_handoff_routes_service_all"
  ON fleet_handoff_routes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "fleet_handoff_routes_read_defaults"
  ON fleet_handoff_routes FOR SELECT
  USING (org_id IS NULL AND auth.role() = 'authenticated');

CREATE POLICY "fleet_handoff_routes_org_admin"
  ON fleet_handoff_routes FOR ALL
  USING (
    org_id IS NOT NULL
    AND get_org_role(auth.uid(), org_id) IN ('admin', 'owner')
  );

CREATE POLICY "fleet_handoff_routes_org_read"
  ON fleet_handoff_routes FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_memberships
      WHERE organization_memberships.organization_id = fleet_handoff_routes.org_id
        AND organization_memberships.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_handoff_routes TO service_role;
GRANT SELECT ON fleet_handoff_routes TO authenticated;


-- =============================================================================
-- FLT-004: Resolution Functions (SECURITY DEFINER)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- resolve_event_route: Find matching routes with org override → platform default
-- Returns routes ordered by priority DESC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_event_route(
  p_org_id     UUID,
  p_event_type TEXT
)
RETURNS TABLE (
  sequence_key TEXT,
  priority     INT,
  conditions   JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Try org-specific routes first, then fall back to platform defaults
  RETURN QUERY
  WITH org_routes AS (
    SELECT r.sequence_key, r.priority, r.conditions
    FROM fleet_event_routes r
    WHERE r.event_type = p_event_type
      AND r.org_id = p_org_id
      AND r.is_active = true
  ),
  default_routes AS (
    SELECT r.sequence_key, r.priority, r.conditions
    FROM fleet_event_routes r
    WHERE r.event_type = p_event_type
      AND r.org_id IS NULL
      AND r.is_active = true
      -- Only use defaults for sequence keys NOT overridden by org
      AND NOT EXISTS (
        SELECT 1 FROM org_routes o WHERE o.sequence_key = r.sequence_key
      )
  )
  SELECT * FROM org_routes
  UNION ALL
  SELECT * FROM default_routes
  ORDER BY priority DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- get_sequence_definition: Load steps with org override → platform default
-- Returns latest active version
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sequence_definition(
  p_org_id       UUID,
  p_sequence_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_steps JSONB;
BEGIN
  -- Try org-specific definition first
  SELECT d.steps INTO v_steps
  FROM fleet_sequence_definitions d
  WHERE d.sequence_key = p_sequence_key
    AND d.org_id = p_org_id
    AND d.is_active = true
  ORDER BY d.version DESC
  LIMIT 1;

  IF v_steps IS NOT NULL THEN
    RETURN v_steps;
  END IF;

  -- Fall back to platform default
  SELECT d.steps INTO v_steps
  FROM fleet_sequence_definitions d
  WHERE d.sequence_key = p_sequence_key
    AND d.org_id IS NULL
    AND d.is_active = true
  ORDER BY d.version DESC
  LIMIT 1;

  RETURN v_steps;  -- May be NULL if no definition found
END;
$$;

-- -----------------------------------------------------------------------------
-- get_handoff_routes: Find active handoffs for a completed step
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_handoff_routes(
  p_org_id              UUID,
  p_source_sequence_key TEXT,
  p_source_step_skill   TEXT
)
RETURNS TABLE (
  id                  UUID,
  target_event_type   TEXT,
  context_mapping     JSONB,
  conditions          JSONB,
  delay_minutes       INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH org_handoffs AS (
    SELECT h.id, h.target_event_type, h.context_mapping, h.conditions, h.delay_minutes
    FROM fleet_handoff_routes h
    WHERE h.source_sequence_key = p_source_sequence_key
      AND h.source_step_skill = p_source_step_skill
      AND h.org_id = p_org_id
      AND h.is_active = true
  ),
  default_handoffs AS (
    SELECT h.id, h.target_event_type, h.context_mapping, h.conditions, h.delay_minutes
    FROM fleet_handoff_routes h
    WHERE h.source_sequence_key = p_source_sequence_key
      AND h.source_step_skill = p_source_step_skill
      AND h.org_id IS NULL
      AND h.is_active = true
      -- Only use defaults for target event types NOT overridden by org
      AND NOT EXISTS (
        SELECT 1 FROM org_handoffs o WHERE o.target_event_type = h.target_event_type
      )
  )
  SELECT * FROM org_handoffs
  UNION ALL
  SELECT * FROM default_handoffs;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION resolve_event_route(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_event_route(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sequence_definition(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_sequence_definition(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_handoff_routes(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_handoff_routes(UUID, TEXT, TEXT) TO authenticated;
