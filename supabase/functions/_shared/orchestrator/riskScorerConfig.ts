/**
 * Risk Scorer Configuration
 *
 * Reads deal_risk scorer config from PRD-01 Agent Configuration Engine.
 * Falls back to sensible defaults matching PRD-04 spec.
 *
 * Story: RSK-002
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getAgentConfig } from '../config/agentConfigEngine.ts';
import type { AgentConfigMap } from '../config/types.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// =============================================================================
// Config Types
// =============================================================================

export interface RiskScorerWeights {
  engagement: number;
  champion: number;
  momentum: number;
  sentiment: number;
}

export interface RiskThresholds {
  alert_high: number;
  alert_critical: number;
}

export interface SignalWeightOverrides {
  [signalType: string]: 'low' | 'medium' | 'high' | 'critical';
}

export interface StageTimeBaselines {
  [stageName: string]: number; // days
}

export interface AlertSettings {
  delivery_channel: 'slack_dm' | 'in_app' | 'both';
  include_evidence: boolean;
  include_playbook: boolean;
}

export interface UserAlertOverrides {
  alert_threshold: number | null; // null = use org default
  quiet_hours_start: number | null; // hour (0-23), null = no quiet hours
  quiet_hours_end: number | null;
  playbook_preferences: 'full' | 'actions_only' | 'data_only';
}

export interface RiskScorerConfig {
  weights: RiskScorerWeights;
  thresholds: RiskThresholds;
  signal_weights: SignalWeightOverrides;
  stage_time_baselines: StageTimeBaselines;
  alert_settings: AlertSettings;
  user_overrides: UserAlertOverrides | null;
}

// =============================================================================
// Defaults (PRD-04 spec)
// =============================================================================

const DEFAULT_WEIGHTS: RiskScorerWeights = {
  engagement: 0.25,
  champion: 0.25,
  momentum: 0.25,
  sentiment: 0.25,
};

const DEFAULT_THRESHOLDS: RiskThresholds = {
  alert_high: 61,
  alert_critical: 81,
};

const DEFAULT_SIGNAL_WEIGHTS: SignalWeightOverrides = {
  timeline_slip: 'medium',
  budget_concern: 'high',
  competitor_mention: 'high',
  champion_silent: 'high',
  sentiment_decline: 'medium',
  stalled_deal: 'high',
  objection_unresolved: 'medium',
  stakeholder_concern: 'medium',
  scope_creep: 'low',
  decision_delay: 'high',
};

const DEFAULT_STAGE_BASELINES: StageTimeBaselines = {
  discovery: 14,
  qualification: 10,
  proposal: 18,
  negotiation: 12,
};

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  delivery_channel: 'slack_dm',
  include_evidence: true,
  include_playbook: true,
};

const DEFAULT_USER_OVERRIDES: UserAlertOverrides = {
  alert_threshold: null,
  quiet_hours_start: 18,
  quiet_hours_end: 8,
  playbook_preferences: 'full',
};

// =============================================================================
// Cache (5-minute TTL, consistent with PRD-01/PRD-02)
// =============================================================================

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  config: RiskScorerConfig;
  cachedAt: number;
}

const riskConfigCache = new Map<string, CacheEntry>();

function riskCacheKey(orgId: string, userId: string | null): string {
  return `risk:${orgId}:${userId ?? 'null'}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Load risk scorer configuration for an org (and optionally user).
 * Uses PRD-01 Agent Configuration Engine with fallback defaults.
 */
export async function loadRiskScorerConfig(
  client: SupabaseClient,
  orgId: string,
  userId: string | null = null,
): Promise<RiskScorerConfig> {
  const key = riskCacheKey(orgId, userId);
  const cached = riskConfigCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    // Load full config for deal_risk agent type
    const agentConfig: AgentConfigMap = await getAgentConfig(
      client,
      orgId,
      userId,
      'deal_risk',
    );

    const config = buildConfigFromEntries(agentConfig);

    riskConfigCache.set(key, { config, cachedAt: Date.now() });
    return config;
  } catch (err) {
    console.warn('[riskScorerConfig] Failed to load from config engine, using defaults:', err);
    const fallback = buildDefaultConfig();
    riskConfigCache.set(key, { config: fallback, cachedAt: Date.now() });
    return fallback;
  }
}

/**
 * Build config from PRD-01 resolved entries, with per-key fallbacks.
 */
