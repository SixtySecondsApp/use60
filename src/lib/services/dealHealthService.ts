/**
 * Deal Health Monitoring Service
 *
 * Provides comprehensive health score calculation for deals using multi-signal analysis:
 * - Stage velocity (time in current stage)
 * - Sentiment trends (from Fathom meetings)
 * - Engagement metrics (meeting frequency, response times)
 * - Activity patterns (calls, emails, meetings)
 * - Risk factor detection
 */

import { supabase } from '@/lib/supabase/clientV2';

// =====================================================
// Types
// =====================================================
export interface DealHealthScore {
  id: string;
  deal_id: string;
  user_id: string;
  overall_health_score: number;
  health_status: 'healthy' | 'warning' | 'critical' | 'stalled';

  // Individual signal scores
  stage_velocity_score: number;
  sentiment_score: number;
  engagement_score: number;
  activity_score: number;
  response_time_score: number;

  // Raw metrics
  days_in_current_stage: number;
  days_since_last_meeting: number | null;
  days_since_last_activity: number | null;
  avg_sentiment_last_3_meetings: number | null;
  sentiment_trend: 'improving' | 'stable' | 'declining' | 'unknown';
  meeting_count_last_30_days: number;
  activity_count_last_30_days: number;
  avg_response_time_hours: number | null;

  // Risk
  risk_factors: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';

