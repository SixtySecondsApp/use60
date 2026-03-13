/**
 * Brain Morning Brief Edge Function (US-030)
 *
 * Unified morning briefing that merges both existing morning briefing systems
 * (slack-morning-brief and agent-morning-briefing) into a single, rich Slack DM.
 *
 * Sections:
 *   1. Auto-executed overnight summary (CC items resolved via auto_exec)
 *   2. Integration alerts (open CC alert items)
 *   3. Follow-ups due today
 *   4. Today's meetings
 *   5. Deal activity (closing this week, at-risk, stale)
 *   6. Overnight events (batched/suppressed notifications)
 *   7. AI priorities (from CC items or skill fallback)
 *
 * Runs daily via cron. Timezone-aware per-user timing. Deduplicates via
 * slack_notifications_sent (1 brief/day).
 *
 * Auth: CRON_SECRET or service-role Bearer token.
 * Deploy: npx supabase functions deploy brain-morning-brief --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getNotificationFeatureSettings,
  getSlackRecipients,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import {
  loadCCBriefItems,
  convertCCItemsToPriorities,
  convertCCItemsToInsights,
} from '../_shared/commandCentre/briefingAdapter.ts';
import type { SlackBlock } from '../_shared/slackBlocks.ts';
import { safeHeaderText, safeMrkdwn, truncate } from '../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// ============================================================================
// Types
// ============================================================================

interface BrainBriefData {
  userName: string;
  date: string;
  currencyCode?: string;
  currencyLocale?: string;
  autoExecItems: Array<{ title: string; summary: string; resolved_at: string }>;
  integrationAlerts: Array<{ title: string; summary: string; source_agent: string }>;
  followUpsDue: Array<{ id: string; title: string; dealName?: string }>;
  meetings: Array<{
    id?: string;
    time: string;
    title: string;
    contactName?: string;
    companyName?: string;
    dealValue?: number;
    dealStage?: string;
  }>;
  deals: Array<{
    id: string;
    name: string;
    value: number;
    stage: string;
    daysUntilClose?: number;
    isAtRisk?: boolean;
    daysSinceActivity?: number;
    deltaTag?: string;
  }>;
  overnightEvents: Array<{ type: string; title: string; summary: string }>;
  priorities: string[];
  insights: string[];
  emailsToRespond: number;
  appUrl: string;
}

// ============================================================================
// Main handler
// ============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
      console.error('[brain-morning-brief] Unauthorized access attempt');
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Optional: single-user mode for testing
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* batch mode */ }
    const targetUserId = body.user_id as string | undefined;

    // Get all orgs with Slack connected
    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({ success: true, message: 'No Slack-connected orgs found', briefsSent: 0 }, req);
    }

    let totalBriefsSent = 0;
    const errors: string[] = [];

    for (const org of slackOrgs) {
      try {
        // Check if morning brief is enabled
        const settings = await getNotificationFeatureSettings(supabase, org.org_id, 'morning_brief');
        if (!settings?.isEnabled) continue;

        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        // Get recipients
        const recipients = await getSlackRecipients(supabase, org.org_id);

        // Get per-user briefing preferences
        const { data: userPrefs } = await supabase
          .from('slack_user_mappings')
          .select('sixty_user_id, preferred_briefing_time, preferred_timezone')
          .eq('org_id', org.org_id)
          .not('sixty_user_id', 'is', null);

        const prefsMap = new Map<string, { time: string; tz: string }>();
        for (const p of userPrefs || []) {
          if (p.sixty_user_id) {
            prefsMap.set(p.sixty_user_id, {
              time: p.preferred_briefing_time || '08:00',
              tz: p.preferred_timezone || 'America/New_York',
            });
          }
        }

        for (const recipient of recipients) {
          try {
            // Filter by target user if specified
            if (targetUserId && recipient.userId !== targetUserId) continue;

            // Check timezone window
            const userPref = prefsMap.get(recipient.userId);
            if (!targetUserId && !isWithinBriefingWindow(userPref?.time || '08:00', userPref?.tz || 'America/New_York')) {
              continue;
            }

            // Dedupe: one brief per day per user
            const shouldSend = await shouldSendNotification(
              supabase, 'morning_brief', org.org_id, recipient.slackUserId, undefined,
            );
            if (!shouldSend && !targetUserId) continue;

            // Assemble the unified brief data
            const briefData = await assembleBrainBrief(
              supabase, org.org_id, recipient.userId,
              recipient.name || recipient.email || 'there',
            );

            if (!briefData) continue; // Nothing to report

            // Build Block Kit blocks
            const blocks = buildBrainBriefBlocks(briefData);

            // Deliver to Slack
            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'morning_brief',
                orgId: org.org_id,
                recipientUserId: recipient.userId,
                recipientSlackUserId: recipient.slackUserId,
                title: `Good morning, ${briefData.userName}!`,
                message: buildFallbackText(briefData),
                blocks,
                actionUrl: `${APP_URL}/command-centre`,
                inAppCategory: 'team',
                inAppType: 'info',
                metadata: {
                  source: 'brain-morning-brief',
                  meetingsCount: briefData.meetings.length,
                  dealsCount: briefData.deals.length,
                  autoExecCount: briefData.autoExecItems.length,
                  alertsCount: briefData.integrationAlerts.length,
                },
              },
              slackSettings.botAccessToken,
            );

            if (slackResult.sent) {
              await recordNotificationSent(
                supabase, 'morning_brief', org.org_id,
                recipient.slackUserId, slackResult.channelId, slackResult.ts, undefined,
              );
              totalBriefsSent++;
            } else {
              errors.push(`Failed to send to ${recipient.email || recipient.userId}: ${slackResult.error}`);
            }

            // Mirror to in-app
            await deliverToInApp(supabase, {
              type: 'morning_brief',
              orgId: org.org_id,
              recipientUserId: recipient.userId,
              recipientSlackUserId: recipient.slackUserId,
              title: `Good morning, ${briefData.userName}!`,
              message: buildFallbackText(briefData),
              actionUrl: `${APP_URL}/command-centre`,
              inAppCategory: 'team',
              inAppType: 'info',
              metadata: { source: 'brain-morning-brief' },
            });
          } catch (userError) {
            console.error(`[brain-morning-brief] Error processing user ${recipient.userId}:`, userError);
            errors.push(`User ${recipient.userId}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
          }
        }
      } catch (orgError) {
        console.error(`[brain-morning-brief] Error processing org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`);
      }
    }

    return jsonResponse({
      success: true,
      briefsSent: totalBriefsSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[brain-morning-brief] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});

// ============================================================================
// Briefing Assembly
// ============================================================================

async function assembleBrainBrief(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  userName: string,
): Promise<BrainBriefData | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get org currency settings
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('currency_code, currency_locale')
    .eq('id', orgId)
    .single();

  // Parallel data fetching
  const [
    meetingsResult,
    overdueResult,
    dueTodayResult,
    dealsResult,
    emailsResult,
    autoExecResult,
    alertsResult,
    batchedResult,
    ccItemsResult,
  ] = await Promise.all([
    // Today's meetings
    supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, contacts:contact_id (id, full_name, companies:company_id (name)), deals:deal_id (id, title, value, stage)')
      .eq('user_id', userId)
      .gte('start_time', today.toISOString())
      .lt('start_time', tomorrow.toISOString())
      .order('start_time', { ascending: true }),

    // Overdue tasks
    supabase
      .from('tasks')
      .select('id, title, due_date, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .lt('due_date', today.toISOString())
      .order('due_date', { ascending: true })
      .limit(10),

    // Due-today tasks (follow-ups)
    supabase
      .from('tasks')
      .select('id, title, deals:deal_id (title)')
      .eq('assigned_to', userId)
      .eq('completed', false)
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString())
      .limit(10),

    // Deals closing this week
    supabase
      .from('deals')
      .select('id, title, value, stage, close_date, health_status')
      .eq('owner_id', userId)
      .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
      .not('close_date', 'is', null)
      .lte('close_date', weekFromNow.toISOString())
      .order('close_date', { ascending: true })
      .limit(5),

    // Emails needing response
    supabase
      .from('email_categorizations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category', 'to_respond')
      .is('responded_at', null),

    // NEW: Auto-executed items overnight (CC items resolved via auto_exec since midnight)
    supabase
      .from('command_centre_items')
      .select('title, summary, resolved_at')
      .eq('user_id', userId)
      .eq('resolution_channel', 'auto_exec')
      .gte('resolved_at', today.toISOString())
      .order('resolved_at', { ascending: false })
      .limit(10),

    // NEW: Open integration alerts
    supabase
      .from('command_centre_items')
      .select('title, summary, source_agent')
      .eq('user_id', userId)
      .eq('item_type', 'alert')
      .eq('status', 'open')
      .order('priority_score', { ascending: false })
      .limit(5),

    // Overnight batched/suppressed notifications (from agent-morning-briefing)
    supabase
      .from('notification_queue')
      .select('id, notification_type, title, message, created_at')
      .eq('user_id', userId)
      .in('triage_status', ['batched', 'suppressed'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10),

    // CC items for AI priorities
    loadCCBriefItems(supabase, userId, 15).catch(() => ({
      critical: [], high: [], normal: [], total: 0,
    })),
  ]);

  // Format auto-exec items
  const autoExecItems = (autoExecResult.data || []).map((item: any) => ({
    title: item.title,
    summary: item.summary || '',
    resolved_at: item.resolved_at,
  }));

  // Format integration alerts
  const integrationAlerts = (alertsResult.data || []).map((item: any) => ({
    title: item.title,
    summary: item.summary || '',
    source_agent: item.source_agent,
  }));

  // Format follow-ups (overdue + due today)
  const followUpsDue = [
    ...(overdueResult.data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      dealName: t.deals?.title,
      isOverdue: true,
    })),
    ...(dueTodayResult.data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      dealName: t.deals?.title,
    })),
  ];

  // Format meetings
  const meetings = (meetingsResult.data || []).map((m: any) => {
    const startTime = new Date(m.start_time);
    const contact = m.contacts?.[0];
    const deal = m.deals?.[0];
    return {
      id: m.id,
      time: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      title: m.title,
      contactName: contact?.full_name,
      companyName: contact?.companies?.name,
      dealValue: deal?.value,
      dealStage: deal?.stage,
    };
  });

  // Format deals
  const deals = (dealsResult.data || []).map((d: any) => {
    const closeDate = d.close_date ? new Date(d.close_date) : null;
    const daysUntilClose = closeDate
      ? Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    return {
      id: d.id,
      name: d.title,
      value: d.value || 0,
      stage: d.stage,
      daysUntilClose,
      isAtRisk: d.health_status === 'at_risk' || d.health_status === 'off_track',
    };
  });

  // Format overnight events
  const overnightEvents = (batchedResult.data || []).map((n: any) => ({
    type: n.notification_type || 'alert',
    title: n.title || 'Notification',
    summary: n.message || '',
  }));

  // Mark batched notifications as delivered
  const batchedIds = (batchedResult.data || []).map((n: any) => n.id).filter(Boolean);
  if (batchedIds.length > 0) {
    await supabase
      .from('notification_queue')
      .update({ triage_status: 'delivered', delivered_at: new Date().toISOString() })
      .in('id', batchedIds);
  }

  // Build priorities from CC items
  let priorities: string[] = [];
  let insights: string[] = [];
  if (ccItemsResult.total >= 3) {
    priorities = convertCCItemsToPriorities(ccItemsResult);
    insights = convertCCItemsToInsights(ccItemsResult);
  }

  // Check if there's anything to report
  const hasContent =
    autoExecItems.length > 0 ||
    integrationAlerts.length > 0 ||
    followUpsDue.length > 0 ||
    meetings.length > 0 ||
    deals.length > 0 ||
    overnightEvents.length > 0 ||
    (emailsResult.count || 0) > 0;

  if (!hasContent) return null;

  return {
    userName,
    date: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    currencyCode: orgRow?.currency_code,
    currencyLocale: orgRow?.currency_locale,
    autoExecItems,
    integrationAlerts,
    followUpsDue,
    meetings,
    deals,
    overnightEvents,
    priorities,
    insights,
    emailsToRespond: emailsResult.count || 0,
    appUrl: APP_URL,
  };
}

// ============================================================================
// Block Kit Builder
// ============================================================================

function buildBrainBriefBlocks(data: BrainBriefData): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const formatCurrency = (amount: number) => {
    if (!data.currencyCode) return `$${amount.toLocaleString()}`;
    return new Intl.NumberFormat(data.currencyLocale || 'en-US', {
      style: 'currency',
      currency: data.currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // ── Header ──
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: safeHeaderText(`Good morning, ${data.userName}`), emoji: false },
  });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `${data.date} | _60 Brain Morning Brief_` }],
  });
  // Marker block for thread reply detection (US-031)
  blocks.push({
    type: 'context',
    block_id: 'brain_morning_brief_marker',
    elements: [{ type: 'mrkdwn', text: 'Reply "more" for details on any section.' }],
  });
  blocks.push({ type: 'divider' });

  // ── Section 1: Auto-executed overnight ──
  if (data.autoExecItems.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Auto-Executed Overnight* (${data.autoExecItems.length} item${data.autoExecItems.length !== 1 ? 's' : ''})\n${
          data.autoExecItems.slice(0, 5).map(item => `  - ${item.title}`).join('\n')
        }${data.autoExecItems.length > 5 ? `\n  _...and ${data.autoExecItems.length - 5} more_` : ''}`),
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Review in CC' },
        url: `${data.appUrl}/command-centre?filter=auto_exec`,
        action_id: 'brain_brief_view_auto_exec',
      }],
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 2: Integration alerts ──
  if (data.integrationAlerts.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Integration Alerts* (${data.integrationAlerts.length})\n${
          data.integrationAlerts.slice(0, 3).map(alert =>
            `  - ${alert.title}${alert.summary ? `: ${truncate(alert.summary, 80)}` : ''}`
          ).join('\n')
        }`),
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Alerts' },
        url: `${data.appUrl}/command-centre?filter=alerts`,
        action_id: 'brain_brief_view_alerts',
      }],
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 3: Follow-ups due ──
  if (data.followUpsDue.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Follow-ups Due* (${data.followUpsDue.length})\n${
          data.followUpsDue.slice(0, 5).map(t => {
            const dealSuffix = t.dealName ? ` — _${t.dealName}_` : '';
            return `  - ${t.title}${dealSuffix}`;
          }).join('\n')
        }${data.followUpsDue.length > 5 ? `\n  _...and ${data.followUpsDue.length - 5} more_` : ''}`),
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Tasks' },
        url: `${data.appUrl}/tasks`,
        action_id: 'brain_brief_view_tasks',
      }],
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 4: Today's meetings ──
  if (data.meetings.length > 0) {
    const meetingLines = data.meetings.slice(0, 5).map(m => {
      let line = `  - *${m.time}* ${m.title}`;
      if (m.contactName) line += ` with ${m.contactName}`;
      if (m.companyName) line += ` (${m.companyName})`;
      if (m.dealValue) line += ` — ${formatCurrency(m.dealValue)}`;
      return line;
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Today's Meetings* (${data.meetings.length})\n${meetingLines.join('\n')}`),
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Open Calendar' },
        url: `${data.appUrl}/calendar`,
        action_id: 'brain_brief_view_calendar',
      }],
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 5: Deal activity ──
  if (data.deals.length > 0) {
    const dealLines = data.deals.slice(0, 5).map(d => {
      let line = `  - *${d.name}* (${d.stage})`;
      if (d.value) line += ` — ${formatCurrency(d.value)}`;
      if (d.daysUntilClose !== undefined && d.daysUntilClose <= 7) {
        line += ` | closes in ${d.daysUntilClose}d`;
      }
      if (d.isAtRisk) line += ' | AT RISK';
      if (d.deltaTag) line += ` | ${d.deltaTag}`;
      return line;
    });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Deal Activity* (${data.deals.length} closing this week)\n${dealLines.join('\n')}`),
      },
    });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View Pipeline' },
        url: `${data.appUrl}/deals`,
        action_id: 'brain_brief_view_pipeline',
      }],
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 6: Overnight events ──
  if (data.overnightEvents.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*Overnight Events* (${data.overnightEvents.length})\n${
          data.overnightEvents.slice(0, 5).map(e =>
            `  - ${e.title}${e.summary ? `: ${truncate(e.summary, 80)}` : ''}`
          ).join('\n')
        }`),
      },
    });
    blocks.push({ type: 'divider' });
  }

  // ── Section 7: AI priorities ──
  if (data.priorities.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: safeMrkdwn(`*AI Priorities*\n${
          data.priorities.slice(0, 3).map((p, i) => `  ${i + 1}. ${p}`).join('\n')
        }`),
      },
    });
  }

  if (data.insights.length > 0) {
    blocks.push({
      type: 'context',
      elements: data.insights.slice(0, 2).map(insight => ({
        type: 'mrkdwn',
        text: truncate(insight, 300),
      })),
    });
  }

  // ── Email count line ──
  if (data.emailsToRespond > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${data.emailsToRespond} email${data.emailsToRespond !== 1 ? 's' : ''} awaiting your response` }],
    });
  }

  // ── Footer actions ──
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open Command Centre' },
        url: `${data.appUrl}/command-centre`,
        action_id: 'brain_brief_open_cc',
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open Dashboard' },
        url: data.appUrl,
        action_id: 'brain_brief_open_dashboard',
      },
    ],
  });

  return blocks;
}

// ============================================================================
// Fallback text (for notification previews)
// ============================================================================

function buildFallbackText(data: BrainBriefData): string {
  const parts: string[] = [`Good morning, ${data.userName}!`];

  if (data.autoExecItems.length > 0) {
    parts.push(`${data.autoExecItems.length} auto-executed overnight.`);
  }
  if (data.integrationAlerts.length > 0) {
    parts.push(`${data.integrationAlerts.length} alert${data.integrationAlerts.length !== 1 ? 's' : ''}.`);
  }
  if (data.meetings.length > 0) {
    parts.push(`${data.meetings.length} meeting${data.meetings.length !== 1 ? 's' : ''} today.`);
  }
  if (data.followUpsDue.length > 0) {
    parts.push(`${data.followUpsDue.length} follow-up${data.followUpsDue.length !== 1 ? 's' : ''} due.`);
  }
  if (data.deals.length > 0) {
    parts.push(`${data.deals.length} deal${data.deals.length !== 1 ? 's' : ''} closing this week.`);
  }

  return parts.join(' ');
}

// ============================================================================
// Timing
// ============================================================================

function isWithinBriefingWindow(preferredTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const userNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const userHour = userNow.getHours();
    const userMinute = userNow.getMinutes();

    const [prefHour, prefMinute] = preferredTime.split(':').map(Number);

    const userMinutes = userHour * 60 + userMinute;
    const prefMinutes = prefHour * 60 + prefMinute;
    const diff = Math.abs(userMinutes - prefMinutes);

    return diff <= 7 || diff >= (24 * 60 - 7);
  } catch (e) {
    console.warn(`[brain-morning-brief] Invalid timezone ${timezone}, defaulting to allow:`, e);
    return true;
  }
}
