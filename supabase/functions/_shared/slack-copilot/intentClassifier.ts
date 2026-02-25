// supabase/functions/_shared/slack-copilot/intentClassifier.ts
// AI-powered intent classification for Slack DM messages (PRD-22, CONV-002)

import type { ClassifiedIntent, CopilotIntentType, ExtractedEntities, ThreadMessage } from './types.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Classify user intent from a Slack DM message using Claude Haiku.
 * Falls back to regex-based classification if AI unavailable.
 */
export async function classifyIntent(
  message: string,
  threadHistory: ThreadMessage[],
  anthropicApiKey: string | null
): Promise<ClassifiedIntent> {
  // Try AI classification first
  if (anthropicApiKey) {
    try {
      return await classifyWithAI(message, threadHistory, anthropicApiKey);
    } catch (err) {
      console.error('[intentClassifier] AI classification failed, falling back to regex:', err);
    }
  }

  // Fallback to regex-based classification
  return classifyWithRegex(message);
}

async function classifyWithAI(
  message: string,
  threadHistory: ThreadMessage[],
  apiKey: string
): Promise<ClassifiedIntent> {
  const historyContext = threadHistory.length > 0
    ? `\nRecent conversation:\n${threadHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}`
    : '';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are an intent classifier for a sales copilot. Classify the user's message into exactly one intent type and extract entities.

QUERY intents (information retrieval):
- deal_query: Questions about specific deals (status, progress, details)
- contact_query: Questions about specific people or companies
- pipeline_query: Questions about overall pipeline, quota, forecast, targets
- history_query: Questions about past interactions, meetings, emails, timeline
- metrics_query: Counting or aggregating (how many meetings, total calls, deal count)
- risk_query: Questions about at-risk deals, stale accounts, inactive contacts
- competitive_query: Questions about competitors, battlecards, positioning
- coaching_query: Questions about personal performance, improvement, techniques

ACTION intents (do something):
- draft_email: Draft or write a follow-up or outreach email
- draft_check_in: Batch check-in messages for stale/inactive contacts
- update_crm: Update deal stage, status, or field values
- create_task: Create a task, reminder, or to-do
- trigger_prep: Prepare a meeting brief or research package
- trigger_enrichment: Enrich or research a contact or company
- schedule_meeting: Schedule, book, or find time for a meeting

META intents:
- help: User asking what the copilot can do or how to use it
- feedback: User giving positive or negative feedback about the copilot
- clarification_needed: Message is too ambiguous to act on (low confidence)
- general: Greetings, off-topic, or unclear messages

Respond with ONLY a JSON object (no markdown):
{"type": "<intent>", "confidence": <0.0-1.0>, "entities": {"dealName": "...", "contactName": "...", "companyName": "...", "competitorName": "...", "time_reference": "...", "actionType": "...", "objectionType": "...", "rawQuery": "..."}, "reasoning": "brief reason"}

Only include entity fields that are actually present.
actionType must be one of: draft_email, create_task, send_email, schedule_meeting, draft_check_in, update_crm, trigger_prep, trigger_enrichment.
time_reference should capture relative time phrases like "last week", "Q2", "this month", "Friday", "yesterday".`,
      messages: [
        {
          role: 'user',
          content: `${historyContext}\n\nClassify this message: "${message}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const parsed = JSON.parse(text);
    return {
      type: parsed.type as CopilotIntentType,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      entities: cleanEntities(parsed.entities || {}, message),
      reasoning: parsed.reasoning,
    };
  } catch {
    console.warn('[intentClassifier] Failed to parse AI response:', text);
    return classifyWithRegex(message);
  }
}

/**
 * Regex-based fallback classification covering all 20 intent types.
 * Ordered from most-specific to most-general to avoid false positives.
 */
