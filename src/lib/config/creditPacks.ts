// ============================================================================
// Credit Pack Definitions and Cost Constants
// ============================================================================
// 1 credit ≈ $0.10 USD (10x denomination — e.g. $4.90 starter = 49 credits)
// All costs expressed in credit units.

// ============================================================================
// Types
// ============================================================================

export type PackType =
  | 'starter'
  | 'growth'
  | 'scale'
  | 'agency_starter'
  | 'agency_growth'
  | 'agency_scale'
  | 'agency_enterprise'
  | 'custom';

export type IntelligenceTier = 'low' | 'medium' | 'high';

export interface CreditPack {
  packType: PackType;
  credits: number;
  priceGBP: number;
  label: string;
  description: string;
  isAgency?: boolean;
  popular?: boolean;
}

export interface TieredCost {
  low: number;
  medium: number;
  high: number;
}

export interface ActionCreditCosts {
  copilot_chat: TieredCost;
  meeting_summary: TieredCost;
  research_enrichment: TieredCost;
  content_generation: TieredCost;
  crm_update: TieredCost;
  task_execution: TieredCost;
}

export interface StorageCreditCosts {
  audio_per_hour_month: number;
  transcripts_per_100_month: number;
  docs_per_100_month: number;
  enrichment_per_500_month: number;
}

export interface IntegrationCreditCosts {
  apollo_search: number;
  email_send: number;
  ai_ark_company: number;
  ai_ark_people: number;
  exa_enrichment: number;
}

// ============================================================================
// Credit Pack Catalog
// ============================================================================

export const CREDIT_PACKS: Record<PackType, CreditPack> = {
  starter: {
    packType: 'starter',
    credits: 100,
    priceGBP: 49,
    label: 'Starter Pack',
    description: 'Perfect for small teams getting started',
  },
  growth: {
    packType: 'growth',
    credits: 250,
    priceGBP: 89,
    label: 'Growth Pack',
    description: 'Most popular for growing sales teams',
    popular: true,
  },
  scale: {
    packType: 'scale',
    credits: 500,
    priceGBP: 149,
    label: 'Scale Pack',
    description: 'Best value for high-volume AI usage',
  },
  agency_starter: {
    packType: 'agency_starter',
    credits: 500,
    priceGBP: 149,
    label: 'Agency Starter',
    description: 'Entry-level pack for agencies managing multiple clients',
    isAgency: true,
  },
  agency_growth: {
    packType: 'agency_growth',
    credits: 1250,
    priceGBP: 349,
    label: 'Agency Growth',
    description: 'Recommended for agencies with active client portfolios',
    isAgency: true,
    popular: true,
  },
  agency_scale: {
    packType: 'agency_scale',
    credits: 2500,
    priceGBP: 599,
    label: 'Agency Scale',
    description: 'High-volume pack for large agency operations',
    isAgency: true,
  },
  agency_enterprise: {
    packType: 'agency_enterprise',
    credits: 5000,
    priceGBP: 999,
    label: 'Agency Enterprise',
    description: 'Maximum capacity for enterprise-scale agencies',
    isAgency: true,
  },
  custom: {
    packType: 'custom',
    credits: 0,
    priceGBP: 0,
    label: 'Custom Pack',
    description: 'Custom credit allocation (admin/migration use)',
  },
};

// Ordered list for display (standard packs first, then agency)
export const STANDARD_PACKS: PackType[] = ['starter', 'growth', 'scale'];
export const AGENCY_PACKS: PackType[] = [
  'agency_starter',
  'agency_growth',
  'agency_scale',
  'agency_enterprise',
];

// ============================================================================
// Action Credit Costs (per feature, by intelligence tier)
// ============================================================================

export const ACTION_CREDIT_COSTS: ActionCreditCosts = {
  copilot_chat: { low: 0.3, medium: 0.8, high: 4.0 },
  meeting_summary: { low: 0.3, medium: 1.8, high: 8.5 },
  research_enrichment: { low: 0.3, medium: 0.6, high: 3.5 },
  content_generation: { low: 0.3, medium: 1.4, high: 5.0 },
  crm_update: { low: 0.2, medium: 0.5, high: 1.5 },
  task_execution: { low: 0.3, medium: 1.0, high: 4.0 },
};

// ============================================================================
// Storage Credit Costs (monthly, per unit)
// ============================================================================

export const STORAGE_CREDIT_COSTS: StorageCreditCosts = {
  audio_per_hour_month: 0.5,
  transcripts_per_100_month: 0.1,
  docs_per_100_month: 0.05,
  enrichment_per_500_month: 0.1,
};

// ============================================================================
// Integration Credit Costs (flat-rate per API call)
// ============================================================================

export const INTEGRATION_CREDIT_COSTS: IntegrationCreditCosts = {
  apollo_search: 0.3,
  email_send: 0.1,
  ai_ark_company: 0.25,
  ai_ark_people: 1.25,
  exa_enrichment: 0.2,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the cost for an action at a given intelligence tier.
 * Returns the medium tier cost as default if the feature isn't found.
 */
export function getActionCost(featureKey: string, tier: IntelligenceTier = 'medium'): number {
  const costs = ACTION_CREDIT_COSTS[featureKey as keyof ActionCreditCosts];
  if (!costs) return ACTION_CREDIT_COSTS.copilot_chat[tier];
  return costs[tier];
}

/**
 * Format a credit amount for display (e.g. 1.5 → "1.5 credits").
 */
export function formatCredits(amount: number): string {
  if (amount === 1) return '1 credit';
  return `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(1)} credits`;
}

/**
 * Get the cost per credit in GBP for a given pack.
 */
export function getCostPerCredit(packType: PackType): number {
  const pack = CREDIT_PACKS[packType];
  if (!pack || pack.credits === 0) return 0;
  return pack.priceGBP / pack.credits;
}
