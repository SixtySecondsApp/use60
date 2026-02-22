-- ============================================================================
-- CTI-007: Org Learning Fleet Routes (PRD-20)
-- Phase 6: Coaching & Team Intelligence — Fleet Event Routing
-- ============================================================================

-- Fleet event route: org learning weekly batch (Sunday 6am UTC)
INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority, conditions, is_active)
VALUES
  (NULL, 'cron.org_learning_weekly', 'org_learning_batch', 5, NULL, true)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Sequence definition for org learning batch
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements, is_active)
VALUES
  (NULL, 'org_learning_batch', 1, '[
    {
      "skill": "analyse-org-learning",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": [],
      "timeout_ms": 90000
    },
    {
      "skill": "deliver-org-learning-summary",
      "requires_context": ["org_id"],
      "requires_approval": false,
      "criticality": "best-effort",
      "available": true,
      "depends_on": ["analyse-org-learning"],
      "timeout_ms": 15000
    }
  ]'::JSONB,
  '["org_id"]'::JSONB,
  true)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET
  steps      = EXCLUDED.steps,
  is_active  = EXCLUDED.is_active,
  updated_at = NOW();

-- Cron job: org learning weekly (Sunday 6am UTC)
SELECT cron.schedule(
  'org_learning_weekly',
  '0 6 * * 0',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/agent-org-learning',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret')
    ),
    body := '{"mode": "analyse"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
