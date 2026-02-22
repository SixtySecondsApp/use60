/**
 * Skill Intent Detector (POL-001)
 *
 * Detects when a user's plain text message matches a skill intent
 * and suggests the appropriate /command. Uses keyword matching and
 * simple pattern detection (NOT AI-based).
 */

export interface SkillSuggestion {
  command: string;
  skillName: string;
  confidence: number;
  displayText: string;
}

interface SkillKeywordDef {
  command: string;
  skillName: string;
  keywords: string[];
}

const SKILL_KEYWORDS: SkillKeywordDef[] = [
  {
    command: 'proposal',
    skillName: 'Proposal',
    keywords: ['proposal', 'quote', 'pricing', 'offer'],
  },
  {
    command: 'followup',
    skillName: 'Follow Up',
    keywords: ['follow up', 'follow-up', 'followup', 'check in', 'touch base'],
  },
  {
    command: 'research',
    skillName: 'Research',
    keywords: ['research', 'brief', 'background', 'intel', 'prep'],
  },
  {
    command: 'summary',
    skillName: 'Summary',
    keywords: ['summary', 'summarize', 'overview', 'status update'],
  },
  {
    command: 'objection',
    skillName: 'Objection',
    keywords: ['objection', 'pushback', 'concern', 'hesitation'],
  },
  {
    command: 'battlecard',
    skillName: 'Battlecard',
    keywords: ['battlecard', 'battle card', 'competitive', 'competitor', 'vs'],
  },
  {
    command: 'handoff',
    skillName: 'Handoff',
    keywords: ['handoff', 'hand off', 'hand over', 'transfer', 'transition'],
  },
  {
    command: 'chase',
    skillName: 'Chase',
    keywords: ['chase', 'nudge', 'ping', 'gone quiet', 'ghost'],
  },
  {
    command: 'agenda',
    skillName: 'Agenda',
    keywords: ['agenda', 'meeting prep', 'talking points', 'discussion'],
  },
  {
    command: 'win',
    skillName: 'Win Note',
    keywords: ['win note', 'deal won', 'closed won', 'celebration', 'announce'],
  },
];

const CONFIDENCE_BASE = 0.65;
const CONFIDENCE_MULTI_KEYWORD_BOOST = 0.1;
const CONFIDENCE_ENTITY_BOOST = 0.1;
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Detect if a plain text message matches a skill intent.
 *
 * Returns the highest-confidence match above the threshold, or null.
 * Returns null immediately if the message already starts with a / command.
 */
export function detectSkillIntent(
  text: string,
  hasEntities: boolean,
): SkillSuggestion | null {
  const trimmed = text.trim();

  // Already using a skill command — no suggestion needed
  if (trimmed.startsWith('/')) return null;

  // Nothing to match against
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();

  let bestMatch: SkillSuggestion | null = null;

  for (const skill of SKILL_KEYWORDS) {
    const matchedCount = skill.keywords.filter((kw) => lower.includes(kw)).length;

    if (matchedCount === 0) continue;

    let confidence = CONFIDENCE_BASE;

    // Boost for multiple keyword matches
    if (matchedCount > 1) {
      confidence += CONFIDENCE_MULTI_KEYWORD_BOOST;
    }

    // Boost when entities are present (user is being specific)
    if (hasEntities) {
      confidence += CONFIDENCE_ENTITY_BOOST;
    }

    // Cap at 0.95
    confidence = Math.min(confidence, 0.95);

    if (confidence >= CONFIDENCE_THRESHOLD && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = {
        command: skill.command,
        skillName: skill.skillName,
        confidence,
        displayText: `Try /${skill.command} for a structured output`,
      };
    }
  }

  return bestMatch;
}
