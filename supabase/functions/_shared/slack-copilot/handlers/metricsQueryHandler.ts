// supabase/functions/_shared/slack-copilot/handlers/metricsQueryHandler.ts
// CC-005: Metrics Query Handler
// Handles "How many meetings did I have last week?", "What's my activity this month?", etc.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { QueryContext, HandlerResult, ExtractedEntities } from '../types.ts';
import { section, fields, divider, context, actions, appLink } from '../responseFormatter.ts';

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

interface DateRange {
  start: Date;
  end: Date;
  label: string;
  shortLabel: string;
}

function getDateRange(timeReference: ExtractedEntities['time_reference']): DateRange {
  const now = new Date();

  switch (timeReference) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const label = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      return { start, end, label, shortLabel: 'Today' };
    }

    case 'last_week': {
      const dayOfWeek = now.getDay(); // 0 = Sun
      const start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return { start, end, label: `Last Week (${startLabel} – ${endLabel})`, shortLabel: 'Last Week' };
    }

    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { start, end, label, shortLabel: 'This Month' };
    }

    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { start, end, label, shortLabel: 'Last Month' };
    }

    case 'this_quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStart, 1);
      const end = new Date(now.getFullYear(), quarterStart + 3, 0, 23, 59, 59, 999);
      const q = Math.floor(now.getMonth() / 3) + 1;
      return { start, end, label: `Q${q} ${now.getFullYear()}`, shortLabel: `Q${q}` };
    }

    case 'last_quarter': {
      const prevQuarterStart = Math.floor(now.getMonth() / 3) * 3 - 3;
      const yearOffset = prevQuarterStart < 0 ? -1 : 0;
      const adjustedMonth = ((prevQuarterStart % 12) + 12) % 12;
      const start = new Date(now.getFullYear() + yearOffset, adjustedMonth, 1);
      const end = new Date(now.getFullYear() + yearOffset, adjustedMonth + 3, 0, 23, 59, 59, 999);
      const q = Math.floor(adjustedMonth / 3) + 1;
      return { start, end, label: `Q${q} ${now.getFullYear() + yearOffset}`, shortLabel: `Q${q}` };
    }

    // Default: this week
    case 'this_week':
    default: {
      const dayOfWeek = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - dayOfWeek);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const startLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return { start, end, label: `This Week (${startLabel} – ${endLabel})`, shortLabel: 'This Week' };
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison range (one period earlier)
// ---------------------------------------------------------------------------

