/**
 * Copilot Routing Service
 *
 * Handles skill selection for the copilot with sequence-first routing:
 * 1. Check sequences first (pre-built, tested orchestrations)
 * 2. If sequence matches intent with confidence > 0.7, use it
 * 3. Fall back to individual skills (confidence > 0.5)
 * 2b. Standard table query fallback (only if no skill/sequence matched)
 * 4. Embedding-based semantic fallback (similarity > 0.6)
 *
 * Note: Standard table queries (detectStandardTableIntent) run AFTER
 * sequences and skills to avoid stealing routes from richer sequences
 * like seq-pipeline-focus-tasks.
 *
 * Sequences are skills with category: 'agent-sequence' that can orchestrate
 * multiple other skills via skill links.
 */

import { supabase } from '../supabase/clientV2';
import type { SkillFrontmatterV2, SkillTrigger } from '../types/skills';
import { findSemanticMatches } from './embeddingService';

// =============================================================================
// Types
// =============================================================================

export interface SkillMatch {
  skillId: string;
  skillKey: string;
  name: string;
  category: string;
  confidence: number;
  matchedTrigger?: string;
  isSequence: boolean;
  linkedSkillCount?: number;
}

export interface RoutingDecision {
  selectedSkill: SkillMatch | null;
  candidates: SkillMatch[];
  isSequenceMatch: boolean;
  reason: string;
}

