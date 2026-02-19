/**
 * Deal Analyze Risk Signals Edge Function
 *
 * Analyzes meetings and deal activity to detect risk signals:
 * - Timeline slips
 * - Budget concerns
 * - Competitor mentions
 * - Champion going silent
 * - Sentiment decline
 * - Stalled deals
 * - Unresolved objections
 * - Stakeholder concerns
 * - Scope creep
 * - Decision delays
 *
 * Can be triggered:
 * - After a meeting is processed (meetingId)
 * - On-demand for a specific deal (dealId)
 * - Periodically to check engagement patterns
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { captureException } from '../_shared/sentryEdge.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RequestBody {
  meetingId?: string;
  dealId?: string;
  forceReanalyze?: boolean;
  processForwardMovement?: boolean; // Also check for forward movement signals
}

interface ForwardMovementSignal {
  type: string;
  confidence: number;
  evidence: string;
}

interface PipelineAutomationRule {
  id: string;
  org_id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  action_config: Record<string, any>;
  min_confidence: number;
  cooldown_hours: number;
  is_active: boolean;
}

type RiskSignalType =
  | 'timeline_slip'
  | 'budget_concern'
  | 'competitor_mention'
  | 'champion_silent'
  | 'sentiment_decline'
  | 'stalled_deal'
  | 'objection_unresolved'
  | 'stakeholder_concern'
  | 'scope_creep'
  | 'decision_delay';

type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

interface RiskSignalConfig {
  type: RiskSignalType;
  name: string;
  patterns: string[];
  base_severity: RiskSeverity;
  late_stage_multiplier?: number;
  requires_unresolved?: boolean;
  engagement_threshold_days?: number;
}

interface DetectedSignal {
  type: RiskSignalType;
  severity: RiskSeverity;
  title: string;
  description: string;
  evidence: {
    meeting_ids: string[];
    quotes: string[];
    dates: string[];
    context?: string;
  };
  source_meeting_id?: string;
  confidence_score: number;
}

// Risk signal configuration
const RISK_SIGNAL_CONFIGS: RiskSignalConfig[] = [
  {
    type: 'timeline_slip',
    name: 'Timeline Slipping',
    patterns: ['timeline pushed', 'delayed', 'postpone', 'next quarter', 'not until', 'pushed back', 'defer', 'slow down', 'wait until'],
    base_severity: 'medium',
  },
  {
    type: 'budget_concern',
    name: 'Budget Concerns',
    patterns: ['budget', 'expensive', 'cost concern', 'price too high', 'ROI', 'afford', 'cut backs', 'budget freeze', 'over budget'],
    base_severity: 'high',
    requires_unresolved: true,
  },
  {
    type: 'competitor_mention',
    name: 'Competitor Mentioned',
    patterns: ['competitor', 'alternative', 'also looking at', 'comparing', 'other vendors', 'evaluating', 'other options', 'considering'],
    base_severity: 'medium',
    late_stage_multiplier: 1.5,
  },
  {
    type: 'champion_silent',
    name: 'Champion Gone Silent',
    patterns: [],
    base_severity: 'high',
    engagement_threshold_days: 14,
  },
  {
    type: 'sentiment_decline',
    name: 'Sentiment Declining',
    patterns: [],
    base_severity: 'high',
  },
  {
    type: 'stalled_deal',
    name: 'Deal Stalled',
    patterns: [],
    base_severity: 'critical',
    engagement_threshold_days: 21,
  },
  {
    type: 'objection_unresolved',
    name: 'Unresolved Objection',
    patterns: [],
    base_severity: 'medium',
    requires_unresolved: true,
  },
  {
    type: 'stakeholder_concern',
    name: 'New Stakeholder Concerns',
    patterns: ['boss', 'manager', 'leadership', 'board', 'CFO', 'CTO', 'CEO', 'concerns from', 'executive', 'leadership team'],
    base_severity: 'medium',
  },
  {
    type: 'scope_creep',
    name: 'Scope Creep',
    patterns: ['also need', 'additionally', 'expand scope', 'more features', 'requirement changed', 'new requirements', 'also want'],
    base_severity: 'medium',
  },
  {
    type: 'decision_delay',
    name: 'Decision Delayed',
    patterns: ['decision pushed', 'need more time', 'revisit later', 'not ready to decide', 'hold off', 'think about it', 'come back to'],
    base_severity: 'high',
  },
];

/**
 * Calculate severity multiplier based on deal stage
 */
function getStageSeverityMultiplier(stage: string | null): number {
  const stageMultipliers: Record<string, number> = {
    'SQL': 1.0,
    'Opportunity': 1.2,
    'Verbal': 1.5,
    'Signed': 0.5, // Less concerning for closed deals
  };
  return stageMultipliers[stage || ''] || 1.0;
}

/**
 * Adjust severity based on multiplier
 */
function adjustSeverity(baseSeverity: RiskSeverity, multiplier: number): RiskSeverity {
  const severityOrder: RiskSeverity[] = ['low', 'medium', 'high', 'critical'];
  const baseIndex = severityOrder.indexOf(baseSeverity);

  if (multiplier >= 1.5 && baseIndex < severityOrder.length - 1) {
    return severityOrder[baseIndex + 1];
  }
  if (multiplier < 0.7 && baseIndex > 0) {
    return severityOrder[baseIndex - 1];
  }
  return baseSeverity;
}

