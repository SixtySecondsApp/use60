-- ============================================================================
-- Migration: Seed Agent Config Question Templates
-- Purpose: Populate master template library with ~20 contextual questions
--          covering all PRD categories. Also creates the
--          seed_config_questions_for_org() RPC used during onboarding.
-- Story: LEARN-001 (PRD-23 Revised: Progressive Agent Learning)
-- Date: 2026-02-23
-- ============================================================================

-- ============================================================================
-- SEED: agent_config_question_templates
-- ============================================================================

INSERT INTO agent_config_question_templates (
  config_key,
  question_template,
  trigger_event,
  trigger_condition,
  priority,
  category,
  scope,
  options,
  default_value,
  description
) VALUES

-- -----------------------------------------------------------------------
-- Revenue & Pipeline (priority 10-15)
-- -----------------------------------------------------------------------
(
  'pipeline.targets.revenue',
  'What''s your revenue target for this quarter?',
  'morning_briefing_delivered',
  '{"config_not_set": "pipeline.targets.revenue"}',
  10,
  'revenue_pipeline',
  'org',
  NULL,
  NULL,
  'Quarterly revenue target used for pipeline coverage and progress calculations.'
),
(
  'pipeline.targets.coverage_ratio',
  'What pipeline coverage ratio does your team aim for?',
  'morning_briefing_delivered',
  '{"config_not_set": "pipeline.targets.coverage_ratio"}',
  12,
  'revenue_pipeline',
  'org',
  '[{"label":"2x","value":"2"},{"label":"3x (typical)","value":"3"},{"label":"4x","value":"4"},{"label":"5x","value":"5"}]',
  '{"value": "3"}',
  'Pipeline coverage ratio target — pipeline value as a multiple of revenue target.'
),
(
  'pipeline.targets.deals_closed',
  'Do you also track a deals-closed target?',
  'morning_briefing_delivered',
  '{"config_not_set": "pipeline.targets.deals_closed"}',
  15,
  'revenue_pipeline',
  'org',
  '[{"label":"Yes","value":"true"},{"label":"Just revenue","value":"false"}]',
  '{"value": "false"}',
  'Whether the team tracks a separate deals-closed count target alongside revenue.'
),

-- -----------------------------------------------------------------------
-- Daily Rhythm (priority 20-29)
-- -----------------------------------------------------------------------
(
  'daily_rhythm.briefing_time',
  'I sent your morning briefing at 9am. Want me to adjust the time?',
  'morning_briefing_delivered',
  '{"delivery_count_gte": 1}',
  20,
  'daily_rhythm',
  'user',
  '[{"label":"7am","value":"07:00"},{"label":"8am","value":"08:00"},{"label":"9am (current)","value":"09:00"},{"label":"10am","value":"10:00"}]',
  '{"value": "09:00"}',
  'Preferred time for the daily morning briefing delivery.'
),
(
  'daily_rhythm.eod_time',
  'I''ll send your day wrap at 5pm. Does that timing work?',
  'eod_synthesis_delivered',
  '{"delivery_count_gte": 1}',
  21,
  'daily_rhythm',
  'user',
  '[{"label":"4pm","value":"16:00"},{"label":"5pm (current)","value":"17:00"},{"label":"6pm","value":"18:00"}]',
  '{"value": "17:00"}',
  'Preferred time for the end-of-day synthesis delivery.'
),
(
  'daily_rhythm.quiet_hours',
  'Want me to hold non-urgent alerts until morning? I can set quiet hours.',
  'risk_alert_fired',
  '{"config_not_set": "daily_rhythm.quiet_hours"}',
  23,
  'daily_rhythm',
  'user',
  '[{"label":"10pm - 7am","value":"22:00-07:00"},{"label":"9pm - 8am","value":"21:00-08:00"},{"label":"No quiet hours","value":"none"}]',
  '{"value": "none"}',
  'Quiet hours window during which non-urgent alerts are held until morning.'
),
(
  'daily_rhythm.notification_channel',
  'I''m sending updates to Slack DM — is that the best channel?',
  'morning_briefing_delivered',
  '{"delivery_count_gte": 3}',
  25,
  'daily_rhythm',
  'user',
  '[{"label":"Slack DM (current)","value":"slack_dm"},{"label":"Dedicated channel","value":"slack_channel"},{"label":"In-app only","value":"in_app"}]',
  '{"value": "slack_dm"}',
  'Preferred notification channel for agent updates and briefings.'
),
(
  'daily_rhythm.briefing_detail',
  'Want to keep briefings comprehensive, or switch to a summary format?',
  'morning_briefing_delivered',
  '{"delivery_count_gte": 5}',
  29,
  'daily_rhythm',
  'user',
  '[{"label":"Detailed","value":"detailed"},{"label":"Summary","value":"summary"}]',
  '{"value": "detailed"}',
  'Preferred verbosity level for daily briefings.'
),

