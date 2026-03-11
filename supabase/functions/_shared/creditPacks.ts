// ============================================================================
// Credit Pack Definitions and Cost Constants (Deno/Edge Function compatible)
// ============================================================================
// Mirrors src/lib/config/creditPacks.ts — keep in sync.
// 1 credit ≈ $0.10 USD

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
  video_per_gb_month: number;
}

export interface IntegrationCreditCosts {
  apollo_search: number;
  email_send: number;
  ai_ark_company: number;
  ai_ark_people: number;
  exa_enrichment: number;
  heygen_photo_generate: number;
  heygen_avatar_train: number;
  heygen_look_generate: number;
  heygen_add_motion: number;
  heygen_video_per_second: number;
  elevenlabs_voice_clone: number;
  elevenlabs_tts_per_1k_chars: number;
  // fal.ai Video Generation — per-second costs by model (~50% margin over fal.ai)
  fal_video_kling_v3_pro: number;     // Kling 3.0 Pro (T2V + I2V)
  fal_video_kling_v2_master: number;  // Kling 2.5 Master
  fal_video_veo3: number;             // Google Veo 3
  fal_video_wan_2_5: number;          // Wan 2.5
  // fal.ai storage — monthly retention cost
  fal_video_storage_per_gb_month: number;
  // Nano Banana 2 Image Generation — per-image costs (~50% margin)
  nano_banana_2_05k: number;
  nano_banana_2_1k: number;
  nano_banana_2_2k: number;
  nano_banana_2_4k: number;
  // Gemini 3.1 Pro SVG Animation — per-generation estimate
  gemini_svg_simple: number;
  gemini_svg_medium: number;
  gemini_svg_complex: number;
}

// ============================================================================
// Credit Pack Catalog
// ============================================================================

export const CREDIT_PACKS: Record<PackType, CreditPack> = {
  starter: {
    packType: 'starter',
    credits: 100,
    priceGBP: 15,
    label: 'Signal',
    description: 'Perfect for small teams getting started',
  },
  growth: {
    packType: 'growth',
    credits: 250,
    priceGBP: 30,
    label: 'Insight',
    description: 'Best value for growing sales teams',
    popular: true,
  },
  scale: {
    packType: 'scale',
    credits: 500,
    priceGBP: 50,
    label: 'Intelligence',
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
  video_per_gb_month: 0.5,  // ~$0.05/GB/month for video retention
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
  // HeyGen Video Avatar — ~50% margin over HeyGen pay-as-you-go costs
  // HeyGen: $1/call → 15 credits ($1.50)
  heygen_photo_generate: 15,
  // HeyGen: $4/call → 60 credits ($6.00)
  heygen_avatar_train: 60,
  // HeyGen: $1/call → 15 credits ($1.50)
  heygen_look_generate: 15,
  // HeyGen: $1/call → 15 credits ($1.50)
  heygen_add_motion: 15,
  // HeyGen: $0.0167/sec → 0.25 credits/sec ($0.025/sec, ~50% margin)
  heygen_video_per_second: 0.25,
  // ElevenLabs Voice Clone — platform key usage
  elevenlabs_voice_clone: 20,
  elevenlabs_tts_per_1k_chars: 1,
  // fal.ai Video — per-second credit costs (~50% margin over provider)
  // 1 credit ≈ $0.10 USD
  fal_video_kling_v3_pro: 2.5,      // fal.ai: $0.168/s → we charge $0.25/s = 2.5 credits/s
  fal_video_kling_v2_master: 1.0,   // fal.ai: $0.07/s → we charge $0.10/s = 1.0 credits/s
  fal_video_veo3: 6.0,              // fal.ai: $0.40/s → we charge $0.60/s = 6.0 credits/s
  fal_video_wan_2_5: 0.75,          // fal.ai: $0.05/s → we charge $0.075/s = 0.75 credits/s
  // fal.ai video storage — charged monthly for retained videos
  fal_video_storage_per_gb_month: 0.5, // ~$0.05/GB/month
  // Nano Banana 2 Image Generation (~50% margin over fal.ai)
  nano_banana_2_05k: 0.9,
  nano_banana_2_1k: 1.2,
  nano_banana_2_2k: 1.8,
  nano_banana_2_4k: 2.4,
  // Gemini 3.1 Pro SVG Animation — per-generation credit costs
  gemini_svg_simple: 0.5,
  gemini_svg_medium: 1.5,
  gemini_svg_complex: 3.0,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the cost for an action at a given intelligence tier.
 */
export function getActionCost(featureKey: string, tier: IntelligenceTier = 'medium'): number {
  const costs = ACTION_CREDIT_COSTS[featureKey as keyof ActionCreditCosts];
  if (!costs) return ACTION_CREDIT_COSTS.copilot_chat[tier];
  return costs[tier];
}

// ============================================================================
// Credit Deduction (Ordered/Subscription-aware)
// ============================================================================

// Minimal SupabaseClient interface for edge function compatibility
interface SupabaseClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Deduct credits using the ordered deduction RPC (subscription-first, then onboarding, then packs).
 * Returns the new balance after deduction, or -1 on failure.
 */
export async function deductCreditsOrdered(
  supabase: SupabaseClient,
  orgId: string,
  amount: number,
  actionId?: string,
  tier?: string,
  refs?: Record<string, unknown>
): Promise<{ success: boolean; newBalance: number }> {
  const { data, error } = await supabase.rpc('deduct_credits_ordered', {
    p_org_id: orgId,
    p_amount: amount,
    p_action_id: actionId ?? null,
    p_tier: tier ?? 'medium',
    p_refs: refs ?? {},
  });

  if (error) {
    console.error('deduct_credits_ordered failed:', error);
    return { success: false, newBalance: -1 };
  }

  const newBalance = typeof data === 'number' ? data : -1;
  return { success: newBalance >= 0, newBalance };
}
