/**
 * useToolResultContext Hook
 *
 * Extracts rich context data and generates smart action items from
 * autonomous copilot tool call results.
 *
 * Two responsibilities:
 * A. Context extraction — maps execute_action results to ContextItem types
 * B. Smart action items — generates proactive suggestions from tool data
 */

import { useMemo, useEffect, useRef } from 'react';
import { useCopilot } from '@/lib/contexts/CopilotContext';
import { useActionItemStore } from '@/lib/stores/actionItemStore';
import type {
  ContextItem,
  ContextSummary,
  MeetingsContext,
  PipelineContext,
  ContactsAttentionContext,
  TasksContext,
} from '@/components/copilot/CopilotRightPanel';
import type { FollowUpContent, ReminderContent } from '@/lib/stores/actionItemStore';

// =============================================================================
// Types
// =============================================================================

export interface UseToolResultContextReturn {
  toolContextItems: ContextItem[];
  toolContextSummary: Partial<ContextSummary>;
}

// =============================================================================
// Context Extraction Helpers
// =============================================================================

function extractMeetingsContext(result: any, input: any): MeetingsContext | null {
  // Handle both array and nested result shapes
  const meetings = Array.isArray(result) ? result
    : result?.meetings || result?.data?.meetings || result?.results;

  if (!meetings || !Array.isArray(meetings) || meetings.length === 0) return null;

  return {
    type: 'meetings',
    period: input?.period || input?.time_range || 'Today',
    count: meetings.length,
    meetings: meetings.slice(0, 5).map((m: any) => ({
      id: m.id || m.meeting_id || String(Math.random()),
      title: m.title || m.name || m.summary || 'Untitled',
      startTime: m.start_time || m.startTime || m.date || '',
      attendees: m.attendees?.map?.((a: any) => typeof a === 'string' ? a : a.name || a.email) || [],
      attendeeCount: m.attendees_count || m.attendeeCount || m.attendees?.length,
    })),
  };
}

function extractPipelineContext(result: any): PipelineContext | null {
  const deals = Array.isArray(result) ? result
    : result?.deals || result?.data?.deals || result?.results;

  if (!deals || !Array.isArray(deals) || deals.length === 0) return null;

  return {
    type: 'pipeline',
    count: deals.length,
    deals: deals.slice(0, 5).map((d: any) => ({
      id: d.id || d.deal_id || String(Math.random()),
      name: d.name || d.deal_name || 'Untitled Deal',
      value: d.value || d.amount || d.deal_value,
      stage: d.stage || d.stage_name || d.pipeline_stage,
      healthLevel: normalizeHealthLevel(d.health_level || d.healthLevel || d.health_score || d.risk_level),
    })),
  };
}

function extractContactsContext(result: any): ContactsAttentionContext | null {
  const contacts = Array.isArray(result) ? result
    : result?.contacts || result?.data?.contacts || result?.results;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) return null;

  return {
    type: 'contacts_attention',
    count: contacts.length,
    contacts: contacts.slice(0, 5).map((c: any) => ({
      id: c.id || c.contact_id || String(Math.random()),
      name: c.name || c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      company: c.company || c.company_name,
      daysSinceContact: c.days_since_contact || c.daysSinceContact || c.days_inactive,
      riskReason: c.risk_reason || c.riskReason || c.attention_reason,
    })),
  };
}

function extractTasksContext(result: any): TasksContext | null {
  const tasks = Array.isArray(result) ? result
    : result?.tasks || result?.data?.tasks || result?.results;

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return null;

  return {
    type: 'tasks',
    count: tasks.length,
    tasks: tasks.slice(0, 5).map((t: any) => ({
      id: t.id || t.task_id || String(Math.random()),
      title: t.title || t.name || t.description || 'Untitled Task',
      priority: normalizePriority(t.priority),
      dueDate: t.due_date || t.dueDate || t.due_at,
      isOverdue: t.is_overdue || t.isOverdue || (t.due_date && new Date(t.due_date) < new Date()),
    })),
  };
}

function normalizeHealthLevel(level: any): 'healthy' | 'at_risk' | 'critical' | undefined {
  if (!level) return undefined;
  const s = String(level).toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'red') return 'critical';
  if (s === 'at_risk' || s === 'at risk' || s === 'medium' || s === 'yellow' || s === 'warning') return 'at_risk';
  if (s === 'healthy' || s === 'good' || s === 'green' || s === 'low') return 'healthy';
  // Numeric scores: 0-40 critical, 40-70 at_risk, 70+ healthy
  const num = Number(level);
  if (!isNaN(num)) {
    if (num < 40) return 'critical';
    if (num < 70) return 'at_risk';
    return 'healthy';
  }
  return undefined;
}

