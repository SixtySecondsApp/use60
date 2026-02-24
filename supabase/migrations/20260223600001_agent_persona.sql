-- ============================================================================
-- Migration: Agent Persona Table
-- Purpose: User-editable agent identity (SOUL.md equivalent) for always-on sales agent
-- Story: AOA-001 — Create agent_persona table with RLS and RPCs
-- Date: 2026-02-23
-- ============================================================================

-- =============================================================================
-- Table: agent_persona
-- User-specific agent personality and delivery preferences
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_persona (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL,

  -- Agent identity
  agent_name TEXT NOT NULL DEFAULT 'Sixty',
  tone TEXT NOT NULL DEFAULT 'concise' CHECK (tone IN ('concise', 'conversational', 'direct', 'custom')),
  custom_instructions TEXT DEFAULT NULL,

  -- Proactive behavior
  proactive_frequency TEXT NOT NULL DEFAULT 'balanced' CHECK (proactive_frequency IN ('aggressive', 'balanced', 'quiet')),
  focus_areas JSONB NOT NULL DEFAULT '["pipeline", "meetings"]'::jsonb,

  -- Quiet hours
  quiet_hours_start TIME DEFAULT '20:00',
  quiet_hours_end TIME DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',

  -- Morning briefing
  morning_briefing_time TIME NOT NULL DEFAULT '08:00',
  morning_briefing_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT custom_instructions_max_size CHECK (
    custom_instructions IS NULL OR octet_length(custom_instructions) <= 3072
  )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_persona_org
  ON agent_persona(org_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE agent_persona ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own persona"
  ON agent_persona FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own persona"
  ON agent_persona FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own persona"
  ON agent_persona FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access to agent_persona"
  ON agent_persona FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Trigger: Update updated_at on row changes
-- =============================================================================

CREATE OR REPLACE FUNCTION update_agent_persona_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_persona_updated_at
  BEFORE UPDATE ON agent_persona
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_persona_updated_at();

-- =============================================================================
-- RPC: Get agent persona (returns defaults if none exists)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_agent_persona(p_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  org_id TEXT,
  agent_name TEXT,
  tone TEXT,
  custom_instructions TEXT,
  proactive_frequency TEXT,
  focus_areas JSONB,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT,
  morning_briefing_time TIME,
  morning_briefing_enabled BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(ap.user_id, p_user_id),
    COALESCE(ap.org_id, ''),
    COALESCE(ap.agent_name, 'Sixty'),
    COALESCE(ap.tone, 'concise'),
    ap.custom_instructions,
    COALESCE(ap.proactive_frequency, 'balanced'),
    COALESCE(ap.focus_areas, '["pipeline", "meetings"]'::jsonb),
    COALESCE(ap.quiet_hours_start, '20:00'::time),
    COALESCE(ap.quiet_hours_end, '08:00'::time),
    COALESCE(ap.timezone, 'UTC'),
    COALESCE(ap.morning_briefing_time, '08:00'::time),
    COALESCE(ap.morning_briefing_enabled, true)
  FROM (SELECT 1) AS dummy
  LEFT JOIN agent_persona ap ON ap.user_id = p_user_id;
$$;

COMMENT ON FUNCTION get_agent_persona IS
  'Returns agent persona for a user, with defaults if no row exists';

GRANT EXECUTE ON FUNCTION get_agent_persona TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_persona TO service_role;

-- =============================================================================
-- RPC: Upsert agent persona
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_agent_persona(
  p_user_id UUID,
  p_org_id TEXT,
  p_agent_name TEXT DEFAULT 'Sixty',
  p_tone TEXT DEFAULT 'concise',
  p_custom_instructions TEXT DEFAULT NULL,
  p_proactive_frequency TEXT DEFAULT 'balanced',
  p_focus_areas JSONB DEFAULT '["pipeline", "meetings"]'::jsonb,
  p_quiet_hours_start TIME DEFAULT '20:00',
  p_quiet_hours_end TIME DEFAULT '08:00',
  p_timezone TEXT DEFAULT 'UTC',
  p_morning_briefing_time TIME DEFAULT '08:00',
  p_morning_briefing_enabled BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO agent_persona (
    user_id, org_id, agent_name, tone, custom_instructions,
    proactive_frequency, focus_areas,
    quiet_hours_start, quiet_hours_end, timezone,
    morning_briefing_time, morning_briefing_enabled
  ) VALUES (
    p_user_id, p_org_id, p_agent_name, p_tone, p_custom_instructions,
    p_proactive_frequency, p_focus_areas,
    p_quiet_hours_start, p_quiet_hours_end, p_timezone,
    p_morning_briefing_time, p_morning_briefing_enabled
  )
  ON CONFLICT (user_id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    agent_name = EXCLUDED.agent_name,
    tone = EXCLUDED.tone,
    custom_instructions = EXCLUDED.custom_instructions,
    proactive_frequency = EXCLUDED.proactive_frequency,
    focus_areas = EXCLUDED.focus_areas,
    quiet_hours_start = EXCLUDED.quiet_hours_start,
    quiet_hours_end = EXCLUDED.quiet_hours_end,
    timezone = EXCLUDED.timezone,
    morning_briefing_time = EXCLUDED.morning_briefing_time,
    morning_briefing_enabled = EXCLUDED.morning_briefing_enabled;

  RETURN p_user_id;
END;
$$;

COMMENT ON FUNCTION upsert_agent_persona IS
  'Creates or updates an agent persona for a user. Used from persona settings UI.';

GRANT EXECUTE ON FUNCTION upsert_agent_persona TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_agent_persona TO service_role;

-- =============================================================================
-- Permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON agent_persona TO authenticated;
GRANT ALL ON agent_persona TO service_role;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE agent_persona IS
  'User-editable agent identity and delivery preferences. Each user has one persona defining how their AI agent communicates.';

COMMENT ON COLUMN agent_persona.agent_name IS 'Display name for the agent (default: Sixty)';
COMMENT ON COLUMN agent_persona.tone IS 'Communication style: concise, conversational, direct, or custom';
COMMENT ON COLUMN agent_persona.custom_instructions IS 'Free-form persona instructions (max 3KB). Used when tone=custom.';
COMMENT ON COLUMN agent_persona.proactive_frequency IS 'How aggressively the agent reaches out: aggressive, balanced, or quiet';
COMMENT ON COLUMN agent_persona.focus_areas IS 'JSONB array of areas the agent prioritizes: pipeline, meetings, outreach, admin';
COMMENT ON COLUMN agent_persona.quiet_hours_start IS 'Start of quiet hours (no notifications)';
COMMENT ON COLUMN agent_persona.quiet_hours_end IS 'End of quiet hours';
COMMENT ON COLUMN agent_persona.morning_briefing_time IS 'When to deliver the morning briefing (in user timezone)';
COMMENT ON COLUMN agent_persona.morning_briefing_enabled IS 'Whether to send morning briefings';
