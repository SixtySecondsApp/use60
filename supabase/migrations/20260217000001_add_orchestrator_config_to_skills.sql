-- Migration: Add orchestrator_config to platform_skills
-- Story: ABIL-001
-- Date: 2026-02-17
-- Purpose: Add orchestrator_config column and seed 9 system sequences

-- =============================================================================
-- Add orchestrator_config column
-- =============================================================================

ALTER TABLE platform_skills
ADD COLUMN IF NOT EXISTS orchestrator_config JSONB DEFAULT NULL;

COMMENT ON COLUMN platform_skills.orchestrator_config IS 'Orchestrator sequence configuration (system sequences only):
{
  "event_type": "meeting_ended|pre_meeting_90min|...",
  "is_system": true,
  "default_enabled": true|false,
  "steps": [
    {
      "skill": "string - adapter registry key",
      "type": "builtin",
      "config": {},
      "requires_context": ["tier1", "tier2", "tier3:news"],
      "requires_approval": false,
      "criticality": "critical|best-effort",
      "depends_on": ["skill-name"]
    }
  ],
  "triggers": [
    {
      "type": "event",
      "config": { "event_type": "meeting_ended" }
    }
  ]
}';

-- =============================================================================
-- Seed 9 System Sequences
-- =============================================================================

-- 1. Meeting Ended (Post-Meeting Debrief)
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-meeting-debrief',
  'Meeting Debrief',
  'Post-meeting analysis sequence: classify call type, extract action items, detect intents, provide coaching, suggest next actions, draft follow-up email, update CRM, create tasks, and send Slack summary',
  'orchestrator-sequence',
  'sequence',
  true,
  '{
    "name": "Meeting Debrief",
    "description": "Post-meeting analysis sequence: classify call type, extract action items, detect intents, provide coaching, suggest next actions, draft follow-up email, update CRM, create tasks, and send Slack summary",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "meeting_ended",
    "is_system": true,
    "default_enabled": true,
    "steps": [
      {
        "skill": "classify-call-type",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "extract-action-items",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": ["classify-call-type"]
      },
      {
        "skill": "detect-intents",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["classify-call-type"]
      },
      {
        "skill": "coaching-micro-feedback",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["classify-call-type"]
      },
      {
        "skill": "suggest-next-actions",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["extract-action-items", "detect-intents"]
      },
      {
        "skill": "draft-followup-email",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["extract-action-items", "detect-intents"]
      },
      {
        "skill": "update-crm-from-meeting",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["extract-action-items"]
      },
      {
        "skill": "create-tasks-from-actions",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["extract-action-items"]
      },
      {
        "skill": "notify-slack-summary",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["suggest-next-actions", "draft-followup-email", "create-tasks-from-actions"]
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "meeting_ended" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 2. Pre-Meeting Briefing (90 minutes before meeting)
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-pre-meeting-briefing',
  'Pre-Meeting Briefing',
  'Pre-meeting preparation sequence: enrich attendees, pull CRM history, research company news, generate AI briefing, and deliver to Slack',
  'orchestrator-sequence',
  'sequence',
  true,
  '{
    "name": "Pre-Meeting Briefing",
    "description": "Pre-meeting preparation sequence: enrich attendees, pull CRM history, research company news, generate AI briefing, and deliver to Slack",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "pre_meeting_90min",
    "is_system": true,
    "default_enabled": true,
    "steps": [
      {
        "skill": "enrich-attendees",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "pull-crm-history",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["enrich-attendees"]
      },
      {
        "skill": "research-company-news",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["enrich-attendees"]
      },
      {
        "skill": "generate-briefing",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": ["enrich-attendees", "pull-crm-history", "research-company-news"]
      },
      {
        "skill": "deliver-slack-briefing",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": ["generate-briefing"]
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "pre_meeting_90min" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 3. Deal Risk Scan (daily cron)
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-deal-risk-scan',
  'Deal Risk Scan',
  'Daily deal health monitoring: scan active deals, score risk levels, generate alerts, and deliver to Slack',
  'orchestrator-sequence',
  'sequence',
  true,
  '{
    "name": "Deal Risk Scan",
    "description": "Daily deal health monitoring: scan active deals, score risk levels, generate alerts, and deliver to Slack",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "deal_risk_scan",
    "is_system": true,
    "default_enabled": true,
    "steps": [
      {
        "skill": "scan-active-deals",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "score-deal-risks",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["scan-active-deals"]
      },
      {
        "skill": "generate-risk-alerts",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["score-deal-risks"]
      },
      {
        "skill": "deliver-risk-slack",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": ["generate-risk-alerts"]
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "deal_risk_scan" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 4. Email Received Handler
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-email-handler',
  'Email Handler',
  'Email processing sequence: classify intent, match to CRM contact, and branch based on classification',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Email Handler",
    "description": "Email processing sequence: classify intent, match to CRM contact, and branch based on classification",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "email_received",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "classify-email-intent",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "match-to-crm-contact",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "email_received" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 5. Proposal Generation
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-proposal-generator',
  'Proposal Generator',
  'Proposal creation sequence: select template, populate with CRM data, generate custom sections, and present for review',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Proposal Generator",
    "description": "Proposal creation sequence: select template, populate with CRM data, generate custom sections, and present for review",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "proposal_generation",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "select-proposal-template",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "populate-proposal",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2", "tier3:template"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "generate-custom-sections",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "present-for-review",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": true,
        "criticality": "critical",
        "depends_on": []
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "proposal_generation" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 6. Calendar Find Times
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-calendar-scheduling',
  'Calendar Scheduling Assistant',
  'Scheduling assistant sequence: parse request, find available slots, and present time options for approval',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Calendar Scheduling Assistant",
    "description": "Scheduling assistant sequence: parse request, find available slots, and present time options for approval",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "calendar_find_times",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "parse-scheduling-request",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "find-available-slots",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "present-time-options",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": true,
        "criticality": "critical",
        "depends_on": []
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "calendar_find_times" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 7. Stale Deal Revival
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-stale-deal-revival',
  'Stale Deal Revival',
  'Re-engagement sequence for stale deals: research trigger events, analyze stall reasons, and draft personalized re-engagement messages',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Stale Deal Revival",
    "description": "Re-engagement sequence for stale deals: research trigger events, analyze stall reasons, and draft personalized re-engagement messages",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "stale_deal_revival",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "research-trigger-events",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2", "tier3:news", "tier3:linkedin"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "analyse-stall-reason",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": ["research-trigger-events"]
      },
      {
        "skill": "draft-reengagement",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": true,
        "criticality": "critical",
        "depends_on": ["analyse-stall-reason"]
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "stale_deal_revival" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 8. Campaign Daily Check
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-campaign-monitor',
  'Campaign Daily Monitor',
  'Daily campaign monitoring: pull metrics, classify replies, generate report, and deliver to Slack',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Campaign Daily Monitor",
    "description": "Daily campaign monitoring: pull metrics, classify replies, generate report, and deliver to Slack",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "campaign_daily_check",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "pull-campaign-metrics",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "classify-replies",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "generate-campaign-report",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "deliver-campaign-slack",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "campaign_daily_check" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;

-- 9. Coaching Weekly Digest
INSERT INTO platform_skills (skill_key, name, description, category, skill_type, is_enabled, frontmatter, orchestrator_config)
VALUES (
  'seq-coaching-digest',
  'Weekly Coaching Digest',
  'Weekly coaching insights: aggregate metrics, correlate win/loss patterns, generate coaching digest, and deliver to Slack',
  'orchestrator-sequence',
  'sequence',
  false,
  '{
    "name": "Weekly Coaching Digest",
    "description": "Weekly coaching insights: aggregate metrics, correlate win/loss patterns, generate coaching digest, and deliver to Slack",
    "category": "orchestrator-sequence",
    "skill_type": "sequence",
    "version": 1
  }'::jsonb,
  '{
    "event_type": "coaching_weekly",
    "is_system": true,
    "default_enabled": false,
    "steps": [
      {
        "skill": "aggregate-weekly-metrics",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "correlate-win-loss",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1", "tier2"],
        "requires_approval": false,
        "criticality": "best-effort",
        "depends_on": []
      },
      {
        "skill": "generate-coaching-digest",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      },
      {
        "skill": "deliver-coaching-slack",
        "type": "builtin",
        "config": {},
        "requires_context": ["tier1"],
        "requires_approval": false,
        "criticality": "critical",
        "depends_on": []
      }
    ],
    "triggers": [
      {
        "type": "event",
        "config": { "event_type": "coaching_weekly" }
      }
    ]
  }'::jsonb
)
ON CONFLICT (skill_key) DO NOTHING;
