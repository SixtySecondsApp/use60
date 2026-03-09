-- ============================================================================
-- Credit Security Fixes
-- ============================================================================
-- FIX V1: deduct_credits_ordered — validate p_amount > 0
--   Prevents negative-amount exploit that could add unlimited credits.
-- FIX V5: org_credit_balance UPDATE RLS — restrict to non-balance columns
--   Prevents org admins from directly setting balance_credits, lifetime_purchased,
--   or lifetime_consumed via direct table UPDATE. Balance changes must go through
--   RPCs (deduct_credits_ordered, add_credits, grant_subscription_credits, etc.)
-- ============================================================================

-- ============================================================================
-- FIX V1: Patch deduct_credits_ordered to reject non-positive amounts
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_credits_ordered(
  p_org_id    UUID,
  p_amount    DECIMAL,
  p_action_id TEXT    DEFAULT NULL,
  p_tier      TEXT    DEFAULT 'medium',
  p_refs      JSONB   DEFAULT '{}'
) RETURNS DECIMAL AS $$
DECLARE
  v_row             RECORD;
  v_new_balance     DECIMAL;
  v_remaining       DECIMAL;
  v_deduct          DECIMAL;
  v_sub_used        DECIMAL := 0;
  v_onb_used        DECIMAL := 0;
  v_pack_used       DECIMAL := 0;
  v_pack            RECORD;
  v_deduct_from_pack DECIMAL;
