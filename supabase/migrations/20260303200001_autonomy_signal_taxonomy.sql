-- =============================================================================
-- AE2-001: Unified Trust Signal Taxonomy
-- =============================================================================
-- Formalizes all signal types from both autonomy systems (org-policy + autopilot)
-- into a single taxonomy table with configurable weights per org.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Signal taxonomy table (platform-wide definitions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autonomy_signal_taxonomy (
  signal_type               TEXT        PRIMARY KEY,
  category                  TEXT        NOT NULL,
  base_weight               NUMERIC(4,2) NOT NULL,
  impact_multiplier_enabled BOOLEAN     NOT NULL DEFAULT false,
  is_positive               BOOLEAN     NOT NULL,
  description               TEXT        NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_signal_category CHECK (
    category IN ('feedback', 'outcome', 'system')
  )
);

COMMENT ON TABLE public.autonomy_signal_taxonomy IS 'AE2-001: Platform-wide signal type definitions for the unified autonomy engine';
COMMENT ON COLUMN public.autonomy_signal_taxonomy.signal_type IS 'Unique signal identifier, e.g. approved, rejected, auto_undone';
COMMENT ON COLUMN public.autonomy_signal_taxonomy.category IS 'Signal category: feedback (user action), outcome (system result), system (internal)';
COMMENT ON COLUMN public.autonomy_signal_taxonomy.base_weight IS 'Default weight used in confidence calculations (-3.0 to +1.0)';
COMMENT ON COLUMN public.autonomy_signal_taxonomy.impact_multiplier_enabled IS 'Whether this signal weight is multiplied by deal context risk';
COMMENT ON COLUMN public.autonomy_signal_taxonomy.is_positive IS 'Whether this signal contributes positively to confidence';

-- ---------------------------------------------------------------------------
-- 2. Seed all signal types from both systems
-- ---------------------------------------------------------------------------
INSERT INTO public.autonomy_signal_taxonomy (signal_type, category, base_weight, impact_multiplier_enabled, is_positive, description)
VALUES
  -- Feedback signals (user actions on proposed actions)
  ('approved',          'feedback', 1.0,  false, true,  'User approved action without changes'),
  ('approved_edited',   'feedback', 0.3,  false, true,  'User approved action after making edits'),
  ('rejected',          'feedback', -1.0, true,  false, 'User explicitly rejected the proposed action'),
  ('expired',           'feedback', -0.2, false, false, 'Proposed action expired without user response'),
  ('undone',            'feedback', -2.0, true,  false, 'User undid an already-approved action'),

  -- Outcome signals (system-observed results of autonomous actions)
  ('auto_executed',     'outcome',  0.1,  false, true,  'Action auto-executed successfully at auto tier'),
  ('auto_undone',       'outcome',  -3.0, true,  false, 'User undid an auto-executed action — strongest negative signal'),

  -- System signals (internal engine events)
  ('rubber_stamp',      'system',   0.0,  false, false, 'Fast approval detected — excluded from clean approval rate'),
  ('context_escalation','system',   -0.5, false, false, 'Tier downgraded due to high deal context risk'),
  ('shadow_match',      'system',   0.05, false, true,  'Shadow execution at higher tier would have matched user decision')
ON CONFLICT (signal_type) DO UPDATE SET
  category                  = EXCLUDED.category,
  base_weight               = EXCLUDED.base_weight,
  impact_multiplier_enabled = EXCLUDED.impact_multiplier_enabled,
  is_positive               = EXCLUDED.is_positive,
  description               = EXCLUDED.description,
  updated_at                = NOW();

-- ---------------------------------------------------------------------------
-- 3. Org-level weight overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autonomy_signal_taxonomy_overrides (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  signal_type TEXT        NOT NULL REFERENCES public.autonomy_signal_taxonomy(signal_type) ON DELETE CASCADE,
  custom_weight NUMERIC(4,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_signal_override UNIQUE (org_id, signal_type)
);

COMMENT ON TABLE public.autonomy_signal_taxonomy_overrides IS 'AE2-001: Org-level overrides for signal weights';

CREATE INDEX IF NOT EXISTS idx_signal_overrides_org
  ON public.autonomy_signal_taxonomy_overrides (org_id);

-- ---------------------------------------------------------------------------
-- 4. RLS policies
-- ---------------------------------------------------------------------------

-- Taxonomy is read-only for all authenticated users
ALTER TABLE public.autonomy_signal_taxonomy ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "signal_taxonomy_authenticated_select"
  ON public.autonomy_signal_taxonomy FOR SELECT
  TO authenticated
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "signal_taxonomy_service_all"
  ON public.autonomy_signal_taxonomy FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Overrides: org admins manage, members read
ALTER TABLE public.autonomy_signal_taxonomy_overrides ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "signal_overrides_admin_all"
  ON public.autonomy_signal_taxonomy_overrides FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = autonomy_signal_taxonomy_overrides.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = autonomy_signal_taxonomy_overrides.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "signal_overrides_member_select"
  ON public.autonomy_signal_taxonomy_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = autonomy_signal_taxonomy_overrides.org_id
        AND om.user_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "signal_overrides_service_all"
  ON public.autonomy_signal_taxonomy_overrides FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. GRANTs
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.autonomy_signal_taxonomy TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_signal_taxonomy TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_signal_taxonomy_overrides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_signal_taxonomy_overrides TO service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC: get merged taxonomy (base + org overrides)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_signal_taxonomy(p_org_id UUID)
RETURNS TABLE (
  signal_type               TEXT,
  category                  TEXT,
  weight                    NUMERIC,
  impact_multiplier_enabled BOOLEAN,
  is_positive               BOOLEAN,
  description               TEXT,
  is_overridden             BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.signal_type,
    t.category,
    COALESCE(o.custom_weight, t.base_weight) AS weight,
    t.impact_multiplier_enabled,
    t.is_positive,
    t.description,
    (o.id IS NOT NULL) AS is_overridden
  FROM public.autonomy_signal_taxonomy t
  LEFT JOIN public.autonomy_signal_taxonomy_overrides o
    ON o.signal_type = t.signal_type
    AND o.org_id = p_org_id
  ORDER BY t.signal_type;
$$;

COMMENT ON FUNCTION public.get_signal_taxonomy(UUID) IS 'AE2-001: Returns merged signal taxonomy with org-level weight overrides';

GRANT EXECUTE ON FUNCTION public.get_signal_taxonomy(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_signal_taxonomy(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_signal_taxonomy_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signal_taxonomy_updated_at ON public.autonomy_signal_taxonomy;
CREATE TRIGGER signal_taxonomy_updated_at
  BEFORE UPDATE ON public.autonomy_signal_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.update_signal_taxonomy_updated_at();

DROP TRIGGER IF EXISTS signal_overrides_updated_at ON public.autonomy_signal_taxonomy_overrides;
CREATE TRIGGER signal_overrides_updated_at
  BEFORE UPDATE ON public.autonomy_signal_taxonomy_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_signal_taxonomy_updated_at();

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303200001_autonomy_signal_taxonomy.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Ticket: AE2-001';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autonomy_signal_taxonomy table (10 signal types seeded)';
  RAISE NOTICE '  - autonomy_signal_taxonomy_overrides table (org-level weight overrides)';
  RAISE NOTICE '  - get_signal_taxonomy(org_id) RPC (merged base + overrides)';
  RAISE NOTICE '  - RLS: taxonomy read-all, overrides admin-manage/member-read';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
