// supabase/functions/slack-daily-digest/index.ts
// Posts Daily Standup Digest to Slack - triggered by cron or manual call

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { buildDailyDigestMessage, type DailyDigestData } from '../_shared/slackBlocks.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';
import { logAICostEvent, checkCreditBalance } from '../_shared/costTracking.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let s = String(text).trim();

  // Strip fenced code blocks: ```json ... ``` or ``` ... ```
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/```$/m, '').trim();
  }

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1).trim();
  return null;
}

interface OrgDigestData {
  orgId: string;
  teamName: string;
  botToken: string;
  channelId?: string | null;
  timezone: string;
  digestDate?: string; // YYYY-MM-DD (UTC-based window)
  isTest?: boolean;
  deliveryMethod: 'channel' | 'dm' | 'both';
  requestUserId?: string | null;
}

/**
 * Structure for storing digest analyses (org and per-user)
 */
interface DigestAnalysis {
  org_id: string;
  digest_date: string; // YYYY-MM-DD
  digest_type: 'org' | 'user';
  user_id?: string | null;
  timezone: string;
  window_start: string;
  window_end: string;
  source: string;
  input_snapshot: Record<string, unknown>;
  highlights: Record<string, unknown>;
  rendered_text: string;
  slack_message?: { blocks: unknown[]; text: string } | null;
  delivery?: { channelId?: string; ts?: string; status: string; error?: string } | null;
}

type DayWindow = { startIso: string; endIso: string; dateLabel: string; date: Date };

function getDayWindow(dateStr: string | undefined | null, timezone: string): DayWindow {
  // NOTE: We interpret YYYY-MM-DD as a UTC day window (00:00Z..00:00Z+1).
  // This is deterministic and avoids timezone parsing pitfalls in edge runtime.
  // Display formatting still respects the org timezone via formatDate/formatTime.
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      startIso: d.toISOString(),
      endIso: end.toISOString(),
      dateLabel: formatDate(d, timezone),
      date: d,
    };
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateLabel: formatDate(start, timezone),
    date: start,
  };
}

/**
 * Format date for display
 */
function formatDate(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

/**
 * Format time for display
 */
function formatTime(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  } catch {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

async function getOrgMoneyConfig(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ currencyCode: string; currencyLocale: string }> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('currency_code, currency_locale')
      .eq('id', orgId)
      .single();

    const currencyCode = ((data as any)?.currency_code as string | null | undefined) || 'GBP';
    const currencyLocale =
      ((data as any)?.currency_locale as string | null | undefined) ||
      (currencyCode === 'USD'
        ? 'en-US'
        : currencyCode === 'EUR'
          ? 'en-IE'
          : currencyCode === 'AUD'
            ? 'en-AU'
            : currencyCode === 'CAD'
              ? 'en-CA'
              : 'en-GB');

    return { currencyCode: currencyCode.toUpperCase(), currencyLocale };
  } catch {
    return { currencyCode: 'GBP', currencyLocale: 'en-GB' };
  }
}

/**
 * Get meetings for the selected day window
 */
async function getTodaysMeetings(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMappings: Map<string, string>,
  window: DayWindow,
  timezone: string
): Promise<DailyDigestData['meetings']> {
  try {
    const { data: meetings, error } = await supabase
      .from('calendar_events')
      .select(`
        id,
        title,
        start_time,
        user_id,
        profiles:user_id (
          full_name,
          email
        )
      `)
      .eq('org_id', orgId)
      .gte('start_time', window.startIso)
      .lt('start_time', window.endIso)
      .order('start_time', { ascending: true });

    if (error || !meetings) return [];

    return meetings.map((m) => {
      const profile = m.profiles as { full_name?: string; email?: string } | null;
      const userName = profile?.full_name || profile?.email || 'Unknown';
      return {
        time: formatTime(m.start_time, timezone),
        userName,
        slackUserId: userMappings.get(m.user_id),
        title: m.title || 'Untitled Meeting',
      };
    });
  } catch {
    return [];
  }

}

/**
 * Get overdue tasks for an org
 */
async function getOverdueTasks(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMappings: Map<string, string>,
  window: DayWindow
): Promise<DailyDigestData['overdueTasks']> {
  const dayStart = new Date(window.startIso);

  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      due_date,
      assigned_to,
      profiles:assigned_to (
        full_name,
        email
      )
    `)
    .eq('org_id', orgId)
    .lt('due_date', window.startIso)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(10);

  if (!tasks) return [];

  return tasks.map((t) => {
    const profile = t.profiles as { full_name?: string; email?: string } | null;
    const userName = profile?.full_name || profile?.email || 'Unknown';
    const daysOverdue = Math.ceil((dayStart.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24));
    return {
      userName,
      slackUserId: userMappings.get((t as any).assigned_to),
      task: t.title,
      daysOverdue,
    };
  });
}

