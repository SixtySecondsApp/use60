-- ============================================================================
-- Migration: Agent Configuration Engine
-- Purpose: 3-layer config resolution system (platform defaults → org overrides → user overrides)
-- Stories: CFG-001 (defaults table), CFG-002 (org overrides), CFG-003 (user overrides + overridable),
--          CFG-004 (resolution functions)
-- Date: 2026-02-22
-- ============================================================================

-- ============================================================================
-- TABLE: agent_config_defaults (CFG-001)
-- Platform-wide default config values — global, no org_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_defaults (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_type   TEXT NOT NULL,
  config_key   TEXT NOT NULL,
  config_value JSONB NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_defaults_unique UNIQUE (agent_type, config_key)
);

ALTER TABLE agent_config_defaults ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for seeding, orchestrator, admin tooling)
CREATE POLICY "Service role full access to agent_config_defaults"
ON agent_config_defaults FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users may read defaults (they need them for resolution)
CREATE POLICY "Authenticated users can read agent_config_defaults"
ON agent_config_defaults FOR SELECT
TO authenticated
USING (true);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_agent_config_defaults_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_config_defaults_updated_at ON agent_config_defaults;
CREATE TRIGGER trg_agent_config_defaults_updated_at
  BEFORE UPDATE ON agent_config_defaults
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_config_defaults_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_config_defaults TO authenticated;
GRANT ALL ON agent_config_defaults TO service_role;

COMMENT ON TABLE agent_config_defaults IS 'Platform-wide default configuration values for all agent types. No org_id — global scope. Org and user overrides layer on top.';
COMMENT ON COLUMN agent_config_defaults.agent_type IS 'Agent identifier, e.g. global, crm_update, deal_risk, morning_briefing.';
COMMENT ON COLUMN agent_config_defaults.config_key IS 'Dot-notation config key, e.g. mission, thresholds, temporal.quarter_phases.';
COMMENT ON COLUMN agent_config_defaults.config_value IS 'JSONB default value for this config key. Overridden by org or user layers.';
COMMENT ON COLUMN agent_config_defaults.description IS 'Human-readable description of this config key and its expected shape.';

