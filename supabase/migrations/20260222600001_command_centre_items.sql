-- ============================================================================
-- Migration: Command Centre Items
-- Purpose: Central inbox for AI-generated, prioritised action items across all
--          proactive agents. Replaces the per-agent scatter of suggestions with
--          a single unified surface that supports enrichment, HITL approval,
--          and autonomous execution.
-- Story: CC8-001
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- TABLE: command_centre_items
-- Unified inbox for proactive AI-generated items requiring user attention or
-- autonomous execution. Each item is sourced from an agent, enriched by the
-- prioritisation engine, and resolved via Slack HITL or frontend UI.
-- =============================================================================

CREATE TABLE IF NOT EXISTS command_centre_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Item identity
  source_agent        TEXT NOT NULL,          -- e.g. 'morning-brief', 'reengagement', 'pipeline-analysis'
  source_event_id     UUID,                   -- optional reference to the triggering event/execution
  item_type           TEXT NOT NULL,          -- e.g. 'follow_up', 'risk_alert', 'opportunity', 'insight'

  -- Content
  title               TEXT NOT NULL,
  summary             TEXT,
  context             JSONB DEFAULT '{}'::jsonb,

  -- Prioritisation
  priority_score      NUMERIC(5, 2),          -- 0–100, higher = more urgent
  priority_factors    JSONB DEFAULT '{}'::jsonb,
  urgency             TEXT NOT NULL DEFAULT 'normal'
                        CHECK (urgency IN ('critical', 'high', 'normal', 'low')),
  due_date            TIMESTAMPTZ,

  -- Enrichment
  enrichment_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (enrichment_status IN ('pending', 'enriched', 'failed', 'skipped')),
  enrichment_context  JSONB DEFAULT '{}'::jsonb,
  drafted_action      JSONB,                  -- pre-drafted email / task / Slack message ready for approval

  -- Confidence & execution
  confidence_score    NUMERIC(3, 2),          -- 0.00–1.00
  confidence_factors  JSONB DEFAULT '{}'::jsonb,
  requires_human_input TEXT[],               -- list of fields / decisions still needed from the user

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'enriching', 'ready', 'approved', 'executing', 'completed', 'dismissed', 'auto_resolved')),
  resolution_channel  TEXT,                  -- 'slack', 'frontend', 'autonomous'

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  enriched_at         TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,

  -- Grouping / related entities (no FK constraints — tables may vary per environment)
  deal_id             UUID,
  contact_id          UUID,
  parent_item_id      UUID REFERENCES command_centre_items(id) ON DELETE SET NULL
);

-- =============================================================================
-- Indexes: command_centre_items
-- =============================================================================

-- Primary inbox query: items for a user that need attention
CREATE INDEX IF NOT EXISTS idx_cc_user_open
  ON command_centre_items (user_id, status)
  WHERE status IN ('open', 'ready');

-- Enrichment worker: find items pending enrichment
CREATE INDEX IF NOT EXISTS idx_cc_enrichment
  ON command_centre_items (enrichment_status)
  WHERE enrichment_status = 'pending';

-- Priority queue: highest-priority ready items per user
CREATE INDEX IF NOT EXISTS idx_cc_priority
  ON command_centre_items (user_id, priority_score DESC)
  WHERE status = 'ready';

-- Deal grouping: find all CC items related to a deal
CREATE INDEX IF NOT EXISTS idx_cc_deal
  ON command_centre_items (deal_id)
  WHERE deal_id IS NOT NULL;

-- =============================================================================
-- Trigger: updated_at maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION update_command_centre_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_command_centre_items_updated_at ON command_centre_items;
CREATE TRIGGER trg_command_centre_items_updated_at
  BEFORE UPDATE ON command_centre_items
  FOR EACH ROW EXECUTE FUNCTION update_command_centre_items_updated_at();

-- =============================================================================
-- RLS: command_centre_items
-- =============================================================================

ALTER TABLE command_centre_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own items
DROP POLICY IF EXISTS "Users can view own items" ON command_centre_items;
CREATE POLICY "Users can view own items"
  ON command_centre_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own items (approve / dismiss / snooze)
DROP POLICY IF EXISTS "Users can update own items" ON command_centre_items;
CREATE POLICY "Users can update own items"
  ON command_centre_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own items (e.g. manually created items)