BEGIN
  -- Security: reject non-positive amounts to prevent credit farming via negative deductions
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got %', p_amount;
  END IF;

  -- Lock the aggregate balance row
  SELECT balance_credits,
         subscription_credits_balance,
         onboarding_credits_balance
  INTO v_row
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Insufficient funds check
  IF v_row.balance_credits < p_amount THEN
    RETURN -1;
  END IF;

  v_remaining := p_amount;

  -- ------------------------------------------------------------------
  -- Step 1: Consume from subscription_credits_balance
  -- ------------------------------------------------------------------
  IF v_remaining > 0 AND v_row.subscription_credits_balance > 0 THEN
    v_deduct := LEAST(v_remaining, v_row.subscription_credits_balance);
    v_row.subscription_credits_balance := v_row.subscription_credits_balance - v_deduct;
    v_remaining := v_remaining - v_deduct;
    v_sub_used  := v_deduct;
  END IF;

  -- ------------------------------------------------------------------
  -- Step 2: Consume from onboarding_credits_balance
  -- ------------------------------------------------------------------
  IF v_remaining > 0 AND v_row.onboarding_credits_balance > 0 THEN
    v_deduct := LEAST(v_remaining, v_row.onboarding_credits_balance);
    v_row.onboarding_credits_balance := v_row.onboarding_credits_balance - v_deduct;
    v_remaining := v_remaining - v_deduct;
    v_onb_used  := v_deduct;
  END IF;

  -- ------------------------------------------------------------------
  -- Step 3: FIFO pack deduction (bonus packs first, then oldest purchased_at)
  -- ------------------------------------------------------------------
  IF v_remaining > 0 THEN
    FOR v_pack IN
      SELECT id, credits_remaining
      FROM credit_packs
      WHERE org_id = p_org_id
        AND credits_remaining > 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY
        CASE WHEN source = 'bonus' THEN 0 ELSE 1 END ASC,
        purchased_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_deduct_from_pack := LEAST(v_remaining, v_pack.credits_remaining);

      UPDATE credit_packs
      SET credits_remaining = credits_remaining - v_deduct_from_pack
      WHERE id = v_pack.id;

      v_remaining := v_remaining - v_deduct_from_pack;
      v_pack_used := v_pack_used + v_deduct_from_pack;
    END LOOP;
  END IF;

  -- ------------------------------------------------------------------
  -- Update aggregate balance
  -- ------------------------------------------------------------------
  v_new_balance := v_row.balance_credits - p_amount;

  UPDATE org_credit_balance
  SET balance_credits              = v_new_balance,
      subscription_credits_balance = v_row.subscription_credits_balance,
      onboarding_credits_balance   = v_row.onboarding_credits_balance,
      lifetime_consumed            = lifetime_consumed + p_amount
  WHERE org_id = p_org_id;

  -- ------------------------------------------------------------------
  -- Immutable ledger entry
  -- ------------------------------------------------------------------
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description, feature_key, created_by
  ) VALUES (
    p_org_id,
    'deduction',
    -p_amount,
    v_new_balance,
    COALESCE(p_action_id, 'credit_deduction'),
    p_action_id,
    auth.uid()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION deduct_credits_ordered(UUID, DECIMAL, TEXT, TEXT, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION deduct_credits_ordered IS 'Ordered credit deduction: subscription credits first, then onboarding credits, then FIFO packs (bonus before oldest purchased_at). Returns new balance_credits or -1 if insufficient. Rejects non-positive amounts.';

-- ============================================================================
-- FIX V5: Restrict org_credit_balance UPDATE RLS to non-balance columns only
-- ============================================================================
-- The existing "Org admins can update their org_credit_balance" policy allows
-- admins to UPDATE any column including balance_credits, which could let an
-- admin set their own balance to an arbitrary value.
--
-- We replace the policy with a WITH CHECK that restricts which columns can
-- be changed: only settings columns (low_balance_threshold, auto_topup_*)
-- are allowed. Balance columns (balance_credits, lifetime_purchased,
-- lifetime_consumed) must only change via SECURITY DEFINER RPCs.
-- ============================================================================

DROP POLICY IF EXISTS "Org admins can update their org_credit_balance" ON org_credit_balance;

CREATE POLICY "Org admins can update their org_credit_balance"
  ON org_credit_balance FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_credit_balance.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    -- Admins can update settings columns only.
    -- Balance columns (balance_credits, lifetime_purchased, lifetime_consumed)
    -- are protected by a BEFORE UPDATE trigger instead of RLS WITH CHECK,
    -- because RLS cannot reference OLD values.
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_credit_balance.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

COMMENT ON POLICY "Org admins can update their org_credit_balance" ON org_credit_balance
  IS 'Org admins can update settings columns (low_balance_threshold, auto_topup_*) but cannot directly modify balance_credits, lifetime_purchased, or lifetime_consumed. Balance changes must go through SECURITY DEFINER RPCs.';

-- ============================================================================
-- BEFORE UPDATE trigger to protect balance columns from direct modification
-- by non-service-role users (i.e. authenticated org admins via RLS).
-- Service role (used by SECURITY DEFINER RPCs) bypasses RLS entirely,
-- so this trigger only fires for direct client-side UPDATEs.
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_credit_balance_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- SECURITY DEFINER functions run as the function owner (postgres/superuser),
  -- so current_setting('role') won't be 'service_role' inside them.
  -- Instead, detect "direct client UPDATE" by checking if current_user differs
  -- from session_user. In SECURITY DEFINER RPCs, current_user = function owner
  -- while session_user = the authenticated caller — so they differ.
  -- For direct client UPDATEs, current_user = session_user = 'authenticated'.
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- If any balance column changed, reject
  IF NEW.balance_credits IS DISTINCT FROM OLD.balance_credits
    OR NEW.lifetime_purchased IS DISTINCT FROM OLD.lifetime_purchased
    OR NEW.lifetime_consumed IS DISTINCT FROM OLD.lifetime_consumed
  THEN
    RAISE EXCEPTION 'Direct modification of balance columns is not allowed. Use the credit RPCs instead.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_credit_balance_columns_trigger ON org_credit_balance;

CREATE TRIGGER protect_credit_balance_columns_trigger
  BEFORE UPDATE ON org_credit_balance
  FOR EACH ROW
  EXECUTE FUNCTION protect_credit_balance_columns();