-- ============================================================================
-- TABLE: agent_config_org_overrides (CFG-002)
-- Per-organisation overrides for agent config defaults
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_org_overrides (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  agent_type   TEXT NOT NULL,
  config_key   TEXT NOT NULL,
  config_value JSONB NOT NULL,
  updated_by   UUID REFERENCES auth.users (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_org_overrides_unique UNIQUE (org_id, agent_type, config_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_org_overrides_org_id
  ON agent_config_org_overrides (org_id);

ALTER TABLE agent_config_org_overrides ENABLE ROW LEVEL SECURITY;

-- Org admins and owners manage org overrides
CREATE POLICY "Org admins can manage agent_config_org_overrides"
ON agent_config_org_overrides FOR ALL
TO authenticated
USING (
  get_org_role(auth.uid(), agent_config_org_overrides.org_id) IN ('owner', 'admin')
)
WITH CHECK (
  get_org_role(auth.uid(), agent_config_org_overrides.org_id) IN ('owner', 'admin')
);

-- Org members can read overrides for their org
CREATE POLICY "Org members can read agent_config_org_overrides"
ON agent_config_org_overrides FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM organization_memberships om
    WHERE om.org_id = agent_config_org_overrides.org_id
      AND om.user_id = auth.uid()
  )
);

-- Service role full access
CREATE POLICY "Service role full access to agent_config_org_overrides"
ON agent_config_org_overrides FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_agent_config_org_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_config_org_overrides_updated_at ON agent_config_org_overrides;
CREATE TRIGGER trg_agent_config_org_overrides_updated_at
  BEFORE UPDATE ON agent_config_org_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_config_org_overrides_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_config_org_overrides TO authenticated;
GRANT ALL ON agent_config_org_overrides TO service_role;

COMMENT ON TABLE agent_config_org_overrides IS 'Per-organisation overrides for agent config defaults. Takes precedence over platform defaults; user overrides take precedence over these.';
COMMENT ON COLUMN agent_config_org_overrides.org_id IS 'Organisation this override belongs to. Cascade-deletes when org is removed.';
COMMENT ON COLUMN agent_config_org_overrides.updated_by IS 'User who last updated this override (audit trail).';

-- ============================================================================
-- TABLE: agent_config_user_overrides (CFG-003)
-- Per-user overrides for agent config — highest precedence in resolution
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_user_overrides (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID NOT NULL,
  user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  agent_type   TEXT NOT NULL,
  config_key   TEXT NOT NULL,
  config_value JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_user_overrides_unique UNIQUE (org_id, user_id, agent_type, config_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_user_overrides_user_id
  ON agent_config_user_overrides (user_id);

CREATE INDEX IF NOT EXISTS idx_agent_config_user_overrides_org_user
  ON agent_config_user_overrides (org_id, user_id);

ALTER TABLE agent_config_user_overrides ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own overrides
CREATE POLICY "Users can manage their own agent_config_user_overrides"
ON agent_config_user_overrides FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role full access
CREATE POLICY "Service role full access to agent_config_user_overrides"
ON agent_config_user_overrides FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION update_agent_config_user_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_config_user_overrides_updated_at ON agent_config_user_overrides;
CREATE TRIGGER trg_agent_config_user_overrides_updated_at
  BEFORE UPDATE ON agent_config_user_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_config_user_overrides_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_config_user_overrides TO authenticated;
GRANT ALL ON agent_config_user_overrides TO service_role;

COMMENT ON TABLE agent_config_user_overrides IS 'Per-user overrides for agent config. Highest precedence in resolution chain: user → org → platform default.';
COMMENT ON COLUMN agent_config_user_overrides.org_id IS 'Org context for this user override. Not FK-constrained (org deletion handled via user cascade).';
COMMENT ON COLUMN agent_config_user_overrides.user_id IS 'User who owns this override. Row is cascade-deleted when user is removed.';

-- ============================================================================
-- TABLE: agent_config_user_overridable (CFG-003)
-- Org-controlled allowlist of keys users are permitted to override
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_config_user_overridable (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  agent_type      TEXT NOT NULL,
  config_key      TEXT NOT NULL,
  is_overridable  BOOLEAN NOT NULL DEFAULT false,
  updated_by      UUID REFERENCES auth.users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_config_user_overridable_unique UNIQUE (org_id, agent_type, config_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_user_overridable_org_id
  ON agent_config_user_overridable (org_id);

ALTER TABLE agent_config_user_overridable ENABLE ROW LEVEL SECURITY;

-- Org admins manage the overridable allowlist
CREATE POLICY "Org admins can manage agent_config_user_overridable"
ON agent_config_user_overridable FOR ALL
TO authenticated
USING (
  get_org_role(auth.uid(), agent_config_user_overridable.org_id) IN ('owner', 'admin')
)
WITH CHECK (
  get_org_role(auth.uid(), agent_config_user_overridable.org_id) IN ('owner', 'admin')
);

-- All authenticated users may read (so UIs know what they're allowed to change)
CREATE POLICY "Authenticated users can read agent_config_user_overridable"
ON agent_config_user_overridable FOR SELECT
TO authenticated
USING (true);

-- Service role full access
CREATE POLICY "Service role full access to agent_config_user_overridable"
ON agent_config_user_overridable FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_config_user_overridable TO authenticated;
GRANT ALL ON agent_config_user_overridable TO service_role;

COMMENT ON TABLE agent_config_user_overridable IS 'Org-controlled allowlist: which agent config keys users are permitted to override at the user level. Defaults to not overridable.';
COMMENT ON COLUMN agent_config_user_overridable.is_overridable IS 'When true, users in this org may set a personal override for this agent_type + config_key combination.';

-- ============================================================================
-- SEED DATA: agent_config_defaults (CFG-001)
-- Platform-wide defaults for all agent types
-- ============================================================================

INSERT INTO agent_config_defaults (agent_type, config_key, config_value, description) VALUES

-- ============================================================================
-- GLOBAL agent
-- ============================================================================
('global', 'mission', '{
  "description": "Orchestrate all AI agents across the platform — set methodology, manage temporal context, and ensure consistent behaviour",
  "primary_goal": "Provide a unified intelligence layer that coordinates specialised agents and surfaces the right insight at the right time",
  "constraints": ["never act without user context", "preserve data privacy", "log all agent decisions"]
}'::jsonb, 'Top-level mission for the global orchestrator agent'),

('global', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Surface insights in priority order: risk > opportunity > maintenance",
    "Prefer concise output unless detail is explicitly requested",
    "Always include a suggested next action"
  ],
  "decision_tree": {}
}'::jsonb, 'Global playbook and methodology settings'),

('global', 'boundaries', '{
  "max_actions_per_run": 10,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": ["stage_change", "deal_value_change"]
}'::jsonb, 'Global agent action limits and approval gates'),

('global', 'voice', '{
  "tone": "professional",
  "formality": "balanced",
  "brevity": "concise"
}'::jsonb, 'Default voice and tone settings applied to all agents unless overridden'),

('global', 'heartbeat', '{
  "check_interval_minutes": 60,
  "alert_on_failure": true,
  "max_silent_hours": 24
}'::jsonb, 'Global heartbeat and liveness monitoring config'),

('global', 'delivery', '{
  "channel": "slack",
  "format": "detailed",
  "quiet_hours": {"start": "22:00", "end": "07:00"}
}'::jsonb, 'Default delivery channel and formatting for all agents'),

('global', 'thresholds', '{
  "confidence_minimum": 0.7,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'Global scoring and alerting thresholds'),

('global', 'active_methodology', '{
  "key": "generic",
  "applied_at": null,
  "applied_by": null
}'::jsonb, 'Currently active sales methodology (MEDDIC, SPIN, Challenger, generic, etc.)'),

('global', 'temporal.quarter_phases', '{
  "build": {
    "label": "Build",
    "weeks": [1, 2, 3, 4],
    "description": "Pipeline building phase — focus on prospecting, discovery, and new opportunity creation",
    "priorities": ["pipeline_generation", "discovery_meetings", "new_contacts"]
  },
  "progress": {
    "label": "Progress",
    "weeks": [5, 6, 7, 8],
    "description": "Momentum phase — advance qualified deals through stages, deepen champion relationships",
    "priorities": ["stage_progression", "champion_health", "proposal_delivery"]
  },
  "close": {
    "label": "Close",
    "weeks": [9, 10, 11, 12, 13],
    "description": "Closing phase — convert late-stage deals, manage risk, accelerate decisions",
    "priorities": ["deal_closure", "risk_mitigation", "executive_engagement"]
  }
}'::jsonb, 'Quarter phase definitions used by temporal context in morning briefing and EOD synthesis'),

('global', 'pipeline.targets', '{
  "source": "manual",
  "period": "quarterly",
  "targets": {
    "revenue": null,
    "deals_closed": null,
    "pipeline_generated": null
  },
  "coverage_ratio_target": 3.0
}'::jsonb, 'Pipeline targets for the current period — set manually or synced from CRM'),

-- ============================================================================
-- CRM UPDATE agent
-- ============================================================================
('crm_update', 'mission', '{
  "description": "Automatically update CRM after meetings — notes, next steps, contacts, activity logs",
  "primary_goal": "Ensure every meeting produces accurate, structured CRM data with zero manual entry",
  "constraints": ["only update records linked to the meeting", "never overwrite manually-set fields without approval"]
}'::jsonb, 'Mission for the CRM update agent'),

('crm_update', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Extract next steps as distinct task objects",
    "Identify all attendees and create contact records if missing",
    "Link activity to deal if deal context is present",
    "Flag ambiguous stage changes for human approval"
  ],
  "decision_tree": {}
}'::jsonb, 'CRM update agent playbook'),

('crm_update', 'boundaries', '{
  "max_actions_per_run": 15,
  "allowed_channels": ["in_app"],
  "require_approval_for": ["stage_change", "deal_value_change", "contact_create"]
}'::jsonb, 'CRM update agent action limits'),

('crm_update', 'voice', '{
  "tone": "neutral",
  "formality": "formal",
  "brevity": "concise"
}'::jsonb, 'Voice settings for CRM update agent outputs'),

('crm_update', 'heartbeat', '{
  "check_interval_minutes": 30,
  "alert_on_failure": true,
  "max_silent_hours": 4
}'::jsonb, 'CRM update agent heartbeat — frequent because it runs post-meeting'),

('crm_update', 'delivery', '{
  "channel": "in_app",
  "format": "structured",
  "quiet_hours": {"start": "23:00", "end": "06:00"}
}'::jsonb, 'Delivery config for CRM update agent'),

('crm_update', 'thresholds', '{
  "confidence_minimum": 0.75,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'CRM update agent thresholds'),

-- ============================================================================
-- DEAL RISK agent
-- ============================================================================
('deal_risk', 'mission', '{
  "description": "Score active deals on engagement decay, champion health, momentum, and sentiment",
  "primary_goal": "Identify at-risk deals early so reps can intervene before deals go dark or are lost",
  "constraints": ["only flag deals with activity in the last 90 days", "never send external communications autonomously"]
}'::jsonb, 'Mission for the deal risk scoring agent'),

('deal_risk', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Score each deal 0-100 across four dimensions: engagement, champion health, momentum, sentiment",
    "Composite risk = weighted average of all four dimensions",
    "Always pair a risk flag with a recommended action",
    "Re-score on new meeting transcript or email signal"
  ],
  "decision_tree": {}
}'::jsonb, 'Deal risk agent scoring playbook'),

('deal_risk', 'boundaries', '{
  "max_actions_per_run": 50,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": ["stage_change"]
}'::jsonb, 'Deal risk agent action limits'),

('deal_risk', 'voice', '{
  "tone": "direct",
  "formality": "balanced",
  "brevity": "concise"
}'::jsonb, 'Voice settings for deal risk alerts'),

('deal_risk', 'heartbeat', '{
  "check_interval_minutes": 240,
  "alert_on_failure": true,
  "max_silent_hours": 12
}'::jsonb, 'Deal risk agent heartbeat — runs every 4 hours'),

('deal_risk', 'delivery', '{
  "channel": "slack",
  "format": "compact",
  "quiet_hours": {"start": "22:00", "end": "07:00"}
}'::jsonb, 'Delivery config for deal risk agent'),

('deal_risk', 'thresholds', '{
  "confidence_minimum": 0.7,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'Deal risk agent scoring thresholds'),

-- ============================================================================
-- REENGAGEMENT agent
-- ============================================================================
('reengagement', 'mission', '{
  "description": "Identify dormant contacts and deals, draft personalised reengagement messages for rep review",
  "primary_goal": "Revive pipeline that has gone dark by surfacing contextual outreach at the right moment",
  "constraints": ["never send messages without explicit rep approval", "respect opt-out markers on contacts"]
}'::jsonb, 'Mission for the reengagement agent'),

('reengagement', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Rank dormant deals by original value and last contact date",
    "Draft message referencing the last meaningful touchpoint",
    "Suggest three message variants: soft check-in, value-add, direct ask",
    "Flag contacts with recent LinkedIn activity as highest priority"
  ],
  "decision_tree": {}
}'::jsonb, 'Reengagement agent playbook'),

('reengagement', 'boundaries', '{
  "max_actions_per_run": 20,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": ["send_email", "send_linkedin", "stage_change"]
}'::jsonb, 'Reengagement agent action limits'),

('reengagement', 'voice', '{
  "tone": "warm",
  "formality": "balanced",
  "brevity": "moderate"
}'::jsonb, 'Voice settings for reengagement drafts'),

('reengagement', 'heartbeat', '{
  "check_interval_minutes": 1440,
  "alert_on_failure": false,
  "max_silent_hours": 48
}'::jsonb, 'Reengagement agent heartbeat — daily run'),

('reengagement', 'delivery', '{
  "channel": "in_app",
  "format": "detailed",
  "quiet_hours": {"start": "22:00", "end": "07:00"}
}'::jsonb, 'Delivery config for reengagement agent'),

('reengagement', 'thresholds', '{
  "confidence_minimum": 0.65,
  "risk_alert_level": 60,
  "engagement_decay_days": 14
}'::jsonb, 'Reengagement agent decay thresholds'),

-- ============================================================================
-- MORNING BRIEFING agent
-- ============================================================================
('morning_briefing', 'mission', '{
  "description": "Deliver a morning pipeline brief with math, temporal context, and priority actions for the day",
  "primary_goal": "Give every rep a clear, data-driven start to the day with the three things they must do",
  "constraints": ["deliver before 9am local time", "never exceed 500 words", "always include a pipeline number"]
}'::jsonb, 'Mission for the morning briefing agent'),

('morning_briefing', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Open with pipeline vs target delta and current quarter phase",
    "List top 3 deals by close probability × deal value",
    "Surface one at-risk deal with a specific action",
    "Close with the day''s most important meeting prep note"
  ],
  "decision_tree": {}
}'::jsonb, 'Morning briefing agent playbook'),

('morning_briefing', 'boundaries', '{
  "max_actions_per_run": 5,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": []
}'::jsonb, 'Morning briefing agent action limits'),

('morning_briefing', 'voice', '{
  "tone": "energetic",
  "formality": "balanced",
  "brevity": "concise"
}'::jsonb, 'Voice settings for morning briefings'),

('morning_briefing', 'heartbeat', '{
  "check_interval_minutes": 1440,
  "alert_on_failure": true,
  "max_silent_hours": 25
}'::jsonb, 'Morning briefing heartbeat — once daily'),

('morning_briefing', 'delivery', '{
  "channel": "slack",
  "format": "compact",
  "quiet_hours": {"start": "21:00", "end": "06:30"}
}'::jsonb, 'Delivery config for morning briefing agent'),

('morning_briefing', 'thresholds', '{
  "confidence_minimum": 0.7,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'Morning briefing agent thresholds'),

-- ============================================================================
-- EOD SYNTHESIS agent
-- ============================================================================
('eod_synthesis', 'mission', '{
  "description": "Synthesise the day''s activity into a structured end-of-day summary with wins, risks, and tomorrow''s priorities",
  "primary_goal": "Help reps close the day with clarity on what moved, what stalled, and what to focus on tomorrow",
  "constraints": ["deliver between 5pm and 7pm local time", "reference only today''s activity"]
}'::jsonb, 'Mission for the end-of-day synthesis agent'),

('eod_synthesis', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Summarise meetings held today with one-line outcome each",
    "List CRM updates made by AI and by rep",
    "Flag any deal that moved stage today (forward or backward)",
    "Generate tomorrow''s top-3 priority list"
  ],
  "decision_tree": {}
}'::jsonb, 'EOD synthesis agent playbook'),

