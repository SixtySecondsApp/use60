-- ============================================================================
-- Migration: Contact Engagement Patterns
-- Purpose: Track per-contact email engagement patterns (response time, best
--          send windows, trend) to power signal intelligence features
-- Story: SIG-001
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- TABLE: contact_engagement_patterns
-- Per-contact aggregate of email engagement behaviour
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_engagement_patterns (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact linkage
  contact_id              UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Org context for RLS
  org_id                  TEXT NOT NULL,

  -- Average hours between sending an email to this contact and receiving a reply
  avg_response_time_hours NUMERIC,

  -- Day of week with highest reply rate: 'Monday' … 'Sunday'
  best_email_day          TEXT,

  -- Hour of day (0–23) with highest reply rate
  best_email_hour         INT,

  -- Direction of response-time change: improving, stable, or declining
  response_trend          TEXT CHECK (response_trend IN ('improving', 'stable', 'declining')),

  -- Rolling 30-day email counters
  emails_sent_30d         INT NOT NULL DEFAULT 0 CHECK (emails_sent_30d >= 0),
  emails_received_30d     INT NOT NULL DEFAULT 0 CHECK (emails_received_30d >= 0),

  -- When the pattern was last recalculated
  last_calculated         TIMESTAMPTZ,

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One engagement-pattern row per contact per org
  CONSTRAINT unique_contact_engagement_pattern UNIQUE (contact_id, org_id)
);

-- =============================================================================
-- Indexes: contact_engagement_patterns
-- =============================================================================

-- Primary lookup: all patterns for an org
CREATE INDEX IF NOT EXISTS idx_contact_engagement_patterns_org_contact
  ON contact_engagement_patterns (org_id, contact_id);

-- Freshness queries: find stale patterns that need recalculation
CREATE INDEX IF NOT EXISTS idx_contact_engagement_patterns_last_calculated
  ON contact_engagement_patterns (org_id, last_calculated DESC NULLS LAST);

-- =============================================================================
-- Trigger: updated_at maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION update_contact_engagement_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_engagement_patterns_updated_at ON contact_engagement_patterns;
CREATE TRIGGER trg_contact_engagement_patterns_updated_at
  BEFORE UPDATE ON contact_engagement_patterns
  FOR EACH ROW EXECUTE FUNCTION update_contact_engagement_patterns_updated_at();

-- =============================================================================
-- RLS: contact_engagement_patterns
-- =============================================================================

ALTER TABLE contact_engagement_patterns ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view engagement patterns
DROP POLICY IF EXISTS "Users can view org contact_engagement_patterns" ON contact_engagement_patterns;
CREATE POLICY "Users can view org contact_engagement_patterns"
  ON contact_engagement_patterns FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for edge functions / orchestrator)
DROP POLICY IF EXISTS "Service role full access to contact_engagement_patterns" ON contact_engagement_patterns;
CREATE POLICY "Service role full access to contact_engagement_patterns"
  ON contact_engagement_patterns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- RPC: calculate_contact_engagement_patterns
