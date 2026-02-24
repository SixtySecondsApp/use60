/**
 * Action Centre Utilities
 *
 * Helper functions for the Action Centre components.
 */

import type { ActionCentreItem, DisplayAction, ActionEntity } from './types';

/**
 * Format a date as relative time (e.g., "2m", "5h", "3d")
 */
export function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  const diff = now.getTime() - then.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

/**
 * Get date threshold for date filter
 */
export function getDateThreshold(filter: 'all' | 'today' | '7days' | '30days'): Date | null {
  if (filter === 'all') return null;

  const now = new Date();
  switch (filter) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case '7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * Convert database item to display format with enriched data
 */
export function toDisplayAction(item: ActionCentreItem): DisplayAction {
  const entities: ActionEntity[] = [];
  const previewData = item.preview_data || {};

  // Extract entities from preview_data
  if (previewData.contact_name) {
    entities.push({
      type: 'contact',
      id: item.contact_id || undefined,
      name: String(previewData.contact_name),
      avatar: getInitials(String(previewData.contact_name)),
    });
  }

  if (previewData.deal_name) {
    entities.push({
      type: 'deal',
      id: item.deal_id || undefined,
      name: String(previewData.deal_name),
      value: previewData.deal_value ? String(previewData.deal_value) : undefined,
    });
  }

  if (previewData.company_name) {
    entities.push({
      type: 'company',
      name: String(previewData.company_name),
    });
  }

  // Determine priority based on risk and age
  const age = Date.now() - new Date(item.created_at).getTime();
  const hoursOld = age / (1000 * 60 * 60);
  let priority: 'urgent' | 'high' | 'normal' = 'normal';

  if (item.risk_level === 'high' || hoursOld > 24) {
    priority = 'urgent';
  } else if (item.risk_level === 'medium' || hoursOld > 12) {
    priority = 'high';
  }

  // Map source_type to human-readable source
  const sourceMap: Record<string, string> = {
    proactive_pipeline: 'Pipeline Analysis',
    proactive_meeting: 'Meeting Prep',
    copilot_conversation: 'Copilot',
    sequence: 'Sequence',
  };

  return {
    ...item,
    priority,
    source: sourceMap[item.source_type] || 'AI',
    entities,
    aiReasoning: previewData.ai_reasoning ? String(previewData.ai_reasoning) : undefined,
    details: extractDetails(item),
  };
}

/**
 * Extract type-specific details from preview_data
 */
function extractDetails(item: ActionCentreItem) {
  const data = item.preview_data || {};

  switch (item.action_type) {
    case 'email':
      if (data.to || data.subject || data.body) {
        return {
          to: String(data.to || ''),
          cc: data.cc ? String(data.cc) : undefined,
          subject: String(data.subject || ''),
          body: String(data.body || ''),
        };
      }
      break;

    case 'slack_message':
      if (data.channel || data.message) {
        return {
          channel: String(data.channel || ''),
          message: String(data.message || ''),
        };
      }
      break;

    case 'task':
      if (data.title || data.taskTitle) {
        return {
          taskTitle: String(data.taskTitle || data.title || ''),
          dueDate: String(data.dueDate || data.due_date || ''),
          assignee: data.assignee ? String(data.assignee) : undefined,
          priority: data.priority ? String(data.priority) : undefined,
          notes: data.notes ? String(data.notes) : undefined,
        };
      }
      break;

    case 'insight':
      if (data.metric || data.current) {
        return {
          metric: String(data.metric || ''),
          current: String(data.current || ''),
          target: String(data.target || ''),
          trend: data.trend as 'up' | 'down' | 'stable' | undefined,
          change: data.change ? String(data.change) : undefined,
          breakdown: data.breakdown as Array<{ stage: string; count: number; value: string }> | undefined,
          recommendation: data.recommendation ? String(data.recommendation) : undefined,
        };
      }
      break;

    case 'alert':
      if (data.riskFactors || data.lastActivity) {
        return {
          lastActivity: String(data.lastActivity || data.last_activity || ''),
          dealValue: String(data.dealValue || data.deal_value || ''),
          dealStage: data.dealStage ? String(data.dealStage) : undefined,
          closeDate: data.closeDate ? String(data.closeDate) : undefined,
          riskFactors: Array.isArray(data.riskFactors) ? data.riskFactors.map(String) : [],
          suggestedActions: Array.isArray(data.suggestedActions) ? data.suggestedActions.map(String) : [],
        };
      }
      break;

    case 'meeting_prep':
      if (data.meetingTime || data.attendees) {
        return {
          meetingTime: String(data.meetingTime || data.meeting_time || ''),
          duration: String(data.duration || ''),
          meetingType: String(data.meetingType || data.meeting_type || ''),
          attendees: Array.isArray(data.attendees) ? data.attendees : [],
          agenda: Array.isArray(data.agenda) ? data.agenda.map(String) : [],
          talkingPoints: Array.isArray(data.talkingPoints) ? data.talkingPoints.map(String) : [],
          competitiveIntel: data.competitiveIntel ? String(data.competitiveIntel) : undefined,
        };
      }
      break;
  }

  return undefined;
}

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