('eod_synthesis', 'boundaries', '{
  "max_actions_per_run": 5,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": []
}'::jsonb, 'EOD synthesis agent action limits'),

('eod_synthesis', 'voice', '{
  "tone": "reflective",
  "formality": "balanced",
  "brevity": "moderate"
}'::jsonb, 'Voice settings for EOD synthesis outputs'),

('eod_synthesis', 'heartbeat', '{
  "check_interval_minutes": 1440,
  "alert_on_failure": true,
  "max_silent_hours": 25
}'::jsonb, 'EOD synthesis heartbeat — once daily'),

('eod_synthesis', 'delivery', '{
  "channel": "slack",
  "format": "detailed",
  "quiet_hours": {"start": "20:00", "end": "16:00"}
}'::jsonb, 'Delivery config for EOD synthesis agent'),

('eod_synthesis', 'thresholds', '{
  "confidence_minimum": 0.7,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'EOD synthesis agent thresholds'),

-- ============================================================================
-- INTERNAL MEETING PREP agent
-- ============================================================================
('internal_meeting_prep', 'mission', '{
  "description": "Prepare a structured briefing document 90 minutes before each external meeting",
  "primary_goal": "Ensure reps walk into every meeting knowing the deal status, attendee context, and the key question to ask",
  "constraints": ["only prepare for external meetings (attendees_count > 1)", "never include internal-only notes in shared prep docs"]
}'::jsonb, 'Mission for the internal meeting preparation agent'),

