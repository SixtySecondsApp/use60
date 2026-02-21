/**
 * Meeting Process Structured Summary Edge Function
 *
 * Extracts structured data from meeting transcripts using Claude AI:
 * - Key decisions
 * - Rep/prospect commitments
 * - Stakeholders mentioned
 * - Pricing discussions
 * - Technical requirements
 * - Outcome signals (forward movement)
 * - Stage indicators
 * - Competitor mentions
 * - Objections
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { logAICostEvent, checkCreditBalance, extractAnthropicUsage } from '../_shared/costTracking.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

// Confidence scores by source type (higher = more trustworthy)
const SOURCE_CONFIDENCE: Record<string, number> = {
  meeting_transcript: 0.85, // High confidence - direct from conversation
  email: 0.70,              // Good confidence - written communication
  crm_sync: 0.60,           // Moderate - may be outdated
  manual: 0.95,             // Highest - user explicitly set
  ai_inferred: 0.50,        // Lower - AI guessing
};

// Deal Truth field keys
type DealTruthFieldKey = 'pain' | 'success_metric' | 'champion' | 'economic_buyer' | 'next_step' | 'top_risks';

interface DealTruthExtraction {
  field_key: DealTruthFieldKey;
  value: string;
  confidence: number;
  champion_strength?: 'strong' | 'moderate' | 'weak' | 'unknown';
  next_step_date?: string;
}

interface RequestBody {
  meetingId: string;
  forceReprocess?: boolean;
}

interface StructuredSummary {
  key_decisions: Array<{ decision: string; context: string; importance: 'high' | 'medium' | 'low' }>;
  rep_commitments: Array<{ commitment: string; due_date?: string; priority: 'high' | 'medium' | 'low' }>;
  prospect_commitments: Array<{ commitment: string; expectation?: string }>;
  stakeholders_mentioned: Array<{ name: string; role?: string; concerns: string[]; sentiment: 'positive' | 'neutral' | 'negative' }>;
  pricing_discussed: { mentioned: boolean; amount?: number; structure?: string; objections?: string[]; notes?: string };
  technical_requirements: Array<{ requirement: string; priority: 'high' | 'medium' | 'low'; notes?: string }>;
  outcome_signals: {
    overall: 'positive' | 'negative' | 'neutral';
    positive_signals: string[];
    negative_signals: string[];
    next_steps: string[];
    forward_movement: boolean;
  };
  stage_indicators: {
    detected_stage: 'discovery' | 'demo' | 'negotiation' | 'closing' | 'follow_up' | 'general';
    confidence: number;
    signals: string[];
  };
  competitor_mentions: Array<{ name: string; context: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
  objections: Array<{ objection: string; response?: string; resolved: boolean; category?: string }>;
}

const EXTRACTION_PROMPT = `You are a sales meeting analyst. Analyze the following sales meeting transcript and extract structured data.

TRANSCRIPT:
{transcript}

MEETING CONTEXT:
- Title: {title}
- Company: {company_name}
- Deal Stage: {deal_stage}
- Attendees: {attendees}

Extract the following information in JSON format:

{
  "key_decisions": [
    {"decision": "string", "context": "string", "importance": "high|medium|low"}
  ],
  "rep_commitments": [
    {"commitment": "string", "due_date": "optional YYYY-MM-DD", "priority": "high|medium|low"}
  ],
  "prospect_commitments": [
    {"commitment": "string", "expectation": "optional string"}
  ],
  "stakeholders_mentioned": [
    {"name": "string", "role": "optional string", "concerns": ["array of concerns"], "sentiment": "positive|neutral|negative"}
  ],
  "pricing_discussed": {
    "mentioned": boolean,
    "amount": optional number,
    "structure": "optional string describing pricing structure",
    "objections": ["optional array of pricing objections"],
    "notes": "optional string"
  },
  "technical_requirements": [
    {"requirement": "string", "priority": "high|medium|low", "notes": "optional string"}
  ],
  "outcome_signals": {
    "overall": "positive|negative|neutral",
    "positive_signals": ["array of positive indicators"],
    "negative_signals": ["array of negative indicators"],
    "next_steps": ["array of agreed next steps"],
    "forward_movement": boolean (true if prospect indicated willingness to proceed)
  },
  "stage_indicators": {
    "detected_stage": "discovery|demo|negotiation|closing|follow_up|general",
    "confidence": 0.0-1.0,
    "signals": ["array of signals that indicate this stage"]
  },
  "competitor_mentions": [
    {"name": "string", "context": "string describing what was said", "sentiment": "positive|neutral|negative"}
  ],
  "objections": [
    {"objection": "string", "response": "optional string", "resolved": boolean, "category": "optional string like budget/timeline/authority/need"}
  ]
}

Important guidelines:
- Only include information explicitly stated or strongly implied in the transcript
- For forward_movement, look for signals like: interest in next steps, asking about implementation, requesting proposals, expressing urgency
- For negative signals, look for: hesitation, budget concerns, timeline delays, competitor mentions
- Be conservative with confidence scores
- If pricing wasn't discussed, set pricing_discussed.mentioned to false
- If no competitors were mentioned, return an empty array for competitor_mentions

Return ONLY valid JSON, no additional text.`;

/**
 * Call Claude API to extract structured summary
 */