/**
 * Search for pattern matches in text
 */
function findPatternMatches(text: string, patterns: string[]): { found: boolean; matches: string[] } {
  const lowerText = text.toLowerCase();
  const matches: string[] = [];

  for (const pattern of patterns) {
    if (lowerText.includes(pattern.toLowerCase())) {
      // Extract context around the match
      const index = lowerText.indexOf(pattern.toLowerCase());
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + pattern.length + 50);
      matches.push('...' + text.substring(start, end).trim() + '...');
    }
  }

  return { found: matches.length > 0, matches };
}

/**
 * Analyze structured summary for risk signals
 */
function analyzeStructuredSummary(
  summary: any,
  meeting: any,
  dealStage: string | null
): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const stageMultiplier = getStageSeverityMultiplier(dealStage);

  // Combine all text for pattern matching
  const allText = JSON.stringify(summary);

  // Analyze each risk signal type
  for (const config of RISK_SIGNAL_CONFIGS) {
    // Skip engagement-based signals (handled separately)
    if (config.engagement_threshold_days && config.patterns.length === 0) {
      continue;
    }

    // Pattern-based signals
    if (config.patterns.length > 0) {
      const { found, matches } = findPatternMatches(allText, config.patterns);

      if (found) {
        const severity = adjustSeverity(
          config.base_severity,
          stageMultiplier * (config.late_stage_multiplier || 1)
        );

        signals.push({
          type: config.type,
          severity,
          title: config.name,
          description: `Detected ${config.name.toLowerCase()} in meeting: ${meeting.title || 'Untitled'}`,
          evidence: {
            meeting_ids: [meeting.id],
            quotes: matches.slice(0, 3), // Limit to 3 quotes
            dates: [meeting.start_time || new Date().toISOString()],
            context: `Meeting: ${meeting.title}`,
          },
          source_meeting_id: meeting.id,
          confidence_score: Math.min(0.9, 0.5 + (matches.length * 0.1)),
        });
      }
    }

    // Special handling for objection_unresolved
    if (config.type === 'objection_unresolved' && summary.objections) {
      const unresolvedObjections = summary.objections.filter((o: any) => !o.resolved);

      if (unresolvedObjections.length > 0) {
        signals.push({
          type: 'objection_unresolved',
          severity: adjustSeverity(config.base_severity, stageMultiplier),
          title: config.name,
          description: `${unresolvedObjections.length} unresolved objection(s) from meeting: ${meeting.title || 'Untitled'}`,
          evidence: {
            meeting_ids: [meeting.id],
            quotes: unresolvedObjections.map((o: any) => o.objection).slice(0, 3),
            dates: [meeting.start_time || new Date().toISOString()],
            context: `Categories: ${unresolvedObjections.map((o: any) => o.category || 'general').join(', ')}`,
          },
          source_meeting_id: meeting.id,
          confidence_score: 0.8,
        });
      }
    }

    // Special handling for competitor_mention
    if (config.type === 'competitor_mention' && summary.competitor_mentions?.length > 0) {
      const competitors = summary.competitor_mentions;
      const negativeCompetitors = competitors.filter((c: any) => c.sentiment !== 'negative');

      if (negativeCompetitors.length > 0) {
        signals.push({
          type: 'competitor_mention',
          severity: adjustSeverity(config.base_severity, stageMultiplier * (config.late_stage_multiplier || 1)),
          title: config.name,
          description: `${competitors.length} competitor(s) mentioned: ${competitors.map((c: any) => c.name).join(', ')}`,
          evidence: {
            meeting_ids: [meeting.id],
            quotes: competitors.map((c: any) => `${c.name}: ${c.context}`).slice(0, 3),
            dates: [meeting.start_time || new Date().toISOString()],
            context: `Competitors: ${competitors.map((c: any) => c.name).join(', ')}`,
          },
          source_meeting_id: meeting.id,
          confidence_score: 0.85,
        });
      }
    }

    // Special handling for sentiment_decline
    if (config.type === 'sentiment_decline' && summary.outcome_signals) {
      const negativeSignals = summary.outcome_signals.negative_signals || [];
      const positiveSignals = summary.outcome_signals.positive_signals || [];

      if (negativeSignals.length > positiveSignals.length && negativeSignals.length >= 2) {
        signals.push({
          type: 'sentiment_decline',
          severity: adjustSeverity(config.base_severity, stageMultiplier),
          title: config.name,
          description: `Meeting had more negative signals (${negativeSignals.length}) than positive (${positiveSignals.length})`,
          evidence: {
            meeting_ids: [meeting.id],
            quotes: negativeSignals.slice(0, 3),
            dates: [meeting.start_time || new Date().toISOString()],
            context: `Overall outcome: ${summary.outcome_signals.overall}`,
          },
          source_meeting_id: meeting.id,
          confidence_score: 0.7,
        });
      }
    }
  }

  return signals;
}

/**
 * Analyze engagement patterns for a deal
 */