function classifyWithRegex(message: string): ClassifiedIntent {
  const entities: ExtractedEntities = { rawQuery: message };

  // Always attempt to extract a time reference
  const timeRef = extractTimeReference(message);
  if (timeRef) entities.time_reference = timeRef;

  // --- META ---

  // Help
  if (/help|what can you|how do i|commands|capabilities/i.test(message)) {
    return { type: 'help', confidence: 0.85, entities };
  }

  // Feedback
  if (/great job|good job|well done|bad|stop doing|love this|hate this|feedback/i.test(message)) {
    return { type: 'feedback', confidence: 0.8, entities };
  }

  // --- QUERY ---

  // Deal queries
  const dealPatterns = [
    /(?:what(?:'s| is) happening|status|update|progress|how(?:'s| is)).*(?:deal|opportunity|opp)/i,
    /(?:tell me about|show me|give me).*deal/i,
    /(?:what|how).*(?:the|my).*(?:deal|account|opp)/i,
  ];
  for (const p of dealPatterns) {
    if (p.test(message)) {
      const nameMatch = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+account|\?|$)/);
      if (nameMatch) entities.dealName = nameMatch[1].trim();
      return { type: 'deal_query', confidence: 0.75, entities };
    }
  }

  // Metrics / counting
  if (/how many|count of|number of|meetings?\s+(?:this|last)\s+(?:week|month|quarter)/i.test(message)) {
    return { type: 'metrics_query', confidence: 0.8, entities };
  }

  // Risk queries (check before pipeline so "at risk deals" routes here, not pipeline)
  if (/at risk|risky|danger|slipping|stale|no activity|gone quiet|ghosting/i.test(message)) {
    return { type: 'risk_query', confidence: 0.8, entities };
  }

  // Pipeline queries
  if (/(?:pipeline|quota|forecast|target|on track|q[1-4]|quarter|revenue|numbers|am i)/i.test(message)) {
    return { type: 'pipeline_query', confidence: 0.7, entities };
  }

  // History queries
  if (/(?:when did|last (?:time|meeting|call|email)|history|talked? to|spoke? (?:to|with)|met with)/i.test(message)) {
    const nameMatch = message.match(/(?:to|with|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'history_query', confidence: 0.75, entities };
  }

  // Contact queries
  if (/(?:who is|tell me about|what do we know|info on|details (?:on|about|for))\s/i.test(message)) {
    const nameMatch = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'contact_query', confidence: 0.7, entities };
  }

  // Competitive queries
  if (/(?:competitor|compete|vs|versus|against|battle|positioning|differentiat)/i.test(message)) {
    const nameMatch = message.match(/(?:against|vs\.?|versus|about|with)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.competitorName = nameMatch[1].trim();
    return { type: 'competitive_query', confidence: 0.7, entities };
  }

  // Coaching queries
  if (/(?:how (?:am i|should i|can i|do i)|improve|coaching|tip|advice|handle|objection|performance|metric)/i.test(message)) {
    const objMatch = message.match(/(?:handle|respond to|overcome)\s+(?:the\s+)?(.+?)(?:\?|$|\.)/i);
    if (objMatch) entities.objectionType = objMatch[1].trim();
    return { type: 'coaching_query', confidence: 0.65, entities };
  }

  // --- ACTION ---

  // Batch check-ins (more specific than draft_email — check first)
  if (/check.?ins?\s+for\s+(?:stale|inactive|quiet|all)|batch\s+check.?in/i.test(message)) {
    entities.actionType = 'draft_check_in';
    return { type: 'draft_check_in', confidence: 0.85, entities };
  }

  // Draft / write email or follow-up
  if (/draft|write|compose|prepare.*email|follow.?up|check.?in\s+email/i.test(message)) {
    entities.actionType = 'draft_email';
    return { type: 'draft_email', confidence: 0.8, entities };
  }

  // Meeting prep / briefing
  if (/prep(?:are)?|brief(?:ing)?|meeting\s+prep|get\s+ready\s+for/i.test(message)) {
    entities.actionType = 'trigger_prep';
    return { type: 'trigger_prep', confidence: 0.8, entities };
  }

  // Enrichment / research
  if (/enrich|research|look.?up|find.*about|intel\s+on/i.test(message)) {
    entities.actionType = 'trigger_enrichment';
    return { type: 'trigger_enrichment', confidence: 0.8, entities };
  }

  // Schedule / book meeting
  if (/schedule|book|find\s+time|set\s+up.*meeting|calendar/i.test(message)) {
    entities.actionType = 'schedule_meeting';
    return { type: 'schedule_meeting', confidence: 0.75, entities };
  }

  // Update CRM
  if (/update|move|change.*stage|mark\s+as|set.*to/i.test(message)) {
    entities.actionType = 'update_crm';
    return { type: 'update_crm', confidence: 0.75, entities };
  }

  // Create task / reminder
  if (/remind(?:er)?|task|to.?do|follow.?up.*on|schedule.*reminder/i.test(message)) {
    entities.actionType = 'create_task';
    return { type: 'create_task', confidence: 0.75, entities };
  }

  // Generic action request fallback (backward-compatible with old action_request)
  if (/(?:draft|write|compose|send|create|schedule|book|set up|make)\s/i.test(message)) {
    if (/(?:email|follow[- ]?up|message|note)/i.test(message)) {
      entities.actionType = 'draft_email';
      return { type: 'draft_email', confidence: 0.65, entities };
    }
    if (/(?:task|todo|reminder|action item)/i.test(message)) {
      entities.actionType = 'create_task';
      return { type: 'create_task', confidence: 0.65, entities };
    }
    if (/(?:meeting|call|calendar)/i.test(message)) {
      entities.actionType = 'schedule_meeting';
      return { type: 'schedule_meeting', confidence: 0.65, entities };
    }
    // Unknown action — map to legacy alias for backward compatibility
    return { type: 'action_request', confidence: 0.55, entities };
  }

  // Meetings this week (falls through to history)
  if (/(?:meetings?|calendar|schedule)\s+(?:this|next|today|tomorrow)/i.test(message)) {
    return { type: 'history_query', confidence: 0.7, entities };
  }

  // Default — low confidence means ask_first routing
  return { type: 'general', confidence: 0.3, entities };
}

