import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { logAICostEvent, extractAnthropicUsage } from '../_shared/costTracking.ts';

// =============================================================================
// Types
// =============================================================================

interface CoachingAnalysisRequest {
  user_id: string;
  org_id: string;
  meeting_id?: string;
  transcript?: string;
  analysis_type?: 'per_meeting' | 'weekly';
  mode?: 'correlate_win_loss' | 'generate_digest';
  weekly_metrics?: any;
  win_loss_correlation?: any;
  context?: {
    rep_name?: string;
    org_name?: string;
    products?: Array<{ name: string; description?: string } | string>;
    attendees_section?: string;
    contact_section?: string;
    relationship_history?: string;
    coaching_history_section?: string;
    deal_context?: { id?: string; name: string; stage: string; value?: number; close_date?: string; probability?: number };
    call_type?: any;
    action_items_summary?: any;
    meeting_title?: string;
    meeting_duration?: number;
    meeting_start?: string;
  };
}

interface AnalysisInsight {
  category: 'talk_ratio' | 'questions' | 'objections' | 'discovery' | 'closing';
  text: string;
  severity: 'high' | 'medium' | 'low';
  timestamp?: string;
}

interface AnalysisRecommendation {
  category: string;
  action: string;
  priority: number;
  rationale: string;
}

interface RawMetrics {
  total_words_rep: number;
  total_words_prospect: number;
  questions_asked: number;
  open_questions: number;
  closed_questions: number;
  objections_detected: number;
  objections_handled: number;
  longest_monologue_seconds?: number;
  monologues_over_76s?: number;
}

interface MeetingAnalysis {
  talk_ratio: number;
  question_quality_score: number;
  objection_handling_score: number;
  discovery_depth_score: number;
  overall_score?: number;
  insights: AnalysisInsight[];
  recommendations: AnalysisRecommendation[];
  quick_wins?: string[];
  one_thing_to_focus_on?: string;
  spin_breakdown?: { situation: number; problem: number; implication: number; need_payoff: number; total_questions: number };
  discovery_dimensions?: { pain_points: number; quantification: number; decision_process: number; timeline_urgency: number; competitive_landscape: number };
  raw_metrics: RawMetrics;
}

// =============================================================================
// Coaching Prompt Builder — based on coaching-analysis skill methodology
// =============================================================================

