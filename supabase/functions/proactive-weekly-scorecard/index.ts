/**
 * Proactive Weekly Scorecard Edge Function
 *
 * SLK-018: Weekly agent scorecard — aggregates weekly activity and sends DM.
 *
 * Runs as a cron job every Friday afternoon. For each user with Slack connected:
 * 1. Aggregates notifications sent, HITL approvals, and command analytics
 * 2. Calculates emails drafted/approved, meetings prepped, deals flagged
 * 3. Estimates time saved and sends a scorecard DM via Slack
 *
 * Can also be invoked manually with { action: 'send', userId, orgId } for a
 * single user, or the default cron mode processes all connected orgs.
 *
 * @see docs/PRD_PROACTIVE_AI_TEAMMATE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { shouldSendNotification, recordNotificationSent } from '../_shared/proactive/dedupe.ts';

// ============================================================================
// Types
// ============================================================================

interface WeeklyScorecardStats {
  emailsDrafted: number;
  emailsApproved: number;
  meetingsPrepped: number;
  dealsAlerted: number;
  totalInteractions: number;
  estimatedMinutesSaved: number;
}

interface ScorecardResult {
  userId: string;
  orgId: string;
  sent: boolean;
  stats: WeeklyScorecardStats | null;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

// Time-save heuristics (minutes per action)
const MINUTES_PER_EMAIL = 5;
const MINUTES_PER_MEETING_PREP = 10;
const MINUTES_PER_DEAL_ALERT = 3;

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const { action = 'cron', userId, orgId } = body;

    let response;

    switch (action) {
      case 'cron':
        // Process all connected orgs (default cron mode)
        response = await processAllOrgs(supabase);
        break;

      case 'send':
        // Send scorecard for a single user
        if (!userId || !orgId) {
          throw new Error('userId and orgId required for single send');
        }
        response = await sendSingleScorecard(supabase, userId, orgId);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[weekly-scorecard] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ============================================================================
// Process All Orgs (Cron Mode)
// ============================================================================

async function processAllOrgs(
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; totalSent: number; results: ScorecardResult[] }> {
  console.log('[weekly-scorecard] Starting cron run for all connected orgs...');

  // Get all orgs with Slack connected
  const { data: orgs, error: orgsError } = await supabase
    .from('slack_org_settings')
    .select('org_id, bot_access_token')
    .eq('is_connected', true);

  if (orgsError) {
    throw new Error(`Failed to fetch connected orgs: ${orgsError.message}`);
  }

  if (!orgs || orgs.length === 0) {
    console.log('[weekly-scorecard] No connected orgs found');
    return { success: true, totalSent: 0, results: [] };
  }

  console.log(`[weekly-scorecard] Found ${orgs.length} connected orgs`);

  const results: ScorecardResult[] = [];
  let totalSent = 0;

  for (const org of orgs) {
    // Get all mapped users for this org
    const { data: userMappings, error: mappingsError } = await supabase
      .from('slack_user_mappings')
      .select('sixty_user_id, slack_user_id')
      .eq('org_id', org.org_id);

    if (mappingsError) {
      console.error(`[weekly-scorecard] Failed to fetch mappings for org ${org.org_id}:`, mappingsError.message);
      continue;
    }

    if (!userMappings || userMappings.length === 0) continue;

    for (const mapping of userMappings) {
      const result = await processUserScorecard(
        supabase,
        mapping.sixty_user_id,
        org.org_id,
        org.bot_access_token,
        mapping.slack_user_id,
      );

      results.push(result);
      if (result.sent) totalSent++;
    }
  }

  console.log(`[weekly-scorecard] Complete. ${totalSent} scorecards sent across ${orgs.length} orgs.`);

  return { success: true, totalSent, results };
}

// ============================================================================
// Send Single Scorecard (Manual Trigger)
// ============================================================================

async function sendSingleScorecard(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
): Promise<{ success: boolean; result: ScorecardResult }> {
  // Get Slack bot token for the org
  const { data: slackOrg } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackOrg?.bot_access_token) {
    return {
      success: false,
      result: { userId, orgId, sent: false, stats: null, error: 'No Slack connection for org' },
    };
  }

  // Get user's Slack mapping
  const { data: slackMapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!slackMapping?.slack_user_id) {
    return {
      success: false,
      result: { userId, orgId, sent: false, stats: null, error: 'No Slack user mapping' },
    };
  }

  const result = await processUserScorecard(
    supabase,
    userId,
    orgId,
    slackOrg.bot_access_token,
    slackMapping.slack_user_id,
  );

  return { success: result.sent, result };
}

// ============================================================================
// Process User Scorecard
// ============================================================================

async function processUserScorecard(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  botAccessToken: string,
  slackUserId: string,
): Promise<ScorecardResult> {
  try {
    // Dedupe: check if we already sent a weekly scorecard to this user recently
    const canSend = await shouldSendNotification(
      supabase,
      'coaching_weekly' as any, // Closest existing type — weekly cadence
      orgId,
      userId,
    );

    if (!canSend) {
      console.log(`[weekly-scorecard] Already sent to user ${userId} this week, skipping`);
      return { userId, orgId, sent: false, stats: null, error: 'Deduped — already sent this week' };
    }

    // Aggregate stats for the past 7 days
    const stats = await aggregateWeeklyStats(supabase, userId);

    // Skip if no activity this week
    if (
      stats.emailsDrafted === 0 &&
      stats.meetingsPrepped === 0 &&
      stats.dealsAlerted === 0 &&
      stats.totalInteractions === 0
    ) {
      console.log(`[weekly-scorecard] No activity for user ${userId}, skipping`);
      return { userId, orgId, sent: false, stats };
    }

    // Build and send the scorecard
    const sent = await sendScorecardDM(
      supabase,
      userId,
      orgId,
      botAccessToken,
      slackUserId,
      stats,
    );

    if (sent) {
      // Record the send for dedup
      await recordNotificationSent(
        supabase,
        'coaching_weekly' as any,
        orgId,
        userId,
      );
    }

    return { userId, orgId, sent, stats };
  } catch (err) {
    console.error(`[weekly-scorecard] Failed for user ${userId}:`, err);
    return { userId, orgId, sent: false, stats: null, error: String(err) };
  }
}

// ============================================================================
// Aggregate Weekly Stats
// ============================================================================

async function aggregateWeeklyStats(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<WeeklyScorecardStats> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [notificationsResult, hitlResult, commandsResult] = await Promise.all([
    // Notifications sent to this user
    supabase
      .from('slack_notifications_sent')
      .select('feature')
      .eq('recipient_id', userId)
      .gte('sent_at', oneWeekAgo),

    // HITL approvals for this user
    supabase
      .from('hitl_pending_approvals')
      .select('status, resource_type')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo),

    // Commands/queries from this user
    supabase
      .from('slack_command_analytics')
      .select('command_type')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo),
  ]);

  const notifications = notificationsResult.data || [];
  const hitlItems = hitlResult.data || [];
  const commands = commandsResult.data || [];

  // Emails drafted = HITL items of email type
  const emailsDrafted = hitlItems.filter(
    (h: any) => h.resource_type === 'email_draft' || h.resource_type === 'follow_up',
  ).length;

  // Emails approved = drafted emails that were approved
  const emailsApproved = hitlItems.filter(
    (h: any) =>
      (h.resource_type === 'email_draft' || h.resource_type === 'follow_up') &&
      h.status === 'approved',
  ).length;

  // Meetings prepped = notifications of prep type
  const meetingsPrepped = notifications.filter(
    (n: any) => n.feature === 'meeting_prep' || n.feature === 'pre_meeting_nudge',
  ).length;

  // Deals flagged = deal-related notifications
  const dealsAlerted = notifications.filter(
    (n: any) =>
      n.feature === 'stale_deal_alert' ||
      n.feature === 'deal_momentum_nudge' ||
      n.feature === 'deal_risk_scan',
  ).length;

  const totalInteractions = commands.length;

  // Estimated time saved
  const estimatedMinutesSaved =
    emailsDrafted * MINUTES_PER_EMAIL +
    meetingsPrepped * MINUTES_PER_MEETING_PREP +
    dealsAlerted * MINUTES_PER_DEAL_ALERT;

  return {
    emailsDrafted,
    emailsApproved,
    meetingsPrepped,
    dealsAlerted,
    totalInteractions,
    estimatedMinutesSaved,
  };
}

// ============================================================================
// Send Scorecard DM
// ============================================================================

async function sendScorecardDM(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
  botAccessToken: string,
  slackUserId: string,
  stats: WeeklyScorecardStats,
): Promise<boolean> {
  const hoursSaved = (stats.estimatedMinutesSaved / 60).toFixed(1);
  const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

  // Build scorecard blocks
  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Your Week with 60', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Emails Drafted*\n${stats.emailsDrafted} (${stats.emailsApproved} approved)` },
        { type: 'mrkdwn', text: `*Meetings Prepped*\n${stats.meetingsPrepped}` },
        { type: 'mrkdwn', text: `*Deals Flagged*\n${stats.dealsAlerted}` },
        { type: 'mrkdwn', text: `*Estimated Time Saved*\n~${hoursSaved} hours` },
      ],
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${stats.totalInteractions} total interactions this week` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Full Report', emoji: true },
          url: `${APP_URL}/dashboard`,
          action_id: 'weekly_scorecard_view_report',
          value: 'weekly_report',
          style: 'primary',
        },
      ],
    },
  ];

  const fallbackText =
    `Your week with 60: ${stats.emailsDrafted} emails drafted, ` +
    `${stats.meetingsPrepped} meetings prepped, ~${hoursSaved}h saved`;

  try {
    // Open DM channel
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });
    const openData = await openRes.json();

    if (!openData.ok || !openData.channel?.id) {
      console.error(`[weekly-scorecard] Failed to open DM for user ${userId}:`, openData.error);
      return false;
    }

    const channelId = openData.channel.id;

    // Send scorecard message
    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        blocks,
        text: fallbackText,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const msgData = await msgRes.json();

    if (!msgData.ok) {
      console.error(`[weekly-scorecard] Failed to send message to user ${userId}:`, msgData.error);
      return false;
    }

    console.log(`[weekly-scorecard] Scorecard sent to user ${userId} (channel ${channelId})`);
    return true;
  } catch (err) {
    console.error(`[weekly-scorecard] Failed to send DM to user ${userId}:`, err);
    return false;
  }
}
