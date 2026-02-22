-- ============================================================================
-- Balance Migration: Dollar Balances → Credit Units
-- ============================================================================
-- Converts existing org_credit_balance.balance_credits from dollar-denominated
-- amounts to credit units at a 3.3× conversion rate.
-- (1 old dollar = 3.3 new credits, since 1 new credit ≈ $0.10 USD * 3)
--
-- This is idempotent: orgs that already have a 'migration' pack are skipped.
-- Run once after deploying the credit_packs table.
-- ============================================================================

DO $$
DECLARE
  v_rec RECORD;
  v_new_credits DECIMAL(14,4);
  v_existing_pack_id UUID;
BEGIN
  FOR v_rec IN
    SELECT org_id, balance_credits
    FROM org_credit_balance
    WHERE balance_credits > 0
  LOOP
    -- Idempotency check: skip if this org already has a migration pack
    SELECT id INTO v_existing_pack_id
    FROM credit_packs
    WHERE org_id = v_rec.org_id
      AND source = 'migration'
    LIMIT 1;

    IF v_existing_pack_id IS NOT NULL THEN
      RAISE NOTICE 'Skipping org % — migration pack already exists', v_rec.org_id;
      CONTINUE;
    END IF;

    -- Convert: 1 old dollar = 3.3 new credits
    v_new_credits := ROUND(v_rec.balance_credits * 3.3, 4);

    IF v_new_credits <= 0 THEN
      CONTINUE;
    END IF;

    -- Insert migration pack
    INSERT INTO credit_packs (
      org_id,
      pack_type,
      credits_purchased,
      credits_remaining,
      source,
      purchased_at,
      created_at
    ) VALUES (
      v_rec.org_id,
      'custom',
      v_new_credits,
      v_new_credits,
      'migration',
      NOW(),
      NOW()
    );

    -- Update org_credit_balance to the new credit-unit amount
    UPDATE org_credit_balance
    SET balance_credits = v_new_credits
    WHERE org_id = v_rec.org_id;

    -- Record the adjustment in the immutable ledger
    INSERT INTO credit_transactions (
      org_id,
      type,
      amount,
      balance_after,
      description,
      created_at
    ) VALUES (
      v_rec.org_id,
      'adjustment',
      v_new_credits - v_rec.balance_credits, -- net delta (positive for most orgs)
      v_new_credits,
      'Migration: dollar balance converted to credits at 3.3x (1 credit ≈ $0.10)',
      NOW()
    );

    RAISE NOTICE 'Migrated org %: %.4f old dollars → %.4f new credits',
      v_rec.org_id, v_rec.balance_credits, v_new_credits;
  END LOOP;
END;
$$;
