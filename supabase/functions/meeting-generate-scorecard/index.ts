/**
 * Meeting Generate Scorecard Edge Function
 *
 * Generates coaching scorecards for meetings based on configurable templates:
 * - Talk-to-listen ratio analysis
 * - Discovery questions detection
 * - Monologue detection
 * - Checklist evaluation
 * - Script adherence scoring
 * - AI-generated coaching feedback
 * - Call type workflow checklist processing
 * - Forward movement signal detection
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';
import { logAICostEvent, checkCreditBalance, extractAnthropicUsage } from '../_shared/costTracking.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

interface RequestBody {
  meetingId: string;
  templateId?: string;
  skipWorkflow?: boolean; // Option to skip workflow processing
}

interface OrgCallType {
  id: string;
  org_id: string;
  name: string;
  enable_coaching: boolean;
  workflow_config: WorkflowConfig | null;
}

interface WorkflowConfig {
  checklist_items?: WorkflowChecklistItem[];
  notifications?: {
    on_missing_required?: {
      enabled: boolean;
      channels: ('in_app' | 'email' | 'slack')[];
      delay_minutes: number;
    };
  };
  automations?: {
    update_pipeline_on_forward_movement?: boolean;
    create_follow_up_task?: boolean;
  };
}

interface WorkflowChecklistItem {
  id: string;
  label: string;
  required: boolean;
  category?: string;
  keywords: string[];
}

interface WorkflowChecklistResult {
  item_id: string;
  label: string;
  category?: string;
  required: boolean;
  covered: boolean;
  timestamp?: string;
  evidence_quote?: string;
}

interface ForwardMovementSignal {
  type: string;
  confidence: number;
  evidence: string;
}

interface MetricConfig {
  id: string;
  name: string;
  weight: number;
  enabled: boolean;
  ideal_range?: { min: number; max: number };
  description?: string;
}

interface ChecklistItem {
  id: string;
  question: string;
  required: boolean;
  category?: string;
  order: number;
}

interface ScriptStep {
  step_number: number;
  step_name: string;
  expected_topics: string[];
  required: boolean;
  max_duration_minutes?: number;
}

interface ScorecardTemplate {
  id: string;
  org_id: string;
  name: string;
  meeting_type: string;
  metrics: MetricConfig[];
  checklist_items: ChecklistItem[];
  script_flow: ScriptStep[];
  passing_score: number;
  excellence_score: number;
}

interface ScorecardAnalysis {
  talk_time_analysis: {
    rep_pct: number;
    customer_pct: number;
    monologue_instances: Array<{
      start_seconds: number;
      duration_seconds: number;
      transcript_snippet: string;
    }>;
  };
  discovery_questions: {
    count: number;
    examples: string[];
  };
  next_steps: {
    established: boolean;
    details: string;
  };
  checklist_results: Record<string, {
    covered: boolean;
    timestamp_seconds?: number;
    quote?: string;
    notes?: string;
  }>;
  script_adherence: {
    steps_covered: string[];
    steps_missed: string[];
    order_followed: boolean;
    score: number;
  };
  strengths: string[];
  improvements: string[];
  specific_feedback: string;
  coaching_tips: string[];
  key_moments: Array<{
    timestamp_seconds: number;
    type: 'positive' | 'negative' | 'coaching';
    description: string;
    quote?: string;
  }>;
  overall_score: number;
  detected_meeting_type: string;
}

const DEFAULT_METRICS: MetricConfig[] = [
  {
    id: 'talk_ratio',
    name: 'Talk-to-Listen Ratio',
    weight: 25,
    enabled: true,
    ideal_range: { min: 30, max: 45 },
    description: 'Percentage of time rep speaks vs prospect (ideal: 30-45%)',
  },
  {
    id: 'discovery_questions',
    name: 'Discovery Questions',
    weight: 25,
    enabled: true,
    ideal_range: { min: 5, max: 15 },
    description: 'Number of open-ended questions asked',
  },
  {
    id: 'next_steps',
    name: 'Next Steps Established',
    weight: 25,
    enabled: true,
    description: 'Whether clear next steps were agreed upon',
  },
  {
    id: 'monologue_detection',
    name: 'Monologue Avoidance',
    weight: 25,
    enabled: true,
    ideal_range: { min: 0, max: 2 },
    description: 'Number of times rep spoke for over 60 seconds',
  },
];

/**
 * Build scorecard analysis prompt
 */
