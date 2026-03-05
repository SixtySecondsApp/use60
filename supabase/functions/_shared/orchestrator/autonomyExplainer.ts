/**
 * Autonomy Explainer — AE2-007 (Show Your Work)
 *
 * Generates human-readable explanations for every autonomy tier decision.
 * Turns the raw AutonomyDecision (from the unified resolver) into structured
 * text that helps users understand WHY the agent is acting at a given tier
 * and WHAT it takes to reach the next level.
 *
 * Used by:
 *   - AutonomyExplanation component (AE2-008)
 *   - Audit trail viewer (AE2-009)
 *   - Slack approval DMs
 *   - Command Centre item cards
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { AutonomyDecision, AutonomyDecisionFactor } from './unifiedAutonomyResolver.ts';

// =============================================================================
// Types
// =============================================================================

export interface ExplanationFactor {
  label: string;
  /** 0.0-1.0 progress bar value */
  progress: number;
  detail: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface NextMilestone {
  /** What the user needs to do */
  action: string;
  /** Specific metric or count needed */
  metric: string;
  /** How far along they are (0.0-1.0) */
  progress: number;
}

export interface ExplanationPayload {
  /** Single-line summary for inline display */
  summary: string;
  /** Bullet-point factors for expanded view */
  factors: ExplanationFactor[];
  /** What it takes to promote to the next tier */
  next_milestone: NextMilestone | null;
  /** Recommended action for the user */
  recommendation: string;
  /** Template key (for Slack compact formatting) */
  template: 'auto_executing' | 'requesting_approval' | 'suggesting' | 'disabled' | 'context_escalation' | 'cooldown' | 'demotion';
}

// =============================================================================
// Tier labels
// =============================================================================

const TIER_LABELS: Record<string, string> = {
  auto: 'Auto-executing',
  approve: 'Requesting approval',
  suggest: 'Suggesting only',
  disabled: 'Disabled',
};

const NEXT_TIER: Record<string, string | null> = {
  disabled: 'suggest',
  suggest: 'approve',
  approve: 'auto',
  auto: null,
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  send_email: 'email sends',
  send_slack: 'Slack messages',
  crm_field_update: 'CRM field updates',
  crm_stage_change: 'deal stage changes',
  crm_contact_create: 'contact creation',
  create_task: 'task creation',
  enrich_contact: 'contact enrichment',
  draft_proposal: 'proposal drafts',
};

// =============================================================================
// Promotion thresholds (mirrors autonomyAnalytics.ts DEFAULT_THRESHOLDS)
// =============================================================================

const PROMOTION_MIN_APPROVALS = 30;
const PROMOTION_MIN_DAYS = 14;
const PROMOTION_MAX_REJECTION_RATE = 5; // percent

// =============================================================================
// Main entry point
// =============================================================================

/**
 * Generates a structured explanation for an autonomy decision.
 *
 * @param decision - The AutonomyDecision from the unified resolver
 * @param actionType - The action type key (e.g. 'send_email')
 * @param supabase - Supabase client for fetching promotion progress data
 * @param userId - User ID for per-user confidence lookup
 */
export async function generateExplanation(
  decision: AutonomyDecision,
  actionType: string,
  supabase?: SupabaseClient,
  userId?: string,
): Promise<ExplanationPayload> {
  const actionLabel = ACTION_TYPE_LABELS[actionType] ?? actionType;
  const tierLabel = TIER_LABELS[decision.tier] ?? decision.tier;

  // Detect special scenarios
  const hasCooldown = decision.factors.some(f => f.signal === 'cooldown_active');
  const isContextEscalation = decision.contextAdjusted;

  // Build explanation factors from the decision
  const factors = buildFactors(decision);

  // Determine template
  let template: ExplanationPayload['template'];
  if (hasCooldown) {
    template = 'cooldown';
  } else if (isContextEscalation) {
    template = 'context_escalation';
  } else {
    template = decision.tier === 'auto' ? 'auto_executing'
      : decision.tier === 'approve' ? 'requesting_approval'
      : decision.tier === 'suggest' ? 'suggesting'
      : 'disabled';
  }

  // Build summary
  const summary = buildSummary(decision, actionLabel, tierLabel, template);

  // Build recommendation
  const recommendation = buildRecommendation(decision, actionLabel, template);

  // Build next milestone (what it takes to reach the next tier)
  let nextMilestone: NextMilestone | null = null;
  if (supabase && userId && decision.tier !== 'auto') {
    nextMilestone = await buildNextMilestone(supabase, userId, actionType, decision);
  }

  return {
    summary,
    factors,
    next_milestone: nextMilestone,
    recommendation,
    template,
  };
}

// =============================================================================
// Summary builders
// =============================================================================

