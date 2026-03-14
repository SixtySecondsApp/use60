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
import { logAICostEvent } from '../_shared/costTracking.ts';
import { writeToCommandCentre } from '../_shared/commandCentre/writeAdapter.ts';
import { getDailyThreadTs } from '../_shared/slack/dailyThread.ts';
import { getOverdueCommitments } from '../_shared/memory/commitments.ts';
import type { Commitment } from '../_shared/memory/types.ts';

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
        // BA-002b: Check brain_intelligence.enhanced_morning_brief setting
        let brainEnabled = true; // default: enabled
        try {
          const { data: userSettings } = await supabase
            .from('user_settings')
            .select('preferences')
            .eq('user_id', persona.user_id)
            .maybeSingle();

          if (userSettings?.preferences?.brain_intelligence) {
            const bi = userSettings.preferences.brain_intelligence as Record<string, unknown>;
            // Only disable if explicitly set to false (default is enabled)
            if (bi.enhanced_morning_brief === false) {
              brainEnabled = false;
            }
          }
        } catch (settingsErr) {
          // Settings lookup failure must not block briefing — default to enabled
          console.warn('[agent-morning-briefing] user_settings lookup failed, defaulting brainEnabled=true:', settingsErr);
        }

        const briefing = await assembleBriefing(supabase, persona, brainEnabled);
        if (!briefing) continue; // Nothing to report

        // Generate natural language briefing via Haiku
        const narrativeBriefing = ANTHROPIC_API_KEY
          ? await generateNarrativeBriefing(briefing, persona, supabase)
          : formatFallbackBriefing(briefing, persona);

        // BA-003c: Get or create today's daily Slack thread
        const threadTs = await getDailyThreadTs(persona.user_id, persona.org_id, supabase);

        // Deliver via Slack DM (threaded if daily thread exists)
        await deliverBriefingToSlack(supabase, persona, narrativeBriefing, threadTs);

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
            brain_overdue_commitments: briefing.brainInsights.overdueCommitments.length,
            brain_decaying_contacts: briefing.brainInsights.decayingContacts.length,
            brain_at_risk_deals: briefing.brainInsights.atRiskDeals.length,
          },
        });

        // BA-002b: Write to Command Centre as morning_brief item
        const briefDate = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          ...(persona.timezone ? { timeZone: persona.timezone } : {}),
        });
        try {
          await writeToCommandCentre({
            org_id: persona.org_id,
            user_id: persona.user_id,
            source_agent: 'morning-briefing',
            item_type: 'morning_brief',
            title: `Morning Brief — ${briefDate}`,
            summary: narrativeBriefing.substring(0, 500),
            context: {
              deals_count: briefing.deals.length,
              meetings_count: briefing.meetings.length,
              tasks_count: briefing.tasks.length,
              overnight_alerts: briefing.overnightAlerts.length,
              brain_overdue_commitments: briefing.brainInsights.overdueCommitments.length,
              brain_decaying_contacts: briefing.brainInsights.decayingContacts.length,
              brain_at_risk_deals: briefing.brainInsights.atRiskDeals.length,
              brain_enabled: brainEnabled,
            },
            urgency: 'normal',
          });
        } catch (ccErr) {
          // CC failure must not break morning briefing delivery
          console.error('[agent-morning-briefing] CC write failed for user', persona.user_id, String(ccErr));
        }

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

interface BrainInsights {
  overdueCommitments: Array<Commitment & { deal_id: string; deal_name?: string }>;
  decayingContacts: Array<{ contact_id: string; contact_name?: string; relationship_strength: number; last_interaction_at: string | null; days_since_interaction: number }>;
  atRiskDeals: Array<{ deal_id: string; deal_name?: string; event_type: string; summary: string; confidence: number; detail: Record<string, unknown>; last_sentiment?: number }>;
}

