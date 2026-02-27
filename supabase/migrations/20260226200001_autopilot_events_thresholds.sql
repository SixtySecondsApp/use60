-- ============================================================================
-- AP-003: Autopilot Events + Thresholds Tables
-- Autopilot Engine — audit trail and per-action-type promotion configuration
--
-- autopilot_events:     Immutable audit log of every tier transition, promotion
--                       proposal, acceptance, decline, demotion, and manual
--                       override in the Autopilot Engine.
--
-- autopilot_thresholds: Platform defaults (org_id IS NULL) and per-org overrides
--                       that define when a (user, action_type) pair is eligible
--                       for promotion to the next tier.
--
-- Companion to: AP-001 (autopilot_signals), AP-002 (autopilot_confidence)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: autopilot_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autopilot_events (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What action this event is about (e.g. 'create_task', 'send_email')
  action_type       TEXT          NOT NULL,

  -- The class of event that occurred
  event_type        TEXT          NOT NULL,

  -- Tier transition bookends
  from_tier         TEXT          NOT NULL,
  to_tier           TEXT          NOT NULL,

  -- Confidence score at the moment of the event (0.0–1.0)
  confidence_score  NUMERIC(4,3),

  -- JSONB snapshot of approval/rejection/undo stats at event time
  approval_stats    JSONB,

  -- JSONB snapshot of the threshold configuration that triggered this event
  threshold_config  JSONB,

  -- Human-readable explanation of why the event was triggered
  trigger_reason    TEXT,

  -- When the next promotion evaluation is allowed (post-demotion cooldown)
  cooldown_until    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_autopilot_events_event_type CHECK (
    event_type IN (
      'promotion_proposed', 'promotion_accepted', 'promotion_declined',
      'promotion_never', 'demotion_warning', 'demotion_auto',
      'demotion_emergency', 'manual_override'
    )
  )
);

COMMENT ON TABLE public.autopilot_events IS
  'Immutable audit trail for the Autopilot Engine (AP-003). One row per tier '
  'transition, promotion proposal/acceptance/decline, demotion, or manual '
  'override. Snapshots of confidence score, approval stats, and threshold '
  'config are stored at event time for forensic replay.';

COMMENT ON COLUMN public.autopilot_events.event_type IS
  'Class of event: promotion_proposed | promotion_accepted | promotion_declined | '
  'promotion_never | demotion_warning | demotion_auto | demotion_emergency | manual_override.';

COMMENT ON COLUMN public.autopilot_events.from_tier IS
  'Autopilot tier before the event (disabled | suggest | approve | auto).';

COMMENT ON COLUMN public.autopilot_events.to_tier IS
  'Autopilot tier after the event (disabled | suggest | approve | auto). '
  'Equal to from_tier for warning and proposal events.';

COMMENT ON COLUMN public.autopilot_events.approval_stats IS
  'Snapshot of the autopilot_confidence row at event time: approval_rate, '
  'clean_approval_rate, rejection_rate, undo_rate, total_signals, days_active, etc.';

COMMENT ON COLUMN public.autopilot_events.threshold_config IS
  'Snapshot of the autopilot_thresholds row that triggered this event, '
  'for forensic audit without requiring historical threshold reconstruction.';

COMMENT ON COLUMN public.autopilot_events.cooldown_until IS
  'Populated on demotion events. Promotion evaluation is suppressed until '
  'this timestamp to prevent rapid oscillation.';