('internal_meeting_prep', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Pull deal stage, value, and last activity from CRM",
    "Summarise each attendee: role, previous interactions, key signals",
    "Suggest the single most important question to ask",
    "Include relevant case studies or objection responses if available"
  ],
  "decision_tree": {}
}'::jsonb, 'Internal meeting prep agent playbook'),

('internal_meeting_prep', 'boundaries', '{
  "max_actions_per_run": 10,
  "allowed_channels": ["in_app"],
  "require_approval_for": []
}'::jsonb, 'Internal meeting prep agent action limits'),

('internal_meeting_prep', 'voice', '{
  "tone": "professional",
  "formality": "formal",
  "brevity": "moderate"
}'::jsonb, 'Voice settings for meeting prep briefings'),

('internal_meeting_prep', 'heartbeat', '{
  "check_interval_minutes": 30,
  "alert_on_failure": true,
  "max_silent_hours": 4
}'::jsonb, 'Internal meeting prep heartbeat — frequent to catch newly added meetings'),

('internal_meeting_prep', 'delivery', '{
  "channel": "in_app",
  "format": "detailed",
  "quiet_hours": {"start": "23:00", "end": "06:00"}
}'::jsonb, 'Delivery config for internal meeting prep agent'),

('internal_meeting_prep', 'thresholds', '{
  "confidence_minimum": 0.7,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'Internal meeting prep agent thresholds'),

