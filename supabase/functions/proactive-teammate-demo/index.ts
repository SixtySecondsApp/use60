/**
 * Proactive Teammate Demo — sends demo Block Kit messages to Slack DM
 *
 * Public endpoint (verify_jwt = false) so the demo page can call it directly.
 * Requires userId + orgId in the body to resolve Slack mapping.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Demo Block Kit messages for each pattern
// =============================================================================

function getDemoBlocks(action: string): { blocks: any[]; text: string } {
  switch (action) {
    case 'morning_brief_drafts':
      return {
        text: 'Demo: Ready to Send drafts',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Ready to Send', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — These drafts are based on your recent meetings and deal context._' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: '*Follow-up: Acme Corp — Product Demo Recap*\nHey Sarah, great chatting yesterday about the dashboard migration. I\'ve attached the ROI calculator we discussed and a case study from a similar implementation at CloudFlow.\n\nWould Thursday work for a quick 15-min to walk through the numbers?' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Send', emoji: true }, style: 'primary', action_id: 'demo_send_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Edit', emoji: true }, action_id: 'demo_edit_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, style: 'danger', action_id: 'demo_dismiss_1', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: '*Re-engagement: Zenith Labs — 14 days silent*\nHi Jamie, hope all\'s well! I noticed we haven\'t connected since the pricing discussion on Feb 25th. Happy to jump on a quick call to address any questions from the team.\n\nNo pressure — just want to make sure I\'m not leaving anything unanswered.' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Send', emoji: true }, style: 'primary', action_id: 'demo_send_2', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Edit', emoji: true }, action_id: 'demo_edit_2', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, style: 'danger', action_id: 'demo_dismiss_2', value: 'demo' },
          ]},
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 1: Single Human Gate_' }] },
        ],
      };

    case 'morning_brief_observations':
      return {
        text: 'Demo: Overnight Findings',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Overnight Findings', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — 3 observations from last night\'s deal scan_' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':warning: *Stale Deal: TechFlow Solutions* ($45,000 — Proposal)\n_No activity for 12 days. Last meeting was a pricing discussion on Feb 26th._' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Draft Email', emoji: true }, style: 'primary', action_id: 'demo_draft_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Create Task', emoji: true }, action_id: 'demo_task_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_1', value: 'demo' },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: ':bust_in_silhouette: *Single-Threaded: CloudBase Inc* ($72,000 — Discovery)\n_Only 1 contact (Jamie Lee, Product Manager). No executive sponsor identified._' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'View Deal', emoji: true }, action_id: 'demo_view_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, style: 'danger', action_id: 'demo_dismiss_3', value: 'demo' },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: ':chart_with_downwards_trend: *Stage Regression: NovaTech* ($38,000 — Moved back to Discovery)\n_Deal moved from Proposal to Discovery 2 days ago. This may indicate a reset._' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Draft Email', emoji: true }, action_id: 'demo_draft_2', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_2', value: 'demo' },
          ]},
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 2: Deal Heartbeat_' }] },
        ],
      };

    case 'morning_brief_full':
      return {
        text: 'Demo: Morning Brief',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Good morning! Here\'s your brief', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — Tuesday 11 Mar 2026 — 3 meetings today, 2 drafts ready, 1 deal needs attention_' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':calendar: *Today\'s Meetings*' } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: '*10:00 AM*\nAcme Corp — Discovery call\n:white_check_mark: Prep ready' },
            { type: 'mrkdwn', text: '*2:30 PM*\nDataFlow — Proposal review\n:warning: Needs brief' },
          ]},
          { type: 'section', fields: [
            { type: 'mrkdwn', text: '*4:00 PM*\nNovaTech — Check-in\n:white_check_mark: Prep ready' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':envelope: *2 Drafts Ready to Send*\n1. Follow-up: Acme Corp demo recap\n2. Re-engagement: Zenith Labs (14d silent)' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Review Drafts', emoji: true }, style: 'primary', action_id: 'demo_review', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':eyes: *1 Deal Needs Attention*\n:warning: TechFlow Solutions ($45K) — 12 days stale, no follow-up after pricing discussion' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Draft Follow-up', emoji: true }, action_id: 'demo_draft_3', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_3', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':brain: *Agent Learning*\nAcceptance rate: 87% this week (up from 72%)\nTrust Capital: 78/100 (+6)' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 3: Overnight Work + Morning Triage_' }] },
        ],
      };

    case 'learning_update':
      return {
        text: 'Demo: Agent Learning Update',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Weekly Learning Update', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — Your agent is getting smarter with every interaction_' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':chart_with_upwards_trend: *Acceptance Rate*\nYour agent\'s follow-ups were accepted *87% of the time* this week (up from 72% last week).' } },
          { type: 'section', fields: [
            { type: 'mrkdwn', text: '*Trust Capital*\n78/100 (+6 this week)' },
            { type: 'mrkdwn', text: '*Top Preference*\nShorter emails (92% confidence)' },
            { type: 'mrkdwn', text: '*Drafts This Week*\n15 sent, 2 edited, 1 dismissed' },
            { type: 'mrkdwn', text: '*Auto-Approved*\n4 follow-ups (low-risk)' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':brain: *Preferences Learned*\n• You prefer bullet points over paragraphs\n• Casual greetings ("Hey" not "Dear")\n• Shorter emails — you trim 30% on average\n• No P.S. lines — removed in 8 of 8 edits' } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 4: Sales Learning Loop_' }] },
        ],
      };

    case 'deal_suggestions':
      return {
        text: 'Demo: Deal Improvement Suggestions',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Deal Suggestions: CloudBase Inc ($72K)', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — 3 improvement suggestions for this deal_' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: '`MULTI_THREAD` *Add more stakeholders*\nOnly 1 contact linked (Jamie Lee, PM). Deals with 3+ contacts close 2.3x faster. Consider mapping the org chart.' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Find Contacts', emoji: true }, style: 'primary', action_id: 'demo_find_contacts', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, action_id: 'demo_dismiss_4', value: 'demo' },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: '`EXECUTIVE_SPONSOR` *Find executive sponsor*\nNo C-level or VP contact on this deal. Executive sponsorship increases win rate by 40%.' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Search Org Chart', emoji: true }, style: 'primary', action_id: 'demo_search_org', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, action_id: 'demo_dismiss_5', value: 'demo' },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: '`URGENCY` *Create a compelling event*\n18 days in Discovery with no timeline set. Consider suggesting an evaluation deadline or pilot start date.' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Draft Email', emoji: true }, action_id: 'demo_draft_4', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_4', value: 'demo' },
          ]},
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 5: Deal Improvement Suggestions_' }] },
        ],
      };

    case 'cross_deal_conflict':
      return {
        text: 'Demo: Cross-Deal Conflict Detected',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Cross-Deal Conflict Detected', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — Contact overlap found across active deals_' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':rotating_light: *Contact Overlap: Sarah Chen (VP Engineering)*\n\nAppears in 2 active deals:\n• *Acme Corp* — $120,000, Proposal stage (owned by Andrew)\n• *Acme Labs* — $45,000, Discovery stage (owned by Mike)' } },
          { type: 'section', text: { type: 'mrkdwn', text: ':warning: Both deals had activity in the last 3 days. *High risk of conflicting outreach.*' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'View Both Deals', emoji: true }, style: 'primary', action_id: 'demo_view_deals', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'This is intentional', emoji: true }, action_id: 'demo_intentional', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':office: *Company Overlap: DataFlow Inc*\n\n2 reps working the same company:\n• *DataFlow Enterprise* — $200K (Andrew)\n• *DataFlow Startup Division* — $30K (Sarah)\n\n_Different divisions, but worth coordinating._' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Coordinate', emoji: true }, action_id: 'demo_coordinate', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Dismiss', emoji: true }, action_id: 'demo_dismiss_6', value: 'demo' },
          ]},
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 6: Cross-Deal Awareness_' }] },
        ],
      };

    case 'hygiene_digest':
      return {
        text: 'Demo: Pipeline Hygiene — 6 deals need attention',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Pipeline Hygiene — 6 deals need attention', emoji: true } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '_Demo — Mon 10 Mar 2026 — Hey there, these deals need a nudge or a close._' }] },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':rotating_light: *Overdue Tasks* (2)' } },
          { type: 'section', text: { type: 'mrkdwn', text: '*Zenith Labs* · $28,000 · Proposal\n_3 overdue tasks · 18d since last activity_' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_5', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Re-engage', emoji: true }, style: 'primary', action_id: 'demo_reengage_1', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Close as Lost', emoji: true }, style: 'danger', action_id: 'demo_close_1', value: 'demo' },
          ]},
          { type: 'section', text: { type: 'mrkdwn', text: '*Orion Data* · $15,000 · Discovery\n_1 overdue task · 22d since last activity_' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_6', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Re-engage', emoji: true }, style: 'primary', action_id: 'demo_reengage_2', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Close as Lost', emoji: true }, style: 'danger', action_id: 'demo_close_2', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':construction: *Stuck in Stage (30+ days)* (1)' } },
          { type: 'section', text: { type: 'mrkdwn', text: '*MegaCorp* · $95,000 · Negotiation\n_42d in Negotiation stage · 8d since last activity_' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_7', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Draft Follow-up', emoji: true }, action_id: 'demo_draft_5', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Close as Lost', emoji: true }, style: 'danger', action_id: 'demo_close_3', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':hourglass: *No Activity (14+ days)* (2)' } },
          { type: 'section', text: { type: 'mrkdwn', text: '*TechFlow Solutions* · $45,000 · Proposal\n_14d since last activity_' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_8', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Re-engage', emoji: true }, style: 'primary', action_id: 'demo_reengage_3', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Close as Lost', emoji: true }, style: 'danger', action_id: 'demo_close_4', value: 'demo' },
          ]},
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: ':ghost: *Ghost Risk* (1)' } },
          { type: 'section', text: { type: 'mrkdwn', text: '*Pinnacle Group* · $62,000 · Proposal\n_Ghost probability: 78% · 21d since last activity_' } },
          { type: 'actions', elements: [
            { type: 'button', text: { type: 'plain_text', text: 'Snooze 7d', emoji: true }, action_id: 'demo_snooze_9', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Re-engage', emoji: true }, style: 'primary', action_id: 'demo_reengage_4', value: 'demo' },
            { type: 'button', text: { type: 'plain_text', text: 'Close as Lost', emoji: true }, style: 'danger', action_id: 'demo_close_5', value: 'demo' },
          ]},
          { type: 'context', elements: [{ type: 'mrkdwn', text: ':robot_face: _Proactive Sales Teammate Demo — Pattern 7: Pipeline Hygiene_' }] },
        ],
      };

    default:
      return {
        text: 'Demo: Proactive Sales Teammate',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `Unknown demo action: ${action}` } },
        ],
      };
  }
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { demoAction, userId, orgId } = await req.json();

    if (!demoAction || !userId || !orgId) {
      return new Response(JSON.stringify({ error: 'Missing demoAction, userId, or orgId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve Slack user mapping
    const { data: mapping } = await supabase
      .from('slack_user_mappings')
      .select('slack_user_id, org_id')
      .eq('sixty_user_id', userId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!mapping?.slack_user_id) {
      return new Response(JSON.stringify({ error: 'No Slack mapping found. Connect Slack first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get bot token for the org
    const { data: slackSettings } = await supabase
      .from('slack_org_settings')
      .select('bot_access_token')
      .eq('org_id', orgId)
      .eq('is_connected', true)
      .maybeSingle();

    if (!slackSettings?.bot_access_token) {
      return new Response(JSON.stringify({ error: 'No Slack bot connected for this org.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build and send demo message
    const { blocks, text } = getDemoBlocks(demoAction);

    const result = await sendSlackDM({
      botToken: slackSettings.bot_access_token,
      slackUserId: mapping.slack_user_id,
      blocks,
      text,
      username: '60 Sales Teammate',
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error || 'Slack send failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, channelId: result.channelId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[proactive-teammate-demo] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