async function extractStructuredSummary(
  transcript: string,
  title: string,
  companyName: string,
  dealStage: string,
  attendees: string[]
): Promise<{ summary: StructuredSummary; tokensUsed: number; inputTokens: number; outputTokens: number }> {
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Truncate transcript if too long (max ~50K chars to leave room for response)
  const maxTranscriptLength = 50000;
  const truncatedTranscript = transcript.length > maxTranscriptLength
    ? transcript.substring(0, maxTranscriptLength) + '\n\n[Transcript truncated due to length...]'
    : transcript;

  const prompt = EXTRACTION_PROMPT
    .replace('{transcript}', truncatedTranscript)
    .replace('{title}', title || 'Unknown')
    .replace('{company_name}', companyName || 'Unknown')
    .replace('{deal_stage}', dealStage || 'Unknown')
    .replace('{attendees}', attendees.join(', ') || 'Unknown');

  const startTime = Date.now();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.1,
      system: 'You are a sales meeting analyst. Extract structured data from meeting transcripts. Return only valid JSON.',
      messages: [{
        role: 'user',
        content: prompt,
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.content[0]?.text;
  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;
  const tokensUsed = inputTokens + outputTokens;

  // Parse JSON response
  let summary: StructuredSummary;
  try {
    // Handle potential markdown code blocks
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    summary = JSON.parse(jsonContent.trim());
  } catch (parseError) {
    console.error('Failed to parse Claude response:', content);
    throw new Error('Failed to parse AI response as JSON');
  }

  return { summary, tokensUsed, inputTokens, outputTokens };
}

/**
 * Get meeting data with related info
 */
async function getMeetingData(
  supabase: ReturnType<typeof createClient>,
  meetingId: string
): Promise<any> {
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select(`
      id,
      title,
      transcript_text,
      summary,
      owner_user_id,
      company_id,
      primary_contact_id,
      start_time,
      sentiment_score,
      meeting_attendees(name, email, is_external)
    `)
    .eq('id', meetingId)
    .single();

  if (error || !meeting) {
    throw new Error(`Meeting not found: ${error?.message || 'Unknown error'}`);
  }

  // Get company name
  let companyName = null;
  if (meeting.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', meeting.company_id)
      .single();
    companyName = company?.name;
  }

  // Get deal stage if there's an associated deal
  let dealStage = null;
  if (companyName) {
    const { data: deal } = await supabase
      .from('deals')
      .select('stage')
      .ilike('title', `%${companyName}%`)
      .eq('user_id', meeting.owner_user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    dealStage = deal?.stage;
  }

  // Get user's org_id
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', meeting.owner_user_id)
    .limit(1)
    .single();

  return {
    ...meeting,
    company_name: companyName,
    deal_stage: dealStage,
    org_id: membership?.org_id,
  };
}

/**
 * Save structured summary to database
 */
async function saveStructuredSummary(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  orgId: string,
  summary: StructuredSummary,
  tokensUsed: number,
  processingTimeMs: number
): Promise<void> {
  const { error } = await supabase
    .from('meeting_structured_summaries')
    .upsert({
      meeting_id: meetingId,
      org_id: orgId,
      key_decisions: summary.key_decisions,
      rep_commitments: summary.rep_commitments,
      prospect_commitments: summary.prospect_commitments,
      stakeholders_mentioned: summary.stakeholders_mentioned,
      pricing_discussed: summary.pricing_discussed,
      technical_requirements: summary.technical_requirements,
      outcome_signals: summary.outcome_signals,
      stage_indicators: summary.stage_indicators,
      competitor_mentions: summary.competitor_mentions,
      objections: summary.objections,
      ai_model_used: 'claude-sonnet-4-20250514',
      tokens_used: tokensUsed,
      processing_time_ms: processingTimeMs,
      version: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meeting_id' });

  if (error) {
    throw new Error(`Failed to save structured summary: ${error.message}`);
  }
}

/**
 * Save meeting classification for aggregate queries
 */
async function saveMeetingClassification(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  orgId: string,
  summary: StructuredSummary
): Promise<void> {
  const classification = {
    meeting_id: meetingId,
    org_id: orgId,
    has_forward_movement: summary.outcome_signals.forward_movement,
    has_proposal_request: summary.outcome_signals.next_steps.some(
      s => s.toLowerCase().includes('proposal') || s.toLowerCase().includes('quote')
    ),
    has_pricing_discussion: summary.pricing_discussed.mentioned,
    has_competitor_mention: summary.competitor_mentions.length > 0,
    has_objection: summary.objections.length > 0,
    has_demo_request: summary.outcome_signals.next_steps.some(
      s => s.toLowerCase().includes('demo') || s.toLowerCase().includes('walkthrough')
    ),
    has_timeline_discussion: summary.pricing_discussed.notes?.toLowerCase().includes('timeline') ||
      summary.objections.some(o => o.category === 'timeline'),
    has_budget_discussion: summary.pricing_discussed.mentioned ||
      summary.objections.some(o => o.category === 'budget'),
    has_decision_maker: summary.stakeholders_mentioned.some(s =>
      s.role?.toLowerCase().includes('decision') ||
      s.role?.toLowerCase().includes('ceo') ||
      s.role?.toLowerCase().includes('cto') ||
      s.role?.toLowerCase().includes('vp')
    ),
    has_next_steps: summary.outcome_signals.next_steps.length > 0,
    outcome: summary.outcome_signals.overall,
    detected_stage: summary.stage_indicators.detected_stage,
    topics: summary.technical_requirements.map(r => ({
      topic: r.requirement,
      confidence: 0.8,
      mentions: 1,
    })),
    objections: summary.objections,
    competitors: summary.competitor_mentions,
    keywords: [
      ...summary.key_decisions.map(d => d.decision.substring(0, 50)),
      ...summary.outcome_signals.positive_signals.slice(0, 3),
    ],
    objection_count: summary.objections.length,
    competitor_mention_count: summary.competitor_mentions.length,
    positive_signal_count: summary.outcome_signals.positive_signals.length,
    negative_signal_count: summary.outcome_signals.negative_signals.length,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('meeting_classifications')
    .upsert(classification, { onConflict: 'meeting_id' });

  if (error) {
    console.error('Failed to save meeting classification:', error);
    // Don't throw - classification is supplementary
  }
}

/**
 * Extract Deal Truth fields from structured summary
 * Maps meeting insights to the 6 core Deal Truth fields
 */
function extractDealTruthFromSummary(summary: StructuredSummary): DealTruthExtraction[] {
  const extractions: DealTruthExtraction[] = [];
  const baseConfidence = SOURCE_CONFIDENCE.meeting_transcript;

  // 1. Extract next_step from outcome_signals
  if (summary.outcome_signals.next_steps && summary.outcome_signals.next_steps.length > 0) {
    const nextStep = summary.outcome_signals.next_steps[0];
    // Try to extract date from next step text (e.g., "Demo on Friday", "Follow up next week")
    const dateMatch = nextStep.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]?\d{0,4})|((next|this)\s+(monday|tuesday|wednesday|thursday|friday|week|month))/i);

    extractions.push({
      field_key: 'next_step',
      value: nextStep,
      confidence: summary.outcome_signals.forward_movement ? baseConfidence : baseConfidence * 0.8,
      next_step_date: dateMatch ? undefined : undefined, // TODO: Parse date if found
    });
  }

  // 2. Extract champion from stakeholders with positive sentiment
  const positiveStakeholders = summary.stakeholders_mentioned.filter(s => s.sentiment === 'positive');
  if (positiveStakeholders.length > 0) {
    // Prefer stakeholders with roles
    const champion = positiveStakeholders.find(s => s.role) || positiveStakeholders[0];
    const championStrength = determineChampionStrength(champion, summary);

    extractions.push({
      field_key: 'champion',
      value: champion.role ? `${champion.name} (${champion.role})` : champion.name,
      confidence: baseConfidence * (championStrength === 'strong' ? 1.0 : championStrength === 'moderate' ? 0.85 : 0.7),
      champion_strength: championStrength,
    });
  }

  // 3. Extract economic_buyer from stakeholders with decision-maker roles
  const decisionMakerRoles = ['ceo', 'cto', 'cfo', 'coo', 'vp', 'vice president', 'director', 'head of', 'decision', 'budget', 'owner', 'founder'];
  const economicBuyer = summary.stakeholders_mentioned.find(s =>
    s.role && decisionMakerRoles.some(role => s.role!.toLowerCase().includes(role))
  );

  if (economicBuyer) {
    extractions.push({
      field_key: 'economic_buyer',
      value: economicBuyer.role ? `${economicBuyer.name} (${economicBuyer.role})` : economicBuyer.name,
      confidence: baseConfidence * 0.9, // Slightly lower - role-based inference
    });
  }

  // 4. Extract top_risks from objections
  if (summary.objections && summary.objections.length > 0) {
    const unresolvedObjections = summary.objections.filter(o => !o.resolved);
    const topRisks = unresolvedObjections.length > 0
      ? unresolvedObjections.slice(0, 3).map(o => o.objection)
      : summary.objections.slice(0, 3).map(o => o.objection);

    if (topRisks.length > 0) {
      extractions.push({
        field_key: 'top_risks',
        value: topRisks.join('; '),
        confidence: baseConfidence * 0.9,
      });
    }
  }

  // 5. Extract pain from technical requirements, pricing objections, or negative signals
  const painIndicators: string[] = [];

  // From pricing objections
  if (summary.pricing_discussed.objections && summary.pricing_discussed.objections.length > 0) {
    painIndicators.push(...summary.pricing_discussed.objections);
  }

  // From technical requirements (high priority = pain point)
  const highPriorityReqs = summary.technical_requirements.filter(r => r.priority === 'high');
  if (highPriorityReqs.length > 0) {
    painIndicators.push(...highPriorityReqs.map(r => r.requirement));
  }

  // From stakeholder concerns
  summary.stakeholders_mentioned.forEach(s => {
    if (s.concerns && s.concerns.length > 0) {
      painIndicators.push(...s.concerns);
    }
  });

  if (painIndicators.length > 0) {
    extractions.push({
      field_key: 'pain',
      value: painIndicators.slice(0, 3).join('; '),
      confidence: baseConfidence * 0.75, // Inferred, so lower confidence
    });
  }

  // 6. Extract success_metric from key decisions or positive signals
  const successIndicators = [
    ...summary.key_decisions.filter(d => d.importance === 'high').map(d => d.decision),
    ...summary.outcome_signals.positive_signals.filter(s =>
      s.toLowerCase().includes('roi') ||
      s.toLowerCase().includes('save') ||
      s.toLowerCase().includes('increase') ||
      s.toLowerCase().includes('reduce') ||
      s.toLowerCase().includes('improve') ||
      s.toLowerCase().includes('%') ||
      s.toLowerCase().includes('metric')
    ),
  ];

  if (successIndicators.length > 0) {
    extractions.push({
      field_key: 'success_metric',
      value: successIndicators[0], // Take the first one
      confidence: baseConfidence * 0.7, // Inferred
    });
  }

  return extractions;
}

/**
 * Determine champion strength based on engagement signals
 */
function determineChampionStrength(
  stakeholder: StructuredSummary['stakeholders_mentioned'][0],
  summary: StructuredSummary
): 'strong' | 'moderate' | 'weak' | 'unknown' {
  // Strong indicators
  const strongSignals = [
    stakeholder.concerns.length === 0 && stakeholder.sentiment === 'positive',
    summary.outcome_signals.forward_movement,
    summary.outcome_signals.positive_signals.length > 3,
    summary.rep_commitments.length > 0 && summary.prospect_commitments.length > 0,
  ];

  const strongCount = strongSignals.filter(Boolean).length;

  if (strongCount >= 3) return 'strong';
  if (strongCount >= 2) return 'moderate';
  if (strongCount >= 1) return 'weak';
  return 'unknown';
}

/**
 * Upsert Deal Truth fields with confidence-aware logic
 * Only updates if new confidence >= existing confidence
 */
async function upsertDealTruthFields(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string,
  meetingId: string,
  extractions: DealTruthExtraction[]
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  for (const extraction of extractions) {
    // Check existing field confidence
    const { data: existing } = await supabase
      .from('deal_truth_fields')
      .select('id, confidence, source')
      .eq('deal_id', dealId)
      .eq('field_key', extraction.field_key)
      .maybeSingle();

    // Skip if existing has higher confidence (unless it's manual - manual always wins)
    if (existing && existing.source === 'manual') {
      console.log(`[deal-truth] Skipping ${extraction.field_key} - manual entry preserved`);
      skipped++;
      continue;
    }

    if (existing && existing.confidence > extraction.confidence) {
      console.log(`[deal-truth] Skipping ${extraction.field_key} - existing confidence ${existing.confidence} > new ${extraction.confidence}`);
      skipped++;
      continue;
    }

    // Upsert the field
    const { error } = await supabase
      .from('deal_truth_fields')
      .upsert({
        deal_id: dealId,
        org_id: orgId,
        field_key: extraction.field_key,
        value: extraction.value,
        confidence: extraction.confidence,
        source: 'meeting_transcript',
        source_id: meetingId,
        champion_strength: extraction.champion_strength,
        next_step_date: extraction.next_step_date,
        last_updated_at: new Date().toISOString(),
      }, { onConflict: 'deal_id,field_key' });

    if (error) {
      console.error(`[deal-truth] Error upserting ${extraction.field_key}:`, error);
    } else {
      console.log(`[deal-truth] Updated ${extraction.field_key} with confidence ${extraction.confidence}`);
      updated++;
    }
  }

  return { updated, skipped };
}

/**
 * Find deal associated with meeting
 */
async function findDealForMeeting(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  companyId: string | null,
  companyName: string | null,
  userId: string
): Promise<{ dealId: string; orgId: string } | null> {
  // First, try to find a deal by company_id
  if (companyId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, org_id')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deal) {
      return { dealId: deal.id, orgId: deal.org_id };
    }
  }

  // Fallback: Try to find by company name in deal title
  if (companyName) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, org_id')
      .ilike('name', `%${companyName}%`)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deal) {
      return { dealId: deal.id, orgId: deal.org_id };
    }
  }

  return null;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { meetingId, forceReprocess = false }: RequestBody = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: 'Missing meetingId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if already processed (unless forcing)
    if (!forceReprocess) {
      const { data: existing } = await supabase
        .from('meeting_structured_summaries')
        .select('id, updated_at')
        .eq('meeting_id', meetingId)
        .single();

      if (existing) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Already processed',
            summary_id: existing.id,
            processed_at: existing.updated_at,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get meeting data
    const meeting = await getMeetingData(supabase, meetingId);

    if (!meeting.transcript_text || meeting.transcript_text.length < 100) {
      return new Response(
        JSON.stringify({ error: 'Meeting has no transcript or transcript too short' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!meeting.org_id) {
      return new Response(
        JSON.stringify({ error: 'User is not a member of any organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Credit balance check before AI call
    const balanceCheck = await checkCreditBalance(supabase, meeting.org_id);
    if (!balanceCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract attendee names
    const attendees = meeting.meeting_attendees?.map((a: any) => a.name || a.email) || [];

    // Extract structured summary using Claude
    const startTime = Date.now();
    const { summary, tokensUsed, inputTokens, outputTokens } = await extractStructuredSummary(
      meeting.transcript_text,
      meeting.title,
      meeting.company_name,
      meeting.deal_stage,
      attendees
    );
    const processingTimeMs = Date.now() - startTime;

    // Log AI cost event
    await logAICostEvent(
      supabase,
      meeting.owner_user_id,
      meeting.org_id,
      'anthropic',
      'claude-sonnet-4-20250514',
      inputTokens,
      outputTokens,
      'meeting_summary',
    );

    // Save to database
    await saveStructuredSummary(
      supabase,
      meetingId,
      meeting.org_id,
      summary,
      tokensUsed,
      processingTimeMs
    );

    // Save classification for aggregate queries
    await saveMeetingClassification(supabase, meetingId, meeting.org_id, summary);

    // Extract and upsert Deal Truth fields
    let dealTruthResult = { updated: 0, skipped: 0, dealId: null as string | null };
    try {
      const dealInfo = await findDealForMeeting(
        supabase,
        meetingId,
        meeting.company_id,
        meeting.company_name,
        meeting.owner_user_id
      );

      if (dealInfo) {
        const extractions = extractDealTruthFromSummary(summary);
        if (extractions.length > 0) {
          const result = await upsertDealTruthFields(
            supabase,
            dealInfo.dealId,
            dealInfo.orgId,
            meetingId,
            extractions
          );
          dealTruthResult = { ...result, dealId: dealInfo.dealId };
          console.log(`[deal-truth] Extracted ${extractions.length} fields for deal ${dealInfo.dealId}: ${result.updated} updated, ${result.skipped} skipped`);
        }
      } else {
        console.log(`[deal-truth] No deal found for meeting ${meetingId}`);
      }
    } catch (dealTruthError) {
      console.error('[deal-truth] Error extracting Deal Truth:', dealTruthError);
      // Don't fail the whole process for Deal Truth extraction errors
    }

    console.log(`Processed structured summary for meeting ${meetingId} in ${processingTimeMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingId,
        summary,
        tokens_used: tokensUsed,
        processing_time_ms: processingTimeMs,
        deal_truth: dealTruthResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meeting-process-structured-summary:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