-- ============================================================================
-- EMAIL SIGNALS agent
-- ============================================================================
('email_signals', 'mission', '{
  "description": "Monitor inbound and outbound emails for buying signals, objections, and sentiment shifts",
  "primary_goal": "Surface high-signal email moments so reps can respond at the optimal time with the optimal message",
  "constraints": ["only process emails linked to active deals or tracked contacts", "never read personal email threads"]
}'::jsonb, 'Mission for the email signals agent'),

('email_signals', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Classify each email: buying signal, objection, neutral, positive sentiment, negative sentiment",
    "Flag response urgency: immediate (<2h), same-day, low-priority",
    "Suggest a draft response for high-priority signals",
    "Link email signal to relevant deal record"
  ],
  "decision_tree": {}
}'::jsonb, 'Email signals agent playbook'),

('email_signals', 'boundaries', '{
  "max_actions_per_run": 30,
  "allowed_channels": ["slack", "in_app"],
  "require_approval_for": ["send_email"]
}'::jsonb, 'Email signals agent action limits'),

('email_signals', 'voice', '{
  "tone": "analytical",
  "formality": "balanced",
  "brevity": "concise"
}'::jsonb, 'Voice settings for email signal alerts'),

('email_signals', 'heartbeat', '{
  "check_interval_minutes": 60,
  "alert_on_failure": true,
  "max_silent_hours": 8
}'::jsonb, 'Email signals agent heartbeat — hourly'),

