// supabase/functions/_shared/slack-copilot/types.ts
// Shared types for the Slack Copilot conversational interface (PRD-22)

export type CopilotIntentType =
  | 'deal_query'
  | 'pipeline_query'
  | 'history_query'
  | 'contact_query'
  | 'action_request'
  | 'competitive_query'
  | 'coaching_query'
  | 'general_chat';

export interface ExtractedEntities {
  dealName?: string;
  contactName?: string;
  companyName?: string;
  competitorName?: string;
  dateRange?: { start?: string; end?: string };
  actionType?: 'draft_email' | 'create_task' | 'send_email' | 'schedule_meeting';
  objectionType?: string;
  rawQuery?: string;
}

export interface ClassifiedIntent {
  type: CopilotIntentType;
  confidence: number;
  entities: ExtractedEntities;
  reasoning?: string;
}

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
