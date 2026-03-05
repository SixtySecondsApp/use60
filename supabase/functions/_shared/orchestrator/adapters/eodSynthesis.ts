/**
 * EOD Synthesis Adapters (EOD-004)
 *
 * Provides two functions used by the end-of-day synthesis agent:
 *
 *   getOpenItems(supabase, userId, orgId)
 *     Detects unresolved items at end of day: pending email replies,
 *     unsent drafts, incomplete meeting action items, and overdue tasks.
 *
 *   getTomorrowPreview(supabase, userId, orgId)
 *     Builds a calendar preview for tomorrow: upcoming meetings with
 *     attendee details, briefing prep status, and attention flags for
 *     at-risk deals or first-time contacts.
 *
 * Both are registered as skill adapters in the ADAPTER_REGISTRY so
 * the fleet orchestrator can chain them into the eod_synthesis sequence.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface PendingReply {
  activity_id: string;
  contact_name: string | null;
  contact_email: string | null;
  subject: string | null;
  received_at: string;
  deal_id: string | null;
  deal_name: string | null;
  hours_waiting: number;
}

export interface OverdueTask {
  task_id: string;
  title: string;
  due_date: string | null;
  days_overdue: number;
  deal_id: string | null;
  deal_name: string | null;
  priority: string | null;
}

export interface IncompleteAction {
  description: string;
  meeting_title: string | null;
  meeting_date: string | null;
  deal_id: string | null;
  deal_name: string | null;
  source_activity_id: string;
}

export interface OpenItemsResult {
  pending_replies: PendingReply[];
  unsent_drafts: number;
  incomplete_actions: IncompleteAction[];
  overdue_tasks: OverdueTask[];
  total_attention_items: number;
}

export type PrepStatus = 'ready' | 'queued' | 'none';

export interface AttentionFlag {
  type: 'at_risk_deal' | 'first_meeting' | 'key_stakeholder' | 'overdue_follow_up';
  description: string;
  deal_id: string | null;
  deal_name: string | null;
  severity: 'high' | 'medium' | 'low';
}

export interface TomorrowMeeting {
  event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees_count: number;
  attendees: Array<{
    name: string | null;
    email: string | null;
    contact_id: string | null;
    is_internal: boolean;
  }>;
  deal_id: string | null;
  deal_name: string | null;
  prep_status: PrepStatus;
  attention_flags: AttentionFlag[];
}

export interface TomorrowPreviewResult {
  date: string;
  meetings: TomorrowMeeting[];
  total_meetings: number;
  high_attention_count: number;
  suggested_first_action: string | null;
}

// =============================================================================
// getOpenItems
// =============================================================================

/**
 * Detect unresolved items at EOD for a given user.
 *
 * Sources queried:
 *   - activities (type=email_received with no reply in activities)
 *   - activities (type=email_draft)
 *   - tasks (overdue or incomplete at EOD)
 *   - activities (type=action_item from meeting_ended with status=pending)
 */