-- Computes engagement metrics for a single contact and upserts the result
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_contact_engagement_patterns(
  p_org_id      TEXT,
  p_contact_id  UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id                    UUID;
  v_avg_response          NUMERIC;
  v_best_day              TEXT;
  v_best_hour             INT;
  v_response_trend        TEXT;
  v_sent_30d              INT;
  v_received_30d          INT;
  v_avg_response_prior    NUMERIC;
BEGIN
  -- -------------------------------------------------------------------------
  -- 30-day sent / received counts
  -- We use user_id IN (org members) to scope events to the org
  -- -------------------------------------------------------------------------
  SELECT
    COUNT(*) FILTER (WHERE direction = 'outbound' AND event_type IN ('email_sent'))
      INTO v_sent_30d
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.event_timestamp >= now() - INTERVAL '30 days'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    );

  SELECT
    COUNT(*) FILTER (WHERE direction = 'inbound' AND event_type IN ('email_received'))
      INTO v_received_30d
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.event_timestamp >= now() - INTERVAL '30 days'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    );

  -- -------------------------------------------------------------------------
  -- Average response time (inbound reply following an outbound email)
  -- Use pre-computed response_time_hours if available, else NULL
  -- -------------------------------------------------------------------------
  SELECT AVG(ce.response_time_hours)
    INTO v_avg_response
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.direction = 'inbound'
    AND ce.response_time_hours IS NOT NULL
    AND ce.event_timestamp >= now() - INTERVAL '30 days'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    );

  -- -------------------------------------------------------------------------
  -- Prior 30-day average response time (days 31–60 ago) for trend calculation
  -- -------------------------------------------------------------------------
  SELECT AVG(ce.response_time_hours)
    INTO v_avg_response_prior
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.direction = 'inbound'
    AND ce.response_time_hours IS NOT NULL
    AND ce.event_timestamp >= now() - INTERVAL '60 days'
    AND ce.event_timestamp <  now() - INTERVAL '30 days'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    );

  -- -------------------------------------------------------------------------
  -- Response trend: compare current vs prior avg response time
  --   >20% slower  → declining
  --   >20% faster  → improving
  --   else         → stable
  -- -------------------------------------------------------------------------
  IF v_avg_response IS NULL OR v_avg_response_prior IS NULL THEN
    v_response_trend := 'stable';
  ELSIF v_avg_response > v_avg_response_prior * 1.2 THEN
    v_response_trend := 'declining';
  ELSIF v_avg_response < v_avg_response_prior * 0.8 THEN
    v_response_trend := 'improving';
  ELSE
    v_response_trend := 'stable';
  END IF;

  -- -------------------------------------------------------------------------
  -- Best email day: day of week with highest inbound reply count
  -- -------------------------------------------------------------------------
  SELECT TO_CHAR(ce.event_timestamp AT TIME ZONE 'UTC', 'Day')
    INTO v_best_day
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.direction = 'inbound'
    AND ce.event_type = 'email_received'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    )
  GROUP BY TO_CHAR(ce.event_timestamp AT TIME ZONE 'UTC', 'Day'),
           EXTRACT(DOW FROM ce.event_timestamp AT TIME ZONE 'UTC')
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Trim whitespace from TO_CHAR day name
  v_best_day := TRIM(v_best_day);

  -- -------------------------------------------------------------------------
  -- Best email hour: hour of day (0–23) with highest inbound reply count
  -- -------------------------------------------------------------------------
  SELECT EXTRACT(HOUR FROM ce.event_timestamp AT TIME ZONE 'UTC')::INT
    INTO v_best_hour
  FROM communication_events ce
  WHERE ce.contact_id = p_contact_id
    AND ce.direction = 'inbound'
    AND ce.event_type = 'email_received'
    AND ce.user_id IN (
      SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
    )
  GROUP BY EXTRACT(HOUR FROM ce.event_timestamp AT TIME ZONE 'UTC')
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- -------------------------------------------------------------------------
  -- Upsert the result
  -- -------------------------------------------------------------------------
  INSERT INTO contact_engagement_patterns (
    contact_id,
    org_id,
    avg_response_time_hours,
    best_email_day,
    best_email_hour,
    response_trend,
    emails_sent_30d,
    emails_received_30d,
    last_calculated
  ) VALUES (
    p_contact_id,
    p_org_id,
    v_avg_response,
    v_best_day,
    v_best_hour,
    v_response_trend,
    COALESCE(v_sent_30d, 0),
    COALESCE(v_received_30d, 0),
    now()
  )
  ON CONFLICT (contact_id, org_id) DO UPDATE SET
    avg_response_time_hours = EXCLUDED.avg_response_time_hours,
    best_email_day          = EXCLUDED.best_email_day,
    best_email_hour         = EXCLUDED.best_email_hour,
    response_trend          = EXCLUDED.response_trend,
    emails_sent_30d         = EXCLUDED.emails_sent_30d,
    emails_received_30d     = EXCLUDED.emails_received_30d,
    last_calculated         = EXCLUDED.last_calculated,
    updated_at              = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION calculate_contact_engagement_patterns IS
  'Computes email engagement metrics for a single contact in the given org and upserts the result. Analyzes communication_events for response times, best send windows, and trend.';

