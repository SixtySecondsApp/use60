// supabase/functions/health-recalculate/alertEvaluator.ts
// Evaluates significant health changes and generates proactive alerts

import { SignificantChange } from './index.ts';

// =============================================================================
// Types
// =============================================================================

export type AlertType =
  | 'health_drop'
  | 'ghost_risk'
  | 'no_activity'
  | 'stage_stall'
  | 'sentiment_decline'
  | 'close_date_risk';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertPayload {
  deal_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  suggested_actions: string[];
  metadata: Record<string, any>;
  channels: ('in_app' | 'slack')[];
}

// =============================================================================
// Alert Evaluation Logic
// =============================================================================

/**
 * Evaluate significant changes and generate alert payloads
 */
export async function evaluateAlerts(
  supabase: any,
  significantChanges: SignificantChange[]
): Promise<AlertPayload[]> {
  const alerts: AlertPayload[] = [];

  for (const change of significantChanges) {
    // Fetch full deal data and health scores for evaluation
    const { data: deal } = await supabase
      .from('deals')
      .select(`
        id,
        name,
        company,
        value,
        stage_id,
        expected_close_date,
        owner_id,
        deal_stages!inner(name, order_index)
      `)
      .eq('id', change.deal_id)
      .maybeSingle();

    if (!deal) continue;

    const { data: healthScore } = await supabase
      .from('deal_health_scores')
      .select(`
        overall_health_score,
        health_status,
        risk_level,
        risk_factors,
        days_in_current_stage,
        days_since_last_activity,
        sentiment_trend,
        meeting_count_last_30_days,
        predicted_close_probability
      `)
      .eq('deal_id', change.deal_id)
      .maybeSingle();

    if (!healthScore) continue;

    // Fetch relationship health for ghost risk detection
    // Two-step approach to avoid SQL injection via deal.company
    let relationshipHealth = null;
    if (deal.company) {
      const { data: companyContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('company', deal.company)
        .limit(50);

      const contactIds = companyContacts?.map((c: any) => c.id) || [];

      if (contactIds.length > 0) {
        const { data: rhScore } = await supabase
          .from('relationship_health_scores')
          .select('ghost_probability_percent, is_ghost_risk, days_since_last_contact')
          .eq('user_id', deal.owner_id)
          .in('contact_id', contactIds)
          .order('overall_health_score', { ascending: false })
          .limit(1)
          .maybeSingle();

        relationshipHealth = rhScore;
      }
    }

    // Check alert conditions and generate alerts

    // 1. Health Drop (>20 point drop)
    if (Math.abs(change.change) >= 20 && change.change < 0) {
      alerts.push({
        deal_id: change.deal_id,
        alert_type: 'health_drop',
        severity: change.new_score < 40 ? 'critical' : 'warning',
        title: `Deal health dropped ${Math.abs(Math.round(change.change))} points`,
        message: `${deal.name} health score declined from ${change.old_score} to ${change.new_score}. Immediate attention required.`,
        suggested_actions: [
          'Schedule a check-in call with the primary contact',
          'Review recent meeting notes for early warning signs',
          'Confirm next steps and timeline with stakeholders',
        ],
        metadata: {
          old_score: change.old_score,
          new_score: change.new_score,
          change: change.change,
          risk_factors: healthScore.risk_factors || [],
        },
        channels: change.new_score < 40 ? ['in_app', 'slack'] : ['in_app'],
      });
    }

    // 2. Ghost Risk (>60% ghost probability)
    if (relationshipHealth?.ghost_probability_percent && relationshipHealth.ghost_probability_percent > 60) {
      alerts.push({
        deal_id: change.deal_id,
        alert_type: 'ghost_risk',
        severity: 'critical',
        title: `High ghost risk detected (${relationshipHealth.ghost_probability_percent}%)`,
        message: `Contact at ${deal.company} has not responded in ${relationshipHealth.days_since_last_contact || 'many'} days. Risk of going dark.`,
        suggested_actions: [
          'Send a re-engagement email with value proposition',
          'Try alternative contact methods (phone, LinkedIn)',
          'Reach out to other stakeholders in the organization',
          'Consider a limited-time offer to create urgency',
        ],
        metadata: {
          ghost_probability: relationshipHealth.ghost_probability_percent,
          days_since_contact: relationshipHealth.days_since_last_contact,
        },
        channels: ['in_app', 'slack'],
      });
    }

    // 3. No Activity (>14 days since last activity)
    if (healthScore.days_since_last_activity && healthScore.days_since_last_activity > 14) {
      alerts.push({
        deal_id: change.deal_id,
        alert_type: 'no_activity',
        severity: healthScore.days_since_last_activity > 30 ? 'critical' : 'warning',
        title: `No activity for ${healthScore.days_since_last_activity} days`,
        message: `${deal.name} has had no recorded activity for ${healthScore.days_since_last_activity} days. Deal momentum at risk.`,
        suggested_actions: [
          'Log any recent informal communications',
          'Schedule a follow-up meeting or demo',
          'Send a value-add resource or case study',
          'Check if deal is still active with contact',
        ],
        metadata: {
          days_since_last_activity: healthScore.days_since_last_activity,
          meeting_count_30_days: healthScore.meeting_count_last_30_days,
        },
        channels: healthScore.days_since_last_activity > 30 ? ['in_app', 'slack'] : ['in_app'],
      });
    }

    // 4. Stage Stall (>42 days in current stage)
    if (healthScore.days_in_current_stage > 42) {
      alerts.push({
        deal_id: change.deal_id,
        alert_type: 'stage_stall',
        severity: healthScore.days_in_current_stage > 60 ? 'critical' : 'warning',
        title: `Deal stalled in ${deal.deal_stages.name} for ${healthScore.days_in_current_stage} days`,
        message: `${deal.name} has been in ${deal.deal_stages.name} stage for ${healthScore.days_in_current_stage} days. Consider pushing for next milestone.`,
        suggested_actions: [
          'Identify and address blockers with champion',
          'Set a clear timeline for decision/next stage',
          'Escalate to higher-level stakeholders if needed',
          'Re-qualify the opportunity and budget',
        ],
        metadata: {
          days_in_stage: healthScore.days_in_current_stage,
          current_stage: deal.deal_stages.name,
        },
        channels: healthScore.days_in_current_stage > 60 ? ['in_app', 'slack'] : ['in_app'],
      });
    }

    // 5. Sentiment Decline
    if (healthScore.sentiment_trend === 'declining') {
      alerts.push({
        deal_id: change.deal_id,
        alert_type: 'sentiment_decline',
        severity: healthScore.risk_level === 'critical' ? 'critical' : 'warning',
        title: 'Declining sentiment detected in recent meetings',
        message: `Sentiment analysis shows declining engagement in recent conversations about ${deal.name}. Customer may be having doubts.`,
        suggested_actions: [
          'Review recent meeting transcripts for concerns',
          'Address any objections or hesitations directly',
          'Schedule a discovery call to understand concerns',
          'Bring in a technical resource or executive sponsor',
        ],
        metadata: {
          sentiment_trend: healthScore.sentiment_trend,
          risk_level: healthScore.risk_level,
        },
        channels: healthScore.risk_level === 'critical' ? ['in_app', 'slack'] : ['in_app'],
      });
    }

    // 6. Close Date Risk (expected close within 7 days, low health)
    if (deal.expected_close_date && healthScore.overall_health_score < 60) {
      const daysToClose = Math.floor(
        (new Date(deal.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysToClose > 0 && daysToClose <= 7) {
        alerts.push({
          deal_id: change.deal_id,
          alert_type: 'close_date_risk',
          severity: 'critical',
          title: `Close date in ${daysToClose} days but health score is ${healthScore.overall_health_score}`,
          message: `${deal.name} is expected to close in ${daysToClose} days but health score (${healthScore.overall_health_score}) indicates issues. Update forecast or address concerns.`,
          suggested_actions: [
            'Validate close date is still realistic',
            'Update expected close date if needed',
            'Identify and resolve any last-minute blockers',
            'Get verbal commitment from decision maker',
          ],
          metadata: {
            days_to_close: daysToClose,
            health_score: healthScore.overall_health_score,
            expected_close_date: deal.expected_close_date,
          },
          channels: ['in_app', 'slack'],
        });
      }
    }
  }

  return alerts;
}

/**
 * Insert alerts into database with deduplication
 */
export async function insertAlerts(
  supabase: any,
  alerts: AlertPayload[]
): Promise<{ inserted: number; deduplicated: number }> {
  let insertedCount = 0;
  let deduplicatedCount = 0;

  for (const alert of alerts) {
    // Check for duplicate alert within 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: existingAlert } = await supabase
      .from('deal_health_alerts')
      .select('id')
      .eq('deal_id', alert.deal_id)
      .eq('alert_type', alert.alert_type)
      .gte('created_at', twentyFourHoursAgo)
      .eq('status', 'active')
      .maybeSingle();

    if (existingAlert) {
      deduplicatedCount++;
      console.log(`[AlertEvaluator] Deduplicated ${alert.alert_type} for deal ${alert.deal_id}`);
      continue;
    }

    // Fetch user_id for the deal
    const { data: deal } = await supabase
      .from('deals')
      .select('owner_id')
      .eq('id', alert.deal_id)
      .maybeSingle();

    if (!deal) continue;

    // Insert the alert
    const { error: insertError } = await supabase
      .from('deal_health_alerts')
      .insert({
        deal_id: alert.deal_id,
        user_id: deal.owner_id,
        alert_type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        suggested_actions: alert.suggested_actions,
        action_priority: alert.severity === 'critical' ? 'urgent' : 'medium',
        status: 'active',
        metadata: alert.metadata,
        notification_sent: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`[AlertEvaluator] Error inserting alert for deal ${alert.deal_id}:`, insertError);
      continue;
    }

    insertedCount++;
    console.log(`[AlertEvaluator] Inserted ${alert.alert_type} alert (${alert.severity}) for deal ${alert.deal_id}`);
  }

  return { inserted: insertedCount, deduplicated: deduplicatedCount };
}
