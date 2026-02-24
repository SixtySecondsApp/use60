/**
 * Command Centre — Unified Task System Types
 *
 * Type definitions for the AI-powered Command Centre that consolidates
 * Tasks, Action Centre, Next Action Suggestions, and Meeting Action Items.
 */

import {
  Mail,
  RefreshCw,
  FileSearch,
  CalendarClock,
  Target,
  FileText,
  Phone,
  Pencil,
  BellRing,
  Lightbulb,
  Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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

export type CommandCentreSortField = 'urgency' | 'created_at' | 'due_date' | 'priority' | 'ai_status';

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
// UI Config Map Interfaces
// ============================================================

export interface PriorityConfig {
  color: string;
  dotColor: string;
  label: string;
}

export interface TaskTypeConfig {
  icon: LucideIcon;
  label: string;
  color: string;
  bg: string;
}

// ============================================================
// Shared UI Config Maps (single source of truth)
// ============================================================

export const priorityConfig: Record<string, { color: string; dotColor: string; label: string }> = {
  urgent: { color: 'text-red-500', dotColor: 'bg-red-400', label: 'Urgent' },
  high: { color: 'text-orange-500', dotColor: 'bg-orange-400', label: 'High' },
  medium: { color: 'text-blue-500', dotColor: 'bg-blue-400', label: 'Medium' },
  low: { color: 'text-slate-500', dotColor: 'bg-slate-400', label: 'Low' },
};

export interface TaskTypeConfigEntry {
  icon: LucideIcon;
  label: string;
  color: string;
  bg: string;
}

export const taskTypeConfig: Record<string, TaskTypeConfigEntry> = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  follow_up: { icon: RefreshCw, label: 'Follow-up', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
  research: { icon: FileSearch, label: 'Research', color: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
  meeting_prep: { icon: CalendarClock, label: 'Meeting Prep', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  crm_update: { icon: Target, label: 'CRM Update', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  proposal: { icon: FileText, label: 'Proposal', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  call: { icon: Phone, label: 'Call', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-500/10' },
  content: { icon: Pencil, label: 'Content', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-500/10' },
  alert: { icon: BellRing, label: 'Alert', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-500/10' },
  meeting: { icon: CalendarClock, label: 'Meeting', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  demo: { icon: CalendarClock, label: 'Demo', color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  general: { icon: Circle, label: 'General', color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-500/10' },
  slack_message: { icon: Mail, label: 'Slack', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-500/10' },
};