function normalizePriority(p: any): 'high' | 'medium' | 'low' | undefined {
  if (!p) return undefined;
  const s = String(p).toLowerCase();
  if (s === 'high' || s === 'urgent' || s === '1') return 'high';
  if (s === 'medium' || s === 'normal' || s === '2') return 'medium';
  if (s === 'low' || s === '3') return 'low';
  return undefined;
}

// =============================================================================
// Action Item Generation Helpers
// =============================================================================

function generateMeetingActionItems(meetings: MeetingsContext['meetings']) {
  const store = useActionItemStore.getState();
  const existingItems = store.items;

  for (const meeting of meetings.slice(0, 2)) {
    // Only create for meetings with external attendees
    if (!meeting.attendees?.length && !meeting.attendeeCount) continue;

    const attendeeName = meeting.attendees?.[0] || 'attendees';
    const entityKey = `meeting-${meeting.id}`;

    // Check if already exists
    if (existingItems.some(item =>
      item.context.calendarEventId === meeting.id && item.type === 'follow-up'
    )) continue;

    store.addItem({
      type: 'follow-up',
      title: `Send check-in email about "${meeting.title}"`,
      preview: `Check in with ${attendeeName} about the upcoming meeting`,
      content: {
        to: typeof attendeeName === 'string' ? attendeeName : '',
        subject: `Re: ${meeting.title}`,
        body: `Hi — just wanted to check in ahead of our meeting. Looking forward to connecting.`,
      } as FollowUpContent,
      context: {
        calendarEventId: meeting.id,
      },
      actions: ['preview', 'edit', 'approve', 'dismiss'],
    });
  }
}

function generateDealActionItems(deals: PipelineContext['deals']) {
  const store = useActionItemStore.getState();
  const existingItems = store.items;

  for (const deal of deals) {
    if (deal.healthLevel !== 'at_risk' && deal.healthLevel !== 'critical') continue;

    if (existingItems.some(item =>
      item.context.hubspotDealId === deal.id && item.type === 'reminder'
    )) continue;

    store.addItem({
      type: 'reminder',
      title: `Follow up on ${deal.name}`,
      preview: `${deal.healthLevel === 'critical' ? 'Critical' : 'At risk'} — needs attention`,
      content: {
        message: `Deal "${deal.name}" is ${deal.healthLevel === 'critical' ? 'critical' : 'at risk'}. Consider reaching out to move it forward.`,
        entityType: 'deal',
        entityId: deal.id,
        entityName: deal.name,
      } as ReminderContent,
      context: {
        hubspotDealId: deal.id,
        hubspotDealName: deal.name,
      },
      actions: ['preview', 'approve', 'dismiss'],
    });
  }
}

function generateContactActionItems(contacts: ContactsAttentionContext['contacts']) {
  const store = useActionItemStore.getState();
  const existingItems = store.items;

  for (const contact of contacts.slice(0, 2)) {
    if (existingItems.some(item =>
      item.context.hubspotContactId === contact.id && item.type === 'follow-up'
    )) continue;

    const daysPart = contact.daysSinceContact != null ? ` — ${contact.daysSinceContact} days since last contact` : '';

    store.addItem({
      type: 'follow-up',
      title: `Re-engage ${contact.name}${contact.company ? ` at ${contact.company}` : ''}`,
      preview: `No recent contact${daysPart}`,
      content: {
        to: contact.name,
        subject: `Checking in`,
        body: `Hi ${contact.name.split(' ')[0]} — it's been a while since we last connected. Wanted to check in and see how things are going.`,
      } as FollowUpContent,
      context: {
        hubspotContactId: contact.id,
        hubspotContactName: contact.name,
      },
      actions: ['preview', 'edit', 'approve', 'dismiss'],
    });
  }
}

function generateTaskActionItems(tasks: TasksContext['tasks']) {
  const store = useActionItemStore.getState();
  const existingItems = store.items;

  for (const task of tasks) {
    if (!task.isOverdue && task.priority !== 'high') continue;

    // Use title hash as dedup key since tasks may not have stable IDs
    const dedupKey = `task-${task.id}`;
    if (existingItems.some(item =>
      item.title.includes(task.title) && item.type === 'reminder'
    )) continue;

    store.addItem({
      type: 'reminder',
      title: `${task.isOverdue ? 'Overdue: ' : 'High priority: '}${task.title}`,
      preview: task.isOverdue
        ? `Was due ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}`
        : 'Needs attention',
      content: {
        message: `Task "${task.title}" ${task.isOverdue ? 'is overdue' : 'is high priority'} and needs your attention.`,
      } as ReminderContent,
      context: {},
      actions: ['preview', 'approve', 'dismiss'],
    });
  }
}

