import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';

interface CoachingAnalysisRequest {
  user_id: string;
  org_id: string;
  meeting_id?: string;
  transcript?: string;
  analysis_type?: 'per_meeting' | 'weekly';
}

interface AnalysisInsight {
  category: 'talk_ratio' | 'questions' | 'objections' | 'discovery' | 'closing';
  text: string;
  severity: 'high' | 'medium' | 'low';
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
}

interface MeetingAnalysis {
  talk_ratio: number;
  question_quality_score: number;
  objection_handling_score: number;
  discovery_depth_score: number;
  insights: AnalysisInsight[];
  recommendations: AnalysisRecommendation[];
  raw_metrics: RawMetrics;
}

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
    } = await req.json() as CoachingAnalysisRequest;

    if (analysis_type === 'per_meeting') {
      // Single meeting micro-feedback
      const result = await analyzeMeeting(transcript || '', user_id);

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
      // Weekly digest: aggregate past 7 days
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: analyses } = await supabase
        .from('coaching_analyses')
        .select('talk_ratio, question_quality_score, objection_handling_score, discovery_depth_score, insights, recommendations, raw_metrics')
        .eq('user_id', user_id)
        .eq('analysis_type', 'per_meeting')
        .gte('created_at', oneWeekAgo)
        .order('created_at', { ascending: false });

      const digest = generateWeeklyDigest(analyses || []);

      // Store weekly digest
      await supabase.from('coaching_analyses').insert({
        user_id,
        org_id,
        analysis_type: 'weekly',
        ...digest,
      });

      return new Response(JSON.stringify(digest), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid analysis_type' }), {
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

/**
 * Analyze a single meeting transcript using Claude Haiku
 */
async function analyzeMeeting(transcript: string, userId: string): Promise<MeetingAnalysis> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `Analyze this sales meeting transcript for coaching insights.

Return JSON:
{
  "talk_ratio": <number 0-100, rep's speaking percentage>,
  "question_quality_score": <number 0-1>,
  "objection_handling_score": <number 0-1>,
  "discovery_depth_score": <number 0-1>,
  "insights": [
    { "category": "talk_ratio|questions|objections|discovery|closing", "text": "specific feedback", "severity": "high|medium|low" }
  ],
  "recommendations": [
    { "category": "...", "action": "specific actionable advice", "priority": 1-5, "rationale": "why" }
  ],
  "raw_metrics": {
    "total_words_rep": <number>,
    "total_words_prospect": <number>,
    "questions_asked": <number>,
    "open_questions": <number>,
    "closed_questions": <number>,
    "objections_detected": <number>,
    "objections_handled": <number>
  }
}

Transcript:
${transcript?.substring(0, 15000) || 'No transcript available'}`;

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
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const aiResult = await response.json();
    const text = aiResult.content?.[0]?.text || '{}';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      talk_ratio: analysis.talk_ratio || 50,
      question_quality_score: analysis.question_quality_score || 0.5,
      objection_handling_score: analysis.objection_handling_score || 0.5,
      discovery_depth_score: analysis.discovery_depth_score || 0.5,
      insights: analysis.insights || [],
      recommendations: analysis.recommendations || [],
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
    // Return default analysis
    return {
      talk_ratio: 50,
      question_quality_score: 0.5,
      objection_handling_score: 0.5,
      discovery_depth_score: 0.5,
      insights: [{ category: 'discovery', text: 'Analysis failed', severity: 'high' }],
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

/**
 * Generate weekly coaching digest from multiple analyses
 */
function generateWeeklyDigest(analyses: any[]) {
  if (analyses.length === 0) {
    return {
      talk_ratio: null,
      question_quality_score: null,
      objection_handling_score: null,
      discovery_depth_score: null,
      insights: [],
      recommendations: [],
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

  // Collect top insights (most severe, most recent)
  const allInsights = analyses.flatMap(a => a.insights || []);
  const topInsights = allInsights
    .sort((a, b) => {
      const severityScore = { high: 3, medium: 2, low: 1 };
      return (severityScore[b.severity] || 0) - (severityScore[a.severity] || 0);
    })
    .slice(0, 10);

  // Collect top recommendations (highest priority)
  const allRecommendations = analyses.flatMap(a => a.recommendations || []);
  const topRecommendations = allRecommendations
    .sort((a, b) => (a.priority || 5) - (b.priority || 5))
    .slice(0, 5);

  return {
    talk_ratio: Math.round(avgTalkRatio * 100) / 100,
    question_quality_score: Math.round(avgQuestionQuality * 100) / 100,
    objection_handling_score: Math.round(avgObjectionHandling * 100) / 100,
    discovery_depth_score: Math.round(avgDiscoveryDepth * 100) / 100,
    insights: topInsights,
    recommendations: topRecommendations,
    raw_metrics: {
      meetings_analyzed: analyses.length,
      period: '7_days',
    },
  };
}