export async function getOpenItems(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<OpenItemsResult> {
  const pendingReplies: PendingReply[] = [];
  const incompleteActions: IncompleteAction[] = [];
  const overdueTasksList: OverdueTask[] = [];
  let unsentDrafts = 0;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // -------------------------------------------------------------------------
  // 1. Pending email replies (inbound emails received today with no outbound reply)
  // -------------------------------------------------------------------------
  const { data: inboundEmails, error: emailErr } = await supabase
    .from('activities')
    .select('id, type, description, created_at, contact_id, deal_id, metadata')
    .eq('user_id', userId)
    .eq('type', 'email_received')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  if (emailErr) {
    console.warn('[eod-open-items] Failed to fetch inbound emails:', emailErr.message);
  } else {
    // Batch-fetch contact details
    const contactIds = [...new Set((inboundEmails || []).map((a: any) => a.contact_id).filter(Boolean))];
    const contactMap: Record<string, { name: string; email: string }> = {};
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email')
        .in('id', contactIds);
      for (const c of contacts || []) {
        contactMap[c.id] = {
          name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
          email: c.email || null,
        };
      }
    }

    // Batch-fetch deal names
    const dealIds = [...new Set((inboundEmails || []).map((a: any) => a.deal_id).filter(Boolean))];
    const dealMap: Record<string, string> = {};
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', dealIds);
      for (const d of deals || []) {
        dealMap[d.id] = d.name;
      }
    }

    for (const email of inboundEmails || []) {
      const contact = email.contact_id ? contactMap[email.contact_id] : null;
      const metadata = (email.metadata as Record<string, unknown>) || {};
      const receivedAt = email.created_at as string;
      const hoursWaiting = Math.round(
        (now.getTime() - new Date(receivedAt).getTime()) / (1000 * 60 * 60)
      );

      pendingReplies.push({
        activity_id: email.id,
        contact_name: contact?.name ?? null,
        contact_email: contact?.email ?? (metadata.from_email as string ?? null),
        subject: (metadata.subject as string) ?? email.description ?? null,
        received_at: receivedAt,
        deal_id: email.deal_id ?? null,
        deal_name: email.deal_id ? (dealMap[email.deal_id] ?? null) : null,
        hours_waiting: hoursWaiting,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Unsent drafts
  // -------------------------------------------------------------------------
  const { count: draftCount, error: draftErr } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'email_draft')
    .gte('created_at', todayStart.toISOString());

  if (!draftErr) {
    unsentDrafts = draftCount ?? 0;
  }

  // -------------------------------------------------------------------------
  // 3. Incomplete action items from today's meetings
  // -------------------------------------------------------------------------
  const { data: actionItems, error: actionErr } = await supabase
    .from('activities')
    .select('id, description, created_at, deal_id, metadata')
    .eq('user_id', userId)
    .eq('type', 'action_item')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  if (actionErr) {
    console.warn('[eod-open-items] Failed to fetch action items:', actionErr.message);
  } else {
    const actionDealIds = [...new Set((actionItems || []).map((a: any) => a.deal_id).filter(Boolean))];
    const actionDealMap: Record<string, string> = {};
    if (actionDealIds.length > 0) {
      const { data: actionDeals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', actionDealIds);
      for (const d of actionDeals || []) {
        actionDealMap[d.id] = d.name;
      }
    }

    for (const item of actionItems || []) {
      const metadata = (item.metadata as Record<string, unknown>) || {};
      // Only include items that are still pending (no completed_at set)
      if (metadata.completed_at) continue;

      incompleteActions.push({
        description: item.description || 'Action item from meeting',
        meeting_title: (metadata.meeting_title as string) ?? null,
        meeting_date: (metadata.meeting_date as string) ?? null,
        deal_id: item.deal_id ?? null,
        deal_name: item.deal_id ? (actionDealMap[item.deal_id] ?? null) : null,
        source_activity_id: item.id,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 4. Overdue tasks (past due date, not completed — tasks.assigned_to or created_by)
  // -------------------------------------------------------------------------
  const { data: overdueTasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, title, due_date, status, priority, deal_id')
    .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    .lt('due_date', now.toISOString())
    .not('status', 'in', '("done","completed","closed","cancelled")')
    .order('due_date', { ascending: true })
    .limit(20);

  if (taskErr) {
    console.warn('[eod-open-items] Failed to fetch overdue tasks:', taskErr.message);
  } else {
    const taskDealIds = [...new Set((overdueTasks || []).map((t: any) => t.deal_id).filter(Boolean))];
    const taskDealMap: Record<string, string> = {};
    if (taskDealIds.length > 0) {
      const { data: taskDeals } = await supabase
        .from('deals')
        .select('id, name')
        .in('id', taskDealIds);
      for (const d of taskDeals || []) {
        taskDealMap[d.id] = d.name;
      }
    }

    for (const task of overdueTasks || []) {
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const daysOverdue = dueDate
        ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      overdueTasksList.push({
        task_id: task.id,
        title: task.title,
        due_date: task.due_date ?? null,
        days_overdue: daysOverdue,
        deal_id: task.deal_id ?? null,
        deal_name: task.deal_id ? (taskDealMap[task.deal_id] ?? null) : null,
        priority: task.priority ?? null,
      });
    }
  }

  const totalAttention = pendingReplies.length + incompleteActions.length + overdueTasksList.length;

  return {
    pending_replies: pendingReplies,
    unsent_drafts: unsentDrafts,
    incomplete_actions: incompleteActions,
    overdue_tasks: overdueTasksList,
    total_attention_items: totalAttention,
  };
}

// =============================================================================
// getTomorrowPreview
// =============================================================================

/**
 * Build a calendar preview for the next business day.
 *
 * Returns each meeting with attendee details, prep status, and attention flags
 * for at-risk deals on the agenda and first-time contact meetings.
 */
export async function getTomorrowPreview(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<TomorrowPreviewResult> {
  const now = new Date();
  const tomorrowStart = new Date(now);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const tomorrowDateStr = tomorrowStart.toISOString().split('T')[0];

  const meetings: TomorrowMeeting[] = [];

  // -------------------------------------------------------------------------
  // 1. Fetch tomorrow's calendar events (real meetings: attendees_count > 1)
  // -------------------------------------------------------------------------
  const { data: events, error: eventsErr } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, attendees_count, attendees, deal_id, status, metadata')
    .eq('user_id', userId)
    .gte('start_time', tomorrowStart.toISOString())
    .lte('start_time', tomorrowEnd.toISOString())
    .gt('attendees_count', 1)
    .not('status', 'eq', 'cancelled')
    .order('start_time', { ascending: true })
    .limit(20);

  if (eventsErr) {
    console.warn('[eod-tomorrow-preview] Failed to fetch calendar events:', eventsErr.message);
    return {
      date: tomorrowDateStr,
      meetings: [],
      total_meetings: 0,
      high_attention_count: 0,
      suggested_first_action: null,
    };
  }

  // Batch-fetch deal names for events that have deal_id
  const eventDealIds = [...new Set((events || []).map((e: any) => e.deal_id).filter(Boolean))];
  const dealMap: Record<string, { name: string; health_score: number | null; status: string }> = {};
  if (eventDealIds.length > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, name, health_score, status')
      .in('id', eventDealIds);
    for (const d of deals || []) {
      dealMap[d.id] = { name: d.name, health_score: d.health_score, status: d.status };
    }
  }

  for (const event of events || []) {
    const rawAttendees = (event.attendees as any[]) || [];
    const deal = event.deal_id ? dealMap[event.deal_id] : null;

    // Build attendee list from the JSONB attendees column
    const attendees = rawAttendees.map((a: any) => ({
      name: a.name || a.display_name || null,
      email: a.email || null,
      contact_id: a.contact_id || null,
      is_internal: a.is_internal ?? false,
    }));

    // Determine prep status: look for a matching pre-meeting briefing activity
    let prepStatus: PrepStatus = 'none';
    const { count: prepCount } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'meeting_brief')
      .eq('metadata->>calendar_event_id', event.id);

    if ((prepCount ?? 0) > 0) {
      prepStatus = 'ready';
    } else {
      // Check if a briefing job is queued in workflow_executions
      const { count: queueCount } = await supabase
        .from('workflow_executions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('metadata->>calendar_event_id', event.id);

      if ((queueCount ?? 0) > 0) {
        prepStatus = 'queued';
      }
    }

    // Build attention flags
    const attentionFlags: AttentionFlag[] = [];

    // At-risk deal flag: deal health_score < 50 or null for active deals
    if (deal && deal.status !== 'won' && deal.status !== 'lost') {
      if (deal.health_score === null || deal.health_score < 50) {
        attentionFlags.push({
          type: 'at_risk_deal',
          description: `${deal.name} is at risk — review deal health before this meeting`,
          deal_id: event.deal_id,
          deal_name: deal.name,
          severity: (deal.health_score !== null && deal.health_score < 30) ? 'high' : 'medium',
        });
      }
    }

    // First meeting flag: external attendees with no prior meeting history
    const externalAttendees = attendees.filter(a => !a.is_internal && a.email);
    for (const attendee of externalAttendees.slice(0, 3)) {
      if (!attendee.contact_id) continue;

      const { count: meetingCount } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('start_time', event.start_time)
        .gt('attendees_count', 1)
        .contains('attendees', [{ contact_id: attendee.contact_id }]);

      if ((meetingCount ?? 0) === 0) {
        attentionFlags.push({
          type: 'first_meeting',
          description: `First meeting with ${attendee.name || attendee.email} — prepare introduction`,
          deal_id: event.deal_id ?? null,
          deal_name: deal?.name ?? null,
          severity: 'medium',
        });
      }
    }

    meetings.push({
      event_id: event.id,
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      attendees_count: event.attendees_count,
      attendees,
      deal_id: event.deal_id ?? null,
      deal_name: deal?.name ?? null,
      prep_status: prepStatus,
      attention_flags: attentionFlags,
    });
  }

  const highAttentionCount = meetings.reduce(
    (acc, m) => acc + m.attention_flags.filter(f => f.severity === 'high').length,
    0
  );

  // Suggested first action: the highest-priority attention flag across all meetings
  let suggestedFirstAction: string | null = null;
  const highFlags = meetings
    .flatMap(m => m.attention_flags.filter(f => f.severity === 'high'))
    .slice(0, 1);
  if (highFlags.length > 0) {
    suggestedFirstAction = highFlags[0].description;
  } else if (meetings.length > 0) {
    const firstMeeting = meetings[0];
    suggestedFirstAction = firstMeeting.prep_status === 'none'
      ? `Prepare a quick brief for "${firstMeeting.title}" at ${new Date(firstMeeting.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
      : `Review your brief for "${firstMeeting.title}" (prep is ready)`;
  }

  return {
    date: tomorrowDateStr,
    meetings,
    total_meetings: meetings.length,
    high_attention_count: highAttentionCount,
    suggested_first_action: suggestedFirstAction,
  };
}

// =============================================================================
// Skill Adapters
// =============================================================================

export const eodOpenItemsAdapter: SkillAdapter = {
  name: 'eod-open-items',
  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[eod-open-items] Detecting open items at EOD...');
      const supabase = getServiceClient();
      const userId = state.event.user_id;
      const orgId = state.event.org_id;

      if (!userId || !orgId) {
        throw new Error('user_id and org_id are required in event payload');
      }

      const result = await getOpenItems(supabase, userId, orgId);

      console.log(
        `[eod-open-items] Found ${result.total_attention_items} attention items ` +
        `(${result.pending_replies.length} pending replies, ` +
        `${result.overdue_tasks.length} overdue tasks, ` +
        `${result.incomplete_actions.length} incomplete actions)`
      );

      return { success: true, output: result, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[eod-open-items] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const eodTomorrowPreviewAdapter: SkillAdapter = {
  name: 'eod-tomorrow-preview',
  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[eod-tomorrow-preview] Building tomorrow preview...');
      const supabase = getServiceClient();
      const userId = state.event.user_id;
      const orgId = state.event.org_id;

      if (!userId || !orgId) {
        throw new Error('user_id and org_id are required in event payload');
      }

      const result = await getTomorrowPreview(supabase, userId, orgId);

      console.log(
        `[eod-tomorrow-preview] Found ${result.total_meetings} meetings tomorrow ` +
        `(${result.high_attention_count} high-attention flags)`
      );

      return { success: true, output: result, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[eod-tomorrow-preview] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

// =============================================================================
// SIG-010: getSignalSummary — email signals detected today + overnight deal count
// =============================================================================

export interface SignalSummaryResult {
  /** Total email signals detected since today_start */
  signals_today: number;
  /** How many of those have been actioned */
  signals_actioned: number;
  /** Percentage actioned (0–100) */
  action_rate_pct: number;
  /** Number of deals currently being monitored for signal changes overnight */
  deals_monitored_overnight: number;
  /** Human-readable summary line */
  summary_line: string;
  /** Overnight plan reference line */
  overnight_plan_line: string;
}

/**
 * SIG-010: Gather email signal counts for today and the overnight deal-monitoring count.
 *
 * Gracefully returns zeroed result if signal tables don't exist yet.
 */
export async function getSignalSummary(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SignalSummaryResult> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  let signalsToday = 0;
  let signalsActioned = 0;
  let dealsMonitored = 0;

  // 1. Count email signals detected today (total and actioned)
  try {
    const { count: totalCount, error: totalErr } = await supabase
      .from('email_signal_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', todayStart.toISOString());

    if (totalErr) {
      if (!totalErr.message.includes('relation') && !totalErr.message.includes('does not exist')) {
        console.warn('[eod-signal-summary] signals today count error:', totalErr.message);
      }
    } else {
      signalsToday = totalCount ?? 0;
    }

    if (signalsToday > 0) {
      const { count: actionedCount, error: actionedErr } = await supabase
        .from('email_signal_events')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('created_at', todayStart.toISOString())
        .eq('actioned', true);

      if (!actionedErr) {
        signalsActioned = actionedCount ?? 0;
      }
    }
  } catch (e) {
    console.warn('[eod-signal-summary] email_signal_events query threw (non-fatal):', e);
  }

  // 2. Count deals currently tracked in deal_signal_temperature (overnight monitoring)
  try {
    const { count: dealCount, error: dealErr } = await supabase
      .from('deal_signal_temperature')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    if (dealErr) {
      if (!dealErr.message.includes('relation') && !dealErr.message.includes('does not exist')) {
        console.warn('[eod-signal-summary] deal_signal_temperature count error:', dealErr.message);
      }
    } else {
      dealsMonitored = dealCount ?? 0;
    }
  } catch (e) {
    console.warn('[eod-signal-summary] deal_signal_temperature query threw (non-fatal):', e);
  }

  const actionRatePct = signalsToday > 0
    ? Math.round((signalsActioned / signalsToday) * 100)
    : 0;

  const summaryLine = signalsToday === 0
    ? 'No email signals detected today.'
    : `${signalsToday} email signal${signalsToday !== 1 ? 's' : ''} detected today, ` +
      `${signalsActioned} actioned (${actionRatePct}%)`;

  const overnightPlanLine = dealsMonitored === 0
    ? 'No deals currently tracked for overnight signal monitoring.'
    : `Monitoring ${dealsMonitored} deal${dealsMonitored !== 1 ? 's' : ''} for signal changes overnight.`;

  return {
    signals_today: signalsToday,
    signals_actioned: signalsActioned,
    action_rate_pct: actionRatePct,
    deals_monitored_overnight: dealsMonitored,
    summary_line: summaryLine,
    overnight_plan_line: overnightPlanLine,
  };
}

export const eodSignalSummaryAdapter: SkillAdapter = {
  name: 'eod-signal-summary',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[eod-signal-summary] Gathering email signal summary...');
      const supabase = getServiceClient();
      const orgId = state.event.org_id;

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      const result = await getSignalSummary(supabase, orgId);

      console.log(
        `[eod-signal-summary] ${result.summary_line} | ${result.overnight_plan_line}`
      );

      return { success: true, output: result, duration_ms: Date.now() - start };
    } catch (err) {
      console.error('[eod-signal-summary] Error:', err);
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
