/**
 * Copilot Routing Service
 *
 * Handles skill selection for the copilot with sequence-first routing:
 * 1. Check sequences first (pre-built, tested orchestrations)
 * 2. If sequence matches intent with confidence > 0.7, use it
 * 3. If no sequence match, fall back to individual skills
 *
 * Sequences are skills with category: 'agent-sequence' that can orchestrate
 * multiple other skills via skill links.
 */

import { supabase } from '../supabase/clientV2';
import type { SkillFrontmatterV2, SkillTrigger } from '../types/skills';

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
  id: string;
  skill_key: string;
  category: string;
  frontmatter: SkillFrontmatterV2;
  is_active: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const SEQUENCE_CONFIDENCE_THRESHOLD = 0.7;
const INDIVIDUAL_CONFIDENCE_THRESHOLD = 0.5;
const MAX_CANDIDATES = 5;

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Calculate match score between user message and skill triggers
 */
function calculateTriggerMatch(
  message: string,
  triggers: SkillTrigger[],
  keywords?: string[]
): { confidence: number; matchedTrigger?: string } {
  const messageLower = message.toLowerCase();
  const words = messageLower.split(/\s+/);

  let bestConfidence = 0;
  let matchedTrigger: string | undefined;

  // Check triggers
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

    // Check trigger examples
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

  // Check keywords (lower confidence)
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

  return { confidence: bestConfidence, matchedTrigger };
}

/**
 * Get all active sequences with their linked skill counts
 */
async function getActiveSequences(): Promise<
  Array<SkillRow & { linked_skill_count: number }>
> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select(`
      id,
      skill_key,
      category,
      frontmatter,
      is_active
    `)
    .eq('is_active', true)
    .eq('category', 'agent-sequence');

  if (error) {
    console.error('[copilotRoutingService.getActiveSequences] Error:', error);
    return [];
  }

  // Get linked skill counts for each sequence
  const sequencesWithCounts = await Promise.all(
    (data || []).map(async (seq) => {
      const { count } = await supabase
        .from('skill_links')
        .select('*', { count: 'exact', head: true })
        .eq('parent_skill_id', seq.id);

      return {
        ...seq,
        linked_skill_count: count || 0,
      };
    })
  );

  return sequencesWithCounts;
}

/**
 * Get all active individual skills (non-sequences)
 */
async function getActiveIndividualSkills(): Promise<SkillRow[]> {
  const { data, error } = await supabase
    .from('platform_skills')
    .select(`
      id,
      skill_key,
      category,
      frontmatter,
      is_active
    `)
    .eq('is_active', true)
    .neq('category', 'agent-sequence')
    .neq('category', 'hitl'); // Exclude HITL skills from direct matching

  if (error) {
    console.error(
      '[copilotRoutingService.getActiveIndividualSkills] Error:',
      error
    );
    return [];
  }

  return data || [];
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
  }
): Promise<RoutingDecision> {
  const candidates: SkillMatch[] = [];

  // Step 1: Check sequences first
  const sequences = await getActiveSequences();

  for (const seq of sequences) {
    const frontmatter = seq.frontmatter as SkillFrontmatterV2;
    const triggers = frontmatter?.triggers || [];
    const keywords = frontmatter?.keywords;

    const { confidence, matchedTrigger } = calculateTriggerMatch(
      message,
      triggers,
      keywords
    );

    if (confidence > 0) {
      candidates.push({
        skillId: seq.id,
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

  // Step 2: Fall back to individual skills
  const individualSkills = await getActiveIndividualSkills();

  for (const skill of individualSkills) {
    const frontmatter = skill.frontmatter as SkillFrontmatterV2;
    const triggers = frontmatter?.triggers || [];
    const keywords = frontmatter?.keywords;

    const { confidence, matchedTrigger } = calculateTriggerMatch(
      message,
      triggers,
      keywords
    );

    if (confidence > 0) {
      candidates.push({
        skillId: skill.id,
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
};

export default copilotRoutingService;
