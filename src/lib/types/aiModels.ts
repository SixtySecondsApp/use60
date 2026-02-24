/**
 * AI Models Type Definitions
 *
 * Types for AI model management, feature configuration, and usage tracking
 */

// ============================================================================
// Provider Types
// ============================================================================

export type AIProvider = 'anthropic' | 'google' | 'openrouter' | 'kimi';

export const AI_PROVIDERS: Record<AIProvider, { name: string; color: string }> = {
  anthropic: { name: 'Anthropic', color: '#D97706' },
  google: { name: 'Google', color: '#4285F4' },
  openrouter: { name: 'OpenRouter', color: '#6366F1' },
  kimi: { name: 'Kimi', color: '#10B981' },
};

// ============================================================================
// AI Model
// ============================================================================

export interface AIModel {
  id: string;
  provider: AIProvider;
  model_id: string;
  display_name: string;
  input_cost_per_million: number;
  output_cost_per_million: number;
  context_window: number | null;
  max_output_tokens: number | null;
  supports_vision: boolean;
  supports_function_calling: boolean;
  supports_streaming: boolean;
  is_available: boolean;
  is_deprecated: boolean;
  provider_metadata: Record<string, unknown>;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Feature Configuration
// ============================================================================

export type FeatureCategory =
  | 'Copilot'
  | 'Enrichment'
  | 'Meetings'
  | 'Content'
  | 'Documents'
  | 'Skills'
  | 'Intelligence';

export interface AIFeatureConfig {
  id: string;
  feature_key: string;
  display_name: string;
  description: string | null;
  category: FeatureCategory;
  primary_model_id: string | null;
  fallback_model_id: string | null;
  is_enabled: boolean;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  temperature: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;

  // Joined model details
  primary_model?: AIModel;
  fallback_model?: AIModel;
}

export interface AIFeatureConfigUpdate {
  primary_model_id?: string | null;
  fallback_model_id?: string | null;
  is_enabled?: boolean;
  temperature?: number;
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
  settings?: Record<string, unknown>;
}

// ============================================================================
// Organization AI Config (Overrides)
// ============================================================================

export interface OrgAIConfig {
  id: string;
  org_id: string;
  feature_key: string;
  model_id: string | null;
  is_enabled: boolean;
  custom_temperature: number | null;
  custom_max_tokens: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined details
  model?: AIModel;
  feature?: AIFeatureConfig;
}

export interface OrgAIConfigUpdate {
  model_id?: string | null;
  is_enabled?: boolean;
  custom_temperature?: number | null;
  custom_max_tokens?: number | null;
  notes?: string | null;
}

// ============================================================================
// Effective Config (Merged)
// ============================================================================

export interface EffectiveAIConfig {
  feature_key: string;
  display_name: string;
  category: FeatureCategory;
  model_id: string | null;
  model_name: string | null;
  provider: AIProvider | null;
  is_override: boolean;
  is_enabled: boolean;
}

// ============================================================================
// Usage Statistics
// ============================================================================

export interface AIUsageByFeature {
  feature_key: string;
  feature_name: string | null;
  category: FeatureCategory | null;
  provider: AIProvider;
  model: string;
  usage_date: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export interface AIUsageByOrg {
  org_id: string;
  org_name: string | null;
  feature_key: string;
  feature_name: string | null;
  category: FeatureCategory | null;
  provider: AIProvider;
  model: string;
  usage_date: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

export interface AIUsageByUser {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  org_id: string;
  feature_key: string;
  feature_name: string | null;
  provider: AIProvider;
  model: string;
  usage_date: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

// ============================================================================
// Aggregated Stats
// ============================================================================

export interface AIUsageSummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  by_provider: Record<AIProvider, {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  }>;
  by_feature: Record<string, {
    feature_name: string;
    category: FeatureCategory;
    calls: number;
    cost: number;
  }>;
  by_model: Record<string, {
    display_name: string;
    provider: AIProvider;
    calls: number;
    cost: number;
  }>;
  daily_trend: Array<{
    date: string;
    calls: number;
    cost: number;
  }>;
}

export interface OrgUsageSummary extends AIUsageSummary {
  org_id: string;
  org_name: string;
  features_used: string[];
}

// ============================================================================
// Sync Results
// ============================================================================

export interface ModelSyncResult {
  provider: string;
  success: boolean;
  modelsCount: number;
  error?: string;
}

export interface SyncResponse {
  success: boolean;
  results: ModelSyncResult[];
  totalModels: number;
  syncedAt: string;
}

// ============================================================================
// Filter Options
// ============================================================================

export interface AIUsageFilters {
  startDate?: string;
  endDate?: string;
  provider?: AIProvider;
  feature_key?: string;
  org_id?: string;
  user_id?: string;
  model_id?: string;
}

export interface AIUsageTimeRange {
  label: string;
  value: 'today' | '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'custom';
  startDate?: string;
  endDate?: string;
}

export const DEFAULT_TIME_RANGES: AIUsageTimeRange[] = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'This month', value: 'this_month' },
  { label: 'Last month', value: 'last_month' },
  { label: 'Custom range', value: 'custom' },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function formatCost(cost: number, currency: 'USD' | 'GBP' = 'USD'): string {
  const symbol = currency === 'GBP' ? '£' : '$';

  if (cost < 0.01) {
    return `${symbol}${cost.toFixed(4)}`;
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cost);
}

export function getProviderColor(provider: AIProvider): string {
  return AI_PROVIDERS[provider]?.color || '#6B7280';
}

export function getTimeRangeDates(range: AIUsageTimeRange['value']): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  switch (range) {
    case 'today':
      return { startDate: endDate, endDate };
    case '7d':
      now.setDate(now.getDate() - 7);
      return { startDate: now.toISOString().split('T')[0], endDate };
    case '30d':
      now.setDate(now.getDate() - 30);
      return { startDate: now.toISOString().split('T')[0], endDate };
    case '90d':
      now.setDate(now.getDate() - 90);
      return { startDate: now.toISOString().split('T')[0], endDate };
    case 'this_month':
      return {
        startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        endDate,
      };
    case 'last_month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: lastMonth.toISOString().split('T')[0],
        endDate: lastMonthEnd.toISOString().split('T')[0],
      };
    }
    default:
      return { startDate: endDate, endDate };
  }
}
