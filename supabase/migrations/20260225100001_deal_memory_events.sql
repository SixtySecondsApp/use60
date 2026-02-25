-- ============================================================================
-- DM-001: Deal Memory Events Table (PRD-DM-001)
-- The Institutional Knowledge Graph — Structured Event Store
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_memory_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id           TEXT        NOT NULL,
  event_type        TEXT        NOT NULL,
  event_category    TEXT        NOT NULL,
  source_type       TEXT        NOT NULL,
  source_id         TEXT,
  source_timestamp  TIMESTAMPTZ NOT NULL,
  summary           TEXT        NOT NULL,
  detail            JSONB       NOT NULL DEFAULT '{}',
  verbatim_quote    TEXT,
  speaker           TEXT,
  confidence        FLOAT       NOT NULL DEFAULT 0.8,
  salience          TEXT        DEFAULT 'medium',
  is_active         BOOLEAN     DEFAULT TRUE,
  superseded_by     UUID        REFERENCES deal_memory_events(id),
  contact_ids       TEXT[]      DEFAULT '{}',
  extracted_by      TEXT        NOT NULL,
  model_used        TEXT,
  credit_cost       FLOAT       DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_dme_salience    CHECK (salience    IN ('high', 'medium', 'low')),
  CONSTRAINT chk_dme_confidence  CHECK (confidence  >= 0 AND confidence <= 1)
);

-- ---------------------------------------------------------------------------
-- Indexes (partial, is_active = TRUE)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_dme_deal_timeline
  ON deal_memory_events (org_id, deal_id, source_timestamp DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_dme_deal_category
  ON deal_memory_events (org_id, deal_id, event_category, source_timestamp DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_dme_org_type
  ON deal_memory_events (org_id, event_type, source_timestamp DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_dme_contacts
  ON deal_memory_events USING GIN (contact_ids)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE deal_memory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_select_deal_memory_events" ON deal_memory_events;
DO $$ BEGIN
  CREATE POLICY "org_members_select_deal_memory_events"
  ON deal_memory_events FOR SELECT
  USING (org_id IN (
    SELECT om.org_id FROM organization_memberships om WHERE om.user_id = auth.uid()
  ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "service_role_all_deal_memory_events" ON deal_memory_events;
DO $$ BEGIN
  CREATE POLICY "service_role_all_deal_memory_events"
  ON deal_memory_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_deal_memory_events_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS deal_memory_events_updated_at ON deal_memory_events;
DROP TRIGGER IF EXISTS deal_memory_events_updated_at ON deal_memory_events;
CREATE TRIGGER deal_memory_events_updated_at
  BEFORE UPDATE ON deal_memory_events
  FOR EACH ROW EXECUTE FUNCTION update_deal_memory_events_updated_at();

-- ---------------------------------------------------------------------------
-- Table and column comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE deal_memory_events IS
  'Structured event store for deal-level institutional knowledge. Each row captures a discrete signal, commitment, objection, or insight extracted from meetings, emails, or CRM activity.';

COMMENT ON COLUMN deal_memory_events.deal_id IS
  'HubSpot deal ID — the primary grouping key for deal memory events.';

COMMENT ON COLUMN deal_memory_events.event_type IS
  'Fine-grained type of event (e.g. commitment_made, objection_raised, champion_identified, budget_confirmed, competitor_mentioned, timeline_slipped).';

COMMENT ON COLUMN deal_memory_events.event_category IS
  'Broad category bucket: commitment, objection, signal, stakeholder, sentiment, competitive, timeline, or commercial.';

COMMENT ON COLUMN deal_memory_events.source_type IS
  'Where this event originated: transcript, email, crm_update, agent_inference, or manual.';

COMMENT ON COLUMN deal_memory_events.confidence IS
  'Model confidence in the extraction, 0.0–1.0. Events below threshold may be filtered from context windows.';

COMMENT ON COLUMN deal_memory_events.salience IS
  'Editorial importance of the event: high, medium, or low. Used to prioritise events when summarising deal context.';

COMMENT ON COLUMN deal_memory_events.is_active IS
  'FALSE when the event has been superseded or manually invalidated. All partial indexes exclude inactive rows.';

COMMENT ON COLUMN deal_memory_events.superseded_by IS
  'Self-referential FK — points to the replacement event when this one is outdated or corrected.';
