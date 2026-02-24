/**
 * Supabase Edge Function: Calculate Deal Health Scores
 *
 * Scheduled to run daily via cron job to refresh health scores for all active deals.
 * Only recalculates scores that are stale (older than 24 hours).
 *
 * Schedule: Daily at 2:00 AM UTC
 * Command: supabase functions schedule calculate-deal-health --cron "0 2 * * *"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

// Types
interface DealHealthMetrics {
  daysInStage: number;
  daysSinceLastMeeting: number | null;
  daysSinceLastActivity: number | null;
  sentimentData: {
    average: number | null;
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
  };
  engagementData: {
    meetingCount30Days: number;
    activityCount30Days: number;
    avgResponseTimeHours: number | null;
  };
}

interface SignalScores {
  stageVelocity: number;
  sentiment: number;
  engagement: number;
  activity: number;
  responseTime: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    // Get all active deals with their existing health scores
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id,
        owner_id,
        stage_id,
        stage_changed_at,
        company,
        expected_close_date,
        deal_stages!inner(name),
        deal_health_scores(id, last_calculated_at)
      `)
      .eq('status', 'active')
      .not('deal_stages.name', 'in', '("Signed","Lost")');

    if (dealsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch deals', details: dealsError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    // Filter for stale scores (older than 24 hours)
    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - 24);

    const dealsToUpdate: any[] = [];
    let skippedCount = 0;

    for (const deal of deals || []) {
      const healthScore = (deal as any).deal_health_scores?.[0];

      if (!healthScore) {
        // No health score exists
        dealsToUpdate.push(deal);
      } else {
        const lastCalculated = new Date(healthScore.last_calculated_at);
        if (lastCalculated < staleThreshold) {
          // Score is stale
          dealsToUpdate.push(deal);
        } else {
          // Score is fresh
          skippedCount++;
        }
      }
    }
    const results = {
      total_deals: deals?.length || 0,
      updated: 0,
      skipped: skippedCount,
      failed: 0,
      errors: [] as string[],
    };

    // Calculate health for each stale deal
    for (const deal of dealsToUpdate) {
      try {
        const healthScore = await calculateDealHealth(supabase, deal.id);
        if (healthScore) {
          results.updated++;
        } else {
          results.failed++;
          results.errors.push(`Failed to calculate health for deal ${deal.id}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error for deal ${deal.id}: ${error.message}`);
      }
    }
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

/**
 * Calculate health score for a single deal
 */