interface BriefingData {
  deals: Array<{ name: string; stage: string; value: number; daysSinceUpdate: number }>;
  meetings: Array<{ title: string; startTime: string; attendees: number; contactName?: string }>;
  tasks: Array<{ title: string; dueDate: string; isOverdue: boolean }>;
  overnightAlerts: Array<{ type: string; title: string; summary: string }>;
  batchedNotificationIds: string[];
  brainInsights: BrainInsights;
}

async function assembleBriefing(
  supabase: any,
  persona: Record<string, any>,
  brainEnabled = true,
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

  // 5. Brain insights — best-effort, never block the briefing
  //    BA-002b: Only query Brain data if the user has enhanced_morning_brief enabled
  const brainInsights: BrainInsights = {
    overdueCommitments: [],
    decayingContacts: [],
    atRiskDeals: [],
  };

  if (brainEnabled) {
    // 5a. Overdue commitments from deal_memory_events
    try {
      brainInsights.overdueCommitments = await getOverdueCommitments(orgId, supabase);
    } catch (err) {
      console.warn('[agent-morning-briefing] Brain: overdue commitments query failed:', err);
    }

    // 5b. Decaying contacts — relationship_strength below 0.4
    try {
      const { data: decayingData } = await supabase
        .from('contact_memory')
        .select('contact_id, relationship_strength, last_interaction_at')
        .eq('org_id', orgId)
        .lt('relationship_strength', 0.4)
        .order('relationship_strength', { ascending: true })
        .limit(5);

      const now = Date.now();
      brainInsights.decayingContacts = (decayingData || []).map((c: any) => ({
        contact_id: c.contact_id,
        relationship_strength: c.relationship_strength,
        last_interaction_at: c.last_interaction_at,
        days_since_interaction: c.last_interaction_at
          ? Math.floor((now - new Date(c.last_interaction_at).getTime()) / (1000 * 60 * 60 * 24))
          : -1,
      }));
    } catch (err) {
      console.warn('[agent-morning-briefing] Brain: decaying contacts query failed:', err);
    }

    // 5c. At-risk deals — recent sentiment_shift or risk_flag events with low sentiment
    try {
      const { data: riskEvents } = await supabase
        .from('deal_memory_events')
        .select('deal_id, event_type, summary, confidence, detail, source_timestamp')
        .eq('org_id', orgId)
        .in('event_category', ['sentiment', 'signal'])
        .in('event_type', ['sentiment_shift', 'risk_flag'])
        .gt('confidence', 0.7)
        .eq('is_active', true)
        .order('source_timestamp', { ascending: false })
        .limit(50);

      // Deduplicate: keep only the latest event per deal_id, then filter for low sentiment
      const latestByDeal = new Map<string, any>();
      for (const evt of (riskEvents || [])) {
        if (!latestByDeal.has(evt.deal_id)) {
          latestByDeal.set(evt.deal_id, evt);
        }
      }

      brainInsights.atRiskDeals = Array.from(latestByDeal.values())
        .filter((evt: any) => {
          const sentiment = evt.detail?.sentiment ?? evt.detail?.score ?? null;
          return sentiment !== null && sentiment < 0.5;
        })
        .map((evt: any) => ({
          deal_id: evt.deal_id,
          event_type: evt.event_type,
          summary: evt.summary,
          confidence: evt.confidence,
          detail: evt.detail,
          last_sentiment: evt.detail?.sentiment ?? evt.detail?.score ?? null,
        }));
    } catch (err) {
      console.warn('[agent-morning-briefing] Brain: at-risk deals query failed:', err);
    }

    // 5d. Resolve deal names for overdue commitments and at-risk deals
    try {
      const brainDealIds = new Set<string>();
      for (const c of brainInsights.overdueCommitments) brainDealIds.add(c.deal_id);
      for (const d of brainInsights.atRiskDeals) brainDealIds.add(d.deal_id);
      const uniqueDealIds = Array.from(brainDealIds);

      if (uniqueDealIds.length > 0) {
        const { data: dealNames } = await supabase
          .from('deals')
          .select('id, name')
          .in('id', uniqueDealIds);

        const dealNameMap = new Map<string, string>();
        for (const d of (dealNames || [])) dealNameMap.set(d.id, d.name);

        for (const c of brainInsights.overdueCommitments) {
          c.deal_name = dealNameMap.get(c.deal_id) ?? undefined;
        }
        for (const d of brainInsights.atRiskDeals) {
          d.deal_name = dealNameMap.get(d.deal_id) ?? undefined;
        }
      }
    } catch (err) {
      console.warn('[agent-morning-briefing] Brain: deal name resolution failed:', err);
    }

    // 5e. Resolve contact names for decaying contacts
    try {
      const contactIds = brainInsights.decayingContacts.map(c => c.contact_id);
      if (contactIds.length > 0) {
        const { data: contactNames } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds);

        const contactNameMap = new Map<string, string>();
        for (const c of (contactNames || [])) {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
          contactNameMap.set(c.id, name || 'Unknown');
        }

        for (const c of brainInsights.decayingContacts) {
          c.contact_name = contactNameMap.get(c.contact_id) ?? undefined;
        }
      }
    } catch (err) {
      console.warn('[agent-morning-briefing] Brain: contact name resolution failed:', err);
    }
  } else {
    console.log('[agent-morning-briefing] Brain insights disabled for user', userId, '(enhanced_morning_brief = false)');
  }

  // Check if there's anything to report
  const hasBrainInsights = brainInsights.overdueCommitments.length > 0
    || brainInsights.decayingContacts.length > 0
    || brainInsights.atRiskDeals.length > 0;
  if (deals.length === 0 && meetings.length === 0 && tasks.length === 0 && overnightAlerts.length === 0 && !hasBrainInsights) {
    return null; // Suppress empty briefing (HEARTBEAT_OK)
  }

  return { deals, meetings, tasks, overnightAlerts, batchedNotificationIds, brainInsights };
}

