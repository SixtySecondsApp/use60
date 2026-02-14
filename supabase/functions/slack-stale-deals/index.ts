/**
 * Slack Stale Deals Alert Edge Function
 * 
 * Detects deals with no activity beyond threshold and sends alerts to deal owners.
 * Includes suggested re-engagement actions and draft emails.
 * 
 * Runs daily via cron. Mirrors all Slack notifications into in-app notifications.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getNotificationFeatureSettings,
  getSlackRecipient,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import { buildStaleDealAlertMessage, type StaleDealAlertData } from '../_shared/slackBlocks.ts';
import { runSkill } from '../_shared/skillsRuntime.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

// Default threshold: 7 days of no activity
const DEFAULT_STALE_THRESHOLD_DAYS = 7;

serve(async (req) => {
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
      console.error('[slack-stale-deals] Unauthorized access attempt');
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all orgs with Slack connected
    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token, slack_team_id')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({
        success: true,
        message: 'No Slack-connected orgs found',
        alertsSent: 0,
      }, req);
    }

    let totalAlertsSent = 0;
    const errors: string[] = [];

    // Process each org
    for (const org of slackOrgs) {
      try {
        // Check if stale deal alerts are enabled
        const settings = await getNotificationFeatureSettings(
          supabase,
          org.org_id,
          'stale_deal_alert'
        );

        if (!settings?.isEnabled) {
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

        // Get threshold from settings or use default
        const thresholdDays = (settings.thresholds?.days_inactive as number) || DEFAULT_STALE_THRESHOLD_DAYS;
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

        // Find stale deals (no activity in threshold period)
        const { data: staleDeals } = await supabase
          .from('deals')
          .select(`
            id,
            title,
            value,
            stage,
            close_date,
            owner_id,
            updated_at,
            profiles:owner_id (full_name, email)
          `)
          .eq('org_id', org.org_id)
          .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
          .lt('updated_at', thresholdDate.toISOString())
          .not('owner_id', 'is', null);

        if (!staleDeals?.length) {
          continue;
        }

        // Process each stale deal
        for (const deal of staleDeals) {
          try {
            const ownerId = deal.owner_id;
            if (!ownerId) continue;

            // Get Slack recipient
            const recipient = await getSlackRecipient(supabase, org.org_id, ownerId);
            if (!recipient) {
              continue; // No Slack mapping
            }

            // Check dedupe (one alert per deal per cooldown window)
            const shouldSend = await shouldSendNotification(
              supabase,
              'stale_deal_alert',
              org.org_id,
              recipient.slackUserId,
              deal.id
            );

            if (!shouldSend) {
              continue; // Already sent recently
            }

            // Calculate days since last activity
            const lastActivityDate = new Date(deal.updated_at);
            const daysSinceLastActivity = Math.floor(
              (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Calculate days until close date
            let daysUntilClose: number | undefined;
            if (deal.close_date) {
              const closeDate = new Date(deal.close_date);
              daysUntilClose = Math.ceil(
                (closeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
            }

            // Get last activity type (from activities table)
            const { data: lastActivity } = await supabase
              .from('activities')
              .select('type, created_at')
              .eq('deal_id', deal.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // Generate suggested actions using skills
            let suggestedActions: string[] = [
              'Review deal status and update if needed',
              'Reach out to key stakeholders',
              'Schedule a check-in call',
            ];

            let reEngagementDraft: string | undefined;

            try {
              const skillResult = await runSkill(
                supabase,
                'suggest_next_actions',
                {
                  dealContext: JSON.stringify({
                    name: deal.title,
                    stage: deal.stage,
                    value: deal.value,
                    daysSinceLastActivity,
                  }),
                },
                org.org_id,
                ownerId
              );

              if (skillResult.success && skillResult.output) {
                if (Array.isArray(skillResult.output)) {
                  suggestedActions = skillResult.output
                    .slice(0, 3)
                    .map((item: any) => item.title || item.action || String(item));
                } else if (skillResult.output.actions) {
                  suggestedActions = skillResult.output.actions;
                }
              }

              // Try to generate re-engagement draft
              const draftResult = await runSkill(
                supabase,
                'email_composer',
                {
                  context: 'stale_deal_reengagement',
                  dealName: deal.title,
                  daysSinceLastActivity,
                },
                org.org_id,
                ownerId
              );

              if (draftResult.success && draftResult.output?.draft) {
                reEngagementDraft = draftResult.output.draft;
              }
            } catch (skillError) {
              console.warn('[slack-stale-deals] Skill execution failed, using defaults:', skillError);
            }

            // Build alert data
            const alertData: StaleDealAlertData = {
              userName: (deal.profiles as any)?.full_name || recipient.name || 'there',
              slackUserId: recipient.slackUserId,
              deal: {
                name: deal.title,
                id: deal.id,
                value: deal.value || 0,
                stage: deal.stage,
                closeDate: deal.close_date,
                daysUntilClose,
                daysSinceLastActivity,
                lastActivityDate: deal.updated_at,
                lastActivityType: lastActivity?.type,
              },
              suggestedActions,
              reEngagementDraft,
              currencyCode: orgData?.currency_code,
              currencyLocale: orgData?.currency_locale,
              appUrl: APP_URL,
            };

            // Build Slack message
            const slackMessage = buildStaleDealAlertMessage(alertData);

            // Deliver to Slack
            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'stale_deal_alert',
                orgId: org.org_id,
                recipientUserId: ownerId,
                recipientSlackUserId: recipient.slackUserId,
                entityType: 'deal',
                entityId: deal.id,
                title: `Deal ${deal.title} going cold`,
                message: slackMessage.text || `No activity in ${daysSinceLastActivity} days.`,
                blocks: slackMessage.blocks,
                actionUrl: `${APP_URL}/deals/${deal.id}`,
                inAppCategory: 'deal',
                inAppType: 'warning',
                priority: 'high',
                metadata: {
                  daysSinceLastActivity,
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
                'stale_deal_alert',
                org.org_id,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                deal.id
              );
            }

            // Mirror to in-app
            await deliverToInApp(supabase, {
              type: 'stale_deal_alert',
              orgId: org.org_id,
              recipientUserId: ownerId,
              recipientSlackUserId: recipient.slackUserId,
              entityType: 'deal',
              entityId: deal.id,
              title: `Deal ${deal.title} going cold`,
              message: `No activity in ${daysSinceLastActivity} days.`,
              actionUrl: `${APP_URL}/deals/${deal.id}`,
              inAppCategory: 'deal',
              inAppType: 'warning',
              priority: 'high',
              metadata: {
                daysSinceLastActivity,
                dealValue: deal.value,
                dealStage: deal.stage,
              },
            });

            if (slackResult.sent) {
              totalAlertsSent++;
            } else {
              errors.push(`Failed to send to ${recipient.email || ownerId}: ${slackResult.error}`);
            }
          } catch (dealError) {
            console.error(`[slack-stale-deals] Error processing deal ${deal.id}:`, dealError);
            errors.push(`Deal ${deal.id}: ${dealError instanceof Error ? dealError.message : 'Unknown error'}`);
          }
        }

        // Fire orchestrator deal_risk_scan event (parallel, non-blocking)
        try {
          const firstOwnerId = staleDeals?.[0]?.owner_id;
          if (firstOwnerId) {
            fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'deal_risk_scan',
                source: 'cron:daily',
                org_id: org.org_id,
                user_id: firstOwnerId,
                payload: {},
              }),
            }).catch(err => console.warn('[slack-stale-deals] Orchestrator fire-and-forget failed:', err));
          }
        } catch (orchErr) {
          console.warn('[slack-stale-deals] Non-fatal: orchestrator event failed:', orchErr);
        }
      } catch (orgError) {
        console.error(`[slack-stale-deals] Error processing org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`);
      }
    }

    return jsonResponse({
      success: true,
      alertsSent: totalAlertsSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-stale-deals] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