function buildCoachingPrompt(transcript: string, context: CoachingAnalysisRequest['context']): string {
  const repName = context?.rep_name || 'the rep';
  const orgName = context?.org_name || 'the organization';
  const meetingTitle = context?.meeting_title || 'Meeting';

  const sections: string[] = [];

  // Meeting metadata
  sections.push(`## MEETING: ${meetingTitle}`);
  if (context?.meeting_duration) sections.push(`Duration: ${context.meeting_duration} minutes`);
  if (context?.meeting_start) {
    const d = new Date(context.meeting_start).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    sections.push(`Date: ${d}`);
  }

  // Attendees with roles/titles
  if (context?.attendees_section) {
    sections.push(`\n## ATTENDEES\n${context.attendees_section}`);
  }

  // Primary contact
  if (context?.contact_section) {
    sections.push(`\n## PRIMARY CONTACT\n${context.contact_section}`);
  }

  // Relationship history (prior meetings, emails, activities)
  if (context?.relationship_history) {
    sections.push(`\n## RELATIONSHIP HISTORY\n${context.relationship_history}`);
  }

  // Deal context
  if (context?.deal_context) {
    const deal = context.deal_context;
    const parts = [`Deal: "${deal.name}" — Stage: ${deal.stage}`];
    if (deal.value) parts.push(`Value: $${deal.value.toLocaleString()}`);
    if (deal.close_date) parts.push(`Close: ${deal.close_date}`);
    if (deal.probability) parts.push(`Probability: ${deal.probability}%`);
    sections.push(`\n## DEAL CONTEXT\n${parts.join(', ')}`);
  }

  // Coaching history (prior scores, org winning patterns)
  if (context?.coaching_history_section) {
    sections.push(`\n## COACHING HISTORY FOR ${repName.toUpperCase()}\n${context.coaching_history_section}`);
  }

  // Call type classification
  if (context?.call_type) {
    const ct = context.call_type;
    const typeLabel = ct.call_type || ct.classification || ct.type || 'unknown';
    sections.push(`\n## CALL CLASSIFICATION\nType: ${typeLabel}`);
  }

  // Products/services
  if (context?.products && context.products.length > 0) {
    const productText = context.products
      .map((p: any) => typeof p === 'string' ? p : `${p.name}${p.description ? `: ${p.description}` : ''}`)
      .join('\n  - ');
    sections.push(`\n## PRODUCTS/SERVICES\n  - ${productText}`);
  }

  return `You are a world-class sales coach analyzing a meeting transcript for ${orgName}. You deliver specific, evidence-based coaching feedback. Every piece of feedback references a specific moment, quote, or data point from the conversation. You balance positive reinforcement with growth areas.

Your coaching philosophy: top performers are made, not born. The difference between a 20% close rate and a 40% close rate is a set of specific, learnable behaviors. Your job is to identify which behaviors to reinforce and which to adjust, with the precision of a sports coach reviewing game film.

Rep being coached: ${repName}

${sections.join('\n')}

## TRANSCRIPT
${transcript?.substring(0, 15000) || 'No transcript available'}

## ANALYSIS METHODOLOGY

Analyze this meeting following these steps:

### Step 1: Talk-to-Listen Ratio
Calculate the rep's talk percentage. Research-backed benchmarks:
- Top performers: 43% talk / 57% listen (Gong, 500K+ calls)
- Average: 65% talk / 35% listen
- Poor: 72%+ talk / 28%- listen
Flag monologues > 76 seconds — engagement drops sharply after 76s (Gong research). Note what the rep was saying during each monologue.

### Step 2: Question Quality (SPIN Framework)
Categorize every question the rep asked using SPIN (Neil Rackham, 35,000 sales calls):
- Situation questions (1pt) — establish facts/context. Benchmark: 2-4 per call.
- Problem questions (2pts) — uncover pain/challenges. Benchmark: 3-5 per call.
- Implication questions (3pts) — explore impact/consequences. Benchmark: 2-4 per call.
- Need-Payoff questions (4pts) — connect solution to buyer value. Benchmark: 1-3 per call.
Winning calls average 11-14 questions (Gong, 2023). Losing calls: 6-8.
Flag: leading questions (>20% = seeking validation), question clusters (4+ rapid-fire = interrogation), no follow-up to great answers.

### Step 3: Objection Handling (1-5 Scale)
Score each objection response:
- Level 5 (Expert): Acknowledge + Explore root cause + Reframe + Evidence/case study
- Level 4 (Strong): Acknowledge + Explore + Reframe
- Level 3 (Adequate): Acknowledge + Direct Response
- Level 2 (Weak): Deflect, rush past, or pivot to features
- Level 1 (Poor): Ignore, talk over, or argue

### Step 4: Discovery Depth (Weighted Composite, 1-5 each)
- Pain Points Surfaced (30%): Was root cause uncovered and impact quantified?
- Quantification Attempted (25%): Were specific numbers discussed (revenue impact, time saved)?
- Decision Process Explored (20%): Were stakeholders mapped, criteria understood?
- Timeline and Urgency (15%): Was a compelling event established with cost of delay?
- Competitive Landscape (10%): Were alternatives identified, differentiation established?

### Step 5: Winning Pattern Comparison
Compare this call's metrics to the coaching history and org winning patterns provided above.
If no org data is available, use the industry benchmarks from Steps 1-4.
Show specific gaps and improvements from prior coaching sessions.

## OUTPUT FORMAT
Return JSON only (no markdown code blocks):
{
  "talk_ratio": <number 0-100>,
  "question_quality_score": <number 0.0-1.0>,
  "objection_handling_score": <number 0.0-1.0>,
  "discovery_depth_score": <number 0.0-1.0>,
  "overall_score": <number 0.0-1.0, weighted: talk 20%, questions 25%, objections 25%, discovery 30%>,
  "insights": [
    {
      "category": "talk_ratio|questions|objections|discovery|closing",
      "text": "Specific feedback referencing a moment/quote from the transcript",
      "severity": "high|medium|low",
      "timestamp": "approximate time if identifiable"
    }
  ],
  "recommendations": [
    {
      "category": "talk_ratio|questions|objections|discovery|closing",
      "action": "Specific actionable advice with an example script to use",
      "priority": 1-5,
      "rationale": "Why this matters with benchmark data"
    }
  ],
  "quick_wins": [
    "Specific positive behavior to reinforce (with quote if possible)"
  ],
  "one_thing_to_focus_on": "The single highest-leverage behavior change for the next call with a specific technique",
  "spin_breakdown": {
    "situation": <count>,
    "problem": <count>,
    "implication": <count>,
    "need_payoff": <count>,
    "total_questions": <count>
  },
  "discovery_dimensions": {
    "pain_points": <1-5>,
    "quantification": <1-5>,
    "decision_process": <1-5>,
    "timeline_urgency": <1-5>,
    "competitive_landscape": <1-5>
  },
  "raw_metrics": {
    "total_words_rep": <number>,
    "total_words_prospect": <number>,
    "questions_asked": <number>,
    "open_questions": <number>,
    "closed_questions": <number>,
    "objections_detected": <number>,
    "objections_handled": <number>,
    "longest_monologue_seconds": <estimated number>,
    "monologues_over_76s": <count>
  }
}

IMPORTANT:
- Every insight MUST reference a specific moment, quote, or data point
- Recommendations MUST include example scripts — not generic "ask better questions"
- Compare to coaching history and winning patterns when provided
- Positive feedback first (quick_wins), then growth areas
- Use encouraging language: "opportunity", "next time", "stronger approach" — never "bad", "wrong", "failed"
- If this is the rep's first analysis, note "This is your first coaching analysis — tracking starts now"`;
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    const {
      user_id,
      org_id,
      meeting_id,
      transcript,
      analysis_type = 'per_meeting',
      context,
    } = await req.json() as CoachingAnalysisRequest;

    if (analysis_type === 'per_meeting') {
      const result = await analyzeMeeting(transcript || '', user_id, org_id, context, supabase);

      // Store in coaching_analyses table
      await supabase.from('coaching_analyses').insert({
        user_id,
        org_id,
        meeting_id,
        analysis_type: 'per_meeting',
        talk_ratio: result.talk_ratio,
        question_quality_score: result.question_quality_score,
        objection_handling_score: result.objection_handling_score,
        discovery_depth_score: result.discovery_depth_score,
        insights: result.insights,
        recommendations: result.recommendations,
        raw_metrics: result.raw_metrics,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (analysis_type === 'weekly') {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: analyses } = await supabase
        .from('coaching_analyses')
        .select('talk_ratio, question_quality_score, objection_handling_score, discovery_depth_score, insights, recommendations, raw_metrics')
        .eq('user_id', user_id)
        .eq('analysis_type', 'per_meeting')
        .gte('created_at', oneWeekAgo)
        .order('created_at', { ascending: false });

      // Fetch Phase 5 data for enhanced digest
      const [patternsResult, competitiveResult, progressionResult] = await Promise.all([
        // Active pipeline patterns for this org
        supabase.rpc('get_active_pipeline_patterns', { p_org_id: org_id, p_limit: 3 }),
        // Competitive trends — recent competitor profiles
        supabase
          .from('competitor_profiles')
          .select('competitor_name, mention_count, win_count, loss_count, win_rate, common_strengths, common_weaknesses, last_mentioned_at')
          .eq('org_id', org_id)
          .order('last_mentioned_at', { ascending: false })
          .limit(5),
        // Coaching skill progression — last 8 weeks for this rep
        supabase.rpc('get_coaching_progression', { p_org_id: org_id, p_user_id: user_id, p_weeks: 8 }),
      ]);

      const pipelinePatterns = patternsResult.data || [];
      const competitiveProfiles = competitiveResult.data || [];
      const skillProgression = progressionResult.data || [];

      const digest = generateEnhancedWeeklyDigest(
        analyses || [],
        pipelinePatterns,
        competitiveProfiles,
        skillProgression,
      );

      // Store weekly digest
      await supabase.from('coaching_analyses').insert({
        user_id,
        org_id,
        analysis_type: 'weekly',
        ...digest,
      });

      // Upsert coaching_skill_progression for this week
      const weekStart = getWeekStart(new Date());
      const meetingsAnalysed = (analyses || []).length;
      if (meetingsAnalysed > 0) {
        await supabase.from('coaching_skill_progression').upsert({
          org_id,
          user_id,
          week_start: weekStart,
          talk_ratio: digest.talk_ratio,
          question_quality_score: digest.question_quality_score,
          objection_handling_score: digest.objection_handling_score,
          discovery_depth_score: digest.discovery_depth_score,
          overall_score: digest.overall_score,
          meetings_analysed: meetingsAnalysed,
          metadata: {
            pipeline_patterns_count: pipelinePatterns.length,
            competitive_profiles_count: competitiveProfiles.length,
          },
        }, { onConflict: 'org_id,user_id,week_start' });
      }

      return new Response(JSON.stringify(digest), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mode-based handlers for orchestrator adapter compatibility
    const { mode, weekly_metrics, win_loss_correlation } = await Promise.resolve({
      mode: (await req.clone().json()).mode,
      weekly_metrics: (await req.clone().json()).weekly_metrics,
      win_loss_correlation: (await req.clone().json()).win_loss_correlation,
    }).catch(() => ({ mode: undefined, weekly_metrics: undefined, win_loss_correlation: undefined }));

    if (mode === 'correlate_win_loss') {
      const correlation = await correlateWinLoss(supabase, org_id, user_id, weekly_metrics);
      return new Response(JSON.stringify(correlation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'generate_digest') {
      const digest = await generateAIDigest(supabase, org_id, user_id, weekly_metrics, win_loss_correlation);
      return new Response(JSON.stringify(digest), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid analysis_type or mode' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[coaching-analysis] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// Analyze a single meeting transcript using Claude Haiku
// =============================================================================

async function analyzeMeeting(
  transcript: string,
  userId: string,
  orgId: string,
  context: CoachingAnalysisRequest['context'],
  supabase: any,
): Promise<MeetingAnalysis> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = buildCoachingPrompt(transcript, context);

  try {
    console.log('[coaching-analysis] Calling Anthropic API with enriched context...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[coaching-analysis] Anthropic API returned ${response.status}: ${errText.substring(0, 300)}`);
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const aiResult = await response.json();

    // Cost tracking
    const usage = extractAnthropicUsage(aiResult);
    await logAICostEvent(
      supabase, userId, orgId,
      'anthropic', 'claude-haiku-4-5-20251001',
      usage.inputTokens, usage.outputTokens,
      'coaching-analysis',
      { meeting_id: context?.meeting_title },
    );

    const text = aiResult.content?.[0]?.text || '';
    const stopReason = aiResult.stop_reason;

    if (!text) {
      console.error('[coaching-analysis] Empty AI response content');
      throw new Error('Empty AI response');
    }

    if (stopReason === 'max_tokens') {
      console.warn('[coaching-analysis] Response was truncated (max_tokens reached)');
    }

    // Extract JSON robustly — handle code blocks, surrounding text
    let jsonText = text.trim();
    const codeFenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeFenceMatch) {
      jsonText = codeFenceMatch[1].trim();
    }
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[coaching-analysis] No JSON object found in AI response:', text.substring(0, 300));
      throw new Error('No JSON in AI response');
    }

    let analysis: any;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      // Attempt to repair truncated JSON
      console.warn('[coaching-analysis] JSON parse failed, attempting repair');
      let repaired = jsonMatch[0];
      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      const opens = (repaired.match(/[\[{]/g) || []).length;
      const closes = (repaired.match(/[\]}]/g) || []).length;
      for (let i = 0; i < opens - closes; i++) {
        const lastOpen = Math.max(repaired.lastIndexOf('['), repaired.lastIndexOf('{'));
        const lastClose = Math.max(repaired.lastIndexOf(']'), repaired.lastIndexOf('}'));
        repaired += (lastOpen > lastClose && repaired[lastOpen] === '[') ? ']' : '}';
      }
      analysis = JSON.parse(repaired);
      console.log('[coaching-analysis] JSON repair succeeded');
    }

    return {
      talk_ratio: analysis.talk_ratio || 50,
      question_quality_score: analysis.question_quality_score || 0.5,
      objection_handling_score: analysis.objection_handling_score || 0.5,
      discovery_depth_score: analysis.discovery_depth_score || 0.5,
      overall_score: analysis.overall_score,
      insights: analysis.insights || [],
      recommendations: analysis.recommendations || [],
      quick_wins: analysis.quick_wins || [],
      one_thing_to_focus_on: analysis.one_thing_to_focus_on,
      spin_breakdown: analysis.spin_breakdown,
      discovery_dimensions: analysis.discovery_dimensions,
      raw_metrics: analysis.raw_metrics || {
        total_words_rep: 0,
        total_words_prospect: 0,
        questions_asked: 0,
        open_questions: 0,
        closed_questions: 0,
        objections_detected: 0,
        objections_handled: 0,
      },
    };
  } catch (error) {
    console.error('[coaching-analysis] AI analysis failed:', error);
    return {
      talk_ratio: 50,
      question_quality_score: 0.5,
      objection_handling_score: 0.5,
      discovery_depth_score: 0.5,
      insights: [{ category: 'discovery', text: 'Analysis failed — will retry on next run', severity: 'high' }],
      recommendations: [{ category: 'general', action: 'Retry analysis', priority: 1, rationale: 'AI analysis error' }],
      raw_metrics: {
        total_words_rep: 0,
        total_words_prospect: 0,
        questions_asked: 0,
        open_questions: 0,
        closed_questions: 0,
        objections_detected: 0,
        objections_handled: 0,
      },
    };
  }
}

// =============================================================================
// Generate enhanced weekly coaching digest with Phase 5 data
// =============================================================================

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function generateEnhancedWeeklyDigest(
  analyses: any[],
  pipelinePatterns: any[],
  competitiveProfiles: any[],
  skillProgression: any[],
) {
  if (analyses.length === 0) {
    return {
      talk_ratio: null,
      question_quality_score: null,
      objection_handling_score: null,
      discovery_depth_score: null,
      overall_score: null,
      insights: [],
      recommendations: [],
      pipeline_patterns: pipelinePatterns.map(p => ({
        title: p.title,
        description: p.description,
        severity: p.severity,
        pattern_type: p.pattern_type,
      })),
      competitive_trends: competitiveProfiles.map(c => ({
        name: c.competitor_name,
        mentions: c.mention_count,
        win_rate: c.win_rate,
      })),
      skill_progression: skillProgression,
      raw_metrics: {
        meetings_analyzed: 0,
        period: '7_days',
      },
    };
  }

  const avgTalkRatio = analyses.reduce((sum, a) => sum + (a.talk_ratio || 0), 0) / analyses.length;
  const avgQuestionQuality = analyses.reduce((sum, a) => sum + (a.question_quality_score || 0), 0) / analyses.length;
  const avgObjectionHandling = analyses.reduce((sum, a) => sum + (a.objection_handling_score || 0), 0) / analyses.length;
  const avgDiscoveryDepth = analyses.reduce((sum, a) => sum + (a.discovery_depth_score || 0), 0) / analyses.length;
  const overallScore = avgQuestionQuality * 0.25 + avgObjectionHandling * 0.25 + avgDiscoveryDepth * 0.30 + (1 - Math.abs(avgTalkRatio - 43) / 57) * 0.20;

  const allInsights = analyses.flatMap(a => a.insights || []);
  const topInsights = allInsights
    .sort((a, b) => {
      const severityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
      return (severityScore[b.severity] || 0) - (severityScore[a.severity] || 0);
    })
    .slice(0, 10);

  const allRecommendations = analyses.flatMap(a => a.recommendations || []);
  const topRecommendations = allRecommendations
    .sort((a, b) => (a.priority || 5) - (b.priority || 5))
    .slice(0, 5);

  // Build progression comparison
  const progressionComparison = buildProgressionComparison(
    { talk_ratio: avgTalkRatio, question_quality_score: avgQuestionQuality, objection_handling_score: avgObjectionHandling, discovery_depth_score: avgDiscoveryDepth },
    skillProgression,
  );

  // Build competitive trend summary
  const competitiveTrends = competitiveProfiles.map(c => ({
    name: c.competitor_name,
    mentions: c.mention_count,
    win_rate: c.win_rate,
    top_strengths: (c.common_strengths || []).slice(0, 3),
    top_weaknesses: (c.common_weaknesses || []).slice(0, 3),
  }));

  // Build pattern summary
  const patternSummary = pipelinePatterns.map(p => ({
    title: p.title,
    description: p.description,
    severity: p.severity,
    pattern_type: p.pattern_type,
    affected_deals_count: (p.affected_deal_ids || []).length,
  }));

  return {
    talk_ratio: Math.round(avgTalkRatio * 100) / 100,
    question_quality_score: Math.round(avgQuestionQuality * 100) / 100,
    objection_handling_score: Math.round(avgObjectionHandling * 100) / 100,
    discovery_depth_score: Math.round(avgDiscoveryDepth * 100) / 100,
    overall_score: Math.round(overallScore * 100) / 100,
    insights: topInsights,
    recommendations: topRecommendations,
    pipeline_patterns: patternSummary,
    competitive_trends: competitiveTrends,
    skill_progression: skillProgression,
    progression_comparison: progressionComparison,
    raw_metrics: {
      meetings_analyzed: analyses.length,
      period: '7_days',
    },
  };
}

function buildProgressionComparison(
  current: { talk_ratio: number; question_quality_score: number; objection_handling_score: number; discovery_depth_score: number },
  history: any[],
): any {
  if (history.length === 0) {
    return { status: 'first_week', message: 'This is your first coaching analysis — tracking starts now.' };
  }

  const prev = history[0]; // Most recent prior week
  const fourWeekAvg = history.length >= 4
    ? {
        talk_ratio: history.slice(0, 4).reduce((s, h) => s + (h.talk_ratio || 0), 0) / 4,
        question_quality_score: history.slice(0, 4).reduce((s, h) => s + (h.question_quality_score || 0), 0) / 4,
        objection_handling_score: history.slice(0, 4).reduce((s, h) => s + (h.objection_handling_score || 0), 0) / 4,
        discovery_depth_score: history.slice(0, 4).reduce((s, h) => s + (h.discovery_depth_score || 0), 0) / 4,
      }
    : null;

  const metrics = ['question_quality_score', 'objection_handling_score', 'discovery_depth_score'] as const;
  const improving: string[] = [];
  const declining: string[] = [];

  for (const metric of metrics) {
    const diff = (current[metric] || 0) - (prev[metric] || 0);
    const label = metric.replace(/_score$/, '').replace(/_/g, ' ');
    if (diff > 0.05) improving.push(label);
    else if (diff < -0.05) declining.push(label);
  }

  // Talk ratio: closer to 43% is better
  const talkDiff = Math.abs(current.talk_ratio - 43) - Math.abs((prev.talk_ratio || 50) - 43);
  if (talkDiff < -3) improving.push('talk ratio');
  else if (talkDiff > 3) declining.push('talk ratio');

  return {
    status: 'has_history',
    weeks_tracked: history.length,
    vs_last_week: {
      improving,
      declining,
      talk_ratio_delta: Math.round((current.talk_ratio - (prev.talk_ratio || 50)) * 100) / 100,
      overall_trend: improving.length > declining.length ? 'improving' : declining.length > improving.length ? 'declining' : 'stable',
    },
    four_week_avg: fourWeekAvg,
  };
}

// =============================================================================
// Correlate win/loss patterns with coaching metrics
// =============================================================================

async function correlateWinLoss(supabase: any, orgId: string, userId: string, weeklyMetrics: any) {
  // Fetch recent closed deals for this user
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: closedDeals } = await supabase
    .from('deals')
    .select('id, name, stage, amount, close_date, status')
    .eq('owner_id', userId)
    .gte('updated_at', threeMonthsAgo)
    .in('status', ['closed_won', 'closed_lost']);

  const wins = (closedDeals || []).filter((d: any) => d.status === 'closed_won');
  const losses = (closedDeals || []).filter((d: any) => d.status === 'closed_lost');

  return {
    period: '90_days',
    total_closed: (closedDeals || []).length,
    wins: wins.length,
    losses: losses.length,
    win_rate: (closedDeals || []).length > 0 ? wins.length / (closedDeals || []).length : null,
    total_value_won: wins.reduce((s: number, d: any) => s + (d.amount || 0), 0),
    total_value_lost: losses.reduce((s: number, d: any) => s + (d.amount || 0), 0),
    weekly_metrics: weeklyMetrics,
  };
}

// =============================================================================
// Generate AI-powered coaching digest with all context
// =============================================================================

async function generateAIDigest(supabase: any, orgId: string, userId: string, weeklyMetrics: any, winLossCorrelation: any) {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return { summary: 'AI digest unavailable — API key not configured', blocks: [] };
  }

  // Fetch org learning insights
  const { data: orgInsights } = await supabase.rpc('get_active_org_insights', { p_org_id: orgId, p_limit: 5 });

  const prompt = `You are generating a weekly coaching digest for a sales rep. Create a concise, actionable summary.

WEEKLY METRICS:
${JSON.stringify(weeklyMetrics, null, 2)}

WIN/LOSS CORRELATION (last 90 days):
${JSON.stringify(winLossCorrelation, null, 2)}

ORG LEARNING INSIGHTS (anonymised team intelligence):
${JSON.stringify(orgInsights || [], null, 2)}

Generate a JSON response with:
{
  "summary": "2-3 sentence executive summary of this week's coaching",
  "weekly_wins": ["specific positive moments to celebrate"],
  "data_backed_insights": [
    {
      "insight": "specific, data-backed coaching insight referencing actual metrics",
      "evidence": "the data that supports this",
      "action": "concrete next step"
    }
  ],
  "competitive_note": "brief note on competitive trends if relevant, or null",
  "pipeline_note": "brief note on pipeline patterns if relevant, or null",
  "team_intelligence_tip": "anonymised tip from org learning insights if available, or null",
  "overall_score": 0.0-1.0,
  "trend": "improving|stable|declining"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API returned ${response.status}`);
    }

    const aiResult = await response.json();

    // Cost tracking
    const usage = extractAnthropicUsage(aiResult);
    await logAICostEvent(
      supabase, userId, orgId,
      'anthropic', 'claude-haiku-4-5-20251001',
      usage.inputTokens, usage.outputTokens,
      'coaching-analysis-digest',
      {},
    );

    const text = aiResult.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI digest response');

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[coaching-analysis] AI digest generation failed:', error);
    return {
      summary: `This week: ${weeklyMetrics?.raw_metrics?.meetings_analyzed || 0} meetings analyzed.`,
      weekly_wins: [],
      data_backed_insights: [],
      competitive_note: null,
      pipeline_note: null,
      team_intelligence_tip: null,
      overall_score: weeklyMetrics?.overall_score || null,
      trend: 'stable',
    };
  }
}
