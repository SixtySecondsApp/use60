-- Trial Grace Period Schema Migration
-- Adds grace_period columns, expands status CHECK constraint,
-- adds deactivation_reason to organizations, recreates missing SELECT policy,
-- and updates deletion_scheduled_at trigger to be conditional on deactivation reason.

-- ============================================================================
-- 1. Add grace period columns to organization_subscriptions
-- ============================================================================

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

-- ============================================================================
-- 2. Update status CHECK constraint to include 'grace_period' and 'expired'
-- ============================================================================

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text,
    'trialing'::text,
    'past_due'::text,
    'canceled'::text,
    'paused'::text,
    'grace_period'::text,
    'expired'::text
  ]));

-- ============================================================================
-- 3. Add deactivation_reason column to organizations table
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- ============================================================================
-- 4. Create indexes for efficient querying
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_trial_ends_at
  ON public.organization_subscriptions (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_grace_period_ends_at
  ON public.organization_subscriptions (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- ============================================================================
-- 5. Recreate missing SELECT policy for organization_subscriptions
--    (was dropped in baseline_fixed migration 20260108203000)
--    Members can read their own organization's subscription.
-- ============================================================================

DROP POLICY IF EXISTS "organization_subscriptions_select" ON public.organization_subscriptions;

CREATE POLICY "organization_subscriptions_select"
  ON public.organization_subscriptions
  FOR SELECT
  USING (
    public.is_service_role()
    OR public.is_admin_optimized()
    OR org_id IN (
      SELECT org_id
      FROM public.organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. Update deletion_scheduled_at trigger to be conditional:
--    - 14 days for trial_expired deactivation reason
--    - 30 days for subscription cancellation / other reasons
-- ============================================================================

CREATE OR REPLACE FUNCTION set_org_deletion_schedule()
RETURNS trigger AS $$
BEGIN
  -- If organization is being deactivated (is_active transitioning from true to false)
  IF NEW.is_active = false AND OLD.is_active = true THEN
    -- Use 14 days for trial expiry, 30 days for subscription cancellation or other
    -- Note: cron writes 'trial_expired_no_subscription' — match both variants
    IF NEW.deactivation_reason IN ('trial_expired', 'trial_expired_no_subscription') THEN
      NEW.deletion_scheduled_at := now() + INTERVAL '14 days';
    ELSE
      NEW.deletion_scheduled_at := now() + INTERVAL '30 days';
    END IF;
  END IF;

  -- If organization is being reactivated, clear the deletion schedule
  IF NEW.is_active = true AND OLD.is_active = false THEN
    NEW.deletion_scheduled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 20260205140001, function is replaced above.
-- Ensure trigger is present (idempotent).
DROP TRIGGER IF EXISTS org_set_deletion_on_deactivate ON public.organizations;

CREATE TRIGGER org_set_deletion_on_deactivate
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_org_deletion_schedule();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'trial_grace_period migration complete:';
  RAISE NOTICE '  + grace_period_started_at / grace_period_ends_at columns added';
  RAISE NOTICE '  + status CHECK constraint updated (grace_period, expired)';
  RAISE NOTICE '  + deactivation_reason column added to organizations';
  RAISE NOTICE '  + indexes created for trial_ends_at and grace_period_ends_at';
  RAISE NOTICE '  + organization_subscriptions SELECT policy recreated';
  RAISE NOTICE '  + deletion trigger updated: 14d trial_expired, 30d others';
END $$;