// ---------------------------------------------------------------------------
// Time reference extraction
// ---------------------------------------------------------------------------

/**
 * Extract a relative or named time reference from a message, e.g.
 * "last week", "Q2", "this month", "Friday".
 */
function extractTimeReference(message: string): string | undefined {
  const patterns: RegExp[] = [
    /(?:this|last|next)\s+(?:week|month|quarter|year)/i,
    /Q[1-4]/i,
    /(?:today|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  ];

  for (const p of patterns) {
    const match = message.match(p);
    if (match) return match[0];
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Entity cleaning (used by AI path)
// ---------------------------------------------------------------------------

function cleanEntities(raw: Record<string, unknown>, originalMessage: string): ExtractedEntities {
  const cleaned: ExtractedEntities = {};

  if (raw.dealName && typeof raw.dealName === 'string') cleaned.dealName = raw.dealName;
  if (raw.contactName && typeof raw.contactName === 'string') cleaned.contactName = raw.contactName;
  if (raw.companyName && typeof raw.companyName === 'string') cleaned.companyName = raw.companyName;
  if (raw.competitorName && typeof raw.competitorName === 'string') cleaned.competitorName = raw.competitorName;
  if (raw.time_reference && typeof raw.time_reference === 'string') {
    cleaned.time_reference = raw.time_reference;
  } else {
    // Attempt regex extraction even on AI path, as a safety net
    const timeRef = extractTimeReference(originalMessage);
    if (timeRef) cleaned.time_reference = timeRef;
  }
  if (raw.actionType && typeof raw.actionType === 'string') {
    cleaned.actionType = raw.actionType as ExtractedEntities['actionType'];
  }
  if (raw.objectionType && typeof raw.objectionType === 'string') cleaned.objectionType = raw.objectionType;
  if (raw.rawQuery && typeof raw.rawQuery === 'string') cleaned.rawQuery = raw.rawQuery;

  return cleaned;
}
