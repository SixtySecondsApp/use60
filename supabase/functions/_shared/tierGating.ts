// supabase/functions/_shared/tierGating.ts
// WS-006: Subscription Tier Gating for workspace background jobs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export type UserTier = 'trial' | 'basic' | 'pro';

/** Features that can be gated by tier */
export type GatedFeature =
  | 'email_sync'
  | 'email_classification'
  | 'reply_gap'
  | 'meeting_prep'
  | 'attendee_enrich'
  | 'ratio_tracking'
  | 'doc_linking'
  | 'proposal_drive'
  | 'dual_provider'
  | 'token_refresh'
  | 'calendar_watch';

/** Feature matrix: which tier gets access */
const FEATURE_MATRIX: Record<GatedFeature, UserTier[]> = {
  email_sync:            ['trial', 'basic', 'pro'],
  email_classification:  ['trial', 'pro'],
  reply_gap:             ['trial', 'basic', 'pro'],
  meeting_prep:          ['trial', 'pro'],
  attendee_enrich:       ['trial', 'pro'],
  ratio_tracking:        ['trial', 'pro'],
  doc_linking:           ['trial', 'pro'],
  proposal_drive:        ['trial', 'basic', 'pro'],
  dual_provider:         ['trial', 'pro'],
  token_refresh:         ['trial', 'basic', 'pro'],
  calendar_watch:        ['trial', 'basic', 'pro'],
};

/** Sync frequency by tier (in minutes) */
export const SYNC_FREQUENCY: Record<UserTier, { emailSyncMinutes: number; replyGapMinutes: number }> = {
  trial: { emailSyncMinutes: 30, replyGapMinutes: 240 },
  basic: { emailSyncMinutes: 240, replyGapMinutes: 720 },
  pro:   { emailSyncMinutes: 30, replyGapMinutes: 240 },
};

/** History depth by tier (in days, 0 = unlimited) */
export const HISTORY_DEPTH: Record<UserTier, number> = {
  trial: 0,
  basic: 90,
  pro: 0,
};

/**
 * Resolve a user's subscription tier.
 * Checks subscriptions table, falls back to 'basic'.
 */
export async function getUserTier(
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<UserTier> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_id, status, trial_ends_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data) return 'basic';

  // Check if still in trial
  if (data.trial_ends_at) {
    const trialEnd = new Date(data.trial_ends_at);
    if (trialEnd > new Date()) return 'trial';
  }

  // Resolve plan tier from plan_id
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('slug')
    .eq('id', data.plan_id)
    .maybeSingle();

  if (plan?.slug?.includes('pro')) return 'pro';
  return 'basic';
}

/**
 * Check if a user can access a gated feature.
 */
export async function canAccess(
  userId: string,
  feature: GatedFeature,
  supabase: ReturnType<typeof createClient>
): Promise<boolean> {
  const tier = await getUserTier(userId, supabase);
  return FEATURE_MATRIX[feature].includes(tier);
}

/**
 * Get sync configuration for a user's tier.
 */
export async function getSyncConfig(
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<{ tier: UserTier; emailSyncMinutes: number; replyGapMinutes: number; historyDays: number }> {
  const tier = await getUserTier(userId, supabase);
  return {
    tier,
    ...SYNC_FREQUENCY[tier],
    historyDays: HISTORY_DEPTH[tier],
  };
}