DROP POLICY IF EXISTS "Users can insert own items" ON command_centre_items;
CREATE POLICY "Users can insert own items"
  ON command_centre_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Service role has full access (edge functions / orchestrator agents)
DROP POLICY IF EXISTS "Service role full access" ON command_centre_items;
CREATE POLICY "Service role full access"
  ON command_centre_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Table and column comments
-- =============================================================================

COMMENT ON TABLE command_centre_items IS
  'Unified proactive AI inbox. Each row represents one actionable item generated by an agent (morning brief, reengagement, pipeline analysis, etc.). Items flow through enrichment, prioritisation, HITL approval, and finally execution or auto-resolution.';

COMMENT ON COLUMN command_centre_items.source_agent IS
  'Identifier of the agent that created this item, e.g. morning-brief, reengagement, pipeline-analysis.';
COMMENT ON COLUMN command_centre_items.source_event_id IS
  'Optional UUID reference to the workflow_execution, trigger event, or fleet job that originated this item.';
COMMENT ON COLUMN command_centre_items.item_type IS
  'Semantic type of the item, e.g. follow_up, risk_alert, opportunity, insight, meeting_prep.';
COMMENT ON COLUMN command_centre_items.priority_score IS
  'Composite priority score 0–100 computed by the prioritisation engine. Higher = more urgent.';
COMMENT ON COLUMN command_centre_items.priority_factors IS
  'JSON breakdown of what contributed to priority_score: {deal_value, recency, signal_strength, ...}.';
COMMENT ON COLUMN command_centre_items.urgency IS
  'Human-readable urgency band derived from priority_score: critical, high, normal, low.';
COMMENT ON COLUMN command_centre_items.enrichment_status IS
  'State of the enrichment pipeline: pending → enriching → enriched | failed | skipped.';
COMMENT ON COLUMN command_centre_items.enrichment_context IS
  'Raw enrichment data gathered (CRM context, contact history, deal timeline, etc.).';
COMMENT ON COLUMN command_centre_items.drafted_action IS
  'Pre-drafted action payload ready for HITL review: {type, subject, body, recipients, ...}.';
COMMENT ON COLUMN command_centre_items.confidence_score IS
  'Agent confidence 0.00–1.00 that this item requires action. Low confidence items may be auto-dismissed.';
COMMENT ON COLUMN command_centre_items.requires_human_input IS
  'Array of field/decision names the agent could not resolve autonomously (e.g. [''recipient_email'', ''tone'']).';
COMMENT ON COLUMN command_centre_items.status IS
  'Lifecycle state: open → enriching → ready → approved → executing → completed | dismissed | auto_resolved.';
COMMENT ON COLUMN command_centre_items.resolution_channel IS
  'How the item was resolved: slack, frontend, or autonomous (no human interaction needed).';
COMMENT ON COLUMN command_centre_items.deal_id IS
  'Optional UUID of the related deal. No FK constraint — deals table may not exist in all environments.';
COMMENT ON COLUMN command_centre_items.contact_id IS
  'Optional UUID of the related contact. No FK constraint — contacts table may not exist in all environments.';
COMMENT ON COLUMN command_centre_items.parent_item_id IS
  'Self-referencing parent for grouping sub-items under a single top-level CC item.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222600001_command_centre_items.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: CC8-001';
  RAISE NOTICE '';
  RAISE NOTICE 'New table:';
  RAISE NOTICE '  command_centre_items — unified AI proactive inbox';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  idx_cc_user_open      — open/ready items per user';
  RAISE NOTICE '  idx_cc_enrichment     — pending enrichment queue';
  RAISE NOTICE '  idx_cc_priority       — priority-sorted ready items per user';
  RAISE NOTICE '  idx_cc_deal           — deal-grouped items';
  RAISE NOTICE '';
  RAISE NOTICE 'Trigger:';
  RAISE NOTICE '  trg_command_centre_items_updated_at — auto-updates updated_at on row change';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS:';
  RAISE NOTICE '  SELECT / UPDATE / INSERT for authenticated (own rows only)';
  RAISE NOTICE '  ALL for service_role';
  RAISE NOTICE '============================================================================';
END $$;