function getPriorDateRange(range: DateRange): DateRange {
  const duration = range.end.getTime() - range.start.getTime();
  const priorEnd = new Date(range.start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - duration);
  return {
    start: priorStart,
    end: priorEnd,
    label: 'Prior period',
    shortLabel: 'Prior',
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleMetricsQuery(
  queryContext: QueryContext,
  entities: ExtractedEntities,
  userId: string,
  _orgId: string,
  supabase: SupabaseClient
): Promise<HandlerResult> {
  const range = getDateRange(entities.time_reference);
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  // --- Meetings ---
  const [
    meetingsResult,
    activitiesResult,
    dealsMovedResult,
    newDealsResult,
    tasksCompletedResult,
    tasksOverdueResult,
    newContactsResult,
  ] = await Promise.all([
    // Meetings held in period
    supabase
      .from('meetings')
      .select('id, title, start_time, attendees_count, summary')
      .eq('owner_user_id', userId)
      .gte('start_time', startIso)
      .lte('start_time', endIso)
      .gt('attendees_count', 1)
      .order('start_time', { ascending: false })
      .limit(50),

    // Activities in period
    supabase
      .from('activities')
      .select('id, type, subject, created_at, metadata')
      .eq('user_id', userId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(100),

    // Deals updated (stage changed) in period — approximate via updated_at
    supabase
      .from('deals')
      .select('id, title, stage, value, owner_id')
      .eq('owner_id', userId)
      .gte('updated_at', startIso)
      .lte('updated_at', endIso)
      .not('stage', 'in', '("Closed Won","Closed Lost","closed_won","closed_lost")')
      .order('updated_at', { ascending: false })
      .limit(20),

    // New deals created in period
    supabase
      .from('deals')
      .select('id, title, stage, value, owner_id')
      .eq('owner_id', userId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(20),

    // Tasks completed in period
    supabase
      .from('tasks')
      .select('id, title, status, completed_at')
      .or(`assigned_to.eq.${userId},owner_id.eq.${userId}`)
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lte('completed_at', endIso)
      .limit(50),

    // Tasks overdue as of now (due_date past, not completed)
    supabase
      .from('tasks')
      .select('id, title, status, due_date')
      .or(`assigned_to.eq.${userId},owner_id.eq.${userId}`)
      .neq('status', 'completed')
      .lt('due_date', new Date().toISOString())
      .limit(20),

    // New contacts added in period
    supabase
      .from('contacts')
      .select('id, first_name, last_name, company')
      .eq('owner_id', userId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const meetings = meetingsResult.data || [];
  const activities = activitiesResult.data || [];
  const dealsMoved = dealsMovedResult.data || [];
  const newDeals = newDealsResult.data || [];
  const tasksCompleted = tasksCompletedResult.data || [];
  const tasksOverdue = tasksOverdueResult.data || [];
  const newContacts = newContactsResult.data || [];

  // --- Derive metrics ---

  // Meetings
  const now = new Date();
  const meetingsHeld = meetings.filter(
    (m) => m.start_time && new Date(m.start_time) <= now
  );
  const meetingsUpcoming = meetings.filter(
    (m) => m.start_time && new Date(m.start_time) > now
  );
  const externalMeetings = meetingsHeld.filter((m) => m.attendees_count > 1);
  const internalMeetings = meetingsHeld.filter((m) => m.attendees_count <= 1);

  // Emails
  const emailsSent = activities.filter((a) => {
    const type = (a.type || '').toLowerCase();
    const meta = a.metadata as Record<string, unknown>;
    return type === 'email' && (meta?.direction === 'outbound' || meta?.status === 'sent');
  });
  const emailsReceived = activities.filter((a) => {
    const type = (a.type || '').toLowerCase();
    const meta = a.metadata as Record<string, unknown>;
    return type === 'email' && meta?.direction === 'inbound';
  });
  // Threads awaiting reply: sent emails without a subsequent inbound activity
  const threadsAwaitingReply = emailsSent.filter((sent) => {
    const meta = sent.metadata as Record<string, unknown>;
    const thread = meta?.thread_id;
    if (!thread) return false;
    return !emailsReceived.some((r) => {
      const rMeta = r.metadata as Record<string, unknown>;
      return rMeta?.thread_id === thread && new Date(r.created_at) > new Date(sent.created_at);
    });
  }).length;

  // Deals pipeline change
  const pipelineChange = newDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const pipelineChangeFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(pipelineChange));
  const pipelineSign = pipelineChange >= 0 ? '+' : '-';

  // --- Build blocks ---
  const blocks: unknown[] = [];

  blocks.push(section(`*YOUR ACTIVITY — ${range.label}*`));
  blocks.push(divider());

  // Meetings section
  const meetingLines: string[] = [];
  meetingLines.push(`${meetingsHeld.length} meeting${meetingsHeld.length !== 1 ? 's' : ''} held (${externalMeetings.length} external, ${internalMeetings.length} internal)`);
  if (meetingsUpcoming.length > 0) {
    meetingLines.push(`${meetingsUpcoming.length} upcoming this ${range.shortLabel.toLowerCase().includes('week') ? 'week' : 'period'}`);
  }
  blocks.push(section(`*MEETINGS*\n${meetingLines.map((l) => `• ${l}`).join('\n')}`));

  // Emails section
  const emailLines: string[] = [
    `${emailsSent.length} email${emailsSent.length !== 1 ? 's' : ''} sent`,
    `${emailsReceived.length} received`,
  ];
  if (threadsAwaitingReply > 0) {
    emailLines.push(`${threadsAwaitingReply} thread${threadsAwaitingReply !== 1 ? 's' : ''} awaiting reply`);
  }
  blocks.push(section(`*EMAILS*\n${emailLines.map((l) => `• ${l}`).join('\n')}`));

  // Deals section
  const dealLines: string[] = [];
  if (dealsMoved.length > 0) {
    // Show top 2 deals that moved
    for (const d of dealsMoved.slice(0, 2)) {
      const valueStr = d.value != null
        ? `, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(d.value)}`
        : '';
      dealLines.push(`1 deal moved to ${d.stage} (${d.title}${valueStr})`);
    }
  }
  if (newDeals.length > 0) {
    dealLines.push(`${newDeals.length} new deal${newDeals.length !== 1 ? 's' : ''} created`);
  }
  if (pipelineChange !== 0) {
    dealLines.push(`Pipeline change: ${pipelineSign}${pipelineChangeFormatted}`);
  }
  if (dealLines.length === 0) {
    dealLines.push('No deal activity this period');
  }
  blocks.push(section(`*DEALS*\n${dealLines.map((l) => `• ${l}`).join('\n')}`));

  // New contacts section
  if (newContacts.length > 0) {
    blocks.push(section(`*CONTACTS*\n• ${newContacts.length} new contact${newContacts.length !== 1 ? 's' : ''} added`));
  }

  // Tasks section
  const taskLines: string[] = [
    `${tasksCompleted.length} completed`,
  ];
  if (tasksOverdue.length > 0) {
    taskLines.push(`${tasksOverdue.length} overdue`);
  }
  blocks.push(section(`*TASKS*\n${taskLines.map((l) => `• ${l}`).join('\n')}`));

  // Summary fields
  blocks.push(divider());
  blocks.push(
    fields([
      { label: 'Meetings', value: `${meetingsHeld.length} held` },
      { label: 'Emails Sent', value: `${emailsSent.length}` },
      { label: 'New Deals', value: `${newDeals.length}` },
      { label: 'Tasks Done', value: `${tasksCompleted.length}` },
    ])
  );

  // Action buttons
  const priorRange = getPriorDateRange(range);
  blocks.push(
    actions([
      {
        text: 'Show details',
        actionId: 'copilot_metrics_details',
        value: JSON.stringify({ start: startIso, end: endIso }),
        style: 'primary',
      },
      {
        text: `Compare to ${priorRange.shortLabel}`,
        actionId: 'copilot_metrics_compare',
        value: JSON.stringify({
          current: { start: startIso, end: endIso },
          prior: { start: priorRange.start.toISOString(), end: priorRange.end.toISOString() },
        }),
      },
    ])
  );

  blocks.push(
    context([
      `${appLink('/pipeline', 'View pipeline')} | ${appLink('/calendar', 'View calendar')} | ${appLink('/tasks', 'View tasks')}`,
    ])
  );

  return { blocks };
}
