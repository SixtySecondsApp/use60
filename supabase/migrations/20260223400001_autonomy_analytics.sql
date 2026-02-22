-- ============================================================================
-- Phase 8: Graduated Autonomy System (PRD-24)
-- GRAD-001: Approval rate analytics and tracking
--
-- Creates autonomy_action_stats table for per-action-type approval rate tracking
-- with configurable time windows (7d, 30d, 90d).
--
-- Replaces the earlier autonomy_analytics migration with corrected schema
-- that properly maps crm_approval_queue fields to action types.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Drop the old broken table/functions if they exist
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_autonomy_analytics(uuid, integer);
DROP FUNCTION IF EXISTS public.refresh_autonomy_analytics(uuid);
DROP TABLE IF EXISTS public.autonomy_analytics;

-- ---------------------------------------------------------------------------
-- 1. Create autonomy_action_stats table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autonomy_action_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 30,
  approval_count INTEGER NOT NULL DEFAULT 0,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  edit_count INTEGER NOT NULL DEFAULT 0,
  auto_approved_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  approval_rate NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_count > 0
      THEN ROUND((approval_count + auto_approved_count)::numeric / total_count * 100, 2)
      ELSE 0
    END
  ) STORED,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_action_stats_per_window UNIQUE (org_id, action_type, window_days)
);

COMMENT ON TABLE public.autonomy_action_stats IS
  'Cached approval rate analytics per action type for graduated autonomy (PRD-24, GRAD-001). '
  'Refreshed periodically from crm_approval_queue and agent_activity data.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_autonomy_action_stats_org
  ON public.autonomy_action_stats(org_id);

CREATE INDEX IF NOT EXISTS idx_autonomy_action_stats_org_action
  ON public.autonomy_action_stats(org_id, action_type);

CREATE INDEX IF NOT EXISTS idx_autonomy_action_stats_calculated
  ON public.autonomy_action_stats(calculated_at);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.autonomy_action_stats ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's stats
CREATE POLICY "autonomy_action_stats_org_read"
  ON public.autonomy_action_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.org_id = autonomy_action_stats.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Service role: full access (edge functions use service-role client)
CREATE POLICY "autonomy_action_stats_service_all"
  ON public.autonomy_action_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autonomy_action_stats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_action_stats TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Helper: map crm_approval_queue field_name to action_type
