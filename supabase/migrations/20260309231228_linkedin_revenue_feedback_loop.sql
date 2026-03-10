-- Migration: linkedin_revenue_feedback_loop
-- Date: 20260309231228
--
-- What this migration does:
--   Adds conversion tracking tables for LinkedIn Revenue Feedback Loop.
--   Sends downstream sales outcomes (qualified lead, meeting booked, proposal sent, deal won)
--   back to LinkedIn Conversions API so customers can optimize campaigns for pipeline quality.
--
-- Tables:
--   linkedin_conversion_rules       — Conversion rule definitions linked to ad accounts
--   linkedin_conversion_mappings    — Maps use60 milestone events to conversion rules
--   linkedin_conversion_events      — Outbound event queue (idempotent, retryable)
--   linkedin_conversion_delivery_log — Append-only delivery attempt audit trail
--
-- Rollback strategy:
--   DROP TABLE linkedin_conversion_delivery_log, linkedin_conversion_events,
--          linkedin_conversion_mappings, linkedin_conversion_rules CASCADE;
--   DROP TYPE linkedin_milestone_event, linkedin_conversion_status;

-- ============================================================
-- ENUM: milestone event types
-- ============================================================
DO $$ BEGIN
  CREATE TYPE linkedin_milestone_event AS ENUM (
    'qualified_lead',
    'meeting_booked',
    'meeting_held',
    'proposal_sent',
    'closed_won'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- ENUM: conversion event delivery status
-- ============================================================
DO $$ BEGIN
  CREATE TYPE linkedin_conversion_status AS ENUM (
    'pending',
    'processing',
    'delivered',
    'failed',
    'dead_letter'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Table: linkedin_conversion_rules
-- Stores conversion rule definitions linked to an ad account.
-- Can be created in use60 or linked to existing LinkedIn rules.
-- ============================================================
CREATE TABLE IF NOT EXISTS linkedin_conversion_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id  UUID REFERENCES linkedin_org_integrations(id) ON DELETE SET NULL,

  -- LinkedIn API identifiers
  linkedin_rule_id        TEXT,          -- LinkedIn conversion rule URN (null if not yet synced)
  linkedin_ad_account_id  TEXT NOT NULL, -- Ad account this rule belongs to

  -- Rule definition
  name                    TEXT NOT NULL,
  milestone_event         linkedin_milestone_event NOT NULL,
  attribution_type        TEXT NOT NULL DEFAULT 'LAST_TOUCH_BY_CAMPAIGN',
  post_click_window_days  INT NOT NULL DEFAULT 30,
  view_through_window_days INT NOT NULL DEFAULT 7,
  conversion_value_amount NUMERIC(12,2),
  conversion_value_currency TEXT DEFAULT 'USD',

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_synced       BOOLEAN NOT NULL DEFAULT false,
  last_synced_at  TIMESTAMPTZ,
  sync_error      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_lcr_org_id ON linkedin_conversion_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_lcr_ad_account ON linkedin_conversion_rules(linkedin_ad_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lcr_org_milestone_account
  ON linkedin_conversion_rules(org_id, milestone_event, linkedin_ad_account_id)
  WHERE is_active = true;

-- ============================================================
-- Table: linkedin_conversion_mappings
-- Maps use60 milestone events to conversion rules.
-- Controls which events are enabled per ad account.
-- ============================================================
CREATE TABLE IF NOT EXISTS linkedin_conversion_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES linkedin_conversion_rules(id) ON DELETE CASCADE,

  milestone_event linkedin_milestone_event NOT NULL,
  is_enabled      BOOLEAN NOT NULL DEFAULT true,

  -- Optional value override per mapping
  value_amount    NUMERIC(12,2),
  value_currency  TEXT DEFAULT 'USD',

  -- Versioning for auditability
  version         INT NOT NULL DEFAULT 1,
  changed_by      UUID REFERENCES auth.users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcm_org_id ON linkedin_conversion_mappings(org_id);
CREATE INDEX IF NOT EXISTS idx_lcm_rule_id ON linkedin_conversion_mappings(rule_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lcm_org_rule_event
  ON linkedin_conversion_mappings(org_id, rule_id, milestone_event);
CREATE INDEX IF NOT EXISTS idx_lcm_enabled_event
  ON linkedin_conversion_mappings(org_id, milestone_event) WHERE is_enabled = true;

-- ============================================================
-- Table: linkedin_conversion_events
-- Outbound event queue. Events are created when pipeline milestones occur,
-- then processed by the streaming worker.
-- ============================================================
CREATE TABLE IF NOT EXISTS linkedin_conversion_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES linkedin_conversion_rules(id) ON DELETE CASCADE,
  mapping_id      UUID REFERENCES linkedin_conversion_mappings(id) ON DELETE SET NULL,

  -- Event details
  milestone_event linkedin_milestone_event NOT NULL,
  event_time      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Source entity references
  deal_id         UUID,
  contact_id      UUID,
  meeting_id      UUID,
  lead_id         UUID,

  -- User identifiers for LinkedIn matching
  user_email              TEXT,
  user_linkedin_member_id TEXT,
  user_first_name         TEXT,
  user_last_name          TEXT,
  user_company_name       TEXT,

  -- Conversion value
  value_amount    NUMERIC(12,2),
  value_currency  TEXT DEFAULT 'USD',

  -- Delivery state
  status          linkedin_conversion_status NOT NULL DEFAULT 'pending',
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  next_retry_at   TIMESTAMPTZ,
  last_error      TEXT,

  -- Idempotency: one event per milestone per entity
  idempotency_key TEXT NOT NULL,

  -- LinkedIn API response
  linkedin_response JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lce_idempotency
  ON linkedin_conversion_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_lce_pending
  ON linkedin_conversion_events(status, next_retry_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_lce_org_milestone
  ON linkedin_conversion_events(org_id, milestone_event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lce_deal ON linkedin_conversion_events(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lce_contact ON linkedin_conversion_events(contact_id) WHERE contact_id IS NOT NULL;

-- ============================================================
-- Table: linkedin_conversion_delivery_log
-- Append-only audit trail of every delivery attempt.
-- ============================================================
CREATE TABLE IF NOT EXISTS linkedin_conversion_delivery_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES linkedin_conversion_events(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL,

  attempt_number  INT NOT NULL,
  status          TEXT NOT NULL,  -- 'success', 'error', 'timeout', 'rate_limited'
  http_status     INT,
  request_payload JSONB,
  response_body   JSONB,
  error_message   TEXT,
  duration_ms     INT,

  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lcdl_event ON linkedin_conversion_delivery_log(event_id);
CREATE INDEX IF NOT EXISTS idx_lcdl_org_date ON linkedin_conversion_delivery_log(org_id, attempted_at DESC);

-- ============================================================
-- Extend linkedin_org_integrations for conversion permissions
-- ============================================================
ALTER TABLE linkedin_org_integrations
  ADD COLUMN IF NOT EXISTS conversion_scopes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ad_account_role TEXT,
  ADD COLUMN IF NOT EXISTS conversions_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- ============================================================
-- RLS Policies
-- ============================================================

-- linkedin_conversion_rules
ALTER TABLE linkedin_conversion_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_lcr" ON linkedin_conversion_rules;
CREATE POLICY "service_role_all_lcr" ON linkedin_conversion_rules
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "org_member_select_lcr" ON linkedin_conversion_rules;
CREATE POLICY "org_member_select_lcr" ON linkedin_conversion_rules
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_admin_manage_lcr" ON linkedin_conversion_rules;
CREATE POLICY "org_admin_manage_lcr" ON linkedin_conversion_rules
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- linkedin_conversion_mappings
ALTER TABLE linkedin_conversion_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_lcm" ON linkedin_conversion_mappings;
CREATE POLICY "service_role_all_lcm" ON linkedin_conversion_mappings
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "org_member_select_lcm" ON linkedin_conversion_mappings;
CREATE POLICY "org_member_select_lcm" ON linkedin_conversion_mappings
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org_admin_manage_lcm" ON linkedin_conversion_mappings;
CREATE POLICY "org_admin_manage_lcm" ON linkedin_conversion_mappings
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM organization_memberships om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- linkedin_conversion_events
ALTER TABLE linkedin_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_lce" ON linkedin_conversion_events;
CREATE POLICY "service_role_all_lce" ON linkedin_conversion_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "org_member_select_lce" ON linkedin_conversion_events;
CREATE POLICY "org_member_select_lce" ON linkedin_conversion_events
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

-- linkedin_conversion_delivery_log
ALTER TABLE linkedin_conversion_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_lcdl" ON linkedin_conversion_delivery_log;
CREATE POLICY "service_role_all_lcdl" ON linkedin_conversion_delivery_log
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "org_member_select_lcdl" ON linkedin_conversion_delivery_log;
CREATE POLICY "org_member_select_lcdl" ON linkedin_conversion_delivery_log
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid())
  );

-- ============================================================
-- Triggers: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_linkedin_conversion_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lcr_updated_at ON linkedin_conversion_rules;
CREATE TRIGGER trg_lcr_updated_at
  BEFORE UPDATE ON linkedin_conversion_rules
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_conversion_updated_at();

DROP TRIGGER IF EXISTS trg_lcm_updated_at ON linkedin_conversion_mappings;
CREATE TRIGGER trg_lcm_updated_at
  BEFORE UPDATE ON linkedin_conversion_mappings
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_conversion_updated_at();

DROP TRIGGER IF EXISTS trg_lce_updated_at ON linkedin_conversion_events;
CREATE TRIGGER trg_lce_updated_at
  BEFORE UPDATE ON linkedin_conversion_events
  FOR EACH ROW EXECUTE FUNCTION update_linkedin_conversion_updated_at();

-- ============================================================
-- Function: Queue a conversion event (called by edge functions)
-- ============================================================
CREATE OR REPLACE FUNCTION queue_linkedin_conversion_event(
  p_org_id UUID,
  p_milestone linkedin_milestone_event,
  p_deal_id UUID DEFAULT NULL,
  p_contact_id UUID DEFAULT NULL,
  p_meeting_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mapping RECORD;
  v_contact RECORD;
  v_event_id UUID;
  v_idem_key TEXT;
BEGIN
  -- Find enabled mapping for this milestone
  SELECT m.id AS mapping_id, m.value_amount, m.value_currency, m.rule_id
  INTO v_mapping
  FROM linkedin_conversion_mappings m
  JOIN linkedin_conversion_rules r ON r.id = m.rule_id AND r.is_active = true AND r.is_synced = true
  WHERE m.org_id = p_org_id
    AND m.milestone_event = p_milestone
    AND m.is_enabled = true
  LIMIT 1;

  -- No active mapping — skip silently
  IF v_mapping IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build idempotency key
  v_idem_key := COALESCE(p_idempotency_key,
    p_org_id || ':' || p_milestone || ':' ||
    COALESCE(p_deal_id::text, '') || ':' ||
    COALESCE(p_contact_id::text, '') || ':' ||
    COALESCE(p_meeting_id::text, '') || ':' ||
    COALESCE(p_lead_id::text, '')
  );

  -- Get contact identifiers for LinkedIn matching
  IF p_contact_id IS NOT NULL THEN
    SELECT email, first_name, last_name, company_name
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id;
  END IF;

  -- Insert event (ON CONFLICT = idempotent)
  INSERT INTO linkedin_conversion_events (
    org_id, rule_id, mapping_id, milestone_event, event_time,
    deal_id, contact_id, meeting_id, lead_id,
    user_email, user_first_name, user_last_name, user_company_name,
    value_amount, value_currency, idempotency_key
  ) VALUES (
    p_org_id, v_mapping.rule_id, v_mapping.mapping_id, p_milestone, now(),
    p_deal_id, p_contact_id, p_meeting_id, p_lead_id,
    v_contact.email, v_contact.first_name, v_contact.last_name, v_contact.company_name,
    COALESCE(v_mapping.value_amount, 0), COALESCE(v_mapping.value_currency, 'USD'),
    v_idem_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  -- Notify streaming worker
  IF v_event_id IS NOT NULL THEN
    PERFORM pg_notify('linkedin_conversion_event', json_build_object(
      'event_id', v_event_id,
      'org_id', p_org_id,
      'milestone', p_milestone
    )::text);
  END IF;

  RETURN v_event_id;
END;
$$;

-- ============================================================
-- Reporting view: LinkedIn-sourced deal performance by campaign
-- ============================================================
CREATE OR REPLACE VIEW linkedin_campaign_performance AS
SELECT
  d.clerk_org_id AS org_id,
  l.source_campaign AS campaign_name,
  l.source_channel,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT CASE WHEN d.id IS NOT NULL THEN l.id END) AS leads_with_deals,
  COUNT(DISTINCT d.id) AS total_deals,
  COUNT(DISTINCT CASE WHEN d.closed_won_date IS NOT NULL THEN d.id END) AS won_deals,
  COALESCE(SUM(CASE WHEN d.closed_won_date IS NOT NULL THEN d.amount END), 0) AS won_revenue,
  COUNT(DISTINCT m.id) AS total_meetings,
  COUNT(DISTINCT CASE WHEN ce.milestone_event = 'proposal_sent' THEN ce.id END) AS proposals_sent,
  COUNT(DISTINCT CASE WHEN ce.milestone_event = 'qualified_lead' THEN ce.id END) AS qualified_leads
FROM leads l
LEFT JOIN contacts ct ON ct.email = l.email AND ct.clerk_org_id = l.org_id
LEFT JOIN deal_contacts dc ON dc.contact_id = ct.id
LEFT JOIN deals d ON d.id = dc.deal_id
LEFT JOIN meetings m ON m.deal_id = d.id
LEFT JOIN linkedin_conversion_events ce ON ce.lead_id = l.id OR ce.deal_id = d.id
WHERE l.utm_source = 'linkedin'
   OR l.source_channel LIKE 'linkedin%'
   OR l.external_source = 'linkedin'
GROUP BY d.clerk_org_id, l.source_campaign, l.source_channel;
