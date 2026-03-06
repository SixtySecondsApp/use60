/**
 * Daily Work Queue Service
 *
 * Aggregates follow-ups, at-risk deals, pending tasks, and commitment debt
 * into a single ranked queue with normalized priority scores.
 *
 * Each queue item includes:
 * - Recommended action
 * - Expected impact
 * - Estimated time
 * - Source system for writeback
 */

import { supabase } from '../supabase/clientV2'

// =============================================================================
// Types
// =============================================================================

export type QueueItemType =
  | 'follow_up'
  | 'at_risk_deal'
  | 'pending_task'
  | 'stale_contact'
  | 'commitment_due'
  | 'meeting_prep'
  | 'email_reply';

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface DailyQueueItem {
  id: string;
  type: QueueItemType;
  title: string;
  description: string;
  recommendedAction: string;
  impact: ImpactLevel;
  estimatedMinutes: number;
  priorityScore: number; // 0-100, higher = more urgent
  sourceEntity: {
    type: 'deal' | 'contact' | 'task' | 'meeting';
    id: string;
    name: string;
  };
  deadline?: string;
  metadata?: Record<string, unknown>;
}

export interface DailyWorkQueue {
  items: DailyQueueItem[];
  totalItems: number;
  totalEstimatedMinutes: number;
  generatedAt: string;
  breakdown: {
    followUps: number;
    atRiskDeals: number;
    pendingTasks: number;
    staleContacts: number;
    commitmentsDue: number;
    meetingPrep: number;
  };
}

// =============================================================================
// Priority Scoring
// =============================================================================

function computePriorityScore(
  type: QueueItemType,
  daysOverdue: number,
  dealValue: number | null,
  urgency: string | null,
): number {
  let base = 0;

  // Base score by type
  switch (type) {
    case 'commitment_due': base = 80; break;
    case 'at_risk_deal': base = 75; break;
    case 'meeting_prep': base = 70; break;
    case 'follow_up': base = 60; break;
    case 'email_reply': base = 55; break;
    case 'pending_task': base = 50; break;
    case 'stale_contact': base = 30; break;
  }

  // Overdue boost (up to +15)
  if (daysOverdue > 0) {
    base += Math.min(daysOverdue * 3, 15);
  }

  // Deal value boost (up to +5)
  if (dealValue && dealValue > 10000) {
    base += Math.min(Math.floor(dealValue / 10000), 5);
  }

  // Urgency boost
  if (urgency === 'high') base += 5;

  return Math.min(base, 100);
}

function estimateMinutes(type: QueueItemType): number {
  switch (type) {
    case 'follow_up': return 5;
    case 'email_reply': return 3;
    case 'meeting_prep': return 10;
    case 'at_risk_deal': return 15;
    case 'pending_task': return 10;
    case 'stale_contact': return 5;
    case 'commitment_due': return 10;
    default: return 5;
  }
}

// =============================================================================
// Queue Builder
// =============================================================================

/**
 * Build the daily work queue for a user.
 */