function buildConfigFromEntries(agentConfig: AgentConfigMap): RiskScorerConfig {
  const get = <T>(key: string, fallback: T): T => {
    const entry = agentConfig.entries[key];
    return entry?.config_value != null ? (entry.config_value as T) : fallback;
  };

  // Extract scoring_weights from thresholds config (PRD-04 nests under 'thresholds' key)
  const thresholdsConfig = get<Record<string, unknown>>('thresholds', {});
  const scoringWeightsRaw = thresholdsConfig?.scoring_weights as Partial<RiskScorerWeights> | undefined;

  const weights: RiskScorerWeights = {
    engagement: scoringWeightsRaw?.engagement ?? DEFAULT_WEIGHTS.engagement,
    champion: scoringWeightsRaw?.champion ?? DEFAULT_WEIGHTS.champion,
    momentum: scoringWeightsRaw?.momentum ?? DEFAULT_WEIGHTS.momentum,
    sentiment: scoringWeightsRaw?.sentiment ?? DEFAULT_WEIGHTS.sentiment,
  };

  // Normalize weights to sum to 1.0
  const weightSum = weights.engagement + weights.champion + weights.momentum + weights.sentiment;
  if (weightSum > 0 && Math.abs(weightSum - 1.0) > 0.01) {
    weights.engagement /= weightSum;
    weights.champion /= weightSum;
    weights.momentum /= weightSum;
    weights.sentiment /= weightSum;
  }

  const riskThresholdsRaw = thresholdsConfig?.risk_thresholds as Partial<RiskThresholds> | undefined;
  const thresholds: RiskThresholds = {
    alert_high: riskThresholdsRaw?.alert_high ?? DEFAULT_THRESHOLDS.alert_high,
    alert_critical: riskThresholdsRaw?.alert_critical ?? DEFAULT_THRESHOLDS.alert_critical,
  };

  const signal_weights: SignalWeightOverrides = {
    ...DEFAULT_SIGNAL_WEIGHTS,
    ...(thresholdsConfig?.signal_weights as SignalWeightOverrides | undefined),
  };

  const stage_time_baselines: StageTimeBaselines = {
    ...DEFAULT_STAGE_BASELINES,
    ...(thresholdsConfig?.stage_time_baselines as StageTimeBaselines | undefined),
  };

  // Delivery config
  const deliveryConfig = get<Partial<AlertSettings>>('delivery', {});
  const alert_settings: AlertSettings = {
    delivery_channel: deliveryConfig?.delivery_channel ?? DEFAULT_ALERT_SETTINGS.delivery_channel,
    include_evidence: deliveryConfig?.include_evidence ?? DEFAULT_ALERT_SETTINGS.include_evidence,
    include_playbook: deliveryConfig?.include_playbook ?? DEFAULT_ALERT_SETTINGS.include_playbook,
  };

  // User overrides (from user-level config)
  let user_overrides: UserAlertOverrides | null = null;
  const boundariesConfig = get<Record<string, unknown>>('boundaries', {});
  if (boundariesConfig?.quiet_hours_start !== undefined || boundariesConfig?.alert_threshold !== undefined) {
    user_overrides = {
      alert_threshold: (boundariesConfig.alert_threshold as number) ?? DEFAULT_USER_OVERRIDES.alert_threshold,
      quiet_hours_start: (boundariesConfig.quiet_hours_start as number) ?? DEFAULT_USER_OVERRIDES.quiet_hours_start,
      quiet_hours_end: (boundariesConfig.quiet_hours_end as number) ?? DEFAULT_USER_OVERRIDES.quiet_hours_end,
      playbook_preferences: (boundariesConfig.playbook_preferences as UserAlertOverrides['playbook_preferences']) ?? DEFAULT_USER_OVERRIDES.playbook_preferences,
    };
  }

  return { weights, thresholds, signal_weights, stage_time_baselines, alert_settings, user_overrides };
}

function buildDefaultConfig(): RiskScorerConfig {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    signal_weights: { ...DEFAULT_SIGNAL_WEIGHTS },
    stage_time_baselines: { ...DEFAULT_STAGE_BASELINES },
    alert_settings: { ...DEFAULT_ALERT_SETTINGS },
    user_overrides: null,
  };
}

/**
 * Check if current time is within user's quiet hours.
 */
export function isQuietHours(userOverrides: UserAlertOverrides | null): boolean {
  if (!userOverrides?.quiet_hours_start || !userOverrides?.quiet_hours_end) return false;

  const now = new Date();
  const hour = now.getHours();
  const start = userOverrides.quiet_hours_start;
  const end = userOverrides.quiet_hours_end;

  // Handle overnight ranges (e.g., 18-8)
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/**
 * Get the effective alert threshold for a user (user override or org default).
 */
export function getEffectiveAlertThreshold(config: RiskScorerConfig): number {
  return config.user_overrides?.alert_threshold ?? config.thresholds.alert_high;
}

/**
 * Clear the risk scorer config cache.
 */
export function clearRiskConfigCache(): void {
  riskConfigCache.clear();
}
