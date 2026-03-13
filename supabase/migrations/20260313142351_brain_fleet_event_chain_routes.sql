-- Migration: brain_fleet_event_chain_routes
-- Date: 20260313142351
--
-- What this migration does:
--   Seeds fleet_event_routes, fleet_sequence_definitions, and fleet_handoff_routes
--   for the 60 Brain pre-call and post-call event chains.
--
--   Pre-call: calendar_event_created → lead_research → company_analysis → pre_meeting_dossier → notify_user
--   Post-call: meeting_completed → transcript_extraction → action_items → followup_email → crm_update → cc_items
--   Pipeline: deal_stage_changed → risk_rescore → next_actions
--
-- Rollback strategy:
--   DELETE FROM fleet_event_routes WHERE sequence_key IN ('brain_pre_call', 'brain_post_call', 'brain_deal_stage');
--   DELETE FROM fleet_sequence_definitions WHERE sequence_key IN ('brain_pre_call', 'brain_post_call', 'brain_deal_stage');
--   DELETE FROM fleet_handoff_routes WHERE source_sequence_key IN ('brain_pre_call', 'brain_post_call', 'brain_deal_stage');

-- ============================================================
-- US-005: Pre-Call Event Chain
-- ============================================================

-- Event Route: calendar_event_created → brain_pre_call sequence
INSERT INTO fleet_event_routes (event_type, sequence_key, priority, conditions, is_active)
VALUES (
  'calendar_event_created',
  'brain_pre_call',
  50,
  '{"min_attendees": 1}'::jsonb,
  true
)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET priority = 50, is_active = true, updated_at = now();

-- Sequence Definition: pre-call chain
INSERT INTO fleet_sequence_definitions (sequence_key, version, steps, context_requirements, is_active)
VALUES (
  'brain_pre_call',
  1,
  '[
    {
      "skill": "lead-research",
      "label": "Lead Research",
      "depends_on": [],
      "timeout_seconds": 30,
      "retry_count": 1
    },
    {
      "skill": "company-research",
      "label": "Company Analysis",
      "depends_on": [],
      "timeout_seconds": 30,
      "retry_count": 1
    },
    {
      "skill": "meeting-prep-brief",
      "label": "Pre-Meeting Dossier",
      "depends_on": ["lead-research", "company-research"],
      "timeout_seconds": 45,
      "retry_count": 1
    },
    {
      "skill": "cc-notify",
      "label": "Notify User",
      "depends_on": ["meeting-prep-brief"],
      "timeout_seconds": 10,
      "retry_count": 0
    }
  ]'::jsonb,
  '{"contact_id": "optional", "company_id": "optional", "meeting_id": "optional", "start_time": "required"}'::jsonb,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, is_active = true, updated_at = now();

-- ============================================================
-- US-006: Post-Call Event Chain
-- ============================================================

-- Event Route: meeting_completed → brain_post_call sequence
INSERT INTO fleet_event_routes (event_type, sequence_key, priority, conditions, is_active)
VALUES (
  'meeting_completed',
  'brain_post_call',
  50,
  null,
  true
)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET priority = 50, is_active = true, updated_at = now();

-- Sequence Definition: post-call chain
INSERT INTO fleet_sequence_definitions (sequence_key, version, steps, context_requirements, is_active)
VALUES (
  'brain_post_call',
  1,
  '[
    {
      "skill": "meeting-digest-truth-extractor",
      "label": "Transcript & Action Items",
      "depends_on": [],
      "timeout_seconds": 60,
      "retry_count": 1
    },
    {
      "skill": "post-meeting-followup-pack-builder",
      "label": "Follow-Up Email Draft",
      "depends_on": ["meeting-digest-truth-extractor"],
      "timeout_seconds": 45,
      "retry_count": 1
    },
    {
      "skill": "copilot-crm-update",
      "label": "CRM Update",
      "depends_on": ["meeting-digest-truth-extractor"],
      "timeout_seconds": 30,
      "retry_count": 1
    },
    {
      "skill": "cc-notify",
      "label": "CC Items for Approval",
      "depends_on": ["post-meeting-followup-pack-builder", "copilot-crm-update"],
      "timeout_seconds": 10,
      "retry_count": 0
    }
  ]'::jsonb,
  '{"meeting_id": "required", "recording_url": "optional", "deal_id": "optional", "contact_ids": "optional"}'::jsonb,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, is_active = true, updated_at = now();

-- Handoff: post-call CRM update completion → deal risk rescore
INSERT INTO fleet_handoff_routes (source_sequence_key, source_step_skill, target_event_type, context_mapping, is_active)
VALUES (
  'brain_post_call',
  'copilot-crm-update',
  'deal_risk_rescore',
  '{"deal_id": "$.deal_id", "meeting_id": "$.meeting_id"}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Pipeline: Deal Stage Changed Chain
-- ============================================================

-- Event Route: deal_stage_changed → brain_deal_stage sequence
INSERT INTO fleet_event_routes (event_type, sequence_key, priority, conditions, is_active)
VALUES (
  'deal_stage_changed',
  'brain_deal_stage',
  40,
  null,
  true
)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, sequence_key)
DO UPDATE SET priority = 40, is_active = true, updated_at = now();

-- Sequence Definition: deal stage change chain
INSERT INTO fleet_sequence_definitions (sequence_key, version, steps, context_requirements, is_active)
VALUES (
  'brain_deal_stage',
  1,
  '[
    {
      "skill": "deal-risk-scorer",
      "label": "Risk Rescore",
      "depends_on": [],
      "timeout_seconds": 30,
      "retry_count": 1
    },
    {
      "skill": "deal-next-best-actions",
      "label": "Next Best Actions",
      "depends_on": ["deal-risk-scorer"],
      "timeout_seconds": 30,
      "retry_count": 1
    },
    {
      "skill": "cc-notify",
      "label": "Surface to CC Inbox",
      "depends_on": ["deal-next-best-actions"],
      "timeout_seconds": 10,
      "retry_count": 0
    }
  ]'::jsonb,
  '{"deal_id": "required", "old_stage": "optional", "new_stage": "optional"}'::jsonb,
  true
)
ON CONFLICT (sequence_key, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
DO UPDATE SET steps = EXCLUDED.steps, context_requirements = EXCLUDED.context_requirements, is_active = true, updated_at = now();
