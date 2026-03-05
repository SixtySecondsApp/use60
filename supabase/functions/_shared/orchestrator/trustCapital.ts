/**
 * Trust Capital Score — AE2-016
 *
 * Calculates a composite "Trust Capital" score representing the user's
 * cumulative training investment in their agent. This is the stickiness metric —
 * makes switching costs visible to the user.
 *
 * Components:
 *   - total_signals: all-time signal count across action types
 *   - action_types_trained: distinct action types with signals
 *   - avg_confidence: average confidence score across action types
 *   - days_active: days since first signal
 *   - auto_tier_count: action types currently at 'auto' tier
 *   - personalization_depth: learned preferences from user_ai_preferences
 *
 * Score is normalized to 0-1000 for display.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export interface TrustCapitalScore {
  score: number;                // 0-1000
  total_signals: number;
  action_types_trained: number;
  avg_confidence: number;
  days_active: number;
  auto_tier_count: number;
  personalization_depth: number; // 0.0-1.0
  switching_cost_description: string;
  milestone: string | null;      // celebration text when crossing thresholds
}

// =============================================================================
// Milestones
// =============================================================================

const MILESTONES: Array<{ threshold: number; message: string }> = [
  { threshold: 100, message: 'Your agent is learning your style' },
  { threshold: 250, message: 'Your agent knows your preferences' },
  { threshold: 500, message: 'Your agent is becoming a trusted teammate' },
  { threshold: 750, message: 'Your agent has deep expertise in your workflow' },
  { threshold: 1000, message: 'Maximum trust capital — your agent is fully trained' },
];

// =============================================================================
// Core
// =============================================================================

/**
 * Calculates the Trust Capital score for a user.
 *
 * Weights (sum to 1.0):
 *   signals_breadth  0.25 — total signals across all action types (log scale, cap at 500)
 *   action_coverage  0.20 — fraction of known action types trained (8 total)
 *   confidence_avg   0.20 — mean confidence score
 *   tenure           0.15 — days active (log scale, cap at 180 days)
 *   auto_depth       0.10 — fraction of action types at 'auto' tier
 *   personalization  0.10 — user_ai_preferences completeness
 */
export async function calculateTrustCapital(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<TrustCapitalScore> {
  try {
    // Fetch all autopilot_confidence rows for the user
    const { data: confidenceRows, error: confError } = await supabase
      .from('autopilot_confidence')
      .select('action_type, score, total_signals, current_tier, created_at')
      .eq('user_id', userId)
      .eq('org_id', orgId);

    if (confError) {
      console.warn('[trustCapital] Error fetching confidence rows:', confError.message);
    }

    const rows = confidenceRows ?? [];

    // Aggregate metrics
    const totalSignals = rows.reduce((sum, r) => sum + (r.total_signals ?? 0), 0);
    const actionTypesTrained = rows.length;
    const avgConfidence = rows.length > 0
      ? rows.reduce((sum, r) => sum + (r.score ?? 0), 0) / rows.length
      : 0;
    const autoTierCount = rows.filter(r => r.current_tier === 'auto').length;

    // Days active (from earliest confidence row)
    const createdDates = rows
      .map(r => r.created_at ? new Date(r.created_at).getTime() : null)
      .filter((d): d is number => d !== null);
    const earliestMs = createdDates.length > 0 ? Math.min(...createdDates) : Date.now();
    const daysActive = Math.max(0, Math.floor((Date.now() - earliestMs) / (24 * 60 * 60 * 1000)));

    // Personalization depth from user_ai_preferences
    let personalizationDepth = 0;
    const { data: prefs, error: prefsError } = await supabase
      .from('user_ai_preferences')
      .select('preferred_tone, preferred_length, prefers_ctas, prefers_bullet_points')
      .eq('user_id', userId)
      .maybeSingle();

    if (!prefsError && prefs) {
      const fields = ['preferred_tone', 'preferred_length', 'prefers_ctas', 'prefers_bullet_points'];
      const populated = fields.filter(f => (prefs as Record<string, unknown>)[f] !== null && (prefs as Record<string, unknown>)[f] !== undefined);
      personalizationDepth = populated.length / fields.length;
    }

    // Calculate component scores (all 0.0-1.0)
    const TOTAL_ACTION_TYPES = 8;
    const signalsBreadth = Math.min(1.0, Math.log(totalSignals + 1) / Math.log(501)); // log scale, cap 500
    const actionCoverage = Math.min(1.0, actionTypesTrained / TOTAL_ACTION_TYPES);
    const confidenceAvg = avgConfidence; // already 0-1
    const tenure = Math.min(1.0, Math.log(daysActive + 1) / Math.log(181)); // log scale, cap 180 days
    const autoDepth = TOTAL_ACTION_TYPES > 0 ? Math.min(1.0, autoTierCount / TOTAL_ACTION_TYPES) : 0;

    // Weighted composite
    const composite = (
      signalsBreadth * 0.25 +
      actionCoverage * 0.20 +
      confidenceAvg * 0.20 +
      tenure * 0.15 +
      autoDepth * 0.10 +
      personalizationDepth * 0.10
    );

    const score = Math.round(composite * 1000);

    // Switching cost description
    const weeksOfTraining = Math.ceil(daysActive / 7);
    const switchingCost = totalSignals > 0
      ? `Your agent has learned from ${totalSignals} decisions across ${actionTypesTrained} action types over ${weeksOfTraining} weeks. New platforms start at zero.`
      : 'Start giving your agent feedback to build trust capital.';

    // Milestone
    const milestone = MILESTONES.filter(m => score >= m.threshold).pop()?.message ?? null;

    console.log('[trustCapital] Calculated', {
      userId, score, totalSignals, actionTypesTrained, avgConfidence,
      daysActive, autoTierCount, personalizationDepth,
    });

    return {
      score,
      total_signals: totalSignals,
      action_types_trained: actionTypesTrained,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      days_active: daysActive,
      auto_tier_count: autoTierCount,
      personalization_depth: Math.round(personalizationDepth * 100) / 100,
      switching_cost_description: switchingCost,
      milestone,
    };
  } catch (err) {
    console.error('[trustCapital] Unexpected error:', err);
    return {
      score: 0,
      total_signals: 0,
      action_types_trained: 0,
      avg_confidence: 0,
      days_active: 0,
      auto_tier_count: 0,
      personalization_depth: 0,
      switching_cost_description: 'Unable to calculate trust capital.',
      milestone: null,
    };
  }
}