async function analyzeEngagementPatterns(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  // Get deal info with stage name from deal_stages
  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, stage_id, owner_id, company_id, primary_contact_id, created_at, deal_stages(name)')
    .eq('id', dealId)
    .single();

  if (!deal) return signals;

  // Extract stage name from joined table
  const dealStage = (deal.deal_stages as any)?.name || null;

  // Get recent meetings for this deal's company
  const { data: recentMeetings } = await supabase
    .from('meetings')
    .select('id, start_time, sentiment_score, company_id')
    .eq('company_id', deal.company_id)
    .order('start_time', { ascending: false })
    .limit(10);

  const meetings = recentMeetings || [];

  // Check for stalled deal (no meetings in threshold days)
  const stalledConfig = RISK_SIGNAL_CONFIGS.find(c => c.type === 'stalled_deal');
  if (stalledConfig?.engagement_threshold_days) {
    const lastMeeting = meetings[0];
    if (lastMeeting) {
      const daysSinceLastMeeting = Math.floor(
        (Date.now() - new Date(lastMeeting.start_time).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastMeeting >= stalledConfig.engagement_threshold_days) {
        signals.push({
          type: 'stalled_deal',
          severity: stalledConfig.base_severity,
          title: stalledConfig.name,
          description: `No meetings in ${daysSinceLastMeeting} days`,
          evidence: {
            meeting_ids: lastMeeting ? [lastMeeting.id] : [],
            quotes: [`Last meeting was ${daysSinceLastMeeting} days ago`],
            dates: [lastMeeting?.start_time || new Date().toISOString()],
            context: `Deal stage: ${dealStage}`,
          },
          confidence_score: 0.9,
        });
      }
    } else {
      // No meetings at all
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCreation >= stalledConfig.engagement_threshold_days) {
        signals.push({
          type: 'stalled_deal',
          severity: stalledConfig.base_severity,
          title: stalledConfig.name,
          description: `No meetings recorded for this deal`,
          evidence: {
            meeting_ids: [],
            quotes: [`Deal created ${daysSinceCreation} days ago with no meetings`],
            dates: [deal.created_at],
            context: `Deal stage: ${dealStage}`,
          },
          confidence_score: 0.85,
        });
      }
    }
  }

  // Check for champion gone silent
  const championConfig = RISK_SIGNAL_CONFIGS.find(c => c.type === 'champion_silent');
  if (championConfig?.engagement_threshold_days && deal.primary_contact_id) {
    // Check last communication with primary contact
    const { data: lastActivity } = await supabase
      .from('activities')
      .select('id, created_at, activity_type')
      .eq('contact_id', deal.primary_contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastActivity) {
      const daysSinceContact = Math.floor(
        (Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceContact >= championConfig.engagement_threshold_days) {
        signals.push({
          type: 'champion_silent',
          severity: championConfig.base_severity,
          title: championConfig.name,
          description: `No contact with primary champion in ${daysSinceContact} days`,
          evidence: {
            meeting_ids: [],
            quotes: [`Last activity was ${daysSinceContact} days ago (${lastActivity.activity_type})`],
            dates: [lastActivity.created_at],
            context: `Primary contact may be disengaging`,
          },
          confidence_score: 0.75,
        });
      }
    }
  }

  // Check for sentiment decline trend
  if (meetings.length >= 3) {
    const sentimentScores = meetings
      .filter((m: any) => m.sentiment_score != null)
      .slice(0, 5)
      .map((m: any) => m.sentiment_score);

    if (sentimentScores.length >= 3) {
      // Check if sentiment is declining
      const recentAvg = (sentimentScores[0] + sentimentScores[1]) / 2;
      const olderAvg = sentimentScores.slice(2).reduce((a, b) => a + b, 0) / sentimentScores.slice(2).length;

      if (recentAvg < olderAvg - 10) { // 10 point decline
        signals.push({
          type: 'sentiment_decline',
          severity: 'high',
          title: 'Sentiment Declining',
          description: `Meeting sentiment dropped by ${Math.round(olderAvg - recentAvg)} points`,
          evidence: {
            meeting_ids: meetings.slice(0, 3).map((m: any) => m.id),
            quotes: [`Recent avg: ${recentAvg.toFixed(0)}, Previous avg: ${olderAvg.toFixed(0)}`],
            dates: meetings.slice(0, 3).map((m: any) => m.start_time),
            context: `Trend across last ${sentimentScores.length} meetings`,
          },
          confidence_score: 0.7,
        });
      }
    }
  }

  return signals;
}

/**
 * Save detected signals to database
 */
async function saveRiskSignals(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string,
  signals: DetectedSignal[]
): Promise<void> {
  for (const signal of signals) {
    // Check if similar signal already exists (same type, source meeting)
    const { data: existing } = await supabase
      .from('deal_risk_signals')
      .select('id, evidence')
      .eq('deal_id', dealId)
      .eq('signal_type', signal.type)
      .eq('is_resolved', false)
      .maybeSingle();

    if (existing && signal.source_meeting_id) {
      // Update existing signal with new evidence
      const existingEvidence = existing.evidence || { meeting_ids: [], quotes: [], dates: [] };

      // Merge evidence if from a new meeting
      if (!existingEvidence.meeting_ids.includes(signal.source_meeting_id)) {
        const mergedEvidence = {
          meeting_ids: [...existingEvidence.meeting_ids, ...signal.evidence.meeting_ids].slice(-5),
          quotes: [...existingEvidence.quotes, ...signal.evidence.quotes].slice(-5),
          dates: [...existingEvidence.dates, ...signal.evidence.dates].slice(-5),
          context: signal.evidence.context,
        };

        await supabase
          .from('deal_risk_signals')
          .update({
            evidence: mergedEvidence,
            severity: signal.severity,
            confidence_score: Math.min(0.95, signal.confidence_score + 0.05),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } else if (!existing) {
      // Create new signal
      await supabase
        .from('deal_risk_signals')
        .insert({
          deal_id: dealId,
          org_id: orgId,
          signal_type: signal.type,
          severity: signal.severity,
          title: signal.title,
          description: signal.description,
          evidence: signal.evidence,
          source_meeting_id: signal.source_meeting_id,
          confidence_score: signal.confidence_score,
          is_resolved: false,
          auto_dismissed: false,
          detected_at: new Date().toISOString(),
        });
    }
  }
}

/**
 * Recalculate deal risk aggregate
 */
async function recalculateRiskAggregate(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string
): Promise<any> {
  // Get all active signals for this deal
  const { data: signals } = await supabase
    .from('deal_risk_signals')
    .select('*')
    .eq('deal_id', dealId)
    .eq('is_resolved', false)
    .eq('auto_dismissed', false);

  const activeSignals = signals || [];

  // Count by severity
  const criticalCount = activeSignals.filter(s => s.severity === 'critical').length;
  const highCount = activeSignals.filter(s => s.severity === 'high').length;
  const mediumCount = activeSignals.filter(s => s.severity === 'medium').length;
  const lowCount = activeSignals.filter(s => s.severity === 'low').length;

  // Calculate risk score (0-100)
  const riskScore = Math.min(100,
    (criticalCount * 40) +
    (highCount * 25) +
    (mediumCount * 10) +
    (lowCount * 5)
  );

  // Determine overall risk level
  let overallRiskLevel: RiskSeverity;
  if (criticalCount > 0 || riskScore >= 80) {
    overallRiskLevel = 'critical';
  } else if (highCount >= 2 || riskScore >= 50) {
    overallRiskLevel = 'high';
  } else if (mediumCount >= 2 || riskScore >= 25) {
    overallRiskLevel = 'medium';
  } else {
    overallRiskLevel = 'low';
  }

  // Build signal breakdown
  const signalBreakdown: Record<RiskSignalType, number> = {} as any;
  for (const signal of activeSignals) {
    signalBreakdown[signal.signal_type as RiskSignalType] =
      (signalBreakdown[signal.signal_type as RiskSignalType] || 0) + 1;
  }

  // Get meeting metrics for sentiment trend
  const { data: deal } = await supabase
    .from('deals')
    .select('company_id, primary_contact_id')
    .eq('id', dealId)
    .single();

  let sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
  let avgSentimentLast3: number | null = null;
  let sentimentChangePct: number | null = null;
  let daysSinceLastMeeting: number | null = null;
  let daysSinceChampionContact: number | null = null;
  let lastForwardMovementAt: string | null = null;
  let meetingFrequencyTrend: 'increasing' | 'stable' | 'decreasing' | 'unknown' = 'unknown';

  if (deal?.company_id) {
    const { data: recentMeetings } = await supabase
      .from('meetings')
      .select('id, start_time, sentiment_score')
      .eq('company_id', deal.company_id)
      .order('start_time', { ascending: false })
      .limit(10);

    if (recentMeetings && recentMeetings.length > 0) {
      daysSinceLastMeeting = Math.floor(
        (Date.now() - new Date(recentMeetings[0].start_time).getTime()) / (1000 * 60 * 60 * 24)
      );

      const sentimentScores = recentMeetings
        .filter(m => m.sentiment_score != null)
        .map(m => m.sentiment_score);

      if (sentimentScores.length >= 3) {
        avgSentimentLast3 = sentimentScores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        const olderAvg = sentimentScores.slice(3).length > 0
          ? sentimentScores.slice(3).reduce((a, b) => a + b, 0) / sentimentScores.slice(3).length
          : avgSentimentLast3;

        sentimentChangePct = olderAvg > 0
          ? ((avgSentimentLast3 - olderAvg) / olderAvg) * 100
          : 0;

        if (sentimentChangePct > 5) sentimentTrend = 'improving';
        else if (sentimentChangePct < -5) sentimentTrend = 'declining';
        else sentimentTrend = 'stable';
      }

      // Check meeting frequency
      if (recentMeetings.length >= 4) {
        const recentGap = recentMeetings[0]?.start_time && recentMeetings[1]?.start_time
          ? (new Date(recentMeetings[0].start_time).getTime() - new Date(recentMeetings[1].start_time).getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        const olderGap = recentMeetings[2]?.start_time && recentMeetings[3]?.start_time
          ? (new Date(recentMeetings[2].start_time).getTime() - new Date(recentMeetings[3].start_time).getTime()) / (1000 * 60 * 60 * 24)
          : 0;

        if (recentGap < olderGap * 0.7) meetingFrequencyTrend = 'increasing';
        else if (recentGap > olderGap * 1.3) meetingFrequencyTrend = 'decreasing';
        else meetingFrequencyTrend = 'stable';
      }
    }

    // Check forward movement
    const { data: forwardMeetings } = await supabase
      .from('meeting_classifications')
      .select('meeting_id, updated_at')
      .eq('org_id', orgId)
      .eq('has_forward_movement', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (forwardMeetings && forwardMeetings.length > 0) {
      lastForwardMovementAt = forwardMeetings[0].updated_at;
    }
  }

  // Check days since champion contact
  if (deal?.primary_contact_id) {
    const { data: lastActivity } = await supabase
      .from('activities')
      .select('created_at')
      .eq('contact_id', deal.primary_contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lastActivity) {
      daysSinceChampionContact = Math.floor(
        (Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
    }
  }

  // Generate recommended actions
  const recommendedActions: Array<{ action: string; priority: 'high' | 'medium' | 'low'; rationale: string }> = [];

  if (criticalCount > 0) {
    recommendedActions.push({
      action: 'Schedule urgent review meeting with deal owner',
      priority: 'high',
      rationale: `${criticalCount} critical risk signal(s) detected`,
    });
  }

  if (signalBreakdown.champion_silent) {
    recommendedActions.push({
      action: 'Re-engage primary contact with value-add content',
      priority: 'high',
      rationale: 'Champion has gone silent',
    });
  }

  if (signalBreakdown.competitor_mention) {
    recommendedActions.push({
      action: 'Prepare competitive differentiation talking points',
      priority: 'medium',
      rationale: 'Competitor(s) mentioned in recent meetings',
    });
  }

  if (signalBreakdown.budget_concern) {
    recommendedActions.push({
      action: 'Review pricing and ROI documentation',
      priority: 'high',
      rationale: 'Budget concerns raised',
    });
  }

  if (signalBreakdown.stalled_deal) {
    recommendedActions.push({
      action: 'Create re-engagement campaign',
      priority: 'high',
      rationale: 'Deal has stalled with no recent activity',
    });
  }

  // Generate risk summary
  const riskSummary = generateRiskSummary(activeSignals, overallRiskLevel, riskScore);

  // Upsert aggregate
  const aggregateData = {
    deal_id: dealId,
    org_id: orgId,
    overall_risk_level: overallRiskLevel,
    risk_score: riskScore,
    active_signals_count: activeSignals.length,
    critical_signals_count: criticalCount,
    high_signals_count: highCount,
    medium_signals_count: mediumCount,
    low_signals_count: lowCount,
    signal_breakdown: signalBreakdown,
    sentiment_trend: sentimentTrend,
    avg_sentiment_last_3_meetings: avgSentimentLast3,
    sentiment_change_pct: sentimentChangePct,
    days_since_last_meeting: daysSinceLastMeeting,
    days_since_champion_contact: daysSinceChampionContact,
    meeting_frequency_trend: meetingFrequencyTrend,
    last_forward_movement_at: lastForwardMovementAt,
    days_without_forward_movement: lastForwardMovementAt
      ? Math.floor((Date.now() - new Date(lastForwardMovementAt).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    recommended_actions: recommendedActions,
    risk_summary: riskSummary,
    last_calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('deal_risk_aggregates')
    .upsert(aggregateData, { onConflict: 'deal_id' });

  if (error) {
    console.error('Failed to upsert risk aggregate:', error);
  }

  return aggregateData;
}

/**
 * Get forward movement signals from meeting workflow results
 */
async function getForwardMovementSignals(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string
): Promise<{ signals: ForwardMovementSignal[]; meetingId: string | null }> {
  // Get deal's company_id
  const { data: deal } = await supabase
    .from('deals')
    .select('company_id')
    .eq('id', dealId)
    .single();

  if (!deal?.company_id) {
    return { signals: [], meetingId: null };
  }

  // Get recent meeting workflow results with forward movement signals
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id')
    .eq('company_id', deal.company_id)
    .order('start_time', { ascending: false })
    .limit(5);

  if (!meetings || meetings.length === 0) {
    return { signals: [], meetingId: null };
  }

  const meetingIds = meetings.map(m => m.id);

  // Get workflow results with forward movement signals
  const { data: workflowResults } = await supabase
    .from('meeting_workflow_results')
    .select('meeting_id, forward_movement_signals, created_at')
    .in('meeting_id', meetingIds)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!workflowResults || workflowResults.length === 0) {
    return { signals: [], meetingId: null };
  }

  const result = workflowResults[0];
  const signals = (result.forward_movement_signals || []) as ForwardMovementSignal[];

  return {
    signals: signals.filter(s => s.confidence >= 0.5), // Only return high-confidence signals
    meetingId: result.meeting_id,
  };
}

/**
 * Get applicable automation rules for a trigger type
 */
async function getApplicableRules(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  triggerType: string,
  minConfidence: number
): Promise<PipelineAutomationRule[]> {
  const { data: rules, error } = await supabase
    .from('pipeline_automation_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .lte('min_confidence', minConfidence);

  if (error) {
    console.error('Error fetching automation rules:', error);
    return [];
  }

  return rules || [];
}

/**
 * Check if rule is within cooldown period for a deal
 */
async function isRuleInCooldown(
  supabase: ReturnType<typeof createClient>,
  ruleId: string,
  dealId: string,
  cooldownHours: number
): Promise<boolean> {
  const cooldownTime = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

  const { data: recentLogs } = await supabase
    .from('pipeline_automation_log')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('deal_id', dealId)
    .eq('status', 'success')
    .gte('created_at', cooldownTime)
    .limit(1);

  return (recentLogs?.length || 0) > 0;
}

/**
 * Execute pipeline automation action
 */
async function executeAutomationAction(
  supabase: ReturnType<typeof createClient>,
  rule: PipelineAutomationRule,
  dealId: string,
  meetingId: string | null,
  signal: ForwardMovementSignal
): Promise<{ success: boolean; result: any; error?: string }> {
  try {
    switch (rule.action_type) {
      case 'advance_stage': {
        // Get current deal with stage info
        const { data: deal } = await supabase
          .from('deals')
          .select('id, stage_id, deal_stages(id, name, position)')
          .eq('id', dealId)
          .single();

        if (!deal) {
          return { success: false, result: null, error: 'Deal not found' };
        }

        const currentStage = deal.deal_stages as any;
        let targetStageId: string | null = null;

        if (rule.action_config.advance_to_next) {
          // Find next stage by position
          const { data: nextStage } = await supabase
            .from('deal_stages')
            .select('id, name')
            .eq('org_id', rule.org_id)
            .gt('position', currentStage?.position || 0)
            .order('position', { ascending: true })
            .limit(1)
            .single();

          targetStageId = nextStage?.id || null;
        } else if (rule.action_config.target_stage_id) {
          targetStageId = rule.action_config.target_stage_id;
        }

        if (!targetStageId) {
          return { success: false, result: null, error: 'No target stage found' };
        }

        // Update deal stage
        const { error: updateError } = await supabase
          .from('deals')
          .update({ stage_id: targetStageId })
          .eq('id', dealId);

        if (updateError) {
          return { success: false, result: null, error: updateError.message };
        }

        return {
          success: true,
          result: {
            action: 'stage_advanced',
            from_stage_id: deal.stage_id,
            to_stage_id: targetStageId,
            deal_id: dealId,
          },
        };
      }

      case 'create_task': {
        // Get deal name for template
        const { data: deal } = await supabase
          .from('deals')
          .select('id, name, owner_id')
          .eq('id', dealId)
          .single();

        if (!deal) {
          return { success: false, result: null, error: 'Deal not found' };
        }

        // Process title template
        let title = rule.action_config.title_template || 'Follow up task';
        title = title.replace('{{deal_name}}', deal.name || 'Unknown Deal');
        title = title.replace('{{signal_type}}', signal.type);

        // Calculate due date
        const dueDays = rule.action_config.due_days || 3;
        const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Create task
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title,
            description: `Auto-created task based on ${signal.type} detected in call. Evidence: ${signal.evidence}`,
            deal_id: dealId,
            user_id: deal.owner_id,
            due_date: dueDate,
            priority: rule.action_config.priority || 'medium',
            status: 'pending',
            is_auto_generated: true,
            auto_generation_source: 'pipeline_automation',
          })
          .select('id')
          .single();

        if (taskError) {
          return { success: false, result: null, error: taskError.message };
        }

        return {
          success: true,
          result: {
            action: 'task_created',
            task_id: task?.id,
            title,
            due_date: dueDate,
          },
        };
      }

      case 'send_notification': {
        // Get deal info
        const { data: deal } = await supabase
          .from('deals')
          .select('id, name, owner_id')
          .eq('id', dealId)
          .single();

        if (!deal) {
          return { success: false, result: null, error: 'Deal not found' };
        }

        const channels = rule.action_config.channels || ['in_app'];
        let messageTemplate = rule.action_config.message_template || 'Forward movement detected: {{signal_type}}';
        messageTemplate = messageTemplate.replace('{{deal_name}}', deal.name || 'Unknown Deal');
        messageTemplate = messageTemplate.replace('{{signal_type}}', signal.type);
        messageTemplate = messageTemplate.replace('{{evidence}}', signal.evidence);

        // Create in-app notification
        if (channels.includes('in_app')) {
          await supabase.from('notifications').insert({
            user_id: deal.owner_id,
            title: 'Pipeline Update',
            message: messageTemplate,
            type: 'pipeline_automation',
            metadata: {
              deal_id: dealId,
              meeting_id: meetingId,
              signal_type: signal.type,
            },
            is_read: false,
          });
        }

        // Note: Email and Slack notifications would be handled by separate edge functions
        // For now, we just log them as pending
        return {
          success: true,
          result: {
            action: 'notification_sent',
            channels,
            message: messageTemplate,
          },
        };
      }

      case 'update_deal_field': {
        const field = rule.action_config.field;
        let value = rule.action_config.value_template || rule.action_config.value;

        if (typeof value === 'string') {
          value = value.replace('{{signal_type}}', signal.type);
          value = value.replace('{{evidence}}', signal.evidence);
        }

        // Update the deal field
        const { error: updateError } = await supabase
          .from('deals')
          .update({ [field]: value })
          .eq('id', dealId);

        if (updateError) {
          return { success: false, result: null, error: updateError.message };
        }

        return {
          success: true,
          result: {
            action: 'deal_field_updated',
            field,
            value,
          },
        };
      }

      default:
        return { success: false, result: null, error: `Unknown action type: ${rule.action_type}` };
    }
  } catch (error) {
    return { success: false, result: null, error: (error as Error).message };
  }
}

/**
 * Log automation action to pipeline_automation_log
 */
async function logAutomationAction(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  ruleId: string,
  meetingId: string | null,
  dealId: string,
  triggerType: string,
  signal: ForwardMovementSignal,
  actionType: string,
  result: any,
  status: 'success' | 'failed' | 'skipped',
  errorMessage?: string
): Promise<void> {
  await supabase.from('pipeline_automation_log').insert({
    org_id: orgId,
    rule_id: ruleId,
    meeting_id: meetingId,
    deal_id: dealId,
    trigger_type: triggerType,
    trigger_signal: signal,
    action_type: actionType,
    action_result: result,
    status,
    error_message: errorMessage,
  });
}

/**
 * Process forward movement signals and execute automation rules
 */
async function processForwardMovementAutomation(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  orgId: string
): Promise<{ executed: number; skipped: number; failed: number; actions: any[] }> {
  const result = { executed: 0, skipped: 0, failed: 0, actions: [] as any[] };

  // Get forward movement signals for this deal
  const { signals, meetingId } = await getForwardMovementSignals(supabase, dealId, orgId);

  if (signals.length === 0) {
    return result;
  }

  // Process each signal
  for (const signal of signals) {
    // Map signal type to trigger type
    const triggerType = signal.type === 'proposal_requested' ? 'proposal_requested'
      : signal.type === 'pricing_discussed' ? 'pricing_discussed'
      : signal.type === 'verbal_commitment' ? 'verbal_commitment'
      : signal.type === 'next_meeting_scheduled' ? 'next_meeting_scheduled'
      : signal.type === 'decision_maker_engaged' ? 'decision_maker_engaged'
      : signal.type === 'timeline_confirmed' ? 'timeline_confirmed'
      : 'forward_movement_detected';

    // Get applicable rules for this signal
    const rules = await getApplicableRules(supabase, orgId, triggerType, signal.confidence);

    // Also get general forward movement rules
    if (triggerType !== 'forward_movement_detected') {
      const generalRules = await getApplicableRules(supabase, orgId, 'forward_movement_detected', signal.confidence);
      rules.push(...generalRules);
    }

    // Execute each rule
    for (const rule of rules) {
      // Check cooldown
      const inCooldown = await isRuleInCooldown(supabase, rule.id, dealId, rule.cooldown_hours);

      if (inCooldown) {
        result.skipped++;
        await logAutomationAction(
          supabase,
          orgId,
          rule.id,
          meetingId,
          dealId,
          triggerType,
          signal,
          rule.action_type,
          null,
          'skipped',
          'Rule is within cooldown period'
        );
        continue;
      }

      // Execute the action
      const { success, result: actionResult, error } = await executeAutomationAction(
        supabase,
        rule,
        dealId,
        meetingId,
        signal
      );

      if (success) {
        result.executed++;
        result.actions.push({
          rule_name: rule.name,
          action_type: rule.action_type,
          result: actionResult,
        });
      } else {
        result.failed++;
      }

      // Log the action
      await logAutomationAction(
        supabase,
        orgId,
        rule.id,
        meetingId,
        dealId,
        triggerType,
        signal,
        rule.action_type,
        actionResult,
        success ? 'success' : 'failed',
        error
      );
    }
  }

  return result;
}

/**
 * Generate human-readable risk summary
 */
function generateRiskSummary(signals: any[], riskLevel: RiskSeverity, riskScore: number): string {
  if (signals.length === 0) {
    return 'No active risk signals detected. Deal appears healthy.';
  }

  const parts: string[] = [];

  if (riskLevel === 'critical') {
    parts.push(`⚠️ CRITICAL: This deal has ${signals.length} active risk signal(s) requiring immediate attention.`);
  } else if (riskLevel === 'high') {
    parts.push(`🔴 HIGH RISK: ${signals.length} risk signal(s) detected that may impact deal success.`);
  } else if (riskLevel === 'medium') {
    parts.push(`🟡 MODERATE RISK: ${signals.length} signal(s) worth monitoring.`);
  } else {
    parts.push(`🟢 LOW RISK: Minor signal(s) detected but deal looks on track.`);
  }

  // Add top concerns
  const topSignals = signals
    .sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity as RiskSeverity] - severityOrder[b.severity as RiskSeverity];
    })
    .slice(0, 3);

  if (topSignals.length > 0) {
    parts.push('Top concerns: ' + topSignals.map(s => s.title).join(', ') + '.');
  }

  return parts.join(' ');
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const { meetingId, dealId, forceReanalyze = false, processForwardMovement = false }: RequestBody = await req.json();

    if (!meetingId && !dealId) {
      return new Response(
        JSON.stringify({ error: 'Either meetingId or dealId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let dealsToProcess: string[] = [];
    let orgId: string | null = null;
    const allDetectedSignals: DetectedSignal[] = [];

    if (meetingId) {
      // Process single meeting - find associated deal
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          company_id,
          owner_user_id,
          sentiment_score
        `)
        .eq('id', meetingId)
        .single();

      if (meetingError || !meeting) {
        return new Response(
          JSON.stringify({ error: `Meeting not found: ${meetingError?.message || 'Unknown error'}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get org_id from user membership
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', meeting.owner_user_id)
        .limit(1)
        .single();

      if (!membership?.org_id) {
        return new Response(
          JSON.stringify({ error: 'User is not a member of any organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orgId = membership.org_id;

      // Get structured summary for this meeting
      const { data: summary } = await supabase
        .from('meeting_structured_summaries')
        .select('*')
        .eq('meeting_id', meetingId)
        .single();

      if (summary) {
        // Find deals associated with this meeting's company
        // Join with deal_stages to get stage name
        const { data: deals } = await supabase
          .from('deals')
          .select('id, stage_id, deal_stages(name)')
          .eq('company_id', meeting.company_id);

        // Filter out Signed deals (need to check after fetch since we need the joined name)
        const activeDeals = deals?.filter(d => (d.deal_stages as any)?.name !== 'Signed') || [];

        if (activeDeals.length > 0) {
          // Analyze meeting for risk signals
          for (const deal of activeDeals) {
            const stageName = (deal.deal_stages as any)?.name || null;
            const signals = analyzeStructuredSummary(summary, meeting, stageName);
            allDetectedSignals.push(...signals);

            // Save signals
            await saveRiskSignals(supabase, deal.id, orgId!, signals);
            dealsToProcess.push(deal.id);
          }
        }
      }
    } else if (dealId) {
      // Process specific deal - join with deal_stages for stage name
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('id, stage_id, company_id, owner_id, deal_stages(name)')
        .eq('id', dealId)
        .single();

      if (dealError || !deal) {
        return new Response(
          JSON.stringify({ error: `Deal not found: ${dealError?.message || 'Unknown error'}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get org_id
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', deal.owner_id)
        .limit(1)
        .single();

      if (!membership?.org_id) {
        return new Response(
          JSON.stringify({ error: 'User is not a member of any organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      orgId = membership.org_id;
      dealsToProcess = [dealId];

      // Extract stage name from joined table
      const stageName = (deal.deal_stages as any)?.name || null;

      // Get all meetings for this deal's company
      const { data: meetings } = await supabase
        .from('meetings')
        .select('id, title, start_time, company_id, sentiment_score')
        .eq('company_id', deal.company_id)
        .order('start_time', { ascending: false });

      if (meetings && meetings.length > 0) {
        // Analyze each meeting with a structured summary
        for (const meeting of meetings) {
          const { data: summary } = await supabase
            .from('meeting_structured_summaries')
            .select('*')
            .eq('meeting_id', meeting.id)
            .single();

          if (summary) {
            const signals = analyzeStructuredSummary(summary, meeting, stageName);
            allDetectedSignals.push(...signals);
            await saveRiskSignals(supabase, dealId, orgId!, signals);
          }
        }
      }

      // Also check engagement patterns
      const engagementSignals = await analyzeEngagementPatterns(supabase, dealId, orgId!);
      allDetectedSignals.push(...engagementSignals);
      await saveRiskSignals(supabase, dealId, orgId!, engagementSignals);
    }

    // Recalculate aggregates for all processed deals
    const aggregates: any[] = [];
    for (const id of dealsToProcess) {
      const aggregate = await recalculateRiskAggregate(supabase, id, orgId!);
      aggregates.push(aggregate);
    }

    // Process forward movement automation if requested
    let automationResults: any = null;
    if (processForwardMovement && dealsToProcess.length > 0 && orgId) {
      automationResults = {
        total_executed: 0,
        total_skipped: 0,
        total_failed: 0,
        deal_actions: [] as any[],
      };

      for (const id of dealsToProcess) {
        const result = await processForwardMovementAutomation(supabase, id, orgId);
        automationResults.total_executed += result.executed;
        automationResults.total_skipped += result.skipped;
        automationResults.total_failed += result.failed;
        if (result.actions.length > 0) {
          automationResults.deal_actions.push({
            deal_id: id,
            actions: result.actions,
          });
        }
      }

      console.log(`Pipeline automation: ${automationResults.total_executed} executed, ${automationResults.total_skipped} skipped, ${automationResults.total_failed} failed`);
    }

    console.log(`Analyzed risk signals for ${dealsToProcess.length} deal(s), found ${allDetectedSignals.length} signal(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        deals_processed: dealsToProcess.length,
        signals_detected: allDetectedSignals.length,
        signals: allDetectedSignals,
        aggregates,
        automation: automationResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in deal-analyze-risk-signals:', error);
    await captureException(error, {
      tags: {
        function: 'deal-analyze-risk-signals',
        integration: 'anthropic',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