export async function buildDailyWorkQueue(userId: string): Promise<DailyWorkQueue> {
  const items: DailyQueueItem[] = [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch data sources in parallel
  const [tasksResult, dealsResult, staleContactsResult, meetingsResult] = await Promise.all([
    // Pending tasks
    supabase
      .from('tasks')
      .select('id, title, description, due_date, priority, deal_id, contact_id')
      .eq('assigned_to', userId)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),

    // At-risk deals (stale or closing soon)
    supabase
      .from('deals')
      .select('id, title, stage, value, close_date, status, last_activity_at')
      .eq('owner_id', userId)
      .eq('status', 'active')
      .or(`close_date.lte.${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()},last_activity_at.lt.${sevenDaysAgo}`)
      .limit(10),

    // Stale contacts (no activity in 14+ days)
    supabase
      .from('contacts')
      .select('id, full_name, email, last_contacted_at, company_id')
      .eq('owner_id', userId)
      .lt('last_contacted_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .not('last_contacted_at', 'is', null)
      .limit(10),

    // Today's meetings (for prep)
    supabase
      .from('calendar_events')
      .select('id, title, start_time, attendees')
      .eq('user_id', userId)
      .gte('start_time', `${today}T00:00:00Z`)
      .lte('start_time', `${today}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(10),
  ]);

  // Process tasks
  if (tasksResult.data) {
    for (const task of tasksResult.data) {
      const dueDate = (task as any).due_date ? new Date((task as any).due_date) : null;
      const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;

      items.push({
        id: `task_${(task as any).id}`,
        type: daysOverdue > 0 ? 'commitment_due' : 'pending_task',
        title: (task as any).title,
        description: (task as any).description || 'No description',
        recommendedAction: daysOverdue > 0 ? 'Complete overdue task or reschedule' : 'Complete task',
        impact: daysOverdue > 2 ? 'high' : daysOverdue > 0 ? 'medium' : 'low',
        estimatedMinutes: estimateMinutes(daysOverdue > 0 ? 'commitment_due' : 'pending_task'),
        priorityScore: computePriorityScore(
          daysOverdue > 0 ? 'commitment_due' : 'pending_task',
          Math.max(daysOverdue, 0),
          null,
          (task as any).priority,
        ),
        sourceEntity: { type: 'task', id: (task as any).id, name: (task as any).title },
        deadline: (task as any).due_date,
      });
    }
  }

  // Process at-risk deals
  if (dealsResult.data) {
    for (const deal of dealsResult.data) {
      const lastActivity = (deal as any).last_activity_at ? new Date((deal as any).last_activity_at) : null;
      const daysSinceActivity = lastActivity ? Math.floor((now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000)) : 30;
      const isClosingSoon = (deal as any).close_date && new Date((deal as any).close_date).getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;

      items.push({
        id: `deal_${(deal as any).id}`,
        type: 'at_risk_deal',
        title: (deal as any).title,
        description: isClosingSoon
          ? `Closing soon — ${(deal as any).stage}`
          : `No activity in ${daysSinceActivity} days`,
        recommendedAction: isClosingSoon
          ? 'Review deal and confirm next steps with buyer'
          : 'Re-engage with stakeholder or update deal status',
        impact: 'high',
        estimatedMinutes: estimateMinutes('at_risk_deal'),
        priorityScore: computePriorityScore('at_risk_deal', daysSinceActivity, (deal as any).value, null),
        sourceEntity: { type: 'deal', id: (deal as any).id, name: (deal as any).title },
        deadline: (deal as any).close_date,
        metadata: { stage: (deal as any).stage, value: (deal as any).value },
      });
    }
  }

  // Process stale contacts
  if (staleContactsResult.data) {
    for (const contact of staleContactsResult.data) {
      const lastContacted = (contact as any).last_contacted_at ? new Date((contact as any).last_contacted_at) : null;
      const daysSince = lastContacted ? Math.floor((now.getTime() - lastContacted.getTime()) / (24 * 60 * 60 * 1000)) : 30;

      items.push({
        id: `contact_${(contact as any).id}`,
        type: 'stale_contact',
        title: (contact as any).full_name || (contact as any).email || 'Unknown contact',
        description: `Last contacted ${daysSince} days ago`,
        recommendedAction: 'Send a check-in or schedule a call',
        impact: daysSince > 30 ? 'medium' : 'low',
        estimatedMinutes: estimateMinutes('stale_contact'),
        priorityScore: computePriorityScore('stale_contact', daysSince, null, null),
        sourceEntity: { type: 'contact', id: (contact as any).id, name: (contact as any).full_name || 'Unknown' },
      });
    }
  }

  // Process today's meetings (prep items)
  if (meetingsResult.data) {
    for (const meeting of meetingsResult.data) {
      const startTime = new Date((meeting as any).start_time);
      const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / 60000);

      if (minutesUntil > 0) {
        items.push({
          id: `meeting_${(meeting as any).id}`,
          type: 'meeting_prep',
          title: `Prep: ${(meeting as any).title}`,
          description: `Starts in ${minutesUntil < 60 ? `${minutesUntil}m` : `${Math.floor(minutesUntil / 60)}h`}`,
          recommendedAction: 'Review meeting brief and prepare talking points',
          impact: minutesUntil < 60 ? 'high' : 'medium',
          estimatedMinutes: estimateMinutes('meeting_prep'),
          priorityScore: computePriorityScore('meeting_prep', 0, null, minutesUntil < 60 ? 'high' : null),
          sourceEntity: { type: 'meeting', id: (meeting as any).id, name: (meeting as any).title },
          deadline: (meeting as any).start_time,
        });
      }
    }
  }

  // Sort by priority score descending
  items.sort((a, b) => b.priorityScore - a.priorityScore);

  const breakdown = {
    followUps: items.filter((i) => i.type === 'follow_up' || i.type === 'email_reply').length,
    atRiskDeals: items.filter((i) => i.type === 'at_risk_deal').length,
    pendingTasks: items.filter((i) => i.type === 'pending_task').length,
    staleContacts: items.filter((i) => i.type === 'stale_contact').length,
    commitmentsDue: items.filter((i) => i.type === 'commitment_due').length,
    meetingPrep: items.filter((i) => i.type === 'meeting_prep').length,
  };

  return {
    items,
    totalItems: items.length,
    totalEstimatedMinutes: items.reduce((sum, i) => sum + i.estimatedMinutes, 0),
    generatedAt: now.toISOString(),
    breakdown,
  };
}