function buildSummary(
  decision: AutonomyDecision,
  actionLabel: string,
  tierLabel: string,
  template: ExplanationPayload['template'],
): string {
  const confidencePct = decision.confidenceScore !== null
    ? `${(decision.confidenceScore * 100).toFixed(0)}%`
    : null;

  switch (template) {
    case 'auto_executing': {
      const approvalFactor = decision.factors.find(f => f.signal === 'approval_rate');
      const approvalPct = approvalFactor
        ? `${(Number(approvalFactor.value) * 100).toFixed(0)}%`
        : confidencePct ?? 'high';
      const signalsFactor = decision.factors.find(f => f.signal === 'confidence_score');
      const signalDetail = signalsFactor?.contribution ?? '';
      return `Auto-sending ${actionLabel} — ${approvalPct} approval rate${signalDetail ? ', ' + signalDetail : ''}`;
    }

    case 'requesting_approval': {
      if (decision.source === 'org_policy') {
        return `Asking for approval on ${actionLabel} — your org policy requires it`;
      }
      return `Asking for approval on ${actionLabel} — confidence at ${confidencePct ?? 'N/A'}`;
    }

    case 'suggesting':
      return `Suggesting ${actionLabel} only — ${decision.source === 'org_policy' ? 'org policy restricts to suggest' : `confidence at ${confidencePct ?? 'N/A'}, needs more training`}`;

    case 'disabled':
      return `${actionLabel} is disabled by ${decision.source === 'org_policy' ? 'org policy' : 'configuration'}`;

    case 'context_escalation': {
      const riskPct = decision.contextRisk !== null ? `${(decision.contextRisk * 100).toFixed(0)}%` : 'high';
      const contextFactors = decision.factors
        .filter(f => f.signal.startsWith('context:') && Number(f.weight) > 0)
        .map(f => f.signal.replace('context:', '').replace('_', ' '))
        .slice(0, 2);
      const because = contextFactors.length > 0 ? contextFactors.join(', ') : 'deal context';
      return `Asking for approval because of ${because} (risk: ${riskPct})`;
    }

    case 'cooldown': {
      const cooldownFactor = decision.factors.find(f => f.signal === 'cooldown_active');
      return `${tierLabel} for ${actionLabel} — cooldown active${cooldownFactor ? ` until ${cooldownFactor.value}` : ''}`;
    }

    case 'demotion':
      return `Reduced to ${tierLabel} for ${actionLabel} due to recent issues`;

    default:
      return `${tierLabel} for ${actionLabel}`;
  }
}

// =============================================================================
// Factors builder
// =============================================================================

function buildFactors(decision: AutonomyDecision): ExplanationFactor[] {
  const result: ExplanationFactor[] = [];

  for (const f of decision.factors) {
    switch (f.signal) {
      case 'confidence_score': {
        const score = Number(f.value);
        result.push({
          label: 'Confidence Score',
          progress: Math.max(0, Math.min(1, score)),
          detail: f.contribution,
          sentiment: score >= 0.8 ? 'positive' : score >= 0.5 ? 'neutral' : 'negative',
        });
        break;
      }

      case 'approval_rate': {
        const rate = Number(f.value);
        result.push({
          label: 'Approval Rate',
          progress: Math.max(0, Math.min(1, rate)),
          detail: f.contribution,
          sentiment: rate >= 0.9 ? 'positive' : rate >= 0.7 ? 'neutral' : 'negative',
        });
        break;
      }

      case 'org_policy':
        result.push({
          label: 'Org Policy',
          progress: f.value === 'auto' ? 1.0 : f.value === 'approve' ? 0.66 : f.value === 'suggest' ? 0.33 : 0,
          detail: f.contribution,
          sentiment: 'neutral',
        });
        break;

      case 'user_tier':
        result.push({
          label: 'Your Trust Level',
          progress: f.value === 'auto' ? 1.0 : f.value === 'approve' ? 0.66 : f.value === 'suggest' ? 0.33 : 0,
          detail: f.contribution,
          sentiment: f.value === 'auto' ? 'positive' : 'neutral',
        });
        break;

      case 'cooldown_active':
        result.push({
          label: 'Cooldown Period',
          progress: 0,
          detail: f.contribution,
          sentiment: 'negative',
        });
        break;

      case 'context_risk':
        result.push({
          label: 'Context Risk',
          progress: Math.max(0, Math.min(1, Number(f.value))),
          detail: f.contribution,
          sentiment: 'negative',
        });
        break;

      case 'context:deal_value':
      case 'context:contact_seniority':
      case 'context:deal_stage':
      case 'context:relationship_warmth':
      case 'context:action_reversibility': {
        const label = f.signal.replace('context:', '').replace(/_/g, ' ');
        result.push({
          label: label.charAt(0).toUpperCase() + label.slice(1),
          progress: Number(f.value) || 0,
          detail: f.contribution,
          sentiment: 'neutral',
        });
        break;
      }

      // Skip internal/meta signals
      case 'error_fallback':
      case 'internal_skill':
        break;
    }
  }

  return result;
}

// =============================================================================
// Recommendation builder
// =============================================================================