-- ---------------------------------------------------------------------------
-- 2. Indexes: autopilot_events
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_events_user
  ON public.autopilot_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_org
  ON public.autopilot_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_action_type
  ON public.autopilot_events (org_id, action_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security: autopilot_events
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_events ENABLE ROW LEVEL SECURITY;

-- Users read their own events
DO $$ BEGIN
  CREATE POLICY "autopilot_events_user_select"
  ON public.autopilot_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners read all events for their org
DO $$ BEGIN
  CREATE POLICY "autopilot_events_admin_select"
  ON public.autopilot_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_events.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access (edge functions write events via service-role client)
DO $$ BEGIN
  CREATE POLICY "autopilot_events_service_all"
  ON public.autopilot_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grants: autopilot_events
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autopilot_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Table: autopilot_thresholds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autopilot_thresholds (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = platform default; non-NULL = per-org override
  org_id                      UUID          REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Action type and tier transition this threshold governs
  action_type                 TEXT          NOT NULL,
  from_tier                   TEXT          NOT NULL,
  to_tier                     TEXT          NOT NULL,

  -- Minimum number of total signals required before promotion is considered
  min_signals                 INTEGER       NOT NULL,

  -- Minimum fraction of approvals that were "clean" (no edit, no rubber-stamp)
  min_clean_approval_rate     NUMERIC(4,3)  NOT NULL,

  -- Maximum tolerated rejection rate (0.0–1.0) for promotion eligibility
  max_rejection_rate          NUMERIC(4,3)  NOT NULL,

  -- Maximum tolerated undo rate (0.0–1.0) for promotion eligibility
  max_undo_rate               NUMERIC(4,3)  NOT NULL,

  -- Minimum number of calendar days the user must have been active
  min_days_active             INTEGER       NOT NULL,

  -- Minimum composite confidence score required
  min_confidence_score        NUMERIC(4,3)  NOT NULL,

  -- Require the last N outcomes to be clean approvals (streak guard)
  last_n_clean                INTEGER       NOT NULL,

  -- Whether this threshold row is active
  enabled                     BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Permanently block promotion for this (org, action_type, from_tier, to_tier)
  never_promote               BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Promotion requires an explicit admin approval before taking effect
  requires_admin_approval     BOOLEAN       NOT NULL DEFAULT FALSE,

  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- One row per (org_id, action_type, from_tier, to_tier).
  -- NULLS NOT DISTINCT ensures platform defaults (org_id IS NULL) also
  -- participate in the uniqueness check — avoids multiple platform defaults
  -- for the same (action_type, from_tier, to_tier) combination.
  CONSTRAINT uq_autopilot_thresholds UNIQUE NULLS NOT DISTINCT (org_id, action_type, from_tier, to_tier)
);

COMMENT ON TABLE public.autopilot_thresholds IS
  'Per-action-type promotion configuration for the Autopilot Engine (AP-003). '
  'Rows with org_id IS NULL are platform defaults; rows with a non-NULL org_id '
  'override the platform default for that organisation. The promotion-queue job '
  'evaluates autopilot_confidence against the effective threshold (org override '
  'takes precedence over platform default) before proposing a tier change.';

COMMENT ON COLUMN public.autopilot_thresholds.org_id IS
  'NULL = platform-wide default visible to all orgs. '
  'Non-NULL = org-specific override that supersedes the platform default.';

COMMENT ON COLUMN public.autopilot_thresholds.min_clean_approval_rate IS
  'Minimum fraction of approvals classified as "clean" (approved without edit '
  'and above the deliberation-time threshold) required for promotion.';

COMMENT ON COLUMN public.autopilot_thresholds.last_n_clean IS
  'The most recent N outcomes must all be clean approvals. Acts as a streak '
  'guard to prevent promotion on the strength of old history alone.';

COMMENT ON COLUMN public.autopilot_thresholds.never_promote IS
  'When TRUE, the promotion-queue job will never propose promotion for this '
  '(org, action_type, from_tier, to_tier) regardless of confidence. Mirrors '
  'the never_promote flag on autopilot_confidence but operates at the policy level.';

COMMENT ON COLUMN public.autopilot_thresholds.requires_admin_approval IS
  'When TRUE, a successful promotion check creates a promotion_proposed event '
  'and waits for an org admin to explicitly accept before changing the tier.';

-- ---------------------------------------------------------------------------
-- 6. Indexes: autopilot_thresholds
-- ---------------------------------------------------------------------------

-- Primary runtime lookup: find effective thresholds for an org + action type
CREATE INDEX IF NOT EXISTS idx_thresholds_org_action
  ON public.autopilot_thresholds (org_id, action_type)
  WHERE enabled = TRUE;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: autopilot_thresholds
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_thresholds ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read platform defaults (org_id IS NULL)
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_platform_select"
  ON public.autopilot_thresholds FOR SELECT
  TO authenticated
  USING (org_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can read their org's overrides
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_org_admin_select"
  ON public.autopilot_thresholds FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_thresholds.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can insert new org-level overrides
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_org_admin_insert"
  ON public.autopilot_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_thresholds.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can update their org's overrides
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_org_admin_update"
  ON public.autopilot_thresholds FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_thresholds.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_thresholds.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins / owners can delete their org's overrides
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_org_admin_delete"
  ON public.autopilot_thresholds FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL AND
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_thresholds.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access (edge functions manage platform defaults)
DO $$ BEGIN
  CREATE POLICY "autopilot_thresholds_service_all"
  ON public.autopilot_thresholds FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Grants: autopilot_thresholds
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autopilot_thresholds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_thresholds TO service_role;

-- ---------------------------------------------------------------------------
-- 9. updated_at trigger: autopilot_thresholds
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_autopilot_thresholds_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autopilot_thresholds_updated_at ON public.autopilot_thresholds;
CREATE TRIGGER autopilot_thresholds_updated_at
  BEFORE UPDATE ON public.autopilot_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.update_autopilot_thresholds_updated_at();

-- ---------------------------------------------------------------------------
-- 10. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226200001_autopilot_events_thresholds.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-003: autopilot_events + autopilot_thresholds tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autopilot_events table (immutable tier-transition audit log)';
  RAISE NOTICE '    CHECK constraint on event_type (8 valid values)';
  RAISE NOTICE '    Indexes: idx_events_user (user_id, created_at DESC)';
  RAISE NOTICE '             idx_events_org  (org_id, created_at DESC)';
  RAISE NOTICE '             idx_events_action_type (org_id, action_type, created_at DESC)';
  RAISE NOTICE '    RLS: user self-read, org admin read, service_role full access';
  RAISE NOTICE '';
  RAISE NOTICE '  - autopilot_thresholds table (promotion criteria per action_type)';
  RAISE NOTICE '    UNIQUE NULLS NOT DISTINCT on (org_id, action_type, from_tier, to_tier)';
  RAISE NOTICE '    Index: idx_thresholds_org_action (org_id, action_type) WHERE enabled';
  RAISE NOTICE '    RLS: platform defaults readable by all authenticated users';
  RAISE NOTICE '         org overrides: SELECT/INSERT/UPDATE/DELETE for org admins/owners';
  RAISE NOTICE '         service_role full access';
  RAISE NOTICE '    updated_at trigger: update_autopilot_thresholds_updated_at()';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
