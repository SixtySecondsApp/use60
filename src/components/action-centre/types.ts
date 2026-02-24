/**
 * Action Centre Types
 *
 * Shared type definitions for the Action Centre components.
 */

// Base action type from database
export interface ActionCentreItem {
  id: string;
  user_id: string;
  organization_id: string;
  action_type: ActionType;
  risk_level: RiskLevel;
  title: string;
  description: string | null;
  preview_data: Record<string, unknown>;
  contact_id: string | null;
  deal_id: string | null;
  meeting_id: string | null;
  status: ActionStatus;
  source_type: SourceType;
  source_id: string | null;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
  created_at: string;
  updated_at: string;
  actioned_at: string | null;
  expires_at: string;
}

export type ActionType = 'email' | 'task' | 'slack_message' | 'field_update' | 'alert' | 'insight' | 'meeting_prep';
export type RiskLevel = 'low' | 'medium' | 'high' | 'info';
export type ActionStatus = 'pending' | 'approved' | 'dismissed' | 'done' | 'expired';
export type SourceType = 'proactive_pipeline' | 'proactive_meeting' | 'copilot_conversation' | 'sequence';

// Extended action for UI display
export interface DisplayAction extends ActionCentreItem {
  priority?: 'urgent' | 'high' | 'normal';
  source?: string;
  entities?: ActionEntity[];
  aiReasoning?: string;
  details?: EmailDetails | SlackDetails | TaskDetails | InsightDetails | AlertDetails | MeetingPrepDetails;
}

// Entity types for related items
export interface ActionEntity {
  type: 'contact' | 'deal' | 'company';
  id?: string;
  name: string;
  avatar?: string;
  value?: string;
}

// Type-specific detail interfaces
export interface EmailDetails {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}

export interface SlackDetails {
  channel: string;
  message: string;
}

export interface TaskDetails {
  taskTitle: string;
  dueDate: string;
  assignee?: string;
  priority?: string;
  notes?: string;
}

export interface InsightDetails {
  metric: string;
  current: string;
  target: string;
  trend?: 'up' | 'down' | 'stable';
  change?: string;
  breakdown?: Array<{ stage: string; count: number; value: string }>;
  recommendation?: string;
}

export interface AlertDetails {
  lastActivity: string;
  dealValue: string;
  dealStage?: string;
  closeDate?: string;
  riskFactors: string[];
  suggestedActions: string[];
}

export interface MeetingPrepDetails {
  meetingTime: string;
  duration: string;
  meetingType: string;
  attendees: Array<{ name: string; title: string; role: string }>;
  agenda: string[];
  talkingPoints: string[];
  competitiveIntel?: string;
}

// Configuration types
export interface TypeConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
}

export interface RiskConfig {
  color: string;
  label: string;
  bg: string;
  border: string;
  text: string;
}

// Filter types
export type TabValue = 'pending' | 'completed' | 'activity';
export type ActionTypeFilter = 'all' | ActionType;
export type DateFilter = 'all' | 'today' | '7days' | '30days';
