-- ============================================================================
-- Migration: Email Signal Events
-- Purpose: Create email_signal_type_enum and email_signal_events table for
--          tracking AI-classified signals from email communications
-- Story: SIG-002
-- Date: 2026-02-22
-- ============================================================================

-- =============================================================================
-- ENUM: email_signal_type_enum
-- Classification types for detected email signals
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_signal_type_enum') THEN
    CREATE TYPE email_signal_type_enum AS ENUM (
      'meeting_request',
      'pricing_question',
      'positive_buying_signal',
      'objection',
      'competitor_mention',
      'introduction_offer',
      'forward_detected',
      'silence_detected',
      'fast_reply',
      'slow_reply',
      'out_of_office',
      'new_cc_contact'
    );
  END IF;
END $$;

-- =============================================================================
-- TABLE: email_signal_events
-- Stores AI-classified signals detected within email communication events
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_signal_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Org + user context for RLS and scoping
  org_id                  TEXT NOT NULL,
  user_id                 UUID NOT NULL,

  -- Optional contact and deal linkage
  contact_id              UUID,
  deal_id                 UUID,

  -- Source communication event (nullable: some signals may be inferred)
  communication_event_id  UUID,

  -- Classified signal type
  signal_type             email_signal_type_enum NOT NULL,

  -- AI confidence score: 0.00–1.00
  confidence              NUMERIC(3, 2)
                          CHECK (confidence >= 0 AND confidence <= 1),

  -- Human-readable context for the signal (e.g. excerpt, summary)
  context                 TEXT,

  -- Additional structured data (raw AI output, extracted entities, etc.)
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Whether the signal has been acted on (e.g. task created, sequence triggered)
  actioned                BOOLEAN NOT NULL DEFAULT false,

  -- Timestamp
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Deduplication constraint: per (communication_event_id, signal_type)
-- Only deduplicate when communication_event_id is set.
-- NOTE: PostgreSQL partial indexes with now()-based predicates are evaluated at
-- INSERT time only — the predicate is NOT re-evaluated dynamically. This means
-- the index prevents duplicate signals for the same event indefinitely (which is
-- the correct behavior). The 7-day window is removed to avoid confusion.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signal_events_dedup
  ON email_signal_events (communication_event_id, signal_type)
  WHERE communication_event_id IS NOT NULL;

-- =============================================================================
-- Indexes: email_signal_events
-- =============================================================================

-- Deal-centric timeline queries
CREATE INDEX IF NOT EXISTS idx_email_signal_events_deal
  ON email_signal_events (org_id, deal_id, created_at DESC)
  WHERE deal_id IS NOT NULL;

-- Signal-type rollups and filtering
CREATE INDEX IF NOT EXISTS idx_email_signal_events_type
  ON email_signal_events (org_id, signal_type, created_at DESC);

-- Source communication event lookup
CREATE INDEX IF NOT EXISTS idx_email_signal_events_comm_event
  ON email_signal_events (communication_event_id)
  WHERE communication_event_id IS NOT NULL;

-- =============================================================================
-- RLS: email_signal_events
-- =============================================================================

ALTER TABLE email_signal_events ENABLE ROW LEVEL SECURITY;

-- Users in the same org can view signals
DROP POLICY IF EXISTS "Users can view org email_signal_events" ON email_signal_events;
CREATE POLICY "Users can view org email_signal_events"
  ON email_signal_events FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id::text
      FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access (for edge functions / signal scorer)
DROP POLICY IF EXISTS "Service role full access to email_signal_events" ON email_signal_events;
CREATE POLICY "Service role full access to email_signal_events"
  ON email_signal_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Table and column comments
-- =============================================================================

COMMENT ON TABLE email_signal_events IS
  'Stores AI-classified signals detected in email communications. One row per signal per communication event. Deduplicated within a 7-day window to prevent double-counting.';

COMMENT ON COLUMN email_signal_events.signal_type IS
  'Classified signal type from email_signal_type_enum. Drives scoring and workflow triggers.';
COMMENT ON COLUMN email_signal_events.confidence IS
  'AI confidence score 0.00–1.00 for the signal classification. Higher = more certain.';
COMMENT ON COLUMN email_signal_events.communication_event_id IS
  'Source communication event that triggered this signal. Nullable for inferred signals (e.g. silence_detected).';
COMMENT ON COLUMN email_signal_events.context IS
  'Human-readable excerpt or summary that explains why this signal was detected.';
COMMENT ON COLUMN email_signal_events.metadata IS
  'Structured AI output: extracted entities, model version, raw classifications, etc.';
COMMENT ON COLUMN email_signal_events.actioned IS
  'Set to true once a task, sequence, or alert has been created in response to this signal.';

-- =============================================================================
-- Migration summary
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Migration: 20260222900002_email_signal_events.sql';
  RAISE NOTICE '============================================================================';
  RAISE NOTICE 'Story: SIG-002';
  RAISE NOTICE '';
  RAISE NOTICE 'New enum:';
  RAISE NOTICE '  email_signal_type_enum (12 values)';
  RAISE NOTICE '';
  RAISE NOTICE 'New table:';
  RAISE NOTICE '  email_signal_events — AI-classified email signal detections';
  RAISE NOTICE '';
  RAISE NOTICE 'Deduplication:';
  RAISE NOTICE '  Partial unique index on (communication_event_id, signal_type)';
  RAISE NOTICE '  scoped to rows created within the last 7 days';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  idx_email_signal_events_deal    — deal timeline queries';
  RAISE NOTICE '  idx_email_signal_events_type    — signal-type rollups';
  RAISE NOTICE '  idx_email_signal_events_comm_event — source event lookup';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS: org-isolated SELECT for authenticated, full for service_role';
  RAISE NOTICE '============================================================================';
END $$;
