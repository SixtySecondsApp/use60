/**
 * Command Centre — Unified Task System Types
 *
 * Type definitions for the AI-powered Command Centre that consolidates
 * Tasks, Action Centre, Next Action Suggestions, and Meeting Action Items.
 */

// ============================================================
// Core Type Unions
// ============================================================

export type TaskSource =
  | 'manual'
  | 'ai_proactive'
  | 'meeting_transcript'
  | 'meeting_ai'
  | 'email_detected'
  | 'deal_signal'
  | 'calendar_trigger'
  | 'copilot';

export type TaskAIStatus =
  | 'none'
  | 'queued'
  | 'working'
  | 'draft_ready'
  | 'approved'
  | 'executed'
  | 'failed'
  | 'expired';

export type DeliverableType =
  | 'email_draft'
  | 'research_brief'
  | 'meeting_prep'
  | 'crm_update'
  | 'content_draft'
  | 'action_plan'
  | 'insight'
  | 'campaign_workflow';

export type RiskLevel = 'low' | 'medium' | 'high' | 'info';

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'overdue'
  | 'pending_review'
  | 'ai_working'
  | 'draft_ready'
  | 'approved'
  | 'dismissed'
  | 'expired';

export type TaskType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'follow_up'
  | 'proposal'
  | 'demo'
  | 'general'
  | 'research'
  | 'meeting_prep'
  | 'crm_update'
  | 'slack_message'
  | 'content'
  | 'alert'
  | 'insight';

export type TriggerEvent =
  | 'meeting_ended'
  | 'deal_stale'
  | 'deal_stage_change'
  | 'calendar_approaching'
  | 'email_received'
  | 'copilot_request'
  | 'pipeline_analysis';

// ============================================================
// Deliverable Data Variants
// ============================================================

export interface EmailDraftDeliverable {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachments?: { name: string; url?: string }[];
}

export interface ResearchBriefDeliverable {
  company_overview?: string;
  key_people?: { name: string; title: string; linkedin_url?: string }[];
  tech_stack?: string[];
  recent_news?: { headline: string; date: string; url?: string }[];
  competitive_landscape?: string;
  sections: { title: string; content: string; status: 'complete' | 'generating' }[];
}

export interface MeetingPrepDeliverable {
  meeting_date: string;
  duration_minutes: number;
  attendees: { name: string; title: string; notes?: string }[];
  deal_context?: string;
  talking_points: string[];
  risks: { description: string; severity: RiskLevel }[];
  open_questions: string[];
  agenda_suggestions: string[];
}

export interface CrmUpdateDeliverable {
  entity_type: 'deal' | 'contact' | 'company';
  entity_id: string;
  entity_name: string;
  changes: { field: string; old_value: string; new_value: string; reason: string }[];
}

export interface ContentDraftDeliverable {
  content_type: 'linkedin_post' | 'email_sequence' | 'proposal_section' | 'other';
  title: string;
  body: string;
}

export interface ActionPlanDeliverable {
  summary: string;
  options: { label: string; description: string; recommended: boolean }[];
}

export interface InsightDeliverable {
  summary: string;
  data_points: { label: string; value: string; trend?: 'up' | 'down' | 'flat' }[];
  recommendations: string[];
}

export interface CampaignWorkflowDeliverable {
  type: 'campaign_workflow';
  prompt?: string;
  conversation_id?: string;
  table_id?: string;
  table_name?: string;
  campaign_name?: string;
  leads_found?: number;
  emails_generated?: number;
  steps?: { step: string; status: string; summary?: string }[];
  duration_ms?: number;
  error?: string;
  started_at?: string;
}

export type DeliverableData =
  | EmailDraftDeliverable
  | ResearchBriefDeliverable
  | MeetingPrepDeliverable
  | CrmUpdateDeliverable
  | ContentDraftDeliverable
  | ActionPlanDeliverable
  | InsightDeliverable
  | CampaignWorkflowDeliverable;

// ============================================================
// Task Comments & Activity
// ============================================================

export interface TaskComment {
  id: string;
  task_id: string;
  author: string;
  author_avatar?: string;
  content: string;
  is_ai: boolean;
  created_at: string;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  action: string;
  actor: 'ai' | 'user';
  actor_name?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Filter & UI State Types
// ============================================================

export type CommandCentreFilter = 'all' | 'review' | 'drafts' | 'working' | 'done';

export type CommandCentreSortField = 'created_at' | 'due_date' | 'priority' | 'ai_status';

export type CommandCentreSortOrder = 'asc' | 'desc';

export interface CommandCentreFilterState {
  activeFilter: CommandCentreFilter;
  statusFilter?: TaskStatus[];
  typeFilter?: TaskType[];
  sourceFilter?: TaskSource[];
  priorityFilter?: TaskPriority[];
  searchQuery: string;
  sortField: CommandCentreSortField;
  sortOrder: CommandCentreSortOrder;
}

export interface CommandCentreFilterCounts {
  all: number;
  review: number;
  drafts: number;
  working: number;
  done: number;
}

// ============================================================
// UI Config Maps
// ============================================================

export interface PriorityConfig {
  color: string;
  dotColor: string;
  label: string;
}

export interface TaskTypeConfig {
  icon: string;
  label: string;
  color: string;
  bg: string;
}