interface SkillRow {
  skill_key: string;
  category: string;
  frontmatter: SkillFrontmatterV2;
  is_enabled: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const SEQUENCE_CONFIDENCE_THRESHOLD = 0.7;
const INDIVIDUAL_CONFIDENCE_THRESHOLD = 0.5;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.6;
const MAX_CANDIDATES = 5;

// Data provider preference for hybrid Apollo + AI Ark routing
export type DataProviderPreference = 'always_apollo' | 'always_ai_ark' | 'hybrid' | 'auto';

// Skill keys that have provider-specific variants
const PROVIDER_SKILL_PAIRS: Record<string, { apollo: string; ai_ark: string }> = {
  company_search: { apollo: 'apollo-company-search', ai_ark: 'ai-ark-company-search' },
  people_search: { apollo: 'apollo-people-search', ai_ark: 'ai-ark-people-search' },
  enrichment: { apollo: 'apollo-enrichment', ai_ark: 'ai-ark-enrichment' },
};

/**
 * Apply data provider preference to resolve conflicts when both Apollo and AI Ark
 * skills match with similar confidence. Only applies when both providers are configured.
 */
function applyProviderPreference(
  candidates: SkillMatch[],
  preference: DataProviderPreference
): SkillMatch[] {
  if (preference === 'auto' || candidates.length < 2) return candidates;

  // Find pairs of Apollo/AI Ark skills in candidates
  const apolloSkills = candidates.filter((c) => c.skillKey.startsWith('apollo-'));
  const aiArkSkills = candidates.filter((c) => c.skillKey.startsWith('ai-ark-'));

  if (apolloSkills.length === 0 || aiArkSkills.length === 0) return candidates;

  // Apply preference by boosting the preferred provider's confidence
  const boost = 0.15;
  return candidates.map((c) => {
    if (preference === 'always_apollo' && c.skillKey.startsWith('apollo-')) {
      return { ...c, confidence: Math.min(1, c.confidence + boost) };
    }
    if (preference === 'always_ai_ark' && c.skillKey.startsWith('ai-ark-')) {
      return { ...c, confidence: Math.min(1, c.confidence + boost) };
    }
    if (preference === 'hybrid') {
      // Hybrid: AI Ark for company/firmographic, Apollo for contacts
      const isCompanySkill = c.skillKey.includes('company') || c.skillKey.includes('similarity') || c.skillKey.includes('semantic');
      if (isCompanySkill && c.skillKey.startsWith('ai-ark-')) {
        return { ...c, confidence: Math.min(1, c.confidence + boost) };
      }
      if (!isCompanySkill && c.skillKey.startsWith('apollo-')) {
        return { ...c, confidence: Math.min(1, c.confidence + boost) };
      }
    }
    return c;
  }).sort((a, b) => b.confidence - a.confidence);
}

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Normalize triggers to V2 format
 * Handles both V1 (string[]) and V2 (SkillTrigger[]) formats
 */
function normalizeTriggers(
  triggers: (string | SkillTrigger)[] | undefined
): SkillTrigger[] {
  if (!triggers) return [];

  return triggers.map((trigger) => {
    if (typeof trigger === 'string') {
      // V1 format: simple string
      return {
        pattern: trigger,
        confidence: 0.75, // Default confidence for V1 triggers
      };
    }
    // V2 format: full object
    return trigger;
  });
}

/**
 * Calculate match score between user message and skill triggers
 * Supports both V1 (string[]) and V2 (SkillTrigger[]) trigger formats
 */
function calculateTriggerMatch(
  message: string,
  rawTriggers: (string | SkillTrigger)[] | undefined,
  keywords?: string[],
  description?: string
): { confidence: number; matchedTrigger?: string } {
  const messageLower = message.toLowerCase();
  const words = messageLower.split(/\s+/);

  let bestConfidence = 0;
  let matchedTrigger: string | undefined;

  // Normalize triggers to V2 format
  const triggers = normalizeTriggers(rawTriggers);

  // Check triggers (highest priority)
  for (const trigger of triggers) {
    const patternLower = trigger.pattern.toLowerCase();

    // Exact pattern match
    if (messageLower.includes(patternLower)) {
      const confidence = trigger.confidence || 0.8;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        matchedTrigger = trigger.pattern;
      }
    }

    // Check trigger examples (V2 only)
    if (trigger.examples) {
      for (const example of trigger.examples) {
        if (messageLower.includes(example.toLowerCase())) {
          const confidence = (trigger.confidence || 0.8) * 0.9; // Slightly lower for examples
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            matchedTrigger = example;
          }
        }
      }
    }
  }

  // Check keywords (medium priority)
  if (keywords && bestConfidence < 0.5) {
    const keywordMatches = keywords.filter((kw) =>
      words.includes(kw.toLowerCase())
    );
    if (keywordMatches.length > 0) {
      const keywordConfidence = Math.min(0.6, keywordMatches.length * 0.2);
      if (keywordConfidence > bestConfidence) {
        bestConfidence = keywordConfidence;
        matchedTrigger = keywordMatches[0];
      }
    }
  }

  // Check description for relevant terms (lowest priority, fallback)
  if (description && bestConfidence < 0.4) {
    const descLower = description.toLowerCase();
    // Count how many message words appear in description
    const descMatches = words.filter(
      (word) => word.length > 3 && descLower.includes(word)
    );
    if (descMatches.length >= 2) {
      const descConfidence = Math.min(0.45, descMatches.length * 0.1);
      if (descConfidence > bestConfidence) {
        bestConfidence = descConfidence;
        matchedTrigger = `description match: ${descMatches.slice(0, 2).join(', ')}`;
      }
    }
  }

  return { confidence: bestConfidence, matchedTrigger };
}

/**
 * Step 2b: Check if the user intent matches a standard table query.
 * Runs AFTER sequence and skill matching to avoid stealing routes from
 * richer sequences (e.g. "show me my pipeline" should route to
 * seq-pipeline-focus-tasks, not query-standard-table).
 */
