/**
 * CC-021: Centralized Analytics Logging
 *
 * Logs every copilot query to slack_copilot_analytics.
 * Provides feedback capture via Block Kit thumbs up/down buttons.
 * Response time benchmarking with assertions.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface AnalyticsEvent {
  orgId: string;
  userId: string;
  threadTs: string;
  intent: string;
  entities?: Record<string, unknown>;
  confidence?: number;
  dataSources?: string[];
  creditsConsumed?: number;
  responseTimeMs: number;
  modelUsed?: string;
  actionTaken?: string;
}

/**
 * Log a query event to slack_copilot_analytics. Fire-and-forget safe.
 */
export async function logAnalyticsEvent(
  supabase: SupabaseClient,
  event: AnalyticsEvent
): Promise<void> {
  try {
    await supabase.from('slack_copilot_analytics').insert({
      org_id: event.orgId,
      user_id: event.userId,
      thread_ts: event.threadTs,
      intent: event.intent,
      entities: event.entities || null,
      confidence: event.confidence || null,
      data_sources_used: event.dataSources || null,
      credits_consumed: event.creditsConsumed || null,
      response_time_ms: event.responseTimeMs,
      model_used: event.modelUsed || null,
      action_taken: event.actionTaken || null,
    });
  } catch (err) {
    // Non-critical — log but don't throw
    console.warn('[analytics] Failed to log event:', err);
  }
}

/**
 * Log an action event (user clicked Send, Edit, Skip, etc.)
 */
export async function logActionEvent(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  threadTs: string,
  action: string
): Promise<void> {
  try {
    await supabase.from('slack_copilot_analytics').insert({
      org_id: orgId,
      user_id: userId,
      thread_ts: threadTs,
      intent: 'action_executed',
      action_taken: action,
      response_time_ms: 0,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Record user feedback (thumbs up/down) for a query
 */
export async function recordFeedback(
  supabase: SupabaseClient,
  analyticsId: string,
  feedback: 'positive' | 'negative'
): Promise<void> {
  try {
    await supabase
      .from('slack_copilot_analytics')
      .update({ user_feedback: feedback })
      .eq('id', analyticsId);
  } catch {
    // Non-critical
  }
}

/**
 * Build feedback buttons to append to responses.
 * Returns Block Kit actions block with thumbs up/down.
 */
export function buildFeedbackButtons(queryId?: string): unknown {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '👍', emoji: true },
        action_id: 'copilot_feedback_positive',
        value: JSON.stringify({ query_id: queryId || '' }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '👎', emoji: true },
        action_id: 'copilot_feedback_negative',
        value: JSON.stringify({ query_id: queryId || '' }),
      },
    ],
  };
}

// Response time benchmarks
export const RESPONSE_TIME_TARGETS = {
  simple: 3000,   // metrics, help, update_crm
  medium: 5000,   // deal_query, pipeline_query, contact_query
  rag: 8000,      // history_query, coaching_query, competitive_query
  draft: 10000,   // draft_email, draft_check_in
} as const;

/**
 * Check if response time is within target for the intent type.
 */
export function checkResponseTime(intent: string, responseTimeMs: number): {
  withinTarget: boolean;
  target: number;
  category: string;
} {
  const SIMPLE_INTENTS = ['metrics_query', 'help', 'feedback', 'update_crm', 'create_task', 'trigger_prep', 'clarification_needed'];
  const RAG_INTENTS = ['history_query', 'coaching_query', 'competitive_query'];
  const DRAFT_INTENTS = ['draft_email', 'draft_check_in'];

  let target: number;
  let category: string;

  if (SIMPLE_INTENTS.includes(intent)) {
    target = RESPONSE_TIME_TARGETS.simple;
    category = 'simple';
  } else if (RAG_INTENTS.includes(intent)) {
    target = RESPONSE_TIME_TARGETS.rag;
    category = 'rag';
  } else if (DRAFT_INTENTS.includes(intent)) {
    target = RESPONSE_TIME_TARGETS.draft;
    category = 'draft';
  } else {
    target = RESPONSE_TIME_TARGETS.medium;
    category = 'medium';
  }

  const withinTarget = responseTimeMs <= target;
  if (!withinTarget) {
    console.warn(`[analytics] Response time ${responseTimeMs}ms exceeded ${category} target ${target}ms for ${intent}`);
  }

  return { withinTarget, target, category };
}
