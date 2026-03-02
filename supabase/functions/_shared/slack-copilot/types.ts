// supabase/functions/_shared/slack-copilot/types.ts
// Shared types for the Slack Copilot conversational interface (PRD-22)

// --- QUERY intents ---
// Questions and information retrieval
// --- ACTION intents ---
// Requests for the copilot to do something
// --- META intents ---
// Conversation management and meta-interactions

export type CopilotIntentType =
  // QUERY
  | 'deal_query'
  | 'contact_query'
  | 'pipeline_query'
  | 'history_query'
  | 'metrics_query'
  | 'risk_query'
  | 'competitive_query'
  | 'coaching_query'
  // ACTION
  | 'draft_email'
  | 'draft_check_in'
  | 'update_crm'
  | 'create_task'
  | 'trigger_prep'
  | 'trigger_enrichment'
  | 'schedule_meeting'
  // META
  | 'help'
  | 'feedback'
  | 'clarification_needed'
  | 'general'
  // Backward-compatibility aliases (deprecated — use specific intents above)
  | 'action_request'
  | 'general_chat';

export interface ExtractedEntities {
  dealName?: string;
  contactName?: string;
  companyName?: string;
  competitorName?: string;
  dateRange?: { start?: string; end?: string };
  /** Relative or named time reference, e.g. "last week", "Q2", "Friday" */
  time_reference?: string;
  actionType?:
    | 'draft_email'
    | 'create_task'
    | 'send_email'
    | 'schedule_meeting'
    | 'draft_check_in'
    | 'update_crm'
    | 'trigger_prep'
    | 'trigger_enrichment';
  objectionType?: string;
  rawQuery?: string;
}

export interface ClassifiedIntent {
  type: CopilotIntentType;
  confidence: number;
  entities: ExtractedEntities;
  reasoning?: string;
}

// ---------------------------------------------------------------------------
// Confidence routing
// ---------------------------------------------------------------------------

/**
 * How the copilot should respond based on classification confidence.
 *
 * - `direct`             — high confidence (≥0.8): act immediately
 * - `with_clarification` — medium confidence (≥0.5): act but surface assumptions
 * - `ask_first`          — low confidence (<0.5): ask a clarifying question first
 */
export type ConfidenceRouting = 'direct' | 'with_clarification' | 'ask_first';

export function getConfidenceRouting(confidence: number): ConfidenceRouting {
  if (confidence >= 0.8) return 'direct';
  if (confidence >= 0.5) return 'with_clarification';
  return 'ask_first';
}

// ---------------------------------------------------------------------------
// Unchanged interfaces — kept as-is for full backward compatibility
// ---------------------------------------------------------------------------

export interface ThreadState {
  id: string;
  orgId: string;
  userId: string;
  slackTeamId: string;
  slackChannelId: string;
  slackThreadTs: string;
  messageCount: number;
  context: Record<string, unknown>;
  lastMessageAt: string;
}

export interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  intent?: string;
  slackTs?: string;
  createdAt: string;
}

export interface SlackCopilotContext {
  orgId: string;
  userId: string;
  botToken: string;
  slackUserId: string;
  channelId: string;
  threadTs: string;
  messageText: string;
  threadState: ThreadState | null;
  threadHistory: ThreadMessage[];
}

export interface QueryContext {
  deals?: Array<{
    id: string;
    title: string;
    stage: string;
    value: number | null;
    health_status: string | null;
    close_date: string | null;
    owner_id: string;
  }>;
  contacts?: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
    title: string | null;
  }>;
  meetings?: Array<{
    id: string;
    title: string | null;
    start_time: string | null;
    end_time: string | null;
    attendees_count: number;
    summary: string | null;
  }>;
  activities?: Array<{
    id: string;
    type: string;
    subject: string | null;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
  riskScores?: Array<{
    deal_id: string;
    score: number;
    risk_level: string;
    top_signals: string[];
  }>;
  competitive?: Array<{
    competitor_name: string;
    mention_count: number;
    win_rate: number | null;
    strengths: string[];
    weaknesses: string[];
  }>;
  pipelineSnapshot?: {
    total_value: number;
    deal_count: number;
    weighted_value: number;
    target: number | null;
    gap: number | null;
  };
}

export interface HandlerResult {
  text?: string;
  blocks?: unknown[];
  metadata?: Record<string, unknown>;
  pendingAction?: {
    type: string;
    data: Record<string, unknown>;
  };
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: unknown[];
  accessory?: unknown;
  fields?: unknown[];
  block_id?: string;
}
