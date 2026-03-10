// supabase/functions/email-classify/index.ts
// WS-018: Email Classification Pipeline
//
// Classifies unprocessed emails using Haiku 4.5 with prompt caching.
// Pro only — gated by tier check in background job dispatcher.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CLASSIFICATION_SYSTEM_PROMPT = `You are an email classification assistant for a sales CRM.
Classify the email into exactly one intent category and provide metadata.

Intent categories:
- buying_signal: Expresses interest in purchasing, asks for pricing, demo, or trial
- objection: Raises concerns about price, timing, competition, or fit
- question: Asks a question that needs a response
- scheduling: Requests to schedule, reschedule, or cancel a meeting
- follow_up_needed: Implies the sender expects a response or action
- ooo_auto_reply: Out of office or vacation auto-reply
- newsletter: Marketing newsletter or bulk email
- notification: Automated notification from a service
- personal: Personal/non-business email
- other: Doesn't fit any category

Respond with JSON only:
{
  "intent": "<category>",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "low" | "medium" | "high",
  "deal_relevance": <0-100>,
  "tags": ["<relevant tags>"],
  "summary": "<1-sentence summary>"
}`;

interface ClassifyRequest {
  messageId: string;
  subject: string;
  body: string;
  from: string;
  labels?: string[];
  direction?: 'inbound' | 'outbound';
  threadId?: string;
  userId?: string;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string | undefined;
    try {
      const auth = await authenticateRequest(req, supabase);
      userId = auth.userId;
    } catch {
      // Allow service-role calls without user auth
    }

    const body: ClassifyRequest = await req.json();
    if (!body.userId) body.userId = userId;

    // Get Anthropic API key from user settings or env
    let anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';
    if (!anthropicKey && body.userId) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('ai_provider_keys')
        .eq('user_id', body.userId)
        .maybeSingle();
      anthropicKey = (settings?.ai_provider_keys as Record<string, string>)?.anthropic || '';
    }

    if (!anthropicKey) {
      return errorResponse('No Anthropic API key configured', 400, corsHeaders);
    }

    // Classify with Haiku 4.5
    const userMessage = [
      `From: ${body.from}`,
      `Subject: ${body.subject}`,
      `Direction: ${body.direction || 'inbound'}`,
      body.labels?.length ? `Labels: ${body.labels.join(', ')}` : '',
      '',
      body.body.slice(0, 2000), // Limit body to 2000 chars
    ].filter(Boolean).join('\n');

    const classifyResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: [
          {
            type: 'text',
            text: CLASSIFICATION_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!classifyResponse.ok) {
      const err = await classifyResponse.json().catch(() => ({}));
      console.error('[email-classify] Haiku API error:', err);

      // Fallback: rule-based classification
      const classification = ruleBasedClassify(body);
      return jsonResponse({ ...classification, source: 'rule_based' }, corsHeaders);
    }

    const aiResult = await classifyResponse.json();
    const content = aiResult.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const classification = ruleBasedClassify(body);
      return jsonResponse({ ...classification, source: 'rule_based_fallback' }, corsHeaders);
    }

    const classification = JSON.parse(jsonMatch[0]);

    // Store classification if we have user context
    if (body.userId && body.messageId) {
      await supabase
        .from('email_messages')
        .update({ classification })
        .eq('user_id', body.userId)
        .eq('message_id', body.messageId);
    }

    return jsonResponse({
      ...classification,
      source: 'haiku_4_5',
      cached: aiResult.usage?.cache_read_input_tokens > 0,
    }, corsHeaders);
  } catch (error) {
    console.error('[email-classify] Error:', error);
    return errorResponse((error as Error).message, 500, corsHeaders);
  }
});

function ruleBasedClassify(email: ClassifyRequest): Record<string, unknown> {
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase();
  const combined = `${subject} ${body}`;

  if (/out of office|ooo|vacation|auto.?reply/i.test(combined)) {
    return { intent: 'ooo_auto_reply', sentiment: 'neutral', urgency: 'low', deal_relevance: 0, tags: ['auto-reply'], summary: 'Out of office auto-reply' };
  }
  if (/unsubscribe|newsletter|weekly digest/i.test(combined)) {
    return { intent: 'newsletter', sentiment: 'neutral', urgency: 'low', deal_relevance: 0, tags: ['newsletter'], summary: 'Newsletter or marketing email' };
  }
  if (/pricing|quote|proposal|contract|buy|purchase|demo/i.test(combined)) {
    return { intent: 'buying_signal', sentiment: 'positive', urgency: 'high', deal_relevance: 80, tags: ['buying-signal'], summary: 'Potential buying interest detected' };
  }
  if (/schedule|meeting|call|calendar|availability/i.test(combined)) {
    return { intent: 'scheduling', sentiment: 'neutral', urgency: 'medium', deal_relevance: 50, tags: ['scheduling'], summary: 'Meeting or scheduling request' };
  }
  if (/\?/.test(subject)) {
    return { intent: 'question', sentiment: 'neutral', urgency: 'medium', deal_relevance: 40, tags: ['question'], summary: 'Question requiring response' };
  }

  return { intent: 'other', sentiment: 'neutral', urgency: 'low', deal_relevance: 20, tags: [], summary: 'General email' };
}
