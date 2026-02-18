-- ============================================================================
-- Credit Packs Table and FIFO Consumption RPCs
-- ============================================================================
-- Individual purchased credit packs with remaining balances.
-- FIFO deduction: bonus packs first, then oldest purchased pack by purchased_at.
-- 1 credit ≈ $0.10 USD (10x denomination change from legacy 1 credit = $1 USD)

-- ============================================================================
-- 1. credit_packs — individual pack inventory
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization reference
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Pack tier
  pack_type TEXT NOT NULL CHECK (pack_type IN (
    'starter', 'growth', 'scale',
    'agency_starter', 'agency_growth', 'agency_scale', 'agency_enterprise',
    'custom'
  )),

  -- Credit amounts
  credits_purchased DECIMAL(14,2) NOT NULL,
  credits_remaining DECIMAL(14,2) NOT NULL,

  -- Acquisition metadata
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_id TEXT,                    -- Stripe payment_intent_id or session_id
  source TEXT NOT NULL CHECK (source IN ('manual', 'auto_top_up', 'bonus', 'migration')),

  -- Optional expiry (NULL = never expires)
  expires_at TIMESTAMPTZ DEFAULT NULL,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sanity check
  CONSTRAINT credits_remaining_non_negative CHECK (credits_remaining >= 0),
  CONSTRAINT credits_remaining_lte_purchased CHECK (credits_remaining <= credits_purchased)
);

-- ============================================================================
-- 2. Indexes
-- ============================================================================

-- FIFO deduction query: org packs with remaining balance, ordered by source then age
CREATE INDEX IF NOT EXISTS idx_credit_packs_org_fifo
  ON credit_packs(org_id, source, purchased_at ASC)
  WHERE credits_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_credit_packs_org_id
  ON credit_packs(org_id);

CREATE INDEX IF NOT EXISTS idx_credit_packs_payment_id
  ON credit_packs(payment_id)
  WHERE payment_id IS NOT NULL;

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's packs
DROP POLICY IF EXISTS "Org members can read their credit_packs" ON credit_packs;
CREATE POLICY "Org members can read their credit_packs"
  ON credit_packs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_packs.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Org admins can insert packs (manual top-ups via UI)
DROP POLICY IF EXISTS "Org admins can insert credit_packs" ON credit_packs;
CREATE POLICY "Org admins can insert credit_packs"
  ON credit_packs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_packs.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Org admins can update packs (e.g. adjust remaining — rare, admin only)
DROP POLICY IF EXISTS "Org admins can update credit_packs" ON credit_packs;
CREATE POLICY "Org admins can update credit_packs"
  ON credit_packs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_packs.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- Platform admins can manage all packs
DROP POLICY IF EXISTS "Platform admins can manage all credit_packs" ON credit_packs;
CREATE POLICY "Platform admins can manage all credit_packs"
  ON credit_packs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================================
-- 4. deduct_credits_fifo — FIFO pack deduction RPC
-- ============================================================================
-- Deducts from bonus packs first, then oldest purchased packs.
-- Also updates org_credit_balance.balance_credits for fast reads.
-- Returns new balance_credits, or -1 if insufficient funds.

CREATE OR REPLACE FUNCTION deduct_credits_fifo(
  p_org_id       UUID,
  p_amount       DECIMAL,
  p_description  TEXT    DEFAULT NULL,
  p_feature_key  TEXT    DEFAULT NULL,
  p_cost_event_id UUID   DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance     DECIMAL;
  v_remaining       DECIMAL;
  v_pack            RECORD;
  v_deduct_from_pack DECIMAL;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Lock the aggregate balance row for this org
  -- ----------------------------------------------------------------
  SELECT balance_credits INTO v_current_balance
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN -1;
  END IF;

  -- ----------------------------------------------------------------
  -- 2. FIFO pack deduction
  --    Order: bonus first, then oldest purchased_at
  --    Skip expired packs (still deduct from them though — expiry
  --    enforcement is a separate sweep; expired credits that were
  --    already in balance_credits are still valid to consume).
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
  -- 3. Update aggregate balance
  -- ----------------------------------------------------------------
  v_new_balance := v_current_balance - p_amount;

  UPDATE org_credit_balance
  SET balance_credits    = v_new_balance,
      lifetime_consumed  = lifetime_consumed + p_amount
  WHERE org_id = p_org_id;

  -- ----------------------------------------------------------------
  -- 4. Immutable ledger entry
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

-- ============================================================================
-- 5. add_credits_pack — add a new pack and update aggregate balance
-- ============================================================================
-- Inserts a new credit_packs row AND updates org_credit_balance.
-- Returns new balance_credits.

CREATE OR REPLACE FUNCTION add_credits_pack(
  p_org_id       UUID,
  p_pack_type    TEXT,
  p_credits      DECIMAL,
  p_source       TEXT    DEFAULT 'manual',
  p_payment_id   TEXT    DEFAULT NULL,
  p_created_by   UUID    DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_new_balance DECIMAL;
BEGIN
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
  -- 3. Immutable ledger entry
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

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. Comments
-- ============================================================================

COMMENT ON TABLE credit_packs IS 'Individual purchased credit packs with remaining balances. FIFO deduction (bonus first, then oldest by purchased_at).';
COMMENT ON COLUMN credit_packs.pack_type IS 'Pack tier: starter|growth|scale|agency_starter|agency_growth|agency_scale|agency_enterprise|custom';
COMMENT ON COLUMN credit_packs.credits_purchased IS 'Total credits in this pack at time of purchase';
COMMENT ON COLUMN credit_packs.credits_remaining IS 'Current remaining credits in this pack (decremented by FIFO deduction)';
COMMENT ON COLUMN credit_packs.source IS 'How this pack was acquired: manual|auto_top_up|bonus|migration';
COMMENT ON COLUMN credit_packs.payment_id IS 'Stripe PaymentIntent or Checkout Session ID (null for bonus/migration packs)';
COMMENT ON COLUMN credit_packs.expires_at IS 'Optional expiry timestamp. NULL means pack never expires.';

COMMENT ON FUNCTION deduct_credits_fifo IS 'FIFO credit deduction across packs (bonus first, then oldest). Updates both pack inventory and aggregate balance. Returns new balance or -1 if insufficient.';
COMMENT ON FUNCTION add_credits_pack IS 'Add a new credit pack and update aggregate balance. Returns new balance.';
