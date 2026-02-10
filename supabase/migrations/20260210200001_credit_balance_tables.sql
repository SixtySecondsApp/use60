-- ============================================================================
-- Credit Balance & Transaction Ledger Tables
-- ============================================================================
-- Per-org credit balance with auto-topup support, plus an immutable
-- transaction ledger for every credit movement (purchase, deduction, refund).
-- 1 credit = $1 USD

-- ============================================================================
-- 1. org_credit_balance — one row per org
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_credit_balance (
  -- Primary key is the org itself (one balance per org)
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Balance
  balance_credits DECIMAL(12,4) NOT NULL DEFAULT 0,
  lifetime_purchased DECIMAL(12,4) NOT NULL DEFAULT 0,
  lifetime_consumed DECIMAL(12,4) NOT NULL DEFAULT 0,

  -- Low-balance alert threshold
  low_balance_threshold DECIMAL(12,4) DEFAULT 10.0,

  -- Auto top-up settings
  auto_topup_enabled BOOLEAN DEFAULT false,
  auto_topup_amount DECIMAL(12,4),
  auto_topup_threshold DECIMAL(12,4),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. credit_transactions — immutable ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization reference
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Transaction type
  type TEXT NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'adjustment', 'bonus')),

  -- Amount: positive for credits in, negative for credits out
  amount DECIMAL(12,4) NOT NULL,

  -- Running balance snapshot after this transaction
  balance_after DECIMAL(12,4) NOT NULL,

  -- Description
  description TEXT,

  -- Stripe references (for purchase transactions)
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,

  -- AI cost tracking reference (for deduction transactions)
  ai_cost_event_id UUID REFERENCES ai_cost_events(id) ON DELETE SET NULL,

  -- Which AI feature consumed credits
  feature_key TEXT,

  -- Who initiated this transaction
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamp (immutable — no updated_at)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_id
  ON credit_transactions(org_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at
  ON credit_transactions(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type
  ON credit_transactions(type);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe
  ON credit_transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- ============================================================================
-- 4. updated_at trigger for org_credit_balance
-- ============================================================================

CREATE OR REPLACE FUNCTION update_org_credit_balance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_org_credit_balance_updated_at ON org_credit_balance;
CREATE TRIGGER trigger_org_credit_balance_updated_at
  BEFORE UPDATE ON org_credit_balance
  FOR EACH ROW
  EXECUTE FUNCTION update_org_credit_balance_updated_at();

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

ALTER TABLE org_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- --- org_credit_balance ---

-- Org members can read their org's balance
DROP POLICY IF EXISTS "Org members can read their org_credit_balance" ON org_credit_balance;
CREATE POLICY "Org members can read their org_credit_balance"
  ON org_credit_balance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = org_credit_balance.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Org admins can update their org's balance settings (threshold, auto-topup)
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
  );

-- Platform admins can manage all balances
DROP POLICY IF EXISTS "Platform admins can manage all org_credit_balance" ON org_credit_balance;
CREATE POLICY "Platform admins can manage all org_credit_balance"
  ON org_credit_balance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- --- credit_transactions ---

-- Org members can read their org's transactions
DROP POLICY IF EXISTS "Org members can read their credit_transactions" ON credit_transactions;
CREATE POLICY "Org members can read their credit_transactions"
  ON credit_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.org_id = credit_transactions.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Platform admins can manage all transactions
DROP POLICY IF EXISTS "Platform admins can manage all credit_transactions" ON credit_transactions;
CREATE POLICY "Platform admins can manage all credit_transactions"
  ON credit_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- ============================================================================
-- 6. deduct_credits function
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_credits(
  p_org_id UUID,
  p_amount DECIMAL,
  p_description TEXT DEFAULT NULL,
  p_feature_key TEXT DEFAULT NULL,
  p_cost_event_id UUID DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
BEGIN
  -- Lock the balance row for this org
  SELECT balance_credits INTO v_current_balance
  FROM org_credit_balance
  WHERE org_id = p_org_id
  FOR UPDATE;

  -- No balance row means no credits
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Insufficient funds
  IF v_current_balance < p_amount THEN
    RETURN -1;
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Update balance
  UPDATE org_credit_balance
  SET balance_credits = v_new_balance,
      lifetime_consumed = lifetime_consumed + p_amount
  WHERE org_id = p_org_id;

  -- Record the transaction (negative amount for deduction)
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
-- 7. add_credits function
-- ============================================================================

CREATE OR REPLACE FUNCTION add_credits(
  p_org_id UUID,
  p_amount DECIMAL,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT NULL,
  p_stripe_session_id TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS DECIMAL AS $$
DECLARE
  v_new_balance DECIMAL;
BEGIN
  -- Upsert the balance row (create if doesn't exist)
  INSERT INTO org_credit_balance (org_id, balance_credits, lifetime_purchased)
  VALUES (p_org_id, p_amount, p_amount)
  ON CONFLICT (org_id) DO UPDATE
  SET balance_credits = org_credit_balance.balance_credits + p_amount,
      lifetime_purchased = org_credit_balance.lifetime_purchased + p_amount
  RETURNING balance_credits INTO v_new_balance;

  -- Record the transaction (positive amount)
  INSERT INTO credit_transactions (
    org_id, type, amount, balance_after, description,
    stripe_session_id, created_by
  ) VALUES (
    p_org_id, p_type, p_amount, v_new_balance, p_description,
    p_stripe_session_id, COALESCE(p_created_by, auth.uid())
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. Comments
-- ============================================================================

COMMENT ON TABLE org_credit_balance IS 'Per-organization credit balance with auto-topup settings. 1 credit = $1 USD.';
COMMENT ON COLUMN org_credit_balance.balance_credits IS 'Current available credit balance';
COMMENT ON COLUMN org_credit_balance.lifetime_purchased IS 'Total credits ever purchased (including bonuses)';
COMMENT ON COLUMN org_credit_balance.lifetime_consumed IS 'Total credits ever consumed by AI features';
COMMENT ON COLUMN org_credit_balance.low_balance_threshold IS 'Balance threshold for low-balance alert notifications';
COMMENT ON COLUMN org_credit_balance.auto_topup_enabled IS 'Whether automatic top-up via Stripe is enabled';
COMMENT ON COLUMN org_credit_balance.auto_topup_amount IS 'Amount to top up when auto-topup triggers';
COMMENT ON COLUMN org_credit_balance.auto_topup_threshold IS 'Balance level that triggers auto-topup';

COMMENT ON TABLE credit_transactions IS 'Immutable ledger of every credit movement (purchase, deduction, refund, adjustment, bonus)';
COMMENT ON COLUMN credit_transactions.amount IS 'Positive for credits in, negative for credits out';
COMMENT ON COLUMN credit_transactions.balance_after IS 'Running balance snapshot after this transaction';
COMMENT ON COLUMN credit_transactions.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for purchase transactions';
COMMENT ON COLUMN credit_transactions.stripe_session_id IS 'Stripe Checkout Session ID for purchase transactions';
COMMENT ON COLUMN credit_transactions.ai_cost_event_id IS 'Reference to ai_cost_events for deduction transactions';
COMMENT ON COLUMN credit_transactions.feature_key IS 'Which AI feature consumed credits (e.g. copilot_autonomous, email_generation)';

COMMENT ON FUNCTION deduct_credits IS 'Atomically deducts credits from an org balance. Returns new balance or -1 if insufficient funds.';
COMMENT ON FUNCTION add_credits IS 'Adds credits to an org balance (upserts balance row). Returns new balance.';
