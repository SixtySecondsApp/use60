-- Standard SOP Library — Platform Defaults
-- PRD-12: SOP-002
-- Seeds 4 platform-default SOPs (idempotent via ON CONFLICT DO NOTHING)
--
-- Platform defaults use a sentinel org_id that satisfies the FK:
-- We insert with a fixed UUID that is guaranteed not to collide with real orgs.
-- The is_platform_default flag ensures they are readable by all users.
-- The org_id constraint is satisfied by referencing a reserved platform org.

-- Use a DO block so we can use variables and handle the FK gracefully.
DO $$
DECLARE
  v_platform_org_id UUID;
  v_noshow_id UUID;
  v_competitor_id UUID;
  v_proposal_id UUID;
  v_champion_id UUID;
BEGIN
  -- Resolve or create a platform-level sentinel organisation used only for defaults.
  -- This org will never appear in normal org listings.
  SELECT id INTO v_platform_org_id
  FROM organizations
  WHERE name = '__platform_defaults__'
  LIMIT 1;

  IF v_platform_org_id IS NULL THEN
    INSERT INTO organizations (name)
    VALUES ('__platform_defaults__')
    RETURNING id INTO v_platform_org_id;
  END IF;

  -- ============================================================
  -- 1. No-Show Handling
  -- ============================================================
  INSERT INTO custom_sops (
    org_id, name, description, trigger_type, trigger_config,
    is_active, is_platform_default, version, credit_cost_estimate
  )
  VALUES (
    v_platform_org_id,
    'No-Show Handling',
    'Automatically handles meeting no-shows: checks calendar status, drafts a reschedule email, creates a follow-up task, and alerts the rep.',
    'time_based',
    '{
      "delay_minutes": 5,
      "relative_to": "meeting_start",
      "condition": "no_join_detected",
      "description": "5 minutes after scheduled meeting start with no participant join"
    }'::jsonb,
    true,
    true,
    1,
    2.5
  )
  ON CONFLICT (org_id, name, version) DO NOTHING
  RETURNING id INTO v_noshow_id;

  IF v_noshow_id IS NOT NULL THEN
    INSERT INTO sop_steps (sop_id, step_order, action_type, action_config, requires_approval)
    VALUES
      (v_noshow_id, 1, 'crm_action', '{"action": "check_calendar_status", "description": "Verify meeting status and attendee join data"}'::jsonb, false),
      (v_noshow_id, 2, 'draft_email', '{"template": "reschedule_no_show", "subject": "Sorry we missed each other — let''s reschedule", "tone": "empathetic", "description": "Draft a reschedule email to the prospect"}'::jsonb, true),
      (v_noshow_id, 3, 'create_task', '{"title": "Follow up after no-show", "due_days": 1, "priority": "high", "description": "Create a follow-up task for the rep"}'::jsonb, false),
      (v_noshow_id, 4, 'alert_rep', '{"channel": "slack", "message": "Meeting no-show detected. Reschedule draft ready for review.", "description": "Alert the rep via Slack"}'::jsonb, false);
  END IF;

  -- ============================================================
  -- 2. Competitor Mentioned
  -- ============================================================
  INSERT INTO custom_sops (
    org_id, name, description, trigger_type, trigger_config,
    is_active, is_platform_default, version, credit_cost_estimate
  )
  VALUES (
    v_platform_org_id,
    'Competitor Mentioned',
    'Fires when a competitor is mentioned in a call transcript. Logs the mention, enriches competitor intelligence, and alerts the rep with relevant battlecard info.',
    'transcript_phrase',
    '{
      "phrases": ["competitor", "versus", "vs ", "alternative", "switch from", "currently using", "other vendor"],
      "match_mode": "any",
      "case_sensitive": false,
      "description": "Detects competitor mention in meeting transcript"
    }'::jsonb,
    true,
    true,
    1,
    3.0
  )
  ON CONFLICT (org_id, name, version) DO NOTHING
  RETURNING id INTO v_competitor_id;

  IF v_competitor_id IS NOT NULL THEN
    INSERT INTO sop_steps (sop_id, step_order, action_type, action_config, requires_approval)
    VALUES
      (v_competitor_id, 1, 'crm_action', '{"action": "log_competitive_mention", "field": "competitor_mentions", "description": "Log the competitive mention to the CRM deal record"}'::jsonb, false),
      (v_competitor_id, 2, 'enrich_contact', '{"enrich_type": "competitor_intelligence", "description": "Look up competitor information and battlecard data"}'::jsonb, false),
      (v_competitor_id, 3, 'alert_rep', '{"channel": "slack", "message": "Competitor mentioned on call. Battlecard attached.", "include_battlecard": true, "description": "Alert rep with battlecard"}'::jsonb, false);
  END IF;

  -- ============================================================
  -- 3. Proposal Requested
  -- ============================================================
  INSERT INTO custom_sops (
    org_id, name, description, trigger_type, trigger_config,
    is_active, is_platform_default, version, credit_cost_estimate
  )
  VALUES (
    v_platform_org_id,
    'Proposal Requested',
    'Fires when a prospect requests a proposal, pricing, or quote during a meeting. Creates a proposal task, drafts an outline, and alerts the rep.',
    'transcript_phrase',
    '{
      "phrases": ["send me a proposal", "proposal", "pricing", "quote", "how much does it cost", "what''s the price", "can you send over"],
      "match_mode": "any",
      "case_sensitive": false,
      "description": "Detects proposal or pricing request in meeting transcript"
    }'::jsonb,
    true,
    true,
    1,
    2.0
  )
  ON CONFLICT (org_id, name, version) DO NOTHING
  RETURNING id INTO v_proposal_id;

  IF v_proposal_id IS NOT NULL THEN
    INSERT INTO sop_steps (sop_id, step_order, action_type, action_config, requires_approval)
    VALUES
      (v_proposal_id, 1, 'create_task', '{"title": "Prepare and send proposal", "due_days": 2, "priority": "high", "description": "Create high-priority proposal task"}'::jsonb, false),
      (v_proposal_id, 2, 'draft_email', '{"template": "proposal_outline", "subject": "Proposal outline for [Company]", "description": "Draft a proposal outline email"}'::jsonb, true),
      (v_proposal_id, 3, 'alert_rep', '{"channel": "slack", "message": "Proposal requested on call. Task created, draft ready for review.", "description": "Alert rep about proposal request"}'::jsonb, false);
  END IF;

  -- ============================================================
  -- 4. Champion Gone Quiet
  -- ============================================================
  INSERT INTO custom_sops (
    org_id, name, description, trigger_type, trigger_config,
    is_active, is_platform_default, version, credit_cost_estimate
  )
  VALUES (
    v_platform_org_id,
    'Champion Gone Quiet',
    'Fires when a deal champion has had no recorded activity for 14 days. Checks recent activity, drafts a check-in email, and alerts the rep.',
    'time_based',
    '{
      "delay_days": 14,
      "relative_to": "last_champion_activity",
      "condition": "no_activity",
      "description": "14 days since last champion contact activity"
    }'::jsonb,
    true,
    true,
    1,
    2.0
  )
  ON CONFLICT (org_id, name, version) DO NOTHING
  RETURNING id INTO v_champion_id;

  IF v_champion_id IS NOT NULL THEN
    INSERT INTO sop_steps (sop_id, step_order, action_type, action_config, requires_approval)
    VALUES
      (v_champion_id, 1, 'crm_action', '{"action": "check_recent_activity", "contact_role": "champion", "description": "Pull recent activity log for the champion contact"}'::jsonb, false),
      (v_champion_id, 2, 'draft_email', '{"template": "champion_check_in", "tone": "casual_professional", "description": "Draft a warm check-in email to the champion"}'::jsonb, true),
      (v_champion_id, 3, 'alert_rep', '{"channel": "slack", "message": "Champion has gone quiet for 14+ days. Check-in draft ready.", "description": "Alert rep to follow up"}'::jsonb, false);
  END IF;

END $$;