-- -----------------------------------------------------------------------
-- Agent Behaviour & Autonomy (priority 30-39)
-- -----------------------------------------------------------------------
(
  'autonomy.preset',
  'I''ve suggested several CRM updates and you approved them all. Want me to auto-apply routine updates going forward?',
  'crm_update_approved',
  '{"approval_count_gte": 5}',
  30,
  'agent_behaviour',
  'org',
  '[{"label":"Yes, auto-apply routine","value":"balanced"},{"label":"Keep asking","value":"conservative"}]',
  '{"value": "conservative"}',
  'Agent autonomy preset — conservative (always confirm) vs balanced (auto-apply routine updates).'
),
(
  'agent.pre_meeting_lead_time',
  'I sent your meeting prep 90 minutes before. Was that enough time?',
  'meeting_processed',
  '{"delivery_count_gte": 1}',
  32,
  'agent_behaviour',
  'user',
  '[{"label":"30 min","value":"30"},{"label":"60 min","value":"60"},{"label":"90 min (current)","value":"90"},{"label":"2 hours","value":"120"}]',
  '{"value": "90"}',
  'How far in advance to deliver pre-meeting preparation briefs.'
),
(
  'coaching.digest_frequency',
  'Want coaching digests weekly, fortnightly, or just when significant?',
  'coaching_digest_generated',
  '{"delivery_count_gte": 1}',
  35,
  'agent_behaviour',
  'user',
  '[{"label":"Weekly","value":"weekly"},{"label":"Fortnightly","value":"fortnightly"},{"label":"Only significant","value":"significant_only"}]',
  '{"value": "weekly"}',
  'How often to send coaching digests to the user.'
),
(
  'coaching.digest_day',
  'What day works best for your coaching digest?',
  'coaching_digest_generated',
  '{"delivery_count_gte": 2}',
  38,
  'agent_behaviour',
  'user',
  '[{"label":"Monday","value":"monday"},{"label":"Friday","value":"friday"},{"label":"Wednesday","value":"wednesday"}]',
  '{"value": "friday"}',
  'Preferred day of week to receive coaching digests.'
),

-- -----------------------------------------------------------------------
-- Methodology & Process (priority 40-49)
-- -----------------------------------------------------------------------
(
  'methodology.confirmation',
  'Which sales methodology does your team follow?',
  'meeting_processed',
  '{"config_confidence_below": "high", "config_key": "sales_methodology"}',
  40,
  'methodology',
  'org',
  '[{"label":"MEDDIC","value":"meddic"},{"label":"BANT","value":"bant"},{"label":"SPIN","value":"spin"},{"label":"Challenger","value":"challenger"}]',
  NULL,
  'Primary sales methodology used by the team for deal qualification and progression.'
),
(
  'methodology.qualification_criteria',
  'I''m scoring deals against your methodology. Does this match how your team qualifies?',
  'risk_alert_fired',
  '{"config_set": "sales_methodology"}',
  45,
  'methodology',
  'org',
  '[{"label":"Looks right","value":"confirmed"},{"label":"Needs adjustment","value":"needs_edit"}]',
  NULL,
  'User confirmation that the agent''s inferred methodology scoring matches actual team practice.'
),

