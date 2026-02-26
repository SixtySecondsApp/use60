/**
 * Agent Morning Briefing Edge Function
 *
 * Triage-aware morning briefing that assembles batched/suppressed notifications
 * from the last 24 hours, combines with deals/calendar/tasks data, and generates
 * a natural-language briefing in the user's persona tone via Haiku.
 *
 * This complements the existing slack-morning-brief by:
 * - Including triage-batched items that were suppressed overnight
 * - Using agent_persona tone for natural language generation
 * - Writing to both Slack DM and agent_activity feed
 *
 * Runs via cron at user-configured times (from agent_persona.morning_briefing_time).
 *
 * Story: AOA-005
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { sendSlackDM } from '../_shared/proactive/deliverySlack.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

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
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Optional: process a single user (for first-run or manual trigger)
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* batch mode */ }
    const targetUserId = body.user_id as string | undefined;

    // Find users who have morning briefing enabled and it's their briefing time
    const { data: personas } = await supabase
      .from('agent_persona')
      .select('user_id, org_id, agent_name, tone, custom_instructions, morning_briefing_time, timezone, focus_areas')
      .eq('morning_briefing_enabled', true);

    if (!personas?.length && !targetUserId) {
      return jsonResponse({ processed: 0, message: 'No users with morning briefing enabled' }, req);
    }

    const usersToProcess = targetUserId
      ? (personas || []).filter(p => p.user_id === targetUserId)
      : (personas || []).filter(p => isWithinBriefingWindow(p.morning_briefing_time, p.timezone));

    let processed = 0;
    const errors: string[] = [];

    for (const persona of usersToProcess) {
      try {
        const briefing = await assembleBriefing(supabase, persona);
        if (!briefing) continue; // Nothing to report

        // Generate natural language briefing via Haiku
        const narrativeBriefing = ANTHROPIC_API_KEY
          ? await generateNarrativeBriefing(briefing, persona)
          : formatFallbackBriefing(briefing, persona);

        // Deliver via Slack DM
        await deliverBriefingToSlack(supabase, persona, narrativeBriefing);

        // Write to agent_activity for in-app feed
        await supabase.rpc('insert_agent_activity', {
          p_user_id: persona.user_id,
          p_org_id: persona.org_id,
          p_sequence_type: 'morning_briefing',
          p_title: `${persona.agent_name || 'Sixty'}'s Morning Briefing`,
          p_summary: narrativeBriefing.substring(0, 500),
          p_metadata: {
            deals_count: briefing.deals.length,
            meetings_count: briefing.meetings.length,
            tasks_count: briefing.tasks.length,
            overnight_alerts: briefing.overnightAlerts.length,
          },
        });

        // Mark batched notifications as delivered
        if (briefing.batchedNotificationIds.length > 0) {
          await supabase
            .from('notification_queue')
            .update({ triage_status: 'delivered', delivered_at: new Date().toISOString() })
            .in('id', briefing.batchedNotificationIds);
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`User ${persona.user_id}: ${msg}`);
        console.error(`[agent-morning-briefing] Error for user ${persona.user_id}:`, err);
      }
    }

    return jsonResponse({ processed, errors: errors.length > 0 ? errors : undefined }, req);
  } catch (err) {
    console.error('[agent-morning-briefing] Unhandled error:', err);
    return errorResponse('Internal server error', req, 500);
  }
});

// ============================================================================
// Briefing Assembly
// ============================================================================

interface BriefingData {
  deals: Array<{ name: string; stage: string; value: number; daysSinceUpdate: number }>;
  meetings: Array<{ title: string; startTime: string; attendees: number; contactName?: string }>;
  tasks: Array<{ title: string; dueDate: string; isOverdue: boolean }>;
  overnightAlerts: Array<{ type: string; title: string; summary: string }>;
  batchedNotificationIds: string[];
}

