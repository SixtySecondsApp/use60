-- ============================================================================
-- Migration: Email Signal Intelligence — Fleet Routes & Sequence Definitions
-- Purpose: Wire email signal events into the fleet orchestrator for
--          classification, routing, and downstream action dispatch
-- Story: SIG-005
-- Date: 2026-02-22
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fleet Event Routes
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  -- Inbound email received: classify and extract signals
  (NULL, 'email_received',                        'email_signal_processing',      0, NULL, true),

  -- Meeting request detected: offer available calendar times to the rep
  (NULL, 'email_signal.meeting_request',          'email_signal_calendar_offer',  0, NULL, true),

  -- Silence / no-reply detected: update deal risk score and signal temperature
  (NULL, 'email_signal.silence_detected',         'email_signal_silence_handler', 0, NULL, true),

  -- Email forwarded inside prospect org: log multi-threading signal
  (NULL, 'email_signal.forward_detected',         'email_signal_forward_handler', 0, NULL, true),

  -- Positive buying signal (pricing ask, demo request, etc.): boost temperature
  (NULL, 'email_signal.positive_buying_signal',   'email_signal_boost_handler',   0, NULL, true)

ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Fleet Sequence Definitions
-- ---------------------------------------------------------------------------

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES

  -- -----------------------------------------------------------------
  -- email_signal_processing — 3-step pipeline for every inbound email
  --   Step 1: classify-email-signals  — agent-email-signals function
  --           classifies the email and writes email_signal_events rows
  --   Step 2: route-signal-actions    — dispatch follow-on events
  --           based on classification (meeting_request, silence, etc.)
  --   Step 3: deliver-signal-alerts   — Slack delivery for high-signal
  --           emails requiring rep awareness
  -- -----------------------------------------------------------------
  (NULL, 'email_signal_processing', 1, '[
    {
      "skill": "classify-email-signals",
      "requires_context": ["org_id", "contact_id"],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    },
    {
      "skill": "route-signal-actions",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["classify-email-signals"],
      "timeout_ms": 15000
    },
    {
      "skill": "deliver-signal-alerts",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["route-signal-actions"],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "contact_id"]'::JSONB,
  true),

  -- -----------------------------------------------------------------
  -- email_signal_calendar_offer — 1-step: surface available slots
  --   Triggered when a prospect explicitly requests a meeting.
  --   Calls find-available-slots to present calendar times.
  -- -----------------------------------------------------------------
  (NULL, 'email_signal_calendar_offer', 1, '[
    {
      "skill": "find-available-slots",
      "requires_context": ["org_id", "contact_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "contact_id"]'::JSONB,
  true),

  -- -----------------------------------------------------------------
  -- email_signal_silence_handler — 1-step: update risk + temperature
  --   Triggered when silence is detected (no reply after outbound).
  --   Updates deal_signal_temperature (declining trend) and risk score.
  -- -----------------------------------------------------------------
  (NULL, 'email_signal_silence_handler', 1, '[
    {
      "skill": "score-reengagement-signals",
      "requires_context": ["org_id", "deal_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "deal_id"]'::JSONB,
  true),

  -- -----------------------------------------------------------------
  -- email_signal_forward_handler — 1-step: log multi-threading signal
  --   Triggered when a forwarded email is detected inside the prospect
  --   org. Logs the multi-threading signal to deal_signal_temperature.
  -- -----------------------------------------------------------------
  (NULL, 'email_signal_forward_handler', 1, '[
    {
      "skill": "score-reengagement-signals",
      "requires_context": ["org_id", "deal_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "deal_id"]'::JSONB,
  true),

  -- -----------------------------------------------------------------
  -- email_signal_boost_handler — 1-step: boost deal temperature
  --   Triggered on positive buying signals (pricing inquiry, demo
  --   request, champion escalation, etc.). Bumps signal temperature
  --   and reduces deal risk score.
  -- -----------------------------------------------------------------
  (NULL, 'email_signal_boost_handler', 1, '[
    {
      "skill": "score-reengagement-signals",
      "requires_context": ["org_id", "deal_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 30000
    }
  ]'::JSONB,
  '["org_id", "deal_id"]'::JSONB,
  true)

ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps                = EXCLUDED.steps,
  context_requirements = EXCLUDED.context_requirements,
  is_active            = EXCLUDED.is_active,
  updated_at           = NOW();

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