/**
 * Get tasks due today for an org
 */
async function getDueTodayTasks(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userMappings: Map<string, string>,
  window: DayWindow
): Promise<DailyDigestData['dueTodayTasks']> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id,
      title,
      assigned_to,
      profiles:assigned_to (
        full_name,
        email
      )
    `)
    .eq('org_id', orgId)
    .gte('due_date', window.startIso)
    .lt('due_date', window.endIso)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .limit(10);

  if (!tasks) return [];

  return tasks.map((t) => {
    const profile = t.profiles as { full_name?: string; email?: string } | null;
    const userName = profile?.full_name || profile?.email || 'Unknown';
    return {
      userName,
      slackUserId: userMappings.get((t as any).assigned_to),
      task: t.title,
    };
  });
}

/**
 * Get pipeline stats for the week
 */
async function getWeekStats(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<DailyDigestData['weekStats']> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  try {
    // OPTIMIZATION: Run all 4 queries in parallel instead of sequentially
    // This reduces latency from ~4x to ~1x the slowest query
    const [closedDealsRes, meetingsRes, activitiesRes, pipelineRes] = await Promise.all([
      // Get closed deals this week
      supabase
        .from('deals')
        .select('value')
        .eq('org_id', orgId)
        .eq('stage', 'signed')
        .gte('updated_at', weekAgo.toISOString())
        .limit(500), // Safety cap — paginate for orgs with large deal counts

      // Get meeting count this week
      supabase
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', weekAgo.toISOString()),

      // Get activity count this week
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', weekAgo.toISOString()),

      // Get total pipeline value
      supabase
        .from('deals')
        .select('value')
        .eq('org_id', orgId)
        .in('stage', ['sql', 'opportunity', 'verbal'])
        .limit(500), // Safety cap — paginate for orgs with large deal counts
    ]);

    const closedDeals = (!closedDealsRes.error && closedDealsRes.data) ? closedDealsRes.data as any[] : [];
    const pipeline = (!pipelineRes.error && pipelineRes.data) ? pipelineRes.data as any[] : [];

    const dealsCount = closedDeals?.length || 0;
    const dealsValue = closedDeals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;
    const pipelineValue = pipeline?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

    return {
      dealsCount,
      dealsValue,
      meetingsCount: meetingsRes.count || 0,
      activitiesCount: activitiesRes.count || 0,
      pipelineValue,
    };
  } catch {
    return { dealsCount: 0, dealsValue: 0, meetingsCount: 0, activitiesCount: 0, pipelineValue: 0 };
  }
}

/**
 * Get stale deals info
 */
async function getStaleDeals(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ count: number; details: string }> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  let staleDeals: any[] | null = null;
  try {
    const res = await supabase
      .from('deals')
      .select('title, value, stage, updated_at')
      .eq('org_id', orgId)
      .in('stage', ['sql', 'opportunity', 'verbal'])
      .lt('updated_at', twoWeeksAgo.toISOString())
      .order('value', { ascending: false })
      .limit(5);
    staleDeals = (res.error ? null : (res.data as any[] | null)) || null;
  } catch {
    staleDeals = null;
  }

  if (!staleDeals || staleDeals.length === 0) {
    return { count: 0, details: '' };
  }

  const details = staleDeals.map((d) => {
    const daysStale = Math.ceil((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    return `- ${d.title} ($${(d.value || 0).toLocaleString()}, ${d.stage}, ${daysStale} days stale)`;
  }).join('\n');

  return { count: staleDeals.length, details };
}

/**
 * Generate AI insights
 */
async function generateInsights(
  meetingsCount: number,
  overdueCount: number,
  dueTodayCount: number,
  staleDealsCount: number,
  weekStats: DailyDigestData['weekStats'],
  supabase?: ReturnType<typeof createClient>,
  orgId?: string
): Promise<string[]> {
  if (!anthropicApiKey) {
    return ['Review your pipeline for deals needing attention.'];
  }

  // Check credit balance before AI call
  if (supabase && orgId) {
    const creditCheck = await checkCreditBalance(supabase, orgId);
    if (!creditCheck.allowed) {
      console.warn('[slack-daily-digest] Insufficient credits, skipping AI insights');
      return ['Review your pipeline and prioritize follow-ups with stale deals.'];
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        temperature: 0.5,
        system: 'You are a sales operations analyst. Generate 2-3 brief, actionable insights for a team morning digest. Each insight should be one concise sentence. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Generate insights based on:
- Today's meetings: ${meetingsCount}
- Overdue tasks: ${overdueCount}
- Tasks due today: ${dueTodayCount}
- Stale deals (14+ days): ${staleDealsCount}
- Deals closed this week: ${weekStats.dealsCount} ($${weekStats.dealsValue.toLocaleString()})
- Pipeline value: $${weekStats.pipelineValue.toLocaleString()}

Return JSON: { "insights": ["insight1", "insight2"] }`
        }],
      }),
    });

    if (!response.ok) {
      throw new Error('AI API error');
    }

    const result = await response.json();
    const content = result.content[0]?.text;
    const candidate = extractJsonObject(content) ?? content;
    const parsed = JSON.parse(candidate);

    // Log AI cost event (fire-and-forget)
    if (supabase && orgId) {
      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;
      // Use first org member as user_id proxy (digest is org-wide)
      supabase.from('organization_memberships').select('user_id').eq('org_id', orgId).limit(1).maybeSingle()
        .then(({ data }) => {
          if (data?.user_id) {
            logAICostEvent(supabase, data.user_id, orgId, 'anthropic', 'claude-haiku-4-5-20251001', inputTokens, outputTokens, 'content_generation').catch(() => {});
          }
        }).catch(() => {});
    }

    return parsed.insights || [];
  } catch (error) {
    console.error('Error generating insights:', error);
    return ['Review your pipeline and prioritize follow-ups with stale deals.'];
  }
}