('email_signals', 'delivery', '{
  "channel": "slack",
  "format": "compact",
  "quiet_hours": {"start": "22:00", "end": "07:00"}
}'::jsonb, 'Delivery config for email signals agent'),

('email_signals', 'thresholds', '{
  "confidence_minimum": 0.72,
  "risk_alert_level": 55,
  "engagement_decay_days": 5
}'::jsonb, 'Email signals agent classification thresholds'),

-- ============================================================================
-- COACHING DIGEST agent
-- ============================================================================
('coaching_digest', 'mission', '{
  "description": "Analyse rep performance patterns and deliver weekly coaching nudges backed by data",
  "primary_goal": "Help reps improve conversation quality, objection handling, and pipeline discipline through specific, evidence-based coaching",
  "constraints": ["coaching is private to the rep unless explicitly shared", "never rank reps against each other without manager opt-in"]
}'::jsonb, 'Mission for the coaching digest agent'),

('coaching_digest', 'playbook', '{
  "methodology": "generic",
  "rules": [
    "Identify the rep''s top strength from the past week",
    "Identify one specific improvement area with a transcript example",
    "Compare talk-to-listen ratio against benchmark",
    "Suggest one skill-building action for the coming week"
  ],
  "decision_tree": {}
}'::jsonb, 'Coaching digest agent playbook'),

('coaching_digest', 'boundaries', '{
  "max_actions_per_run": 5,
  "allowed_channels": ["in_app"],
  "require_approval_for": []
}'::jsonb, 'Coaching digest agent action limits'),

('coaching_digest', 'voice', '{
  "tone": "encouraging",
  "formality": "casual",
  "brevity": "moderate"
}'::jsonb, 'Voice settings for coaching digest — warm, human, not clinical'),

('coaching_digest', 'heartbeat', '{
  "check_interval_minutes": 10080,
  "alert_on_failure": false,
  "max_silent_hours": 200
}'::jsonb, 'Coaching digest heartbeat — weekly run'),

('coaching_digest', 'delivery', '{
  "channel": "in_app",
  "format": "detailed",
  "quiet_hours": {"start": "20:00", "end": "08:00"}
}'::jsonb, 'Delivery config for coaching digest agent'),

('coaching_digest', 'thresholds', '{
  "confidence_minimum": 0.65,
  "risk_alert_level": 60,
  "engagement_decay_days": 7
}'::jsonb, 'Coaching digest agent thresholds')

