/**
 * Orchestrator Types
 *
 * Core types for the proactive agent orchestrator system.
 * Defines events, sequences, context tiers, and execution state.
 */

// =============================================================================
// Event Types
// =============================================================================

export type EventType =
  | 'meeting_ended'
  | 'pre_meeting_90min'
  | 'email_received'
  | 'proposal_generation'
  | 'calendar_find_times'
  | 'stale_deal_revival'
  | 'campaign_daily_check'
  | 'coaching_weekly'
  | 'deal_risk_scan';

export type EventSource =
  | 'webhook:meetingbaas'
  | 'edge:process-recording'
  | 'edge:fathom-sync'
  | 'edge:fireflies-sync'
  | 'cron:morning'
  | 'cron:daily'
  | 'cron:weekly'
  | 'slack:button'
  | 'slack:approval'
  | 'orchestrator:chain'
  | 'manual';

export type StepCriticality = 'critical' | 'best-effort';

export interface OrchestratorEvent {
  type: EventType;
  source: EventSource;
  org_id: string;
  user_id: string;
  payload: Record<string, unknown>;
  parent_job_id?: string;
  idempotency_key?: string;
}

// =============================================================================
// Sequence Steps
// =============================================================================

export interface SequenceStep {
  skill: string;
  requires_context: ContextTierSpec[];
  requires_approval: boolean;
  criticality: StepCriticality;
  available: boolean; // false for stubs not yet implemented
  timeout_ms?: number;
  depends_on?: string[]; // skill names this step depends on (for parallel execution)
}

export type ContextTierSpec = 'tier1' | 'tier2' | `tier3:${string}`;

// =============================================================================
// Context Tiers
// =============================================================================

export interface ContextTier1 {
  org: {
    id: string;
    name: string;
    company_name?: string;
    target_market?: string;
    value_propositions?: string[];
    pain_points?: string[];
    competitors?: Array<{ name: string; domain?: string }>;
    products?: Array<{ name: string; description: string }>;
    tone_of_voice?: {
      tone?: string;
      avoid?: string[];
    };
  };
  user: {
    id: string;
    email: string;
    name: string;
    first_name?: string;
    last_name?: string;
    slack_user_id?: string;
    timezone?: string;
    quiet_hours_start?: string;
    quiet_hours_end?: string;
    max_notifications_per_hour?: number;
    briefing_time?: string;
    email_sign_off?: string;
  };
  features: Record<string, boolean>;
  icp?: {
    id: string;
    name: string;
    description: string;
    filters: Record<string, unknown>;
  };
  products?: Array<{ name: string; description: string }>;
  costBudget: {
    allowed: boolean;
    remaining_usd?: number;
    balance_credits?: number;
    reason?: string;
  };
}

export interface ContextTier2 {
  contact?: {
    id: string;
    name: string;
    email?: string;
    company?: string;
    title?: string;
    phone?: string;
    linkedin_url?: string;
    last_contacted_at?: string;
    relationship_health?: number;
  };
  company?: {
    id: string;
    name: string;
    domain?: string;
    industry?: string;
    employee_count?: number;
    annual_revenue?: number;
    linkedin_url?: string;
  };
  deal?: {
    id: string;
    name: string;
    stage?: string;
    value?: number;
    probability?: number;
    expected_close_date?: string;
    last_activity_at?: string;
    owner_id?: string;
    contact_id?: string;
  };
  meetingHistory?: Array<{
    id: string;
    title: string;
    scheduled_at: string;
    duration_minutes?: number;
    transcript?: string;
    summary?: string;
    action_items?: Array<{ text: string; assigned_to?: string }>;
  }>;
  emailHistory?: Array<{
    id: string;
    subject: string;
    sent_at: string;
    from_email: string;
    to_email: string;
    body?: string;
    thread_id?: string;
  }>;
  activities?: Array<{
    id: string;
    type: string;
    description: string;
    created_at: string;
    contact_id?: string;
    deal_id?: string;
  }>;
}

export interface ContextTier3 {
  apollo?: {
    contact_data?: Record<string, unknown>;
    company_data?: Record<string, unknown>;
  };
  linkedin?: {
    profile?: Record<string, unknown>;
    company_page?: Record<string, unknown>;
  };
  news?: Array<{
    title: string;
    url: string;
    published_at: string;
    source: string;
    summary?: string;
  }>;
  template?: {
    id: string;
    name: string;
    content: string;
    variables?: string[];
  };
  campaign?: {
    id: string;
    name: string;
    status: string;
    metrics?: Record<string, unknown>;
  };
}

export interface SequenceContext {
  tier1: ContextTier1;
  tier2?: ContextTier2;
  tier3?: ContextTier3;
}

// =============================================================================
// Approvals & Follow-ups
// =============================================================================

export interface PendingApproval {
  step_name: string;
  action_type: string;
  preview: string;
  slack_pending_action_id?: string;
  created_at: string;
}

export interface QueuedFollowup {
  type: EventType;
  source: 'orchestrator:chain';
  payload: Record<string, unknown>;
  delay_minutes?: number;
}

// =============================================================================
// Sequence Execution State
// =============================================================================

export interface SequenceState {
  event: OrchestratorEvent;
  context: SequenceContext;
  steps_completed: string[];
  current_step?: string;
  outputs: Record<string, unknown>;
  pending_approvals: PendingApproval[];
  queued_followups: QueuedFollowup[];
  started_at: string;
  updated_at: string;
  error?: string;
  /** Resolved agent config entries from config engine (null if engine unavailable) */
  agentConfig: Record<string, { config_key: string; config_value: unknown; source: string }> | null;
}

export interface StepResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration_ms: number;
  cost_usd?: number;
  queued_followups?: QueuedFollowup[];
  pending_approval?: PendingApproval;
}

// =============================================================================
// Skill Adapter Interface
// =============================================================================

export interface SkillAdapter {
  name: string;
  execute: (state: SequenceState, step: SequenceStep) => Promise<StepResult>;
}

export type AdapterRegistry = Record<string, SkillAdapter>;

// =============================================================================
// Constants
// =============================================================================

export const SAFETY_MARGIN_MS = 30_000; // 30 seconds before edge function timeout
export const EDGE_FUNCTION_TIMEOUT_MS = 150_000; // 150 seconds
export const MAX_STEP_RETRIES = 2;
export const DEFAULT_STEP_TIMEOUT_MS = 30_000;
