/**
 * Copilot Adapters - shared types (Deno)
 *
 * These adapters are used by api-copilot's execute_action tool to provide a
 * stable execution layer across CRM/meetings/email/notifications.
 */

export type SkillCategory =
  | 'sales-ai'
  | 'writing'
  | 'enrichment'
  | 'workflows'
  | 'data-access'
  | 'output-format'
  | 'agent-sequence';

export interface SkillDoc {
  skill_key: string;
  category: SkillCategory | string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export type ExecuteActionName =
  | 'get_contact'
  | 'get_lead'
  | 'get_deal'
  | 'get_pipeline_summary'
  | 'get_pipeline_deals'
  | 'get_pipeline_forecast'
  | 'get_contacts_needing_attention'
  | 'get_company_status'
  | 'get_meetings'
  | 'get_booking_stats'
  | 'get_meeting_count'
  | 'get_next_meeting'
  | 'get_meetings_for_period'
  | 'get_time_breakdown'
  | 'search_emails'
  | 'draft_email'
  | 'update_crm'
  | 'send_notification'
  | 'enrich_contact'
  | 'enrich_company'
  | 'invoke_skill'
  | 'run_skill'
  | 'run_sequence'
  | 'create_task'
  | 'list_tasks'
  | 'create_activity'
  | 'search_leads_create_table'
  | 'enrich_table_column';

/**
 * Parameters for run_sequence action - executes a multi-step agent sequence
 */
export interface RunSequenceParams {
  sequence_key: string;
  sequence_context?: Record<string, unknown>;
  is_simulation?: boolean;
}

/**
 * Parameters for invoke_skill action - enables skill composition
 */
export interface InvokeSkillParams {
  skill_key: string;                    // Target skill to invoke
  context?: Record<string, unknown>;    // Context to pass to skill
  merge_parent_context?: boolean;       // Default: true - merge with parent context
  timeout_ms?: number;                  // Default: 30000 - max execution time
  return_format?: 'full' | 'data_only'; // Default: 'data_only' - what to return
  _invoke_depth?: number;               // Internal: tracks recursion depth
  _parent_skill?: string;               // Internal: tracks calling skill
}

/**
 * Parameters for run_skill action - executes a skill with AI processing
 */
export interface RunSkillParams {
  skill_key: string;                    // Skill to execute (lead-research, meeting-prep, etc.)
  context?: Record<string, unknown>;    // Context variables (domain, company_name, contact_email, etc.)
}

/**
 * Parameters for create_task action
 */
export interface CreateTaskParams {
  title: string;
  description?: string;
  due_date?: string;              // ISO date string
  contact_id?: string;
  deal_id?: string;
  priority?: 'low' | 'medium' | 'high';
  assignee_id?: string;
}

/**
 * Parameters for list_tasks action
 */
export interface ListTasksParams {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  contact_id?: string;
  deal_id?: string;
  company_id?: string;
  due_before?: string;            // ISO date string - tasks due before this date
  due_after?: string;             // ISO date string - tasks due after this date
  limit?: number;                 // Default: 20
}

/**
 * Parameters for create_activity action
 */
export interface CreateActivityParams {
  type: 'outbound' | 'meeting' | 'proposal' | 'sale';
  client_name: string;
  details?: string;
  amount?: number;
  date?: string;                  // ISO date string - defaults to now
  status?: 'pending' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  contact_id?: string;
  deal_id?: string;
  company_id?: string;
}

export interface ExecuteActionRequest {
  action: ExecuteActionName;
  params: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  data: unknown;
  error?: string;
  needs_confirmation?: boolean;
  preview?: unknown;
  source?: string;
  delegate?: boolean;  // Signal that this adapter wants to delegate to another adapter
}

export interface AdapterContext {
  userId: string;
  orgId: string | null;
  confirm: boolean;
}

export interface MeetingAdapter {
  source: string;
  listMeetings(params: {
    meeting_id?: string;
    contactEmail?: string;
    contactId?: string;
    limit?: number;
  }): Promise<ActionResult>;
  getBookingStats(params: {
    period?: string;
    filter_by?: string;
    source?: string;
    org_wide?: boolean;
    isAdmin?: boolean;
    orgId?: string;
  }): Promise<ActionResult>;
  /**
   * Get count of meetings for a period with timezone awareness
   */
  getMeetingCount(params: {
    period: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month';
    timezone?: string;
    weekStartsOn?: 0 | 1;
  }): Promise<ActionResult>;
  /**
   * Get next upcoming meeting with optional CRM context enrichment
   */
  getNextMeeting(params: {
    includeContext?: boolean;
    timezone?: string;
  }): Promise<ActionResult>;
  /**
   * Get list of meetings for a specific period
   */
  getMeetingsForPeriod(params: {
    period: string; // today, tomorrow, monday-sunday, this_week, next_week
    timezone?: string;
    weekStartsOn?: 0 | 1;
    includeContext?: boolean;
    limit?: number;
  }): Promise<ActionResult>;
  /**
   * Get time breakdown statistics (meetings vs other activities)
   */
  getTimeBreakdown(params: {
    period: 'this_week' | 'last_week' | 'this_month' | 'last_month';
    timezone?: string;
    weekStartsOn?: 0 | 1;
  }): Promise<ActionResult>;
}

export interface CRMAdapter {
  source: string;
  getContact(params: { id?: string; email?: string; name?: string }): Promise<ActionResult>;
  getDeal(params: {
    id?: string;
    name?: string;
    close_date_from?: string;
    close_date_to?: string;
    status?: string;
    stage_id?: string;
    include_health?: boolean;
    limit?: number;
  }): Promise<ActionResult>;
  getPipelineSummary(params: Record<string, unknown>): Promise<ActionResult>;
  getPipelineDeals(params: {
    filter?: 'closing_soon' | 'at_risk' | 'stale' | 'needs_attention';
    days?: number;
    period?: string;
    include_health?: boolean;
    limit?: number;
  }): Promise<ActionResult>;
  getPipelineForecast(params: { period?: string }): Promise<ActionResult>;
  getContactsNeedingAttention(params: {
    days_since_contact?: number;
    filter?: 'at_risk' | 'ghost' | 'all';
    limit?: number;
  }): Promise<ActionResult>;
  getCompanyStatus(params: {
    company_id?: string;
    company_name?: string;
    domain?: string;
  }): Promise<ActionResult>;
  updateCRM(params: { entity: 'deal' | 'contact' | 'task' | 'activity'; id: string; updates: Record<string, unknown> }, ctx: AdapterContext): Promise<ActionResult>;
}

export interface EmailAdapter {
  source: string;
  searchEmails(params: { contact_email?: string; contact_id?: string; contact_name?: string; query?: string; limit?: number }): Promise<ActionResult>;
  draftEmail(params: { to?: string; subject?: string; context?: string; tone?: string }): Promise<ActionResult>;
}

export interface NotificationAdapter {
  source: string;
  sendNotification(params: { channel?: 'slack'; message: string; blocks?: unknown; meta?: Record<string, unknown> }, ctx: AdapterContext): Promise<ActionResult>;
}

export interface EnrichmentAdapter {
  source: string;
  enrichContact(params: { email: string; name?: string; title?: string; company_name?: string }): Promise<ActionResult>;
  enrichCompany(params: { name: string; domain?: string; website?: string }): Promise<ActionResult>;
}