-- -----------------------------------------------------------------------
-- Signal & Intelligence (priority 50-59)
-- -----------------------------------------------------------------------
(
  'signals.email_monitoring',
  'I can watch your inbox for buying signals — fast replies, forwards, silence. Turn this on?',
  'morning_briefing_delivered',
  '{"config_not_set": "signals.email_monitoring"}',
  50,
  'signals',
  'user',
  '[{"label":"Yes, enable","value":"true"},{"label":"Not now","value":"false"}]',
  '{"value": "false"}',
  'Whether to monitor the user''s inbox for buying signals and engagement patterns.'
),
(
  'signals.risk_threshold',
  'Want me to only alert on Critical deals, or keep alerting on High too?',
  'risk_alert_fired',
  '{"delivery_count_gte": 1}',
  52,
  'signals',
  'user',
  '[{"label":"Critical only","value":"critical"},{"label":"High + Critical","value":"high"}]',
  '{"value": "high"}',
  'Minimum risk severity level that triggers a deal risk alert.'
),
(
  'signals.reengagement_cooldown',
  'How long after closing a deal should I wait before suggesting re-engagement?',
  'meeting_processed',
  '{"config_not_set": "signals.reengagement_cooldown"}',
  55,
  'signals',
  'org',
  '[{"label":"60 days","value":"60"},{"label":"90 days (default)","value":"90"},{"label":"120 days","value":"120"}]',
  '{"value": "90"}',
  'Number of days after deal close before the agent suggests re-engagement with the contact.'
),
(
  'signals.competitor_watch',
  'Want me to add newly mentioned competitors to the watch list?',
  'meeting_processed',
  '{"config_not_set": "signals.competitor_watch"}',
  58,
  'signals',
  'org',
  '[{"label":"Yes, auto-add","value":"auto"},{"label":"Ask me each time","value":"manual"}]',
  '{"value": "manual"}',
  'Whether to automatically add newly mentioned competitors to the watch list or prompt each time.'
)

ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- FUNCTION: seed_config_questions_for_org
-- Copies all master templates into agent_config_questions for a new org.
-- Called during onboarding when org membership is established.
-- Returns the number of rows inserted.
-- ============================================================================

CREATE OR REPLACE FUNCTION seed_config_questions_for_org(
  p_org_id  UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_count  INTEGER := 0;
  v_user_count INTEGER := 0;
BEGIN
  -- -----------------------------------------------------------------------
  -- Org-scoped questions (user_id = NULL).
  -- NOTE: The unique constraint is (org_id, user_id, config_key).
  -- PostgreSQL treats NULLs as not equal, so ON CONFLICT won't match rows
  -- where user_id IS NULL. We use WHERE NOT EXISTS for idempotency instead.
  -- -----------------------------------------------------------------------
  INSERT INTO agent_config_questions (
    org_id,
    user_id,
    template_id,
    config_key,
    question_text,
    trigger_event,
    trigger_condition,
    priority,
    category,
    scope,
    options,
    status
  )
  SELECT
    p_org_id,
    NULL,
    t.id,
    t.config_key,
    t.question_template,
    t.trigger_event,
    t.trigger_condition,
    t.priority,
    t.category,
    t.scope,
    t.options,
    'pending'
  FROM agent_config_question_templates t
  WHERE t.scope = 'org'
    AND NOT EXISTS (
      SELECT 1
      FROM agent_config_questions q
      WHERE q.org_id    = p_org_id
        AND q.user_id   IS NULL
        AND q.config_key = t.config_key
    );

  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  -- -----------------------------------------------------------------------
  -- User-scoped questions — only when a user_id is supplied.
  -- -----------------------------------------------------------------------
  IF p_user_id IS NOT NULL THEN
    INSERT INTO agent_config_questions (
      org_id,
      user_id,
      template_id,
      config_key,
      question_text,
      trigger_event,
      trigger_condition,
      priority,
      category,
      scope,
      options,
      status
    )
    SELECT
      p_org_id,
      p_user_id,
      t.id,
      t.config_key,
      t.question_template,
      t.trigger_event,
      t.trigger_condition,
      t.priority,
      t.category,
      t.scope,
      t.options,
      'pending'
    FROM agent_config_question_templates t
    WHERE t.scope = 'user'
      AND NOT EXISTS (
        SELECT 1
        FROM agent_config_questions q
        WHERE q.org_id    = p_org_id
          AND q.user_id   = p_user_id
          AND q.config_key = t.config_key
      );

    GET DIAGNOSTICS v_user_count = ROW_COUNT;
  END IF;

  RETURN v_org_count + v_user_count;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_config_questions_for_org TO service_role;
GRANT EXECUTE ON FUNCTION seed_config_questions_for_org TO authenticated;

COMMENT ON FUNCTION seed_config_questions_for_org IS
  'Copies all master templates from agent_config_question_templates into '
  'agent_config_questions for a given org (and optionally a specific user). '
  'Idempotent — skips rows that already exist. Returns total rows inserted. '
  'Called by initialize-onboarding once org membership is established.';
