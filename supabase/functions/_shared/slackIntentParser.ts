/**
 * SLACK-024: Natural Language Intent Parser for @60 Mentions
 *
 * Parses free-text messages into structured intents that map to existing
 * slash command handlers and skill functions.
 *
 * Strategy:
 * 1. Keyword-based matching for known patterns (fast, deterministic)
 * 2. Claude Haiku fallback for ambiguous intents (slow, accurate)
 */

export type SlackIntent =
  | { type: 'follow_up'; contactName?: string; dealName?: string }
  | { type: 'add_to_campaign'; contactName?: string; campaignName?: string }
  | { type: 'find_contacts'; query: string; count?: number }
  | { type: 'deal_summary'; dealName?: string }
  | { type: 'prep_meeting'; meetingName?: string }
  | { type: 'pipeline_summary' }
  | { type: 'today' }
  | { type: 'focus' }
  | { type: 'help' }
  | null; // Unrecognized

interface ParseResult {
  intent: SlackIntent;
  confidence: number; // 0-1
  rawText: string;
}

// ─── Keyword-based patterns ───

const PATTERNS: Array<{
  regex: RegExp;
  parse: (match: RegExpMatchArray, text: string) => SlackIntent;
  confidence: number;
}> = [
  // Follow-up patterns
  {
    regex: /(?:draft|write|send|create)\s+(?:a\s+)?(?:follow[\s-]?up|email|check[\s-]?in)\s+(?:for|to|with|about)?\s*(.+)/i,
    parse: (match) => {
      const target = match[1]?.trim();
      // Heuristic: if target looks like a deal name (contains "deal" or is title-case multi-word)
      const isDeal = /deal|opportunity|project/i.test(target);
      return isDeal
        ? { type: 'follow_up', dealName: target }
        : { type: 'follow_up', contactName: target };
    },
    confidence: 0.85,
  },
  // Simple follow-up
  {
    regex: /^follow[\s-]?up\s+(?:for|with|to)?\s*(.+)/i,
    parse: (match) => ({ type: 'follow_up', contactName: match[1]?.trim() }),
    confidence: 0.8,
  },

  // Add to campaign
  {
    regex: /add\s+(.+?)\s+to\s+(?:campaign\s+)?(.+?)(?:\s+campaign)?$/i,
    parse: (match) => ({
      type: 'add_to_campaign',
      contactName: match[1]?.trim(),
      campaignName: match[2]?.trim(),
    }),
    confidence: 0.9,
  },

  // Find contacts / lookalike
  {
    regex: /(?:find|search|get|look\s+for)\s+(?:me\s+)?(\d+)?\s*(?:contacts?|people|leads?)\s+(?:like|similar\s+to|matching)\s+(.+)/i,
    parse: (match) => ({
      type: 'find_contacts',
      count: match[1] ? parseInt(match[1], 10) : 10,
      query: match[2]?.trim(),
    }),
    confidence: 0.85,
  },
  // Simple find
  {
    regex: /(?:find|search)\s+(?:contacts?|people|leads?)\s+(.+)/i,
    parse: (match) => ({
      type: 'find_contacts',
      query: match[1]?.trim(),
    }),
    confidence: 0.7,
  },

  // Deal summary
  {
    regex: /(?:deal|show|get|what's|whats)\s+(?:the\s+)?(?:status|summary|update|info)\s+(?:of|on|for|about)\s+(.+)/i,
    parse: (match) => ({ type: 'deal_summary', dealName: match[1]?.trim() }),
    confidence: 0.85,
  },
  {
    regex: /(?:deal|summary)\s+(.+)/i,
    parse: (match) => ({ type: 'deal_summary', dealName: match[1]?.trim() }),
    confidence: 0.6,
  },

  // Meeting prep
  {
    regex: /(?:prep|prepare|brief)\s+(?:me\s+)?(?:for\s+)?(?:my\s+)?(?:next\s+)?(?:meeting|call)\s*(?:with\s+)?(.+)?/i,
    parse: (match) => ({ type: 'prep_meeting', meetingName: match[1]?.trim() }),
    confidence: 0.85,
  },

  // Pipeline
  {
    regex: /(?:pipeline|forecast|deals)\s*(?:summary|overview|status)?/i,
    parse: () => ({ type: 'pipeline_summary' }),
    confidence: 0.85,
  },

  // Today
  {
    regex: /(?:today|my\s+day|what'?s?\s+(?:on\s+)?(?:my\s+)?(?:schedule|agenda|calendar))/i,
    parse: () => ({ type: 'today' }),
    confidence: 0.9,
  },

  // Focus / tasks
  {
    regex: /(?:focus|tasks?|what\s+should\s+I|priorities)/i,
    parse: () => ({ type: 'focus' }),
    confidence: 0.7,
  },

  // Help
  {
    regex: /^(?:help|what\s+can\s+you\s+do|commands?|capabilities)/i,
    parse: () => ({ type: 'help' }),
    confidence: 0.95,
  },
];

/**
 * Parse a natural language message into a structured intent.
 * Returns null intent if nothing matches.
 */
export function parseIntent(text: string): ParseResult {
  // Clean the text: remove @60 mention, trim
  const cleaned = text
    .replace(/<@[A-Z0-9]+>/g, '') // Remove Slack user mentions
    .replace(/^\s*60\s*/i, '')     // Remove leading "60"
    .trim();

  if (!cleaned) {
    return { intent: { type: 'help' }, confidence: 0.9, rawText: text };
  }

  // Try each pattern
  for (const pattern of PATTERNS) {
    const match = cleaned.match(pattern.regex);
    if (match) {
      return {
        intent: pattern.parse(match, cleaned),
        confidence: pattern.confidence,
        rawText: cleaned,
      };
    }
  }

  // No match
  return { intent: null, confidence: 0, rawText: cleaned };
}

/**
 * Build the fallback capability list message for unrecognized commands.
 * (SLACK-027)
 */
export function buildCapabilityList(): string {
  return [
    "Here's what I can help with:",
    '',
    '*Follow-ups*',
    '`@60 draft a follow-up for Sarah Chen`',
    '`@60 send a check-in to Acme Corp deal`',
    '',
    '*Campaigns*',
    '`@60 add john@acme.com to AI Round Table`',
    '',
    '*Research*',
    '`@60 find 10 contacts like Sarah Chen`',
    '`@60 find leads matching VP Engineering at fintech`',
    '',
    '*Pipeline*',
    '`@60 deal summary for Acme Corp`',
    '`@60 pipeline overview`',
    '',
    '*Meetings*',
    '`@60 prep me for my next meeting`',
    '`@60 what\'s on my schedule today?`',
    '',
    '*Tasks*',
    '`@60 focus` — show priorities',
    '',
    'Or just say `@60 help` anytime!',
  ].join('\n');
}
