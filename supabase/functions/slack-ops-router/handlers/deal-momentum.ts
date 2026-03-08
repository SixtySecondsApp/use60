/**
 * Handler: deal-momentum
 * Extracted from supabase/functions/slack-deal-momentum/index.ts
 */

/**
 * Slack Deal Momentum Nudge Edge Function
 *
 * Proactive nudges for deals that need attention based on:
 * - Health status (warning/critical/stalled)
 * - Risk level (high/critical)
 * - Low clarity score (<50)
 * - Missing key fields (economic buyer unknown + no dated next step)
 *
 * Unified card showing truth + plan + recommended actions.
 * Runs daily via cron. Mirrors all Slack notifications into in-app notifications.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getNotificationFeatureSettings,
  getSlackRecipient,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../../_shared/proactive/index.ts';
import { buildDealMomentumMessage, type DealMomentumData, type DealMomentumTruthField, type DealMomentumMilestone } from '../../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// Trigger thresholds
const DEFAULT_CLARITY_THRESHOLD = 50; // Below this triggers nudge
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6; // Below this for key fields triggers nudge

// Stage display names
const STAGE_NAMES: Record<string, string> = {
  lead: 'Lead',
  sql: 'SQL',
  opportunity: 'Opportunity',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  verbal: 'Verbal Commit',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

// Field display labels
const FIELD_LABELS: Record<string, string> = {
  pain: 'Pain Point',
  success_metric: 'Success Metric',
  champion: 'Champion',
  economic_buyer: 'Economic Buyer',
  next_step: 'Next Step',
  top_risks: 'Top Risks',
};

// Milestone display titles
const MILESTONE_TITLES: Record<string, string> = {
  success_criteria: 'Success criteria confirmed',
  stakeholders_mapped: 'Stakeholders mapped',
  solution_fit: 'Solution fit confirmed',
  commercials_aligned: 'Commercials aligned',
  legal_procurement: 'Legal/procurement progressing',
  signature_kickoff: 'Signature + kickoff scheduled',
};

export async function handleDealMomentum(req: Request): Promise<Response> {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // SECURITY: Fail-closed authentication
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronAuth && !isServiceRole) {
      console.error('[slack-deal-momentum] Unauthorized access attempt');
      return errorResponse('Unauthorized', req, 401);
    }

    // Parse optional body for single deal mode
    let singleDealId: string | null = null;
    let singleOrgId: string | null = null;
    try {
      const body = await req.json();
      singleDealId = body.dealId || null;
      singleOrgId = body.orgId || null;
    } catch {
      // No body or invalid JSON, run full cron
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all orgs with Slack connected (or single org if specified)
    let slackOrgsQuery = supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (singleOrgId) {
      slackOrgsQuery = slackOrgsQuery.eq('org_id', singleOrgId);
    }

    const { data: slackOrgs } = await slackOrgsQuery;

    if (!slackOrgs?.length) {
      return jsonResponse({
        success: true,
        message: 'No Slack-connected orgs found',
        nudgesSent: 0,
      }, req);
    }

    let totalNudgesSent = 0;
    const errors: string[] = [];

    // Process each org
    for (const org of slackOrgs) {
      try {
        // Check if deal momentum nudges are enabled
        const settings = await getNotificationFeatureSettings(
          supabase,
          org.org_id,
          'deal_momentum_nudge'
        );

        // Allow if enabled OR if single deal mode (manual trigger)
        if (!settings?.isEnabled && !singleDealId) {
          continue;
        }

        // Get Slack org settings
        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        // Get org currency settings
        const { data: orgData } = await supabase
          .from('organizations')
          .select('currency_code, currency_locale')
          .eq('id', org.org_id)
          .single();

        // Get thresholds from settings
        const clarityThreshold = (settings?.thresholds?.clarity_score as number) || DEFAULT_CLARITY_THRESHOLD;
        const confidenceThreshold = (settings?.thresholds?.confidence as number) || DEFAULT_CONFIDENCE_THRESHOLD;

        // Find deals that need attention
        // We need to join multiple tables to evaluate trigger conditions
        let dealsQuery = supabase
          .from('deals')
          .select(`
            id,
            title,
            value,
            stage,
            close_date,
            user_id,
            created_at,
            company:companies(name),
            profiles:user_id (full_name, email),
            deal_health_scores!inner(
              health_score,
              health_status,
              calculated_at
            ),
            deal_risk_aggregates(
              overall_risk_level,
              risk_score
            ),
            deal_clarity_scores(
              clarity_score,
              momentum_score,
              calculated_at
            )
          `)
          .eq('org_id', org.org_id)
          .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
          .not('user_id', 'is', null);

        if (singleDealId) {
          dealsQuery = dealsQuery.eq('id', singleDealId);
        }

        const { data: deals, error: dealsError } = await dealsQuery;

        if (dealsError) {
          console.error(`[slack-deal-momentum] Error fetching deals for org ${org.org_id}:`, dealsError);
          errors.push(`Org ${org.org_id}: ${dealsError.message}`);
          continue;
        }

        if (!deals?.length) {
          continue;
        }

        // Filter deals that meet trigger conditions
        const dealsNeedingAttention = deals.filter((deal: any) => {
          const healthStatus = deal.deal_health_scores?.[0]?.health_status;
          const riskLevel = deal.deal_risk_aggregates?.[0]?.overall_risk_level;
          const clarityScore = deal.deal_clarity_scores?.[0]?.clarity_score ?? 0;

          // Trigger conditions from plan
          const healthTrigger = ['warning', 'critical', 'stalled'].includes(healthStatus);
          const riskTrigger = ['high', 'critical'].includes(riskLevel);
          const clarityTrigger = clarityScore < clarityThreshold;

          return healthTrigger || riskTrigger || clarityTrigger;
        });

        if (!dealsNeedingAttention.length) {
          continue;
        }

        // Process each deal that needs attention
        for (const deal of dealsNeedingAttention) {
          try {
            const ownerId = deal.user_id;
            if (!ownerId) continue;

            // Get Slack recipient
            const recipient = await getSlackRecipient(supabase, org.org_id, ownerId);
            if (!recipient) {
              continue; // No Slack mapping
            }

            // Check dedupe (one nudge per deal per cooldown window)
            const shouldSend = await shouldSendNotification(
              supabase,
              'deal_momentum_nudge',
              org.org_id,
              recipient.slackUserId,
              deal.id
            );

            if (!shouldSend && !singleDealId) {
              continue; // Already sent recently (skip dedupe for manual triggers)
            }

            // Get deal truth fields
            const { data: truthFields } = await supabase
              .from('deal_truth_fields')
              .select('field_key, value, confidence, source, last_updated_at')
              .eq('deal_id', deal.id);

            // Get close plan items
            const { data: closePlanItems } = await supabase
              .from('deal_close_plan_items')
              .select('milestone_key, title, status, owner_id, due_date, blocker_note, completed_at, profiles:owner_id(full_name)')
              .eq('deal_id', deal.id)
              .order('sort_order', { ascending: true });

            // Build truth field data for display
            const truthFieldMap = new Map(truthFields?.map(f => [f.field_key, f]) || []);
            const displayTruthFields: DealMomentumTruthField[] = [
              'pain', 'success_metric', 'champion', 'economic_buyer', 'next_step', 'top_risks'
            ].map(key => {
              const field = truthFieldMap.get(key);
              const isKeyField = key === 'economic_buyer' || key === 'next_step';
              const isLowConfidence = (field?.confidence || 0) < confidenceThreshold;

              return {
                fieldKey: key,
                label: FIELD_LABELS[key] || key,
                value: field?.value || null,
                confidence: field?.confidence || 0,
                isWarning: isKeyField && isLowConfidence,
                // For next_step, check if it has a date
                nextStepDate: key === 'next_step' ? extractDateFromValue(field?.value) : undefined,
              };
            });

            // Build close plan data for display
            const completedMilestones = closePlanItems?.filter(m => m.status === 'completed').length || 0;
            const totalMilestones = closePlanItems?.length || 6;
            const overdueMilestones = closePlanItems?.filter(m => {
              if (m.status === 'completed' || !m.due_date) return false;
              return new Date(m.due_date) < new Date();
            }).length || 0;
            const blockedMilestones = closePlanItems?.filter(m => m.status === 'blocked').length || 0;

            const displayMilestones: DealMomentumMilestone[] = (closePlanItems || []).map((m: any) => ({
              milestoneKey: m.milestone_key,
              title: m.title || MILESTONE_TITLES[m.milestone_key] || m.milestone_key,
              status: m.status,
              ownerName: m.profiles?.full_name,
              dueDate: m.due_date,
              isOverdue: m.status !== 'completed' && m.due_date && new Date(m.due_date) < new Date(),
              blockerNote: m.blocker_note,
            }));

            // Generate recommended actions
            const recommendedActions = generateRecommendedActions(
              displayTruthFields,
              displayMilestones,
              deal.deal_health_scores?.[0]?.health_status,
              deal.deal_risk_aggregates?.[0]?.overall_risk_level
            );

            // Get scores
            const clarityScore = deal.deal_clarity_scores?.[0]?.clarity_score ?? 0;
            const momentumScore = deal.deal_clarity_scores?.[0]?.momentum_score ?? 0;
            const healthScore = deal.deal_health_scores?.[0]?.health_score ?? 0;
            const riskScore = deal.deal_risk_aggregates?.[0]?.risk_score ?? 0;

            // Build momentum data
            const momentumData: DealMomentumData = {
              deal: {
                id: deal.id,
                name: deal.title,
                company: (deal.company as any)?.name,
                value: deal.value || 0,
                stage: deal.stage,
                stageName: STAGE_NAMES[deal.stage] || deal.stage,
              },
              scores: {
                momentum: Math.round(momentumScore),
                clarity: Math.round(clarityScore),
                health: Math.round(healthScore),
                risk: Math.round(riskScore),
              },
              truthFields: displayTruthFields,
              closePlan: {
                completed: completedMilestones,
                total: totalMilestones,
                overdue: overdueMilestones,
                blocked: blockedMilestones,
                milestones: displayMilestones,
              },
              recommendedActions,
              currencyCode: orgData?.currency_code,
              currencyLocale: orgData?.currency_locale,
              appUrl: APP_URL,
            };

            // Build Slack message
            const slackMessage = buildDealMomentumMessage(momentumData);

            // Deliver to Slack
            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'deal_momentum_nudge',
                orgId: org.org_id,
                recipientUserId: ownerId,
                recipientSlackUserId: recipient.slackUserId,
                entityType: 'deal',
                entityId: deal.id,
                title: `${deal.title} needs attention`,
                message: slackMessage.text || `Momentum: ${momentumScore}% | Clarity: ${clarityScore}%`,
                blocks: slackMessage.blocks,
                actionUrl: `${APP_URL}/deals/${deal.id}`,
                inAppCategory: 'deal',
                inAppType: 'warning',
                priority: momentumScore < 40 ? 'urgent' : 'high',
                metadata: {
                  momentumScore,
                  clarityScore,
                  healthScore,
                  riskScore,
                  dealValue: deal.value,
                  dealStage: deal.stage,
                },
              },
              slackSettings.botAccessToken
            );

            // Record notification sent
            if (slackResult.sent) {
              await recordNotificationSent(
                supabase,
                'deal_momentum_nudge',
                org.org_id,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                deal.id
              );
            }

            // Mirror to in-app
            await deliverToInApp(supabase, {
              type: 'deal_momentum_nudge',
              orgId: org.org_id,
              recipientUserId: ownerId,
              recipientSlackUserId: recipient.slackUserId,
              entityType: 'deal',
              entityId: deal.id,
              title: `${deal.title} needs attention`,
              message: `Momentum: ${momentumScore}% | Clarity: ${clarityScore}%`,
              actionUrl: `${APP_URL}/deals/${deal.id}`,
              inAppCategory: 'deal',
              inAppType: 'warning',
              priority: momentumScore < 40 ? 'urgent' : 'high',
              metadata: {
                momentumScore,
                clarityScore,
                healthScore,
                riskScore,
                dealValue: deal.value,
                dealStage: deal.stage,
              },
            });

            if (slackResult.sent) {
              totalNudgesSent++;
            } else {
              errors.push(`Failed to send to ${recipient.email || ownerId}: ${slackResult.error}`);
            }
          } catch (dealError) {
            console.error(`[slack-deal-momentum] Error processing deal ${deal.id}:`, dealError);
            errors.push(`Deal ${deal.id}: ${dealError instanceof Error ? dealError.message : 'Unknown error'}`);
          }
        }
      } catch (orgError) {
        console.error(`[slack-deal-momentum] Error processing org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`);
      }
    }

    return jsonResponse({
      success: true,
      nudgesSent: totalNudgesSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-deal-momentum] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
}

/**
 * Extract a date from a next_step value (e.g., "Demo to team - Jan 15")
 */
function extractDateFromValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  // Simple date pattern matching (can be enhanced)
  const datePatterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,  // 01/15/2024, 1-15-24
    /([A-Z][a-z]{2}\s+\d{1,2})/,             // Jan 15
    /(\d{1,2}\s+[A-Z][a-z]{2})/,             // 15 Jan
  ];

  for (const pattern of datePatterns) {
    const match = value.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Generate recommended actions based on deal state
 */
function generateRecommendedActions(
  truthFields: DealMomentumTruthField[],
  milestones: DealMomentumMilestone[],
  healthStatus?: string,
  riskLevel?: string
): string[] {
  const actions: string[] = [];

  // Check for missing/low confidence key fields
  const ebField = truthFields.find(f => f.fieldKey === 'economic_buyer');
  const nextStepField = truthFields.find(f => f.fieldKey === 'next_step');
  const championField = truthFields.find(f => f.fieldKey === 'champion');
  const successMetricField = truthFields.find(f => f.fieldKey === 'success_metric');

  if (!ebField?.value || ebField.confidence < 0.6) {
    actions.push('Identify and confirm economic buyer');
  }

  if (!nextStepField?.value || !nextStepField.nextStepDate) {
    actions.push('Set a dated next step');
  }

  if (!championField?.value || championField.confidence < 0.6) {
    actions.push('Confirm or strengthen champion relationship');
  }

  if (!successMetricField?.value) {
    actions.push('Define success metrics with customer');
  }

  // Check for blocked milestones
  const blockedMilestones = milestones.filter(m => m.status === 'blocked');
  if (blockedMilestones.length > 0) {
    actions.push(`Resolve blocked milestone: ${blockedMilestones[0].title}`);
  }

  // Check for overdue milestones
  const overdueMilestones = milestones.filter(m => m.isOverdue);
  if (overdueMilestones.length > 0 && actions.length < 4) {
    actions.push(`Complete overdue: ${overdueMilestones[0].title}`);
  }

  // Health/risk based actions
  if (healthStatus === 'stalled' && actions.length < 4) {
    actions.push('Re-engage key stakeholders');
  }

  if (riskLevel === 'critical' && actions.length < 4) {
    actions.push('Address critical risks immediately');
  }

  // Limit to top 4 actions
  return actions.slice(0, 4);
}
