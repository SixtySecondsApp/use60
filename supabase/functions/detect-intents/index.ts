/**
 * Detect Intents Edge Function
 *
 * Analyzes meeting transcripts to detect commitments, buying signals, and follow-up items.
 * Uses Claude Haiku for structured intent extraction with confidence scoring.
 *
 * Accepts enriched context from the orchestrator adapter:
 * - Attendees with titles, companies, and buyer/seller sides
 * - Deal context (stage, value, close date)
 * - Contact information and relationship history
 * - Call type classification
 *
 * POST /detect-intents
 * Body: {
 *   transcript: string;
 *   org_context: { org_name: string; products: Array<{ name: string; description: string }> };
 *   attendees: Array<string | { name: string; role?: string; company?: string; side?: string }>;
 *   rep_name: string;
 *   meeting_id?: string;
 *   enriched_context?: { contact, relationship_history, deal_context, call_type };
 * }
 *
 * Returns: IntentDetectionResult with commitments, buying_signals, follow_up_items
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// =============================================================================
// Types
// =============================================================================

interface AttendeeObject {
  name: string;
  email?: string;
  role?: string;
  company?: string;
  side?: string;
}

interface DetectIntentsRequest {
  transcript: string;
  org_context: {
    org_name: string;
    products?: Array<{ name: string; description: string }>;
  };
  attendees: Array<string | AttendeeObject>;
  rep_name: string;
  meeting_id?: string;
  user_id?: string;
  org_id?: string;
  enriched_context?: {
    contact?: string;
    relationship_history?: string;
    deal_context?: {
      id?: string;
      name: string;
      stage: string;
      value?: number;
      close_date?: string;
      probability?: number;
    };
    call_type?: any;
  };
}

interface Commitment {
  speaker: 'rep' | 'prospect';
  speaker_side?: 'seller' | 'buyer';
  phrase: string;
  source_quote?: string;
  intent: 'send_proposal' | 'schedule_meeting' | 'send_content' | 'check_with_team' | 'pricing_request' | 'stakeholder_introduction' | 'competitive_mention' | 'timeline_signal' | 'objection_blocker' | 'general';
  action_type?: string;
  confidence: number;
  confidence_tier?: 'explicit' | 'strong_implied' | 'weak_implied';
  deadline?: string;
  deadline_parsed?: string; // ISO 8601 date parsed from natural language deadline
  context?: string;
}

interface BuyingSignal {
  type: 'positive' | 'negative' | 'neutral';
  signal: 'budget' | 'timeline' | 'authority' | 'need' | 'champion' | 'competition';
  meddicc_category?: string;
  phrase: string;
  confidence: number;
  strength?: number;
  interpretation?: string;
}

interface FollowUpItem {
  owner: 'rep' | 'prospect';
  action: string;
  deadline?: string;
  intent_type?: string;
  priority?: string;
}

interface IntentDetectionResult {
  commitments: Commitment[];
  buying_signals: BuyingSignal[];
  follow_up_items: FollowUpItem[];
  executive_summary?: string;
  meeting_id?: string;
}

// =============================================================================
// Intent Detection Prompt — enriched with deal/contact/relationship context
// =============================================================================

function buildIntentPrompt(req: DetectIntentsRequest): string {
  const productsText = req.org_context.products?.length
    ? `\nOur products/services:\n${req.org_context.products.map(p => `  - ${p.name}: ${p.description}`).join('\n')}`
    : '';

  // Format attendees — support both string and object formats
  const attendeesText = req.attendees.map(a => {
    if (typeof a === 'string') return `  - ${a}`;
    const parts = [a.name];
    if (a.role) parts.push(`(${a.role})`);
    if (a.company) parts.push(`at ${a.company}`);
    if (a.side) parts.push(`[${a.side}]`);
    return `  - ${parts.join(' ')}`;
  }).join('\n');

  // Build enriched context sections
  const contextSections: string[] = [];

  if (req.enriched_context?.deal_context) {
    const deal = req.enriched_context.deal_context;
    const parts = [`Deal: "${deal.name}" — Stage: ${deal.stage}`];
    if (deal.value) parts.push(`Value: $${deal.value.toLocaleString()}`);
    if (deal.close_date) parts.push(`Close: ${deal.close_date}`);
    if (deal.probability) parts.push(`Probability: ${deal.probability}%`);
    contextSections.push(`\n## DEAL CONTEXT\n${parts.join(', ')}\nUse the deal stage to calibrate buying signal strength — signals mean different things at different stages.`);
  }

  if (req.enriched_context?.contact) {
    contextSections.push(`\n## PRIMARY CONTACT\n${req.enriched_context.contact}`);
  }

  if (req.enriched_context?.relationship_history) {
    contextSections.push(`\n## RELATIONSHIP HISTORY\n${req.enriched_context.relationship_history}\nUse this to detect unfulfilled prior commitments and track engagement momentum.`);
  }

  if (req.enriched_context?.call_type) {
    const ct = req.enriched_context.call_type;
    const typeLabel = ct.call_type || ct.classification || ct.type || 'unknown';
    contextSections.push(`\n## CALL CLASSIFICATION\nType: ${typeLabel}\nAdjust commitment and signal expectations based on the call type (discovery vs demo vs negotiation).`);
  }

  return `Analyze this meeting transcript to extract commitments, buying signals (MEDDICC), and follow-up items. Every detected intent should map to a concrete automation action.

## CONTEXT
- Our company: ${req.org_context.org_name}${productsText}
- Our rep: ${req.rep_name}
- Attendees:
${attendeesText}
${contextSections.join('\n')}

## TRANSCRIPT
${req.transcript}

## TODAY'S DATE
${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Use this to resolve relative dates like "by Friday", "next week", "end of month".

## ANALYSIS INSTRUCTIONS

### 1. COMMITMENTS
Detect explicit and implied promises. Classify by confidence tier:
- **Explicit (0.9+)**: "I will send you the proposal by Friday" — clear action, owner, often with deadline
- **Strong Implied (0.75-0.89)**: "Let me get that over to you" — implied promise, may lack deadline
- **Weak Implied (0.5-0.74)**: "I'll try to get that done" — effort, not guarantee. Report but do NOT map to automation.

Map each commitment to an intent type:
- **send_proposal**: "I'll send you a proposal", "Let me put together pricing", "You'll have the quote by Friday"
- **schedule_meeting**: "Let's schedule a follow-up", "We should set up a technical review", "I'll send a calendar invite"
- **send_content**: "I'll send over the case study", "Let me share that whitepaper", "I'll email you the deck"
- **check_with_team**: "Let me check with our technical team", "I'll run this by engineering", "I need to talk to our security team about that"
- **pricing_request**: "Can you send over pricing?", "What would this cost for our team?", "We need to see numbers before moving forward"
- **stakeholder_introduction**: "I need to loop in our CTO", "Let me get Sarah from legal involved", "We should bring in the procurement team"
- **competitive_mention**: "We're also evaluating [competitor]", "Your competitor offered us X", "How do you compare to [competitor]?"
- **timeline_signal**: "We need this live by Q2", "Budget expires end of March", "Our contract with [incumbent] ends in June"
- **objection_blocker**: "Security is a major concern for us", "We'd need SOC 2 compliance", "Our team is worried about the migration"
- **general**: Any other commitment that doesn't fit the above categories
Speaker is "rep" if it's ${req.rep_name}, "prospect" otherwise.

### 2. BUYING SIGNALS (MEDDICC)
Score signals from -1.0 (strong negative) to +1.0 (strong positive):
- **Metrics (M)**: Prospect quantifies pain, states ROI expectations, shares success criteria
- **Economic Buyer (E)**: Budget authority present/absent, budget confirmed/ambiguous
- **Decision Criteria (D1)**: Specific requirements shared, evaluation matrix discussed
- **Decision Process (D2)**: Clear timeline, next steps defined, decision date committed
- **Identify Pain (I)**: Pain is urgent and quantified vs vague and deprioritized
- **Champion (C1)**: Champion actively selling internally vs passive/hedging
${req.enriched_context?.deal_context ? `\nContext: This deal is at "${req.enriched_context.deal_context.stage}" stage. Calibrate signal importance accordingly.` : ''}

### 3. FOLLOW-UP ITEMS
Extract actions from: commitments, buying signal gaps, explicit next steps, unanswered questions.
Prioritize: P0 (same day, deal-critical), P1 (24h), P2 (1 week), P3 (before next meeting).

Return JSON with the following structure (no markdown code blocks):
{
  "executive_summary": "3-5 sentence summary: key commitments, overall signal assessment, most urgent follow-ups",
  "commitments": [
    {
      "speaker": "rep|prospect",
      "phrase": "exact quote from transcript",
      "intent": "send_proposal|schedule_meeting|send_content|check_with_team|pricing_request|stakeholder_introduction|competitive_mention|timeline_signal|objection_blocker|general",
      "confidence": 0.0-1.0,
      "confidence_tier": "explicit|strong_implied|weak_implied",
      "deadline": "if mentioned (e.g., 'by Friday', 'end of day Thursday')",
      "deadline_parsed": "ISO 8601 date if deadline can be parsed (e.g., '2026-02-21T17:00:00'), null otherwise. Parse relative dates like 'by Friday' or 'end of day Thursday' relative to today's date.",
      "context": "brief context of what prompted this commitment"
    }
  ],
  "buying_signals": [
    {
      "type": "positive|negative|neutral",
      "signal": "budget|timeline|authority|need|champion|competition",
      "phrase": "exact quote from transcript",
      "confidence": 0.0-1.0,
      "strength": -1.0 to 1.0,
      "interpretation": "what this signal means for the deal"
    }
  ],
  "follow_up_items": [
    {
      "owner": "rep|prospect",
      "action": "description of action item",
      "deadline": "if mentioned",
      "intent_type": "send_proposal|schedule_meeting|send_content|check_with_team|pricing_request|stakeholder_introduction|competitive_mention|timeline_signal|objection_blocker if applicable",
      "priority": "P0|P1|P2|P3"
    }
  ]
}

IMPORTANT:
- Only include commitments with confidence >= 0.5 (report weak ones but note they are weak)
- "phrase" must be exact quotes from the transcript — no paraphrasing
- "speaker" should be "rep" if it's ${req.rep_name}, "prospect" otherwise
- For buying signals, use MEDDICC categories and include a brief interpretation
- Commitments should map to concrete intents when possible
- Include an executive_summary covering: key commitments, signal assessment, most urgent action
- Return valid JSON only, no markdown code blocks`;
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

    const body: DetectIntentsRequest = await req.json();
    const { transcript, org_context, attendees, rep_name, meeting_id } = body;

    if (!transcript || !org_context?.org_name || !attendees?.length || !rep_name) {
      return errorResponse(
        'Missing required fields: transcript, org_context.org_name, attendees, rep_name',
        req, 400,
      );
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing Authorization header', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      return errorResponse('Server configuration error', req, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseKey;

    let userId: string;
    let orgId: string;

    if (isServiceRole) {
      userId = body.user_id || '';
      orgId = body.org_id || '';
      if (!userId || !orgId) {
        return errorResponse('Service role calls must include user_id and org_id', req, 400);
      }
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
      userId = user.id;

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      orgId = membership?.org_id || '';
      if (!orgId) {
        return errorResponse('User not associated with any organization', req, 403);
      }
    }

    // Build prompt
    const prompt = buildIntentPrompt(body);

    // Call Anthropic API
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return errorResponse('AI service not configured', req, 500);
    }

    console.log('[detect-intents] Calling Anthropic API with enriched context...');
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text().catch(() => '');
      console.error('[detect-intents] Anthropic API error:', errorText);
      return errorResponse('AI service error', req, 500);
    }

    const anthropicData = await anthropicResponse.json();

    // Cost tracking
    const usage = extractAnthropicUsage(anthropicData);
    await logAICostEvent(
      supabase, userId, orgId,
      'anthropic', 'claude-haiku-4-5-20251001',
      usage.inputTokens, usage.outputTokens,
      'detect-intents',
      { meeting_id },
    );

    // Parse AI response
    const content = anthropicData.content?.[0]?.text || '';
    const stopReason = anthropicData.stop_reason;

    if (!content) {
      console.error('[detect-intents] No content in AI response');
      return errorResponse('AI service returned empty response', req, 500);
    }

    if (stopReason === 'max_tokens') {
      console.warn('[detect-intents] Response was truncated (max_tokens reached)');
    }

    // Extract JSON robustly — handle code blocks, surrounding text, truncation
    let jsonText = content.trim();
    // Strip markdown code fences if present
    const codeFenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) {
      jsonText = codeFenceMatch[1].trim();
    }
    // Fallback: extract the outermost JSON object
    const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
    }

    let result: IntentDetectionResult;
    try {
      const parsed = JSON.parse(jsonText);
      result = {
        commitments: parsed.commitments || [],
        buying_signals: parsed.buying_signals || [],
        follow_up_items: parsed.follow_up_items || [],
        executive_summary: parsed.executive_summary,
        meeting_id,
      };
    } catch (parseError) {
      // Attempt to repair truncated JSON by closing open arrays/objects
      console.warn('[detect-intents] JSON parse failed, attempting repair. Stop reason:', stopReason);
      try {
        let repaired = jsonText;
        // Close any unclosed strings
        const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
        if (quoteCount % 2 !== 0) repaired += '"';
        // Close any unclosed arrays and objects
        const opens = (repaired.match(/[\[{]/g) || []).length;
        const closes = (repaired.match(/[\]}]/g) || []).length;
        for (let i = 0; i < opens - closes; i++) {
          // Check what needs closing by scanning from the end
          const lastOpen = Math.max(repaired.lastIndexOf('['), repaired.lastIndexOf('{'));
          const lastClose = Math.max(repaired.lastIndexOf(']'), repaired.lastIndexOf('}'));
          if (lastOpen > lastClose) {
            repaired += repaired[lastOpen] === '[' ? ']' : '}';
          } else {
            repaired += '}';
          }
        }
        const parsed = JSON.parse(repaired);
        result = {
          commitments: parsed.commitments || [],
          buying_signals: parsed.buying_signals || [],
          follow_up_items: parsed.follow_up_items || [],
          executive_summary: parsed.executive_summary,
          meeting_id,
        };
        console.log('[detect-intents] JSON repair succeeded');
      } catch {
        console.error('[detect-intents] JSON repair also failed. Raw content (first 500 chars):', content.substring(0, 500));
        // Return partial result instead of failing completely
        result = {
          commitments: [],
          buying_signals: [],
          follow_up_items: [],
          executive_summary: 'Intent detection failed to parse AI response — results may be incomplete.',
          meeting_id,
        };
      }
    }

    console.log('[detect-intents] Success:', {
      commitments: result.commitments.length,
      buying_signals: result.buying_signals.length,
      follow_up_items: result.follow_up_items.length,
      has_summary: !!result.executive_summary,
    });

    return jsonResponse(result, req);
  } catch (error) {
    console.error('[detect-intents] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req, 500,
    );
  }
});
