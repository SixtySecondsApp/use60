/// <reference path="../deno.d.ts" />

/**
 * Health Recalculation Edge Function
 *
 * Processes health_recalc_queue entries and recalculates:
 * - Deal health scores using stage velocity, sentiment, engagement, activity
 * - Relationship health scores for affected contacts
 * - Inserts snapshots into deal_health_history for trend tracking
 *
 * Triggered by: cron job or manual invocation
 *
 * POST /health-recalculate
 * {
 *   batch_size?: number,  // default 50
 *   max_age_minutes?: number  // default 60 (only process items created in last 60 min)
 * }
 *
 * Response:
 * {
 *   success: true,
 *   dealsRecalculated: number,
 *   relationshipsRecalculated: number,
 *   significantChanges: Array<{ deal_id, old_score, new_score, change }>
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { evaluateAlerts, insertAlerts } from './alertEvaluator.ts';
import { syncHealthScoresToOpsTable, markCellsAsComputed } from './opsSyncHandler.ts';
import { pushHealthScoresToCRMs } from './crmPushOrchestrator.ts';
import { sendSlackAlerts } from './slackNotifier.ts';

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_AGE_MINUTES = 60;
const SIGNIFICANT_CHANGE_THRESHOLD = 15; // 15-point swing is significant

// =============================================================================
// Types
// =============================================================================

interface RequestBody {
  batch_size?: number;
  max_age_minutes?: number;
}

interface QueueItem {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  trigger_type: string;
  trigger_source: string | null;
  created_at: string;
}

interface DealHealthScore {
  overall_health_score: number;
  health_status: 'healthy' | 'warning' | 'critical' | 'stalled';
  stage_velocity_score: number;
  sentiment_score: number;
  engagement_score: number;
  activity_score: number;
  response_time_score: number;
  days_in_current_stage: number;
  days_since_last_meeting: number | null;
  days_since_last_activity: number | null;
  avg_sentiment_last_3_meetings: number | null;
  sentiment_trend: string | null;
  meeting_count_last_30_days: number;
  activity_count_last_30_days: number;
  avg_response_time_hours: number | null;
  risk_factors: string[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  predicted_close_probability: number | null;
  predicted_days_to_close: number | null;
}

interface RelationshipHealthScore {
  overall_health_score: number;
  health_status: 'healthy' | 'warning' | 'at_risk' | 'ghost';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  communication_frequency_score: number;
  response_behavior_score: number;
  engagement_quality_score: number;
  sentiment_score: number;
  meeting_pattern_score: number;
  days_since_last_contact: number;
  days_since_last_response: number | null;
  avg_response_time_hours: number | null;
  response_rate_percent: number | null;
  email_open_rate_percent: number | null;
  meeting_count_30_days: number;
  email_count_30_days: number;
  total_interactions_30_days: number;
  is_ghost_risk: boolean;
  ghost_probability_percent: number | null;
  sentiment_trend: string | null;
}

export interface SignificantChange {
  deal_id: string;
  deal_name: string;
  old_score: number;
  new_score: number;
  change: number;
  risk_level: string;
}

// Stage thresholds used when no org_settings row exists yet (contacts needed per stage)
const DEFAULT_STAGE_THRESHOLDS: Record<string, number> = {
  discovery:     1,
  qualification: 2,
  proposal:      3,
  negotiation:   3,
  closing:       2,
  sql:           2,
  opportunity:   3,
  signed:        2,
};

// Stages at which a single-thread alert should fire (order_index >= proposal level)
// We treat any stage whose order_index is >= the lowest proposal-equivalent stage as alert-eligible.
// In lieu of hard-coding order_index values we match by lowercased stage name.
const ALERT_ELIGIBLE_STAGES = new Set([
  'proposal', 'negotiation', 'closing', 'opportunity', 'signed',
]);

// Score below this triggers a "single threaded" warning
const SINGLE_THREAD_THRESHOLD = 0.5;

// Minimum days between repeat alerts per deal
const ALERT_DEBOUNCE_DAYS = 7;

// Default champion inactivity threshold (days) — configurable via org_settings.champion_gone_dark_days
const DEFAULT_CHAMPION_GONE_DARK_DAYS = 21;

// =============================================================================
// Health Calculation Functions
// =============================================================================

/**
 * Calculate deal health score based on multiple signals
 */
