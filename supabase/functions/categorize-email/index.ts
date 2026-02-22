/**
 * Edge Function: Categorize Email with AI
 *
 * Uses Claude to categorize emails into Fyxer-style categories:
 * - to_respond: Emails requiring a reply
 * - fyi: Informational, low urgency
 * - marketing: Newsletters, promotions
 * - calendar_related: Calendar invites/updates
 * - automated: Receipts, notifications
 * 
 * Also extracts sales signals for the Slack assistant.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { captureException } from '../_shared/sentryEdge.ts';
import { checkCreditBalance, logAICostEvent } from '../_shared/costTracking.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================================================
// Types
// ============================================================================

interface CategorizationRequest {
  messageId: string;
  subject: string;
  body: string;
  from: string;
  labels?: string[];
  direction?: 'inbound' | 'outbound';
  threadId?: string;
  userId?: string; // For service-role calls
}

interface CategorizationResult {
  category: 'to_respond' | 'fyi' | 'marketing' | 'calendar_related' | 'automated' | 'uncategorized';
  confidence: number;
  signals: {
    response_required: boolean;
    urgency: 'low' | 'medium' | 'high';
    sentiment?: number;
    keywords: string[];
    action_items?: string[];
    is_sales_related: boolean;
    follow_up_suggested?: string;
    ghost_risk?: boolean;
  };
  reasoning?: string;
}

// ============================================================================
// AI Categorization Prompt
// ============================================================================

const CATEGORIZATION_SYSTEM_PROMPT = `You are an expert email categorization assistant for a sales CRM. Your task is to categorize incoming emails into one of these categories:

1. **to_respond** - Emails that require a direct reply from the user. Examples:
   - Questions from prospects or customers
   - Meeting requests that need confirmation
   - Follow-up emails waiting for response
   - Emails with explicit questions or asks

2. **fyi** - Informational emails that don't need a reply but may be worth reading. Examples:
   - Status updates
   - Shared documents or reports
   - CC'd emails
   - Updates that don't require action

3. **marketing** - Promotional or newsletter emails. Examples:
   - Newsletters and digests
   - Product promotions
   - Cold outreach from vendors
   - Marketing campaigns

4. **calendar_related** - Calendar invites and scheduling. Examples:
   - Meeting invitations
   - Event RSVPs
   - Calendar updates/cancellations
   - Scheduling confirmations

5. **automated** - System-generated emails. Examples:
   - Order confirmations and receipts
   - Password resets
   - Shipping notifications
   - Automated alerts

For sales emails, also identify:
- Whether it's a sales opportunity or customer communication
- Urgency level (low/medium/high)
- If the sender might be ghosting (e.g., delayed response after proposals)
- Suggested follow-up timing

Respond ONLY with valid JSON in this exact format:
{
  "category": "to_respond" | "fyi" | "marketing" | "calendar_related" | "automated" | "uncategorized",
  "confidence": 0.0 to 1.0,
  "signals": {
    "response_required": true/false,
    "urgency": "low" | "medium" | "high",
    "sentiment": -1.0 to 1.0 (optional),
    "keywords": ["keyword1", "keyword2"],
    "action_items": ["action 1", "action 2"] (optional),
    "is_sales_related": true/false,
    "follow_up_suggested": "e.g., 2 days" (optional),
    "ghost_risk": true/false (optional)
  },
  "reasoning": "Brief explanation of categorization"
}`;

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Parse request
    const body: CategorizationRequest = await req.json();
    
    if (!body.subject && !body.body) {
      return errorResponse('Email subject or body is required', req, 400);
    }

    // Authenticate
    const { userId } = await authenticateRequest(
      req,
      supabase,
      SUPABASE_SERVICE_ROLE_KEY,
      body.userId
    );

    // Get org for credit check
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()
    const orgId = membership?.org_id ?? null

    // Credit balance check (pre-flight, only when AI would be used)
    if (ANTHROPIC_API_KEY && orgId) {
      const balanceCheck = await checkCreditBalance(supabase, orgId)
      if (!balanceCheck.allowed) {
        return errorResponse('Insufficient credits. Please top up to continue.', req, 402)
      }
    }

    // Try AI categorization first, fall back to rules
    let result: CategorizationResult;
    
    if (ANTHROPIC_API_KEY) {
      try {
        result = await categorizeWithAI(body);
        // Log AI cost event after successful AI categorization
        if (orgId) {
          await logAICostEvent(
            supabase, userId, orgId, 'anthropic', 'claude-3-5-haiku-20241022',
            0, 0, 'task_execution'
          )
        }
      } catch (aiError: any) {
        console.error('[categorize-email] AI error, falling back to rules:', aiError.message);
        result = categorizeWithRules(body);
      }
    } else {
      result = categorizeWithRules(body);
    }

    // Store the categorization
    const { error: storeError } = await supabase
      .from('email_categorizations')
      .upsert({
        user_id: userId,
        external_id: body.messageId,
        thread_id: body.threadId,
        direction: body.direction || 'inbound',
        received_at: new Date().toISOString(),
        category: result.category,
        category_confidence: result.confidence,
        signals: result.signals,
        source: ANTHROPIC_API_KEY ? 'ai' : 'rules',
        gmail_label_applied: false,
        processed_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,external_id',
      });

    if (storeError) {
      console.error('[categorize-email] Store error:', storeError);
    }

    return jsonResponse({
      success: true,
      ...result,
      stored: !storeError,
    }, req);

  } catch (error: any) {
    console.error('[categorize-email] Error:', error);
    await captureException(error, {
      tags: {
        function: 'categorize-email',
        integration: 'anthropic',
      },
    });
    return errorResponse(error.message || 'Categorization failed', req, 500);
  }
});

// ============================================================================
// AI Categorization
// ============================================================================

async function categorizeWithAI(request: CategorizationRequest): Promise<CategorizationResult> {
  const userPrompt = `Categorize this email:

From: ${request.from}
Subject: ${request.subject}
Direction: ${request.direction || 'inbound'}
Gmail Labels: ${(request.labels || []).join(', ') || 'none'}

Body:
${(request.body || '').substring(0, 2000)}

Respond with JSON only.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.1,
      system: CATEGORIZATION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    category: parsed.category || 'uncategorized',
    confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
    signals: {
      response_required: Boolean(parsed.signals?.response_required),
      urgency: parsed.signals?.urgency || 'low',
      sentiment: parsed.signals?.sentiment,
      keywords: parsed.signals?.keywords || [],
      action_items: parsed.signals?.action_items,
      is_sales_related: Boolean(parsed.signals?.is_sales_related),
      follow_up_suggested: parsed.signals?.follow_up_suggested,
      ghost_risk: parsed.signals?.ghost_risk,
    },
    reasoning: parsed.reasoning,
  };
}

// ============================================================================
// Rule-Based Categorization (Fallback)
// ============================================================================

function categorizeWithRules(request: CategorizationRequest): CategorizationResult {
  const subject = (request.subject || '').toLowerCase();
  const from = (request.from || '').toLowerCase();
  const body = (request.body || '').toLowerCase();
  const labels = (request.labels || []).map(l => l.toLowerCase());

  const signals = {
    response_required: false,
    urgency: 'low' as const,
    keywords: [] as string[],
    is_sales_related: false,
    sentiment: 0,
  };

  // Marketing detection
  const marketingPatterns = [
    'unsubscribe', 'newsletter', 'promo', 'sale', 'discount',
    'marketing', 'noreply', 'no-reply', 'mailchimp', 'hubspot',
    'sendgrid', 'campaign', 'offer',
  ];
  
  if (marketingPatterns.some(p => subject.includes(p) || from.includes(p))) {
    signals.keywords.push('marketing');
    return {
      category: 'marketing',
      confidence: 0.85,
      signals: { ...signals, response_required: false, urgency: 'low' },
    };
  }

  // Calendar detection
  const calendarPatterns = [
    'invitation', 'invite', 'calendar', 'meeting request',
    'rsvp', 'accepted:', 'declined:', 'tentative:',
  ];
  
  if (calendarPatterns.some(p => subject.includes(p)) || 
      labels.includes('category_updates')) {
    signals.keywords.push('calendar');
    return {
      category: 'calendar_related',
      confidence: 0.9,
      signals: { ...signals, response_required: false, urgency: 'low' },
    };
  }

  // Automated detection
  const automatedPatterns = [
    'receipt', 'confirmation', 'order', 'invoice', 'payment',
    'shipping', 'delivery', 'notification', 'alert',
  ];
  
  if (automatedPatterns.some(p => subject.includes(p)) ||
      from.includes('noreply') || from.includes('notifications@')) {
    signals.keywords.push('automated');
    return {
      category: 'automated',
      confidence: 0.8,
      signals: { ...signals, response_required: false, urgency: 'low' },
    };
  }

  // Response required detection
  const responsePatterns = [
    'urgent', 'asap', 'please respond', 'please reply',
    'action required', 'quick question', 'thoughts?',
    'can you', 'would you', 'could you',
  ];
  
  if (request.direction !== 'outbound' && 
      (responsePatterns.some(p => subject.includes(p) || body.includes(p)) ||
       subject.includes('?'))) {
    signals.response_required = true;
    signals.urgency = subject.includes('urgent') || subject.includes('asap') ? 'high' : 'medium';
    signals.keywords.push('needs_response');
    return {
      category: 'to_respond',
      confidence: 0.75,
      signals,
    };
  }

  // Default
  if (request.direction !== 'outbound') {
    return {
      category: 'fyi',
      confidence: 0.5,
      signals,
    };
  }

  return {
    category: 'uncategorized',
    confidence: 0.3,
    signals,
  };
}