  // Predictions
  predicted_close_probability: number | null;
  predicted_days_to_close: number | null;

  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface DealHealthMetrics {
  dealId: string;
  daysInStage: number;
  daysSinceLastMeeting: number | null;
  daysSinceLastActivity: number | null;
  sentimentData: {
    average: number | null;
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
    lastThreeMeetings: number[];
  };
  engagementData: {
    meetingCount30Days: number;
    activityCount30Days: number;
    avgResponseTimeHours: number | null;
  };
}

// =====================================================
// Health Score Calculation Functions
// =====================================================

/**
 * Calculate stage velocity score (0-100)
 * Higher score = healthy progression through pipeline
 * Lower score = stalled in stage too long
 */
function calculateStageVelocityScore(
  daysInStage: number,
  stageName: string
): number {
  // Stage-specific expected duration thresholds
  const stageThresholds: Record<string, { optimal: number; warning: number; critical: number }> = {
    SQL: { optimal: 7, warning: 14, critical: 30 },
    Opportunity: { optimal: 14, warning: 21, critical: 45 },
    Verbal: { optimal: 7, warning: 14, critical: 21 },
    Signed: { optimal: 0, warning: 0, critical: 0 }, // Already won
  };

  const threshold = stageThresholds[stageName] || { optimal: 14, warning: 21, critical: 30 };

  if (daysInStage <= threshold.optimal) {
    return 100; // Optimal progression
  } else if (daysInStage <= threshold.warning) {
    // Linear decline from 100 to 60
    const ratio = (daysInStage - threshold.optimal) / (threshold.warning - threshold.optimal);
    return Math.round(100 - (ratio * 40));
  } else if (daysInStage <= threshold.critical) {
    // Linear decline from 60 to 20
    const ratio = (daysInStage - threshold.warning) / (threshold.critical - threshold.warning);
    return Math.round(60 - (ratio * 40));
  } else {
    // Critical territory, asymptotic to 0
    const overage = daysInStage - threshold.critical;
    return Math.max(0, Math.round(20 - (overage / 5)));
  }
}

/**
 * Calculate sentiment score (0-100)
 * Based on average sentiment from recent Fathom meetings
 */
function calculateSentimentScore(
  avgSentiment: number | null,
  trend: 'improving' | 'stable' | 'declining' | 'unknown'
): number {
  if (avgSentiment === null) {
    return 50; // Neutral when no data
  }

  // Sentiment is -1 to 1, convert to 0-100 scale
  let baseScore = Math.round(((avgSentiment + 1) / 2) * 100);

  // Apply trend modifier
  if (trend === 'improving') {
    baseScore = Math.min(100, baseScore + 10);
  } else if (trend === 'declining') {
    baseScore = Math.max(0, baseScore - 15);
  }

  return baseScore;
}

/**
 * Calculate engagement score (0-100)
 * Based on meeting frequency and activity levels
 */
function calculateEngagementScore(
  meetingCount: number,
  activityCount: number,
  daysSinceLastMeeting: number | null
): number {
  let score = 50; // Base score

  // Meeting frequency component (max 40 points)
  // Optimal: 2-4 meetings per month
  if (meetingCount >= 4) {
    score += 40;
  } else if (meetingCount >= 2) {
    score += 30;
  } else if (meetingCount === 1) {
    score += 15;
  }

  // Activity frequency component (max 30 points)
  // Optimal: 8+ activities per month
  if (activityCount >= 8) {
    score += 30;
  } else if (activityCount >= 4) {
    score += 20;
  } else if (activityCount >= 2) {
    score += 10;
  }

  // Recency component (max 30 points penalty)
  if (daysSinceLastMeeting !== null) {
    if (daysSinceLastMeeting <= 7) {
      score += 30; // Recent meeting
    } else if (daysSinceLastMeeting <= 14) {
      score += 15;
    } else if (daysSinceLastMeeting > 30) {
      score -= 30; // Too long without meeting
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate activity score (0-100)
 * Based on activity count and recency
 */
function calculateActivityScore(
  activityCount: number,
  daysSinceLastActivity: number | null
): number {
  let score = 50; // Base score

  // Activity volume (max 50 points)
  if (activityCount >= 10) {
    score += 50;
  } else if (activityCount >= 5) {
    score += 35;
  } else if (activityCount >= 2) {
    score += 20;
  } else if (activityCount === 1) {
    score += 10;
  } else {
    score -= 30; // No activities
  }

  // Recency (max 50 points penalty)
  if (daysSinceLastActivity !== null) {
    if (daysSinceLastActivity <= 3) {
      score += 20;
    } else if (daysSinceLastActivity <= 7) {
      score += 10;
    } else if (daysSinceLastActivity > 14) {
      score -= 40;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate response time score (0-100)
 * Lower response time = higher score
 */
function calculateResponseTimeScore(avgResponseTimeHours: number | null): number {
  if (avgResponseTimeHours === null) {
    return 70; // Neutral when no data
  }

  // Optimal: < 4 hours
  // Acceptable: < 24 hours
  // Poor: < 48 hours
  // Critical: > 48 hours
  if (avgResponseTimeHours <= 4) {
    return 100;
  } else if (avgResponseTimeHours <= 24) {
    return 80;
  } else if (avgResponseTimeHours <= 48) {
    return 50;
  } else {
    return Math.max(0, 30 - Math.round(avgResponseTimeHours / 10));
  }
}

/**
 * Calculate overall health score
 * Weighted average of all signal scores
 */
function calculateOverallHealthScore(scores: {
  stageVelocity: number;
  sentiment: number;
  engagement: number;
  activity: number;
  responseTime: number;
}): number {
  // Weighted calculation
  const weights = {
    stageVelocity: 0.30, // 30% - Most important
    sentiment: 0.25,     // 25% - Very important
    engagement: 0.20,    // 20% - Important
    activity: 0.15,      // 15% - Moderately important
    responseTime: 0.10,  // 10% - Nice to have
  };

  const weighted =
    scores.stageVelocity * weights.stageVelocity +
    scores.sentiment * weights.sentiment +
    scores.engagement * weights.engagement +
    scores.activity * weights.activity +
    scores.responseTime * weights.responseTime;

  return Math.round(weighted);
}

/**
 * Determine health status from overall score
 */
function determineHealthStatus(score: number): DealHealthScore['health_status'] {
  if (score >= 75) return 'healthy';
  if (score >= 50) return 'warning';
  if (score >= 25) return 'critical';
  return 'stalled';
}

/**
 * Determine risk level
 */
function determineRiskLevel(
  healthScore: number,
  riskFactors: string[]
): DealHealthScore['risk_level'] {
  if (riskFactors.length >= 4 || healthScore < 25) return 'critical';
  if (riskFactors.length >= 3 || healthScore < 40) return 'high';
  if (riskFactors.length >= 2 || healthScore < 60) return 'medium';
  return 'low';
}

/**
 * Identify risk factors based on metrics
 */
function identifyRiskFactors(metrics: DealHealthMetrics, scores: {
  stageVelocity: number;
  sentiment: number;
  engagement: number;
  activity: number;
}): string[] {
  const factors: string[] = [];

  // Stage velocity risks
  if (metrics.daysInStage >= 30) {
    factors.push('stage_stalled_critical');
  } else if (metrics.daysInStage >= 14) {
    factors.push('stage_stalled');
  }

  // Sentiment risks
  if (metrics.sentimentData.trend === 'declining') {
    factors.push('sentiment_declining');
  }
  if (metrics.sentimentData.average !== null && metrics.sentimentData.average < -0.3) {
    factors.push('negative_sentiment');
  }

  // Engagement risks
  if (metrics.daysSinceLastMeeting !== null && metrics.daysSinceLastMeeting > 21) {
    factors.push('no_recent_meeting');
  }
  if (metrics.engagementData.meetingCount30Days === 0) {
    factors.push('no_meetings_30_days');
  }

  // Activity risks
  if (metrics.daysSinceLastActivity !== null && metrics.daysSinceLastActivity > 14) {
    factors.push('no_recent_activity');
  }
  if (metrics.engagementData.activityCount30Days < 2) {
    factors.push('low_activity');
  }

  // Response time risks
  if (metrics.engagementData.avgResponseTimeHours !== null &&
      metrics.engagementData.avgResponseTimeHours > 48) {
    factors.push('slow_response_time');
  }

  return factors;
}

// =====================================================
// Data Fetching Functions
// =====================================================

/**
 * Fetch all raw metrics needed for health calculation
 */
async function fetchDealMetrics(dealId: string): Promise<DealHealthMetrics | null> {
  try {
    // 1. Get deal data
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select(`
        id,
        owner_id,
        stage_id,
        stage_changed_at,
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

    // Get meetings directly linked to this deal via deal_id column
    const { data: directMeetings, error: directMeetingsError } = await supabase
      .from('meetings')
      .select('id, meeting_start, sentiment_score')
      .eq('deal_id', dealId)
      .order('meeting_start', { ascending: false })
      .limit(10);

    // Also get meetings linked via deal_meetings junction table
    const { data: junctionMeetings, error: junctionError } = await supabase
      .from('deal_meetings')
      .select('meeting_id')
      .eq('deal_id', dealId);

    // Fetch junction meeting details
    let junctionMeetingDetails: any[] = [];
    if (junctionMeetings && junctionMeetings.length > 0) {
      const junctionMeetingIds = junctionMeetings.map(jm => jm.meeting_id);
      const { data: junctionDetails } = await supabase
        .from('meetings')
        .select('id, meeting_start, sentiment_score')
        .in('id', junctionMeetingIds)
        .order('meeting_start', { ascending: false })
        .limit(10);
      junctionMeetingDetails = junctionDetails || [];
    }

    // Combine meetings, avoiding duplicates
    const directMeetingIds = new Set((directMeetings || []).map(m => m.id));
    const uniqueJunctionMeetings = (junctionMeetingDetails || []).filter(m => !directMeetingIds.has(m.id));
    const allMeetings = [...(directMeetings || []), ...uniqueJunctionMeetings]
      .sort((a, b) => {
        const dateA = a.meeting_start ? new Date(a.meeting_start).getTime() : 0;
        const dateB = b.meeting_start ? new Date(b.meeting_start).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    if (directMeetingsError || junctionError) {
      // Continue with available data
    }

    const meetingsLast30Days = allMeetings.filter(m =>
      m.meeting_start && new Date(m.meeting_start) >= new Date(thirtyDaysAgo)
    );

    const lastThreeMeetings = allMeetings.slice(0, 3).filter(m => m.sentiment_score !== null);

    // Calculate sentiment metrics
    const sentimentScores = lastThreeMeetings
      .map(m => m.sentiment_score)
      .filter((s): s is number => s !== null);

    const avgSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((sum, s) => sum + s, 0) / sentimentScores.length
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
    const lastMeeting = allMeetings && allMeetings.length > 0 ? allMeetings[0] : null;
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

    // 4. Get email communications from communication_events
    const { data: emails, error: emailsError } = await supabase
      .from('communication_events')
      .select('*')
      .eq('deal_id', dealId)
      .in('event_type', ['email_sent', 'email_received'])
      .gte('communication_date', thirtyDaysAgo)
      .order('communication_date', { ascending: false });

    if (emailsError) {
      // Continue with available data
    }

    const emailCount30Days = emails?.length || 0;
    
    // Calculate email sentiment (from AI analysis)
    const emailSentiments = emails
      ?.filter(e => e.sentiment_score !== null)
      .map(e => e.sentiment_score as number) || [];
    
    const emailSentiment = emailSentiments.length > 0
      ? emailSentiments.reduce((sum, s) => sum + s, 0) / emailSentiments.length
      : null;

    // Combine meeting and email sentiment for overall sentiment
    const allSentimentScores = [
      ...sentimentScores,
      ...emailSentiments.slice(0, 3), // Include up to 3 most recent email sentiments
    ];
    
    const combinedAvgSentiment = allSentimentScores.length > 0
      ? allSentimentScores.reduce((sum, s) => sum + s, 0) / allSentimentScores.length
      : avgSentiment; // Fallback to meeting sentiment if no email sentiment

    // Update sentiment trend if we have email data
    let finalSentimentTrend = sentimentTrend;
    if (emailSentiments.length >= 2 && sentimentScores.length >= 1) {
      const recentEmail = emailSentiments[0];
      const olderEmail = emailSentiments[1];
      const emailChange = recentEmail - olderEmail;
      
      if (Math.abs(emailChange) > 0.1) {
        // Email sentiment trend overrides meeting trend if more significant
        finalSentimentTrend = emailChange > 0.1 ? 'improving' : 'declining';
      }
    }

    // 5. Calculate average response time from email response times
    let avgResponseTimeHours: number | null = null;
    const emailResponseTimes = emails
      ?.filter(e => e.response_time_hours !== null)
      .map(e => e.response_time_hours as number) || [];
    
    if (emailResponseTimes.length > 0) {
      avgResponseTimeHours = emailResponseTimes.reduce((sum, t) => sum + t, 0) / emailResponseTimes.length;
    } else if (activityCount30Days > 0) {
      // Fallback: Estimate based on activity density
      const hoursPerActivity = (30 * 24) / activityCount30Days;
      avgResponseTimeHours = Math.round(hoursPerActivity);
    }

    return {
      dealId,
      daysInStage,
      daysSinceLastMeeting,
      daysSinceLastActivity,
      sentimentData: {
        average: combinedAvgSentiment,
        trend: finalSentimentTrend,
        lastThreeMeetings: sentimentScores,
      },
      engagementData: {
        meetingCount30Days: meetingsLast30Days.length,
        activityCount30Days: activityCount30Days + emailCount30Days, // Include emails in activity count
        avgResponseTimeHours,
      },
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get stage name for a deal
 */
async function getStageName(stageId: string): Promise<string> {
  const { data } = await supabase
    .from('deal_stages')
    .select('name')
    .eq('id', stageId)
    .single();

  return data?.name || 'Unknown';
}

// =====================================================
// Main Health Calculation Function
// =====================================================

/**
 * Calculate and save health score for a deal
 */
export async function calculateDealHealth(dealId: string): Promise<DealHealthScore | null> {
  try {
    // Fetch all metrics
    const metrics = await fetchDealMetrics(dealId);
    if (!metrics) {
      return null;
    }

    // Get stage name for stage-specific scoring
    const { data: deal } = await supabase
      .from('deals')
      .select('stage_id, owner_id, deal_stages!inner(name)')
      .eq('id', dealId)
      .single();

    if (!deal) return null;

    const stageName = deal.deal_stages.name;

    // Calculate individual signal scores
    const scores = {
      stageVelocity: calculateStageVelocityScore(metrics.daysInStage, stageName),
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

    // Calculate overall health score
    const overallScore = calculateOverallHealthScore(scores);
    const healthStatus = determineHealthStatus(overallScore);

    // Identify risk factors
    const riskFactors = identifyRiskFactors(metrics, scores);
    const riskLevel = determineRiskLevel(overallScore, riskFactors);

    // Predict close probability (simple heuristic)
    const predictedProbability = Math.min(95, Math.max(5, overallScore));

    // Prepare health score data
    const healthScoreData = {
      deal_id: dealId,
      user_id: deal.owner_id,
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
      predicted_close_probability: predictedProbability,
      // Heuristic placeholder: estimate days to close from stage velocity and deal recency.
      // Uses average stage duration thresholds inversely scaled by current health score.
      // Replace with a trained predictive model once sufficient historical close-date data exists.
      predicted_days_to_close: (() => {
        const stageAvgDays: Record<string, number> = {
          SQL: 10,
          Opportunity: 30,
          Verbal: 14,
        };
        const stageAvg = stageAvgDays[stageName] ?? 21;
        // Remaining days in stage = average minus time already spent, floored at 0
        const remainingInStage = Math.max(0, stageAvg - metrics.daysInStage);
        // Low health score implies more friction → scale up remaining time
        const frictionMultiplier = overallScore > 0 ? 100 / overallScore : 2;
        return Math.round(remainingInStage * frictionMultiplier);
      })(),
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
      snapshot_at: new Date().toISOString(),
    });
    return savedScore;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate health for all deals owned by user
 */
export async function calculateAllDealsHealth(userId: string): Promise<DealHealthScore[]> {
  try {
    // Get all active deals for user
    // Join with deal_stages to filter by stage name
    const { data: deals, error } = await supabase
      .from('deals')
      .select(`
        id,
        deal_stages!inner(name)
      `)
      .eq('owner_id', userId)
      .eq('status', 'active')
      .not('deal_stages.name', 'in', '("Signed","Lost")');

    if (error || !deals) {
      return [];
    }

    // Calculate health for each deal
    const healthScores: DealHealthScore[] = [];
    for (const deal of deals) {
      const score = await calculateDealHealth(deal.id);
      if (score) {
        healthScores.push(score);
      }
    }

    return healthScores;
  } catch (error) {
    return [];
  }
}

/**
 * Smart refresh: Only recalculate health scores that are stale
 * @param userId - User ID to refresh scores for
 * @param maxAgeHours - Maximum age in hours before a score is considered stale (default: 24)
 * @returns Updated health scores
 */
export async function refreshStaleHealthScores(
  userId: string,
  maxAgeHours: number = 24
): Promise<{ updated: DealHealthScore[], skipped: number }> {
  try {
    // Get all active deals for user with their existing health scores
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select(`
        id,
        deal_stages!inner(name),
        deal_health_scores(id, last_calculated_at)
      `)
      .eq('owner_id', userId)
      .eq('status', 'active')
      .not('deal_stages.name', 'in', '("Signed","Lost")');

    if (dealsError || !deals) {
      return { updated: [], skipped: 0 };
    }

    const staleThreshold = new Date();
    staleThreshold.setHours(staleThreshold.getHours() - maxAgeHours);

    const dealsToUpdate: string[] = [];
    let skippedCount = 0;

    // Identify stale scores
    for (const deal of deals) {
      const healthScore = (deal as any).deal_health_scores?.[0];

      if (!healthScore) {
        // No health score exists - needs calculation
        dealsToUpdate.push(deal.id);
      } else {
        const lastCalculated = new Date(healthScore.last_calculated_at);
        if (lastCalculated < staleThreshold) {
          // Score is stale - needs recalculation
          dealsToUpdate.push(deal.id);
        } else {
          // Score is fresh - skip
          skippedCount++;
        }
      }
    }
    // Calculate health for stale deals only
    const healthScores: DealHealthScore[] = [];
    for (const dealId of dealsToUpdate) {
      const score = await calculateDealHealth(dealId);
      if (score) {
        healthScores.push(score);
      }
    }

    return { updated: healthScores, skipped: skippedCount };
  } catch (error) {
    return { updated: [], skipped: 0 };
  }
}

/**
 * Get health score for a deal
 */
export async function getDealHealthScore(dealId: string): Promise<DealHealthScore | null> {
  try {
    const { data, error } = await supabase
      .from('deal_health_scores')
      .select('*')
      .eq('deal_id', dealId)
      .single();

    if (error) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Get health scores for all user's deals
 */
export async function getUserDealsHealthScores(userId: string): Promise<DealHealthScore[]> {
  try {
    const { data, error } = await supabase
      .from('deal_health_scores')
      .select('*')
      .eq('user_id', userId)
      .order('overall_health_score', { ascending: true }); // Worst first

    if (error) {
      return [];
    }

    return data || [];
  } catch (error) {
    return [];
  }
}
