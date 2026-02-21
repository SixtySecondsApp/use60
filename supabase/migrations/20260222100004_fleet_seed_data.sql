-- =============================================================================
-- PRD-02: Fleet Orchestrator — Seed Data
-- Story: FLT-012
-- =============================================================================
-- Seeds fleet tables with exact copies of hardcoded sequences from
-- eventSequences.ts and intent-to-action mappings from intentActionRegistry.ts.
-- All seeds are platform defaults (org_id IS NULL).
-- =============================================================================

-- =============================================================================
-- 1. Seed fleet_event_routes — 9 platform-default event routes
-- =============================================================================

INSERT INTO fleet_event_routes (org_id, event_type, sequence_key, priority)
VALUES
  (NULL, 'meeting_ended',       'meeting_ended',       0),
  (NULL, 'pre_meeting_90min',   'pre_meeting_90min',   0),
  (NULL, 'email_received',      'email_received',      0),
  (NULL, 'proposal_generation', 'proposal_generation', 0),
  (NULL, 'calendar_find_times', 'calendar_find_times', 0),
  (NULL, 'stale_deal_revival',  'stale_deal_revival',  0),
  (NULL, 'campaign_daily_check','campaign_daily_check', 0),
  (NULL, 'coaching_weekly',     'coaching_weekly',     0),
  (NULL, 'deal_risk_scan',      'deal_risk_scan',      0)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key) DO UPDATE
  SET is_active = true, updated_at = now();


-- =============================================================================
-- 2. Seed fleet_sequence_definitions — 9 sequences from eventSequences.ts
-- =============================================================================