// =============================================================================
// Main Hook
// =============================================================================

export function useToolResultContext(): UseToolResultContextReturn {
  const { autonomousMode, autonomousMessages, conversationId } = useCopilot();
  const processedToolCallIds = useRef<Set<string>>(new Set());

  // Clear processed IDs when conversation changes
  useEffect(() => {
    processedToolCallIds.current.clear();
  }, [conversationId]);

  // A. Context extraction from tool results
  const { toolContextItems, toolContextSummary } = useMemo(() => {
    if (!autonomousMode.enabled) {
      return { toolContextItems: [] as ContextItem[], toolContextSummary: {} as Partial<ContextSummary> };
    }

    const contextMap = new Map<string, ContextItem>();
    const summary: Partial<ContextSummary> = {};

    // Scan all assistant messages for completed execute_action tool calls
    for (const msg of autonomousMessages) {
      if (msg.role !== 'assistant' || !msg.toolCalls) continue;

      for (const tc of msg.toolCalls) {
        if (tc.status !== 'completed' || !tc.result) continue;
        if (tc.name !== 'execute_action') continue;

        const action = (tc.input as any)?.action;
        const result = tc.result;

        switch (action) {
          case 'get_meetings_for_period':
          case 'get_next_meeting':
          case 'get_meetings': {
            const ctx = extractMeetingsContext(result, tc.input);
            if (ctx) {
              contextMap.set('meetings', ctx);
              summary.meetingCount = ctx.count;
            }
            break;
          }
          case 'get_pipeline_deals':
          case 'get_deals':
          case 'search_deals': {
            const ctx = extractPipelineContext(result);
            if (ctx) {
              contextMap.set('pipeline', ctx);
              summary.dealCount = ctx.count;
            }
            break;
          }
          case 'get_contacts_needing_attention':
          case 'get_contacts':
          case 'search_contacts': {
            const ctx = extractContactsContext(result);
            if (ctx) {
              contextMap.set('contacts_attention', ctx);
              summary.contactCount = ctx.count;
            }
            break;
          }
          case 'list_tasks':
          case 'get_tasks':
          case 'search_tasks': {
            const ctx = extractTasksContext(result);
            if (ctx) {
              contextMap.set('tasks', ctx);
              summary.taskCount = ctx.count;
            }
            break;
          }
        }
      }
    }

    return {
      toolContextItems: Array.from(contextMap.values()),
      toolContextSummary: summary,
    };
  }, [autonomousMode.enabled, autonomousMessages]);

  // B. Smart action item generation
  useEffect(() => {
    if (!autonomousMode.enabled) return;

    for (const msg of autonomousMessages) {
      if (msg.role !== 'assistant' || !msg.toolCalls) continue;

      for (const tc of msg.toolCalls) {
        if (tc.status !== 'completed' || !tc.result) continue;
        if (tc.name !== 'execute_action') continue;
        if (processedToolCallIds.current.has(tc.id)) continue;

        processedToolCallIds.current.add(tc.id);

        const action = (tc.input as any)?.action;
        const result = tc.result;

        switch (action) {
          case 'get_meetings_for_period':
          case 'get_next_meeting':
          case 'get_meetings': {
            const ctx = extractMeetingsContext(result, tc.input);
            if (ctx) generateMeetingActionItems(ctx.meetings);
            break;
          }
          case 'get_pipeline_deals':
          case 'get_deals': {
            const ctx = extractPipelineContext(result);
            if (ctx) generateDealActionItems(ctx.deals);
            break;
          }
          case 'get_contacts_needing_attention': {
            const ctx = extractContactsContext(result);
            if (ctx) generateContactActionItems(ctx.contacts);
            break;
          }
          case 'list_tasks':
          case 'get_tasks': {
            const ctx = extractTasksContext(result);
            if (ctx) generateTaskActionItems(ctx.tasks);
            break;
          }
        }
      }
    }
  }, [autonomousMode.enabled, autonomousMessages]);

  return { toolContextItems, toolContextSummary };
}

export default useToolResultContext;
