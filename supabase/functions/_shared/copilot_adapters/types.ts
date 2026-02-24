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
  | 'enrich_table_column'
  // Ops table CRUD
  | 'list_ops_tables'
  | 'get_ops_table'
  | 'create_ops_table'
  | 'delete_ops_table'
  // Ops column/row
  | 'add_ops_column'
  | 'get_ops_table_data'
  | 'add_ops_rows'
  | 'update_ops_cell'
  // Ops AI features
  | 'ai_query_ops_table'
  | 'ai_transform_ops_column'
  | 'get_enrichment_status'
  // Ops rules
  | 'create_ops_rule'
  | 'list_ops_rules'
  // Ops integration sync
  | 'sync_ops_hubspot'
  | 'sync_ops_attio'
  | 'push_ops_to_instantly'
  // Ops insights
  | 'get_ops_insights'
  // Meeting intelligence
  | 'meeting_intelligence_query'
  | 'search_meeting_context'
  // Meeting analytics aggregation
  | 'meeting_analytics_dashboard'
  | 'meeting_analytics_talk_time'
  | 'meeting_analytics_sentiment_trends'
  | 'meeting_analytics_insights'
  // Sales targets / goals
  | 'get_targets'
  | 'upsert_target';

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

/**
 * Parameters for list_ops_tables action
 */
export interface ListOpsTablesParams {
  limit?: number;
  source_type?: string;
}

/**
 * Parameters for get_ops_table action
 */
export interface GetOpsTableParams {
  table_id: string;
}

/**
 * Parameters for create_ops_table action
 */
export interface CreateOpsTableParams {
  name: string;
  description?: string;
  columns?: Array<{
    name: string;
    column_type: string;
    config?: Record<string, unknown>;
  }>;
}

/**
 * Parameters for delete_ops_table action
 */
export interface DeleteOpsTableParams {
  table_id: string;
}

/**
 * Parameters for add_ops_column action
 */
export interface AddOpsColumnParams {
  table_id: string;
  name: string;
  column_type: string;
  config?: Record<string, unknown>;
}

/**
 * Parameters for get_ops_table_data action
 */
export interface GetOpsTableDataParams {
  table_id: string;
  limit?: number;
  offset?: number;
}

/**
 * Parameters for add_ops_rows action
 */
export interface AddOpsRowsParams {
  table_id: string;
  rows: Array<Record<string, unknown>>;
}

/**
 * Parameters for update_ops_cell action
 */
export interface UpdateOpsCellParams {
  row_id: string;
  column_id: string;
  value: unknown;
}

/**
 * Parameters for ai_query_ops_table action
 */
export interface AiQueryOpsTableParams {
  table_id: string;
  query: string;
}

/**
 * Parameters for ai_transform_ops_column action
 */
export interface AiTransformOpsColumnParams {
  table_id: string;
  column_id: string;
  prompt: string;
  row_ids?: string[];
}

/**
 * Parameters for get_enrichment_status action
 */
export interface GetEnrichmentStatusParams {
  table_id: string;
  column_id?: string;
}

/**
 * Parameters for create_ops_rule action
 */
export interface CreateOpsRuleParams {
  table_id: string;
  name: string;
  trigger_type: string;
  condition: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
}

/**
 * Parameters for list_ops_rules action
 */
export interface ListOpsRulesParams {
  table_id: string;
}

/**
 * Parameters for sync_ops_hubspot action
 */
export interface SyncOpsHubspotParams {
  table_id: string;
  list_id?: string;
  field_mapping?: Record<string, string>;
}

/**
 * Parameters for sync_ops_attio action
 */
export interface SyncOpsAttioParams {
  table_id: string;
  list_id?: string;
  field_mapping?: Record<string, string>;
}

/**
 * Parameters for push_ops_to_instantly action
 */
export interface PushOpsToInstantlyParams {
  table_id: string;
  campaign_id?: string;
  row_ids?: string[];
}

/**
 * Parameters for get_ops_insights action
 */
export interface GetOpsInsightsParams {
  table_id: string;
  insight_type?: string;
}

/**
 * Parameters for upsert_target action
 */
export interface UpsertTargetParams {
  /** Which KPI to update */
  field: 'revenue_target' | 'outbound_target' | 'meetings_target' | 'proposal_target';
  /** New goal value (must be >= 0) */
  value: number;
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

