/**
 * Outcome Learning Loop
 *
 * Captures acceptance/rejection/edit outcomes for AI-generated drafts
 * and autonomous actions. Stores outcomes with confidence, context,
 * and user correction metadata.
 *
 * Consumed by ranking/prompt policies to improve future recommendations.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Types
// =============================================================================

export type OutcomeVerdict = 'accepted' | 'rejected' | 'edited' | 'ignored' | 'expired';

export type ActionCategory =
  | 'email_draft'
  | 'follow_up'
  | 'meeting_prep'
  | 'deal_update'
  | 'task_suggestion'
  | 'crm_update'
  | 'repair_action'
  | 'reengagement'
  | 'general';

export interface ActionOutcome {
  actionId: string;
  actionCategory: ActionCategory;
  skillKey?: string; // Which skill generated the action
  verdict: OutcomeVerdict;
  confidence: number; // 0-1, AI's confidence in the action
  userCorrection?: string; // Edited content if verdict === 'edited'
  correctionDelta?: Record<string, unknown>; // Structured diff
  contextSnapshot: {
    dealId?: string;
    contactId?: string;
    companyId?: string;
    stage?: string;
    dayOfWeek?: number;
    hourOfDay?: number;
  };
  generatedAt: string;
  respondedAt?: string;
  responseTimeMs?: number;
}

export interface OutcomeStats {
  actionCategory: ActionCategory;
  totalActions: number;
  accepted: number;
  rejected: number;
  edited: number;
  ignored: number;
  acceptanceRate: number;
  avgConfidence: number;
  avgResponseTimeMs: number;
}

// =============================================================================
// Record Outcome
// =============================================================================

/**
 * Record an action outcome for the learning loop.
 * Non-blocking — errors are logged but never thrown.
 */
export async function recordOutcome(
  client: SupabaseClient,
  orgId: string,
  userId: string,
  outcome: ActionOutcome,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await client.from('activities').insert({
      type: 'action_outcome',
      user_id: userId,
      details: JSON.stringify({
        action_id: outcome.actionId,
        action_category: outcome.actionCategory,
        skill_key: outcome.skillKey,
        verdict: outcome.verdict,
        confidence: outcome.confidence,
        has_correction: outcome.verdict === 'edited',
        correction_length: outcome.userCorrection?.length || 0,
        context: outcome.contextSnapshot,
        generated_at: outcome.generatedAt,
        responded_at: outcome.respondedAt,
        response_time_ms: outcome.responseTimeMs,
      }),
    });

    if (error) {
      console.warn('[outcomeLearning] Failed to record outcome:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.warn('[outcomeLearning] Exception recording outcome:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// =============================================================================
// Query Outcomes
// =============================================================================

/**
 * Get outcome statistics for an action category within a time window.
 */
export async function getOutcomeStats(
  client: SupabaseClient,
  orgId: string,
  userId: string,
  opts?: {
    category?: ActionCategory;
    windowDays?: number;
    skillKey?: string;
  },
): Promise<OutcomeStats[]> {
  const windowDays = opts?.windowDays || 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('activities')
    .select('details')
    .eq('type', 'action_outcome')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(500);

  if (error || !data) return [];

  // Parse and aggregate
  const byCategory = new Map<ActionCategory, ActionOutcome[]>();

  for (const row of data) {
    try {
      const parsed = typeof (row as any).details === 'string'
        ? JSON.parse((row as any).details)
        : (row as any).details;

      const category = parsed.action_category as ActionCategory;

      if (opts?.category && category !== opts.category) continue;
      if (opts?.skillKey && parsed.skill_key !== opts.skillKey) continue;

      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push({
        actionId: parsed.action_id,
        actionCategory: category,
        skillKey: parsed.skill_key,
        verdict: parsed.verdict,
        confidence: parsed.confidence || 0,
        contextSnapshot: parsed.context || {},
        generatedAt: parsed.generated_at,
        respondedAt: parsed.responded_at,
        responseTimeMs: parsed.response_time_ms,
      });
    } catch {
      continue;
    }
  }

  const stats: OutcomeStats[] = [];
  for (const [category, outcomes] of byCategory) {
    const accepted = outcomes.filter((o) => o.verdict === 'accepted').length;
    const rejected = outcomes.filter((o) => o.verdict === 'rejected').length;
    const edited = outcomes.filter((o) => o.verdict === 'edited').length;
    const ignored = outcomes.filter((o) => o.verdict === 'ignored' || o.verdict === 'expired').length;
    const total = outcomes.length;

    const avgConfidence = total > 0
      ? outcomes.reduce((sum, o) => sum + o.confidence, 0) / total
      : 0;

    const responseTimes = outcomes
      .filter((o) => o.responseTimeMs != null)
      .map((o) => o.responseTimeMs!);
    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    stats.push({
      actionCategory: category,
      totalActions: total,
      accepted,
      rejected,
      edited,
      ignored,
      acceptanceRate: total > 0 ? (accepted + edited) / total : 0,
      avgConfidence,
      avgResponseTimeMs,
    });
  }

  return stats;
}

// =============================================================================
// Quality Signals for Prompt/Ranking Policies
// =============================================================================

/**
 * Get a confidence adjustment factor based on historical outcomes.
 * Returns a multiplier (0.5 - 1.5) that can be applied to AI confidence scores.
 */
export async function getConfidenceAdjustment(
  client: SupabaseClient,
  userId: string,
  category: ActionCategory,
  skillKey?: string,
): Promise<number> {
  const stats = await getOutcomeStats(client, '', userId, {
    category,
    windowDays: 14,
    skillKey,
  });

  if (stats.length === 0) return 1.0; // No data — neutral

  const stat = stats[0];
  if (stat.totalActions < 5) return 1.0; // Too few samples

  // High acceptance → boost confidence
  // Low acceptance → reduce confidence
  if (stat.acceptanceRate >= 0.8) return 1.2;
  if (stat.acceptanceRate >= 0.6) return 1.0;
  if (stat.acceptanceRate >= 0.4) return 0.85;
  return 0.7;
}