async function assembleBriefing(
  supabase: any,
  persona: Record<string, any>,
): Promise<BriefingData | null> {
  const userId = persona.user_id;
  const orgId = persona.org_id;
  const focusAreas: string[] = Array.isArray(persona.focus_areas) ? persona.focus_areas : ['pipeline', 'meetings'];
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0];
  const todayEnd = new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000).toISOString();

  // 1. Batched/suppressed notifications from last 24h
  const { data: batchedNotifs } = await supabase
    .from('notification_queue')
    .select('id, notification_type, title, message, metadata, created_at')
    .eq('user_id', userId)
    .in('triage_status', ['batched', 'suppressed'])
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  const overnightAlerts = (batchedNotifs || []).map((n: any) => ({
    type: n.notification_type || 'alert',
    title: n.title,
    summary: n.message,
  }));
  const batchedNotificationIds = (batchedNotifs || []).map((n: any) => n.id);

  // 2. Deals (if pipeline is a focus area)
  let deals: BriefingData['deals'] = [];
  if (focusAreas.includes('pipeline')) {
    const { data: dealData } = await supabase
      .from('deals')
      .select('name, stage, value, updated_at')
      .eq('owner_id', userId)
      .eq('org_id', orgId)
      .in('status', ['open', 'active'])
      .order('value', { ascending: false })
      .limit(10);

    deals = (dealData || []).map((d: any) => ({
      name: d.name,
      stage: d.stage,
      value: d.value || 0,
      daysSinceUpdate: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  // 3. Today's meetings (if meetings is a focus area)
  let meetings: BriefingData['meetings'] = [];
  if (focusAreas.includes('meetings')) {
    const { data: calEvents } = await supabase
      .from('calendar_events')
      .select('title, start_time, attendees_count, metadata')
      .eq('user_id', userId)
      .gte('start_time', today)
      .lt('start_time', todayEnd)
      .gt('attendees_count', 1)
      .order('start_time', { ascending: true })
      .limit(10);

    meetings = (calEvents || []).map((e: any) => ({
      title: e.title,
      startTime: e.start_time,
      attendees: e.attendees_count,
      contactName: e.metadata?.primary_contact_name,
    }));
  }

  // 4. Overdue/due-today tasks
  const { data: taskData } = await supabase
    .from('tasks')
    .select('title, due_date, status')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    .in('status', ['todo', 'in_progress'])
    .lte('due_date', todayEnd)
    .order('due_date', { ascending: true })
    .limit(10);

  const tasks = (taskData || []).map((t: any) => ({
    title: t.title,
    dueDate: t.due_date,
    isOverdue: new Date(t.due_date) < new Date(today),
  }));

  // Check if there's anything to report
  if (deals.length === 0 && meetings.length === 0 && tasks.length === 0 && overnightAlerts.length === 0) {
    return null; // Suppress empty briefing (HEARTBEAT_OK)
  }

  return { deals, meetings, tasks, overnightAlerts, batchedNotificationIds };
}

// ============================================================================
// Narrative Generation
// ============================================================================

async function generateNarrativeBriefing(
  data: BriefingData,
  persona: Record<string, any>,
): Promise<string> {
  const toneInstructions: Record<string, string> = {
    concise: 'Be brief and bullet-pointed. No fluff.',
    conversational: 'Be warm and friendly, like a helpful colleague. Use casual language.',
    direct: 'Be assertive and action-oriented. Lead with the most important item.',
    custom: persona.custom_instructions || 'Be helpful and clear.',
  };

  const tone = toneInstructions[persona.tone] || toneInstructions.concise;
  const agentName = persona.agent_name || 'Sixty';

  const prompt = `You are ${agentName}, an AI sales assistant. Write a morning briefing for a sales rep.

Tone: ${tone}

Today's data:
- ${data.meetings.length} meetings today: ${data.meetings.map(m => `"${m.title}" at ${new Date(m.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`).join(', ') || 'none'}
- ${data.deals.length} active deals (top: ${data.deals.slice(0, 3).map(d => `${d.name} ($${d.value.toLocaleString()}, ${d.daysSinceUpdate}d since update)`).join('; ') || 'none'})
- ${data.tasks.filter(t => t.isOverdue).length} overdue tasks, ${data.tasks.filter(t => !t.isOverdue).length} due today
- ${data.overnightAlerts.length} overnight alerts: ${data.overnightAlerts.slice(0, 3).map(a => a.title).join(', ') || 'none'}

Write a 2-3 paragraph briefing. Start with the most urgent item. End with one actionable recommendation. No headers or bullet points unless tone is concise.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[agent-morning-briefing] Haiku API error:', response.status);
      return formatFallbackBriefing(data, persona);
    }

    const result = await response.json();
    return result.content?.[0]?.text || formatFallbackBriefing(data, persona);
  } catch (err) {
    console.error('[agent-morning-briefing] Haiku call failed:', err);
    return formatFallbackBriefing(data, persona);
  }
}

function formatFallbackBriefing(data: BriefingData, persona: Record<string, any>): string {
  const agentName = persona.agent_name || 'Sixty';
  const lines: string[] = [`Good morning from ${agentName}.`];

  if (data.meetings.length > 0) {
    lines.push(`You have ${data.meetings.length} meeting${data.meetings.length > 1 ? 's' : ''} today.`);
  }

  if (data.tasks.filter(t => t.isOverdue).length > 0) {
    lines.push(`${data.tasks.filter(t => t.isOverdue).length} overdue task${data.tasks.filter(t => t.isOverdue).length > 1 ? 's' : ''} need attention.`);
  }

  if (data.overnightAlerts.length > 0) {
    lines.push(`${data.overnightAlerts.length} overnight alert${data.overnightAlerts.length > 1 ? 's' : ''}: ${data.overnightAlerts.slice(0, 2).map(a => a.title).join(', ')}.`);
  }

  const staleDeal = data.deals.find(d => d.daysSinceUpdate > 7);
  if (staleDeal) {
    lines.push(`Consider updating ${staleDeal.name} — it's been ${staleDeal.daysSinceUpdate} days since last activity.`);
  }

  return lines.join(' ');
}

// ============================================================================
// Delivery
// ============================================================================

async function deliverBriefingToSlack(
  supabase: any,
  persona: Record<string, any>,
  briefing: string,
): Promise<void> {
  // Look up Slack credentials
  const { data: slackOrg } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', persona.org_id)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackOrg?.bot_access_token) return;

  // Look up user's Slack ID
  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', persona.org_id)
    .eq('sixty_user_id', persona.user_id)
    .maybeSingle();

  if (!mapping?.slack_user_id) return;

  const agentName = persona.agent_name || 'Sixty';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${agentName}'s Morning Briefing`, emoji: false },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: briefing },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Dashboard' },
          url: 'https://app.use60.com',
          action_id: 'open_dashboard',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Snooze 1h' },
          action_id: 'snooze_briefing_1h',
        },
      ],
    },
  ];

  await sendSlackDM({
    botToken: slackOrg.bot_access_token,
    slackUserId: mapping.slack_user_id,
    text: `${agentName}'s Morning Briefing`,
    blocks,
  });
}

// ============================================================================
// Timing Helpers
// ============================================================================

function isWithinBriefingWindow(briefingTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const userNow = new Date(now.toLocaleString('en-US', { timeZone: timezone || 'UTC' }));
    const currentMinutes = userNow.getHours() * 60 + userNow.getMinutes();

    const [h, m] = (briefingTime || '08:00').split(':').map(Number);
    const targetMinutes = h * 60 + m;

    // Within a 30-minute window of the target time
    return Math.abs(currentMinutes - targetMinutes) <= 15;
  } catch {
    return false;
  }
}