async function calculateDealHealth(
  supabase: any,
  dealId: string,
  userId: string
): Promise<DealHealthScore> {
  // Fetch deal data
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select(`
      id,
      name,
      value,
      stage_id,
      expected_close_date,
      created_at,
      updated_at,
      deal_stages!inner(name, order_index)
    `)
    .eq('id', dealId)
    .maybeSingle();

  if (dealError || !deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  // Calculate days in current stage
  const stageStartDate = deal.updated_at ? new Date(deal.updated_at) : new Date(deal.created_at);
  const daysInStage = Math.floor((Date.now() - stageStartDate.getTime()) / (1000 * 60 * 60 * 24));

  // Fetch recent activities
  const { data: activities } = await supabase
    .from('activities')
    .select('id, type, created_at, outcome')
    .eq('deal_id', dealId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  const activityCount30Days = activities?.length || 0;
  const lastActivityDate = activities?.[0]?.created_at;
  const daysSinceLastActivity = lastActivityDate
    ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Fetch deal contacts to scope meetings to this deal
  const { data: dealContacts } = await supabase
    .from('deal_contacts')
    .select('contact_id')
    .eq('deal_id', dealId);

  const dealContactIds = dealContacts?.map((dc: any) => dc.contact_id) || [];

  // Fetch meetings linked to this deal's contacts via activities
  let dealMeetings: any[] = [];
  if (dealContactIds.length > 0) {
    // Get meeting IDs from activities that reference this deal
    const { data: dealActivities } = await supabase
      .from('activities')
      .select('meeting_id')
      .eq('deal_id', dealId)
      .not('meeting_id', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const meetingIds = dealActivities?.map((a: any) => a.meeting_id).filter(Boolean) || [];

    if (meetingIds.length > 0) {
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, outcome, sentiment_score, created_at')
        .in('id', meetingIds)
        .order('created_at', { ascending: false });

      dealMeetings = meetings || [];
    }
  }

  const meetingCount30Days = dealMeetings.length;
  const lastMeetingDate = dealMeetings[0]?.created_at;
  const daysSinceLastMeeting = lastMeetingDate
    ? Math.floor((Date.now() - new Date(lastMeetingDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate sentiment metrics
  const sentimentScores = dealMeetings
    .slice(0, 3)
    .map((m: any) => m.sentiment_score)
    .filter((s: number | null) => s !== null);

  const avgSentiment = sentimentScores.length > 0
    ? sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length
    : null;

  // Determine sentiment trend (simplified)
  let sentimentTrend = null;
  if (sentimentScores.length >= 2) {
    const recent = sentimentScores[0];
    const older = sentimentScores[sentimentScores.length - 1];
    if (recent > older + 0.1) sentimentTrend = 'improving';
    else if (recent < older - 0.1) sentimentTrend = 'declining';
    else sentimentTrend = 'stable';
  }

  // Calculate component scores (0-100)

  // Stage velocity score (lower days in stage = higher score)
  const expectedDaysInStage = 21; // Default, should vary by stage
  const stageVelocityScore = Math.max(0, Math.min(100,
    100 - (daysInStage / expectedDaysInStage) * 100
  ));

  // Sentiment score
  const sentimentScore = avgSentiment !== null
    ? Math.round(avgSentiment * 100)
    : 50; // Neutral default

  // Engagement score (based on meeting frequency)
  const engagementScore = Math.min(100, meetingCount30Days * 20);

  // Activity score (based on all activities)
  const activityScore = Math.min(100, activityCount30Days * 10);

  // Response time score (simplified - would check communication_events in production)
  const responseTimeScore = 75; // Default placeholder

  // Overall health score (weighted average)
  const overallHealthScore = Math.round(
    stageVelocityScore * 0.25 +
    sentimentScore * 0.20 +
    engagementScore * 0.25 +
    activityScore * 0.20 +
    responseTimeScore * 0.10
  );

  // Determine health status
  let healthStatus: DealHealthScore['health_status'];
  if (overallHealthScore >= 70) healthStatus = 'healthy';
  else if (overallHealthScore >= 50) healthStatus = 'warning';
  else if (overallHealthScore >= 30) healthStatus = 'critical';
  else healthStatus = 'stalled';

  // Identify risk factors
  const riskFactors: string[] = [];
  if (daysInStage > expectedDaysInStage * 2) riskFactors.push('stage_stall');
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 14) riskFactors.push('no_activity');
  if (sentimentTrend === 'declining') riskFactors.push('sentiment_decline');
  if (meetingCount30Days === 0) riskFactors.push('no_meetings');

  // Determine risk level
  let riskLevel: DealHealthScore['risk_level'];
  if (riskFactors.length >= 3 || overallHealthScore < 30) riskLevel = 'critical';
  else if (riskFactors.length >= 2 || overallHealthScore < 50) riskLevel = 'high';
  else if (riskFactors.length >= 1 || overallHealthScore < 70) riskLevel = 'medium';
  else riskLevel = 'low';

  // Calculate predictions (simplified)
  const predictedCloseProb = Math.max(0, Math.min(100, overallHealthScore));
  const predictedDaysToClose = deal.expected_close_date
    ? Math.max(0, Math.floor((new Date(deal.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    overall_health_score: overallHealthScore,
    health_status: healthStatus,
    stage_velocity_score: Math.round(stageVelocityScore),
    sentiment_score: sentimentScore,
    engagement_score: engagementScore,
    activity_score: activityScore,
    response_time_score: responseTimeScore,
    days_in_current_stage: daysInStage,
    days_since_last_meeting: daysSinceLastMeeting,
    days_since_last_activity: daysSinceLastActivity,
    avg_sentiment_last_3_meetings: avgSentiment,
    sentiment_trend: sentimentTrend,
    meeting_count_last_30_days: meetingCount30Days,
    activity_count_last_30_days: activityCount30Days,
    avg_response_time_hours: null, // Would calculate from communication_events
    risk_factors: riskFactors,
    risk_level: riskLevel,
    predicted_close_probability: predictedCloseProb,
    predicted_days_to_close: predictedDaysToClose,
  };
}

/**
 * Calculate relationship health score for a contact
 */
async function calculateRelationshipHealth(
  supabase: any,
  contactId: string,
  userId: string
): Promise<RelationshipHealthScore> {
  // Fetch contact
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, email, owner_id')
    .eq('id', contactId)
    .maybeSingle();

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Fetch recent communication events
  const { data: commEvents } = await supabase
    .from('communication_events')
    .select('id, event_type, direction, timestamp, response_time_minutes, sentiment_score')
    .eq('contact_id', contactId)
    .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: false });

  const totalInteractions = commEvents?.length || 0;
  const emailCount = commEvents?.filter((e: any) => e.event_type === 'email').length || 0;

  const lastContactDate = commEvents?.[0]?.timestamp;
  const daysSinceLastContact = lastContactDate
    ? Math.floor((Date.now() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Calculate response metrics
  const inboundEvents = commEvents?.filter((e: any) => e.direction === 'inbound') || [];
  const lastResponseDate = inboundEvents[0]?.timestamp;
  const daysSinceLastResponse = lastResponseDate
    ? Math.floor((Date.now() - new Date(lastResponseDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const responseTimes = commEvents
    ?.map((e: any) => e.response_time_minutes)
    .filter((t: number | null) => t !== null) || [];

  const avgResponseTimeHours = responseTimes.length > 0
    ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length / 60
    : null;

  // Fetch recent meetings
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, sentiment_score, created_at')
    .eq('primary_contact_id', contactId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const meetingCount = meetings?.length || 0;

  // Calculate component scores

  // Communication frequency score (based on total interactions)
  const commFrequencyScore = Math.min(100, totalInteractions * 5);

  // Response behavior score (based on response rate and time)
  const responseRate = totalInteractions > 0
    ? (inboundEvents.length / totalInteractions) * 100
    : 0;
  const responseBehaviorScore = Math.round(
    (responseRate * 0.7) +
    ((avgResponseTimeHours !== null ? Math.max(0, 100 - avgResponseTimeHours * 2) : 50) * 0.3)
  );

  // Engagement quality score (based on meetings)
  const engagementQualityScore = Math.min(100, meetingCount * 25);

  // Sentiment score
  const sentiments = meetings?.map((m: any) => m.sentiment_score).filter((s: number | null) => s !== null) || [];
  const avgSentiment = sentiments.length > 0
    ? sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length
    : null;
  const sentimentScore = avgSentiment !== null ? Math.round(avgSentiment * 100) : 50;

  // Meeting pattern score
  const meetingPatternScore = Math.min(100, meetingCount * 20);

  // Overall health score
  const overallHealthScore = Math.round(
    commFrequencyScore * 0.25 +
    responseBehaviorScore * 0.25 +
    engagementQualityScore * 0.20 +
    sentimentScore * 0.15 +
    meetingPatternScore * 0.15
  );

  // Determine health status
  let healthStatus: RelationshipHealthScore['health_status'];
  if (daysSinceLastContact > 30) healthStatus = 'ghost';
  else if (overallHealthScore >= 70) healthStatus = 'healthy';
  else if (overallHealthScore >= 50) healthStatus = 'warning';
  else healthStatus = 'at_risk';

  // Ghost detection
  const isGhostRisk = daysSinceLastContact > 21 || (daysSinceLastResponse !== null && daysSinceLastResponse > 21);
  const ghostProbability = isGhostRisk
    ? Math.min(100, Math.round((daysSinceLastContact / 30) * 100))
    : null;

  // Risk level
  let riskLevel: RelationshipHealthScore['risk_level'];
  if (healthStatus === 'ghost' || overallHealthScore < 30) riskLevel = 'critical';
  else if (healthStatus === 'at_risk' || overallHealthScore < 50) riskLevel = 'high';
  else if (overallHealthScore < 70) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    overall_health_score: overallHealthScore,
    health_status: healthStatus,
    risk_level: riskLevel,
    communication_frequency_score: commFrequencyScore,
    response_behavior_score: responseBehaviorScore,
    engagement_quality_score: engagementQualityScore,
    sentiment_score: sentimentScore,
    meeting_pattern_score: meetingPatternScore,
    days_since_last_contact: daysSinceLastContact,
    days_since_last_response: daysSinceLastResponse,
    avg_response_time_hours: avgResponseTimeHours,
    response_rate_percent: Math.round(responseRate),
    email_open_rate_percent: null, // Would track from email provider
    meeting_count_30_days: meetingCount,
    email_count_30_days: emailCount,
    total_interactions_30_days: totalInteractions,
    is_ghost_risk: isGhostRisk,
    ghost_probability_percent: ghostProbability,
    sentiment_trend: null, // Would calculate from trend analysis
  };
}

// =============================================================================
// Multi-Thread Score Calculation (REL-006)
// =============================================================================

interface MultiThreadResult {
  score: number;          // 0.0–1.0
  engagedContacts: number;
  contactsNeeded: number;
  stageName: string;
  isAlertEligible: boolean;  // stage is proposal or later
}

/**
 * Calculate multi-threading score for a deal.
 *
 * score = engaged_contacts / contacts_needed_for_stage
 *
 * "Engaged" = deal_contacts with last_active within the last 14 days.
 * Stage thresholds are read from org_settings.multi_thread_stage_thresholds
 * with a hardcoded fallback for orgs that don't have a settings row yet.
 */
async function calculateMultiThreadScore(
  supabase: any,
  dealId: string,
  clerkOrgId: string | null
): Promise<MultiThreadResult | null> {
  // Fetch deal with its stage name
  const { data: deal } = await supabase
    .from('deals')
    .select('id, stage_id, deal_stages!inner(name, order_index)')
    .eq('id', dealId)
    .maybeSingle();

  if (!deal) return null;

  const stageName: string = deal.deal_stages?.name ?? '';
  const stageKey = stageName.toLowerCase();

  // Fetch org-specific thresholds if available
  let thresholds: Record<string, number> = { ...DEFAULT_STAGE_THRESHOLDS };

  if (clerkOrgId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('id')
      .eq('clerk_org_id', clerkOrgId)
      .maybeSingle();

    if (orgRow?.id) {
      const { data: orgSettings } = await supabase
        .from('org_settings')
        .select('multi_thread_stage_thresholds')
        .eq('org_id', orgRow.id)
        .maybeSingle();

      if (orgSettings?.multi_thread_stage_thresholds) {
        thresholds = { ...thresholds, ...orgSettings.multi_thread_stage_thresholds };
      }
    }
  }

  const contactsNeeded: number = thresholds[stageKey] ?? 2; // Default 2 for unknown stages

  // Count engaged contacts (last_active within 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { count: engagedCount } = await supabase
    .from('deal_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .gte('last_active', fourteenDaysAgo);

  const engagedContacts = engagedCount ?? 0;
  const score = Math.min(1.0, engagedContacts / contactsNeeded);
  const isAlertEligible = ALERT_ELIGIBLE_STAGES.has(stageKey);

  return {
    score: Math.round(score * 1000) / 1000, // 3 decimal places
    engagedContacts,
    contactsNeeded,
    stageName,
    isAlertEligible,
  };
}

/**
 * Send a single-thread Slack alert for a deal that lacks sufficient multi-threading.
 * Respects the 7-day per-deal debounce stored in deals.last_single_thread_alert.
 * Returns true if the alert was sent, false if skipped/failed.
 */
async function maybeSendSingleThreadAlert(
  supabase: any,
  dealId: string,
  dealName: string,
  ownerId: string,
  multiThreadResult: MultiThreadResult,
  appBaseUrl: string = 'https://app.use60.com'
): Promise<boolean> {
  // Check debounce: only alert if last_single_thread_alert is NULL or > 7 days ago
  const { data: deal } = await supabase
    .from('deals')
    .select('last_single_thread_alert')
    .eq('id', dealId)
    .maybeSingle();

  if (deal?.last_single_thread_alert) {
    const lastAlertDate = new Date(deal.last_single_thread_alert);
    const daysSinceAlert = (Date.now() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceAlert < ALERT_DEBOUNCE_DAYS) {
      console.log(
        `[MultiThread] Skipping alert for deal ${dealId} — last alert was ${Math.floor(daysSinceAlert)} days ago (debounce: ${ALERT_DEBOUNCE_DAYS}d)`
      );
      return false;
    }
  }

  // Get Slack credentials for owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', ownerId)
    .maybeSingle();

  if (!profile?.org_id) return false;

  const { data: slackSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token, is_connected')
    .eq('org_id', profile.org_id)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackSettings?.bot_access_token) {
    console.log(`[MultiThread] No Slack integration for org ${profile.org_id}, skipping alert`);
    return false;
  }

  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', ownerId)
    .maybeSingle();

  if (!mapping?.slack_user_id) {
    console.log(`[MultiThread] No Slack user mapping for user ${ownerId}, skipping alert`);
    return false;
  }

  const botToken: string = slackSettings.bot_access_token;
  const slackUserId: string = mapping.slack_user_id;

  // Build Block Kit message
  const scorePercent = Math.round(multiThreadResult.score * 100);
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Warning: Single-threaded deal at risk`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${dealName}* is in *${multiThreadResult.stageName}* with only *${multiThreadResult.engagedContacts}* engaged contact(s) — ${scorePercent}% of the ${multiThreadResult.contactsNeeded} needed for this stage.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Why this matters:* Deals with a single point of contact are significantly more likely to go dark or stall. Adding more stakeholders now reduces churn risk.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Suggested actions:*\n1. Identify other stakeholders via LinkedIn or the contact's email signature\n2. Ask your champion to introduce you to the economic buyer\n3. Schedule a multi-stakeholder demo or workshop`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Deal', emoji: true },
          url: `${appBaseUrl}/crm/pipeline?deal=${dealId}`,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ask Copilot', emoji: true },
          url: `${appBaseUrl}/crm/pipeline?copilot=true&context=deal:${dealId}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Deal: ${dealName} | Stage: ${multiThreadResult.stageName} | Multi-thread score: ${scorePercent}% | ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        },
      ],
    },
  ];

  // Open DM with the rep
  try {
    const dmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });
    const dmResult = await dmResponse.json();
    if (!dmResult.ok) {
      console.error(`[MultiThread] Failed to open DM for user ${ownerId}:`, dmResult.error);
      return false;
    }

    const msgResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: dmResult.channel.id,
        blocks,
        text: `Warning: ${dealName} is single-threaded (${scorePercent}% multi-thread coverage in ${multiThreadResult.stageName})`,
      }),
    });
    const msgResult = await msgResponse.json();

    if (!msgResult.ok) {
      console.error(`[MultiThread] Failed to send Slack message for deal ${dealId}:`, msgResult.error);
      return false;
    }

    // Stamp the debounce timestamp on the deal
    await supabase
      .from('deals')
      .update({ last_single_thread_alert: new Date().toISOString() })
      .eq('id', dealId);

    console.log(`[MultiThread] Sent single-thread alert for deal ${dealId} to Slack user ${slackUserId}`);
    return true;
  } catch (err) {
    console.error(`[MultiThread] Error sending Slack DM for deal ${dealId}:`, err);
    return false;
  }
}

// =============================================================================
// Champion Ghost Detection (REL-008)
// =============================================================================

interface ChampionGhostResult {
  championContactId: string;
  championName: string;
  daysSinceActive: number;
  threshold: number;
}

/**
 * Check whether any champion on an active deal has gone dark.
 *
 * Queries deal_contacts WHERE role = 'champion' for the given deal and checks
 * whether last_active has exceeded the org-configured threshold
 * (org_settings.champion_gone_dark_days, default 21 days).
 *
 * Returns null when:
 *   - the deal has no champions
 *   - all champions are within threshold
 *   - the deal is in a closed/lost stage (won/lost deals are excluded)
 *
 * When a ghost is detected:
 *   1. Inserts a ghost_detection_signals row (signal_type = 'champion_disappeared')
 *   2. Inserts a command_centre_item with urgency = 'high'
 *   3. Optionally fires a Slack DM to the rep (via maybeSendChampionGhostAlert)
 *   4. Stamps deals.last_champion_ghost_alert for 7-day debounce
 */
async function checkChampionGhostDetection(
  supabase: any,
  dealId: string,
  dealName: string,
  ownerId: string,
  orgId: string            // internal UUID from organizations table (for org_settings + command_centre_items)
): Promise<ChampionGhostResult | null> {
  // ------------------------------------------------------------------
  // 1. Debounce: skip if last alert was < 7 days ago
  // ------------------------------------------------------------------
  const { data: dealDebounce } = await supabase
    .from('deals')
    .select('last_champion_ghost_alert')
    .eq('id', dealId)
    .maybeSingle();

  if (dealDebounce?.last_champion_ghost_alert) {
    const daysSinceLastAlert =
      (Date.now() - new Date(dealDebounce.last_champion_ghost_alert).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceLastAlert < ALERT_DEBOUNCE_DAYS) {
      console.log(
        `[ChampionGhost] Skipping deal ${dealId} — last alert was ` +
        `${Math.floor(daysSinceLastAlert)}d ago (debounce: ${ALERT_DEBOUNCE_DAYS}d)`
      );
      return null;
    }
  }

  // ------------------------------------------------------------------
  // 2. Read org-specific threshold from org_settings
  // ------------------------------------------------------------------
  let thresholdDays = DEFAULT_CHAMPION_GONE_DARK_DAYS;

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('champion_gone_dark_days')
    .eq('org_id', orgId)
    .maybeSingle();

  if (orgSettings?.champion_gone_dark_days != null) {
    thresholdDays = orgSettings.champion_gone_dark_days;
  }

  const cutoffDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();

  // ------------------------------------------------------------------
  // 3. Find champions whose last_active has exceeded the threshold
  // ------------------------------------------------------------------
  const { data: darkChampions } = await supabase
    .from('deal_contacts')
    .select('contact_id, last_active, contacts!inner(id, name, owner_id)')
    .eq('deal_id', dealId)
    .eq('role', 'champion')
    .lt('last_active', cutoffDate);

  if (!darkChampions || darkChampions.length === 0) {
    return null;
  }

  // Use the most-stale champion as the primary signal
  const primary = darkChampions.sort(
    (a: any, b: any) =>
      new Date(a.last_active).getTime() - new Date(b.last_active).getTime()
  )[0];

  const championContactId: string = primary.contact_id;
  const championName: string = primary.contacts?.name ?? 'Unknown champion';
  const daysSinceActive = Math.floor(
    (Date.now() - new Date(primary.last_active).getTime()) / (1000 * 60 * 60 * 24)
  );

  console.log(
    `[ChampionGhost] Deal ${dealId} (${dealName}): champion ${championName} ` +
    `has been inactive for ${daysSinceActive}d (threshold: ${thresholdDays}d)`
  );

  // ------------------------------------------------------------------
  // 4. Look up relationship_health_scores for this contact + owner
  //    (ghost_detection_signals requires a relationship_health_id FK)
  // ------------------------------------------------------------------
  const { data: healthScore } = await supabase
    .from('relationship_health_scores')
    .select('id')
    .eq('contact_id', championContactId)
    .eq('user_id', ownerId)
    .maybeSingle();

  // ------------------------------------------------------------------
  // 5. Insert ghost_detection_signals row (non-blocking on failure)
  // ------------------------------------------------------------------
  if (healthScore?.id) {
    const { error: signalError } = await supabase
      .from('ghost_detection_signals')
      .insert({
        relationship_health_id: healthScore.id,
        user_id: ownerId,
        signal_type: 'champion_disappeared',
        severity: 'critical',
        signal_context:
          `Champion ${championName} has been inactive for ${daysSinceActive} days ` +
          `on deal "${dealName}" (threshold: ${thresholdDays} days).`,
        signal_data: {
          deal_id: dealId,
          deal_name: dealName,
          contact_id: championContactId,
          contact_name: championName,
          last_active: primary.last_active,
          days_since_active: daysSinceActive,
          threshold_days: thresholdDays,
        },
        detected_at: new Date().toISOString(),
      });

    if (signalError) {
      console.error(
        `[ChampionGhost] Failed to insert ghost_detection_signals for deal ${dealId}:`,
        signalError
      );
    }
  } else {
    console.warn(
      `[ChampionGhost] No relationship_health_scores row for contact ${championContactId} + ` +
      `user ${ownerId} — ghost_detection_signals row skipped`
    );
  }

  // ------------------------------------------------------------------
  // 6. Insert command_centre_item (high priority)
  // ------------------------------------------------------------------
  const { error: ccError } = await supabase
    .from('command_centre_items')
    .insert({
      org_id: orgId,
      user_id: ownerId,
      source_agent: 'health-recalculate',
      item_type: 'risk_alert',
      title: `Champion gone dark on "${dealName}"`,
      summary:
        `${championName} hasn't been active in ${daysSinceActive} days. ` +
        `Re-engage before the deal stalls.`,
      context: {
        signal_type: 'champion_disappeared',
        deal_id: dealId,
        deal_name: dealName,
        contact_id: championContactId,
        contact_name: championName,
        last_active: primary.last_active,
        days_since_active: daysSinceActive,
        threshold_days: thresholdDays,
        dark_champions_count: darkChampions.length,
      },
      priority_score: 85,
      priority_factors: {
        signal: 'champion_disappeared',
        days_since_active: daysSinceActive,
        threshold_days: thresholdDays,
      },
      urgency: 'high',
      confidence_score: 0.95,
      status: 'open',
      enrichment_status: 'skipped',
      deal_id: dealId,
      contact_id: championContactId,
    });

  if (ccError) {
    console.error(
      `[ChampionGhost] Failed to insert command_centre_item for deal ${dealId}:`,
      ccError
    );
  }

  // ------------------------------------------------------------------
  // 7. Stamp debounce timestamp on deal
  // ------------------------------------------------------------------
  await supabase
    .from('deals')
    .update({ last_champion_ghost_alert: new Date().toISOString() })
    .eq('id', dealId);

  return {
    championContactId,
    championName,
    daysSinceActive,
    threshold: thresholdDays,
  };
}

/**
 * Send a Slack DM to the deal rep when a champion has gone dark.
 * Mirrors the pattern of maybeSendSingleThreadAlert (REL-006).
 * Returns true if the message was sent, false if skipped or failed.
 */
async function maybeSendChampionGhostAlert(
  supabase: any,
  dealId: string,
  dealName: string,
  ownerId: string,
  ghostResult: ChampionGhostResult,
  appBaseUrl: string = 'https://app.use60.com'
): Promise<boolean> {
  // Resolve org_id for Slack settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', ownerId)
    .maybeSingle();

  if (!profile?.org_id) return false;

  const { data: slackSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token, is_connected')
    .eq('org_id', profile.org_id)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackSettings?.bot_access_token) {
    console.log(
      `[ChampionGhost] No Slack integration for org ${profile.org_id}, skipping Slack alert`
    );
    return false;
  }

  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', ownerId)
    .maybeSingle();

  if (!mapping?.slack_user_id) {
    console.log(
      `[ChampionGhost] No Slack user mapping for user ${ownerId}, skipping Slack alert`
    );
    return false;
  }

  const botToken: string = slackSettings.bot_access_token;
  const slackUserId: string = mapping.slack_user_id;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Alert: Champion gone dark — ${dealName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${ghostResult.championName}* (champion on *${dealName}*) has been ` +
          `inactive for *${ghostResult.daysSinceActive} days* — exceeding the ` +
          `${ghostResult.threshold}-day threshold.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Why this matters:* When your champion goes dark, the deal loses its internal ` +
          `advocate. Budget cycles, org changes, or competing priorities can derail it silently.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Suggested actions:*\n` +
          `1. Send a personalised re-engagement email to ${ghostResult.championName}\n` +
          `2. Try an alternate contact or ask for an intro to the economic buyer\n` +
          `3. Check LinkedIn for any role changes or org news`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Deal', emoji: true },
          url: `${appBaseUrl}/crm/pipeline?deal=${dealId}`,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ask Copilot', emoji: true },
          url: `${appBaseUrl}/crm/pipeline?copilot=true&context=deal:${dealId}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text:
            `Deal: ${dealName} | Champion: ${ghostResult.championName} | ` +
            `Inactive: ${ghostResult.daysSinceActive}d | ` +
            `${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
        },
      ],
    },
  ];

  try {
    const dmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });
    const dmResult = await dmResponse.json();

    if (!dmResult.ok) {
      console.error(
        `[ChampionGhost] Failed to open DM for user ${ownerId}:`,
        dmResult.error
      );
      return false;
    }

    const msgResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: dmResult.channel.id,
        blocks,
        text:
          `Alert: Champion ${ghostResult.championName} has been inactive for ` +
          `${ghostResult.daysSinceActive} days on deal "${dealName}".`,
      }),
    });
    const msgResult = await msgResponse.json();

    if (!msgResult.ok) {
      console.error(
        `[ChampionGhost] Failed to send Slack message for deal ${dealId}:`,
        msgResult.error
      );
      return false;
    }

    console.log(
      `[ChampionGhost] Sent champion ghost alert for deal ${dealId} to Slack user ${slackUserId}`
    );
    return true;
  } catch (err) {
    console.error(`[ChampionGhost] Error sending Slack DM for deal ${dealId}:`, err);
    return false;
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  try {
    // Parse request body
    const body: RequestBody = req.method === 'POST' ? await req.json() : {};
    const batchSize = body.batch_size || DEFAULT_BATCH_SIZE;
    const maxAgeMinutes = body.max_age_minutes || DEFAULT_MAX_AGE_MINUTES;

    // Create service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch unprocessed queue items
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

    const { data: queueItems, error: queueError } = await supabase
      .from('health_recalc_queue')
      .select('id, deal_id, contact_id, trigger_type, trigger_source, created_at')
      .is('processed_at', null)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (queueError) {
      console.error('Error fetching queue items:', queueError);
      return errorResponse('Failed to fetch queue items', req, 500);
    }

    if (!queueItems || queueItems.length === 0) {
      return jsonResponse({
        success: true,
        dealsRecalculated: 0,
        relationshipsRecalculated: 0,
        significantChanges: [],
        message: 'No items in queue to process',
      }, req);
    }

    // Group by deal_id and contact_id for deduplication
    const dealIds = new Set<string>();
    const contactIds = new Set<string>();
    const queueItemIds: string[] = [];
    const orgIdsByDeal = new Map<string, string>(); // Track org_id for each deal

    for (const item of queueItems) {
      queueItemIds.push(item.id);
      if (item.deal_id) dealIds.add(item.deal_id);
      if (item.contact_id) contactIds.add(item.contact_id);
    }

    const significantChanges: SignificantChange[] = [];
    // Maps dealId -> internal org UUID (for champion ghost detection + command_centre_items)
    const internalOrgIdsByDeal = new Map<string, string>();

    // Process deals
    for (const dealId of dealIds) {
      try {
        // Get deal owner and org_id
        const { data: deal } = await supabase
          .from('deals')
          .select('owner_id, name, clerk_org_id, org_id')
          .eq('id', dealId)
          .maybeSingle();

        if (!deal) continue;

        // Track org_id for this deal (for ops sync later)
        if (deal.clerk_org_id) {
          orgIdsByDeal.set(dealId, deal.clerk_org_id);
        }
        // Track internal org UUID for champion ghost detection
        if (deal.org_id) {
          internalOrgIdsByDeal.set(dealId, deal.org_id);
        }

        // Check for existing score
        const { data: existingScore } = await supabase
          .from('deal_health_scores')
          .select('overall_health_score')
          .eq('deal_id', dealId)
          .maybeSingle();

        const oldScore = existingScore?.overall_health_score || null;

        // Calculate new health score
        const healthScore = await calculateDealHealth(supabase, dealId, deal.owner_id);

        // Upsert to deal_health_scores
        const { error: upsertError } = await supabase
          .from('deal_health_scores')
          .upsert({
            deal_id: dealId,
            user_id: deal.owner_id,
            ...healthScore,
            last_calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'deal_id',
          });

        if (upsertError) {
          console.error(`Error upserting deal health score for ${dealId}:`, upsertError);
          continue;
        }

        // Insert snapshot into history
        const { error: historyError } = await supabase
          .from('deal_health_history')
          .insert({
            deal_id: dealId,
            overall_health_score: healthScore.overall_health_score,
            stage_velocity_score: healthScore.stage_velocity_score,
            sentiment_score: healthScore.sentiment_score,
            engagement_score: healthScore.engagement_score,
            activity_score: healthScore.activity_score,
            snapshot_at: new Date().toISOString(),
          });

        if (historyError) {
          console.error(`Error inserting health history for ${dealId}:`, historyError);
        }

        // ---------------------------------------------------------------
        // Multi-thread score calculation (REL-006)
        // ---------------------------------------------------------------
        try {
          const multiThread = await calculateMultiThreadScore(
            supabase,
            dealId,
            deal.clerk_org_id ?? null
          );

          if (multiThread !== null) {
            // Persist score to deals table
            await supabase
              .from('deals')
              .update({ multi_thread_score: multiThread.score })
              .eq('id', dealId);

            console.log(
              `[MultiThread] Deal ${dealId} (${deal.name}): score=${multiThread.score} ` +
              `(${multiThread.engagedContacts}/${multiThread.contactsNeeded} engaged contacts, ` +
              `stage=${multiThread.stageName})`
            );

            // Fire single-thread Slack alert if:
            //  1. Score is below threshold (< 0.5)
            //  2. Stage is proposal-level or later
            if (
              multiThread.score < SINGLE_THREAD_THRESHOLD &&
              multiThread.isAlertEligible
            ) {
              await maybeSendSingleThreadAlert(
                supabase,
                dealId,
                deal.name,
                deal.owner_id,
                multiThread
              );
            }
          }
        } catch (mtError) {
          // Non-blocking — log and continue
          console.error(`[MultiThread] Error calculating multi-thread score for deal ${dealId}:`, mtError);
        }

        // ---------------------------------------------------------------
        // Champion ghost detection (REL-008)
        // ---------------------------------------------------------------
        try {
          const internalOrgId = internalOrgIdsByDeal.get(dealId);
          if (internalOrgId) {
            const ghostResult = await checkChampionGhostDetection(
              supabase,
              dealId,
              deal.name,
              deal.owner_id,
              internalOrgId
            );

            if (ghostResult !== null) {
              // Optionally notify the rep via Slack DM
              await maybeSendChampionGhostAlert(
                supabase,
                dealId,
                deal.name,
                deal.owner_id,
                ghostResult
              );
            }
          }
        } catch (ghostError) {
          // Non-blocking — log and continue
          console.error(
            `[ChampionGhost] Error in ghost detection for deal ${dealId}:`,
            ghostError
          );
        }

        // Track significant changes
        if (oldScore !== null && Math.abs(healthScore.overall_health_score - oldScore) >= SIGNIFICANT_CHANGE_THRESHOLD) {
          significantChanges.push({
            deal_id: dealId,
            deal_name: deal.name,
            old_score: oldScore,
            new_score: healthScore.overall_health_score,
            change: healthScore.overall_health_score - oldScore,
            risk_level: healthScore.risk_level,
          });
        }
      } catch (error) {
        console.error(`Error processing deal ${dealId}:`, error);
        continue;
      }
    }

    // Process contacts
    for (const contactId of contactIds) {
      try {
        // Get contact owner
        const { data: contact } = await supabase
          .from('contacts')
          .select('owner_id')
          .eq('id', contactId)
          .maybeSingle();

        if (!contact) continue;

        // Calculate relationship health
        const relationshipHealth = await calculateRelationshipHealth(supabase, contactId, contact.owner_id);

        // Upsert to relationship_health_scores
        const { error: upsertError } = await supabase
          .from('relationship_health_scores')
          .upsert({
            contact_id: contactId,
            user_id: contact.owner_id,
            relationship_type: 'contact',
            ...relationshipHealth,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'contact_id,user_id',
          });

        if (upsertError) {
          console.error(`Error upserting relationship health for ${contactId}:`, upsertError);
        }
      } catch (error) {
        console.error(`Error processing contact ${contactId}:`, error);
        continue;
      }
    }

    // Sync health scores to ops table (grouped by org)
    let opsSyncedCount = 0;
    if (dealIds.size > 0) {
      try {
        // Group deals by org_id for batch sync
        const dealsByOrg = new Map<string, string[]>();
        for (const dealId of dealIds) {
          const orgId = orgIdsByDeal.get(dealId);
          if (orgId) {
            if (!dealsByOrg.has(orgId)) {
              dealsByOrg.set(orgId, []);
            }
            dealsByOrg.get(orgId)!.push(dealId);
          }
        }

        // Sync each org's deals
        for (const [orgId, orgDealIds] of dealsByOrg) {
          const result = await syncHealthScoresToOpsTable(supabase, orgDealIds, orgId);
          if (result.success) {
            opsSyncedCount += result.syncedCount;
            // Mark computed cells with metadata
            await markCellsAsComputed(supabase, orgDealIds, orgId);
          }
        }

        console.log(`[health-recalculate] Synced ${opsSyncedCount} deals to ops tables`);
      } catch (opsError) {
        console.error('Error syncing to ops table (non-blocking):', opsError);
      }
    }

    // Sync health scores to external CRMs using orchestrator (HubSpot, Attio)
    let hubspotSyncedCount = 0;
    let attioSyncedCount = 0;

    if (dealIds.size > 0) {
      // Group by org for CRM syncs (clerk_org_id from deals)
      const dealsByOrg = new Map<string, string[]>();
      for (const dealId of dealIds) {
        const clerkOrgId = orgIdsByDeal.get(dealId);
        if (clerkOrgId) {
          if (!dealsByOrg.has(clerkOrgId)) {
            dealsByOrg.set(clerkOrgId, []);
          }
          dealsByOrg.get(clerkOrgId)!.push(dealId);
        }
      }

      // Use CRM push orchestrator (delta detection + multi-CRM support)
      for (const [clerkOrgId, orgDealIds] of dealsByOrg) {
        try {
          const summary = await pushHealthScoresToCRMs(supabase, orgDealIds, clerkOrgId);
          hubspotSyncedCount += summary.hubspot.pushed;
          attioSyncedCount += summary.attio.pushed;
          console.log(`[health-recalculate] CRM orchestrator for org ${clerkOrgId}: HubSpot=${summary.hubspot.pushed}/${orgDealIds.length}, Attio=${summary.attio.pushed}/${orgDealIds.length}`);
        } catch (error) {
          console.error(`Error in CRM push orchestrator for org ${clerkOrgId} (non-blocking):`, error);
        }
      }

      console.log(`[health-recalculate] CRM sync totals: ${hubspotSyncedCount} to HubSpot, ${attioSyncedCount} to Attio`);
    }

    // Evaluate and insert alerts for significant changes
    let alertsInserted = 0;
    let alertsDeduplicated = 0;
    let slackAlertsSent = 0;

    if (significantChanges.length > 0) {
      try {
        const alerts = await evaluateAlerts(supabase, significantChanges);
        const result = await insertAlerts(supabase, alerts);
        alertsInserted = result.inserted;
        alertsDeduplicated = result.deduplicated;
        console.log(`[health-recalculate] Generated ${alerts.length} alerts, inserted ${alertsInserted}, deduplicated ${alertsDeduplicated}`);

        // Send Slack notifications for critical alerts
        if (alerts.length > 0) {
          try {
            const slackResult = await sendSlackAlerts(supabase, alerts);
            slackAlertsSent = slackResult.sent;
            console.log(`[health-recalculate] Sent ${slackAlertsSent} Slack alerts (skipped: ${slackResult.skipped}, failed: ${slackResult.failed})`);
          } catch (slackError) {
            console.error('Error sending Slack alerts (non-blocking):', slackError);
          }
        }
      } catch (alertError) {
        console.error('Error processing alerts (non-blocking):', alertError);
      }
    }

    // Mark queue items as processed
    const { error: updateError } = await supabase
      .from('health_recalc_queue')
      .update({ processed_at: new Date().toISOString() })
      .in('id', queueItemIds);

    if (updateError) {
      console.error('Error marking queue items as processed:', updateError);
    }

    return jsonResponse({
      success: true,
      dealsRecalculated: dealIds.size,
      relationshipsRecalculated: contactIds.size,
      significantChanges,
      itemsProcessed: queueItems.length,
      opsSyncedCount,
      hubspotSyncedCount,
      attioSyncedCount,
      alertsGenerated: alertsInserted,
      alertsDeduplicated,
      slackAlertsSent,
    }, req);

  } catch (error) {
    console.error('Health recalculation error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      500
    );
  }
});