-- meeting_ended: 14 steps with parallel wave execution
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'meeting_ended',
  1,
  '[
    {"skill":"classify-call-type","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":[]},
    {"skill":"extract-action-items","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"critical","available":true,"depends_on":["classify-call-type"]},
    {"skill":"detect-intents","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["classify-call-type"]},
    {"skill":"coaching-micro-feedback","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["classify-call-type"]},
    {"skill":"detect-scheduling-intent","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["detect-intents"]},
    {"skill":"detect-verbal-commitment","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["detect-intents"]},
    {"skill":"extract-pricing-discussion","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["detect-intents"]},
    {"skill":"detect-new-stakeholders","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items"]},
    {"skill":"suggest-next-actions","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items","detect-intents"]},
    {"skill":"draft-followup-email","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items","detect-intents","extract-pricing-discussion"]},
    {"skill":"update-crm-from-meeting","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items"]},
    {"skill":"create-tasks-from-actions","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items","detect-new-stakeholders"]},
    {"skill":"signal-task-processor","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["extract-action-items"]},
    {"skill":"notify-slack-summary","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["suggest-next-actions","draft-followup-email","create-tasks-from-actions","signal-task-processor"]}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- pre_meeting_90min: 5 steps
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'pre_meeting_90min',
  1,
  '[
    {"skill":"enrich-attendees","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":[]},
    {"skill":"pull-crm-history","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["enrich-attendees"]},
    {"skill":"research-company-news","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["enrich-attendees"]},
    {"skill":"generate-briefing","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"critical","available":true,"depends_on":["enrich-attendees","pull-crm-history","research-company-news"]},
    {"skill":"deliver-slack-briefing","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true,"depends_on":["generate-briefing"]}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- email_received: 2 steps (sequential, no depends_on)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'email_received',
  1,
  '[
    {"skill":"classify-email-intent","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"match-to-crm-contact","requires_context":["tier2"],"requires_approval":false,"criticality":"critical","available":true}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- proposal_generation: 4 steps (sequential)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'proposal_generation',
  1,
  '[
    {"skill":"select-proposal-template","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"populate-proposal","requires_context":["tier2","tier3:template"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"generate-custom-sections","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true},
    {"skill":"present-for-review","requires_context":["tier1"],"requires_approval":true,"criticality":"critical","available":true}
  ]'::jsonb,
  '["tier1","tier2","tier3:template"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- calendar_find_times: 3 steps (sequential)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'calendar_find_times',
  1,
  '[
    {"skill":"parse-scheduling-request","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"find-available-slots","requires_context":["tier2"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"present-time-options","requires_context":["tier1"],"requires_approval":true,"criticality":"critical","available":true}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- stale_deal_revival: 4 steps with parallel waves
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'stale_deal_revival',
  1,
  '[
    {"skill":"research-trigger-events","requires_context":["tier2","tier3:news","tier3:linkedin"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":[]},
    {"skill":"analyse-stall-reason","requires_context":["tier2"],"requires_approval":false,"criticality":"critical","available":true,"depends_on":["research-trigger-events"]},
    {"skill":"draft-reengagement","requires_context":["tier1","tier2"],"requires_approval":true,"criticality":"critical","available":true,"depends_on":["analyse-stall-reason"]},
    {"skill":"signal-task-processor","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["analyse-stall-reason"]}
  ]'::jsonb,
  '["tier1","tier2","tier3:news","tier3:linkedin"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- campaign_daily_check: 4 steps (sequential)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'campaign_daily_check',
  1,
  '[
    {"skill":"pull-campaign-metrics","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"classify-replies","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"generate-campaign-report","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"deliver-campaign-slack","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true}
  ]'::jsonb,
  '["tier1"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- coaching_weekly: 4 steps (sequential)
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'coaching_weekly',
  1,
  '[
    {"skill":"aggregate-weekly-metrics","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"correlate-win-loss","requires_context":["tier1","tier2"],"requires_approval":false,"criticality":"best-effort","available":true},
    {"skill":"generate-coaching-digest","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true},
    {"skill":"deliver-coaching-slack","requires_context":["tier1"],"requires_approval":false,"criticality":"critical","available":true}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();

-- deal_risk_scan: 5 steps with parallel waves
INSERT INTO fleet_sequence_definitions (org_id, sequence_key, version, steps, context_requirements)
VALUES (
  NULL,
  'deal_risk_scan',
  1,
  '[
    {"skill":"scan-active-deals","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":[]},
    {"skill":"score-deal-risks","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["scan-active-deals"]},
    {"skill":"generate-risk-alerts","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["score-deal-risks"]},
    {"skill":"deliver-risk-slack","requires_context":["tier1"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["generate-risk-alerts"]},
    {"skill":"signal-task-processor","requires_context":["tier2"],"requires_approval":false,"criticality":"best-effort","available":true,"depends_on":["score-deal-risks"]}
  ]'::jsonb,
  '["tier1","tier2"]'::jsonb
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version) DO UPDATE
  SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, updated_at = now();


-- =============================================================================
-- 3. Seed fleet_handoff_routes — intent-to-action mappings from intentActionRegistry.ts
-- =============================================================================
-- These define handoffs from the meeting_ended sequence's detect-intents step
-- to downstream orchestrator events (proposal_generation, calendar_find_times).

-- send_proposal intent → fires proposal_generation
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'meeting_ended',
  'detect-intents',
  'proposal_generation',
  '{"intent":"send_proposal","confidence_threshold":0.7,"task_type":"follow_up","deliverable_type":"proposal","signal_type":"proposal_requested"}'::jsonb,
  '{"intent":"send_proposal","min_confidence":0.7}'::jsonb,
  0
);

-- schedule_meeting intent → fires calendar_find_times
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'meeting_ended',
  'detect-intents',
  'calendar_find_times',
  '{"intent":"schedule_meeting","confidence_threshold":0.7,"task_type":"follow_up","deliverable_type":"email_draft","signal_type":"meeting_requested"}'::jsonb,
  '{"intent":"schedule_meeting","min_confidence":0.7}'::jsonb,
  0
);

-- pricing_request intent → fires proposal_generation (same target as send_proposal)
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'meeting_ended',
  'detect-intents',
  'proposal_generation',
  '{"intent":"pricing_request","confidence_threshold":0.7,"task_type":"follow_up","deliverable_type":"proposal","signal_type":"pricing_requested","crm_updates":[{"entity":"deal","field":"tags","value_source":"fixed","fixed_value":"Pricing Requested"}]}'::jsonb,
  '{"intent":"pricing_request","min_confidence":0.7}'::jsonb,
  0
);

-- detect-scheduling-intent step can also trigger calendar_find_times
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'meeting_ended',
  'detect-scheduling-intent',
  'calendar_find_times',
  '{"source":"detect-scheduling-intent","auto_schedule":true}'::jsonb,
  '{"has_scheduling_intent":true}'::jsonb,
  0
);

-- stale_deal_revival: analyse-stall-reason can chain to proposal_generation if re-engagement involves proposal
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'stale_deal_revival',
  'analyse-stall-reason',
  'proposal_generation',
  '{"source":"stall-analysis","reengagement_type":"proposal"}'::jsonb,
  '{"recommended_action":"send_proposal"}'::jsonb,
  0
);

-- email_received: classify-email-intent can chain to calendar_find_times for booking requests
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'email_received',
  'classify-email-intent',
  'calendar_find_times',
  '{"source":"email-classification","email_intent":"booking_request"}'::jsonb,
  '{"classification":"booking_request"}'::jsonb,
  0
);

-- deal_risk_scan: score-deal-risks can chain to stale_deal_revival for severely at-risk deals
INSERT INTO fleet_handoff_routes (org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes)
VALUES (
  NULL,
  'deal_risk_scan',
  'score-deal-risks',
  'stale_deal_revival',
  '{"source":"risk-scoring","risk_level":"critical"}'::jsonb,
  '{"risk_score_above":0.8}'::jsonb,
  0
);


-- =============================================================================
-- Verification queries (run manually to confirm counts)
-- =============================================================================
-- SELECT 'fleet_event_routes' AS tbl, count(*) FROM fleet_event_routes WHERE org_id IS NULL;
-- SELECT 'fleet_sequence_definitions' AS tbl, count(*) FROM fleet_sequence_definitions WHERE org_id IS NULL;
-- SELECT 'fleet_handoff_routes' AS tbl, count(*) FROM fleet_handoff_routes WHERE org_id IS NULL;
-- Expected: 9 routes, 9 definitions, 7 handoff routes
