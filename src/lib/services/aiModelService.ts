/**
 * AI Model Service
 *
 * Service for managing AI models and feature configurations
 * - Fetch available models from all providers
 * - Manage feature → model mappings
 * - Handle org-level overrides
 * - Trigger model sync from providers
 */

import { supabase } from '@/lib/supabase/clientV2';
import type {
  AIModel,
  AIFeatureConfig,
  AIFeatureConfigUpdate,
  OrgAIConfig,
  OrgAIConfigUpdate,
  EffectiveAIConfig,
  SyncResponse,
  AIProvider,
} from '@/lib/types/aiModels';

// ============================================================================
// AI Models
// ============================================================================

/**
 * Get all available AI models
 */
export async function getAvailableModels(options?: {
  provider?: AIProvider;
  includeDeprecated?: boolean;
}): Promise<AIModel[]> {
  let query = supabase
    .from('ai_models')
    .select('*')
    .eq('is_available', true)
    .order('provider')
    .order('display_name');

  if (options?.provider) {
    query = query.eq('provider', options.provider);
  }

  if (!options?.includeDeprecated) {
    query = query.eq('is_deprecated', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching AI models:', error);
    return [];
  }

  return data || [];
}

/**
 * Get a specific AI model by ID
 */
export async function getModelById(modelId: string): Promise<AIModel | null> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('id', modelId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching AI model:', error);
    return null;
  }

  return data;
}

/**
 * Sync models from all providers
 */
export async function syncModelsFromProviders(provider?: AIProvider): Promise<SyncResponse> {
  const params = provider ? `?provider=${provider}` : '';

  const { data, error } = await supabase.functions.invoke('sync-ai-models' + params, {
    method: 'POST',
  });

  if (error) {
    console.error('Error syncing AI models:', error);
    return {
      success: false,
      results: [],
      totalModels: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  return data as SyncResponse;
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  const { data, error } = await supabase
    .from('ai_models')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.last_synced_at;
}

// ============================================================================
// Feature Configurations
// ============================================================================

/**
 * Get all feature configurations with joined model details
 */
export async function getFeatureConfigs(): Promise<AIFeatureConfig[]> {
  const { data, error } = await supabase
    .from('ai_feature_config')
    .select(`
      *,
      primary_model:ai_models!ai_feature_config_primary_model_id_fkey(*),
      fallback_model:ai_models!ai_feature_config_fallback_model_id_fkey(*)
    `)
    .order('category')
    .order('display_name');

  if (error) {
    console.error('Error fetching feature configs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get feature configuration by key
 */
export async function getFeatureConfig(featureKey: string): Promise<AIFeatureConfig | null> {
  const { data, error } = await supabase
    .from('ai_feature_config')
    .select(`
      *,
      primary_model:ai_models!ai_feature_config_primary_model_id_fkey(*),
      fallback_model:ai_models!ai_feature_config_fallback_model_id_fkey(*)
    `)
    .eq('feature_key', featureKey)
    .maybeSingle();

  if (error) {
    console.error('Error fetching feature config:', error);
    return null;
  }

  return data;
}

/**
 * Update feature configuration (platform admin only)
 */
export async function updateFeatureConfig(
  featureKey: string,
  update: AIFeatureConfigUpdate
): Promise<AIFeatureConfig | null> {
  const { data, error } = await supabase
    .from('ai_feature_config')
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq('feature_key', featureKey)
    .select(`
      *,
      primary_model:ai_models!ai_feature_config_primary_model_id_fkey(*),
      fallback_model:ai_models!ai_feature_config_fallback_model_id_fkey(*)
    `)
    .single();

  if (error) {
    console.error('Error updating feature config:', error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Get features grouped by category
 */
export async function getFeaturesByCategory(): Promise<Record<string, AIFeatureConfig[]>> {
  const configs = await getFeatureConfigs();

  return configs.reduce(
    (acc, config) => {
      const category = config.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(config);
      return acc;
    },
    {} as Record<string, AIFeatureConfig[]>
  );
}

// ============================================================================
// Organization AI Config (Overrides)
// ============================================================================

/**
 * Get org-level AI config overrides
 */
export async function getOrgAIConfigs(orgId: string): Promise<OrgAIConfig[]> {
  const { data, error } = await supabase
    .from('org_ai_config')
    .select(`
      *,
      model:ai_models(*),
      feature:ai_feature_config(*)
    `)
    .eq('org_id', orgId)
    .order('feature_key');

  if (error) {
    console.error('Error fetching org AI configs:', error);
    return [];
  }

  return data || [];
}

/**
 * Get effective AI config for an org (merged with global defaults)
 */
export async function getEffectiveAIConfig(orgId: string): Promise<EffectiveAIConfig[]> {
  const { data, error } = await supabase.rpc('get_org_effective_ai_config', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('Error fetching effective AI config:', error);
    return [];
  }

  return data || [];
}

/**
 * Update or create org-level AI config override
 */
export async function upsertOrgAIConfig(
  orgId: string,
  featureKey: string,
  update: OrgAIConfigUpdate
): Promise<OrgAIConfig | null> {
  const { data, error } = await supabase
    .from('org_ai_config')
    .upsert(
      {
        org_id: orgId,
        feature_key: featureKey,
        ...update,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'org_id,feature_key',
      }
    )
    .select(`
      *,
      model:ai_models(*),
      feature:ai_feature_config(*)
    `)
    .single();

  if (error) {
    console.error('Error upserting org AI config:', error);
    throw new Error(error.message);
  }

  return data;
}

/**
 * Delete org-level AI config override (revert to global default)
 */
export async function deleteOrgAIConfig(orgId: string, featureKey: string): Promise<void> {
  const { error } = await supabase
    .from('org_ai_config')
    .delete()
    .eq('org_id', orgId)
    .eq('feature_key', featureKey);

  if (error) {
    console.error('Error deleting org AI config:', error);
    throw new Error(error.message);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get model for a specific feature, considering org overrides
 */
export async function getModelForFeature(
  featureKey: string,
  orgId?: string
): Promise<{ model: AIModel; isOverride: boolean; isFallback: boolean } | null> {
  const { data, error } = await supabase.rpc('get_model_for_feature', {
    p_feature_key: featureKey,
    p_org_id: orgId || null,
  });

  if (error || !data || data.length === 0) {
    console.error('Error getting model for feature:', error);
    return null;
  }

  const result = data[0];
  const model = await getModelById(result.model_id);

  if (!model) {
    return null;
  }

  return {
    model,
    isOverride: !!orgId && result.is_fallback === false,
    isFallback: result.is_fallback,
  };
}

/**
 * Calculate estimated cost for tokens
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: AIModel
): number {
  const inputCost = (inputTokens / 1_000_000) * model.input_cost_per_million;
  const outputCost = (outputTokens / 1_000_000) * model.output_cost_per_million;
  return inputCost + outputCost;
}
