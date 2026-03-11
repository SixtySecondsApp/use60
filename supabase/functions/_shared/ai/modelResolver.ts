/**
 * modelResolver.ts — AI Model Resolver (ROUTE-002)
 *
 * Resolves which AI provider + model to use for a given feature and org,
 * based on:
 *   1. Org-level quality_tier preference in model_preferences
 *   2. Org-level restrictions in org_model_restrictions
 *   3. Static feature_model_map for tier → provider + model_id
 *   4. Built-in fallback if no preference is set
 *
 * Usage in edge functions:
 *   const resolver = new ModelResolver(supabase);
 *   const model = await resolver.resolve(orgId, 'copilot_chat');
 *   // → { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', displayName: '...', tier: 'standard' }
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ============================================================================
// Types
// ============================================================================

export type QualityTier = 'economy' | 'standard' | 'premium';
export type FeatureCategory =
  | 'copilot_chat'
  | 'meeting_summary'
  | 'research_enrichment'
  | 'content_generation'
  | 'crm_update'
  | 'task_execution';

export interface ResolvedModel {
  provider: string;
  modelId: string;
  displayName: string;
  tier: QualityTier;
  restricted: boolean; // true if org restrictions capped the tier
}

// ============================================================================
// Built-in fallbacks (used when DB lookup fails)
// ============================================================================

const FALLBACK_MAP: Record<FeatureCategory, Record<QualityTier, { provider: string; modelId: string; displayName: string }>> = {
  copilot_chat: {
    economy:  { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',  displayName: 'Claude Haiku 4.5' },
    standard: { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
    premium:  { provider: 'anthropic', modelId: 'claude-opus-4-6',             displayName: 'Claude Opus 4.6' },
  },
  meeting_summary: {
    economy:  { provider: 'google',    modelId: 'gemini-3.1-flash-lite-preview',       displayName: 'Gemini 3.1 Flash Lite' },
    standard: { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',   displayName: 'Claude Haiku 4.5' },
    premium:  { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
  },
  research_enrichment: {
    economy:  { provider: 'google',    modelId: 'gemini-3.1-flash-lite-preview',       displayName: 'Gemini 3.1 Flash Lite' },
    standard: { provider: 'google',    modelId: 'gemini-3.1-flash-lite-preview',       displayName: 'Gemini 3.1 Flash Lite' },
    premium:  { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
  },
  content_generation: {
    economy:  { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',   displayName: 'Claude Haiku 4.5' },
    standard: { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
    premium:  { provider: 'anthropic', modelId: 'claude-opus-4-6',             displayName: 'Claude Opus 4.6' },
  },
  crm_update: {
    economy:  { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',   displayName: 'Claude Haiku 4.5' },
    standard: { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',   displayName: 'Claude Haiku 4.5' },
    premium:  { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
  },
  task_execution: {
    economy:  { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001',   displayName: 'Claude Haiku 4.5' },
    standard: { provider: 'anthropic', modelId: 'claude-sonnet-4-6',           displayName: 'Claude Sonnet 4.6' },
    premium:  { provider: 'anthropic', modelId: 'claude-opus-4-6',             displayName: 'Claude Opus 4.6' },
  },
};

const TIER_ORDER: QualityTier[] = ['economy', 'standard', 'premium'];

function capTier(requested: QualityTier, maxTier: QualityTier | null): QualityTier {
  if (!maxTier) return requested;
  const requestedIdx = TIER_ORDER.indexOf(requested);
  const maxIdx = TIER_ORDER.indexOf(maxTier);
  return requestedIdx <= maxIdx ? requested : maxTier;
}

// ============================================================================
// ModelResolver class
// ============================================================================

export class ModelResolver {
  private supabase: SupabaseClient;
  // Per-request cache: avoid duplicate DB hits for same org
  private prefCache: Map<string, QualityTier> = new Map();
  private restrictCache: Map<string, { allowedProviders: string[]; blockedModelIds: string[]; maxTier: QualityTier | null }> = new Map();
  private mapCache: Map<string, { provider: string; modelId: string; displayName: string }> = new Map();

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Resolve the model for a given org + feature.
   * Falls back gracefully if any DB call fails.
   */
  async resolve(orgId: string, feature: FeatureCategory): Promise<ResolvedModel> {
    // 1. Get org quality tier preference (default: standard)
    let requestedTier: QualityTier = 'standard';
    try {
      requestedTier = await this.getOrgTier(orgId, feature);
    } catch {
      // use default
    }

    // 2. Apply org restrictions (cap tier, filter providers)
    let restrictions: { allowedProviders: string[]; blockedModelIds: string[]; maxTier: QualityTier | null } | null = null;
    try {
      restrictions = await this.getRestrictions(orgId);
    } catch {
      // no restrictions
    }

    let actualTier = requestedTier;
    let restricted = false;
    if (restrictions?.maxTier) {
      actualTier = capTier(requestedTier, restrictions.maxTier);
      if (actualTier !== requestedTier) restricted = true;
    }

    // 3. Look up model from feature_model_map, applying provider/model restrictions
    const model = await this.getModel(feature, actualTier, restrictions?.allowedProviders ?? [], restrictions?.blockedModelIds ?? []);

    return { ...model, tier: actualTier, restricted };
  }

  /** Get org's preferred tier for a feature from model_preferences */
  private async getOrgTier(orgId: string, feature: FeatureCategory): Promise<QualityTier> {
    const cacheKey = `${orgId}:${feature}`;
    if (this.prefCache.has(cacheKey)) return this.prefCache.get(cacheKey)!;

    const { data } = await this.supabase
      .from('model_preferences')
      .select('tier')
      .eq('org_id', orgId)
      .eq('feature', feature)
      .maybeSingle();

    const tier = (data?.tier as QualityTier | null) ?? 'standard';
    this.prefCache.set(cacheKey, tier);
    return tier;
  }

  /** Get org-level model restrictions */
  private async getRestrictions(orgId: string) {
    if (this.restrictCache.has(orgId)) return this.restrictCache.get(orgId)!;

    const { data } = await this.supabase
      .from('org_model_restrictions')
      .select('allowed_providers, blocked_model_ids, max_tier')
      .eq('org_id', orgId)
      .maybeSingle();

    const result = {
      allowedProviders: data?.allowed_providers ?? [],
      blockedModelIds: data?.blocked_model_ids ?? [],
      maxTier: (data?.max_tier as QualityTier | null) ?? null,
    };
    this.restrictCache.set(orgId, result);
    return result;
  }

  /** Look up model from feature_model_map, with provider/model filtering */
  private async getModel(
    feature: FeatureCategory,
    tier: QualityTier,
    allowedProviders: string[],
    blockedModelIds: string[],
  ): Promise<{ provider: string; modelId: string; displayName: string }> {
    const cacheKey = `${feature}:${tier}`;
    if (this.mapCache.has(cacheKey)) {
      const cached = this.mapCache.get(cacheKey)!;
      if (this.isAllowed(cached.provider, cached.modelId, allowedProviders, blockedModelIds)) {
        return cached;
      }
    }

    // Try DB first
    try {
      const { data } = await this.supabase
        .from('feature_model_map')
        .select('provider, model_id, display_name')
        .eq('feature', feature)
        .eq('tier', tier)
        .maybeSingle();

      if (data && this.isAllowed(data.provider, data.model_id, allowedProviders, blockedModelIds)) {
        const result = { provider: data.provider, modelId: data.model_id, displayName: data.display_name };
        this.mapCache.set(cacheKey, result);
        return result;
      }
    } catch {
      // fall through to built-in fallback
    }

    // Fallback: try tiers in descending order until allowed model found
    const tiersToTry: QualityTier[] = [tier, 'standard', 'economy'];
    for (const t of tiersToTry) {
      const fallback = FALLBACK_MAP[feature]?.[t];
      if (fallback && this.isAllowed(fallback.provider, fallback.modelId, allowedProviders, blockedModelIds)) {
        return fallback;
      }
    }

    // Last resort: return hardcoded economy tier (always allowed)
    return FALLBACK_MAP[feature]?.['economy'] ?? {
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      displayName: 'Claude Haiku 4.5',
    };
  }

  private isAllowed(provider: string, modelId: string, allowedProviders: string[], blockedModelIds: string[]): boolean {
    if (allowedProviders.length > 0 && !allowedProviders.includes(provider)) return false;
    if (blockedModelIds.includes(modelId)) return false;
    return true;
  }
}