function buildRecommendation(
  decision: AutonomyDecision,
  actionLabel: string,
  template: ExplanationPayload['template'],
): string {
  switch (template) {
    case 'auto_executing':
      return 'Your agent is handling this automatically. Undo if something looks wrong.';

    case 'requesting_approval':
      if (decision.source === 'org_policy') {
        return 'Your org requires approval for this action type. Contact your admin to change the policy.';
      }
      return `Keep approving ${actionLabel} to build trust toward auto-execution.`;

    case 'suggesting':
      return `Review suggestions and approve or edit to help your agent learn your preferences for ${actionLabel}.`;

    case 'disabled':
      return 'This action type is currently disabled. Contact your org admin to enable it.';

    case 'context_escalation':
      return 'High-stakes context triggered extra scrutiny. This is temporary for this specific action.';

    case 'cooldown':
      return 'A recent issue triggered a cooldown period. Normal autonomy will resume when the cooldown expires.';

    case 'demotion':
      return 'Recent rejections or undos reduced autonomy. Consistent approvals will help rebuild trust.';

    default:
      return '';
  }
}

// =============================================================================
// Next milestone builder
// =============================================================================

async function buildNextMilestone(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  decision: AutonomyDecision,
): Promise<NextMilestone | null> {
  const nextTier = NEXT_TIER[decision.tier];
  if (!nextTier) return null; // Already at auto

  // Fetch current confidence data
  const { data: confidence } = await supabase
    .from('autopilot_confidence')
    .select('total_signals, clean_approval_rate, score, first_signal_at, cooldown_until')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .maybeSingle();

  if (!confidence) {
    return {
      action: `Start using ${ACTION_TYPE_LABELS[actionType] ?? actionType} to begin building trust`,
      metric: `${PROMOTION_MIN_APPROVALS} approvals needed`,
      progress: 0,
    };
  }

  // Check cooldown
  if (confidence.cooldown_until && new Date(confidence.cooldown_until) > new Date()) {
    const daysLeft = Math.ceil(
      (new Date(confidence.cooldown_until).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    return {
      action: `Wait for cooldown to expire (${daysLeft} days remaining)`,
      metric: `Cooldown expires ${new Date(confidence.cooldown_until).toLocaleDateString()}`,
      progress: Math.max(0, 1 - (daysLeft / 30)),
    };
  }

  const totalSignals = confidence.total_signals ?? 0;
  const cleanRate = confidence.clean_approval_rate ?? 0;
  const daysActive = confidence.first_signal_at
    ? Math.floor((Date.now() - new Date(confidence.first_signal_at).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Find the most limiting factor
  const signalsProgress = Math.min(1, totalSignals / PROMOTION_MIN_APPROVALS);
  const daysProgress = Math.min(1, daysActive / PROMOTION_MIN_DAYS);
  const rateProgress = cleanRate >= (1 - PROMOTION_MAX_REJECTION_RATE / 100) ? 1.0 : cleanRate;

  // Return the bottleneck
  if (signalsProgress < daysProgress && signalsProgress < rateProgress) {
    const remaining = Math.max(0, PROMOTION_MIN_APPROVALS - totalSignals);
    return {
      action: `Approve ${remaining} more ${ACTION_TYPE_LABELS[actionType] ?? actionType} to unlock ${nextTier}`,
      metric: `${totalSignals}/${PROMOTION_MIN_APPROVALS} approvals`,
      progress: signalsProgress,
    };
  }

  if (daysProgress < rateProgress) {
    const remaining = Math.max(0, PROMOTION_MIN_DAYS - daysActive);
    return {
      action: `${remaining} more days of activity needed to unlock ${nextTier}`,
      metric: `${daysActive}/${PROMOTION_MIN_DAYS} days active`,
      progress: daysProgress,
    };
  }

  if (rateProgress < 1.0) {
    const targetRate = 100 - PROMOTION_MAX_REJECTION_RATE;
    return {
      action: `Improve approval rate to ${targetRate}% to unlock ${nextTier}`,
      metric: `Current: ${(cleanRate * 100).toFixed(0)}% (target: ${targetRate}%)`,
      progress: rateProgress,
    };
  }

  // All criteria met — promotion should be pending
  return {
    action: `All criteria met for ${nextTier} — promotion should be queued soon`,
    metric: 'Waiting for daily evaluation',
    progress: 1.0,
  };
}

// =============================================================================
// Compact formatter (for Slack)
// =============================================================================

/**
 * Generates a compact plain-text explanation for Slack DMs.
 * Uses text indicators instead of progress bars.
 */
export function formatExplanationForSlack(payload: ExplanationPayload): string {
  const lines: string[] = [];

  lines.push(payload.summary);
  lines.push('');

  for (const f of payload.factors) {
    const indicator = f.sentiment === 'positive' ? '+++' : f.sentiment === 'negative' ? '---' : '...';
    lines.push(`  ${indicator} ${f.label}: ${f.detail}`);
  }

  if (payload.next_milestone) {
    lines.push('');
    const pct = (payload.next_milestone.progress * 100).toFixed(0);
    lines.push(`Next: ${payload.next_milestone.action} (${pct}% there)`);
  }

  if (payload.recommendation) {
    lines.push('');
    lines.push(payload.recommendation);
  }

  return lines.join('\n');
}
