/**
 * agent-email-signals (SIG-003)
 *
 * Classifies email communication events into typed signals using rule-based
 * detection first, with a Claude Haiku LLM fallback for ambiguous cases.
 *
 * Modes:
 *   Single: { communication_event_id, org_id, user_id }
 *   Batch:  { org_id, since_hours: 1, user_id? }
 *
 * Auth: accepts CRON_SECRET (x-cron-secret header) or service-role Bearer token.
 * Deploy: npx supabase functions deploy agent-email-signals --project-ref <ref> --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import {
  handleCorsPreflightRequest,
  errorResponse,
  jsonResponse,
} from '../_shared/corsHelper.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

// Claude Haiku — cheap, fast, only used for ambiguous multi-signal cases
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

// Minimum confidence threshold to emit a signal
const MIN_CONFIDENCE = 0.4;

// =============================================================================
// Types
// =============================================================================

type EmailSignalType =
  | 'meeting_request'
  | 'pricing_question'
  | 'positive_buying_signal'
  | 'objection'
  | 'competitor_mention'
  | 'introduction_offer'
  | 'forward_detected'
  | 'silence_detected'
  | 'fast_reply'
  | 'slow_reply'
  | 'out_of_office'
  | 'new_cc_contact';

interface DetectedSignal {
  signal_type: EmailSignalType;
  confidence: number;
  context: string;
  metadata: Record<string, unknown>;
}

interface CommunicationEvent {
  id: string;
  org_id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  subject: string | null;
  body_preview: string | null;
  direction: 'inbound' | 'outbound' | null;
  sentiment_score: number | null;
  urgency: number | null;
  response_required: boolean | null;
  ghost_risk: number | null;
  is_sales_related: boolean | null;
  topics: string[] | null;
  occurred_at: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  thread_id: string | null;
}

interface EngagementPattern {
  avg_response_time_hours: number | null;
}

interface SingleInput {
  communication_event_id: string;
  org_id: string;
  user_id: string;
}

interface BatchInput {
  org_id: string;
  since_hours?: number;
  user_id?: string;
}

interface SignalResult {
  communication_event_id: string;
  signals_detected: number;
  signals: DetectedSignal[];
  used_llm: boolean;
  error?: string;
}

interface BatchResult {
  events_processed: number;
  total_signals_detected: number;
  results: SignalResult[];
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (
      !verifyCronSecret(req, cronSecret) &&
      !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));

    // Route to single or batch mode
    if (body.communication_event_id) {
      const input = body as SingleInput;
      console.log(`[agent-email-signals] Single mode: event=${input.communication_event_id}`);
      const result = await processEvent(supabase, input.communication_event_id, input.org_id, input.user_id);
      return jsonResponse(result, req);
    }

    if (body.org_id) {
      const input = body as BatchInput;
      const sinceHours = input.since_hours ?? 1;
      console.log(`[agent-email-signals] Batch mode: org=${input.org_id}, since_hours=${sinceHours}`);
      const result = await processBatch(supabase, input.org_id, sinceHours, input.user_id);
      return jsonResponse(result, req);
    }

    return errorResponse('Must provide communication_event_id (single) or org_id (batch)', req, 400);

  } catch (error) {
    console.error('[agent-email-signals] Fatal error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Batch processor
// =============================================================================

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  sinceHours: number,
  userId?: string,
): Promise<BatchResult> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('communication_events')
    .select('id, org_id, user_id, contact_id, deal_id')
    .eq('org_id', orgId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[agent-email-signals] Batch fetch error:', error.message);
    return { events_processed: 0, total_signals_detected: 0, results: [] };
  }

  const result: BatchResult = {
    events_processed: 0,
    total_signals_detected: 0,
    results: [],
  };

  for (const event of events ?? []) {
    result.events_processed++;
    const eventUserId = userId ?? event.user_id;
    const eventResult = await processEvent(supabase, event.id, orgId, eventUserId);
    result.total_signals_detected += eventResult.signals_detected;
    result.results.push(eventResult);
  }

  console.log(
    `[agent-email-signals] Batch complete: ${result.events_processed} events, ` +
    `${result.total_signals_detected} signals detected`
  );

  return result;
}

// =============================================================================
// Single event processor
// =============================================================================

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  communicationEventId: string,
  orgId: string,
  userId: string,
): Promise<SignalResult> {
  const result: SignalResult = {
    communication_event_id: communicationEventId,
    signals_detected: 0,
    signals: [],
    used_llm: false,
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Load the communication event
    // -------------------------------------------------------------------------
    const { data: event, error: eventError } = await supabase
      .from('communication_events')
      .select(
        'id, org_id, user_id, contact_id, deal_id, subject, body_preview, direction, ' +
        'sentiment_score, urgency, response_required, ghost_risk, is_sales_related, topics, ' +
        'occurred_at, to_emails, cc_emails, thread_id'
      )
      .eq('id', communicationEventId)
      .maybeSingle();

    if (eventError || !event) {
      console.warn(`[agent-email-signals] Event not found: ${communicationEventId}`);
      result.error = eventError?.message ?? 'Event not found';
      return result;
    }

    // -------------------------------------------------------------------------
    // 2. Load engagement pattern for response-time comparisons
    // -------------------------------------------------------------------------
    let avgResponseTimeHours: number | null = null;
    if (event.contact_id) {
      const { data: pattern } = await supabase
        .from('contact_engagement_patterns')
        .select('avg_response_time_hours')
        .eq('contact_id', event.contact_id)
        .eq('org_id', orgId)
        .maybeSingle() as { data: EngagementPattern | null };

      avgResponseTimeHours = pattern?.avg_response_time_hours ?? null;
    }

    // -------------------------------------------------------------------------
    // 3. Load existing dedup signals for this event (last 7 days)
    // -------------------------------------------------------------------------
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingSignals } = await supabase
      .from('email_signal_events')
      .select('signal_type')
      .eq('communication_event_id', communicationEventId)
      .gte('created_at', sevenDaysAgo);

    const existingTypes = new Set((existingSignals ?? []).map((s: { signal_type: string }) => s.signal_type));

    // -------------------------------------------------------------------------
    // 4. Rule-based classification
    // -------------------------------------------------------------------------
    const candidateSignals = classifyByRules(event, avgResponseTimeHours);

    // -------------------------------------------------------------------------
    // 4b. Async check: new_cc_contact (requires DB lookup)
    // -------------------------------------------------------------------------
    const ccSignal = await classifyNewCcContacts(supabase, event, orgId);
    if (ccSignal) candidateSignals.push(ccSignal);

    // -------------------------------------------------------------------------
    // 5. Determine if LLM disambiguation is needed
    //    Criteria: multiple overlapping high-confidence signals in ambiguous categories
    // -------------------------------------------------------------------------
    const needsLlm = shouldUseLlm(candidateSignals);

    let finalSignals = candidateSignals;

    if (needsLlm && ANTHROPIC_API_KEY) {
      console.log(`[agent-email-signals] LLM disambiguation for event=${communicationEventId}`);
      const llmResult = await disambiguateWithLlm(event, candidateSignals, userId, orgId, supabase);
      finalSignals = llmResult.signals;
      result.used_llm = true;
    }

    // -------------------------------------------------------------------------
    // 6. Filter below threshold and already-inserted signals
    // -------------------------------------------------------------------------
    const newSignals = finalSignals.filter(
      (s) => s.confidence >= MIN_CONFIDENCE && !existingTypes.has(s.signal_type)
    );

    if (newSignals.length === 0) {
      return result;
    }

    // -------------------------------------------------------------------------
    // 7. Write to email_signal_events
    // -------------------------------------------------------------------------
    const rows = newSignals.map((s) => ({
      org_id: orgId,
      user_id: userId,
      contact_id: event.contact_id ?? null,
      deal_id: event.deal_id ?? null,
      communication_event_id: communicationEventId,
      signal_type: s.signal_type,
      confidence: s.confidence,
      context: s.context,
      metadata: s.metadata,
    }));

    const { error: insertError } = await supabase
      .from('email_signal_events')
      .insert(rows);

    if (insertError) {
      // Dedup index violations are expected — skip them gracefully
      if (insertError.code === '23505') {
        console.info(`[agent-email-signals] Dedup conflict (expected) for event=${communicationEventId}`);
      } else {
        console.error(`[agent-email-signals] Insert error for event=${communicationEventId}:`, insertError.message);
        result.error = insertError.message;
      }
    }

    result.signals = newSignals;
    result.signals_detected = newSignals.length;

  } catch (err) {
    console.error(`[agent-email-signals] processEvent error for ${communicationEventId}:`, err);
    result.error = String(err);
  }

  return result;
}

// =============================================================================
// Rule-based classifier
// =============================================================================

function classifyByRules(
  event: CommunicationEvent,
  avgResponseTimeHours: number | null,
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const subject = (event.subject ?? '').toLowerCase();
  const body = (event.body_preview ?? '').toLowerCase();
  const topics = event.topics ?? [];

  // ---------------------------------------------------------------------------
  // forward_detected
  // ---------------------------------------------------------------------------
  const isForward =
    /^(fwd:|fw:)\s/i.test(event.subject ?? '') ||
    body.includes('---------- forwarded message') ||
    body.includes('-----original message-----') ||
    body.includes('begin forwarded message');

  if (isForward) {
    signals.push({
      signal_type: 'forward_detected',
      confidence: 0.95,
      context: 'Email subject or body indicates a forwarded message',
      metadata: { rule: 'forward_prefix_or_body_marker' },
    });
  }

  // ---------------------------------------------------------------------------
  // out_of_office
  // ---------------------------------------------------------------------------
  const oooPatterns = [
    'out of office', 'out-of-office', 'i am away', "i'm away",
    'on vacation', 'on leave', 'will be back', 'will return',
    'automatic reply', 'auto-reply', 'autoreply',
  ];
  const isOoo = oooPatterns.some((p) => subject.includes(p) || body.includes(p));
  if (isOoo) {
    signals.push({
      signal_type: 'out_of_office',
      confidence: 0.92,
      context: 'Auto-reply patterns detected in subject or body',
      metadata: { rule: 'ooo_patterns' },
    });
  }

  // ---------------------------------------------------------------------------
  // meeting_request
  // ---------------------------------------------------------------------------
  const meetingPatterns = [
    'schedule a call', 'schedule a meeting', 'book a call', 'book a meeting',
    'set up a call', 'set up a meeting', 'hop on a call', 'jump on a call',
    'calendar invite', 'calendly', 'pick a time', 'find a time',
    'availability', 'free to chat', 'quick call', 'discovery call',
    'demo call', 'intro call',
  ];
  const hasMeetingPattern = meetingPatterns.some((p) => subject.includes(p) || body.includes(p));
  const hasMeetingTopic = topics.some((t) => t.toLowerCase().includes('meeting') || t.toLowerCase().includes('call'));
  if (hasMeetingPattern || hasMeetingTopic) {
    signals.push({
      signal_type: 'meeting_request',
      confidence: hasMeetingPattern ? 0.85 : 0.65,
      context: 'Scheduling or meeting-related language detected',
      metadata: { rule: 'meeting_patterns', pattern_match: hasMeetingPattern, topic_match: hasMeetingTopic },
    });
  }

  // ---------------------------------------------------------------------------
  // pricing_question
  // ---------------------------------------------------------------------------
  const pricingPatterns = [
    'price', 'pricing', 'cost', 'budget', 'quote', 'quotation',
    'how much', 'what does it cost', 'rates', 'fee', 'invoice',
    'roi', 'return on investment', 'payback',
  ];
  const hasPricingPattern = pricingPatterns.some((p) => subject.includes(p) || body.includes(p));
  if (hasPricingPattern && event.is_sales_related) {
    signals.push({
      signal_type: 'pricing_question',
      confidence: 0.82,
      context: 'Pricing or budget-related language detected in a sales-related email',
      metadata: { rule: 'pricing_patterns_with_sales_flag' },
    });
  }

  // ---------------------------------------------------------------------------
  // competitor_mention
  // ---------------------------------------------------------------------------
  const competitorPatterns = [
    'competitor', 'competition', 'alternative', 'comparing', 'vs ',
    'versus', 'other solution', 'other vendor', 'another option',
    'evaluated', 'also looking at', 'shortlist',
  ];
  const hasCompetitorPattern = competitorPatterns.some((p) => subject.includes(p) || body.includes(p));
  if (hasCompetitorPattern) {
    signals.push({
      signal_type: 'competitor_mention',
      confidence: 0.75,
      context: 'Competitor or comparison language detected',
      metadata: { rule: 'competitor_patterns' },
    });
  }

  // ---------------------------------------------------------------------------
  // introduction_offer
  // ---------------------------------------------------------------------------
  const introPatterns = [
    'i wanted to introduce', 'i\'d like to introduce', 'let me introduce',
    'introducing you to', 'i\'m introducing', 'connecting you with',
    'wanted to connect you', 'thought you two should meet',
  ];
  const hasIntroPattern = introPatterns.some((p) => subject.includes(p) || body.includes(p));
  if (hasIntroPattern) {
    signals.push({
      signal_type: 'introduction_offer',
      confidence: 0.88,
      context: 'Introduction or connection language detected',
      metadata: { rule: 'intro_patterns' },
    });
  }

  // ---------------------------------------------------------------------------
  // positive_buying_signal — uses pre-computed AI scores
  // ---------------------------------------------------------------------------
  const sentimentScore = event.sentiment_score ?? 0;
  const urgency = event.urgency ?? 0;
  if (sentimentScore > 0.7 && urgency > 0.5 && event.is_sales_related) {
    signals.push({
      signal_type: 'positive_buying_signal',
      confidence: Math.min(0.95, (sentimentScore + urgency) / 2),
      context: `High sentiment (${sentimentScore.toFixed(2)}) and urgency (${urgency.toFixed(2)}) on sales-related email`,
      metadata: { rule: 'ai_scores', sentiment_score: sentimentScore, urgency },
    });
  }

  // ---------------------------------------------------------------------------
  // objection — negative sentiment on sales-related email
  // ---------------------------------------------------------------------------
  const objectionPatterns = [
    'not interested', 'no thanks', 'not a good fit', 'not the right time',
    'too expensive', 'out of budget', 'going with', 'chose another',
    'already have a solution', 'not in the budget',
  ];
  const hasObjectionPattern = objectionPatterns.some((p) => body.includes(p));
  if (hasObjectionPattern || (sentimentScore < 0.3 && event.is_sales_related && sentimentScore > 0)) {
    signals.push({
      signal_type: 'objection',
      confidence: hasObjectionPattern ? 0.85 : 0.60,
      context: hasObjectionPattern
        ? 'Explicit objection language detected'
        : `Low sentiment score (${sentimentScore.toFixed(2)}) on sales email`,
      metadata: {
        rule: hasObjectionPattern ? 'objection_patterns' : 'low_sentiment',
        sentiment_score: sentimentScore,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Response-time signals — only for inbound replies where we have baseline
  // ---------------------------------------------------------------------------
  if (event.direction === 'inbound' && avgResponseTimeHours !== null && event.occurred_at) {
    // We need to compare how quickly they replied; this requires the prior outbound email time.
    // We approximate by checking if the event occurred_at is within fast/slow windows
    // relative to the average — the actual delta requires looking up the thread's prior email.
    // We attach the avg for context and let the metadata flag intent for downstream processors.
    // The full response-time delta computation is intentionally skipped here since we don't
    // have the prior email timestamp in-scope; set flag for downstream scoring.
    const responseMetadata = {
      rule: 'response_time_placeholder',
      avg_response_time_hours: avgResponseTimeHours,
      note: 'Full response time delta requires prior outbound email lookup',
    };

    // fast_reply: replied in less than 0.5× avg
    // slow_reply: replied in more than 2× avg
    // Without the prior email time we emit these at lower confidence as hints.
    if (avgResponseTimeHours > 0) {
      // Add both as low-confidence candidates for LLM disambiguation
      // The LLM can decide based on full body context whether the cadence is notable
      signals.push({
        signal_type: 'fast_reply',
        confidence: 0.35, // Below MIN_CONFIDENCE — LLM may boost if confirmed
        context: `Inbound reply; avg response time baseline is ${avgResponseTimeHours.toFixed(1)}h`,
        metadata: responseMetadata,
      });
      signals.push({
        signal_type: 'slow_reply',
        confidence: 0.35,
        context: `Inbound reply; avg response time baseline is ${avgResponseTimeHours.toFixed(1)}h`,
        metadata: responseMetadata,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // silence_detected — no response after 72h on a response_required email
  // ---------------------------------------------------------------------------
  if (
    event.direction === 'outbound' &&
    event.response_required === true &&
    event.occurred_at
  ) {
    const hoursSinceSent =
      (Date.now() - new Date(event.occurred_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSent >= 72) {
      const ghostRisk = event.ghost_risk ?? 0;
      signals.push({
        signal_type: 'silence_detected',
        confidence: Math.min(0.95, 0.70 + ghostRisk * 0.25),
        context: `No response after ${Math.round(hoursSinceSent)}h on response-required outbound email`,
        metadata: {
          rule: 'silence_72h',
          hours_since_sent: Math.round(hoursSinceSent),
          ghost_risk: ghostRisk,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // new_cc_contact — emails in TO/CC not matched in our contacts table
  // ---------------------------------------------------------------------------
  // Note: this check is async-unfriendly in a pure function; we flag it for
  // async resolution below. Skip here if no emails provided.
  // The actual DB lookup is performed separately in classifyNewCcContacts().

  return signals;
}

// =============================================================================
// new_cc_contact async check
// =============================================================================

async function classifyNewCcContacts(
  supabase: ReturnType<typeof createClient>,
  event: CommunicationEvent,
  orgId: string,
): Promise<DetectedSignal | null> {
  const allEmails = [...(event.to_emails ?? []), ...(event.cc_emails ?? [])];
  if (allEmails.length === 0) return null;

  // Normalize
  const normalized = allEmails
    .map((e) => e.toLowerCase().trim())
    .filter((e) => e.includes('@'));

  if (normalized.length === 0) return null;

  const { data: existing } = await supabase
    .from('contacts')
    .select('email')
    .eq('owner_id', event.user_id)
    .in('email', normalized);

  const knownEmails = new Set((existing ?? []).map((c: { email: string }) => c.email?.toLowerCase()));
  const unknownEmails = normalized.filter((e) => !knownEmails.has(e));

  if (unknownEmails.length === 0) return null;

  return {
    signal_type: 'new_cc_contact',
    confidence: 0.78,
    context: `${unknownEmails.length} unrecognized email address(es) in TO/CC`,
    metadata: {
      rule: 'cc_contact_lookup',
      unknown_emails: unknownEmails.slice(0, 10), // cap for metadata size
      unknown_count: unknownEmails.length,
    },
  };
}

// =============================================================================
// LLM disambiguation decision
// =============================================================================

function shouldUseLlm(signals: DetectedSignal[]): boolean {
  // Use LLM when there are multiple signals with confidence 0.6–0.85 (ambiguous range)
  const ambiguous = signals.filter((s) => s.confidence >= 0.6 && s.confidence < 0.85);
  if (ambiguous.length >= 2) return true;

  // Use LLM when fast_reply and slow_reply both appear (mutually exclusive)
  const types = new Set(signals.map((s) => s.signal_type));
  if (types.has('fast_reply') && types.has('slow_reply')) return true;

  return false;
}

// =============================================================================
// Claude Haiku LLM disambiguation
// =============================================================================

async function disambiguateWithLlm(
  event: CommunicationEvent,
  candidates: DetectedSignal[],
  userId: string,
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ signals: DetectedSignal[] }> {
  try {
    const prompt = buildDisambiguationPrompt(event, candidates);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[agent-email-signals] LLM API error:', response.status, text);
      return { signals: candidates };
    }

    const llmData = await response.json();

    // Track cost
    const usage = extractAnthropicUsage(llmData);
    await logAICostEvent(
      supabase,
      userId,
      orgId,
      'anthropic',
      HAIKU_MODEL,
      usage.inputTokens,
      usage.outputTokens,
      'email_signal_classification',
      { communication_event_id: event.id },
      { source: 'agent_automated', agentType: 'email_signals' },
    );

    // Parse LLM response
    const content = llmData.content?.[0]?.text ?? '';
    return parseLlmDisambiguation(candidates, content);

  } catch (err) {
    console.warn('[agent-email-signals] LLM disambiguation failed, using rule-based only:', err);
    return { signals: candidates };
  }
}

function buildDisambiguationPrompt(
  event: CommunicationEvent,
  candidates: DetectedSignal[],
): string {
  const candidateList = candidates
    .map((c) => `- ${c.signal_type} (confidence: ${c.confidence.toFixed(2)}): ${c.context}`)
    .join('\n');

  return `You are classifying email signals for a sales CRM. Given the email details and candidate signals, output only the signals that are genuinely present and adjust confidence as needed.

EMAIL:
Subject: ${event.subject ?? '(none)'}
Body preview: ${event.body_preview?.slice(0, 500) ?? '(none)'}
Direction: ${event.direction ?? 'unknown'}
Sentiment score: ${event.sentiment_score ?? 'unknown'}
Urgency: ${event.urgency ?? 'unknown'}
Is sales-related: ${event.is_sales_related ?? 'unknown'}

CANDIDATE SIGNALS:
${candidateList}

Respond ONLY with a JSON array. Each element: { "signal_type": "<type>", "confidence": <0.0-1.0>, "keep": true|false, "reason": "<one sentence>" }
Do not include any text outside the JSON array.`;
}

function parseLlmDisambiguation(
  candidates: DetectedSignal[],
  llmContent: string,
): { signals: DetectedSignal[] } {
  try {
    // Extract JSON array from the response
    const match = llmContent.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn('[agent-email-signals] LLM response did not contain JSON array');
      return { signals: candidates };
    }

    const parsed: Array<{
      signal_type: string;
      confidence: number;
      keep: boolean;
      reason: string;
    }> = JSON.parse(match[0]);

    const updatedSignals: DetectedSignal[] = [];

    for (const candidate of candidates) {
      const llmDecision = parsed.find((p) => p.signal_type === candidate.signal_type);
      if (!llmDecision) {
        // LLM didn't mention it — keep as-is
        updatedSignals.push(candidate);
        continue;
      }
      if (!llmDecision.keep) {
        // LLM said to discard
        continue;
      }
      updatedSignals.push({
        ...candidate,
        confidence: Math.min(1, Math.max(0, llmDecision.confidence)),
        metadata: {
          ...candidate.metadata,
          llm_reason: llmDecision.reason,
          llm_confidence: llmDecision.confidence,
        },
      });
    }

    return { signals: updatedSignals };
  } catch (err) {
    console.warn('[agent-email-signals] Failed to parse LLM disambiguation response:', err);
    return { signals: candidates };
  }
}

