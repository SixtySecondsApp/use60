-- ============================================================================
-- WL-007: Win/Loss Analytics — deal_outcomes table + aggregation RPC
-- PRD-117
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. deal_outcomes table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS deal_outcomes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  outcome       text NOT NULL CHECK (outcome IN ('won', 'lost')),
  reason_code   text CHECK (reason_code IN (
                  'price', 'timing', 'competitor_won', 'no_decision',
                  'feature_gap', 'champion_left', 'budget_cut', 'other'
                )),
  competitor_id uuid REFERENCES competitor_profiles(id) ON DELETE SET NULL,
  notes         text,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_outcomes_org_recorded
  ON deal_outcomes (org_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_outcomes_org_outcome
  ON deal_outcomes (org_id, outcome);
CREATE INDEX IF NOT EXISTS idx_deal_outcomes_deal
  ON deal_outcomes (deal_id);

-- RLS
ALTER TABLE deal_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can manage deal outcomes" ON deal_outcomes;
CREATE POLICY "org members can manage deal outcomes"
  ON deal_outcomes
  USING (
    org_id IN (
      SELECT org_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. get_win_loss_analytics(p_org_id, p_period)
-- Returns win rate + breakdowns by stage/rep/size + loss reasons
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_win_loss_analytics(
  p_org_id  uuid,
  p_period  text DEFAULT '90d'  -- '30d', '90d', '180d', '365d'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since         timestamptz;
  v_total         int;
  v_won           int;
  v_lost          int;
  v_win_rate      numeric;
  v_by_stage      jsonb;
  v_by_rep        jsonb;
  v_by_size       jsonb;
  v_by_period     jsonb;
  v_loss_reasons  jsonb;
BEGIN
  -- Date cutoff
  v_since := now() - (
    CASE p_period
      WHEN '30d'  THEN interval '30 days'
      WHEN '90d'  THEN interval '90 days'
      WHEN '180d' THEN interval '180 days'
      WHEN '365d' THEN interval '365 days'
      ELSE             interval '90 days'
    END
  );

  -- Overall win rate
  SELECT
    COUNT(*) FILTER (WHERE do2.outcome = 'won'),
    COUNT(*) FILTER (WHERE do2.outcome = 'lost'),
    COUNT(*)
  INTO v_won, v_lost, v_total
  FROM deal_outcomes do2
  WHERE do2.org_id = p_org_id
    AND do2.recorded_at >= v_since;

  v_win_rate := CASE WHEN v_total > 0 THEN round((v_won::numeric / v_total) * 100, 1) ELSE 0 END;

  -- By pipeline stage
  SELECT jsonb_agg(row_to_json(r))
  INTO v_by_stage
  FROM (
    SELECT
      COALESCE(d.stage, 'unknown')  AS stage,
      COUNT(*) FILTER (WHERE do2.outcome = 'won')  AS won,
      COUNT(*) FILTER (WHERE do2.outcome = 'lost') AS lost,
      COUNT(*)                                     AS total,
      round(
        COUNT(*) FILTER (WHERE do2.outcome = 'won')::numeric / NULLIF(COUNT(*), 0) * 100, 1
      ) AS win_rate
    FROM deal_outcomes do2
    JOIN deals d ON d.id = do2.deal_id
    WHERE do2.org_id = p_org_id
      AND do2.recorded_at >= v_since
    GROUP BY d.stage
    ORDER BY total DESC
  ) r;

  -- By rep (owner)
  SELECT jsonb_agg(row_to_json(r))
  INTO v_by_rep
  FROM (
    SELECT
      d.owner_id                                   AS rep_id,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email) AS rep_name,
      COUNT(*) FILTER (WHERE do2.outcome = 'won')  AS won,
      COUNT(*) FILTER (WHERE do2.outcome = 'lost') AS lost,
      COUNT(*)                                     AS total,
      round(
        COUNT(*) FILTER (WHERE do2.outcome = 'won')::numeric / NULLIF(COUNT(*), 0) * 100, 1
      ) AS win_rate
    FROM deal_outcomes do2
    JOIN deals d ON d.id = do2.deal_id
    LEFT JOIN auth.users u ON u.id = d.owner_id
    WHERE do2.org_id = p_org_id
      AND do2.recorded_at >= v_since
      AND d.owner_id IS NOT NULL
    GROUP BY d.owner_id, u.raw_user_meta_data, u.email
    ORDER BY total DESC
  ) r;

  -- By deal size bucket
  SELECT jsonb_agg(row_to_json(r))
  INTO v_by_size
  FROM (
    SELECT
      CASE
        WHEN COALESCE(d.value, 0) = 0        THEN 'unknown'
        WHEN d.value < 5000                  THEN '<$5k'
        WHEN d.value < 25000                 THEN '$5k–$25k'
        WHEN d.value < 100000               THEN '$25k–$100k'
        ELSE                                       '>$100k'
      END AS size_bucket,
      COUNT(*) FILTER (WHERE do2.outcome = 'won')  AS won,
      COUNT(*) FILTER (WHERE do2.outcome = 'lost') AS lost,
      COUNT(*)                                     AS total,
      round(
        COUNT(*) FILTER (WHERE do2.outcome = 'won')::numeric / NULLIF(COUNT(*), 0) * 100, 1
      ) AS win_rate
    FROM deal_outcomes do2
    JOIN deals d ON d.id = do2.deal_id
    WHERE do2.org_id = p_org_id
      AND do2.recorded_at >= v_since
    GROUP BY size_bucket
    ORDER BY total DESC
  ) r;

  -- By month (for trend chart)
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.month)
  INTO v_by_period
  FROM (
    SELECT
      to_char(date_trunc('month', do2.recorded_at), 'YYYY-MM') AS month,
      COUNT(*) FILTER (WHERE do2.outcome = 'won')              AS won,
      COUNT(*) FILTER (WHERE do2.outcome = 'lost')             AS lost,
      COUNT(*)                                                 AS total,
      round(
        COUNT(*) FILTER (WHERE do2.outcome = 'won')::numeric / NULLIF(COUNT(*), 0) * 100, 1
      ) AS win_rate
    FROM deal_outcomes do2
    WHERE do2.org_id = p_org_id
      AND do2.recorded_at >= v_since
    GROUP BY date_trunc('month', do2.recorded_at)
    ORDER BY 1
  ) r;

  -- Loss reason distribution
  SELECT jsonb_agg(row_to_json(r))
  INTO v_loss_reasons
  FROM (
    SELECT
      COALESCE(do2.reason_code, 'other') AS reason_code,
      COUNT(*)                           AS count,
      jsonb_agg(jsonb_build_object(
        'deal_id',   d.id,
        'deal_name', d.name,
        'value',     d.value,
        'stage',     d.stage
      )) AS deals
    FROM deal_outcomes do2
    JOIN deals d ON d.id = do2.deal_id
    WHERE do2.org_id = p_org_id
      AND do2.outcome = 'lost'
      AND do2.recorded_at >= v_since
    GROUP BY do2.reason_code
    ORDER BY count DESC
  ) r;

  RETURN jsonb_build_object(
    'win_rate',    v_win_rate,
    'total',       v_total,
    'won',         v_won,
    'lost',        v_lost,
    'by_stage',    COALESCE(v_by_stage, '[]'::jsonb),
    'by_rep',      COALESCE(v_by_rep, '[]'::jsonb),
    'by_size',     COALESCE(v_by_size, '[]'::jsonb),
    'by_period',   COALESCE(v_by_period, '[]'::jsonb),
    'loss_reasons',COALESCE(v_loss_reasons, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_competitive_win_loss(p_org_id, p_period)
-- Win/loss rate per competitor from competitive_mentions joined with deal_outcomes
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_competitive_win_loss(
  p_org_id uuid,
  p_period text DEFAULT '90d'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  v_since := now() - (
    CASE p_period
      WHEN '30d'  THEN interval '30 days'
      WHEN '90d'  THEN interval '90 days'
      WHEN '180d' THEN interval '180 days'
      WHEN '365d' THEN interval '365 days'
      ELSE             interval '90 days'
    END
  );

  SELECT jsonb_agg(row_to_json(r))
  INTO v_result
  FROM (
    SELECT
      cm.competitor_name,
      COUNT(DISTINCT cm.deal_id)                                    AS deals_faced,
      COUNT(DISTINCT cm.deal_id) FILTER (WHERE do2.outcome = 'won') AS won,
      COUNT(DISTINCT cm.deal_id) FILTER (WHERE do2.outcome = 'lost') AS lost,
      round(
        COUNT(DISTINCT cm.deal_id) FILTER (WHERE do2.outcome = 'won')::numeric
        / NULLIF(COUNT(DISTINCT cm.deal_id) FILTER (WHERE do2.outcome IN ('won', 'lost')), 0)
        * 100, 1
      ) AS win_rate
    FROM competitive_mentions cm
    LEFT JOIN deal_outcomes do2 ON do2.deal_id = cm.deal_id
    WHERE cm.org_id = p_org_id
      AND cm.created_at >= v_since
      AND cm.deal_id IS NOT NULL
    GROUP BY cm.competitor_name
    ORDER BY deals_faced DESC
  ) r;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
