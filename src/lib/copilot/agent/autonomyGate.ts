/**
 * Autonomy Gate — AE2-003
 *
 * Frontend counterpart to the edge-function autonomyResolver.
 * Resolves the effective autonomy policy for a (org, user, skill) triple
 * before the autonomous executor fires each tool call.
 *
 * Resolution chain (mirrors supabase/functions/_shared/orchestrator/autonomyResolver.ts):
 * 1. User-level override in autonomy_policies
 * 2. Org-level policy in autonomy_policies
 * 3. Preset default from agent_config_org_overrides / agent_config_defaults
 * 4. System default → 'approve'
 *
 * Skills without an action_type mapping (read-only, generate, summarise, etc.)
 * default to 'auto' so they are never gated unnecessarily.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export type AutonomyTier = 'auto' | 'approve' | 'suggest' | 'disabled';

export interface AutonomyDecision {
  /** The resolved policy tier */
  policy: AutonomyTier;
  /** Where the policy came from */
  source: 'user' | 'org' | 'preset' | 'default' | 'no_mapping';
  /** The preset name if source === 'preset' */
  preset?: string;
  /** The action_type that was looked up (null when skill has no mapping) */
  actionType: string | null;
}

export interface AutononyGateResult {
  /** Whether the tool call may proceed immediately */
  allowed: boolean;
  /** The resolved tier */
  tier: AutonomyTier;
  /** Full decision record */
  decision: AutonomyDecision;
  /** Human-readable explanation for non-auto tiers */
  explanation: string;
}

// =============================================================================
// Skill → action_type mapping (kept in sync with edge-function counterpart)
// =============================================================================

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

/**
 * Returns the action_type for a skill_key, or null if the skill has no
 * real-world side-effects that need gating.
 */
export function getActionTypeForSkill(skillName: string): string | null {
  return SKILL_ACTION_MAP[skillName] ?? null;
}

// =============================================================================
// Preset policy tables (kept in sync with edge-function autonomyResolver.ts)
// =============================================================================

const PRESET_POLICIES: Record<string, Record<string, AutonomyTier>> = {
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

/** System fallback when no policy is resolved at any level */
const SYSTEM_DEFAULT: AutonomyTier = 'approve';

// =============================================================================
// In-memory cache (5-minute TTL, matches edge-function cache window)
// =============================================================================

interface CacheEntry {
  decision: AutonomyDecision;
  expires: number;
}

const policyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// =============================================================================
// Core resolution
// =============================================================================

/**
 * Resolves the effective policy for a (org, user, actionType) triple.
 * Reads directly from the Supabase client (RLS-protected reads).
 */
async function resolvePolicy(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  actionType: string,
): Promise<AutonomyDecision> {
  const cacheKey = `${orgId}:${userId}:${actionType}`;
  const now = Date.now();

  const cached = policyCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.decision;
  }

  try {
    // Step 1 — user-level override
    const { data: userPolicy } = await supabase
      .from('autonomy_policies')
      .select('policy')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle();

    if (userPolicy?.policy) {
      const decision: AutonomyDecision = {
        policy: userPolicy.policy as AutonomyTier,
        source: 'user',
        actionType,
      };
      policyCache.set(cacheKey, { decision, expires: now + CACHE_TTL_MS });
      return decision;
    }

    // Step 2 — org-level policy
    const { data: orgPolicy } = await supabase
      .from('autonomy_policies')
      .select('policy, preset_name')
      .eq('org_id', orgId)
      .eq('action_type', actionType)
      .is('user_id', null)
      .maybeSingle();

    if (orgPolicy?.policy) {
      const decision: AutonomyDecision = {
        policy: orgPolicy.policy as AutonomyTier,
        source: 'org',
        preset: orgPolicy.preset_name ?? undefined,
        actionType,
      };
      policyCache.set(cacheKey, { decision, expires: now + CACHE_TTL_MS });
      return decision;
    }

    // Step 3 — org preset override
    const { data: presetConfig } = await supabase
      .from('agent_config_org_overrides')
      .select('config_value')
      .eq('org_id', orgId)
      .eq('agent_type', 'global')
      .eq('config_key', 'autonomy.preset')
      .maybeSingle();

    let presetName = presetConfig?.config_value as string | undefined;

    if (!presetName) {
      // Step 3b — system-wide preset default
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
      const decision: AutonomyDecision = {
        policy: presetPolicies[actionType],
        source: 'preset',
        preset: presetName,
        actionType,
      };
      policyCache.set(cacheKey, { decision, expires: now + CACHE_TTL_MS });
      return decision;
    }

    // Step 4 — system default
    const decision: AutonomyDecision = {
      policy: SYSTEM_DEFAULT,
      source: 'default',
      actionType,
    };
    policyCache.set(cacheKey, { decision, expires: now + CACHE_TTL_MS });
    return decision;
  } catch (err) {
    console.warn('[autonomyGate] Policy resolution error, falling back to default:', err);
    return { policy: SYSTEM_DEFAULT, source: 'default', actionType };
  }
}