function buildAnalysisPrompt(
  transcript: string,
  template: ScorecardTemplate | null,
  meetingTitle: string,
  existingTalkTimeData: { rep_pct: number | null; customer_pct: number | null }
): string {
  const checklistSection = template?.checklist_items?.length
    ? `
CHECKLIST TO EVALUATE:
${template.checklist_items.map(item => `- [${item.id}] ${item.question} (${item.required ? 'Required' : 'Optional'})`).join('\n')}
`
    : '';

  const scriptSection = template?.script_flow?.length
    ? `
EXPECTED SCRIPT FLOW:
${template.script_flow.map(step => `${step.step_number}. ${step.step_name}: Topics to cover: ${step.expected_topics.join(', ')}`).join('\n')}
`
    : '';

  return `You are a sales coaching analyst. Analyze this sales call transcript and generate a detailed coaching scorecard.

MEETING: ${meetingTitle}
${existingTalkTimeData.rep_pct ? `EXISTING TALK TIME DATA: Rep ${existingTalkTimeData.rep_pct}%, Customer ${existingTalkTimeData.customer_pct}%` : ''}
${checklistSection}
${scriptSection}

TRANSCRIPT:
${transcript}

Analyze the call and return JSON with this structure:
{
  "talk_time_analysis": {
    "rep_pct": number (0-100, use existing data if provided, otherwise estimate),
    "customer_pct": number (0-100),
    "monologue_instances": [
      {"start_seconds": number, "duration_seconds": number, "transcript_snippet": "string (50-100 chars)"}
    ]
  },
  "discovery_questions": {
    "count": number,
    "examples": ["array of actual questions the rep asked (max 5)"]
  },
  "next_steps": {
    "established": boolean,
    "details": "string describing what was agreed"
  },
  "checklist_results": {
    "checklist_item_id": {
      "covered": boolean,
      "timestamp_seconds": number or null,
      "quote": "relevant quote if covered",
      "notes": "optional notes"
    }
  },
  "script_adherence": {
    "steps_covered": ["step names that were covered"],
    "steps_missed": ["step names that were missed"],
    "order_followed": boolean,
    "score": number (0-100)
  },
  "strengths": ["3-5 specific things the rep did well"],
  "improvements": ["3-5 specific areas for improvement"],
  "specific_feedback": "2-3 sentence personalized coaching feedback",
  "coaching_tips": ["2-3 actionable tips for the rep"],
  "key_moments": [
    {
      "timestamp_seconds": number,
      "type": "positive|negative|coaching",
      "description": "what happened",
      "quote": "optional relevant quote"
    }
  ],
  "overall_score": number (0-100),
  "detected_meeting_type": "discovery|demo|negotiation|closing|follow_up|general"
}

SCORING GUIDELINES:
- Talk ratio: Ideal is 30-45% rep talk time. Score lower if rep talks too much (>50%) or too little (<20%)
- Discovery questions: Look for open-ended questions like "What...", "How...", "Tell me about...", "Can you describe..."
- Monologue: Flag any instance where the rep speaks continuously for more than 60 seconds
- Next steps: Should be specific, time-bound, and mutually agreed
- Overall score: Weight based on template metrics if provided, otherwise use equal weights

Return ONLY valid JSON.`;
}

/**
 * Calculate metric score based on value and config
 */
function calculateMetricScore(value: number | boolean, config: MetricConfig): number {
  if (!config.enabled) return 0;

  if (typeof value === 'boolean') {
    return value ? 100 : 0;
  }

  if (config.ideal_range) {
    const { min, max } = config.ideal_range;
    if (value >= min && value <= max) {
      return 100;
    } else if (value < min) {
      // Score decreases as value goes below min
      return Math.max(0, 100 - ((min - value) / min) * 100);
    } else {
      // Score decreases as value goes above max
      return Math.max(0, 100 - ((value - max) / max) * 100);
    }
  }

  return value;
}

/**
 * Calculate grade from score
 */
function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Get call type for meeting
 */
async function getCallTypeForMeeting(
  supabase: ReturnType<typeof createClient>,
  callTypeId?: string
): Promise<OrgCallType | null> {
  if (!callTypeId) return null;

  const { data, error } = await supabase
    .from('org_call_types')
    .select('id, org_id, name, enable_coaching, workflow_config')
    .eq('id', callTypeId)
    .single();

  if (error || !data) return null;
  return data as OrgCallType;
}

