/**
 * route-message — Unified routing pipeline for intent classification (CC-003)
 *
 * Multi-step routing pipeline:
 *   - Default path: Intent Classification → Sequence Triggers → Skill Triggers → Semantic Fallback → General
 *   - Slack conversational path: `source: 'slack_conversational'` → classifySlackConversational()
 *
 * POST /route-message
 * Body (default path):
 *   { message: string; user_id: string; org_id: string; context?: Record<string, unknown> }
 *
 * Body (slack_conversational path):
 *   { source: 'slack_conversational'; message: string; thread_summary?: string; user_id: string; org_id: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { logAICostEvent } from '../_shared/costTracking.ts';

// =============================================================================
// Constants — Slack conversational intent taxonomy
// =============================================================================

const SLACK_CONVERSATIONAL_INTENTS = `
QUERY INTENTS (answer with data):
- deal_query: Questions about a specific deal (stage, value, status, trajectory)
- contact_query: Questions about a person (last interaction, relationship, engagement)
- pipeline_query: Pipeline overview, coverage, targets, stage breakdown
- history_query: What happened in past meetings/interactions, deal narrative
- metrics_query: Activity counts, meeting numbers, performance stats
- risk_query: At-risk deals, stale deals, ghosting signals
- competitive_query: Competitor mentions, win rates, positioning
- coaching_query: Objection handling advice, sales techniques, patterns

ACTION INTENTS (do something):
- draft_email: Write/compose an email or follow-up
- draft_check_in: Write check-ins for stale/inactive deals (batch mode)
- update_crm: Change deal stage, update fields
- create_task: Create a reminder or task
- trigger_prep: Generate meeting preparation brief
- trigger_enrichment: Research/enrich a contact or company
- schedule_meeting: Find time, book a meeting

META INTENTS:
- help: What can you do, show commands
- feedback: Positive/negative feedback about the AI
- clarification_needed: Message is too ambiguous to classify
- general: Doesn't fit other categories
`;

const SLACK_INTENT_PROMPT = `You are classifying a Slack message from a sales rep talking to their AI sales assistant.

Message: "{message}"
Thread context: {thread_summary}

Available intents:
${SLACK_CONVERSATIONAL_INTENTS}

Return JSON only:
{
  "intent": "<intent_type>",
  "confidence": 0.0-1.0,
  "entities": {
    "deal_name": "<if mentioned>",
    "contact_name": "<if mentioned>",
    "company_name": "<if mentioned>",
    "time_reference": "<if mentioned, e.g. 'last week', 'Q2'>",
    "action_type": "<if action requested>"
  },
  "requires_clarification": false,
  "clarification_question": null
}

Rules:
- If the message references an entity but multiple matches likely exist, set requires_clarification=true
- If "my 2pm meeting" → resolve from calendar context, don't ask
- Thread context should inform intent: "Draft that email" in a deal thread = draft_email for that deal
- Time references should be resolved: "this week" = current week dates, "Q2" = Apr-Jun
- Confidence >= 0.8 for clear intent, 0.5-0.8 for probable, < 0.5 for ambiguous`;

// =============================================================================
// Types
// =============================================================================

type SlackConversationalIntentType =
  | 'deal_query'
  | 'contact_query'
  | 'pipeline_query'
  | 'history_query'
  | 'metrics_query'
  | 'risk_query'
  | 'competitive_query'
  | 'coaching_query'
  | 'draft_email'
  | 'draft_check_in'
  | 'update_crm'
  | 'create_task'
  | 'trigger_prep'
  | 'trigger_enrichment'
  | 'schedule_meeting'
  | 'help'
  | 'feedback'
  | 'clarification_needed'
  | 'general';

interface SlackConversationalEntities {
  deal_name?: string;
  contact_name?: string;
  company_name?: string;
  time_reference?: string;
  action_type?: string;
}

interface SlackConversationalResult {
  intent: SlackConversationalIntentType;
  confidence: number;
  entities: SlackConversationalEntities;
  requires_clarification: boolean;
  clarification_question: string | null;
}

interface SlackConversationalRequest {
  source: 'slack_conversational';
  message: string;
  thread_summary?: string;
  user_id: string;
  org_id: string;
}

interface DefaultRouteRequest {
  message: string;
  user_id: string;
  org_id: string;
  context?: Record<string, unknown>;
}

type RouteMessageRequest = SlackConversationalRequest | DefaultRouteRequest;

// =============================================================================
// Slack Conversational Classification
// =============================================================================

/**
 * Regex-based fallback for Slack conversational intent classification.
 * Used when the AI call fails or no API key is available.
 */