/**
 * Post message to Slack
 */
async function postToSlack(
  botToken: string,
  channel: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  return response.json();
}

async function joinChannel(botToken: string, channel: string): Promise<void> {
  const res = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel }),
  });
  const json = await res.json();
  if (!json.ok && json.error !== 'method_not_supported_for_channel_type') {
    throw new Error(json.error || 'Failed to join channel');
  }
}

/**
 * List channels the bot can access
 */
async function listChannels(botToken: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch('https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200', {
    headers: { 'Authorization': `Bearer ${botToken}` },
  });
  const json = await res.json();
  if (!json.ok) return [];
  return (json.channels || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
}

/**
 * Open a DM channel to a Slack user
 */
async function openDm(botToken: string, slackUserId: string): Promise<string> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: slackUserId, return_im: true }),
  });
  const json = await res.json();
  if (!json.ok || !json.channel?.id) {
    throw new Error(json.error || 'Failed to open DM');
  }
  return json.channel.id as string;
}

/**
 * Send a DM to a Slack user (opens DM if needed)
 */
async function sendSlackDM(
  botToken: string,
  slackUserId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string; channelId?: string }> {
  try {
    const dmChannelId = await openDm(botToken, slackUserId);
    const res = await postToSlack(botToken, dmChannelId, message);
    return { ...res, channelId: dmChannelId };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Upsert a digest analysis record
 */
async function upsertDigestAnalysis(
  supabase: ReturnType<typeof createClient>,
  analysis: DigestAnalysis
): Promise<void> {
  // Using ON CONFLICT with the unique index
  const { error } = await supabase
    .from('daily_digest_analyses')
    .upsert(analysis, {
      onConflict: 'org_id,digest_date,digest_type,user_id',
      ignoreDuplicates: false,
    });

  if (error) {
    // Fallback: try update if upsert fails
    console.warn('[upsertDigestAnalysis] Upsert failed, trying manual update:', error);
    
    // Build filter for existing record
    let query = supabase
      .from('daily_digest_analyses')
      .select('id')
      .eq('org_id', analysis.org_id)
      .eq('digest_date', analysis.digest_date)
      .eq('digest_type', analysis.digest_type);
    
    if (analysis.user_id) {
      query = query.eq('user_id', analysis.user_id);
    } else {
      query = query.is('user_id', null);
    }
    
    const { data: existing } = await query.single();
    
    if (existing?.id) {
      // Update existing
      await supabase
        .from('daily_digest_analyses')
        .update({
          timezone: analysis.timezone,
          window_start: analysis.window_start,
          window_end: analysis.window_end,
          source: analysis.source,
          input_snapshot: analysis.input_snapshot,
          highlights: analysis.highlights,
          rendered_text: analysis.rendered_text,
          slack_message: analysis.slack_message,
          delivery: analysis.delivery,
        })
        .eq('id', existing.id);
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('daily_digest_analyses')
        .insert(analysis);
      if (insertError) {
        console.error('[upsertDigestAnalysis] Insert also failed:', insertError);
      }
    }
  }
}

/**
 * Build rendered text from digest data
 */
function buildRenderedText(
  digestData: DailyDigestData,
  digestType: 'org' | 'user',
  userName?: string
): string {
  const lines: string[] = [];
  const header = digestType === 'user'
    ? `# Daily Digest for ${userName || 'User'} - ${digestData.date}`
    : `# Daily Team Digest - ${digestData.teamName} - ${digestData.date}`;
  lines.push(header);
  lines.push('');

  // Stats
  const { weekStats } = digestData;
  lines.push('## Week Stats');
  lines.push(`- Deals Closed: ${weekStats.dealsCount} ($${weekStats.dealsValue.toLocaleString()})`);
  lines.push(`- Pipeline Value: $${weekStats.pipelineValue.toLocaleString()}`);
  lines.push(`- Meetings: ${weekStats.meetingsCount}`);
  lines.push(`- Activities: ${weekStats.activitiesCount}`);
  lines.push('');

  // Meetings
  if (digestData.meetings.length > 0) {
    lines.push('## Today\'s Meetings');
    digestData.meetings.forEach((m) => {
      lines.push(`- ${m.time}: ${m.title} (${m.userName})`);
    });
    lines.push('');
  }

  // Overdue tasks
  if (digestData.overdueTasks.length > 0) {
    lines.push('## Overdue Tasks');
    digestData.overdueTasks.forEach((t) => {
      lines.push(`- ${t.task} (${t.userName}, ${t.daysOverdue} days overdue)`);
    });
    lines.push('');
  }

  // Due today
  if (digestData.dueTodayTasks.length > 0) {
    lines.push('## Due Today');
    digestData.dueTodayTasks.forEach((t) => {
      lines.push(`- ${t.task} (${t.userName})`);
    });
    lines.push('');
  }

  // Insights
  if (digestData.insights.length > 0) {
    lines.push('## AI Insights');
    digestData.insights.forEach((i) => {
      lines.push(`- ${i}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get user mappings for an org
 */
async function getUserMappings(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, slack_user_id')
    .eq('org_id', orgId);

  const map = new Map<string, string>();
  data?.forEach((m) => {
    if (m.sixty_user_id && m.slack_user_id) {
      map.set(m.sixty_user_id, m.slack_user_id);
    }
  });
  return map;
}

/**
 * Get raw meeting and task data with user IDs for per-user grouping
 */
async function getRawDigestData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  window: DayWindow
): Promise<{
  rawMeetings: Array<{ user_id: string; title: string; start_time: string; user_name: string }>;
  rawOverdueTasks: Array<{ assigned_to: string; title: string; due_date: string; user_name: string }>;
  rawDueTodayTasks: Array<{ assigned_to: string; title: string; user_name: string }>;
}> {
  // Get meetings with user_id
  const { data: meetingsData } = await supabase
    .from('calendar_events')
    .select(`id, title, start_time, user_id, profiles:user_id (full_name, email)`)
    .eq('org_id', orgId)
    .gte('start_time', window.startIso)
    .lt('start_time', window.endIso)
    .order('start_time', { ascending: true });

  const rawMeetings = (meetingsData || []).map((m: any) => {
    const profile = m.profiles as { full_name?: string; email?: string } | null;
    return {
      user_id: m.user_id,
      title: m.title || 'Untitled Meeting',
      start_time: m.start_time,
      user_name: profile?.full_name || profile?.email || 'Unknown',
    };
  });

  // Get overdue tasks
  const { data: overdueData } = await supabase
    .from('tasks')
    .select(`id, title, due_date, assigned_to, profiles:assigned_to (full_name, email)`)
    .eq('org_id', orgId)
    .lt('due_date', window.startIso)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(50);

  const rawOverdueTasks = (overdueData || []).map((t: any) => {
    const profile = t.profiles as { full_name?: string; email?: string } | null;
    return {
      assigned_to: t.assigned_to,
      title: t.title,
      due_date: t.due_date,
      user_name: profile?.full_name || profile?.email || 'Unknown',
    };
  });

  // Get due-today tasks
  const { data: dueTodayData } = await supabase
    .from('tasks')
    .select(`id, title, assigned_to, profiles:assigned_to (full_name, email)`)
    .eq('org_id', orgId)
    .gte('due_date', window.startIso)
    .lt('due_date', window.endIso)
    .in('status', ['pending', 'in_progress', 'overdue'])
    .limit(50);

  const rawDueTodayTasks = (dueTodayData || []).map((t: any) => {
    const profile = t.profiles as { full_name?: string; email?: string } | null;
    return {
      assigned_to: t.assigned_to,
      title: t.title,
      user_name: profile?.full_name || profile?.email || 'Unknown',
    };
  });

  return { rawMeetings, rawOverdueTasks, rawDueTodayTasks };
}

/**
 * Process digest for a single org
 */
async function processOrgDigest(
  supabase: ReturnType<typeof createClient>,
  org: OrgDigestData
): Promise<{
  success: boolean;
  orgId: string;
  channelId?: string;
  slackTs?: string;
  dmSentCount?: number;
  dmFailedCount?: number;
  dmSkippedCount?: number;
  error?: string;
}> {
  try {
    const sendToChannel = org.deliveryMethod === 'channel' || org.deliveryMethod === 'both';
    const sendToDm = org.deliveryMethod === 'dm' || org.deliveryMethod === 'both';

    const userMappings = await getUserMappings(supabase, org.orgId);
    const window = getDayWindow(org.digestDate, org.timezone);
    const digestDateStr = window.startIso.slice(0, 10); // YYYY-MM-DD

    // Gather all data (both org-level and raw for per-user grouping)
    const [rawData, weekStats, staleDeals] = await Promise.all([
      getRawDigestData(supabase, org.orgId, window),
      getWeekStats(supabase, org.orgId),
      getStaleDeals(supabase, org.orgId),
    ]);

    const { rawMeetings, rawOverdueTasks, rawDueTodayTasks } = rawData;

    // Convert raw data to DailyDigestData format for org-level digest
    const meetings: DailyDigestData['meetings'] = rawMeetings.map((m) => ({
      time: formatTime(m.start_time, org.timezone),
      userName: m.user_name,
      slackUserId: userMappings.get(m.user_id),
      title: m.title,
    }));

    const dayStart = new Date(window.startIso);
    const overdueTasks: DailyDigestData['overdueTasks'] = rawOverdueTasks.map((t) => ({
      userName: t.user_name,
      slackUserId: userMappings.get(t.assigned_to),
      task: t.title,
      daysOverdue: Math.ceil((dayStart.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
    }));

    const dueTodayTasks: DailyDigestData['dueTodayTasks'] = rawDueTodayTasks.map((t) => ({
      userName: t.user_name,
      slackUserId: userMappings.get(t.assigned_to),
      task: t.title,
    }));

    // Generate AI insights
    const insights = await generateInsights(
      meetings.length,
      overdueTasks.length,
      dueTodayTasks.length,
      staleDeals.count,
      weekStats,
      supabase,
      org.orgId
    );

    const money = await getOrgMoneyConfig(supabase, org.orgId);

    // Build digest data
    const digestData: DailyDigestData = {
      teamName: org.teamName,
      date: window.dateLabel,
      currencyCode: money.currencyCode,
      currencyLocale: money.currencyLocale,
      meetings,
      overdueTasks,
      dueTodayTasks,
      insights,
      weekStats,
      appUrl,
    };

    // Build message (team/org digest)
    const message = buildDailyDigestMessage(digestData);

    // Optional: send org/team digest to channel
    let channelResult: { ok: boolean; ts?: string; error?: string } = { ok: true };
    if (sendToChannel) {
      if (!org.channelId) {
        channelResult = { ok: false, error: 'No channel configured for daily digest' };
      } else {
        channelResult = await postToSlack(org.botToken, org.channelId, message);
        if (!channelResult.ok && channelResult.error === 'not_in_channel') {
          try {
            await joinChannel(org.botToken, org.channelId);
          } catch {
            // ignore join failures and just return Slack error
          }
          channelResult = await postToSlack(org.botToken, org.channelId, message);
        }
      }
    }

    // Build org-level input snapshot and highlights
    const orgInputSnapshot = {
      meetingsCount: meetings.length,
      overdueTasksCount: overdueTasks.length,
      dueTodayTasksCount: dueTodayTasks.length,
      staleDealsCount: staleDeals.count,
      weekStats,
      topMeetings: meetings.slice(0, 5),
      topOverdueTasks: overdueTasks.slice(0, 5),
    };

    const orgHighlights = {
      insights,
      staleDealsDetails: staleDeals.details,
      summary: `${meetings.length} meetings, ${overdueTasks.length} overdue tasks, ${dueTodayTasks.length} due today`,
    };

    const renderedText = buildRenderedText(digestData, 'org');

    // Determine delivery status
    const deliveryStatus = !sendToChannel ? 'skipped' : channelResult.ok ? 'sent' : 'failed';
    const delivery: DigestAnalysis['delivery'] = {
      channelId: sendToChannel ? (org.channelId || undefined) : undefined,
      ts: channelResult.ts,
      status: deliveryStatus,
      error: channelResult.error,
    };

    // Store org-level digest analysis
    await upsertDigestAnalysis(supabase, {
      org_id: org.orgId,
      digest_date: digestDateStr,
      digest_type: 'org',
      user_id: null,
      timezone: org.timezone,
      window_start: window.startIso,
      window_end: window.endIso,
      source: 'slack_daily_digest',
      input_snapshot: orgInputSnapshot,
      highlights: orgHighlights,
      rendered_text: renderedText,
      slack_message: { blocks: message.blocks, text: message.text || '' },
      delivery,
    });

    // Build and store per-user digests
    const userIds = new Set<string>();
    rawMeetings.forEach((m) => m.user_id && userIds.add(m.user_id));
    rawOverdueTasks.forEach((t) => t.assigned_to && userIds.add(t.assigned_to));
    rawDueTodayTasks.forEach((t) => t.assigned_to && userIds.add(t.assigned_to));

    // Always store per-user digests for historical browsing.
    // DM delivery is gated by org.deliveryMethod, and in test mode we only DM the triggering user.
    const analysisUserIds = new Set<string>(Array.from(userIds));
    if (org.isTest && org.requestUserId) {
      analysisUserIds.add(org.requestUserId);
    }

    const shouldAttemptDmForUser = (userId: string) => {
      if (!sendToDm) return false;
      if (org.isTest && org.requestUserId) return userId === org.requestUserId;
      return true;
    };

    let dmSentCount = 0;
    let dmFailedCount = 0;
    let dmSkippedCount = 0;

    for (const userId of Array.from(analysisUserIds)) {
      const userMeetings = rawMeetings.filter((m) => m.user_id === userId);
      const userOverdue = rawOverdueTasks.filter((t) => t.assigned_to === userId);
      const userDueToday = rawDueTodayTasks.filter((t) => t.assigned_to === userId);

      // Get user name from any of the records
      const userName = userMeetings[0]?.user_name || userOverdue[0]?.user_name || userDueToday[0]?.user_name || 'User';

      const userDigestData: DailyDigestData = {
        teamName: userName,
        date: window.dateLabel,
        currencyCode: money.currencyCode,
        currencyLocale: money.currencyLocale,
        meetings: userMeetings.map((m) => ({
          time: formatTime(m.start_time, org.timezone),
          userName: m.user_name,
          slackUserId: userMappings.get(m.user_id),
          title: m.title,
        })),
        overdueTasks: userOverdue.map((t) => ({
          userName: t.user_name,
          slackUserId: userMappings.get(t.assigned_to),
          task: t.title,
          daysOverdue: Math.ceil((dayStart.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24)),
        })),
        dueTodayTasks: userDueToday.map((t) => ({
          userName: t.user_name,
          slackUserId: userMappings.get(t.assigned_to),
          task: t.title,
        })),
        insights, // Reuse org-level insights for MVP
        weekStats, // Reuse org-level stats for MVP
        appUrl,
      };

      const userInputSnapshot = {
        meetingsCount: userMeetings.length,
        overdueTasksCount: userOverdue.length,
        dueTodayTasksCount: userDueToday.length,
        topMeetings: userMeetings.slice(0, 3),
        topOverdueTasks: userOverdue.slice(0, 3),
      };

      const userHighlights = {
        insights, // Reuse for MVP
        summary: `${userMeetings.length} meetings, ${userOverdue.length} overdue tasks, ${userDueToday.length} due today`,
      };

      const userRenderedText = buildRenderedText(userDigestData, 'user', userName);

      const attemptDm = shouldAttemptDmForUser(userId);
      const userSlackMessage = attemptDm ? buildDailyDigestMessage(userDigestData) : null;
      const recipientSlackUserId = attemptDm ? userMappings.get(userId) : undefined;

      let userDelivery: DigestAnalysis['delivery'] = null;
      let userSlackMessageToStore: DigestAnalysis['slack_message'] =
        userSlackMessage ? { blocks: userSlackMessage.blocks, text: userSlackMessage.text || '' } : null;

      if (attemptDm) {
        if (!recipientSlackUserId) {
          dmSkippedCount += 1;
          userDelivery = {
            status: 'skipped',
            error: 'User not mapped to Slack (no DM recipient)',
          };
        } else {
          const dmResult = await sendSlackDM(org.botToken, recipientSlackUserId, userSlackMessage!);
          if (dmResult.ok) {
            dmSentCount += 1;
            userDelivery = {
              channelId: dmResult.channelId,
              ts: dmResult.ts,
              status: 'sent',
            };
            if (!org.isTest) {
              await supabase.from('slack_notifications_sent').insert({
                org_id: org.orgId,
                feature: 'daily_digest',
                entity_type: 'digest',
                entity_id: org.orgId,
                recipient_type: 'user',
                recipient_id: recipientSlackUserId,
                slack_ts: dmResult.ts,
                slack_channel_id: dmResult.channelId,
              });
            }
          } else {
            dmFailedCount += 1;
            userDelivery = {
              channelId: dmResult.channelId,
              ts: dmResult.ts,
              status: 'failed',
              error: dmResult.error,
            };
          }
        }
      }

      await upsertDigestAnalysis(supabase, {
        org_id: org.orgId,
        digest_date: digestDateStr,
        digest_type: 'user',
        user_id: userId,
        timezone: org.timezone,
        window_start: window.startIso,
        window_end: window.endIso,
        source: 'slack_daily_digest',
        input_snapshot: userInputSnapshot,
        highlights: userHighlights,
        rendered_text: userRenderedText,
        slack_message: userSlackMessageToStore,
        delivery: userDelivery,
      });
    }

    // If channel delivery was required and failed, mark overall org result as failed.
    if (sendToChannel && !channelResult.ok) {
      return {
        success: false,
        orgId: org.orgId,
        channelId: org.channelId || undefined,
        slackTs: channelResult.ts,
        dmSentCount,
        dmFailedCount,
        dmSkippedCount,
        error: channelResult.error,
      };
    }

    // Record sent notification (legacy table, skip in test mode)
    if (sendToChannel && channelResult.ok && !org.isTest && org.channelId) {
      await supabase.from('slack_notifications_sent').insert({
        org_id: org.orgId,
        feature: 'daily_digest',
        entity_type: 'digest',
        entity_id: org.orgId,
        recipient_type: 'channel',
        recipient_id: org.channelId,
        slack_ts: channelResult.ts,
        slack_channel_id: org.channelId,
      });
    }

    return {
      success: true,
      orgId: org.orgId,
      channelId: org.channelId || undefined,
      slackTs: channelResult.ts,
      dmSentCount,
      dmFailedCount,
      dmSkippedCount,
    };
  } catch (error) {
    console.error('Error processing org digest:', org.orgId, error);
    return {
      success: false,
      orgId: org.orgId,
      channelId: org.channelId || undefined,
      error: (error as any)?.message || String(error),
    };
  }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);
    const requestId = crypto.randomUUID();
    console.log('[slack-daily-digest] start', { requestId, mode: auth.mode, userId: auth.userId });

    // Check if this is a manual trigger for a specific org
    let targetOrgId: string | null = null;
    let targetDate: string | null = null;
    let isTest: boolean = false;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      targetOrgId = body.orgId || null;
      targetDate = body.date || null;
      isTest = !!body.isTest;
    }

    // External release hardening:
    // - User-auth calls MUST target a single org (no "send to everyone" endpoint).
    // - Only org admins (or platform admins) can manually trigger.
    if (auth.mode === 'user') {
      if (!targetOrgId) {
        return new Response(
          JSON.stringify({ success: false, error: 'orgId required for manual trigger', requestId }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (auth.userId && !auth.isPlatformAdmin) {
        await requireOrgRole(supabase, targetOrgId, auth.userId, ['owner', 'admin']);
      }
    }

    // Get orgs with daily_digest enabled (avoid deep PostgREST joins for reliability)
    let settingsQuery = supabase
      .from('slack_notification_settings')
      .select('org_id, channel_id, schedule_timezone, delivery_method')
      .eq('feature', 'daily_digest');
    // In test mode, allow running even if disabled/missing; we'll fall back to #general.
    if (!isTest) settingsQuery = settingsQuery.eq('is_enabled', true);
    if (targetOrgId) settingsQuery = settingsQuery.eq('org_id', targetOrgId);

    const { data: settingsRows, error: settingsError } = await settingsQuery;
    if (settingsError) {
      console.error('Error fetching notification settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch organizations', requestId, details: settingsError }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let effectiveSettingsRows: any[] = settingsRows || [];

    // If running a test for a specific org and there is no row, synthesize one.
    if (isTest && targetOrgId && effectiveSettingsRows.length === 0) {
      effectiveSettingsRows = [{ org_id: targetOrgId, channel_id: null, schedule_timezone: 'UTC', delivery_method: 'channel' }];
    }

    const orgIds = Array.from(new Set((effectiveSettingsRows || []).map((r: any) => r.org_id).filter(Boolean)));
    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No orgs configured for daily digest', requestId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_name, is_connected')
      .in('org_id', orgIds)
      .eq('is_connected', true);

    const slackOrgById = new Map<string, any>();
    (slackOrgs || []).forEach((s: any) => slackOrgById.set(s.org_id, s));

    const { data: orgNames } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', orgIds);
    const orgNameById = new Map<string, string>();
    (orgNames || []).forEach((o: any) => orgNameById.set(o.id, o.name));

    // Process each org
    const results = await Promise.all(
      (effectiveSettingsRows || []).map((row: any) => {
        const slack = slackOrgById.get(row.org_id);
        if (!slack?.bot_access_token) {
          return Promise.resolve({ success: false, orgId: row.org_id, channelId: row.channel_id, error: 'Slack not connected' });
        }
        const deliveryMethodRaw = String(row.delivery_method || 'channel');
        const deliveryMethod =
          deliveryMethodRaw === 'dm' || deliveryMethodRaw === 'both' || deliveryMethodRaw === 'channel'
            ? (deliveryMethodRaw as 'channel' | 'dm' | 'both')
            : ('channel' as const);
        const needsChannel = deliveryMethod === 'channel' || deliveryMethod === 'both';

        // In test mode, if no channel configured but a channel is required, fall back to #general/#random.
        if (needsChannel && !row.channel_id) {
          if (!isTest) {
            return Promise.resolve({
              success: false,
              orgId: row.org_id,
              channelId: row.channel_id,
              error: 'No channel configured for daily digest',
            });
          }
          // choose preferred channel
          return listChannels(slack.bot_access_token)
            .then((chs) => {
              const preferred = chs.find((c) => c.name === 'general') || chs.find((c) => c.name === 'random') || chs[0];
              if (!preferred?.id) {
                return { success: false, orgId: row.org_id, channelId: undefined, error: 'No channels available for Slack bot' };
              }
              return processOrgDigest(supabase, {
                orgId: row.org_id,
                teamName: orgNameById.get(row.org_id) || slack.slack_team_name || 'Team',
                botToken: slack.bot_access_token,
                channelId: preferred.id,
                timezone: row.schedule_timezone || 'UTC',
                digestDate: targetDate,
                isTest: true,
                deliveryMethod,
                requestUserId: auth.userId || null,
              });
            })
            .catch((e) => ({ success: false, orgId: row.org_id, channelId: undefined, error: (e as any)?.message || String(e) }));
        }

        return processOrgDigest(supabase, {
          orgId: row.org_id,
          teamName: orgNameById.get(row.org_id) || slack.slack_team_name || 'Team',
          botToken: slack.bot_access_token,
          channelId: row.channel_id,
          timezone: row.schedule_timezone || 'UTC',
          digestDate: targetDate,
          isTest,
          deliveryMethod,
          requestUserId: auth.userId || null,
        });
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log('[slack-daily-digest] complete', { requestId, successCount, failedCount });

    return new Response(
      JSON.stringify({
        success: true,
        processed: (settingsRows || []).length,
        successCount,
        failedCount,
        results,
        requestId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in daily digest:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
