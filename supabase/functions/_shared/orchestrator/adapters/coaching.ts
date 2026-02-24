/**
 * Coaching Orchestrator Adapters
 *
 * coachingMicroFeedbackAdapter uses contextEnrichment for mega context-aware coaching:
 * - Meeting transcript with enriched attendees (titles, companies)
 * - Contact record with deal context and relationship history
 * - Prior coaching scores and trends for this rep
 * - Org winning patterns from closed-won deals
 * - Prior pipeline outputs (call type, action items)
 *
 * Other adapters (aggregate, correlate, digest, Slack) operate on aggregated data
 * and don't need per-meeting enrichment.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import {
  getServiceClient,
  enrichMeetingContext,
  enrichContactContext,
  enrichCoachingHistory,
  formatContactSection,
  formatRelationshipHistory,
  formatAttendeesSection,
  formatCoachingHistory,
} from './contextEnrichment.ts';
import { deliverToSlack } from '../../proactive/deliverySlack.ts';
import type { ProactiveNotificationPayload } from '../../proactive/types.ts';
import { buildEnhancedCoachingDigestBlocks } from '../../slackBlocks.ts';
import type { EnhancedCoachingDigestData } from '../../slackBlocks.ts';

export const coachingMicroFeedbackAdapter: SkillAdapter = {
  name: 'coaching-micro-feedback',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = getServiceClient();
      const meetingId = state.event.payload.meeting_id as string;

      // --- Context Enrichment (defensive — failures don't crash the step) ---
      console.log('[coaching-micro-feedback] Enriching context...');

      let meetingCtx: any = { transcript: '', summary: '', title: 'Meeting', attendees: [] };
      try {
        meetingCtx = await enrichMeetingContext(supabase, meetingId);
      } catch (err) {
        console.warn('[coaching-micro-feedback] Meeting enrichment failed:', err);
      }

      let contactCtx: any = null;
      const contactData = state.context.tier2?.contact;
      if (contactData) {
        try {
          contactCtx = await enrichContactContext(supabase, contactData, meetingId);
        } catch (err) {
          console.warn('[coaching-micro-feedback] Contact enrichment failed:', err);
        }
      }

      let coachingCtx: any = { priorScores: [], orgWinPatterns: undefined };
      try {
        coachingCtx = await enrichCoachingHistory(
          supabase, state.event.user_id, state.event.org_id,
        );
      } catch (err) {
        console.warn('[coaching-micro-feedback] Coaching history enrichment failed:', err);
      }

      console.log(
        `[coaching-micro-feedback] Context: ${meetingCtx.attendees?.length || 0} attendees, ` +
        `${coachingCtx.priorScores?.length || 0} prior scores, ` +
        `win_patterns=${!!coachingCtx.orgWinPatterns}`,
      );

      // --- Build enriched context for edge function ---
      const enrichedContext: Record<string, unknown> = {
        rep_name: state.context.tier1.user.name,
        org_name: state.context.tier1.org.name,
        products: state.context.tier1.products || state.context.tier1.org.products || [],
        attendees_section: formatAttendeesSection(meetingCtx.attendees || []),
        coaching_history_section: formatCoachingHistory(coachingCtx),
        meeting_title: meetingCtx.title,
        meeting_duration: meetingCtx.durationMinutes,
        meeting_start: meetingCtx.meetingStart,
        call_type: state.outputs['classify-call-type'],
        action_items_summary: state.outputs['extract-action-items'],
      };

      if (contactCtx) {
        enrichedContext.contact_section = formatContactSection(contactCtx);
        enrichedContext.relationship_history = formatRelationshipHistory(contactCtx);
        if (contactCtx.dealContext) {
          enrichedContext.deal_context = contactCtx.dealContext;
        }
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          meeting_id: meetingId,
          analysis_type: 'per_meeting',
          transcript: meetingCtx.transcript || state.event.payload.transcript,
          context: enrichedContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const aggregateWeeklyMetricsAdapter: SkillAdapter = {
  name: 'aggregate-weekly-metrics',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          analysis_type: 'weekly',
        }),
      });

      if (!response.ok) {
        throw new Error(`coaching-analysis returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const correlateWinLossAdapter: SkillAdapter = {
  name: 'correlate-win-loss',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'correlate_win_loss',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
        }),
      });

      if (!response.ok) {
        throw new Error(`correlate-win-loss returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();
      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const generateCoachingDigestAdapter: SkillAdapter = {
  name: 'generate-coaching-digest',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = getServiceClient();

      // CTI-011: Fetch forecast accuracy data for coaching digest (PRD-21)
      let forecastAccuracyData: Record<string, unknown> | null = null;
      try {
        const { data: calData } = await supabase.rpc('get_rep_calibration', {
          p_org_id: state.event.org_id,
          p_user_id: state.event.user_id,
        });
        if (calData && typeof calData === 'object') {
          forecastAccuracyData = calData as Record<string, unknown>;
        }
      } catch (calErr) {
        console.warn('[generate-coaching-digest] Calibration fetch failed:', calErr);
      }

      // CTI-011: Fetch org learning insights for team intelligence section (PRD-20)
      let orgInsights: unknown[] = [];
      try {
        const { data: insights } = await supabase.rpc('get_active_org_insights', {
          p_org_id: state.event.org_id,
        });
        if (insights && Array.isArray(insights)) {
          orgInsights = insights.slice(0, 3);
        }
      } catch (insErr) {
        console.warn('[generate-coaching-digest] Org insights fetch failed:', insErr);
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/coaching-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          org_id: state.event.org_id,
          user_id: state.event.user_id,
          mode: 'generate_digest',
          weekly_metrics: state.outputs['aggregate-weekly-metrics'],
          win_loss_correlation: state.outputs['correlate-win-loss'],
          forecast_calibration: forecastAccuracyData,
          org_learning_insights: orgInsights,
        }),
      });

      if (!response.ok) {
        throw new Error(`generate-coaching-digest returned ${response.status}: ${await response.text()}`);
      }

      const output = await response.json();

      // CTI-011: Augment digest output with forecast accuracy for Slack delivery
      if (forecastAccuracyData) {
        output.forecast_accuracy = {
          optimism_factor: forecastAccuracyData.overall_optimism_factor,
          calibrated_pipeline: forecastAccuracyData.calibrated_pipeline,
          note: forecastAccuracyData.overall_note,
          weeks_of_data: forecastAccuracyData.weeks_of_data,
        };
      }

      // CTI-011: Augment with team intelligence tip from org insights
      if (orgInsights.length > 0) {
        const topInsight = orgInsights[0] as any;
        output.team_intelligence_tip = `${topInsight.title}: ${topInsight.description}`;
      }

      return { success: true, output, duration_ms: Date.now() - start };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};

export const deliverCoachingSlackAdapter: SkillAdapter = {
  name: 'deliver-coaching-slack',
  async execute(state: SequenceState, step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      const supabase = getServiceClient();
      const digest = state.outputs['generate-coaching-digest'] as any;

      // Get bot token and Slack user ID for delivery
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('user_id', state.event.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const { data: slackMapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', state.event.org_id)
        .eq('sixty_user_id', state.event.user_id)
        .maybeSingle();

      const botToken = slackIntegration?.access_token;
      const recipientSlackUserId = slackMapping?.slack_user_id;

      let slackDelivered = false;
      let deliveryError: string | undefined;

      if (!botToken) {
        console.warn('[deliver-coaching-slack] No Slack bot token found for user');
        deliveryError = 'No Slack integration';
      } else if (!recipientSlackUserId) {
        console.warn('[deliver-coaching-slack] No Slack user mapping found');
        deliveryError = 'No Slack user mapping';
      } else {
        // Build enhanced Slack blocks from coaching digest
        const weekOf = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const repName = state.context?.tier1?.user?.name || 'Rep';

        const digestData: EnhancedCoachingDigestData = {
          repName,
          weekOf,
          meetingsAnalyzed: digest.raw_metrics?.meetings_analyzed || 0,
          overallScore: digest.overall_score || null,
          talkRatio: digest.talk_ratio,
          questionQuality: digest.question_quality_score,
          objectionHandling: digest.objection_handling_score,
          discoveryDepth: digest.discovery_depth_score,
          weeklyWins: digest.weekly_wins || digest.quick_wins || [],
          dataBackedInsights: digest.data_backed_insights || (digest.recommendations || []).slice(0, 3).map((r: any) => ({
            insight: r.action || r.category,
            evidence: r.rationale || '',
            action: r.action || '',
          })),
          pipelinePatterns: digest.pipeline_patterns || [],
          competitiveTrends: digest.competitive_trends || [],
          progressionComparison: digest.progression_comparison || { status: 'first_week' },
          teamIntelligenceTip: digest.team_intelligence_tip || null,
          forecastAccuracy: digest.forecast_accuracy || null,
        };

        const slackMessage = buildEnhancedCoachingDigestBlocks(digestData);
        const blocks = slackMessage.blocks;

        // Route through proactive delivery layer (handles quiet hours + rate limiting)
        const payload: ProactiveNotificationPayload = {
          type: 'coaching_weekly',
          orgId: state.event.org_id,
          recipientUserId: state.event.user_id,
          recipientSlackUserId,
          entityType: 'coaching',
          entityId: `coaching_${state.event.user_id}`,
          title: 'Weekly Coaching Digest',
          message: digest.summary || 'Your weekly coaching insights',
          blocks,
          metadata: {
            overall_score: digest.overall_score,
            metrics: digest.metrics,
            recommendations_count: digest.recommendations?.length || 0,
          },
          priority: 'medium',
        };

        const deliveryResult = await deliverToSlack(supabase, payload, botToken);
        slackDelivered = deliveryResult.sent;
        deliveryError = deliveryResult.error;

        if (!slackDelivered) {
          console.warn(
            `[deliver-coaching-slack] Slack delivery blocked/failed: ${deliveryError}`
          );
        }
      }

      // Insert agent_activity record (in-app mirroring)
      try {
        const { error: activityError } = await supabase.rpc('insert_agent_activity', {
          p_user_id: state.event.user_id,
          p_org_id: state.event.org_id,
          p_sequence_type: 'coaching_weekly',
          p_title: 'Weekly Coaching Digest',
          p_summary: digest.summary || 'Your weekly coaching insights',
          p_metadata: {
            overall_score: digest.overall_score,
            metrics: digest.metrics,
            recommendations_count: digest.recommendations?.length || 0,
            delivery_method: slackDelivered ? 'slack' : 'in_app_only',
            delivery_error: deliveryError,
          },
          p_job_id: null,
        });

        if (activityError) {
          console.error('[deliver-coaching-slack] Failed to insert agent_activity:', activityError);
        } else {
          console.log('[deliver-coaching-slack] Agent activity recorded');
        }
      } catch (actErr) {
        console.error('[deliver-coaching-slack] Error inserting agent_activity:', actErr);
      }

      return {
        success: true,
        output: {
          delivered: slackDelivered,
          delivery_method: slackDelivered ? 'slack' : 'in_app_only',
          delivery_error: deliveryError,
        },
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return { success: false, error: String(err), duration_ms: Date.now() - start };
    }
  },
};
