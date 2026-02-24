-- ============================================================================
-- Credit Low Balance Notifications
-- ============================================================================
-- Trigger on org_credit_balance AFTER UPDATE: when balance drops below
-- low_balance_threshold, notify org admins via the notifications table.
-- Uses existing notify_org_members() for fan-out.

-- ============================================================================
-- 1. Trigger function: notify admins when balance drops below threshold
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_credit_low_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_org_name TEXT;
BEGIN
  -- Only fire when balance actually decreased
  IF NEW.balance_credits >= OLD.balance_credits THEN
    RETURN NEW;
  END IF;

  -- Check if balance just crossed below the threshold
  -- (was above threshold before, now at or below)
  IF OLD.balance_credits > NEW.low_balance_threshold
     AND NEW.balance_credits <= NEW.low_balance_threshold
     AND NEW.balance_credits > 0 THEN

    -- Get org name for the notification message
    SELECT name INTO v_org_name
    FROM organizations WHERE id = NEW.org_id;

    -- Notify org admins and owners
    PERFORM notify_org_members(
      NEW.org_id,
      ARRAY['owner', 'admin'],
      'Low AI Credit Balance',
      format('Your AI credit balance is low (%s credits remaining). Top up to avoid service interruption.', ROUND(NEW.balance_credits::NUMERIC, 2)),
      'warning',
      'system',
      '/settings/credits',
      jsonb_build_object(
        'notification_type', 'credit_low_balance',
        'balance', NEW.balance_credits,
        'threshold', NEW.low_balance_threshold,
        'org_name', v_org_name
      ),
      TRUE -- is_org_wide
    );
  END IF;

  -- Check if balance just hit zero
  IF OLD.balance_credits > 0 AND NEW.balance_credits <= 0 THEN

    SELECT name INTO v_org_name
    FROM organizations WHERE id = NEW.org_id;

    PERFORM notify_org_members(
      NEW.org_id,
      ARRAY['owner', 'admin'],
      'AI Credits Exhausted',
      'Your AI credit balance has reached zero. AI features are now paused. Top up to resume.',
      'error',
      'system',
      '/settings/credits',
      jsonb_build_object(
        'notification_type', 'credit_exhausted',
        'balance', NEW.balance_credits,
        'org_name', v_org_name
      ),
      TRUE
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. Attach trigger to org_credit_balance
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_credit_low_balance_notification ON org_credit_balance;
CREATE TRIGGER trigger_credit_low_balance_notification
  AFTER UPDATE OF balance_credits ON org_credit_balance
  FOR EACH ROW
  EXECUTE FUNCTION notify_credit_low_balance();

COMMENT ON FUNCTION notify_credit_low_balance IS
  'Notifies org admins when credit balance drops below threshold or reaches zero.';
