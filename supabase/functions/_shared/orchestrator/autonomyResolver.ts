/**
 * Autonomy Resolver — AUT-007
 *
 * Resolves the effective autonomy policy for a given (org, user, action_type) triple.
 * Resolution order: user-level -> org-level -> preset default -> system default
 *
 * Used by the fleet router before executing each step to determine:
 * - 'auto'     → execute immediately
 * - 'approve'  → create HITL approval request
 * - 'suggest'  → create suggestion only (no execution)
 * - 'disabled' → skip this step entirely
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// =============================================================================
// Types
// =============================================================================

export type AutonomyPolicy = 'auto' | 'approve' | 'suggest' | 'disabled';

export interface PolicyResolution {
  policy: AutonomyPolicy;
  source: 'user' | 'org' | 'preset' | 'default';
  preset?: string;
}

// =============================================================================
// Default policies by preset
// =============================================================================

const PRESET_POLICIES: Record<string, Record<string, AutonomyPolicy>> = {
  conservative: {
    crm_stage_change: 'approve',
    crm_field_update: 'approve',
    crm_contact_create: 'approve',
    send_email: 'approve',
    send_slack: 'approve',
    create_task: 'approve',
    enrich_contact: 'suggest',
    draft_proposal: 'suggest',
  },
  balanced: {
    crm_stage_change: 'approve',
    crm_field_update: 'suggest',
    crm_contact_create: 'suggest',
    send_email: 'approve',
    send_slack: 'auto',
    create_task: 'auto',
    enrich_contact: 'auto',
    draft_proposal: 'suggest',
  },
  autonomous: {
    crm_stage_change: 'auto',
    crm_field_update: 'auto',
    crm_contact_create: 'auto',
    send_email: 'approve',
    send_slack: 'auto',
    create_task: 'auto',
    enrich_contact: 'auto',
    draft_proposal: 'approve',
  },
};

/** Fallback when no policy is found at any level */
const SYSTEM_DEFAULT: AutonomyPolicy = 'approve';

// =============================================================================
// Cache (5-minute TTL)
// =============================================================================

interface CacheEntry {
  policy: AutonomyPolicy;
  source: PolicyResolution['source'];
  preset?: string;
  expires: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const policyCache = new Map<string, CacheEntry>();

export function invalidatePolicyCache(): void {
  policyCache.clear();
}

// =============================================================================
// Resolution
// =============================================================================

/**
 * Resolves the effective autonomy policy for a given action.
 *
 * Resolution chain:
 * 1. User-level override in autonomy_policies (user_id = userId)
 * 2. Org-level policy in autonomy_policies (user_id IS NULL)
 * 3. Preset default from org's autonomy.preset config
 * 4. System default (approve)
 */
export async function resolveAutonomyPolicy(
  supabase: SupabaseClient,
  orgId: string,
  userId: string | null,
  actionType: string,
): Promise<PolicyResolution> {
  const cacheKey = `${orgId}:${userId ?? 'null'}:${actionType}`;
  const now = Date.now();

  const cached = policyCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return { policy: cached.policy, source: cached.source, preset: cached.preset };
  }

  try {
    // Step 1: Check user-level override
    if (userId) {
      const { data: userPolicy } = await supabase
        .from('autonomy_policies')
        .select('policy')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .eq('action_type', actionType)
        .maybeSingle();

      if (userPolicy?.policy) {
        const result: PolicyResolution = {
          policy: userPolicy.policy as AutonomyPolicy,
          source: 'user',
        };
        policyCache.set(cacheKey, { ...result, expires: now + CACHE_TTL_MS });
        return result;
      }
    }

    // Step 2: Check org-level policy
    const { data: orgPolicy } = await supabase
      .from('autonomy_policies')
      .select('policy, preset_name')
      .eq('org_id', orgId)
      .eq('action_type', actionType)
      .is('user_id', null)
      .maybeSingle();

    if (orgPolicy?.policy) {
      const result: PolicyResolution = {
        policy: orgPolicy.policy as AutonomyPolicy,
        source: 'org',
        preset: orgPolicy.preset_name ?? undefined,
      };
      policyCache.set(cacheKey, { ...result, expires: now + CACHE_TTL_MS });
      return result;
    }

    // Step 3: Resolve from org preset
    const { data: presetConfig } = await supabase
      .from('agent_config_org_overrides')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('agent_type', 'global')
      .eq('config_key', 'autonomy.preset')
      .maybeSingle();

    // Fall back to default preset in agent_config_defaults
    let presetName = (presetConfig?.config_value as string | undefined);
    if (!presetName) {
      const { data: defaultPreset } = await supabase
        .from('agent_config_defaults')
        .select('config_value')
        .eq('agent_type', 'global')
        .eq('config_key', 'autonomy.preset')
        .maybeSingle();
      presetName = (defaultPreset?.config_value as string | undefined) ?? 'balanced';
    }

    const presetPolicies = PRESET_POLICIES[presetName];
    if (presetPolicies && presetPolicies[actionType]) {
      const result: PolicyResolution = {
        policy: presetPolicies[actionType],
        source: 'preset',
        preset: presetName,
      };
      policyCache.set(cacheKey, { ...result, expires: now + CACHE_TTL_MS });
      return result;
    }

    // Step 4: System default
    const result: PolicyResolution = {
      policy: SYSTEM_DEFAULT,
      source: 'default',
    };
    policyCache.set(cacheKey, { ...result, expires: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn('[autonomyResolver] Policy resolution error, falling back to default:', err);
    return { policy: SYSTEM_DEFAULT, source: 'default' };
  }
}

/**
 * Maps a skill name to its action_type for policy resolution.
 * Skills that execute real-world actions have a corresponding action_type.
 */
export function getActionTypeForSkill(skillName: string): string | null {
  const SKILL_ACTION_MAP: Record<string, string> = {
    // CRM mutations
    'update-crm-from-meeting': 'crm_field_update',
    'create-tasks-from-actions': 'create_task',
    'rescore-deal': 'crm_stage_change',
    // Email
    'draft-followup-email': 'send_email',
    // Slack
    'deliver-slack-briefing': 'send_slack',
    'notify-slack-summary': 'send_slack',
    'deliver-risk-slack': 'send_slack',
    'deliver-coaching-slack': 'send_slack',
    'deliver-campaign-slack': 'send_slack',
    // Enrichment
    'enrich-attendees': 'enrich_contact',
    // Proposals
    'populate-proposal': 'draft_proposal',
    'generate-custom-sections': 'draft_proposal',
  };

  return SKILL_ACTION_MAP[skillName] ?? null;
}
