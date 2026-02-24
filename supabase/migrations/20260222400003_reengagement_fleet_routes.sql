-- ============================================================================
-- PRD-05/06: Re-engagement Agent — Fleet Routes & Sequence Definitions
-- Stories: REN-007
--
-- Fleet event routes and sequence definitions for the re-engagement agent.
-- Wires two triggers into the fleet orchestrator:
--   1. cron.reengagement_scan  → reengagement_scoring (daily batch)
--   2. deal_closed_lost        → reengagement_watchlist_add (add to watchlist)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Event Routes
-- ---------------------------------------------------------------------------

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  -- Daily cron: run full re-engagement signal scan + scoring pipeline
  (NULL, 'cron.reengagement_scan', 'reengagement_scoring', 0, NULL, true),

  -- Event-driven: when a deal is closed/lost, add it to the watchlist
  (NULL, 'deal_closed_lost', 'reengagement_watchlist_add', 0, NULL, true)

ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Sequence Definitions
-- ---------------------------------------------------------------------------

INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES

  -- -----------------------------------------------------------------
  -- reengagement_scoring — 6-step daily batch pipeline
  --   Step 1: apollo-signal-scan  (parallel with apify-news-scan)
  --   Step 2: apify-news-scan     (parallel with apollo-signal-scan)
  --   Step 3: score-reengagement-signals (waits for both scanners)
  --   Step 4: analyse-stall-reason       (waits for scorer)
  --   Step 5: draft-reengagement         (waits for analyse)
  --   Step 6: deliver-reengagement-slack (waits for draft)
  -- -----------------------------------------------------------------
  (NULL, 'reengagement_scoring', 1, '[
    {
      "skill": "apollo-signal-scan",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 120000
    },
    {
      "skill": "apify-news-scan",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 120000
    },
    {
      "skill": "score-reengagement-signals",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "critical",
      "available": true,
      "depends_on": ["apollo-signal-scan", "apify-news-scan"],
      "timeout_ms": 60000
    },
    {
      "skill": "analyse-stall-reason",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["score-reengagement-signals"],
      "timeout_ms": 60000
    },
    {
      "skill": "draft-reengagement",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["analyse-stall-reason"],
      "timeout_ms": 90000
    },
    {
      "skill": "deliver-reengagement-slack",
      "requires_context": [],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["draft-reengagement"],
      "timeout_ms": 60000
    }
  ]'::JSONB,
  '["org_id"]'::JSONB,
  true),

  -- -----------------------------------------------------------------
  -- reengagement_watchlist_add — 1-step triggered when deal closes/lost
  --   Adds the deal to reengagement_watchlist via research-trigger-events
  --   which already handles watchlist insertion in its adapter.
  -- -----------------------------------------------------------------
  (NULL, 'reengagement_watchlist_add', 1, '[
    {
      "skill": "research-trigger-events",
      "requires_context": [],
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
