-- ============================================================================
-- AP-018: autopilot_org_settings — Manager ceiling enforcement
--
-- Allows org admins/owners to cap the maximum autonomy tier for specific
-- action types across their organisation. The promotion engine respects
-- these ceilings and blocks promotions that would exceed the configured cap.
--
-- Companion to: AP-003 (autopilot_thresholds), AP-013 (promotionEngine)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: autopilot_org_settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autopilot_org_settings (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type        TEXT        NOT NULL,

  -- Ceiling tier: promotions above this tier are blocked for this action_type
  max_tier           TEXT        NOT NULL DEFAULT 'auto',

  -- Whether this ceiling setting is active
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Whether reps can change their own autonomy settings for this action_type
  allow_rep_override BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_autopilot_org_settings UNIQUE (org_id, action_type),
  CONSTRAINT chk_autopilot_org_settings_max_tier CHECK (
    max_tier IN ('disabled', 'suggest', 'approve', 'auto')
  )
);

COMMENT ON TABLE public.autopilot_org_settings IS
  'Per-org manager ceiling configuration for the Autopilot Engine (AP-018). '
  'One row per (org_id, action_type). When enabled, the promotion engine will '
  'not promote a user beyond max_tier for that action type. '
  'allow_rep_override controls whether individual reps may adjust their own '
  'autonomy settings for this action type.';

COMMENT ON COLUMN public.autopilot_org_settings.max_tier IS
  'Maximum autonomy tier permitted for this action_type in this org. '
  'Tier rank: disabled(0) < suggest(1) < approve(2) < auto(3). '
  'Promotions to a tier higher than max_tier are blocked.';

COMMENT ON COLUMN public.autopilot_org_settings.enabled IS
  'When FALSE the ceiling is inactive — the row is retained for audit '
  'purposes but the promotion engine ignores it.';

COMMENT ON COLUMN public.autopilot_org_settings.allow_rep_override IS
  'When TRUE (default) individual reps can adjust their own autonomy '
  'settings for this action_type. When FALSE only admins/owners may '
  'change individual rep settings.';

-- ---------------------------------------------------------------------------
-- 2. Indexes: autopilot_org_settings
-- ---------------------------------------------------------------------------

-- Runtime lookup: find ceiling for (org, action_type) quickly
CREATE INDEX IF NOT EXISTS idx_autopilot_org_settings_org_action
  ON public.autopilot_org_settings (org_id, action_type)
  WHERE enabled = TRUE;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger: autopilot_org_settings
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_autopilot_org_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autopilot_org_settings_updated_at ON public.autopilot_org_settings;
CREATE TRIGGER autopilot_org_settings_updated_at
  BEFORE UPDATE ON public.autopilot_org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_autopilot_org_settings_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security: autopilot_org_settings
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_org_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users in the org can read their org's settings
DO $$ BEGIN
  CREATE POLICY "autopilot_org_settings_member_select"
  ON public.autopilot_org_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_org_settings.org_id
        AND om.user_id = auth.uid()
        AND om.member_status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can insert new ceiling settings
DO $$ BEGIN
  CREATE POLICY "autopilot_org_settings_admin_insert"
  ON public.autopilot_org_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_org_settings.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.member_status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can update their org's ceiling settings
DO $$ BEGIN
  CREATE POLICY "autopilot_org_settings_admin_update"
  ON public.autopilot_org_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_org_settings.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.member_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_org_settings.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.member_status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can delete their org's ceiling settings
DO $$ BEGIN
  CREATE POLICY "autopilot_org_settings_admin_delete"
  ON public.autopilot_org_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_org_settings.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.member_status = 'active'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access (edge functions read/write via service-role client)
DO $$ BEGIN
  CREATE POLICY "autopilot_org_settings_service_all"
  ON public.autopilot_org_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Grants: autopilot_org_settings
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autopilot_org_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_org_settings TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226500001_autopilot_org_settings.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-018: autopilot_org_settings table (manager ceiling enforcement)';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autopilot_org_settings table';
  RAISE NOTICE '    UNIQUE constraint on (org_id, action_type)';
  RAISE NOTICE '    CHECK constraint on max_tier (disabled | suggest | approve | auto)';
  RAISE NOTICE '    Index: idx_autopilot_org_settings_org_action WHERE enabled';
  RAISE NOTICE '    updated_at trigger: update_autopilot_org_settings_updated_at()';
  RAISE NOTICE '    RLS:';
  RAISE NOTICE '      - authenticated org members: SELECT';
  RAISE NOTICE '      - org admins/owners: INSERT, UPDATE, DELETE';
  RAISE NOTICE '      - service_role: full access';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
