-- ============================================================================
-- Grace Threshold: Allow negative balance within a configurable grace window
-- ============================================================================
-- Adds grace_threshold_credits and grace_recovery_pending to org_credit_balance.
-- Updates deduct_credits_fifo to allow deductions into negative territory
-- up to the grace threshold (returns -1 only when grace is exceeded).
-- Updates add_credits / add_credits_pack to clear grace_recovery_pending
-- and record a grace_recovery ledger entry when the balance turns positive.

-- ============================================================================
-- 1. Extend org_credit_balance with grace columns
-- ============================================================================

ALTER TABLE org_credit_balance
  ADD COLUMN IF NOT EXISTS grace_threshold_credits DECIMAL(10,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS grace_recovery_pending  BOOLEAN        NOT NULL DEFAULT false;

COMMENT ON COLUMN org_credit_balance.grace_threshold_credits IS 'Maximum negative balance allowed before hard-blocking AI usage. Default 10 credits.';
COMMENT ON COLUMN org_credit_balance.grace_recovery_pending  IS 'True when balance is negative (in grace zone) and a top-up is needed to clear it.';

-- ============================================================================
-- 2. Extend credit_transactions type CHECK to include grace_recovery
-- ============================================================================

ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
    CHECK (type IN ('purchase', 'deduction', 'refund', 'adjustment', 'bonus', 'grace_recovery'));

-- ============================================================================
-- 3. Replace deduct_credits_fifo with grace-aware version
-- ============================================================================
-- Behaviour:
--   new_balance = current_balance - p_amount
--   new_balance >= -grace_threshold  -> ALLOW (pack FIFO deduction runs as before)
--     • If new_balance < 0 set grace_recovery_pending = true
--   new_balance < -grace_threshold   -> BLOCK (return -1, no state change)

CREATE OR REPLACE FUNCTION deduct_credits_fifo(
  p_org_id        UUID,
  p_amount        DECIMAL,
  p_description   TEXT    DEFAULT NULL,
  p_feature_key   TEXT    DEFAULT NULL,
  p_cost_event_id UUID    DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_current_balance    DECIMAL;
  v_grace_threshold    DECIMAL;
  v_new_balance        DECIMAL;
  v_remaining          DECIMAL;
  v_pack               RECORD;
  v_deduct_from_pack   DECIMAL;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Lock the aggregate balance row for this org
  -- ----------------------------------------------------------------
  SELECT balance_credits, grace_threshold_credits
    INTO v_current_balance, v_grace_threshold
    FROM org_credit_balance
   WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Grace-aware balance check
  --    Allow if new_balance >= -grace_threshold, hard-block otherwise.
  -- ----------------------------------------------------------------
  v_new_balance := v_current_balance - p_amount;

  IF v_new_balance < -v_grace_threshold THEN
    RETURN -1;
  END IF;

  -- ----------------------------------------------------------------
  -- 3. FIFO pack deduction
  --    Consume from bonus packs first, then oldest purchased packs.
  --    We only deduct from packs up to what they hold; if the total
  --    pack inventory is less than p_amount the remainder comes from
  --    the aggregate balance (grace zone — no pack rows to drain).
  -- ----------------------------------------------------------------
  v_remaining := p_amount;

  FOR v_pack IN
    SELECT id, credits_remaining, source, purchased_at
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
  END LOOP;

  -- ----------------------------------------------------------------
  -- 4. Update aggregate balance
  -- ----------------------------------------------------------------
  UPDATE org_credit_balance
     SET balance_credits        = v_new_balance,
         lifetime_consumed      = lifetime_consumed + p_amount,
         grace_recovery_pending = CASE WHEN v_new_balance < 0 THEN true ELSE false END
   WHERE org_id = p_org_id;

  -- ----------------------------------------------------------------
  -- 5. Immutable ledger entry
  -- ----------------------------------------------------------------
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description,
    feature_key, ai_cost_event_id, created_by
  ) VALUES (
    p_org_id, 'deduction', -p_amount, v_new_balance, p_description,
    p_feature_key, p_cost_event_id, auth.uid()
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION deduct_credits_fifo IS
  'FIFO credit deduction across packs (bonus first, then oldest). Allows balance to go '
  'negative within grace_threshold_credits. Returns new balance or -1 if hard-blocked.';

-- ============================================================================
-- 4. Update add_credits to clear grace on positive recovery
-- ============================================================================

CREATE OR REPLACE FUNCTION add_credits(
  p_org_id           UUID,
  p_amount           DECIMAL,
  p_type             TEXT    DEFAULT 'purchase',
  p_description      TEXT    DEFAULT NULL,
  p_stripe_session_id TEXT   DEFAULT NULL,
  p_created_by       UUID    DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_balance_before DECIMAL;
  v_new_balance    DECIMAL;
BEGIN
  -- Capture balance before top-up (for grace_recovery ledger entry)
  SELECT balance_credits INTO v_balance_before
    FROM org_credit_balance
   WHERE org_id = p_org_id;

  -- Upsert the balance row (create if doesn't exist)
  INSERT INTO org_credit_balance (org_id, balance_credits, lifetime_purchased)
  VALUES (p_org_id, p_amount, p_amount)
  ON CONFLICT (org_id) DO UPDATE
    SET balance_credits    = org_credit_balance.balance_credits + p_amount,
        lifetime_purchased = org_credit_balance.lifetime_purchased + p_amount
  RETURNING balance_credits INTO v_new_balance;

  -- Record the primary transaction (positive amount)
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description,
    stripe_session_id, created_by
  ) VALUES (
    p_org_id, p_type, p_amount, v_new_balance, p_description,
    p_stripe_session_id, COALESCE(p_created_by, auth.uid())
  );

  -- Grace recovery: if balance was negative and is now >= 0, clear the flag
  -- and record a grace_recovery ledger entry for the cleared negative amount.
  IF v_balance_before IS NOT NULL AND v_balance_before < 0 AND v_new_balance >= 0 THEN
    UPDATE org_credit_balance
       SET grace_recovery_pending = false
     WHERE org_id = p_org_id;

    INSERT INTO credit_transactions (
      org_id, type, amount, balance_after, description, created_by
    ) VALUES (
      p_org_id,
      'grace_recovery',
      ABS(v_balance_before),   -- positive: the negative debt that was cleared
      v_new_balance,
      'Grace balance cleared by top-up',
      COALESCE(p_created_by, auth.uid())
    );
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION add_credits IS
  'Adds credits to an org balance (upserts balance row). Clears grace_recovery_pending '
  'and writes a grace_recovery ledger entry when balance recovers from negative. Returns new balance.';

-- ============================================================================
-- 5. Update add_credits_pack to clear grace on positive recovery
-- ============================================================================

CREATE OR REPLACE FUNCTION add_credits_pack(
  p_org_id       UUID,
  p_pack_type    TEXT,
  p_credits      DECIMAL,
  p_source       TEXT    DEFAULT 'manual',
  p_payment_id   TEXT    DEFAULT NULL,
  p_created_by   UUID    DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_balance_before DECIMAL;
  v_new_balance    DECIMAL;
BEGIN
  -- Capture balance before top-up
  SELECT balance_credits INTO v_balance_before
    FROM org_credit_balance
   WHERE org_id = p_org_id;

  -- ----------------------------------------------------------------
  -- 1. Insert the new pack
  -- ----------------------------------------------------------------
  INSERT INTO credit_packs (
    org_id, pack_type, credits_purchased, credits_remaining,
    source, payment_id, created_by
  ) VALUES (
    p_org_id, p_pack_type, p_credits, p_credits,
    p_source, p_payment_id, COALESCE(p_created_by, auth.uid())
  );

  -- ----------------------------------------------------------------
  -- 2. Upsert aggregate balance (create row if org is brand-new)
  -- ----------------------------------------------------------------
  INSERT INTO org_credit_balance (org_id, balance_credits, lifetime_purchased)
  VALUES (p_org_id, p_credits, p_credits)
  ON CONFLICT (org_id) DO UPDATE
    SET balance_credits    = org_credit_balance.balance_credits + p_credits,
        lifetime_purchased = org_credit_balance.lifetime_purchased + p_credits
  RETURNING balance_credits INTO v_new_balance;

  -- ----------------------------------------------------------------
  -- 3. Immutable ledger entry (primary purchase/bonus)
  -- ----------------------------------------------------------------
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description,
    stripe_session_id, created_by
  ) VALUES (
    p_org_id,
    CASE WHEN p_source = 'bonus' THEN 'bonus' ELSE 'purchase' END,
    p_credits,
    v_new_balance,
    'Pack purchase: ' || p_pack_type,
    p_payment_id,
    COALESCE(p_created_by, auth.uid())
  );

  -- ----------------------------------------------------------------
  -- 4. Grace recovery: clear flag + ledger entry if balance turns >= 0
  -- ----------------------------------------------------------------
  IF v_balance_before IS NOT NULL AND v_balance_before < 0 AND v_new_balance >= 0 THEN
    UPDATE org_credit_balance
       SET grace_recovery_pending = false
     WHERE org_id = p_org_id;

    INSERT INTO credit_transactions (
      org_id, type, amount, balance_after, description, created_by
    ) VALUES (
      p_org_id,
      'grace_recovery',
      ABS(v_balance_before),
      v_new_balance,
      'Grace balance cleared by pack top-up: ' || p_pack_type,
      COALESCE(p_created_by, auth.uid())
    );
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION add_credits_pack IS
  'Add a new credit pack and update aggregate balance. Clears grace_recovery_pending '
  'and writes a grace_recovery ledger entry when balance recovers from negative. Returns new balance.';
