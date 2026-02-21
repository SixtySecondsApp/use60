/**
 * Fleet Router — DB-Driven Event Routing
 *
 * Replaces hardcoded eventSequences.ts with configurable DB lookups.
 * Falls back to hardcoded sequences if DB routes not found.
 *
 * Stories: FLT-005, FLT-006, FLT-011
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SequenceStep, EventType } from './types.ts';
import { getSequenceForEvent } from './eventSequences.ts';

// =============================================================================
// Cache (5-minute TTL, matches PRD-01 pattern)
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const routeCache = new Map<string, CacheEntry<RouteResult[]>>();
const definitionCache = new Map<string, CacheEntry<SequenceStep[] | null>>();

// =============================================================================
// Types
// =============================================================================

interface RouteResult {
  sequence_key: string;
  priority: number;
  conditions: Record<string, unknown> | null;
}

interface HandoffResult {
  id: string;
  target_event_type: string;
  context_mapping: Record<string, unknown> | null;
  conditions: Record<string, unknown> | null;
  delay_minutes: number;
}

// =============================================================================
// Skill-to-Agent-Type Mapping (for PRD-01 config engine integration)
// =============================================================================

const SKILL_AGENT_TYPE_MAP: Record<string, string> = {
  // CRM update skills
  'update-crm-from-meeting': 'crm_update',
  'create-tasks-from-actions': 'crm_update',
  // Deal risk skills
  'scan-active-deals': 'deal_risk',
  'score-deal-risks': 'deal_risk',
  'generate-risk-alerts': 'deal_risk',
  'deliver-risk-slack': 'deal_risk',
  // Re-engagement skills
  'research-trigger-events': 'reengagement',
  'analyse-stall-reason': 'reengagement',
  'draft-reengagement': 'reengagement',
  // Morning briefing skills
  'enrich-attendees': 'morning_briefing',
  'pull-crm-history': 'morning_briefing',
  'research-company-news': 'morning_briefing',
  'generate-briefing': 'morning_briefing',
  'deliver-slack-briefing': 'morning_briefing',
  // Email signal skills
  'classify-email-intent': 'email_signals',
  'match-to-crm-contact': 'email_signals',
  // Coaching skills
  'aggregate-weekly-metrics': 'coaching_digest',
  'correlate-win-loss': 'coaching_digest',
  'generate-coaching-digest': 'coaching_digest',
  'deliver-coaching-slack': 'coaching_digest',
  // Meeting processing skills (general)
  'classify-call-type': 'internal_meeting_prep',
  'extract-action-items': 'internal_meeting_prep',
  'detect-intents': 'internal_meeting_prep',
  'coaching-micro-feedback': 'coaching_digest',
  'suggest-next-actions': 'internal_meeting_prep',
  'draft-followup-email': 'crm_update',
  'notify-slack-summary': 'internal_meeting_prep',
  'signal-task-processor': 'internal_meeting_prep',
  // Campaign skills
  'pull-campaign-metrics': 'global',
  'classify-replies': 'global',
  'generate-campaign-report': 'global',
  'deliver-campaign-slack': 'global',
  // Proposal skills
  'select-proposal-template': 'global',
  'populate-proposal': 'global',
  'generate-custom-sections': 'global',
  'present-for-review': 'global',
};

/**
 * Get the agent type for a skill name (for PRD-01 config engine integration).
 */
export function getAgentTypeForSkill(skillName: string): string {
  return SKILL_AGENT_TYPE_MAP[skillName] || 'global';
}

// =============================================================================
// Route Resolution
// =============================================================================

/**
 * Resolve event routes from DB. Falls back to hardcoded sequences.
 */
export async function resolveRoute(
  supabase: SupabaseClient,
  orgId: string,
  eventType: string,
): Promise<{ sequenceKey: string; source: 'db' | 'hardcoded' }> {
  const cacheKey = `route:${orgId}:${eventType}`;
  const now = Date.now();

  // Check cache
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expires > now) {
    if (cached.data.length > 0) {
      return { sequenceKey: cached.data[0].sequence_key, source: 'db' };
    }
  }

  try {
    const { data, error } = await supabase.rpc('resolve_event_route', {
      p_org_id: orgId,
      p_event_type: eventType,
    });

    if (!error && data && data.length > 0) {
      routeCache.set(cacheKey, { data: data as RouteResult[], expires: now + CACHE_TTL_MS });
      return { sequenceKey: data[0].sequence_key, source: 'db' };
    }

    // Cache empty result too (avoid repeated failed lookups)
    routeCache.set(cacheKey, { data: [], expires: now + CACHE_TTL_MS });
  } catch (err) {
    console.warn('[fleetRouter] resolve_event_route RPC failed, falling back:', err);
  }

  // Fallback to hardcoded
  return { sequenceKey: eventType, source: 'hardcoded' };
}

