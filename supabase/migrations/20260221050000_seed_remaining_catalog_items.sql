-- Seed remaining 12 credit_menu catalog items.
-- All inserted as is_active = false (Draft) so admins can review and activate.
-- notetaker_bot: real pricing since MeetingBaaS costs per meeting.
-- ON CONFLICT DO NOTHING makes this re-runnable.

INSERT INTO credit_menu (
  action_id, display_name, description, category, unit,
  cost_low, cost_medium, cost_high, free_with_sub, is_flat_rate, is_active
) VALUES

  -- notetaker_bot: update to real pricing (MeetingBaaS costs us per meeting).
  -- ON CONFLICT ensures existing row is NOT touched if already present;
  -- admins should use the Credit Menu UI to update pricing on the existing row.
  ('notetaker_bot', 'Meeting Notetaker Bot',
   'Deploys an AI bot to join, record, and transcribe meetings automatically.',
   'agents', 'per meeting', 1.0, 2.0, 5.0, false, false, false),

  -- New AI actions
  ('pre_meeting_brief', 'Pre-Meeting Brief',
   'Assembles attendee context, recent activity, and talking-point suggestions before a meeting.',
   'ai_actions', 'per meeting', 0.3, 1.2, 5.0, false, false, false),

  ('transcript_search', 'Transcript Search & Q&A',
   'Semantic search and natural-language Q&A across all recorded meeting transcripts.',
   'ai_actions', 'per query', 0.2, 0.6, 2.5, false, false, false),

  ('deal_proposal', 'Deal Proposal Generation',
   'Drafts a tailored deal proposal document based on CRM data and meeting context.',
   'ai_actions', 'per proposal', 1.0, 2.5, 8.0, false, false, false),

  ('coaching_analysis', 'Meeting Coaching Analysis',
   'Deep-dives into call recordings to highlight talk-time, objection handling, and filler words.',
   'ai_actions', 'per meeting', 0.5, 1.5, 6.0, false, false, false),

  ('deal_intelligence', 'Deal Intelligence Summary',
   'Synthesises all deal activity into a concise intelligence summary for stakeholders.',
   'ai_actions', 'per deal', 0.5, 1.2, 4.5, false, false, false),

  ('lead_qualification', 'Lead Qualification Score',
   'Evaluates inbound leads against ICP criteria and assigns a qualification score.',
   'ai_actions', 'per lead', 0.3, 0.8, 3.0, false, false, false),

  ('competitor_intel', 'Competitor Intelligence',
   'Aggregates competitive mention signals and generates battlecard-style intelligence reports.',
   'ai_actions', 'per report', 0.5, 1.5, 6.0, false, false, false),

  ('deal_rescue_plan', 'Deal Rescue Plan',
   'Generates a step-by-step action plan to revive stalled or at-risk deals.',
   'ai_actions', 'per plan', 0.5, 1.5, 5.0, false, false, false),

  -- New agents
  ('sequence_step_execution', 'Sequence Step Execution',
   'Executes individual steps within automated outreach and nurture sequences.',
   'agents', 'per step', 0.3, 0.8, 3.0, false, false, false),

  -- New integrations (flat rate)
  ('slack_notification', 'Slack Notification Send',
   'Dispatches pipeline alerts, win/loss notifications, and HITL approvals via Slack.',
   'integrations', 'per message', 0.1, 0.1, 0.1, false, true, false),

  ('hubspot_sync', 'HubSpot Full Sync',
   'Performs a full bi-directional sync of contacts, deals, and activities with HubSpot.',
   'integrations', 'per sync', 0.2, 0.2, 0.2, false, true, false)

ON CONFLICT (action_id) DO NOTHING;