/**
 * Get template for meeting type - now prioritizes call_type_id
 */
async function getTemplateForMeeting(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  templateId?: string,
  callTypeId?: string,
  meetingType?: string
): Promise<ScorecardTemplate | null> {
  // If specific template requested
  if (templateId) {
    const { data } = await supabase
      .from('coaching_scorecard_templates')
      .select('*')
      .eq('id', templateId)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .single();
    return data;
  }

  // Priority 1: Find template linked to this call type
  if (callTypeId) {
    const { data } = await supabase
      .from('coaching_scorecard_templates')
      .select('*')
      .eq('org_id', orgId)
      .eq('call_type_id', callTypeId)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (data) return data;
  }

  // Priority 2: Find template for meeting type name
  if (meetingType) {
    const { data } = await supabase
      .from('coaching_scorecard_templates')
      .select('*')
      .eq('org_id', orgId)
      .eq('meeting_type', meetingType)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .limit(1)
      .single();
    if (data) return data;
  }

  // Fall back to general template
  const { data } = await supabase
    .from('coaching_scorecard_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('meeting_type', 'general')
    .eq('is_active', true)
    .limit(1)
    .single();

  return data;
}

/**
 * Analyze workflow checklist against transcript
 */
async function analyzeWorkflowChecklist(
  transcript: string,
  checklistItems: WorkflowChecklistItem[]
): Promise<{ results: WorkflowChecklistResult[]; forwardMovementSignals: ForwardMovementSignal[] }> {
  if (!checklistItems || checklistItems.length === 0) {
    return { results: [], forwardMovementSignals: [] };
  }

  const lowerTranscript = transcript.toLowerCase();
  const results: WorkflowChecklistResult[] = [];
  const forwardMovementSignals: ForwardMovementSignal[] = [];

  // Process each checklist item
  for (const item of checklistItems) {
    const result: WorkflowChecklistResult = {
      item_id: item.id,
      label: item.label,
      category: item.category,
      required: item.required,
      covered: false,
    };

    // Check if any keyword matches
    for (const keyword of item.keywords || []) {
      const lowerKeyword = keyword.toLowerCase();
      const index = lowerTranscript.indexOf(lowerKeyword);

      if (index !== -1) {
        result.covered = true;

        // Extract context around the keyword (100 chars before and after)
        const start = Math.max(0, index - 50);
        const end = Math.min(transcript.length, index + keyword.length + 100);
        result.evidence_quote = transcript.slice(start, end).trim();

        // Rough timestamp estimate based on position in transcript
        const positionRatio = index / transcript.length;
        result.timestamp = `${Math.round(positionRatio * 60)}:00`;

        break;
      }
    }

    results.push(result);
  }

  // Detect forward movement signals from common phrases
  const forwardMovementPatterns = [
    { type: 'proposal_requested', patterns: ['send me a proposal', 'send proposal', 'pricing proposal', 'quote me', 'what does it cost', 'get a proposal'], confidence: 0.85 },
    { type: 'pricing_discussed', patterns: ['price', 'pricing', 'cost', 'budget', 'investment', 'spend', 'dollars'], confidence: 0.75 },
    { type: 'next_meeting_scheduled', patterns: ['schedule a follow', 'next meeting', 'schedule a call', 'book a demo', 'set up a demo', 'next tuesday', 'next week'], confidence: 0.85 },
    { type: 'verbal_commitment', patterns: ["let's do it", "let's move forward", 'we want to', "we'll take", 'sign me up', 'let us proceed', 'sounds good', 'we are in'], confidence: 0.80 },
    { type: 'decision_maker_engaged', patterns: ['ceo', 'cfo', 'cto', 'vp of', 'director of', 'head of', 'decision maker', 'final say'], confidence: 0.70 },
    { type: 'timeline_confirmed', patterns: ['start by', 'go live', 'implementation', 'launch date', 'target date', 'deadline', 'q1', 'q2', 'q3', 'q4', 'next quarter'], confidence: 0.75 },
  ];

  for (const pattern of forwardMovementPatterns) {
    for (const phrase of pattern.patterns) {
      const index = lowerTranscript.indexOf(phrase);
      if (index !== -1) {
        // Extract evidence
        const start = Math.max(0, index - 30);
        const end = Math.min(transcript.length, index + phrase.length + 50);
        const evidence = transcript.slice(start, end).trim();

        // Only add if not already detected
        if (!forwardMovementSignals.some(s => s.type === pattern.type)) {
          forwardMovementSignals.push({
            type: pattern.type,
            confidence: pattern.confidence,
            evidence,
          });
        }
        break;
      }
    }
  }

  return { results, forwardMovementSignals };
}

/**
 * Save workflow results to database
 */
async function saveWorkflowResults(
  supabase: ReturnType<typeof createClient>,
  meetingId: string,
  callTypeId: string | null,
  orgId: string,
  checklistResults: WorkflowChecklistResult[],
  forwardMovementSignals: ForwardMovementSignal[],
  workflowConfig?: WorkflowConfig | null
): Promise<void> {
  // Calculate coverage scores
  const totalItems = checklistResults.length;
  const coveredItems = checklistResults.filter(r => r.covered).length;
  const requiredItems = checklistResults.filter(r => r.required);
  const requiredCovered = requiredItems.filter(r => r.covered).length;

  const coverageScore = totalItems > 0 ? (coveredItems / totalItems) * 100 : 0;
  const requiredCoverageScore = requiredItems.length > 0 ? (requiredCovered / requiredItems.length) * 100 : 100;
  const missingRequiredItems = checklistResults
    .filter(r => r.required && !r.covered)
    .map(r => r.label);

  // Determine if notifications should be scheduled
  let notificationsScheduledAt: string | null = null;
  if (
    missingRequiredItems.length > 0 &&
    workflowConfig?.notifications?.on_missing_required?.enabled
  ) {
    const delayMinutes = workflowConfig.notifications.on_missing_required.delay_minutes || 30;
    const scheduledDate = new Date(Date.now() + delayMinutes * 60 * 1000);
    notificationsScheduledAt = scheduledDate.toISOString();
  }

  // Upsert workflow results
  const { error } = await supabase
    .from('meeting_workflow_results')
    .upsert({
      meeting_id: meetingId,
      call_type_id: callTypeId,
      org_id: orgId,
      checklist_results: checklistResults,
      coverage_score: Math.round(coverageScore * 100) / 100,
      required_coverage_score: Math.round(requiredCoverageScore * 100) / 100,
      missing_required_items: missingRequiredItems,
      forward_movement_signals: forwardMovementSignals,
      notifications_scheduled_at: notificationsScheduledAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meeting_id' });

  if (error) {
    console.error('Failed to save workflow results:', error.message);
  } else {
    console.log(`Saved workflow results: ${coveredItems}/${totalItems} items covered, ${forwardMovementSignals.length} forward signals`);
  }
}

/**
 * Analyze transcript with Claude
 */
async function analyzeTranscript(
  transcript: string,
  template: ScorecardTemplate | null,
  meetingTitle: string,
  existingTalkTimeData: { rep_pct: number | null; customer_pct: number | null }
): Promise<{ analysis: ScorecardAnalysis; tokensUsed: number; inputTokens: number; outputTokens: number }> {
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // Truncate transcript if too long
  const maxLength = 40000;
  const truncatedTranscript = transcript.length > maxLength
    ? transcript.substring(0, maxLength) + '\n\n[Truncated...]'
    : transcript;

  const prompt = buildAnalysisPrompt(
    truncatedTranscript,
    template,
    meetingTitle,
    existingTalkTimeData
  );

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
      system: 'You are a sales coaching analyst. Analyze calls and generate detailed scorecards. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
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

  // Parse JSON
  let analysis: ScorecardAnalysis;
  try {
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) jsonContent = jsonContent.slice(7);
    else if (jsonContent.startsWith('```')) jsonContent = jsonContent.slice(3);
    if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3);
    analysis = JSON.parse(jsonContent.trim());
  } catch (parseError) {
    console.error('Failed to parse Claude response:', content);
    throw new Error('Failed to parse AI response as JSON');
  }

  return { analysis, tokensUsed, inputTokens, outputTokens };
}

/**
 * Calculate final scorecard metrics
 */
function calculateScorecard(
  analysis: ScorecardAnalysis,
  template: ScorecardTemplate | null
): {
  metricScores: Record<string, { score: number; raw_value: any; feedback?: string; weight: number }>;
  overallScore: number;
} {
  const metrics = template?.metrics || DEFAULT_METRICS;
  const metricScores: Record<string, { score: number; raw_value: any; feedback?: string; weight: number }> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  for (const metric of metrics) {
    if (!metric.enabled) continue;

    let rawValue: any;
    let score: number;

    switch (metric.id) {
      case 'talk_ratio':
        rawValue = analysis.talk_time_analysis.rep_pct;
        score = calculateMetricScore(rawValue, metric);
        break;
      case 'discovery_questions':
        rawValue = analysis.discovery_questions.count;
        score = calculateMetricScore(rawValue, metric);
        break;
      case 'next_steps':
        rawValue = analysis.next_steps.established;
        score = rawValue ? 100 : 0;
        break;
      case 'monologue_detection':
        rawValue = analysis.talk_time_analysis.monologue_instances.length;
        // Inverse - fewer monologues = higher score
        score = metric.ideal_range
          ? calculateMetricScore(rawValue, metric)
          : Math.max(0, 100 - rawValue * 25);
        break;
      default:
        rawValue = 0;
        score = 0;
    }

    metricScores[metric.id] = {
      score: Math.round(score),
      raw_value: rawValue,
      weight: metric.weight,
    };

    totalWeight += metric.weight;
    weightedSum += score * metric.weight;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : analysis.overall_score;

  return { metricScores, overallScore };
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { meetingId, templateId, skipWorkflow }: RequestBody = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: 'Missing meetingId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get meeting data including call_type_id
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select(`
        id,
        title,
        transcript_text,
        owner_user_id,
        talk_time_rep_pct,
        talk_time_customer_pct,
        call_type_id
      `)
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!meeting.transcript_text || meeting.transcript_text.length < 100) {
      return new Response(
        JSON.stringify({ error: 'Meeting has no transcript or transcript too short' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's org
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', meeting.owner_user_id)
      .limit(1)
      .single();

    if (!membership?.org_id) {
      return new Response(
        JSON.stringify({ error: 'User not in an organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgId = membership.org_id;

    // Credit balance check before AI call
    const balanceCheck = await checkCreditBalance(supabase, orgId);
    if (!balanceCheck.allowed) {
      return new Response(
        JSON.stringify({ error: 'Insufficient credits' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get call type for this meeting (if classified)
    const callType = await getCallTypeForMeeting(supabase, meeting.call_type_id);

    // Check if coaching is enabled for this call type
    if (callType && !callType.enable_coaching) {
      console.log(`Coaching disabled for call type: ${callType.name}`);

      // Still process workflow if it has checklist items
      if (!skipWorkflow && callType.workflow_config?.checklist_items?.length) {
        const { results, forwardMovementSignals } = await analyzeWorkflowChecklist(
          meeting.transcript_text,
          callType.workflow_config.checklist_items
        );
        await saveWorkflowResults(
          supabase,
          meetingId,
          callType.id,
          orgId,
          results,
          forwardMovementSignals,
          callType.workflow_config
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: `Coaching disabled for call type: ${callType.name}`,
          meeting_id: meetingId,
          call_type: callType.name,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get structured summary to determine meeting type (fallback)
    const { data: structuredSummary } = await supabase
      .from('meeting_structured_summaries')
      .select('stage_indicators')
      .eq('meeting_id', meetingId)
      .single();

    const detectedType = callType?.name || structuredSummary?.stage_indicators?.detected_stage || 'general';

    // Get appropriate template (now prioritizes call_type_id)
    const template = await getTemplateForMeeting(supabase, orgId, templateId, meeting.call_type_id, detectedType);

    // Analyze transcript
    const startTime = Date.now();
    const { analysis, tokensUsed, inputTokens, outputTokens } = await analyzeTranscript(
      meeting.transcript_text,
      template,
      meeting.title,
      {
        rep_pct: meeting.talk_time_rep_pct,
        customer_pct: meeting.talk_time_customer_pct,
      }
    );
    const processingTimeMs = Date.now() - startTime;

    // Log AI cost event
    await logAICostEvent(
      supabase,
      meeting.owner_user_id,
      orgId,
      'anthropic',
      'claude-sonnet-4-20250514',
      inputTokens,
      outputTokens,
      'meeting_summary',
    );

    // Calculate final scores
    const { metricScores, overallScore } = calculateScorecard(analysis, template);
    const grade = calculateGrade(overallScore);

    // Calculate checklist completion
    const checklistItems = template?.checklist_items || [];
    const checklistResultsCount = Object.values(analysis.checklist_results).filter(r => r.covered).length;
    const checklistCompletionPct = checklistItems.length > 0
      ? Math.round((checklistResultsCount / checklistItems.length) * 100)
      : 0;
    const requiredItems = checklistItems.filter(i => i.required);
    const requiredCovered = requiredItems.filter(
      i => analysis.checklist_results[i.id]?.covered
    ).length;
    const checklistRequiredCompletionPct = requiredItems.length > 0
      ? Math.round((requiredCovered / requiredItems.length) * 100)
      : 100;

    // Save scorecard
    const scorecard = {
      meeting_id: meetingId,
      template_id: template?.id || null,
      org_id: orgId,
      rep_user_id: meeting.owner_user_id,
      overall_score: overallScore,
      grade,
      metric_scores: metricScores,
      talk_time_rep_pct: analysis.talk_time_analysis.rep_pct,
      talk_time_customer_pct: analysis.talk_time_analysis.customer_pct,
      discovery_questions_count: analysis.discovery_questions.count,
      discovery_questions_examples: analysis.discovery_questions.examples,
      next_steps_established: analysis.next_steps.established,
      next_steps_details: analysis.next_steps.details,
      monologue_instances: analysis.talk_time_analysis.monologue_instances,
      monologue_count: analysis.talk_time_analysis.monologue_instances.length,
      checklist_results: analysis.checklist_results,
      checklist_completion_pct: checklistCompletionPct,
      checklist_required_completion_pct: checklistRequiredCompletionPct,
      script_adherence_score: analysis.script_adherence.score,
      script_flow_analysis: {
        steps_covered: analysis.script_adherence.steps_covered,
        steps_missed: analysis.script_adherence.steps_missed,
        order_followed: analysis.script_adherence.order_followed,
        deviations: [],
      },
      strengths: analysis.strengths,
      areas_for_improvement: analysis.improvements,
      specific_feedback: analysis.specific_feedback,
      coaching_tips: analysis.coaching_tips,
      key_moments: analysis.key_moments,
      detected_meeting_type: analysis.detected_meeting_type,
      ai_model_used: 'claude-sonnet-4-20250514',
      tokens_used: tokensUsed,
      processing_time_ms: processingTimeMs,
      updated_at: new Date().toISOString(),
    };

    const { error: saveError } = await supabase
      .from('meeting_scorecards')
      .upsert(scorecard, { onConflict: 'meeting_id' });

    if (saveError) {
      throw new Error(`Failed to save scorecard: ${saveError.message}`);
    }

    console.log(`Generated scorecard for meeting ${meetingId}: Score ${overallScore} (${grade})`);

    // Process workflow checklist if call type has workflow config
    let workflowResults: {
      checklist_results: WorkflowChecklistResult[];
      forward_movement_signals: ForwardMovementSignal[];
      coverage_score: number;
      missing_required: string[];
    } | null = null;

    if (!skipWorkflow && callType?.workflow_config?.checklist_items?.length) {
      const { results, forwardMovementSignals } = await analyzeWorkflowChecklist(
        meeting.transcript_text,
        callType.workflow_config.checklist_items
      );

      await saveWorkflowResults(
        supabase,
        meetingId,
        callType.id,
        orgId,
        results,
        forwardMovementSignals,
        callType.workflow_config
      );

      // Calculate coverage for response
      const totalItems = results.length;
      const coveredItems = results.filter(r => r.covered).length;
      const missingRequired = results.filter(r => r.required && !r.covered).map(r => r.label);

      workflowResults = {
        checklist_results: results,
        forward_movement_signals: forwardMovementSignals,
        coverage_score: totalItems > 0 ? Math.round((coveredItems / totalItems) * 100) : 0,
        missing_required: missingRequired,
      };

      console.log(`Workflow results: ${coveredItems}/${totalItems} items covered, ${forwardMovementSignals.length} forward signals`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingId,
        call_type: callType?.name || null,
        scorecard: {
          overall_score: overallScore,
          grade,
          metric_scores: metricScores,
          strengths: analysis.strengths,
          improvements: analysis.improvements,
          coaching_tips: analysis.coaching_tips,
        },
        workflow: workflowResults,
        tokens_used: tokensUsed,
        processing_time_ms: processingTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in meeting-generate-scorecard:', error);
    await captureException(error, {
      tags: {
        function: 'meeting-generate-scorecard',
        integration: 'anthropic',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
