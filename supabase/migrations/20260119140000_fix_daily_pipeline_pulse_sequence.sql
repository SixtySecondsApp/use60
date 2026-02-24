-- Fix sequence-daily-pipeline-pulse to use actions instead of non-existent skills
-- The original definition used "pipeline-pull" which doesn't exist
-- This migration updates it to use the action-based approach like other working sequences

BEGIN;

-- Insert or update the platform_skills entry for sequence-daily-pipeline-pulse
INSERT INTO platform_skills (
  skill_key,
  category,
  frontmatter,
  content_template,
  version,
  is_active
)
VALUES (
  'sequence-daily-pipeline-pulse',
  'agent-sequence',
  '{
    "name": "Daily Pipeline Pulse",
    "description": "Morning briefing that surfaces deals needing attention, recommended actions, and pipeline risks.",
    "version": 1,
    "requires_capabilities": ["crm"],
    "requires_context": [],
    "outputs": ["pipeline_deals", "at_risk_deals", "pipeline_summary", "pulse_analysis"],
    "triggers": ["user_request", "cron_0730_weekdays", "daily_standup"],
    "priority": "high",
    "sequence_steps": [
      {
        "order": 1,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "closing_soon",
          "period": "this_week",
          "include_health": true,
          "limit": 15
        },
        "output_key": "pipeline_deals",
        "on_failure": "continue"
      },
      {
        "order": 2,
        "action": "get_pipeline_deals",
        "input_mapping": {
          "filter": "at_risk",
          "include_health": true,
          "limit": 10
        },
        "output_key": "at_risk_deals",
        "on_failure": "continue"
      },
      {
        "order": 3,
        "action": "get_pipeline_summary",
        "input_mapping": {},
        "output_key": "pipeline_summary",
        "on_failure": "continue"
      },
      {
        "order": 4,
        "skill_key": "daily-pipeline-pulse-analysis",
        "input_mapping": {
          "pipeline_deals": "${outputs.pipeline_deals}",
          "at_risk_deals": "${outputs.at_risk_deals}",
          "pipeline_summary": "${outputs.pipeline_summary}"
        },
        "output_key": "pulse_analysis",
        "on_failure": "continue"
      }
    ]
  }'::jsonb,
  '# Daily Pipeline Pulse Analysis

You are analyzing the user''s pipeline to create a morning briefing. You have been provided with:
- Active deals closing soon
- At-risk deals requiring attention
- Overall pipeline summary

## Instructions

1. **Pipeline Health Overview**: Summarize the overall pipeline health
2. **Priority Deals**: Identify 3-5 deals that need immediate attention today
3. **Risk Alerts**: Highlight any deals showing warning signs
4. **Recommended Actions**: Provide 3-5 specific actions for today
5. **Quick Wins**: Identify any easy wins that could be closed quickly

## Output Format

Return a JSON object with:
- `summary`: Brief 1-2 sentence overview
- `priority_deals`: Array of deal names/amounts needing attention
- `risk_alerts`: Array of risk warnings
- `recommended_actions`: Array of specific next steps
- `quick_wins`: Array of potential quick wins
- `metrics`: Key pipeline metrics (total value, deals closing this week, etc.)',
  1,
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  version = platform_skills.version + 1,
  is_active = true,
  updated_at = now();

-- Also create the analysis skill that the sequence uses
INSERT INTO platform_skills (
  skill_key,
  category,
  frontmatter,
  content_template,
  version,
  is_active
)
VALUES (
  'daily-pipeline-pulse-analysis',
  'sales-ai',
  '{
    "name": "Daily Pipeline Pulse Analysis",
    "description": "Analyzes pipeline data to create a morning briefing with priorities and recommended actions.",
    "version": 1,
    "requires_context": ["pipeline_deals", "at_risk_deals", "pipeline_summary"],
    "outputs": ["summary", "priority_deals", "risk_alerts", "recommended_actions", "quick_wins", "metrics"]
  }'::jsonb,
  '# Daily Pipeline Pulse Analysis

You are a sales analyst creating a morning pipeline briefing.

## Context Provided
- `pipeline_deals`: Active deals closing soon with health scores
- `at_risk_deals`: Deals showing risk signals
- `pipeline_summary`: Overall pipeline metrics

## Your Task

Analyze the provided pipeline data and create a concise morning briefing that helps the sales rep prioritize their day.

## Analysis Framework

1. **Identify Urgency**: Which deals need immediate action today?
2. **Spot Patterns**: Are there common risks across multiple deals?
3. **Prioritize by Impact**: Focus on high-value deals first
4. **Actionable Insights**: Every recommendation should be specific and doable today

## Output Requirements

Return a JSON object:
```json
{
  "summary": "Brief 1-2 sentence pipeline health overview",
  "priority_deals": [
    {"name": "Deal Name", "amount": 50000, "reason": "Closing Friday, no activity in 5 days"}
  ],
  "risk_alerts": [
    {"deal": "Deal Name", "risk": "Champion went silent", "severity": "high"}
  ],
  "recommended_actions": [
    {"action": "Call John at Acme", "deal": "Acme Enterprise", "priority": 1}
  ],
  "quick_wins": [
    {"deal": "Small Co", "reason": "Verbal yes, just needs contract sent"}
  ],
  "metrics": {
    "total_pipeline_value": 500000,
    "deals_closing_this_week": 3,
    "at_risk_count": 2,
    "healthy_count": 8
  }
}
```',
  1,
  true
)
ON CONFLICT (skill_key)
DO UPDATE SET
  category = EXCLUDED.category,
  frontmatter = EXCLUDED.frontmatter,
  content_template = EXCLUDED.content_template,
  version = platform_skills.version + 1,
  is_active = true,
  updated_at = now();

-- Enable the sequence and analysis skill for all organizations
WITH skills AS (
  SELECT
    ps.id AS platform_skill_id,
    ps.skill_key,
    ps.version AS platform_skill_version,
    COALESCE(ps.frontmatter->>'name', INITCAP(REPLACE(ps.skill_key, '-', ' '))) AS skill_name
  FROM platform_skills ps
  WHERE ps.skill_key IN ('sequence-daily-pipeline-pulse', 'daily-pipeline-pulse-analysis')
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
ON CONFLICT (organization_id, skill_id)
DO UPDATE SET
  skill_name = EXCLUDED.skill_name,
  is_active = true,
  is_enabled = true,
  platform_skill_id = EXCLUDED.platform_skill_id,
  platform_skill_version = EXCLUDED.platform_skill_version,
  updated_at = now();

COMMIT;
