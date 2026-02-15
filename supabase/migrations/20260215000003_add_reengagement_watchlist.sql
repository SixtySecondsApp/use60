-- ============================================================================
-- Migration: Re-engagement Watchlist Table
-- Purpose: Track closed-lost deals for re-engagement opportunities
-- Feature: Proactive Agent V2 - Re-engagement Monitoring
-- Date: 2026-02-15
-- ============================================================================

-- =============================================================================
-- Table: reengagement_watchlist
-- Tracks closed-lost deals for periodic re-engagement checks
-- =============================================================================

CREATE TABLE IF NOT EXISTS reengagement_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Organization and deal context
  org_id TEXT NOT NULL,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_ids TEXT[] DEFAULT '{}', -- Array of contact UUIDs as text

  -- Loss tracking
  loss_reason TEXT CHECK (loss_reason IN (
    'budget',
    'timing',
    'champion_left',
    'competitor_won',
    'bad_fit',
    'went_dark',
    'other'
  )),
  close_date DATE, -- When the deal was lost

  -- Re-engagement scheduling
  next_check_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',     -- Actively monitored
    'snoozed',    -- Temporarily paused
    'removed',    -- Manually removed from watchlist
    'converted'   -- Re-engaged successfully
  )),

  -- Signal tracking (last detected re-engagement signal)
  last_signal_at TIMESTAMPTZ DEFAULT NULL,
  last_signal_type TEXT DEFAULT NULL, -- e.g., 'linkedin_job_change', 'company_funding', 'web_visit'
  last_signal_description TEXT DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per deal (upsert pattern)
  CONSTRAINT unique_watchlist_deal UNIQUE (deal_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Query active deals due for check
CREATE INDEX IF NOT EXISTS idx_reengagement_watchlist_active_check
  ON reengagement_watchlist(org_id, status, next_check_date)
  WHERE status = 'active';

-- Query by status
CREATE INDEX IF NOT EXISTS idx_reengagement_watchlist_status
  ON reengagement_watchlist(status)
  WHERE status = 'active';

-- Query recent signals
CREATE INDEX IF NOT EXISTS idx_reengagement_watchlist_signals
  ON reengagement_watchlist(last_signal_at DESC)
  WHERE last_signal_at IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE reengagement_watchlist ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view watchlist entries
DROP POLICY IF EXISTS "Users can view org reengagement watchlist" ON reengagement_watchlist;
CREATE POLICY "Users can view org reengagement watchlist"
  ON reengagement_watchlist FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for edge functions)
DROP POLICY IF EXISTS "Service role has full access to reengagement_watchlist" ON reengagement_watchlist;
CREATE POLICY "Service role has full access to reengagement_watchlist"
  ON reengagement_watchlist FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE reengagement_watchlist IS 'Tracks closed-lost deals for periodic re-engagement checks. Part of Proactive Agent V2 re-engagement flow.';

COMMENT ON COLUMN reengagement_watchlist.org_id IS 'Organization identifier (clerk_org_id)';
COMMENT ON COLUMN reengagement_watchlist.deal_id IS 'Closed-lost deal being monitored';
COMMENT ON COLUMN reengagement_watchlist.contact_ids IS 'Array of contact UUIDs associated with this deal';
COMMENT ON COLUMN reengagement_watchlist.loss_reason IS 'Why the deal was lost (budget, timing, champion_left, etc.)';
COMMENT ON COLUMN reengagement_watchlist.close_date IS 'Date the deal was closed-lost';
COMMENT ON COLUMN reengagement_watchlist.next_check_date IS 'Next scheduled re-engagement check date';
COMMENT ON COLUMN reengagement_watchlist.status IS 'Watchlist status (active, snoozed, removed, converted)';
COMMENT ON COLUMN reengagement_watchlist.last_signal_at IS 'Last detected re-engagement signal timestamp';
COMMENT ON COLUMN reengagement_watchlist.last_signal_type IS 'Type of last signal (linkedin_job_change, company_funding, etc.)';
COMMENT ON COLUMN reengagement_watchlist.last_signal_description IS 'Description of last signal';