function classifySlackWithRegex(message: string): SlackConversationalResult {
  const lower = message.toLowerCase().trim();
  const entities: SlackConversationalEntities = {};

  // Help
  if (/^(?:help|what can you do|\?|commands?|capabilities)/i.test(lower)) {
    return { intent: 'help', confidence: 0.9, entities, requires_clarification: false, clarification_question: null };
  }

  // Feedback (positive or negative)
  if (/(?:good job|well done|nice work|wrong|that'?s? (?:wrong|incorrect|bad)|not right)/i.test(lower)) {
    return { intent: 'feedback', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Draft email / follow-up
  if (/(?:draft|write|compose|send)\s+(?:a\s+)?(?:follow[\s-]?up|email|check[\s-]?in|message)/i.test(lower)) {
    const nameMatch = message.match(/(?:for|to|with)\s+([A-Z][a-zA-Z\s]+?)(?:\s+at|\s+about|\?|$)/);
    if (nameMatch) entities.contact_name = nameMatch[1].trim();
    return { intent: 'draft_email', confidence: 0.85, entities, requires_clarification: false, clarification_question: null };
  }

  // Draft check-in (batch / stale deals)
  if (/(?:check[\s-]?in|check in)\s+(?:on\s+)?(?:all|stale|cold|inactive|dead)/i.test(lower)) {
    return { intent: 'draft_check_in', confidence: 0.85, entities, requires_clarification: false, clarification_question: null };
  }

  // Pipeline query
  if (/(?:pipeline|forecast|quota|coverage|targets?|stage\s+breakdown)/i.test(lower)) {
    return { intent: 'pipeline_query', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Risk query
  if (/(?:at[\s-]?risk|stale\s+deals?|ghosting|slipping|no\s+response|gone\s+dark)/i.test(lower)) {
    return { intent: 'risk_query', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Metrics query
  if (/(?:how many|activity|activities|meeting count|calls?\s+made|emails?\s+sent|stats?|numbers?)/i.test(lower)) {
    return { intent: 'metrics_query', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // History query
  if (/(?:what happened|last (?:meeting|call|email|touch)|when did|history|narrative|timeline)/i.test(lower)) {
    const nameMatch = message.match(/(?:with|to|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contact_name = nameMatch[1].trim();
    return { intent: 'history_query', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // Deal query
  if (/(?:what(?:'s| is)\s+(?:the\s+)?status|how\s+is|tell\s+me\s+about|update\s+on)\s+(?:the\s+)?(?:deal|opp|opportunity)/i.test(lower)) {
    const nameMatch = message.match(/(?:the|my|with|for|about)\s+([A-Z][a-zA-Z\s]+?)(?:\s+deal|\s+opp|\?|$)/);
    if (nameMatch) entities.deal_name = nameMatch[1].trim();
    return { intent: 'deal_query', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // Contact query
  if (/(?:who is|tell me about|what do we know about|info on)\s/i.test(lower)) {
    const nameMatch = message.match(/(?:about|on|is|for)\s+([A-Z][a-zA-Z\s]+?)(?:\?|$|\.)/);
    if (nameMatch) entities.contact_name = nameMatch[1].trim();
    return { intent: 'contact_query', confidence: 0.7, entities, requires_clarification: false, clarification_question: null };
  }

  // Competitive query
  if (/(?:competitor|compete|vs\.?|versus|against|positioning|battlecard|win\s+rate)/i.test(lower)) {
    return { intent: 'competitive_query', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // Coaching query
  if (/(?:how (?:should|do|can) I|advice|tip|handle\s+(?:the\s+)?objection|improve|coaching)/i.test(lower)) {
    return { intent: 'coaching_query', confidence: 0.7, entities, requires_clarification: false, clarification_question: null };
  }

  // Update CRM
  if (/(?:update|change|move|set)\s+(?:the\s+)?(?:deal|stage|field|crm)/i.test(lower)) {
    return { intent: 'update_crm', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // Create task
  if (/(?:create|add|remind me|set\s+a)\s+(?:a\s+)?(?:task|reminder|todo|action\s+item)/i.test(lower)) {
    return { intent: 'create_task', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Trigger meeting prep
  if (/(?:prep|prepare|brief)\s+(?:me\s+)?(?:for|for\s+my)?/i.test(lower)) {
    return { intent: 'trigger_prep', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Trigger enrichment
  if (/(?:enrich|research|find\s+(?:info|details?|data)\s+(?:on|about))/i.test(lower)) {
    return { intent: 'trigger_enrichment', confidence: 0.75, entities, requires_clarification: false, clarification_question: null };
  }

  // Schedule meeting
  if (/(?:schedule|book|set\s+up)\s+(?:a\s+)?(?:meeting|call|demo)/i.test(lower)) {
    return { intent: 'schedule_meeting', confidence: 0.8, entities, requires_clarification: false, clarification_question: null };
  }

  // Default
  return { intent: 'general', confidence: 0.3, entities, requires_clarification: false, clarification_question: null };
}

interface SlackClassificationResponse {
  result: SlackConversationalResult;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Classify a Slack conversational message using Claude Haiku.
 * Falls back to regex classification if the AI call fails.
 */
async function classifySlackConversational(
  message: string,
  threadSummary: string,
  apiKey: string,
): Promise<SlackClassificationResponse> {
  const prompt = SLACK_INTENT_PROMPT
    .replace('{message}', message)
    .replace('{thread_summary}', threadSummary || 'None');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[route-message] Anthropic API error:', response.status, errText);
      return { result: classifySlackWithRegex(message), inputTokens: 0, outputTokens: 0 };
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || '';
    const inputTokens: number = data.usage?.input_tokens || 0;
    const outputTokens: number = data.usage?.output_tokens || 0;

    // Extract JSON — handle code fences and surrounding text
    let jsonText = text.trim();
    const codeFenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) jsonText = codeFenceMatch[1].trim();
    const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) jsonText = jsonObjectMatch[0];

    const parsed = JSON.parse(jsonText);

    const result: SlackConversationalResult = {
      intent: (parsed.intent as SlackConversationalIntentType) || 'general',
      confidence: Math.min(1, Math.max(0, typeof parsed.confidence === 'number' ? parsed.confidence : 0.5)),
      entities: {
        deal_name: parsed.entities?.deal_name || undefined,
        contact_name: parsed.entities?.contact_name || undefined,
        company_name: parsed.entities?.company_name || undefined,
        time_reference: parsed.entities?.time_reference || undefined,
        action_type: parsed.entities?.action_type || undefined,
      },
      requires_clarification: Boolean(parsed.requires_clarification),
      clarification_question: parsed.clarification_question || null,
    };

    // Strip undefined entity keys to keep the response clean
    for (const key of Object.keys(result.entities) as Array<keyof SlackConversationalEntities>) {
      if (result.entities[key] === undefined) {
        delete result.entities[key];
      }
    }

    return { result, inputTokens, outputTokens };
  } catch (err) {
    console.error('[route-message] Failed to parse AI classification response, falling back to regex:', err);
    return { result: classifySlackWithRegex(message), inputTokens: 0, outputTokens: 0 };
  }
}

// =============================================================================
// Default routing pipeline — Intent Classification → Sequence/Skill/Semantic/General
// =============================================================================

type DefaultIntentType =
  | 'sequence_trigger'
  | 'skill_trigger'
  | 'semantic_match'
  | 'general';

interface DefaultRouteResult {
  intent: DefaultIntentType;
  confidence: number;
  matched_id?: string;
  matched_name?: string;
  context?: Record<string, unknown>;
}

/**
 * Main routing pipeline for non-slack-conversational messages.
 *
 * Steps:
 *   1. Sequence trigger matching (keyword / regex patterns from DB)
 *   2. Skill trigger matching (keyword / regex patterns from DB)
 *   3. Semantic fallback (embedding cosine similarity, if supported)
 *   4. General fallthrough
 */
async function runDefaultRoutingPipeline(
  message: string,
  userId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
  context?: Record<string, unknown>,
): Promise<DefaultRouteResult> {
  const lower = message.toLowerCase().trim();

  // ── Step 1: Sequence trigger matching ──────────────────────────────────────
  try {
    const { data: sequences } = await supabase
      .from('sequences')
      .select('id, name, trigger_keywords')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .not('trigger_keywords', 'is', null)
      .limit(50);

    if (sequences && sequences.length > 0) {
      for (const seq of sequences) {
        const keywords: string[] = Array.isArray(seq.trigger_keywords)
          ? seq.trigger_keywords
          : [];
        for (const kw of keywords) {
          if (typeof kw === 'string' && lower.includes(kw.toLowerCase())) {
            return {
              intent: 'sequence_trigger',
              confidence: 0.85,
              matched_id: seq.id,
              matched_name: seq.name,
            };
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal — continue pipeline
    console.warn('[route-message] Sequence trigger check failed:', err);
  }

  // ── Step 2: Skill trigger matching ─────────────────────────────────────────
  try {
    const { data: skills } = await supabase
      .from('organization_skills')
      .select('id, name, trigger_keywords')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .not('trigger_keywords', 'is', null)
      .limit(100);

    if (skills && skills.length > 0) {
      for (const skill of skills) {
        const keywords: string[] = Array.isArray(skill.trigger_keywords)
          ? skill.trigger_keywords
          : [];
        for (const kw of keywords) {
          if (typeof kw === 'string' && lower.includes(kw.toLowerCase())) {
            return {
              intent: 'skill_trigger',
              confidence: 0.8,
              matched_id: skill.id,
              matched_name: skill.name,
            };
          }
        }
      }
    }
  } catch (err) {
    // Non-fatal — continue pipeline
    console.warn('[route-message] Skill trigger check failed:', err);
  }

  // ── Step 3: Semantic fallback ───────────────────────────────────────────────
  // Placeholder: embedding-based similarity matching can be wired here.
  // For now this step is a no-op and falls through to general.

  // ── Step 4: General fallthrough ────────────────────────────────────────────
  return { intent: 'general', confidence: 0.3, context };
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', req, 405);
    }

    const body: RouteMessageRequest = await req.json();

    // Basic validation
    if (!body.message || !body.user_id || !body.org_id) {
      return errorResponse('Missing required fields: message, user_id, org_id', req, 400);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Server configuration error', req, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let userId: string;
    let orgId: string;

    if (isServiceRole) {
      userId = body.user_id;
      orgId = body.org_id;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
      userId = user.id;

      // Verify the requested user_id matches the authenticated user
      if (body.user_id !== userId) {
        return errorResponse('user_id mismatch', req, 403);
      }

      // Verify org membership
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .eq('org_id', body.org_id)
        .maybeSingle();

      if (!membership) {
        return errorResponse('User not a member of the specified organization', req, 403);
      }
      orgId = membership.org_id;
    }

    // ── Slack conversational path ─────────────────────────────────────────────
    if (body.source === 'slack_conversational') {
      const slackBody = body as SlackConversationalRequest;

      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        // No key — fall straight to regex classification without error
        console.warn('[route-message] ANTHROPIC_API_KEY not set; using regex fallback for slack_conversational');
        const result = classifySlackWithRegex(slackBody.message);
        return jsonResponse({ source: 'slack_conversational', ...result }, req);
      }

      const { result, inputTokens, outputTokens } = await classifySlackConversational(
        slackBody.message,
        slackBody.thread_summary || '',
        anthropicKey,
      );

      // Best-effort cost tracking — non-fatal if it fails
      try {
        await logAICostEvent(
          supabase,
          userId,
          orgId,
          'anthropic',
          'claude-haiku-4-5-20251001',
          inputTokens,
          outputTokens,
          'route-message/slack_conversational',
          { intent: result.intent },
        );
      } catch {
        // Non-critical
      }

      return jsonResponse({ source: 'slack_conversational', ...result }, req);
    }

    // ── Default routing pipeline ──────────────────────────────────────────────
    const defaultBody = body as DefaultRouteRequest;
    const result = await runDefaultRoutingPipeline(
      defaultBody.message,
      userId,
      orgId,
      supabase,
      defaultBody.context,
    );

    return jsonResponse({ source: 'default', ...result }, req);
  } catch (error) {
    console.error('[route-message] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req, 500,
    );
  }
});
