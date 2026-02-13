/**
 * Detect Intents Edge Function
 *
 * Analyzes meeting transcripts to detect commitments, buying signals, and follow-up items.
 * Uses Claude Haiku for structured intent extraction with confidence scoring.
 *
 * POST /detect-intents
 * Body: {
 *   transcript: string;
 *   org_context: { org_name: string; products: Array<{ name: string; description: string }> };
 *   attendees: string[];
 *   rep_name: string;
 *   meeting_id?: string;
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

interface DetectIntentsRequest {
  transcript: string;
  org_context: {
    org_name: string;
    products?: Array<{ name: string; description: string }>;
  };
  attendees: string[];
  rep_name: string;
  meeting_id?: string;
}

interface Commitment {
  speaker: 'rep' | 'prospect';
  phrase: string;
  intent: 'send_proposal' | 'schedule_meeting' | 'send_content' | 'general';
  confidence: number;
}

interface BuyingSignal {
  type: 'positive' | 'negative' | 'neutral';
  signal: 'budget' | 'timeline' | 'authority' | 'need' | 'champion' | 'competition';
  phrase: string;
  confidence: number;
}

interface FollowUpItem {
  owner: 'rep' | 'prospect';
  action: string;
  deadline?: string;
  intent_type?: string;
}

interface IntentDetectionResult {
  commitments: Commitment[];
  buying_signals: BuyingSignal[];
  follow_up_items: FollowUpItem[];
  meeting_id?: string;
}

// =============================================================================
// Intent Detection Prompt
// =============================================================================

function buildIntentPrompt(req: DetectIntentsRequest): string {
  const productsText = req.org_context.products?.length
    ? `\nOur products: ${req.org_context.products.map(p => `${p.name} (${p.description})`).join(', ')}`
    : '';

  return `Analyze this meeting transcript for commitments, requests, and buying signals.

Context:
- Our company: ${req.org_context.org_name}${productsText}
- Our rep: ${req.rep_name}
- Meeting attendees: ${req.attendees.join(', ')}

Transcript:
${req.transcript}

Return JSON with the following structure:
{
  "commitments": [
    {
      "speaker": "rep|prospect",
      "phrase": "exact quote from transcript",
      "intent": "send_proposal|schedule_meeting|send_content|general",
      "confidence": 0.0-1.0
    }
  ],
  "buying_signals": [
    {
      "type": "positive|negative|neutral",
      "signal": "budget|timeline|authority|need|champion|competition",
      "phrase": "exact quote from transcript",
      "confidence": 0.0-1.0
    }
  ],
  "follow_up_items": [
    {
      "owner": "rep|prospect",
      "action": "description of action item",
      "deadline": "if mentioned explicitly (e.g., 'by Friday')",
      "intent_type": "send_proposal|schedule_meeting|send_content if applicable"
    }
  ]
}

IMPORTANT:
- Only include items with confidence > 0.7
- "phrase" must be exact quotes from the transcript
- "speaker" should be "rep" if it's ${req.rep_name}, "prospect" otherwise
- For buying signals, use MEDDICC categories: budget, timeline, authority, need, champion, competition
- Commitments should map to concrete intents when possible (send_proposal, schedule_meeting, send_content)
- Return valid JSON only, no markdown code blocks`;
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Validate request
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', req, 405);
    }

    // Parse body
    const body: DetectIntentsRequest = await req.json();
    const { transcript, org_context, attendees, rep_name, meeting_id } = body;

    // Validate required fields
    if (!transcript || !org_context?.org_name || !attendees?.length || !rep_name) {
      return errorResponse(
        'Missing required fields: transcript, org_context.org_name, attendees, rep_name',
        req,
        400
      );
    }

    // Get auth context
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

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // Get user's org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const orgId = membership?.org_id;
    if (!orgId) {
      return errorResponse('User not associated with any organization', req, 403);
    }

    // Build prompt
    const prompt = buildIntentPrompt(body);

    // Call Anthropic API
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return errorResponse('AI service not configured', req, 500);
    }

    console.log('[detect-intents] Calling Anthropic API...');
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text().catch(() => '');
      console.error('[detect-intents] Anthropic API error:', errorText);
      return errorResponse('AI service error', req, 500);
    }

    const anthropicData = await anthropicResponse.json();

    // Extract usage for cost tracking
    const usage = extractAnthropicUsage(anthropicData);

    // Track cost
    await logAICostEvent(
      supabase,
      user.id,
      orgId,
      'anthropic',
      'claude-haiku-4-5-20251001',
      usage.inputTokens,
      usage.outputTokens,
      'detect-intents',
      { meeting_id }
    );

    // Parse AI response
    const content = anthropicData.content?.[0]?.text || '';
    if (!content) {
      console.error('[detect-intents] No content in AI response');
      return errorResponse('AI service returned empty response', req, 500);
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n');
      jsonText = lines.slice(1, -1).join('\n');
      if (jsonText.startsWith('json')) {
        jsonText = jsonText.substring(4).trim();
      }
    }

    let result: IntentDetectionResult;
    try {
      const parsed = JSON.parse(jsonText);
      result = {
        commitments: parsed.commitments || [],
        buying_signals: parsed.buying_signals || [],
        follow_up_items: parsed.follow_up_items || [],
        meeting_id,
      };
    } catch (parseError) {
      console.error('[detect-intents] Failed to parse AI response:', content);
      return errorResponse('Failed to parse AI response', req, 500);
    }

    console.log('[detect-intents] Success:', {
      commitments: result.commitments.length,
      buying_signals: result.buying_signals.length,
      follow_up_items: result.follow_up_items.length,
    });

    return jsonResponse(result, req);
  } catch (error) {
    console.error('[detect-intents] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