-- =============================================================================
-- Trigger: Update updated_at timestamp
-- =============================================================================

CREATE OR REPLACE FUNCTION update_reengagement_watchlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_reengagement_watchlist_updated_at ON reengagement_watchlist;
CREATE TRIGGER trigger_update_reengagement_watchlist_updated_at
  BEFORE UPDATE ON reengagement_watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_reengagement_watchlist_updated_at();

-- =============================================================================
-- RPC: Add deal to watchlist
-- =============================================================================

CREATE OR REPLACE FUNCTION add_to_reengagement_watchlist(
  p_org_id TEXT,
  p_deal_id UUID,
  p_contact_ids TEXT[] DEFAULT '{}',
  p_loss_reason TEXT DEFAULT NULL,
  p_close_date DATE DEFAULT NULL,
  p_next_check_days INTEGER DEFAULT 7
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_watchlist_id UUID;
BEGIN
  -- Validate loss reason if provided
  IF p_loss_reason IS NOT NULL AND p_loss_reason NOT IN (
    'budget', 'timing', 'champion_left', 'competitor_won', 'bad_fit', 'went_dark', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid loss reason: %', p_loss_reason;
  END IF;

  -- Insert or update watchlist entry
  INSERT INTO reengagement_watchlist (
    org_id,
    deal_id,
    contact_ids,
    loss_reason,
    close_date,
    next_check_date,
    status
  ) VALUES (
    p_org_id,
    p_deal_id,
    p_contact_ids,
    p_loss_reason,
    COALESCE(p_close_date, CURRENT_DATE),
    CURRENT_DATE + (p_next_check_days || ' days')::INTERVAL,
    'active'
  )
  ON CONFLICT (deal_id)
  DO UPDATE SET
    contact_ids = EXCLUDED.contact_ids,
    loss_reason = COALESCE(EXCLUDED.loss_reason, reengagement_watchlist.loss_reason),
    close_date = COALESCE(EXCLUDED.close_date, reengagement_watchlist.close_date),
    status = 'active', -- Re-activate if previously snoozed/removed
    next_check_date = CURRENT_DATE + (p_next_check_days || ' days')::INTERVAL,
    updated_at = NOW()
  RETURNING id INTO v_watchlist_id;

  RETURN v_watchlist_id;
END;
$$;

COMMENT ON FUNCTION add_to_reengagement_watchlist IS 'Adds or updates a deal in the re-engagement watchlist';

GRANT EXECUTE ON FUNCTION add_to_reengagement_watchlist TO authenticated;
GRANT EXECUTE ON FUNCTION add_to_reengagement_watchlist TO service_role;

-- =============================================================================
-- RPC: Update watchlist status
-- =============================================================================

CREATE OR REPLACE FUNCTION update_watchlist_status(
  p_deal_id UUID,
  p_status TEXT,
  p_next_check_days INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate status
  IF p_status NOT IN ('active', 'snoozed', 'removed', 'converted') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Update the status
  UPDATE reengagement_watchlist
  SET
    status = p_status,
    next_check_date = CASE
      WHEN p_next_check_days IS NOT NULL
        THEN CURRENT_DATE + (p_next_check_days || ' days')::INTERVAL
      ELSE next_check_date
    END,
    updated_at = NOW()
  WHERE deal_id = p_deal_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION update_watchlist_status IS 'Updates the status of a watchlist entry';

GRANT EXECUTE ON FUNCTION update_watchlist_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_watchlist_status TO service_role;

-- =============================================================================
-- RPC: Record re-engagement signal
-- =============================================================================

CREATE OR REPLACE FUNCTION record_reengagement_signal(
  p_deal_id UUID,
  p_signal_type TEXT,
  p_signal_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE reengagement_watchlist
  SET
    last_signal_at = NOW(),
    last_signal_type = p_signal_type,
    last_signal_description = p_signal_description,
    updated_at = NOW()
  WHERE deal_id = p_deal_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION record_reengagement_signal IS 'Records a re-engagement signal for a watchlist entry';

GRANT EXECUTE ON FUNCTION record_reengagement_signal TO authenticated;
GRANT EXECUTE ON FUNCTION record_reengagement_signal TO service_role;

-- =============================================================================
-- RPC: Get deals due for re-engagement check
-- =============================================================================

CREATE OR REPLACE FUNCTION get_deals_due_for_reengagement_check(
  p_org_id TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  watchlist_id UUID,
  deal_id UUID,
  deal_name TEXT,
  deal_value NUMERIC,
  contact_ids TEXT[],
  loss_reason TEXT,
  close_date DATE,
  days_since_close INTEGER,
  next_check_date DATE,
  last_signal_at TIMESTAMPTZ,
  last_signal_type TEXT,
  owner_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    rw.id as watchlist_id,
    rw.deal_id,
    d.name as deal_name,
    d.value as deal_value,
    rw.contact_ids,
    rw.loss_reason,
    rw.close_date,
    (CURRENT_DATE - rw.close_date)::INTEGER as days_since_close,
    rw.next_check_date,
    rw.last_signal_at,
    rw.last_signal_type,
    COALESCE(CONCAT_WS(' ', p.first_name, p.last_name), p.email) as owner_name
  FROM reengagement_watchlist rw
  INNER JOIN deals d ON d.id = rw.deal_id
  LEFT JOIN profiles p ON p.id = d.owner_id
  WHERE rw.org_id = p_org_id
    AND rw.status = 'active'
    AND rw.next_check_date <= CURRENT_DATE
  ORDER BY rw.next_check_date ASC, rw.last_signal_at DESC NULLS LAST
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_deals_due_for_reengagement_check IS 'Returns active watchlist deals due for re-engagement check';

GRANT EXECUTE ON FUNCTION get_deals_due_for_reengagement_check TO authenticated;
GRANT EXECUTE ON FUNCTION get_deals_due_for_reengagement_check TO service_role;

-- =============================================================================
-- RPC: Populate watchlist from closed-lost deals
-- =============================================================================

CREATE OR REPLACE FUNCTION populate_reengagement_watchlist(
  p_org_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted_count INTEGER := 0;
  v_deal RECORD;
BEGIN
  -- Find all closed-lost deals from the last 12 months not yet in watchlist
  FOR v_deal IN
    SELECT
      d.id as deal_id,
      d.closed_lost_date,
      -- Extract primary contact ID if available
      CASE
        WHEN d.primary_contact_id IS NOT NULL
        THEN ARRAY[d.primary_contact_id::TEXT]
        ELSE '{}'::TEXT[]
      END as contact_ids
    FROM deals d
    LEFT JOIN deal_stages ds ON ds.id = d.stage_id
    WHERE d.clerk_org_id = p_org_id
      AND ds.name = 'Closed Lost'
      AND d.closed_lost_date >= CURRENT_DATE - INTERVAL '12 months'
      AND NOT EXISTS (
        SELECT 1
        FROM reengagement_watchlist rw
        WHERE rw.deal_id = d.id
      )
  LOOP
    -- Insert into watchlist
    INSERT INTO reengagement_watchlist (
      org_id,
      deal_id,
      contact_ids,
      close_date,
      next_check_date,
      status
    ) VALUES (
      p_org_id,
      v_deal.deal_id,
      v_deal.contact_ids,
      v_deal.closed_lost_date,
      CURRENT_DATE + INTERVAL '7 days',
      'active'
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$;

COMMENT ON FUNCTION populate_reengagement_watchlist IS 'Populates watchlist from closed-lost deals in the last 12 months';

GRANT EXECUTE ON FUNCTION populate_reengagement_watchlist TO authenticated;
GRANT EXECUTE ON FUNCTION populate_reengagement_watchlist TO service_role;