// =============================================================================
// Sequence Definition Loading
// =============================================================================

/**
 * Load sequence steps from DB. Falls back to hardcoded eventSequences.ts.
 */
export async function getSequenceSteps(
  supabase: SupabaseClient,
  orgId: string,
  sequenceKey: string,
): Promise<{ steps: SequenceStep[]; source: 'db' | 'hardcoded' }> {
  const cacheKey = `def:${orgId}:${sequenceKey}`;
  const now = Date.now();

  // Check cache
  const cached = definitionCache.get(cacheKey);
  if (cached && cached.expires > now) {
    if (cached.data) {
      return { steps: cached.data, source: 'db' };
    }
    // Cached null = known to not exist in DB, fall through to hardcoded
  }

  try {
    const { data, error } = await supabase.rpc('get_sequence_definition', {
      p_org_id: orgId,
      p_sequence_key: sequenceKey,
    });

    if (!error && data && Array.isArray(data)) {
      const steps = data as SequenceStep[];
      definitionCache.set(cacheKey, { data: steps, expires: now + CACHE_TTL_MS });
      return { steps, source: 'db' };
    }

    definitionCache.set(cacheKey, { data: null, expires: now + CACHE_TTL_MS });
  } catch (err) {
    console.warn('[fleetRouter] get_sequence_definition RPC failed, falling back:', err);
  }

  // Fallback to hardcoded
  try {
    const steps = getSequenceForEvent(sequenceKey as EventType);
    return { steps, source: 'hardcoded' };
  } catch {
    return { steps: [], source: 'hardcoded' };
  }
}

// =============================================================================
// Handoff Route Lookup
// =============================================================================

/**
 * Look up active handoff routes for a completed step.
 */
export async function getHandoffRoutes(
  supabase: SupabaseClient,
  orgId: string,
  sourceSequenceKey: string,
  sourceStepSkill: string,
): Promise<HandoffResult[]> {
  try {
    const { data, error } = await supabase.rpc('get_handoff_routes', {
      p_org_id: orgId,
      p_source_sequence_key: sourceSequenceKey,
      p_source_step_skill: sourceStepSkill,
    });

    if (!error && data) {
      return data as HandoffResult[];
    }

    return [];
  } catch (err) {
    console.warn('[fleetRouter] get_handoff_routes RPC failed:', err);
    return [];
  }
}

/**
 * Evaluate handoff conditions against step output.
 * Returns true if conditions match or if no conditions specified.
 */
export function evaluateHandoffConditions(
  conditions: Record<string, unknown> | null,
  stepOutput: unknown,
): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  if (!stepOutput || typeof stepOutput !== 'object') return false;

  const output = stepOutput as Record<string, unknown>;

  for (const [key, expected] of Object.entries(conditions)) {
    if (key === 'min_confidence') {
      const confidence = output.confidence as number | undefined;
      if (confidence === undefined || confidence < (expected as number)) return false;
      continue;
    }

    if (key === 'risk_score_above') {
      const score = output.risk_score as number | undefined;
      if (score === undefined || score <= (expected as number)) return false;
      continue;
    }

    // Check for intent matching (in array of detected intents)
    if (key === 'intent') {
      const intents = output.intents as Array<{ intent: string }> | undefined;
      if (!intents || !intents.some(i => i.intent === expected)) return false;
      continue;
    }

    // Check for boolean flags
    if (key === 'has_scheduling_intent') {
      if (output[key] !== expected) return false;
      continue;
    }

    // Check for classification match
    if (key === 'classification') {
      if (output[key] !== expected && output.classification !== expected) return false;
      continue;
    }

    // Generic equality check
    if (output[key] !== expected) return false;
  }

  return true;
}

/**
 * Apply context mapping to transform source step output into target event payload.
 */
export function applyContextMapping(
  contextMapping: Record<string, unknown> | null,
  stepOutput: unknown,
): Record<string, unknown> {
  if (!contextMapping) return {};

  // The context mapping itself becomes part of the payload,
  // enriched with values from step output where available
  const payload: Record<string, unknown> = { ...contextMapping };
  if (stepOutput && typeof stepOutput === 'object') {
    payload._source_output = stepOutput;
  }
  return payload;
}

// =============================================================================
// Cache Management
// =============================================================================

export function invalidateRouteCache(): void {
  routeCache.clear();
  definitionCache.clear();
}