// ============================================================================
// Narrative Generation
// ============================================================================

async function generateNarrativeBriefing(
  data: BriefingData,
  persona: Record<string, any>,
  supabase?: any,
): Promise<string> {
  const toneInstructions: Record<string, string> = {
    concise: 'Be brief and bullet-pointed. No fluff.',
    conversational: 'Be warm and friendly, like a helpful colleague. Use casual language.',
    direct: 'Be assertive and action-oriented. Lead with the most important item.',
    custom: persona.custom_instructions || 'Be helpful and clear.',
  };

  const tone = toneInstructions[persona.tone] || toneInstructions.concise;
  const agentName = persona.agent_name || 'Sixty';

  // BA-002b: Build structured Brain insights sections for enhanced prompt
  const brain = data.brainInsights;
  const hasBrainInsights = brain.overdueCommitments.length > 0
    || brain.decayingContacts.length > 0
    || brain.atRiskDeals.length > 0;

  let brainSection = '';
  if (hasBrainInsights) {
    const sections: string[] = [];

    if (brain.overdueCommitments.length > 0) {
      const commitmentLines = brain.overdueCommitments.slice(0, 5).map(c => {
        const daysOverdue = c.deadline
          ? Math.floor((Date.now() - new Date(c.deadline).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const dealLabel = c.deal_name || 'Unknown deal';
        return `  - "${c.action}" on ${dealLabel} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue)`;
      });
      sections.push(
        `COMMITMENTS SLIPPING: ${brain.overdueCommitments.length} overdue commitment${brain.overdueCommitments.length !== 1 ? 's' : ''} need attention\n${commitmentLines.join('\n')}`,
      );
    }

    if (brain.decayingContacts.length > 0) {
      const contactLines = brain.decayingContacts.slice(0, 5).map(c => {
        const name = c.contact_name || 'Unknown contact';
        const strengthPct = Math.round(c.relationship_strength * 100);
        const daysLabel = c.days_since_interaction >= 0
          ? `${c.days_since_interaction} day${c.days_since_interaction !== 1 ? 's' : ''} since last interaction`
          : 'no recorded interaction';
        return `  - ${name} (strength: ${strengthPct}%, ${daysLabel})`;
      });
      sections.push(
        `CONTACTS GOING COLD: ${brain.decayingContacts.length} relationship${brain.decayingContacts.length !== 1 ? 's' : ''} decaying\n${contactLines.join('\n')}`,
      );
    }

    if (brain.atRiskDeals.length > 0) {
      const riskLines = brain.atRiskDeals.slice(0, 5).map(d => {
        const dealLabel = d.deal_name || 'Unknown deal';
        const sentimentLabel = d.last_sentiment !== undefined && d.last_sentiment !== null
          ? `sentiment: ${Math.round(d.last_sentiment * 100)}%`
          : 'low sentiment';
        return `  - ${dealLabel} (${sentimentLabel})`;
      });
      sections.push(
        `DEALS AT RISK: ${brain.atRiskDeals.length} deal${brain.atRiskDeals.length !== 1 ? 's' : ''} with negative sentiment\n${riskLines.join('\n')}`,
      );
    }

    brainSection = `\n\nBrain insights (from relationship memory):\n${sections.join('\n\n')}`;
  }

  const brainInstruction = hasBrainInsights
    ? '\n\nPrioritize actionable nudges over informational summaries. Include up to 3 specific action items with contact/deal names based on the Brain insights above.'
    : '';

  const prompt = `You are ${agentName}, an AI sales assistant. Write a morning briefing for a sales rep.

Tone: ${tone}

Today's data:
- ${data.meetings.length} meetings today: ${data.meetings.map(m => `"${m.title}" at ${new Date(m.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`).join(', ') || 'none'}
- ${data.deals.length} active deals (top: ${data.deals.slice(0, 3).map(d => `${d.name} ($${d.value.toLocaleString()}, ${d.daysSinceUpdate}d since update)`).join('; ') || 'none'})
- ${data.tasks.filter(t => t.isOverdue).length} overdue tasks, ${data.tasks.filter(t => !t.isOverdue).length} due today
- ${data.overnightAlerts.length} overnight alerts: ${data.overnightAlerts.slice(0, 3).map(a => a.title).join(', ') || 'none'}${brainSection}

Write a 2-3 paragraph briefing. Start with the most urgent item. End with one actionable recommendation. No headers or bullet points unless tone is concise.${brainInstruction}`;

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
    // Log AI cost event (fire-and-forget)
    if (supabase && persona.user_id && result.usage) {
      logAICostEvent(
        supabase, persona.user_id, persona.org_id ?? null,
        'anthropic', 'claude-haiku-4-5-20251001',
        result.usage.input_tokens || 0, result.usage.output_tokens || 0,
        'agent_morning_briefing',
        undefined,
        { source: 'agent_automated', agentType: 'morning_briefing' },
      ).catch((e: unknown) => console.warn('[agent-morning-briefing] cost log error:', e));
    }
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

  // Brain insights in fallback (with enriched names)
  const brain = data.brainInsights;
  if (brain.overdueCommitments.length > 0) {
    const top = brain.overdueCommitments[0];
    const dealLabel = top.deal_name || 'a deal';
    lines.push(`${brain.overdueCommitments.length} overdue commitment${brain.overdueCommitments.length !== 1 ? 's' : ''} need follow-up (e.g. "${top.action}" on ${dealLabel}).`);
  }
  if (brain.decayingContacts.length > 0) {
    const top = brain.decayingContacts[0];
    const contactLabel = top.contact_name || 'a contact';
    lines.push(`${brain.decayingContacts.length} contact${brain.decayingContacts.length !== 1 ? 's' : ''} going cold — ${contactLabel} is at ${Math.round(top.relationship_strength * 100)}% strength.`);
  }
  if (brain.atRiskDeals.length > 0) {
    const top = brain.atRiskDeals[0];
    const dealLabel = top.deal_name || 'a deal';
    lines.push(`${brain.atRiskDeals.length} deal${brain.atRiskDeals.length !== 1 ? 's' : ''} at risk — ${dealLabel} showing negative sentiment.`);
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
  threadTs?: string | null,
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
    ...(threadTs ? { thread_ts: threadTs } : {}),
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
