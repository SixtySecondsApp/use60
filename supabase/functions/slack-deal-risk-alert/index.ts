/**
 * SLACK-015: Deal Risk Alert Edge Function
 *
 * Monitors deals for risk signals and sends proactive DM alerts:
 * - Close date passed
 * - Activity gap > configurable threshold (default 5 days)
 * - Stage regression
 *
 * Runs every 30 minutes via Vercel cron.
 * Respects dedupe (one alert per deal per day).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getSlackRecipients,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import { buildStaleDealAlertMessage } from '../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

const ACTIVITY_GAP_THRESHOLD_DAYS = 5;

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    if (!verifyCronSecret(req, cronSecret) && !isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY)) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all orgs with Slack connected
    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({ success: true, alertsSent: 0, message: 'No Slack-connected orgs' }, req);
    }

    let totalAlerts = 0;
    const errors: string[] = [];

    for (const org of slackOrgs) {
      try {
        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        // Get org currency
        const { data: orgData } = await supabase
          .from('organizations')
          .select('currency_code, currency_locale')
          .eq('id', org.org_id)
          .single();

        const recipients = await getSlackRecipients(supabase, org.org_id);
        const now = new Date();
        const thresholdDate = new Date(now.getTime() - ACTIVITY_GAP_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

        for (const recipient of recipients) {
          try {
            // Find at-risk deals for this user
            const { data: deals } = await supabase
              .from('deals')
              .select('id, title, value, stage, close_date, health_status')
              .eq('user_id', recipient.userId)
              .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
              .not('close_date', 'is', null);

            if (!deals?.length) continue;

            for (const deal of deals) {
              // Get last activity for this deal
              const { data: lastActivity } = await supabase
                .from('activities')
                .select('created_at, activity_type')
                .eq('deal_id', deal.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              const lastActivityDate = lastActivity ? new Date(lastActivity.created_at) : null;
              const daysSinceActivity = lastActivityDate
                ? Math.floor((now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
                : 999;

              const closeDate = deal.close_date ? new Date(deal.close_date) : null;
              const daysUntilClose = closeDate
                ? Math.ceil((closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : undefined;

              // Check risk signals
              const isAtRisk = deal.health_status === 'at_risk' || deal.health_status === 'off_track';
              const isStale = daysSinceActivity >= ACTIVITY_GAP_THRESHOLD_DAYS;
              const closeDatePassed = daysUntilClose !== undefined && daysUntilClose < 0;

              if (!isStale && !closeDatePassed && !isAtRisk) continue;

              // Check dedupe (one alert per deal per day)
              const shouldSend = await shouldSendNotification(
                supabase,
                'stale_deal_alert',
                org.org_id,
                recipient.slackUserId,
                deal.id
              );

              if (!shouldSend) continue;

              // Check user preferences
              const { data: userPref } = await supabase
                .from('slack_user_preferences')
                .select('is_enabled')
                .eq('user_id', recipient.userId)
                .eq('org_id', org.org_id)
                .eq('feature', 'deal_risk')
                .maybeSingle();

              if (userPref && !userPref.is_enabled) continue;

              const slackMessage = buildStaleDealAlertMessage({
                userName: recipient.name || 'there',
                deal: {
                  name: deal.title,
                  id: deal.id,
                  value: deal.value || 0,
                  stage: deal.stage,
                  closeDate: deal.close_date,
                  daysUntilClose,
                  daysSinceLastActivity: daysSinceActivity,
                  lastActivityDate: lastActivity?.created_at,
                  lastActivityType: lastActivity?.activity_type,
                },
                suggestedActions: [
                  isStale ? 'Send a check-in email to the main contact' : '',
                  closeDatePassed ? 'Update the close date or mark as lost' : '',
                  'Schedule a meeting to re-establish momentum',
                ].filter(Boolean),
                currencyCode: orgData?.currency_code,
                currencyLocale: orgData?.currency_locale,
                appUrl: APP_URL,
              });

              const slackResult = await deliverToSlack(
                supabase,
                {
                  type: 'stale_deal_alert',
                  orgId: org.org_id,
                  recipientUserId: recipient.userId,
                  recipientSlackUserId: recipient.slackUserId,
                  title: `Deal going cold: ${deal.title}`,
                  message: slackMessage.text || `${deal.title} needs attention`,
                  blocks: slackMessage.blocks,
                  actionUrl: `${APP_URL}/deals/${deal.id}`,
                  inAppCategory: 'pipeline',
                  inAppType: 'warning',
                  metadata: { dealId: deal.id, daysSinceActivity },
                },
                slackSettings.botAccessToken
              );

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
                totalAlerts++;
              }

              // Mirror to in-app
              await deliverToInApp(supabase, {
                type: 'stale_deal_alert',
                orgId: org.org_id,
                recipientUserId: recipient.userId,
                recipientSlackUserId: recipient.slackUserId,
                title: `Deal going cold: ${deal.title}`,
                message: slackMessage.text || `${deal.title} needs attention`,
                actionUrl: `${APP_URL}/deals/${deal.id}`,
                inAppCategory: 'pipeline',
                inAppType: 'warning',
                metadata: { dealId: deal.id, daysSinceActivity },
              });
            }
          } catch (userError) {
            console.error(`[slack-deal-risk-alert] Error for user ${recipient.userId}:`, userError);
            errors.push(`User ${recipient.userId}: ${userError instanceof Error ? userError.message : 'Unknown'}`);
          }
        }
      } catch (orgError) {
        console.error(`[slack-deal-risk-alert] Error for org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown'}`);
      }
    }

    return jsonResponse({
      success: true,
      alertsSent: totalAlerts,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-deal-risk-alert] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});
