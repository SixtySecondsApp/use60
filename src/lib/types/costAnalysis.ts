/**
 * Cost Analysis Types
 *
 * Type definitions for cost tracking, analysis, and pricing calculations
 * Includes model-specific rates for Claude Haiku 4.5, Claude Sonnet 4, and Gemini
 */

// ============================================================================
// Cost Rate Definitions
// ============================================================================

export interface CostRate {
  id: string;
  provider: 'anthropic' | 'gemini' | 'supabase';
  model: string; // 'claude-haiku-4-5', 'claude-sonnet-4', 'gemini-2.5-flash'
  input_cost_per_million: number; // Cost per 1M input tokens
  output_cost_per_million: number; // Cost per 1M output tokens
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

// Default cost rates (Dec 2024 pricing in GBP)
// USD to GBP conversion rate: ~0.79 (as of Dec 2024)
// Rates are stored in GBP (£) per million tokens
export const DEFAULT_COST_RATES: Omit<CostRate, 'id' | 'created_at' | 'effective_from' | 'effective_to'>[] = [
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    input_cost_per_million: 0.20,  // $0.25 → £0.20
    output_cost_per_million: 0.99,  // $1.25 → £0.99
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    input_cost_per_million: 2.37,  // $3.00 → £2.37
    output_cost_per_million: 11.85,  // $15.00 → £11.85
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    input_cost_per_million: 2.37,  // $3.00 → £2.37
    output_cost_per_million: 11.85,  // $15.00 → £11.85
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    input_cost_per_million: 0.059,  // $0.075 → £0.059
    output_cost_per_million: 0.237,  // $0.30 → £0.237
  },
];

// ============================================================================
// AI Cost Events
// ============================================================================

export interface AICostEvent {
  id: string;
  org_id: string;
  user_id: string | null;
  provider: 'anthropic' | 'gemini';
  model: string;
  feature: string | null; // 'transcript_analysis', 'copilot', 'proposal', 'meeting_search'
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  provider_cost_usd: number | null; // Actual provider cost in USD (null for historical rows)
  credits_charged: number | null;   // Credits deducted from user's balance (null for historical rows)
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================================
// Cost Analysis Results
// ============================================================================

export interface ModelUsageBreakdown {
  model: string;
  provider: 'anthropic' | 'gemini';
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  call_count: number;
  total_provider_cost_usd: number | null; // Sum of provider_cost_usd; null if all rows are historical
  total_credits_charged: number | null;   // Sum of credits_charged; null if all rows are historical
  has_estimated_rows: boolean;            // True if any rows in this group have NULL provider_cost_usd
}

export interface OrganizationCostAnalysis {
  org_id: string;
  org_name: string;
  plan_name: string;
  plan_slug: string;
  period_start: string;
  period_end: string;
  
  // Usage metrics
  meetings_count: number;
  active_users_count: number;
  storage_mb: number;
  
  // AI costs by model
  model_breakdown: ModelUsageBreakdown[];
  total_ai_cost: number;
  
  // Infrastructure costs
  storage_cost: number;
  database_cost: number;
  
  // Totals
  total_cost: number;
  revenue: number; // Monthly recurring revenue
  margin_percent: number;
  cost_per_meeting: number;
  cost_per_user: number;
}

export interface CostAnalysisSummary {
  total_organizations: number;
  total_meetings: number;
  total_active_users: number;
  total_ai_cost: number;
  total_infrastructure_cost: number;
  total_cost: number;
  total_revenue: number;
  average_margin_percent: number;
  average_cost_per_meeting: number;
  average_cost_per_user: number;

  // Credit-based margin fields (from provider_cost_usd / credits_charged columns)
  total_provider_cost_usd: number;   // Sum of provider_cost_usd (actual cost reported by APIs)
  total_credits_charged: number;     // Sum of credits deducted from users
  credits_revenue_gbp: number;       // total_credits_charged * £0.396 (Insight pack rate)
  provider_cost_gbp: number;         // total_provider_cost_usd converted to GBP at ~0.79
  credits_margin_pct: number | null; // ((credits_revenue - provider_cost_gbp) / credits_revenue) * 100
  has_estimated_rows: boolean;       // True if any rows are historical (provider_cost_usd IS NULL)

  // Model breakdown
  model_breakdown: ModelUsageBreakdown[];

  // Tier breakdown
  tier_breakdown: TierCostAnalysis[];
}

export interface TierCostAnalysis {
  tier_slug: string;
  tier_name: string;
  organization_count: number;
  total_meetings: number;
  total_cost: number;
  total_revenue: number;
  average_cost_per_org: number;
  average_margin_percent: number;
}

// ============================================================================
// Cost Estimation Inputs
// ============================================================================

export interface CostEstimationInput {
  meetings_per_month: number;
  copilot_conversations_per_month?: number;
  proposals_per_month?: number;
  meeting_searches_per_month?: number;
  storage_gb?: number;
}

export interface CostEstimationResult {
  // Per-meeting costs (Haiku 4.5)
  meeting_processing_cost: number;
  
  // Copilot costs (Sonnet 4)
  copilot_cost: number;
  
  // Proposal costs (Sonnet 4)
  proposal_cost: number;
  
  // Search costs (Gemini)
  search_cost: number;
  
  // Infrastructure
  storage_cost: number;
  database_cost: number;
  
  // Totals
  total_ai_cost: number;
  total_infrastructure_cost: number;
  total_cost: number;
  
  // Breakdown by model
  model_breakdown: {
    model: string;
    cost: number;
    percentage: number;
  }[];
}

// ============================================================================
// Margin Calculator
// ============================================================================

export interface MarginCalculation {
  target_margin_percent: number;
  estimated_cost_per_month: number;
  recommended_price: number;
  actual_margin_percent: number;
  scenarios: {
    meetings_per_month: number;
    estimated_cost: number;
    recommended_price: number;
    margin_percent: number;
  }[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate cost from tokens using cost rates
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  rate: CostRate
): number {
  const inputCost = (inputTokens / 1_000_000) * rate.input_cost_per_million;
  const outputCost = (outputTokens / 1_000_000) * rate.output_cost_per_million;
  return inputCost + outputCost;
}

/**
 * Get cost rate for a model
 */
export function getCostRateForModel(
  model: string,
  provider: 'anthropic' | 'gemini',
  rates: CostRate[]
): CostRate | null {
  return rates.find(
    (r) => r.provider === provider && r.model === model && !r.effective_to
  ) || null;
}

/**
 * Format cost for display (GBP by default)
 */
export function formatCost(cost: number, currency: string = 'GBP'): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '$';
  
  if (cost < 0.01) {
    if (currency === 'GBP') {
      return `£${(cost * 100).toFixed(2)}p`;
    }
    return `${symbol}${(cost * 1000).toFixed(2)}¢`;
  }
  
  // Use proper currency formatting
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(cost);
}

/**
 * Format large numbers
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(2)}K`;
  }
  return tokens.toString();
}

