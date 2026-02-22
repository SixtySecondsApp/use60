/**
 * Command Centre Enrichment Router
 *
 * Determines which context loaders to call for each item_type,
 * gated by the org's credit tier.
 *
 * Story: CC10-001
 */

// Re-export tier types from the canonical source for consistency
export type { CreditTier, TierConfig } from './tierConfig.ts';
import type { CreditTier } from './tierConfig.ts';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type LoaderName =
  | 'crm'
  | 'transcript'
  | 'email'
  | 'calendar'
  | 'pipeline'
  | 'history'
  | 'apollo';

export interface EnrichmentPlan {
  loaders: LoaderName[];
  requires_ai_synthesis: boolean;
}

// ---------------------------------------------------------------------------
// Item type → base loader mapping (before tier gating)
// ---------------------------------------------------------------------------

const BASE_LOADERS: Record<string, LoaderName[]> = {
  // Deal-related items
  deal_action: ['crm', 'pipeline', 'history'],
  deal_risk: ['crm', 'pipeline', 'history'],
  stale_deal: ['crm', 'pipeline', 'history'],

  // Follow-up — needs full context from multiple sources
  follow_up: ['crm', 'email', 'transcript', 'calendar'],

  // Outreach — CRM + email history; apollo added for intelligence tier
  outreach: ['crm', 'email', 'history'],

  // CRM update suggestions — minimal context needed
  crm_update: ['crm', 'history'],

  // Review items — CRM + transcript
  review: ['crm', 'transcript'],

  // Meeting actions — need calendar + transcript context
  meeting_action: ['crm', 'calendar', 'transcript'],

  // Fallbacks for types defined in ItemType but not explicitly mapped above
  coaching: ['crm', 'transcript'],
  alert: ['crm', 'history'],
  meeting_prep: ['crm', 'calendar', 'transcript'],
  insight: ['crm', 'pipeline', 'history'],
};

// ---------------------------------------------------------------------------
// Tier-allowed loaders
// ---------------------------------------------------------------------------

const TIER_ALLOWED: Record<CreditTier, Set<LoaderName>> = {
  // signal: cheapest — CRM + history only, no AI synthesis
  signal: new Set(['crm', 'history']),
  // insight: standard — adds email, calendar, transcript
  insight: new Set(['crm', 'history', 'email', 'calendar', 'transcript']),
  // intelligence: full — adds pipeline + apollo
  intelligence: new Set(['crm', 'history', 'email', 'calendar', 'transcript', 'pipeline', 'apollo']),
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Returns the enrichment plan for a given item_type and credit tier.
 *
 * The plan is the intersection of the item's base loaders and the loaders
 * permitted by the org's credit tier. Apollo is added for `outreach` items
 * when the tier is `intelligence`.
 */
export function getEnrichmentPlan(itemType: string, creditTier: CreditTier): EnrichmentPlan {
  const baseLoaders: LoaderName[] = BASE_LOADERS[itemType] ?? ['crm', 'history'];
  const allowed = TIER_ALLOWED[creditTier];

  let loaders = baseLoaders.filter((l) => allowed.has(l));

  // Intelligence tier: add apollo for outreach items (not in base to keep mapping clean)
  if (creditTier === 'intelligence' && itemType === 'outreach') {
    if (!loaders.includes('apollo')) {
      loaders = [...loaders, 'apollo'];
    }
  }

  const requires_ai_synthesis = creditTier !== 'signal';

  return { loaders, requires_ai_synthesis };
}