--
-- crm_approval_queue stores field_name (e.g. 'stage', 'close_date', 'notes')
-- but not action_type. We derive it:
--   stage-related fields -> crm_stage_change
--   everything else -> crm_field_update
--
-- For auto-approved items, we check change_source in crm_field_updates.
-- Agent activity feed tracks broader action types (send_email, etc.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.map_field_to_action_type(p_field_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_field_name IN ('stage', 'pipeline_stage', 'deal_stage') THEN 'crm_stage_change'
    ELSE 'crm_field_update'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: refresh_autonomy_analytics
--
-- Calculates stats from crm_approval_queue for 7d, 30d, 90d windows.
-- Also incorporates auto-applied changes from crm_field_updates.
-- Also pulls broader action types from agent_activity metadata.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_autonomy_analytics(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_window INTEGER;
  v_action TEXT;
  v_window_start TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ;
  v_approval INTEGER;
  v_rejection INTEGER;
  v_edit INTEGER;
  v_auto INTEGER;
  v_total INTEGER;
  v_action_types TEXT[] := ARRAY[
    'crm_stage_change',
    'crm_field_update',
    'crm_contact_create',
    'send_email',
    'send_slack',
    'create_task',
    'enrich_contact',
    'draft_proposal'
  ];
BEGIN
  v_window_end := now();

  FOREACH v_action IN ARRAY v_action_types LOOP
    FOREACH v_window IN ARRAY ARRAY[7, 30, 90] LOOP
      v_window_start := v_window_end - (v_window || ' days')::interval;

      -- For CRM action types, pull from crm_approval_queue
      IF v_action IN ('crm_stage_change', 'crm_field_update') THEN
        SELECT
          COALESCE(SUM(CASE WHEN caq.status = 'approved' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN caq.status = 'rejected' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN caq.status = 'edited' THEN 1 ELSE 0 END), 0),
          0, -- auto_approved counted separately below
          COALESCE(COUNT(*), 0)
        INTO v_approval, v_rejection, v_edit, v_auto, v_total
        FROM crm_approval_queue caq
        WHERE caq.org_id = p_org_id
          AND map_field_to_action_type(caq.field_name) = v_action
          AND caq.status IN ('approved', 'rejected', 'edited', 'expired')
          AND caq.created_at >= v_window_start
          AND caq.created_at <= v_window_end;

        -- Count auto-applied from crm_field_updates (change_source = 'auto_apply')
        SELECT COALESCE(COUNT(*), 0)
        INTO v_auto
        FROM crm_field_updates cfu
        WHERE cfu.org_id = p_org_id::text
          AND cfu.change_source = 'auto_apply'
          AND map_field_to_action_type(cfu.field_name) = v_action
          AND cfu.created_at >= v_window_start
          AND cfu.created_at <= v_window_end;

        v_total := v_total + v_auto;

      ELSE
        -- For non-CRM action types, pull from agent_activity metadata
        -- agent_activity.metadata may contain action_type
        SELECT
          COALESCE(SUM(CASE WHEN (aa.metadata->>'status') = 'approved' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN (aa.metadata->>'status') = 'rejected' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN (aa.metadata->>'status') = 'edited' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN (aa.metadata->>'status') = 'auto_executed' THEN 1 ELSE 0 END), 0),
          COALESCE(COUNT(*), 0)
        INTO v_approval, v_rejection, v_edit, v_auto, v_total
        FROM agent_activity aa
        WHERE aa.org_id = p_org_id::text
          AND (aa.metadata->>'action_type') = v_action
          AND aa.created_at >= v_window_start
          AND aa.created_at <= v_window_end;

        -- Also check hitl_pending_approvals if it exists
        -- Note: hitl_pending_approvals uses resource_type (not action_type)
        -- and stores status as 'approved'/'rejected'/'auto_executed'
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'hitl_pending_approvals'
        ) THEN
          DECLARE
            v_hitl_approved INTEGER := 0;
            v_hitl_rejected INTEGER := 0;
            v_hitl_auto INTEGER := 0;
            v_hitl_total INTEGER := 0;
          BEGIN
            EXECUTE
              'SELECT
                COALESCE(SUM(CASE WHEN status = ''approved'' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = ''rejected'' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = ''auto_executed'' THEN 1 ELSE 0 END), 0),
                COALESCE(COUNT(*), 0)
              FROM hitl_pending_approvals
              WHERE org_id = $1
                AND (metadata->>''action_type'') = $2
                AND created_at >= $3
                AND created_at <= $4'
            USING p_org_id, v_action, v_window_start, v_window_end
            INTO v_hitl_approved, v_hitl_rejected, v_hitl_auto, v_hitl_total;

            v_approval := v_approval + v_hitl_approved;
            v_rejection := v_rejection + v_hitl_rejected;
            v_auto := v_auto + v_hitl_auto;
            v_total := v_total + v_hitl_total;
          END;
        END IF;
      END IF;

      -- Upsert the stats row
      INSERT INTO autonomy_action_stats (
        org_id, action_type, window_start, window_end, window_days,
        approval_count, rejection_count, edit_count, auto_approved_count,
        total_count, calculated_at
      ) VALUES (
        p_org_id, v_action, v_window_start, v_window_end, v_window,
        v_approval, v_rejection, v_edit, v_auto,
        v_total, now()
      )
      ON CONFLICT (org_id, action_type, window_days)
      DO UPDATE SET
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        approval_count = EXCLUDED.approval_count,
        rejection_count = EXCLUDED.rejection_count,
        edit_count = EXCLUDED.edit_count,
        auto_approved_count = EXCLUDED.auto_approved_count,
        total_count = EXCLUDED.total_count,
        calculated_at = EXCLUDED.calculated_at;

    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.refresh_autonomy_analytics(UUID) IS
  'Recalculates approval rate stats from crm_approval_queue, crm_field_updates, '
  'and agent_activity for all action types and time windows (7d, 30d, 90d).';

GRANT EXECUTE ON FUNCTION public.refresh_autonomy_analytics(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC: get_autonomy_analytics
--
-- Returns cached stats for an org. Caller should check freshness and
-- call refresh_autonomy_analytics if stale (handled by TypeScript layer).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_autonomy_analytics(
  p_org_id UUID,
  p_window_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  action_type TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  approval_count INTEGER,
  rejection_count INTEGER,
  edit_count INTEGER,
  auto_approved_count INTEGER,
  total_count INTEGER,
  approval_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    aas.action_type,
    aas.window_start,
    aas.window_end,
    aas.approval_count,
    aas.rejection_count,
    aas.edit_count,
    aas.auto_approved_count,
    aas.total_count,
    aas.approval_rate
  FROM autonomy_action_stats aas
  WHERE aas.org_id = p_org_id
    AND aas.window_days = p_window_days
  ORDER BY aas.total_count DESC;
$$;

COMMENT ON FUNCTION public.get_autonomy_analytics(UUID, INTEGER) IS
  'Returns cached approval rate stats for all action types in an org. '
  'Filter by window_days (7, 30, or 90). Returns empty if not yet calculated.';

GRANT EXECUTE ON FUNCTION public.get_autonomy_analytics(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_autonomy_analytics(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260223400001_autonomy_analytics.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'GRAD-001: Approval rate analytics and tracking';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autonomy_action_stats table (replaces autonomy_analytics)';
  RAISE NOTICE '  - map_field_to_action_type() helper function';
  RAISE NOTICE '  - refresh_autonomy_analytics(org_id) RPC';
  RAISE NOTICE '  - get_autonomy_analytics(org_id, window_days) RPC';
  RAISE NOTICE '';
  RAISE NOTICE 'Action types tracked: crm_stage_change, crm_field_update,';
  RAISE NOTICE '  crm_contact_create, send_email, send_slack, create_task,';
  RAISE NOTICE '  enrich_contact, draft_proposal';
  RAISE NOTICE '';
  RAISE NOTICE 'Time windows: 7d, 30d, 90d';
  RAISE NOTICE '';
  RAISE NOTICE 'Data sources:';
  RAISE NOTICE '  - crm_approval_queue (CRM field/stage changes)';
  RAISE NOTICE '  - crm_field_updates (auto-applied changes)';
  RAISE NOTICE '  - agent_activity (broader action types via metadata)';
  RAISE NOTICE '  - hitl_pending_approvals (if exists, for legacy backfill)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