GRANT EXECUTE ON FUNCTION calculate_contact_engagement_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_contact_engagement_patterns TO service_role;

-- =============================================================================
-- RPC: batch_recalculate_engagement_patterns
-- Recalculates all contacts with email activity in the last 90 days
-- =============================================================================

CREATE OR REPLACE FUNCTION batch_recalculate_engagement_patterns(
  p_org_id TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact   RECORD;
  v_count     INT := 0;
BEGIN
  -- Find all contacts in the org with email activity in last 90 days
  FOR v_contact IN
    SELECT DISTINCT ce.contact_id
    FROM communication_events ce
    WHERE ce.contact_id IS NOT NULL
      AND ce.event_type IN ('email_sent', 'email_received')
      AND ce.event_timestamp >= now() - INTERVAL '90 days'
      AND ce.user_id IN (
        SELECT user_id FROM organization_memberships WHERE org_id::text = p_org_id
      )
  LOOP
    PERFORM calculate_contact_engagement_patterns(p_org_id, v_contact.contact_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION batch_recalculate_engagement_patterns IS
  'Recalculates engagement patterns for all contacts in the org with email activity in the last 90 days. Returns the number of contacts processed.';

GRANT EXECUTE ON FUNCTION batch_recalculate_engagement_patterns TO authenticated;
GRANT EXECUTE ON FUNCTION batch_recalculate_engagement_patterns TO service_role;

-- =============================================================================
-- Table and column comments
-- =============================================================================

COMMENT ON TABLE contact_engagement_patterns IS
  'Stores per-contact email engagement patterns: response time, best send windows, and trend. One row per contact per org. Updated by calculate_contact_engagement_patterns().';

COMMENT ON COLUMN contact_engagement_patterns.avg_response_time_hours IS
  'Average hours this contact takes to reply to an outbound email. NULL if insufficient data.';
COMMENT ON COLUMN contact_engagement_patterns.best_email_day IS
  'Day of week (e.g. Monday) on which this contact most frequently replies. NULL if insufficient data.';
COMMENT ON COLUMN contact_engagement_patterns.best_email_hour IS
  'Hour of day (0–23 UTC) on which this contact most frequently replies. NULL if insufficient data.';
COMMENT ON COLUMN contact_engagement_patterns.response_trend IS
  'Whether response speed is improving, stable, or declining vs the prior 30-day period.';
COMMENT ON COLUMN contact_engagement_patterns.emails_sent_30d IS
  'Number of outbound emails sent to this contact in the last 30 days.';
COMMENT ON COLUMN contact_engagement_patterns.emails_received_30d IS
  'Number of inbound emails received from this contact in the last 30 days.';
COMMENT ON COLUMN contact_engagement_patterns.last_calculated IS
  'Timestamp of the most recent pattern recalculation.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222900001_contact_engagement_patterns.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: SIG-001';
  RAISE NOTICE '';
  RAISE NOTICE 'New table:';
  RAISE NOTICE '  contact_engagement_patterns — per-contact email engagement patterns';
  RAISE NOTICE '';
  RAISE NOTICE 'New RPCs:';
  RAISE NOTICE '  calculate_contact_engagement_patterns(org_id, contact_id)';
  RAISE NOTICE '  batch_recalculate_engagement_patterns(org_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS: org-isolated SELECT for authenticated, full for service_role';
  RAISE NOTICE '============================================================================';
END $$;
