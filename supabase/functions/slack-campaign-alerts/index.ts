/**
 * SLACK-016: Instantly Campaign Alert Edge Function
 *
 * Monitors Instantly campaigns for notable events and sends DM alerts:
 * - First reply on a campaign
 * - High bounce rate (>5%)
 * - Campaign completion
 *
 * Runs every 30 minutes via Vercel cron.
 * Respects dedupe (one alert per campaign per event type per day).
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
} from '../_shared/proactive/index.ts';
import { InstantlyClient } from '../_shared/instantly.ts';
import {
  header,
  section,
  divider,
  context,
  actions,
  safeMrkdwn,
  safeHeaderText,
  truncate,
  type SlackBlock,
  type SlackMessage,
} from '../_shared/slackBlocks.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

function buildCampaignAlertMessage(campaign: {
  id: string;
  name: string;
  event: 'first_reply' | 'high_bounce' | 'completed';
  newReplies?: number;
  bounceRate?: number;
  totalSent?: number;
  completionPct?: number;
}): SlackMessage {
  const blocks: SlackBlock[] = [];

  const eventEmoji = campaign.event === 'first_reply' ? '💬'
    : campaign.event === 'high_bounce' ? '⚠️' : '✅';
  const eventLabel = campaign.event === 'first_reply' ? 'New reply received'
    : campaign.event === 'high_bounce' ? 'High bounce rate detected'
    : 'Campaign completed';

  blocks.push(header(safeHeaderText(`${eventEmoji} ${eventLabel}`)));
  blocks.push(section(safeMrkdwn(`*${truncate(campaign.name, 60)}*`)));

  const stats: string[] = [];
  if (campaign.newReplies !== undefined) stats.push(`${campaign.newReplies} replies`);
  if (campaign.totalSent !== undefined) stats.push(`${campaign.totalSent} sent`);
  if (campaign.bounceRate !== undefined) stats.push(`${campaign.bounceRate}% bounce rate`);
  if (campaign.completionPct !== undefined) stats.push(`${campaign.completionPct}% complete`);
  if (stats.length > 0) {
    blocks.push(context([stats.join(' • ')]));
  }

  blocks.push(divider());

  blocks.push(actions([
    { text: 'View campaign', actionId: 'view_campaign', value: campaign.id, url: `${APP_URL}/ops` },
    { text: 'Dismiss', actionId: `dismiss::campaign::${campaign.id}`, value: JSON.stringify({ entityType: 'campaign', entityId: campaign.id }) },
  ]));

  return {
    blocks,
    text: `${eventLabel}: ${campaign.name}`,
  };
}

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

    const { data: slackOrgs } = await supabase
      .from('slack_org_settings')
      .select('org_id, bot_access_token')
      .eq('is_connected', true)
      .not('bot_access_token', 'is', null);

    if (!slackOrgs?.length) {
      return jsonResponse({ success: true, alertsSent: 0 }, req);
    }

    let totalAlerts = 0;
    const errors: string[] = [];

    for (const org of slackOrgs) {
      try {
        // Check Instantly credentials
        const { data: creds } = await supabase
          .from('integration_credentials')
          .select('credentials')
          .eq('organization_id', org.org_id)
          .eq('integration_name', 'instantly')
          .maybeSingle();

        if (!creds?.credentials?.api_key) continue;

        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        const recipients = await getSlackRecipients(supabase, org.org_id);
        if (!recipients.length) continue;

        const client = new InstantlyClient({ apiKey: creds.credentials.api_key });

        // Fetch active campaigns
        let campaigns: any[];
        try {
          const result = await client.request<any>({
            method: 'GET',
            path: '/api/v2/campaigns',
            query: { status: 1, limit: 20 },
          });
          campaigns = result?.items || result || [];
          if (!Array.isArray(campaigns)) campaigns = [];
        } catch {
          continue;
        }

        for (const campaign of campaigns) {
          let analytics: any = null;
          try {
            analytics = await client.request<any>({
              method: 'GET',
              path: `/api/v2/campaigns/${campaign.id}/analytics`,
            });
          } catch {
            continue;
          }

          const newReplies = analytics?.replies_count || 0;
          const totalSent = analytics?.emails_sent_count || 0;
          const bounceCount = analytics?.bounced_count || 0;
          const bounceRate = totalSent > 0 ? Math.round((bounceCount / totalSent) * 1000) / 10 : 0;
          const completionPct = analytics?.completion_percentage || 0;

          // Detect notable events
          const events: Array<{ type: 'first_reply' | 'high_bounce' | 'completed'; entityKeySuffix: string }> = [];
          if (newReplies > 0) events.push({ type: 'first_reply', entityKeySuffix: 'reply' });
          if (bounceRate > 5) events.push({ type: 'high_bounce', entityKeySuffix: 'bounce' });
          if (completionPct >= 95) events.push({ type: 'completed', entityKeySuffix: 'complete' });

          if (events.length === 0) continue;

          // Send to first recipient (campaign alerts go to org admins)
          for (const recipient of recipients.slice(0, 3)) {
            for (const event of events) {
              const entityKey = `${campaign.id}:${event.entityKeySuffix}`;
              const shouldSend = await shouldSendNotification(
                supabase,
                'deal_momentum_nudge', // Reuse existing dedupe type
                org.org_id,
                recipient.slackUserId,
                entityKey
              );

              if (!shouldSend) continue;

              // Check user pref
              const { data: userPref } = await supabase
                .from('slack_user_preferences')
                .select('is_enabled')
                .eq('user_id', recipient.userId)
                .eq('org_id', org.org_id)
                .eq('feature', 'campaign_alerts')
                .maybeSingle();

              if (userPref && !userPref.is_enabled) continue;

              const slackMessage = buildCampaignAlertMessage({
                id: campaign.id,
                name: campaign.name || 'Unnamed',
                event: event.type,
                newReplies,
                totalSent,
                bounceRate,
                completionPct: Math.round(completionPct),
              });

              const slackResult = await deliverToSlack(
                supabase,
                {
                  type: 'deal_momentum_nudge',
                  orgId: org.org_id,
                  recipientUserId: recipient.userId,
                  recipientSlackUserId: recipient.slackUserId,
                  title: `Campaign: ${campaign.name}`,
                  message: slackMessage.text || 'Campaign event',
                  blocks: slackMessage.blocks,
                  actionUrl: `${APP_URL}/ops`,
                  inAppCategory: 'pipeline',
                  inAppType: event.type === 'high_bounce' ? 'warning' : 'info',
                  metadata: { campaignId: campaign.id, event: event.type },
                },
                slackSettings.botAccessToken
              );

              if (slackResult.sent) {
                await recordNotificationSent(
                  supabase,
                  'deal_momentum_nudge',
                  org.org_id,
                  recipient.slackUserId,
                  slackResult.channelId,
                  slackResult.ts,
                  entityKey
                );
                totalAlerts++;
              }
            }
          }
        }
      } catch (orgError) {
        console.error(`[slack-campaign-alerts] Error for org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown'}`);
      }
    }

    return jsonResponse({ success: true, alertsSent: totalAlerts, errors: errors.length > 0 ? errors : undefined }, req);
  } catch (error) {
    console.error('[slack-campaign-alerts] Fatal error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal server error', req, 500);
  }
});
