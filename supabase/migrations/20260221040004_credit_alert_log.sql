-- ============================================================================
-- Credit Alert Log
-- ============================================================================
-- Records proactive credit alerts surfaced to users via the Copilot.
-- Used for cooldown enforcement (preventing duplicate alerts within a window)
-- and audit trail of all credit-related notifications.
-- Service-role only — never exposed directly to end users.

-- ============================================================================
-- 1. credit_alert_log table
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_alert_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  user_id         UUID NOT NULL,
  alert_type      TEXT NOT NULL CHECK (alert_type IN (
                    'low_balance_20pct', 'low_balance_10cr', 'negative_balance',
                    'budget_cap_hit', 'weekly_digest', 'tier_upgrade_suggestion'
                  )),
  alerted_at      TIMESTAMPTZ DEFAULT NOW(),
  data            JSONB DEFAULT '{}'
);

-- ============================================================================
-- 2. Index for cooldown lookups
-- ============================================================================

CREATE INDEX idx_credit_alert_log_lookup
  ON credit_alert_log(org_id, user_id, alert_type, alerted_at DESC);

-- ============================================================================
-- 3. RLS — service_role only
-- ============================================================================

ALTER TABLE credit_alert_log ENABLE ROW LEVEL SECURITY;

-- Service role has unrestricted access (internal use only)
DROP POLICY IF EXISTS "Service role has full access to credit_alert_log" ON credit_alert_log;
DO $$ BEGIN
  CREATE POLICY "Service role has full access to credit_alert_log"
  ON credit_alert_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 4. Comments
-- ============================================================================

COMMENT ON TABLE credit_alert_log IS 'Audit log of proactive credit alerts surfaced to users via the Copilot. Used for cooldown enforcement.';
COMMENT ON COLUMN credit_alert_log.alert_type IS 'Alert category: low_balance_20pct | low_balance_10cr | negative_balance | budget_cap_hit | weekly_digest | tier_upgrade_suggestion';
COMMENT ON COLUMN credit_alert_log.alerted_at IS 'When the alert was surfaced to the user';
COMMENT ON COLUMN credit_alert_log.data IS 'JSONB payload with alert-specific context (balance, cap, costs, etc.)';