async function calculateDealHealth(supabase: any, dealId: string): Promise<any | null> {
  try {
    // Fetch deal metrics
    const metrics = await fetchDealMetrics(supabase, dealId);
    if (!metrics) {
      return null;
    }

    // Calculate individual signal scores
    const scores = calculateSignalScores(metrics);

    // Calculate overall health score (weighted average)
    const weights = {
      stageVelocity: 0.30,
      sentiment: 0.25,
      engagement: 0.20,
      activity: 0.15,
      responseTime: 0.10,
    };

    const overallScore = Math.round(
      scores.stageVelocity * weights.stageVelocity +
      scores.sentiment * weights.sentiment +
      scores.engagement * weights.engagement +
      scores.activity * weights.activity +
      scores.responseTime * weights.responseTime
    );

    // Determine health status
    const healthStatus =
      overallScore >= 75 ? 'healthy' :
      overallScore >= 50 ? 'warning' :
      overallScore >= 25 ? 'critical' : 'stalled';

    // Identify risk factors
    const riskFactors = identifyRiskFactors(metrics, scores);
    const riskLevel = determineRiskLevel(overallScore, riskFactors);

    // Prepare health score data
    const healthScoreData = {
      deal_id: dealId,
      user_id: metrics.ownerId,
      overall_health_score: overallScore,
      health_status: healthStatus,
      stage_velocity_score: scores.stageVelocity,
      sentiment_score: scores.sentiment,
      engagement_score: scores.engagement,
      activity_score: scores.activity,
      response_time_score: scores.responseTime,
      days_in_current_stage: metrics.daysInStage,
      days_since_last_meeting: metrics.daysSinceLastMeeting,
      days_since_last_activity: metrics.daysSinceLastActivity,
      avg_sentiment_last_3_meetings: metrics.sentimentData.average,
      sentiment_trend: metrics.sentimentData.trend,
      meeting_count_last_30_days: metrics.engagementData.meetingCount30Days,
      activity_count_last_30_days: metrics.engagementData.activityCount30Days,
      avg_response_time_hours: metrics.engagementData.avgResponseTimeHours,
      risk_factors: riskFactors,
      risk_level: riskLevel,
      predicted_close_probability: Math.min(95, Math.max(5, overallScore)),
      predicted_days_to_close: null,
      last_calculated_at: new Date().toISOString(),
    };

    // Upsert health score
    const { data: savedScore, error: upsertError } = await supabase
      .from('deal_health_scores')
      .upsert(healthScoreData, { onConflict: 'deal_id' })
      .select()
      .single();

    if (upsertError) {
      return null;
    }

    // Save historical snapshot
    await supabase.from('deal_health_history').insert({
      deal_id: dealId,
      overall_health_score: overallScore,
      stage_velocity_score: scores.stageVelocity,
      sentiment_score: scores.sentiment,
      engagement_score: scores.engagement,
      activity_score: scores.activity,
      response_time_score: scores.responseTime,
      health_status: healthStatus,
      risk_level: riskLevel,
      risk_factors: riskFactors,
      snapshot_at: new Date().toISOString(),
    });
    return savedScore;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch raw metrics for health calculation
 */
async function fetchDealMetrics(supabase: any, dealId: string): Promise<(DealHealthMetrics & { ownerId: string; stageName: string }) | null> {
  try {
    // 1. Get deal data
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select(`
        id,
        owner_id,
        stage_id,
        stage_changed_at,
        created_at,
        company,
        expected_close_date,
        deal_stages!inner(name)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      return null;
    }

    // 2. Calculate days in current stage
    const stageChangedAt = deal.stage_changed_at ? new Date(deal.stage_changed_at) : new Date(deal.created_at);
    const now = new Date();
    const daysInStage = Math.floor((now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60 * 24));

    // 3. Get meeting data (last 30 days and last 3 meetings for sentiment)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: meetings, error: meetingsError } = await supabase
      .from('meetings')
      .select('id, meeting_start, sentiment_score')
      .eq('owner_user_id', deal.owner_id)
      .order('meeting_start', { ascending: false })
      .limit(10);

    if (meetingsError) {
    }

    const meetingsLast30Days = meetings?.filter((m: any) =>
      m.meeting_start && new Date(m.meeting_start) >= new Date(thirtyDaysAgo)
    ) || [];

    const lastThreeMeetings = meetings?.slice(0, 3).filter((m: any) => m.sentiment_score !== null) || [];

    // Calculate sentiment metrics
    const sentimentScores = lastThreeMeetings
      .map((m: any) => m.sentiment_score)
      .filter((s: any): s is number => s !== null);

    const avgSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((sum: number, s: number) => sum + s, 0) / sentimentScores.length
      : null;

    // Determine sentiment trend
    let sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
    if (sentimentScores.length >= 3) {
      const recent = sentimentScores[0];
      const older = (sentimentScores[1] + sentimentScores[2]) / 2;
      const change = recent - older;

      if (change > 0.1) sentimentTrend = 'improving';
      else if (change < -0.1) sentimentTrend = 'declining';
      else sentimentTrend = 'stable';
    }

    // Days since last meeting
    const lastMeeting = meetings && meetings.length > 0 ? meetings[0] : null;
    const daysSinceLastMeeting = lastMeeting?.meeting_start
      ? Math.floor((now.getTime() - new Date(lastMeeting.meeting_start).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // 4. Get activity data
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('id, created_at')
      .eq('user_id', deal.owner_id)
      .eq('deal_id', dealId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });

    if (activitiesError) {
    }

    const activityCount30Days = activities?.length || 0;
    const lastActivity = activities && activities.length > 0 ? activities[0] : null;
    const daysSinceLastActivity = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // 5. Calculate average response time (simplified - based on activity frequency)
    let avgResponseTimeHours: number | null = null;
    if (activityCount30Days > 0) {
      const hoursPerActivity = (30 * 24) / activityCount30Days;
      avgResponseTimeHours = Math.round(hoursPerActivity);
    }

    return {
      ownerId: deal.owner_id,
      stageName: deal.deal_stages.name,
      daysInStage,
      daysSinceLastMeeting,
      daysSinceLastActivity,
      sentimentData: {
        average: avgSentiment,
        trend: sentimentTrend,
      },
      engagementData: {
        meetingCount30Days: meetingsLast30Days.length,
        activityCount30Days,
        avgResponseTimeHours,
      },
    };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate stage velocity score based on days in stage and stage name
 */
function calculateStageVelocityScore(daysInStage: number, stageName: string): number {
  const stageExpectations: Record<string, number> = {
    'SQL': 7,
    'Opportunity': 14,
    'Verbal': 7,
    'Signed': 999,
  };

  const expected = stageExpectations[stageName] || 14;
  const ratio = daysInStage / expected;

  if (ratio <= 0.5) return 100;
  if (ratio <= 0.75) return 90;
  if (ratio <= 1.0) return 75;
  if (ratio <= 1.5) return 50;
  if (ratio <= 2.0) return 25;
  return 10;
}

/**
 * Calculate sentiment score
 */
function calculateSentimentScore(avgSentiment: number | null, trend: string): number {
  if (avgSentiment === null) return 50;

  let baseScore = 50 + (avgSentiment * 50);

  if (trend === 'improving') baseScore += 10;
  else if (trend === 'declining') baseScore -= 15;

  return Math.max(0, Math.min(100, Math.round(baseScore)));
}

/**
 * Calculate engagement score
 */
function calculateEngagementScore(
  meetingCount: number,
  activityCount: number,
  daysSinceLastMeeting: number | null
): number {
  let score = 50;

  if (meetingCount >= 4) score += 30;
  else if (meetingCount >= 2) score += 20;
  else if (meetingCount >= 1) score += 10;
  else score -= 20;

  if (activityCount >= 8) score += 15;
  else if (activityCount >= 4) score += 10;
  else if (activityCount >= 2) score += 5;

  if (daysSinceLastMeeting !== null) {
    if (daysSinceLastMeeting <= 7) score += 5;
    else if (daysSinceLastMeeting <= 14) score += 0;
    else if (daysSinceLastMeeting <= 21) score -= 10;
    else score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate activity score
 */
function calculateActivityScore(activityCount: number, daysSinceLastActivity: number | null): number {
  let score = 50;

  if (activityCount >= 10) score += 30;
  else if (activityCount >= 6) score += 20;
  else if (activityCount >= 3) score += 10;
  else score -= 15;

  if (daysSinceLastActivity !== null) {
    if (daysSinceLastActivity <= 3) score += 20;
    else if (daysSinceLastActivity <= 7) score += 10;
    else if (daysSinceLastActivity <= 14) score += 0;
    else if (daysSinceLastActivity <= 21) score -= 10;
    else score -= 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate response time score
 */
function calculateResponseTimeScore(avgResponseTimeHours: number | null): number {
  if (avgResponseTimeHours === null) return 50;

  if (avgResponseTimeHours <= 24) return 100;
  if (avgResponseTimeHours <= 48) return 80;
  if (avgResponseTimeHours <= 72) return 60;
  if (avgResponseTimeHours <= 120) return 40;
  return 20;
}

/**
 * Calculate signal scores from metrics
 */
function calculateSignalScores(metrics: DealHealthMetrics & { stageName: string }): SignalScores {
  return {
    stageVelocity: calculateStageVelocityScore(metrics.daysInStage, metrics.stageName),
    sentiment: calculateSentimentScore(metrics.sentimentData.average, metrics.sentimentData.trend),
    engagement: calculateEngagementScore(
      metrics.engagementData.meetingCount30Days,
      metrics.engagementData.activityCount30Days,
      metrics.daysSinceLastMeeting
    ),
    activity: calculateActivityScore(
      metrics.engagementData.activityCount30Days,
      metrics.daysSinceLastActivity
    ),
    responseTime: calculateResponseTimeScore(metrics.engagementData.avgResponseTimeHours),
  };
}

/**
 * Identify risk factors
 */
function identifyRiskFactors(metrics: DealHealthMetrics, scores: SignalScores): string[] {
  const risks: string[] = [];

  if (metrics.daysInStage > 30) risks.push('stage_stall');
  if (metrics.sentimentData.trend === 'declining') risks.push('sentiment_declining');
  if (metrics.daysSinceLastMeeting && metrics.daysSinceLastMeeting > 14) risks.push('no_recent_meetings');
  if (metrics.engagementData.meetingCount30Days < 2) risks.push('low_engagement');
  if (metrics.engagementData.avgResponseTimeHours && metrics.engagementData.avgResponseTimeHours > 48) risks.push('slow_response');

  return risks;
}

/**
 * Determine risk level
 */
function determineRiskLevel(overallScore: number, riskFactors: string[]): 'low' | 'medium' | 'high' | 'critical' {
  if (overallScore >= 80 && riskFactors.length === 0) return 'low';
  if (overallScore >= 60 && riskFactors.length <= 1) return 'medium';
  if (overallScore >= 40 || riskFactors.length <= 2) return 'high';
  return 'critical';
}
