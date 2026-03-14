/**
 * Cron Preference Gate (TRINITY-007)
 *
 * Shared utility for cron-triggered edge functions to check whether an org/user
 * has the relevant proactive ability enabled BEFORE doing any work.
 *
 * The orchestrator runner (runner.ts step 6) already gates event-triggered
 * sequences, but cron-triggered functions bypass the runner and call edge
 * functions directly — so they need their own gate.
 *
 * Checks:
 *   1. proactive_agent_config.is_enabled (org master toggle)
 *   2. proactive_agent_config.enabled_sequences[sequenceType].enabled (ability toggle)
 *   3. user_sequence_preferences.is_enabled (user opt-out, optional)
 *
 * Uses an in-memory cache keyed by org_id so that batch functions processing
 * multiple users in the same org only query once.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgAbilityConfig {
  is_enabled: boolean;            // master toggle
  enabled_sequences: Record<string, { enabled: boolean; delivery_channel?: string }>;
}

interface GateResult {
  allowed: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// In-memory org config cache (lives for the duration of a single invocation)
// ---------------------------------------------------------------------------

const orgConfigCache = new Map<string, OrgAbilityConfig | null>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a cron-triggered ability is allowed to run for an org.
 *
 * @param supabase     - Service-role Supabase client
 * @param orgId        - Organization ID
 * @param sequenceType - One of the 9 sequence types from proactive_agent_config
 *                       (e.g. 'pre_meeting_90min', 'deal_risk_scan', 'stale_deal_revival')
 * @returns            - { allowed: true } or { allowed: false, reason: string }
 */
export async function isAbilityEnabledForOrg(
  supabase: SupabaseClient,
  orgId: string,
  sequenceType: string,
): Promise<GateResult> {
  const config = await getOrgConfig(supabase, orgId);

  // No config row and RPC returns default (is_enabled: true after migration 20260223500001)
  // but if config is null due to a query error, fail open to avoid breaking existing behaviour
  if (!config) {
    return { allowed: true };
  }

  // 1. Master toggle
  if (!config.is_enabled) {
    return { allowed: false, reason: `Proactive agent disabled for org ${orgId}` };
  }

  // 2. Specific ability toggle
  const seqConfig = config.enabled_sequences?.[sequenceType];
  if (seqConfig && seqConfig.enabled === false) {
    return {
      allowed: false,
      reason: `Sequence '${sequenceType}' disabled for org ${orgId}`,
    };
  }

  return { allowed: true };
}

/**
 * Check whether a specific user has opted out of a sequence.
 * Call this AFTER isAbilityEnabledForOrg passes.
 *
 * @param supabase     - Service-role Supabase client
 * @param userId       - User UUID
 * @param orgId        - Organization ID
 * @param sequenceType - Sequence type
 * @returns            - { allowed: true } or { allowed: false, reason: string }
 */
export async function isAbilityEnabledForUser(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  sequenceType: string,
): Promise<GateResult> {
  const { data: userPref, error } = await supabase
    .from('user_sequence_preferences')
    .select('is_enabled')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('sequence_type', sequenceType)
    .maybeSingle();

  if (error) {
    console.error(`[cronPreferenceGate] Error fetching user pref for ${userId}:`, error.message);
    // Fail open — don't block if we can't read preferences
    return { allowed: true };
  }

  // If no row exists, user inherits org default (allowed)
  if (!userPref) {
    return { allowed: true };
  }

  if (userPref.is_enabled === false) {
    return {
      allowed: false,
      reason: `User ${userId} opted out of '${sequenceType}'`,
    };
  }

  return { allowed: true };
}

/**
 * Combined check: org + user. Convenience wrapper for per-user processing.
 */
export async function isAbilityEnabledForOrgAndUser(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  sequenceType: string,
): Promise<GateResult> {
  const orgGate = await isAbilityEnabledForOrg(supabase, orgId, sequenceType);
  if (!orgGate.allowed) return orgGate;

  return isAbilityEnabledForUser(supabase, userId, orgId, sequenceType);
}

/**
 * Clear the in-memory cache. Useful for testing.
 */
export function clearOrgConfigCache(): void {
  orgConfigCache.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getOrgConfig(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgAbilityConfig | null> {
  // Check cache first
  if (orgConfigCache.has(orgId)) {
    return orgConfigCache.get(orgId) ?? null;
  }

  // Query proactive_agent_config directly (service role bypasses RLS)
  const { data, error } = await supabase
    .from('proactive_agent_config')
    .select('is_enabled, enabled_sequences')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error(`[cronPreferenceGate] Error fetching org config for ${orgId}:`, error.message);
    // Cache null to avoid repeated queries on error
    orgConfigCache.set(orgId, null);
    return null;
  }

  if (!data) {
    // No config row — org hasn't been configured. Default: is_enabled=true
    // (matches migration 20260223500001_enable_proactive_by_default.sql)
    const defaultConfig: OrgAbilityConfig = {
      is_enabled: true,
      enabled_sequences: {},
    };
    orgConfigCache.set(orgId, defaultConfig);
    return defaultConfig;
  }

  const config: OrgAbilityConfig = {
    is_enabled: data.is_enabled,
    enabled_sequences: data.enabled_sequences || {},
  };

  orgConfigCache.set(orgId, config);
  return config;
}
