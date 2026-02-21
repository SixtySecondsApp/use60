-- ============================================================================
-- Credit Menu Table — Admin-managed pricing configuration
-- ============================================================================
-- Replaces hardcoded ACTION_CREDIT_COSTS / INTEGRATION_CREDIT_COSTS in
-- creditPacks.ts. All credit-consuming actions are defined here, with
-- per-tier pricing editable by platform admins at runtime.
--
-- Versioning: menu_version counter increments on every price change.
-- In-flight queued work snapshots its cost at queue time (price_snapshots table).

CREATE TABLE IF NOT EXISTS credit_menu (
  -- Identity
  action_id        TEXT PRIMARY KEY,                   -- e.g. 'copilot_chat', 'apollo_search'
  display_name     TEXT NOT NULL,                      -- User-facing label
  description      TEXT NOT NULL DEFAULT '',           -- Tooltip/explanation for users
  category         TEXT NOT NULL                       -- ai_actions | agents | integrations | enrichment | storage
                     CHECK (category IN ('ai_actions', 'agents', 'integrations', 'enrichment', 'storage')),
  unit             TEXT NOT NULL DEFAULT 'per action', -- e.g. 'per message', 'per meeting'

  -- Per-tier pricing (in credits; 1 credit ≈ £0.10)
  cost_low         DECIMAL(10, 4) NOT NULL DEFAULT 0,
  cost_medium      DECIMAL(10, 4) NOT NULL DEFAULT 0,
  cost_high        DECIMAL(10, 4) NOT NULL DEFAULT 0,

  -- Flags
  is_active        BOOLEAN NOT NULL DEFAULT false,     -- false = draft, not billable
  free_with_sub    BOOLEAN NOT NULL DEFAULT false,     -- true = included in £29/mo base plan
  is_flat_rate     BOOLEAN NOT NULL DEFAULT false,     -- true = same cost across all tiers (integrations)

  -- Versioning
  menu_version     INTEGER NOT NULL DEFAULT 1,

  -- Audit
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       TEXT,                              -- admin user email or id

  -- Soft-delete
  deleted_at       TIMESTAMPTZ
);

