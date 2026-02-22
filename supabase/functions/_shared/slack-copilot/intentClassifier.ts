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

Intent types:
- deal_query: Questions about specific deals (status, progress, details)
- pipeline_query: Questions about overall pipeline, quota, forecast, targets
- history_query: Questions about past interactions, meetings, emails, timeline
- contact_query: Questions about specific people or companies
- action_request: Requests to do something (draft email, create task, send message, schedule)
- competitive_query: Questions about competitors, battlecards, positioning
- coaching_query: Questions about personal performance, improvement, techniques
- general_chat: Greetings, thanks, unclear, or off-topic messages

Respond with ONLY a JSON object (no markdown):
{"type": "<intent>", "confidence": <0.0-1.0>, "entities": {"dealName": "...", "contactName": "...", "companyName": "...", "competitorName": "...", "actionType": "...", "objectionType": "...", "rawQuery": "..."}, "reasoning": "brief reason"}

Only include entity fields that are actually present. actionType must be one of: draft_email, create_task, send_email, schedule_meeting.`,
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
      entities: cleanEntities(parsed.entities || {}),
      reasoning: parsed.reasoning,
    };
  } catch {
    console.warn('[intentClassifier] Failed to parse AI response:', text);
    return classifyWithRegex(message);
  }
}

/**
 * Regex-based fallback classification
 */
function classifyWithRegex(message: string): ClassifiedIntent {
  const lower = message.toLowerCase().trim();
  const entities: ExtractedEntities = { rawQuery: message };

  // Deal queries
  const dealPatterns = [
    /(?:what(?:'s| is) happening|status|update|progress|how(?:'s| is)).*(?:deal|opportunity|opp)/i,
    /(?:tell me about|show me|give me).*deal/i,
    /(?:what|how).*(?:the|my).*(?:deal|account|opp)/i,
  ];
  for (const p of dealPatterns) {
    const match = message.match(p);
    if (match) {
      // Try to extract deal name
      const nameMatch = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+account|\?|$)/);
      if (nameMatch) entities.dealName = nameMatch[1].trim();
      return { type: 'deal_query', confidence: 0.75, entities };
    }
  }

  // Pipeline queries
  if (/(?:pipeline|quota|forecast|target|on track|q[1-4]|quarter|revenue|numbers|am i)/i.test(lower)) {
    return { type: 'pipeline_query', confidence: 0.7, entities };
  }

  // History queries
  if (/(?:when did|last (?:time|meeting|call|email)|history|talked? to|spoke? (?:to|with)|met with)/i.test(lower)) {
    const nameMatch = message.match(/(?:to|with|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'history_query', confidence: 0.75, entities };
  }

  // Contact queries
  if (/(?:who is|tell me about|what do we know|info on|details (?:on|about|for))\s/i.test(lower)) {
    const nameMatch = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contactName = nameMatch[1].trim();
    return { type: 'contact_query', confidence: 0.7, entities };
  }

  // Action requests
  if (/(?:draft|write|compose|send|create|schedule|book|set up|make)\s/i.test(lower)) {
    if (/(?:email|follow[- ]?up|message|note)/i.test(lower)) entities.actionType = 'draft_email';
    else if (/(?:task|todo|reminder|action item)/i.test(lower)) entities.actionType = 'create_task';
    else if (/(?:meeting|call|calendar)/i.test(lower)) entities.actionType = 'schedule_meeting';
    return { type: 'action_request', confidence: 0.7, entities };
  }

  // Competitive queries
  if (/(?:competitor|compete|vs|versus|against|battle|positioning|differentiat)/i.test(lower)) {
    const nameMatch = message.match(/(?:against|vs\.?|versus|about|with)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.competitorName = nameMatch[1].trim();
    return { type: 'competitive_query', confidence: 0.7, entities };
  }

  // Coaching queries
  if (/(?:how (?:am i|should i|can i|do i)|improve|coaching|tip|advice|handle|objection|performance|metric)/i.test(lower)) {
    const objMatch = message.match(/(?:handle|respond to|overcome)\s+(?:the\s+)?(.+?)(?:\?|$|\.)/i);
    if (objMatch) entities.objectionType = objMatch[1].trim();
    return { type: 'coaching_query', confidence: 0.65, entities };
  }

  // Meetings this week
  if (/(?:meetings?|calendar|schedule)\s+(?:this|next|today|tomorrow)/i.test(lower)) {
    return { type: 'history_query', confidence: 0.7, entities };
  }

  // At-risk deals
  if (/(?:at risk|risky|risk|danger|slipping|stalling)/i.test(lower)) {
    return { type: 'deal_query', confidence: 0.7, entities };
  }

  // Default
  return { type: 'general_chat', confidence: 0.3, entities };
}

function cleanEntities(raw: Record<string, unknown>): ExtractedEntities {
  const cleaned: ExtractedEntities = {};
  if (raw.dealName && typeof raw.dealName === 'string') cleaned.dealName = raw.dealName;
  if (raw.contactName && typeof raw.contactName === 'string') cleaned.contactName = raw.contactName;
  if (raw.companyName && typeof raw.companyName === 'string') cleaned.companyName = raw.companyName;
  if (raw.competitorName && typeof raw.competitorName === 'string') cleaned.competitorName = raw.competitorName;
  if (raw.actionType && typeof raw.actionType === 'string') {
    cleaned.actionType = raw.actionType as ExtractedEntities['actionType'];
  }
  if (raw.objectionType && typeof raw.objectionType === 'string') cleaned.objectionType = raw.objectionType;
  if (raw.rawQuery && typeof raw.rawQuery === 'string') cleaned.rawQuery = raw.rawQuery;
  return cleaned;
}