// =============================================================================
// Explanation builders
// =============================================================================

const ACTION_LABELS: Record<string, string> = {
  crm_stage_change: 'CRM stage change',
  crm_field_update: 'CRM field update',
  crm_contact_create: 'contact creation',
  send_email: 'sending an email',
  send_slack: 'sending a Slack message',
  create_task: 'task creation',
  enrich_contact: 'contact enrichment',
  draft_proposal: 'proposal drafting',
};

function buildExplanation(
  tier: AutonomyTier,
  skillName: string,
  decision: AutonomyDecision,
): string {
  const label = decision.actionType
    ? ACTION_LABELS[decision.actionType] ?? decision.actionType
    : skillName;

  switch (tier) {
    case 'auto':
      return `Executing "${skillName}" automatically.`;

    case 'approve':
      return (
        `The skill "${skillName}" would perform ${label}, ` +
        `which requires your approval (policy: ${decision.source}). ` +
        `Review the proposed action below and confirm to proceed.`
      );

    case 'suggest':
      return (
        `The skill "${skillName}" suggests ${label}. ` +
        `This is a recommendation only — no action has been taken.`
      );

    case 'disabled':
      return (
        `The skill "${skillName}" is disabled for ${label} ` +
        `by your organisation's autonomy policy (${decision.source}). ` +
        `Contact your admin to change this setting.`
      );

    default:
      return `Skill "${skillName}" gated by autonomy policy.`;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Check whether a skill tool call is allowed to execute immediately,
 * needs approval, should surface as a suggestion, or is disabled.
 *
 * Skills without an action_type mapping (read-only, summarise, generate, etc.)
 * are unconditionally allowed — they have no real-world side-effects.
 *
 * @param supabase     - Authenticated Supabase client (user-scoped, respects RLS)
 * @param orgId        - Active organisation UUID
 * @param userId       - Authenticated user UUID
 * @param skillName    - The skill_key / tool name being invoked
 * @param actionPayload - The input payload Claude passed to the tool (for context in responses)
 */
export async function checkAutonomyGate(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  skillName: string,
  actionPayload: Record<string, unknown>,
): Promise<AutononyGateResult> {
  const actionType = getActionTypeForSkill(skillName);

  // Skills with no action mapping are read-only / generation-only — always auto.
  if (!actionType) {
    const decision: AutonomyDecision = {
      policy: 'auto',
      source: 'no_mapping',
      actionType: null,
    };
    return {
      allowed: true,
      tier: 'auto',
      decision,
      explanation: `Executing "${skillName}" automatically.`,
    };
  }

  const decision = await resolvePolicy(supabase, orgId, userId, actionType);
  const tier = decision.policy;
  const explanation = buildExplanation(tier, skillName, decision);

  return {
    allowed: tier === 'auto',
    tier,
    decision,
    explanation,
  };
}

/**
 * Invalidate the in-memory policy cache.
 * Call after the user changes their autonomy settings so the next
 * tool call picks up the new policy without waiting for TTL expiry.
 */
export function invalidateAutonomyGateCache(): void {
  policyCache.clear();
}