-- ============================================================================
-- Pricing Audit Trail — immutable, append-only
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_menu_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id        TEXT NOT NULL REFERENCES credit_menu(action_id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'activated', 'deactivated', 'deleted')),

  -- Before state (null on create)
  prev_cost_low    DECIMAL(10, 4),
  prev_cost_medium DECIMAL(10, 4),
  prev_cost_high   DECIMAL(10, 4),
  prev_is_active   BOOLEAN,

  -- After state
  new_cost_low     DECIMAL(10, 4),
  new_cost_medium  DECIMAL(10, 4),
  new_cost_high    DECIMAL(10, 4),
  new_is_active    BOOLEAN,

  menu_version     INTEGER NOT NULL,
  reason           TEXT,                              -- optional admin note
  changed_by       TEXT,
  changed_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Price Snapshots — lock pricing at queue time for in-flight workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_snapshots (
  snapshot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id        TEXT NOT NULL,
  cost_at_queue    DECIMAL(10, 4) NOT NULL,
  tier_at_queue    TEXT NOT NULL CHECK (tier_at_queue IN ('low', 'medium', 'high')),
  queued_at        TIMESTAMPTZ DEFAULT NOW(),
  menu_version     INTEGER NOT NULL,
  expires_at       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'), -- stale after 7 days
  workflow_ref     TEXT                               -- optional: agent_schedule_id, sequence_step_id etc.
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_credit_menu_category
  ON credit_menu(category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_menu_active
  ON credit_menu(is_active) WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_credit_menu_history_action
  ON credit_menu_history(action_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_workflow
  ON price_snapshots(workflow_ref) WHERE expires_at > NOW();

-- ============================================================================
-- Auto-update menu_version + updated_at on price changes
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_credit_menu_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment version if pricing or active status actually changed
  IF (OLD.cost_low    IS DISTINCT FROM NEW.cost_low    OR
      OLD.cost_medium IS DISTINCT FROM NEW.cost_medium OR
      OLD.cost_high   IS DISTINCT FROM NEW.cost_high   OR
      OLD.is_active   IS DISTINCT FROM NEW.is_active) THEN
    NEW.menu_version = OLD.menu_version + 1;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_credit_menu_version ON credit_menu;
CREATE TRIGGER trigger_credit_menu_version
  BEFORE UPDATE ON credit_menu
  FOR EACH ROW EXECUTE FUNCTION increment_credit_menu_version();

-- ============================================================================
-- Auto-insert history row on create/update
-- ============================================================================

CREATE OR REPLACE FUNCTION log_credit_menu_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO credit_menu_history
      (action_id, event_type, new_cost_low, new_cost_medium, new_cost_high,
       new_is_active, menu_version, changed_by)
    VALUES
      (NEW.action_id, 'created', NEW.cost_low, NEW.cost_medium, NEW.cost_high,
       NEW.is_active, NEW.menu_version, NEW.updated_by);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine event type
    DECLARE v_event TEXT := 'updated';
    BEGIN
      IF OLD.is_active = false AND NEW.is_active = true THEN
        v_event := 'activated';
      ELSIF OLD.is_active = true AND NEW.is_active = false THEN
        v_event := 'deactivated';
      END IF;
    END;
    INSERT INTO credit_menu_history
      (action_id, event_type,
       prev_cost_low, prev_cost_medium, prev_cost_high, prev_is_active,
       new_cost_low,  new_cost_medium,  new_cost_high,  new_is_active,
       menu_version, changed_by)
    VALUES
      (NEW.action_id, v_event,
       OLD.cost_low, OLD.cost_medium, OLD.cost_high, OLD.is_active,
       NEW.cost_low, NEW.cost_medium, NEW.cost_high, NEW.is_active,
       NEW.menu_version, NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_credit_menu_history ON credit_menu;
CREATE TRIGGER trigger_credit_menu_history
  AFTER INSERT OR UPDATE ON credit_menu
  FOR EACH ROW EXECUTE FUNCTION log_credit_menu_history();

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE credit_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_menu_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

-- credit_menu: authenticated users read active entries; platform admins read/write all
CREATE POLICY "credit_menu_read_active"
  ON credit_menu FOR SELECT
  TO authenticated
  USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "credit_menu_admin_all"
  ON credit_menu FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- credit_menu_history: admins only via service_role
CREATE POLICY "credit_menu_history_admin"
  ON credit_menu_history FOR SELECT
  TO service_role
  USING (true);

-- price_snapshots: service_role only
CREATE POLICY "price_snapshots_service"
  ON price_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Seed Data — migrated from creditPacks.ts ACTION_CREDIT_COSTS
-- ============================================================================
-- All actions start as is_active = true (migrated from existing hardcoded config).

INSERT INTO credit_menu
  (action_id, display_name, description, category, unit,
   cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, updated_by)
VALUES

-- ── AI Actions ──────────────────────────────────────────────────────────────
('copilot_chat',
 'Copilot Message',
 'Credits charged per message sent or received through the AI Copilot assistant.',
 'ai_actions', 'per message',
 0.3, 0.8, 4.0, true, false, false, 'system:migration'),

('meeting_summary',
 'Meeting Summary',
 'AI-generated summary of a recorded or transcribed meeting, including key decisions and action items.',
 'ai_actions', 'per meeting',
 0.3, 1.8, 8.5, true, true, false, 'system:migration'),  -- Low is free with sub

('research_enrichment',
 'Research & Enrichment',
 'AI-powered research and data enrichment for a contact or company profile.',
 'ai_actions', 'per contact',
 0.3, 0.6, 3.5, true, false, false, 'system:migration'),

('content_generation',
 'Content Generation',
 'AI-generated content such as emails, proposals, or documents.',
 'ai_actions', 'per document',
 0.3, 1.4, 5.0, true, false, false, 'system:migration'),

('crm_update',
 'CRM Update (Auto)',
 'Automatic CRM record update triggered by meeting or agent (charged per field-set, not per API call).',
 'ai_actions', 'per field-set',
 0.2, 0.5, 1.5, true, false, false, 'system:migration'),

('task_execution',
 'Task Execution',
 'AI execution of a follow-up task, chase, or scheduled action item.',
 'ai_actions', 'per task',
 0.3, 1.0, 4.0, true, false, false, 'system:migration'),

-- ── Autonomous Agents ───────────────────────────────────────────────────────
('daily_briefing',
 'Daily Briefing',
 'Morning pipeline brief generated by the autonomous agent. Always free.',
 'agents', 'per day',
 0, 0, 0, true, true, true, 'system:migration'),

('deal_risk_score',
 'Deal Risk Score',
 'Behavioural analysis of deal health and risk signals by the autonomous agent.',
 'agents', 'per deal',
 0.5, 1.0, 3.0, true, false, false, 'system:migration'),

('reengagement_trigger',
 'Re-engagement Trigger',
 'Closed-lost deal monitoring with automated re-engagement actions.',
 'agents', 'per trigger',
 1.0, 2.0, 5.0, true, false, false, 'system:migration'),

('stale_deal_alert',
 'Stale Deal Alert',
 'Pipeline hygiene alert for deals with no recent activity.',
 'agents', 'per alert',
 0.3, 0.8, 2.5, true, false, false, 'system:migration'),

('weekly_coaching_digest',
 'Weekly Coaching Digest',
 'Performance insights and coaching recommendations generated weekly.',
 'agents', 'per digest',
 1.0, 2.5, 6.0, true, false, false, 'system:migration'),

-- ── Integrations (flat-rate, no AI) ─────────────────────────────────────────
('apollo_search',
 'Apollo People Search',
 'Search for contacts and decision-makers via Apollo integration. Flat rate regardless of intelligence tier.',
 'integrations', 'per search',
 0.3, 0.3, 0.3, true, false, true, 'system:migration'),

('apollo_enrichment',
 'Apollo Enrichment',
 'Enrich a contact record with Apollo data. Flat rate regardless of intelligence tier.',
 'integrations', 'per contact',
 0.5, 0.5, 0.5, true, false, true, 'system:migration'),

('email_send',
 'Email Send',
 'Outbound email sent via connected Gmail or Office 365 account.',
 'integrations', 'per email',
 0.1, 0.1, 0.1, true, false, true, 'system:migration'),

('ai_ark_company',
 'AI Ark Company Search',
 'Company lookup and firmographic data from AI Ark database.',
 'enrichment', 'per search',
 0.25, 0.25, 0.25, true, false, true, 'system:migration'),

('ai_ark_people',
 'AI Ark People Search',
 'Contact and decision-maker search from AI Ark database.',
 'enrichment', 'per contact',
 1.25, 1.25, 1.25, true, false, true, 'system:migration'),

('exa_enrichment',
 'Exa Web Enrichment',
 'Web-based enrichment using Exa search for up-to-date company and contact data.',
 'enrichment', 'per search',
 0.2, 0.2, 0.2, true, false, true, 'system:migration'),

-- ── Storage (always free) ────────────────────────────────────────────────────
('call_recording_storage',
 'Call Recording Storage',
 'Storage for call recordings. Included in subscription at no extra cost.',
 'storage', 'per call',
 0, 0, 0, true, true, true, 'system:migration')

ON CONFLICT (action_id) DO NOTHING;

-- ============================================================================
-- Helper RPC: get_credit_menu_for_tier
-- Returns active menu entries with the cost for a specific tier pre-resolved
-- ============================================================================

CREATE OR REPLACE FUNCTION get_credit_menu_for_tier(p_tier TEXT DEFAULT 'medium')
RETURNS TABLE (
  action_id    TEXT,
  display_name TEXT,
  description  TEXT,
  category     TEXT,
  unit         TEXT,
  cost         DECIMAL,
  free_with_sub BOOLEAN,
  is_flat_rate  BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.action_id,
    cm.display_name,
    cm.description,
    cm.category,
    cm.unit,
    CASE p_tier
      WHEN 'low'  THEN cm.cost_low
      WHEN 'high' THEN cm.cost_high
      ELSE             cm.cost_medium
    END AS cost,
    cm.free_with_sub,
    cm.is_flat_rate
  FROM credit_menu cm
  WHERE cm.is_active = true
    AND cm.deleted_at IS NULL
  ORDER BY cm.category, cm.action_id;
END;
$$;

-- ============================================================================
-- Helper RPC: get_action_credit_cost
-- Used by edge functions to fetch live pricing (replaces hardcoded lookup)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_action_credit_cost(
  p_action_id TEXT,
  p_tier      TEXT DEFAULT 'medium'
)
RETURNS DECIMAL LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_cost DECIMAL;
BEGIN
  SELECT
    CASE p_tier
      WHEN 'low'  THEN cost_low
      WHEN 'high' THEN cost_high
      ELSE             cost_medium
    END
  INTO v_cost
  FROM credit_menu
  WHERE action_id = p_action_id
    AND is_active = true
    AND deleted_at IS NULL;

  -- Return NULL if not found (caller falls back to hardcoded value)
  RETURN v_cost;
END;
$$;