function detectStandardTableIntent(
  userMessage: string
): { matched: boolean; tableName?: string; filters?: unknown[] } | null {
  const msg = userMessage.toLowerCase();

  // Table name detection
  const tablePatterns: Array<{ pattern: RegExp; tableName: string }> = [
    { pattern: /\b(leads?|prospects?|pipeline)\b/i, tableName: 'Leads' },
    { pattern: /\b(meetings?|calls?|conversations?)\b/i, tableName: 'Meetings' },
    { pattern: /\b(contacts?|people)\b/i, tableName: 'All Contacts' },
    { pattern: /\b(companies|accounts?|organizations?)\b/i, tableName: 'All Companies' },
  ];

  // Intent verbs that indicate a query
  const queryVerbs = /\b(show|list|find|get|query|search|display|how many|count|top|recent|active)\b/i;

  if (!queryVerbs.test(msg)) return null;

  for (const { pattern, tableName } of tablePatterns) {
    if (pattern.test(msg)) {
      return { matched: true, tableName };
    }
  }

  return null;
}

/**
 * Fetch all active organization skills via the RPC (single call).
 * Returns the raw rows; callers filter by category as needed.
 */
async function fetchOrgSkills(
  orgId: string
): Promise<Array<{ skill_key: string; category: string; frontmatter: Record<string, unknown>; content: string; is_enabled: boolean }>> {
  const { data, error } = await supabase
    .rpc('get_organization_skills_for_agent', {
      p_org_id: orgId,
    }) as { data: Array<{ skill_key: string; category: string; frontmatter: Record<string, unknown>; content: string; is_enabled: boolean }> | null; error: { message: string } | null };

  if (error) {
    console.error('[copilotRoutingService.fetchOrgSkills] Error:', error);
    return [];
  }

  return data || [];
}

/**
 * Extract sequences from pre-fetched organization skills.
 * Reads from organization_skills (compiled, org-specific) via RPC.
 */
function extractSequences(
  allSkills: Array<{ skill_key: string; category: string; frontmatter: Record<string, unknown>; content: string; is_enabled: boolean }>
): Array<SkillRow & { linked_skill_count: number }> {
  return allSkills
    .filter((s) => s.category === 'agent-sequence')
    .map((seq) => {
      const fm = seq.frontmatter as SkillFrontmatterV2;
      const linkedSkills = (fm as Record<string, unknown>).linked_skills;
      return {
        skill_key: seq.skill_key,
        category: seq.category,
        frontmatter: fm,
        is_enabled: seq.is_enabled,
        linked_skill_count: Array.isArray(linkedSkills) ? linkedSkills.length : 0,
      };
    });
}

/**
 * Extract individual (non-sequence, non-HITL) skills from pre-fetched organization skills.
 * Reads from organization_skills (compiled, org-specific) via RPC.
 */
function extractIndividualSkills(
  allSkills: Array<{ skill_key: string; category: string; frontmatter: Record<string, unknown>; content: string; is_enabled: boolean }>
): SkillRow[] {
  return allSkills
    .filter((s) => s.category !== 'agent-sequence' && s.category !== 'hitl')
    .map((s) => ({
      skill_key: s.skill_key,
      category: s.category,
      frontmatter: s.frontmatter as SkillFrontmatterV2,
      is_enabled: s.is_enabled,
    }));
}

// =============================================================================
// Main Routing Function
// =============================================================================

/**
 * Route a user message to the best matching skill
 *
 * Decision flow:
 * 1. Check sequences first (agent-sequence category)
 * 2. If sequence matches with confidence > 0.7, use it
 * 3. Otherwise, fall back to individual skills
 */
