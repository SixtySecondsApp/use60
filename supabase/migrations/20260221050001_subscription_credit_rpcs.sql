-- ============================================================================
-- Subscription Credit Lifecycle RPCs
-- ============================================================================
-- 4 RPCs for managing subscription and onboarding credits:
--   1. grant_subscription_credits   — Pro plan monthly credit grant
--   2. expire_subscription_credits  — Expire unused subscription credits at cycle end
--   3. grant_onboarding_credits     — One-time onboarding credit grant (idempotent)
--   4. deduct_credits_ordered       — Ordered deduction: subscription → onboarding → packs (FIFO)

-- ============================================================================
-- RPC 1: grant_subscription_credits
-- ============================================================================
-- Replaces the current subscription credit balance with p_amount and sets the
-- expiry to p_period_end. Adds credits to the aggregate balance_credits.
-- Returns new balance_credits.

CREATE OR REPLACE FUNCTION grant_subscription_credits(
  p_org_id     UUID,
  p_amount     DECIMAL,
  p_period_end TIMESTAMPTZ
) RETURNS DECIMAL AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance     DECIMAL;
BEGIN
  -- Lock the aggregate balance row
  SELECT balance_credits INTO v_current_balance
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update subscription credits and aggregate balance
  UPDATE org_credit_balance
  SET subscription_credits_balance = p_amount,
      subscription_credits_expiry  = p_period_end,
      balance_credits              = v_new_balance,
      lifetime_purchased           = lifetime_purchased + p_amount
  WHERE org_id = p_org_id;

  -- Immutable ledger entry
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description, created_by
  ) VALUES (
    p_org_id,
    'bonus',
    p_amount,
    v_new_balance,
    'Subscription credits granted (Pro plan)',
    auth.uid()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION grant_subscription_credits(UUID, DECIMAL, TIMESTAMPTZ) TO authenticated, service_role;

COMMENT ON FUNCTION grant_subscription_credits IS 'Grant Pro plan monthly subscription credits. Sets subscription_credits_balance to p_amount and extends balance_credits. Idempotent-safe: call at cycle start to reset.';

-- ============================================================================
-- RPC 2: expire_subscription_credits
-- ============================================================================
-- Sweeps unused subscription credits at billing cycle end.
-- If subscription_credits_balance > 0, deducts them from balance_credits
-- and records an adjustment transaction.
-- Returns current balance_credits (updated if credits were expired, else unchanged).

CREATE OR REPLACE FUNCTION expire_subscription_credits(
  p_org_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_row             RECORD;
  v_new_balance     DECIMAL;
BEGIN
  -- Lock the aggregate balance row
  SELECT balance_credits, subscription_credits_balance
  INTO v_row
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Nothing to expire
  IF v_row.subscription_credits_balance <= 0 THEN
    RETURN v_row.balance_credits;
  END IF;

  v_new_balance := v_row.balance_credits - v_row.subscription_credits_balance;

  -- Record expiry adjustment before zeroing the balance
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description, created_by
  ) VALUES (
    p_org_id,
    'adjustment',
    -v_row.subscription_credits_balance,
    v_new_balance,
    'Subscription credits expired (cycle end)',
    auth.uid()
  );

  -- Zero out subscription credits and update aggregate balance
  UPDATE org_credit_balance
  SET balance_credits              = v_new_balance,
      subscription_credits_balance = 0,
      subscription_credits_expiry  = NULL
  WHERE org_id = p_org_id;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION expire_subscription_credits(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION expire_subscription_credits IS 'Expire unused subscription credits at billing cycle end. Deducts subscription_credits_balance from balance_credits and records an adjustment. No-op if subscription_credits_balance is already 0.';

-- ============================================================================
-- RPC 3: grant_onboarding_credits
-- ============================================================================
-- One-time onboarding credit grant. Idempotent: returns current balance
-- without modification if onboarding_complete = true.
-- Returns new balance_credits.

CREATE OR REPLACE FUNCTION grant_onboarding_credits(
  p_org_id UUID,
  p_amount  DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  v_row         RECORD;
  v_new_balance DECIMAL;
BEGIN
  -- Lock the aggregate balance row
  SELECT balance_credits, onboarding_complete
  INTO v_row
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Idempotent: onboarding credits already granted
  IF v_row.onboarding_complete = true THEN
    RETURN v_row.balance_credits;
  END IF;

  v_new_balance := v_row.balance_credits + p_amount;

  -- Grant credits and mark onboarding complete
  UPDATE org_credit_balance
  SET onboarding_credits_balance = p_amount,
      onboarding_complete        = true,
      balance_credits            = v_new_balance,
      lifetime_purchased         = lifetime_purchased + p_amount
  WHERE org_id = p_org_id;

  -- Immutable ledger entry
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description, created_by
  ) VALUES (
    p_org_id,
    'bonus',
    p_amount,
    v_new_balance,
    'Onboarding credits granted',
    auth.uid()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION grant_onboarding_credits(UUID, DECIMAL) TO authenticated, service_role;

COMMENT ON FUNCTION grant_onboarding_credits IS 'One-time onboarding credit grant. Idempotent: no-op if onboarding_complete = true. Returns new balance_credits or current balance if already granted.';

-- ============================================================================
-- RPC 4: deduct_credits_ordered
-- ============================================================================
-- Ordered deduction: subscription credits first, then onboarding credits,
-- then purchased/bonus packs (FIFO: bonus packs before oldest purchased_at).
-- Returns new balance_credits, or -1 if insufficient funds.

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

COMMENT ON FUNCTION deduct_credits_ordered IS 'Ordered credit deduction: subscription credits first, then onboarding credits, then FIFO packs (bonus before oldest purchased_at). Returns new balance_credits or -1 if insufficient.';
