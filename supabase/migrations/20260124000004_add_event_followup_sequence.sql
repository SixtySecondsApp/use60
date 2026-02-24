-- Add: seq-event-follow-up sequence for post-event lead nurturing
-- Date: 2026-01-24
-- Story: REL-007
-- Purpose: After attending an event/webinar, identify leads and generate follow-up actions

BEGIN;

-- Insert the event follow-up analysis skill
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'event-followup-analyzer',
  'sales-ai',
  '{
    "name": "Event Follow-Up Analyzer",
    "description": "Analyze event attendees to identify warm leads and generate personalized follow-up recommendations.",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": ["contacts", "event_context"],
    "outputs": ["priority_leads", "followup_recommendations", "email_drafts"],
    "triggers": ["event_completed"],
    "priority": "high"
  }'::jsonb,
  E'# Event Follow-Up Analyzer\n\n## Goal\nAnalyze event attendees to identify warm leads and generate personalized follow-up recommendations.\n\n## Inputs\n- `contacts`: List of contacts who attended the event\n- `event_context`: Details about the event (name, date, topic)\n\n## Output Contract\nReturn a SkillResult with:\n- `data.priority_leads`: array of top leads to follow up with\n  - `contact_id`: string\n  - `name`: string\n  - `company`: string | null\n  - `priority`: "hot" | "warm" | "nurture"\n  - `reason`: string (why they''re a priority)\n  - `engagement_signals`: string[] (questions asked, booth visited, etc.)\n- `data.followup_recommendations`: array of recommended actions\n  - `contact_id`: string\n  - `action_type`: "email" | "call" | "linkedin" | "meeting"\n  - `timing`: "today" | "this_week" | "next_week"\n  - `suggested_message`: string\n- `data.email_drafts`: array of draft emails for top leads\n  - `to`: string (contact email)\n  - `subject`: string\n  - `body`: string\n  - `contact_id`: string\n\n## Guidance\n- Prioritize leads who asked questions or showed strong engagement\n- Personalize follow-ups based on their role and event participation\n- Suggest timely actions (strike while iron is hot)\n- Include specific references to the event in email drafts\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Insert the event follow-up sequence
INSERT INTO platform_skills (skill_key, category, frontmatter, content_template, is_active)
VALUES (
  'seq-event-follow-up',
  'agent-sequence',
  '{
    "name": "Event Follow-Up",
    "description": "After an event, identify priority leads and generate personalized follow-up actions and email drafts.",
    "version": 1,
    "requires_capabilities": ["crm", "tasks"],
    "requires_context": [],
    "outputs": ["contacts", "priority_leads", "followup_recommendations", "task_preview"],
    "triggers": ["user_request", "event_completed"],
    "priority": "high",
    "structured_response_type": "event_followup",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_contacts_needing_attention",
        "input_mapping": {
          "days_since_contact": 14,
          "limit": 25
        },
        "output_key": "contacts",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "skill_key": "event-followup-analyzer",
        "input_mapping": {
          "contacts": "${outputs.contacts}",
          "event_context": "${trigger.params.event_context}"
        },
        "output_key": "analysis",
        "on_failure": "stop"
      },
      {
        "order": 3,
        "action": "create_task",
        "input_mapping": {
          "title": "Follow up with ${outputs.analysis.priority_leads[0].name} from ${trigger.params.event_name}",
          "description": "${outputs.analysis.followup_recommendations[0].suggested_message}",
          "due_date": "tomorrow",
          "priority": "high",
          "contact_id": "${outputs.analysis.priority_leads[0].contact_id}"
        },
        "output_key": "task_preview",
        "requires_approval": true,
        "on_failure": "continue"
      }
    ]
  }'::jsonb,
  E'# Event Follow-Up Sequence\n\nThis sequence helps sales reps follow up effectively after events, webinars, or trade shows.\n\n## Workflow\n1. Get contacts who may have attended the event\n2. Analyze them to identify priority leads\n3. Generate follow-up task (requires confirmation)\n\n## Usage\nTrigger with: "Follow up on [event name] attendees"\nOr: "Who should I contact from yesterday''s webinar?"\n',
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Enable for all orgs
WITH skills AS (
  SELECT
    ps.id AS platform_skill_id,
    ps.skill_key,
    ps.version AS platform_skill_version,
    COALESCE(ps.frontmatter->>'name', ps.skill_key) AS skill_name
  FROM platform_skills ps
  WHERE ps.skill_key IN ('seq-event-follow-up', 'event-followup-analyzer')
    AND ps.is_active = true
)
INSERT INTO organization_skills (
  organization_id,
  skill_id,
  skill_name,
  config,
  ai_generated,
  user_modified,
  is_active,
  is_enabled,
  platform_skill_id,
  platform_skill_version
)
SELECT
  o.id AS organization_id,
  s.skill_key AS skill_id,
  s.skill_name,
  '{}'::jsonb AS config,
  true AS ai_generated,
  false AS user_modified,
  true AS is_active,
  true AS is_enabled,
  s.platform_skill_id,
  s.platform_skill_version
FROM organizations o
CROSS JOIN skills s
WHERE NOT EXISTS (
  SELECT 1 FROM organization_skills os
  WHERE os.organization_id = o.id AND os.skill_id = s.skill_key
)
ON CONFLICT (organization_id, skill_id) DO UPDATE
SET
  is_active = true,
  is_enabled = true,
  platform_skill_id = EXCLUDED.platform_skill_id,
  platform_skill_version = EXCLUDED.platform_skill_version,
  updated_at = now();

COMMIT;
