/**
 * dailyLog.ts — Fire-and-forget action logger for the autonomous agent fleet.
 *
 * Writes one row to agent_daily_logs per discrete agent action (classify,
 * draft, send, CRM update, etc.). Designed for observability — callers MUST
 * NOT await this for correctness; it is purely telemetry.
 *
 * Rules:
 *   - Never throws — any insert failure is console.error'd and swallowed
 *   - Caller is responsible for measuring executionMs before calling
 *   - supabaseClient must have INSERT access to agent_daily_logs
 *     (service-role client or a client whose RLS policy permits inserts)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---- Exported union types ---------------------------------------------------

/**
 * Outcome of a single agent action.
 * Must match the CHECK constraint in the agent_daily_logs migration (LOG-001).
 */
export type AgentOutcome = 'success' | 'failed' | 'pending' | 'cancelled' | 'skipped';

/**
 * Known agent type identifiers. Extensible — callers may pass any string.
 * Common values reflect the autonomous agent fleet entry points.
 */
export type AgentType =
  | 'meeting_ended'
  | 'reengagement'
  | 'deal_risk'
  | 'email_loop'
  | 'calendar_proposal'
  | 'relationship_graph'
  | 'control_room'
  | 'post_meeting_intel'
  | 'daily_planner'
  | (string & NonNullable<unknown>); // allows any string while keeping autocomplete

// ---- Params type ------------------------------------------------------------

export interface AgentLogParams {
  /** Supabase client with INSERT access to agent_daily_logs */
  supabaseClient: ReturnType<typeof createClient>;

  /** Organisation that owns this log row */
  orgId: string;

  /** User the agent is acting on behalf of — nullable for org-level agents */
  userId?: string | null;

  /** Which agent produced this action (e.g. 'meeting_ended', 'reengagement') */
  agentType: AgentType;

  /** Discrete step the agent took (e.g. 'classify', 'draft_email', 'send_email', 'update_crm') */
  actionType: string;

  /**
   * Flexible JSONB payload whose shape varies per actionType.
   * Examples:
   *   draft_email  → { subject, body_preview, recipient_email }
   *   update_crm   → { field, old_value, new_value, entity_type, entity_id }
   *   classify     → { classification, confidence, model_used }
   */
  actionDetail: Record<string, unknown>;

  /** Human-readable AI reasoning explaining why this action was chosen */
  decisionReasoning?: string | null;

  /** Condensed representation of the input context passed to the agent */
  inputContextSummary?: string | null;

  /** Action result */
  outcome: AgentOutcome;

  /** Error details when outcome is 'failed' */
  errorMessage?: string | null;

  /** AI/API credits consumed by this action */
  creditCost?: number | null;

  /** Wall-clock milliseconds for this action */
  executionMs?: number | null;

  /** UUID linking this action to an orchestrator chain or sequence_job run */
  chainId?: string | null;

  /** Wave number within a multi-wave chain execution */
  waveNumber?: number | null;
}

// ---- Main export ------------------------------------------------------------

/**
 * Insert one row into agent_daily_logs.
 *
 * Fire-and-forget: this function NEVER throws. Any database error is logged
 * to console.error only, so callers can safely omit await.
 *
 * Usage:
 *   // Non-blocking (preferred):
 *   logAgentAction({ supabaseClient, orgId, agentType: 'meeting_ended', ... });
 *
 *   // Awaited (only if you need confirmation before function teardown):
 *   await logAgentAction({ supabaseClient, orgId, agentType: 'meeting_ended', ... });
 */
export async function logAgentAction(params: AgentLogParams): Promise<void> {
  const {
    supabaseClient,
    orgId,
    userId,
    agentType,
    actionType,
    actionDetail,
    decisionReasoning,
    inputContextSummary,
    outcome,
    errorMessage,
    creditCost,
    executionMs,
    chainId,
    waveNumber,
  } = params;

  try {
    const { error } = await supabaseClient.from('agent_daily_logs').insert({
      org_id: orgId,
      user_id: userId ?? null,
      agent_type: agentType,
      action_type: actionType,
      action_detail: actionDetail,
      decision_reasoning: decisionReasoning ?? null,
      input_context_summary: inputContextSummary ?? null,
      outcome,
      error_message: errorMessage ?? null,
      credit_cost: creditCost ?? null,
      execution_ms: executionMs != null ? Math.round(executionMs) : null,
      chain_id: chainId ?? null,
      wave_number: waveNumber ?? null,
    });

    if (error) {
      console.error('[dailyLog] Failed to insert agent_daily_logs row:', error.message);
    }
  } catch (err) {
    // Defensive catch — must never propagate so callers aren't disrupted
    console.error('[dailyLog] Unexpected error writing to agent_daily_logs:', err);
  }
}