ON CONFLICT (agent_type, config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description  = EXCLUDED.description,
      updated_at   = now();

-- ============================================================================
-- RESOLUTION FUNCTIONS (CFG-004)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- resolve_agent_config: returns single config value for a key
-- Resolution order: user_override → org_override → platform default
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_agent_config(
  p_org_id    UUID,
  p_user_id   UUID,
  p_agent_type TEXT,
  p_config_key TEXT
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1. User override (highest priority)
    (
      SELECT config_value
      FROM agent_config_user_overrides
      WHERE org_id    = p_org_id
        AND user_id   = p_user_id
        AND agent_type = p_agent_type
        AND config_key = p_config_key
      LIMIT 1
    ),
    -- 2. Org override
    (
      SELECT config_value
      FROM agent_config_org_overrides
      WHERE org_id    = p_org_id
        AND agent_type = p_agent_type
        AND config_key = p_config_key
      LIMIT 1
    ),
    -- 3. Platform default
    (
      SELECT config_value
      FROM agent_config_defaults
      WHERE agent_type = p_agent_type
        AND config_key = p_config_key
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION resolve_agent_config(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_agent_config(UUID, UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION resolve_agent_config IS 'Returns the resolved JSONB value for a single agent config key, applying the 3-layer override chain: user → org → platform default.';

-- ----------------------------------------------------------------------------
-- resolve_agent_config_all: returns all config keys for an agent type
-- Returns each key with its resolved value and the source layer
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resolve_agent_config_all(
  p_org_id     UUID,
  p_user_id    UUID,
  p_agent_type TEXT
)
RETURNS TABLE (
  config_key   TEXT,
  config_value JSONB,
  source       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    d.config_key,
    COALESCE(
      u.config_value,
      o.config_value,
      d.config_value
    ) AS config_value,
    CASE
      WHEN u.config_value IS NOT NULL THEN 'user'
      WHEN o.config_value IS NOT NULL THEN 'org'
      ELSE 'default'
    END AS source
  FROM agent_config_defaults d
  LEFT JOIN agent_config_org_overrides o
    ON  o.org_id     = p_org_id
    AND o.agent_type = d.agent_type
    AND o.config_key = d.config_key
  LEFT JOIN agent_config_user_overrides u
    ON  u.org_id     = p_org_id
    AND u.user_id    = p_user_id
    AND u.agent_type = d.agent_type
    AND u.config_key = d.config_key
  WHERE d.agent_type = p_agent_type
  ORDER BY d.config_key;
$$;

GRANT EXECUTE ON FUNCTION resolve_agent_config_all(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_agent_config_all(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION resolve_agent_config_all IS 'Returns all resolved config keys for an agent type, with the value and its source layer (user/org/default). Useful for displaying the effective config in admin UIs.';

-- ============================================================================
-- Migration Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222000001_agent_config_engine.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Stories covered: CFG-001, CFG-002, CFG-003, CFG-004';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - agent_config_defaults       (CFG-001) — platform-wide defaults, no org_id';
  RAISE NOTICE '  - agent_config_org_overrides  (CFG-002) — per-org overrides, admin-managed';
  RAISE NOTICE '  - agent_config_user_overrides (CFG-003) — per-user overrides, user-managed';
  RAISE NOTICE '  - agent_config_user_overridable (CFG-003) — org allowlist for user overrides';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed data (agent_config_defaults):';
  RAISE NOTICE '  - Agent types: global, crm_update, deal_risk, reengagement,';
  RAISE NOTICE '                 morning_briefing, eod_synthesis, internal_meeting_prep,';
  RAISE NOTICE '                 email_signals, coaching_digest';
  RAISE NOTICE '  - Config keys per agent: mission, playbook, boundaries, voice,';
  RAISE NOTICE '                           heartbeat, delivery, thresholds';
  RAISE NOTICE '  - Extra global keys: active_methodology, temporal.quarter_phases,';
  RAISE NOTICE '                       pipeline.targets';
  RAISE NOTICE '';
  RAISE NOTICE 'Resolution functions (CFG-004):';
  RAISE NOTICE '  - resolve_agent_config(org_id, user_id, agent_type, config_key) → jsonb';
  RAISE NOTICE '    Resolution: user_override → org_override → default';
  RAISE NOTICE '  - resolve_agent_config_all(org_id, user_id, agent_type) → TABLE';
  RAISE NOTICE '    Returns all keys with COALESCE value and source (user/org/default)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS summary:';
  RAISE NOTICE '  - agent_config_defaults:         service_role full | authenticated read';
  RAISE NOTICE '  - agent_config_org_overrides:    service_role full | admin manage | member read';
  RAISE NOTICE '  - agent_config_user_overrides:   service_role full | user owns own rows';
  RAISE NOTICE '  - agent_config_user_overridable: service_role full | admin manage | authenticated read';
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
END $$;
