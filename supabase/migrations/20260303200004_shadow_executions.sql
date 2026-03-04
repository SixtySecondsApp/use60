-- =============================================================================
-- AE2-012: Shadow Execution Recorder
-- =============================================================================
-- Records what WOULD have happened at a higher autonomy tier for actions
-- executed at 'approve' tier. Used to provide data-backed promotion evidence.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Shadow executions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autonomy_shadow_executions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type       TEXT        NOT NULL,
  actual_tier       TEXT        NOT NULL,
  shadow_tier       TEXT        NOT NULL,
  action_snapshot   JSONB       NOT NULL DEFAULT '{}',
  user_decision     TEXT,
  edit_distance     NUMERIC(5,2),
  would_have_matched BOOLEAN,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_shadow_actual_tier CHECK (
    actual_tier IN ('approve', 'suggest')
  ),
  CONSTRAINT chk_shadow_tier CHECK (
    shadow_tier IN ('auto', 'approve')
  ),
  CONSTRAINT chk_shadow_decision CHECK (
    user_decision IS NULL OR user_decision IN ('approved', 'approved_edited', 'rejected')
  )
);

COMMENT ON TABLE public.autonomy_shadow_executions IS 'AE2-012: Records phantom higher-tier executions for A/B promotion evidence';
COMMENT ON COLUMN public.autonomy_shadow_executions.action_snapshot IS 'Snapshot of the action as proposed — used to compare against user edits';
COMMENT ON COLUMN public.autonomy_shadow_executions.would_have_matched IS 'True if user approved without edit (shadow auto-execute would have been correct)';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shadow_exec_user_action
  ON public.autonomy_shadow_executions (user_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_exec_org
  ON public.autonomy_shadow_executions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shadow_exec_matched
  ON public.autonomy_shadow_executions (user_id, action_type, would_have_matched)
  WHERE would_have_matched IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.autonomy_shadow_executions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "shadow_exec_user_select"
  ON public.autonomy_shadow_executions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shadow_exec_admin_select"
  ON public.autonomy_shadow_executions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = autonomy_shadow_executions.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "shadow_exec_service_all"
  ON public.autonomy_shadow_executions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. GRANTs
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.autonomy_shadow_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_shadow_executions TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Stats RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shadow_execution_stats(
  p_user_id     UUID,
  p_action_type TEXT,
  p_days        INTEGER DEFAULT 30
)
RETURNS TABLE (
  total          BIGINT,
  would_have_matched BIGINT,
  match_rate     NUMERIC,
  action_type    TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE se.would_have_matched = true)::BIGINT AS would_have_matched,
    CASE
      WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE se.would_have_matched = true)::NUMERIC / COUNT(*)::NUMERIC, 3)
      ELSE 0
    END AS match_rate,
    se.action_type
  FROM public.autonomy_shadow_executions se
  WHERE se.user_id = p_user_id
    AND se.action_type = p_action_type
    AND se.would_have_matched IS NOT NULL
    AND se.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY se.action_type;
$$;

COMMENT ON FUNCTION public.get_shadow_execution_stats(UUID, TEXT, INTEGER) IS 'AE2-012: Returns shadow execution match rate for promotion evidence';

GRANT EXECUTE ON FUNCTION public.get_shadow_execution_stats(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shadow_execution_stats(UUID, TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260303200004_shadow_executions.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Ticket: AE2-012';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autonomy_shadow_executions table';
  RAISE NOTICE '  - get_shadow_execution_stats(user_id, action_type, days) RPC';
  RAISE NOTICE '  - Indexes: user+action, org, matched partial';
  RAISE NOTICE '  - RLS: user self-read, admin org-read, service full';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