export async function routeToSkill(
  message: string,
  context?: {
    userId?: string;
    orgId?: string;
    currentView?: string;
    dataProviderPreference?: DataProviderPreference;
    icpProfile?: {
      id: string;
      name: string;
      profile_type?: 'icp' | 'persona';
      parent_icp_id?: string | null;
      criteria?: Record<string, unknown>;
    };
    parentIcpProfile?: {
      id: string;
      name: string;
      criteria?: Record<string, unknown>;
    };
  }
): Promise<RoutingDecision> {
  const candidates: SkillMatch[] = [];
  const orgId = context?.orgId;

  if (!orgId) {
    console.warn('[copilotRoutingService.routeToSkill] No orgId provided — cannot route');
    return {
      selectedSkill: null,
      candidates: [],
      isSequenceMatch: false,
      reason: 'No organization ID provided for skill routing',
    };
  }

  // Fetch all organization skills in a single RPC call (avoids duplicate requests)
  const allOrgSkills = await fetchOrgSkills(orgId);

  // Step 1: Check sequences first
  const sequences = extractSequences(allOrgSkills);

  for (const seq of sequences) {
    const frontmatter = seq.frontmatter as SkillFrontmatterV2;

    const { confidence, matchedTrigger } = calculateTriggerMatch(
      message,
      frontmatter?.triggers,
      frontmatter?.keywords,
      frontmatter?.description
    );

    if (confidence > 0) {
      candidates.push({
        skillId: seq.skill_key,
        skillKey: seq.skill_key,
        name: frontmatter?.name || seq.skill_key,
        category: seq.category,
        confidence,
        matchedTrigger,
        isSequence: true,
        linkedSkillCount: seq.linked_skill_count,
      });
    }
  }

  // Sort sequence candidates by confidence
  const sequenceCandidates = candidates
    .filter((c) => c.isSequence)
    .sort((a, b) => b.confidence - a.confidence);

  // Check if best sequence match exceeds threshold
  const bestSequence = sequenceCandidates[0];
  if (bestSequence && bestSequence.confidence >= SEQUENCE_CONFIDENCE_THRESHOLD) {
    return {
      selectedSkill: bestSequence,
      candidates: candidates.slice(0, MAX_CANDIDATES),
      isSequenceMatch: true,
      reason: `Sequence "${bestSequence.name}" matched with confidence ${(bestSequence.confidence * 100).toFixed(0)}% (trigger: "${bestSequence.matchedTrigger}")`,
    };
  }

  // Step 2: Fall back to individual skills (from same RPC response, no duplicate call)
  const individualSkills = extractIndividualSkills(allOrgSkills);

  for (const skill of individualSkills) {
    const frontmatter = skill.frontmatter as SkillFrontmatterV2;

    const { confidence, matchedTrigger } = calculateTriggerMatch(
      message,
      frontmatter?.triggers,
      frontmatter?.keywords,
      frontmatter?.description
    );
    if (confidence > 0) {
      candidates.push({
        skillId: skill.skill_key,
        skillKey: skill.skill_key,
        name: frontmatter?.name || skill.skill_key,
        category: skill.category,
        confidence,
        matchedTrigger,
        isSequence: false,
      });
    }
  }

  // Sort all candidates by confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Apply data provider preference (Apollo vs AI Ark) if specified
  const preference = context?.dataProviderPreference || 'auto';
  const adjustedCandidates = applyProviderPreference(candidates, preference);
  // Replace candidates with adjusted order (spread into new array to avoid
  // aliasing — applyProviderPreference may return the same reference)
  const reordered = [...adjustedCandidates];
  candidates.length = 0;
  candidates.push(...reordered);

  // Select best overall match
  const bestMatch = candidates[0];
  if (bestMatch && bestMatch.confidence >= INDIVIDUAL_CONFIDENCE_THRESHOLD) {
    return {
      selectedSkill: bestMatch,
      candidates: candidates.slice(0, MAX_CANDIDATES),
      isSequenceMatch: false,
      reason: bestMatch.isSequence
        ? `Sequence "${bestMatch.name}" matched below threshold (${(bestMatch.confidence * 100).toFixed(0)}%)`
        : `Individual skill "${bestMatch.name}" matched with confidence ${(bestMatch.confidence * 100).toFixed(0)}%`,
    };
  }

  // Step 2b: Standard table query fallback
  // Only runs when no sequence or skill matched above threshold.
  // This prevents generic table patterns (e.g. "pipeline") from stealing
  // routes that should go to richer sequences like seq-pipeline-focus-tasks.
  const tableIntent = detectStandardTableIntent(message);
  if (tableIntent?.matched && tableIntent.tableName) {
    const standardTableSkill: SkillMatch = {
      skillId: 'query-standard-table',
      skillKey: 'query-standard-table',
      name: 'Query Standard Table',
      category: 'ops',
      confidence: 0.85,
      matchedTrigger: `standard table query: ${tableIntent.tableName}`,
      isSequence: false,
    };

    return {
      selectedSkill: standardTableSkill,
      candidates: [standardTableSkill, ...candidates.slice(0, MAX_CANDIDATES - 1)],
      isSequenceMatch: false,
      reason: `Standard table query detected: ${tableIntent.tableName}`,
    };
  }

  // Step 3: Embedding-based semantic fallback
  // Only fires when trigger-based matching has no confident result
  try {
    const semanticMatches = await findSemanticMatches(
      message,
      SEMANTIC_SIMILARITY_THRESHOLD,
      3
    );

    if (semanticMatches.length > 0) {
      const best = semanticMatches[0];
      const isSequence = best.category === 'agent-sequence';
      const semanticCandidate: SkillMatch = {
        skillId: best.skillId,
        skillKey: best.skillKey,
        name: (best.frontmatter?.name as string) || best.skillKey,
        category: best.category,
        confidence: best.similarity,
        matchedTrigger: 'semantic similarity',
        isSequence,
      };

      // Add semantic candidates to the list
      for (const match of semanticMatches) {
        candidates.push({
          skillId: match.skillId,
          skillKey: match.skillKey,
          name: (match.frontmatter?.name as string) || match.skillKey,
          category: match.category,
          confidence: match.similarity,
          matchedTrigger: 'semantic similarity',
          isSequence: match.category === 'agent-sequence',
        });
      }

      candidates.sort((a, b) => b.confidence - a.confidence);

      return {
        selectedSkill: semanticCandidate,
        candidates: candidates.slice(0, MAX_CANDIDATES),
        isSequenceMatch: isSequence,
        reason: `Semantic match: "${semanticCandidate.name}" with ${(best.similarity * 100).toFixed(0)}% similarity`,
      };
    }
  } catch (err) {
    // Non-fatal: embedding search failure falls through to no-match
    console.warn('[copilotRoutingService] Semantic fallback error:', err);
  }

  // No confident match
  return {
    selectedSkill: null,
    candidates: candidates.slice(0, MAX_CANDIDATES),
    isSequenceMatch: false,
    reason:
      candidates.length > 0
        ? `No confident match found. Best candidate: "${candidates[0]?.name}" at ${(candidates[0]?.confidence * 100).toFixed(0)}%`
        : 'No matching skills found',
  };
}

/**
 * Log routing decision for analytics
 */
export async function logRoutingDecision(
  userId: string,
  message: string,
  decision: RoutingDecision
): Promise<void> {
  try {
    await supabase.from('copilot_routing_logs').insert({
      user_id: userId,
      message_snippet: message.slice(0, 200),
      selected_skill_id: decision.selectedSkill?.skillId || null,
      selected_skill_key: decision.selectedSkill?.skillKey || null,
      is_sequence_match: decision.isSequenceMatch,
      confidence: decision.selectedSkill?.confidence || 0,
      candidate_count: decision.candidates.length,
      reason: decision.reason,
    });
  } catch (error) {
    // Don't throw - logging is non-critical
    console.warn('[copilotRoutingService.logRoutingDecision] Error:', error);
  }
}

// =============================================================================
// Export Service Object
// =============================================================================

export const copilotRoutingService = {
  routeToSkill,
  logRoutingDecision,
  calculateTriggerMatch,
  // Re-export for direct use
  SEMANTIC_SIMILARITY_THRESHOLD,
};

export default copilotRoutingService;
