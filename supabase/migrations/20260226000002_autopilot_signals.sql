-- ============================================================================
-- AP-001: Autopilot Signals Table
-- Records every human feedback signal (approve, reject, edit, undo, etc.)
-- emitted by the Autopilot Engine against proposed agent actions.
--
-- This is the primary training-data and analytics store for the graduated
-- autonomy system. Signals feed approval-rate calculations, rubber-stamp
-- detection, and future per-user/per-action-type trust calibration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create autopilot_signals table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.autopilot_signals (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                   UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type               TEXT          NOT NULL,
  agent_name                TEXT          NOT NULL,
  signal                    TEXT          NOT NULL,
  edit_distance             INTEGER       DEFAULT 0,
  edit_fields               TEXT[],
  time_to_respond_ms        INTEGER,
  rubber_stamp              BOOLEAN       DEFAULT FALSE,
  confidence_at_proposal    NUMERIC(3,2),
  deal_id                   UUID,
  contact_id                UUID,
  meeting_id                UUID,
  autonomy_tier_at_time     TEXT          NOT NULL DEFAULT 'approve',
  is_backfill               BOOLEAN       DEFAULT FALSE,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_signals_signal CHECK (
    signal IN (
      'approved',
      'approved_edited',
      'rejected',
      'expired',
      'undone',
      'auto_executed',
      'auto_undone'
    )
  )
);

COMMENT ON TABLE public.autopilot_signals IS
  'Human feedback signals for every agent-proposed action in the Autopilot Engine. '
  'Feeds approval-rate analytics, rubber-stamp detection, and trust calibration. '
  'Service role handles inserts; users read their own signals. (AP-001)';

COMMENT ON COLUMN public.autopilot_signals.action_type IS
  'Namespaced action identifier, e.g. ''crm.note_add'', ''email.send'', ''task.create''.';

COMMENT ON COLUMN public.autopilot_signals.agent_name IS
  'Identifier of the agent or skill that proposed the action.';

COMMENT ON COLUMN public.autopilot_signals.signal IS
  'Human feedback outcome: approved | approved_edited | rejected | expired | undone | auto_executed | auto_undone.';

COMMENT ON COLUMN public.autopilot_signals.edit_distance IS
  'Character-level edit distance between the agent proposal and the final accepted value. '
  '0 for unedited approvals.';

COMMENT ON COLUMN public.autopilot_signals.edit_fields IS
  'Array of field names that were changed during an approved_edited response.';

COMMENT ON COLUMN public.autopilot_signals.time_to_respond_ms IS
  'Milliseconds between proposal surfacing and the user''s response. NULL for auto_executed.';

COMMENT ON COLUMN public.autopilot_signals.rubber_stamp IS
  'TRUE when time_to_respond_ms < 2000ms — flags suspiciously fast approvals for quality review.';

COMMENT ON COLUMN public.autopilot_signals.confidence_at_proposal IS
  'Agent confidence score (0.00–1.00) at the time the action was proposed.';

COMMENT ON COLUMN public.autopilot_signals.autonomy_tier_at_time IS
  'The autonomy tier setting in effect when the signal was recorded: disabled | suggest | approve | auto.';

COMMENT ON COLUMN public.autopilot_signals.is_backfill IS
  'TRUE for rows synthesised from historical approval data rather than recorded in real-time.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- Primary lookup: per-user approval rate by action type over time
CREATE INDEX IF NOT EXISTS idx_signals_user_action
  ON public.autopilot_signals (user_id, action_type, created_at DESC);

-- Org-wide dashboards and analytics
CREATE INDEX IF NOT EXISTS idx_signals_org
  ON public.autopilot_signals (org_id, created_at DESC);

-- Note: a partial index with WHERE created_at > NOW() - INTERVAL '90 days' cannot be used
-- here because NOW() is a volatile function and PostgreSQL evaluates partial index predicates
-- once at creation time (making it a stale constant). Rolling-window queries should instead
-- filter inline: WHERE created_at > NOW() - INTERVAL '90 days'. The composite index above
-- (idx_signals_user_action) provides efficient access for those queries.

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.autopilot_signals ENABLE ROW LEVEL SECURITY;

-- Users can read their own signals
DO $$ BEGIN
  CREATE POLICY "autopilot_signals_user_select"
  ON public.autopilot_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org admins can read all signals within their org
DO $$ BEGIN
  CREATE POLICY "autopilot_signals_admin_select"
  ON public.autopilot_signals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.org_id = autopilot_signals.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role: full access for inserts and analytics
DO $$ BEGIN
  CREATE POLICY "autopilot_signals_service_all"
  ON public.autopilot_signals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.autopilot_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_signals TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Migration summary
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260226000002_autopilot_signals.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'AP-001: autopilot_signals table';
  RAISE NOTICE '';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  - autopilot_signals table with 19 columns';
  RAISE NOTICE '  - CHECK constraint: signal IN (approved, approved_edited, rejected,';
  RAISE NOTICE '      expired, undone, auto_executed, auto_undone)';
  RAISE NOTICE '  - idx_signals_user_action  ON (user_id, action_type, created_at DESC)';
  RAISE NOTICE '  - idx_signals_org          ON (org_id, created_at DESC)';
  RAISE NOTICE '  - idx_signals_recent: OMITTED (volatile NOW() cannot be used in partial index)';
  RAISE NOTICE '    Use idx_signals_user_action with inline WHERE created_at filter instead';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS policies:';
  RAISE NOTICE '  - authenticated users: SELECT own rows (user_id = auth.uid())';
  RAISE NOTICE '  - org admins: SELECT all rows in their org';
  RAISE NOTICE '  - service_role: full access (INSERT handled by edge functions)';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
