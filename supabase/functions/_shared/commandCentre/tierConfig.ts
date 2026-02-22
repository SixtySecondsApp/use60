/**
 * Command Centre Credit Tier Configuration
 *
 * Defines the three enrichment tiers and provides org-level tier resolution.
 *
 * Story: CC10-006
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditTier = 'signal' | 'insight' | 'intelligence';

export interface TierConfig {
  name: string;
  description: string;
  loaders_allowed: string[];  // which loaders are permitted
  ai_synthesis: boolean;      // whether to run AI synthesis
  draft_quality: 'none' | 'basic' | 'full';  // drafted action depth
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

export const TIER_CONFIGS: Record<CreditTier, TierConfig> = {
  signal: {
    name: 'Signal',
    description: 'Lightweight enrichment — CRM and history only, no AI synthesis.',
    loaders_allowed: ['crm', 'history'],
    ai_synthesis: false,
    draft_quality: 'none',
  },
  insight: {
    name: 'Insight',
    description: 'Standard enrichment — adds email, calendar, and transcript context with AI synthesis.',
    loaders_allowed: ['crm', 'history', 'email', 'calendar', 'transcript'],
    ai_synthesis: true,
    draft_quality: 'basic',
  },
  intelligence: {
    name: 'Intelligence',
    description: 'Full enrichment — all loaders including pipeline and Apollo, with full AI synthesis.',
    loaders_allowed: ['crm', 'history', 'email', 'calendar', 'transcript', 'pipeline', 'apollo'],
    ai_synthesis: true,
    draft_quality: 'full',
  },
};

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the credit tier for an org.
 *
 * Resolution order:
 * 1. `org_settings.ai_credit_tier` (explicit override)
 * 2. `organizations.subscription_tier` or `organizations.plan` (billing plan)
 * 3. Default: 'insight'
 */
export async function resolveOrgCreditTier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
): Promise<CreditTier> {
  // 1. Check org_settings for explicit ai_credit_tier override
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('ai_credit_tier')
    .eq('org_id', orgId)
    .maybeSingle();

  if (orgSettings?.ai_credit_tier && isValidTier(orgSettings.ai_credit_tier)) {
    return orgSettings.ai_credit_tier as CreditTier;
  }

  // 2. Check organizations table for subscription_tier or plan
  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_tier, plan')
    .eq('id', orgId)
    .maybeSingle();

  const planValue = org?.subscription_tier ?? org?.plan;
  if (planValue && isValidTier(planValue)) {
    return planValue as CreditTier;
  }

  // 3. Default to insight (safe middle ground)
  return 'insight';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidTier(value: string): value is CreditTier {
  return value === 'signal' || value === 'insight' || value === 'intelligence';
}
