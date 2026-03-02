/**
 * Slack Email Reply Alert Edge Function
 * 
 * Detects new inbound email replies and sends high-urgency alerts to sales reps.
 * Includes sentiment analysis, key points extraction, and suggested reply drafts.
 * 
 * Runs every 5-15 minutes via cron. Mirrors all Slack notifications into in-app notifications.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
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
import { buildEmailReplyAlertMessage, type EmailReplyAlertData } from '../_shared/slackBlocks.ts';
import { runSkill } from '../_shared/skillsRuntime.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://app.use60.com';

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
      console.error('[slack-email-reply-alert] Unauthorized access attempt');
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
        // Check if email reply alerts are enabled
        const settings = await getNotificationFeatureSettings(
          supabase,
          org.org_id,
          'email_reply_alert'
        );

        if (!settings?.isEnabled) {
          continue;
        }

        // Get Slack org settings
        const slackSettings = await getSlackOrgSettings(supabase, org.org_id);
        if (!slackSettings) continue;

        // Find new inbound replies (last 15 minutes, not yet notified)
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
        
        // Get new email categorizations marked as replies
        const { data: newReplies } = await supabase
          .from('email_categorizations')
          .select(`
            id,
            user_id,
            email_id,
            category,
            created_at,
            emails:email_id (
              id,
              subject,
              from_email,
              from_name,
              body,
              thread_id,
              received_at
            )
          `)
          .eq('org_id', org.org_id)
          .eq('category', 'to_respond')
          .gte('created_at', fifteenMinAgo.toISOString())
          .is('responded_at', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!newReplies?.length) {
          continue;
        }

        // Process each reply
        for (const reply of newReplies) {
          try {
            const userId = reply.user_id;
            if (!userId || !reply.emails) continue;

            const email = Array.isArray(reply.emails) ? reply.emails[0] : reply.emails;
            if (!email) continue;

            // Get Slack recipient
            const recipient = await getSlackRecipient(supabase, org.org_id, userId);
            if (!recipient) {
              continue; // No Slack mapping
            }

            // Check dedupe (one alert per thread per hour)
            const shouldSend = await shouldSendNotification(
              supabase,
              'email_reply_alert',
              org.org_id,
              recipient.slackUserId,
              email.thread_id || email.id
            );

            if (!shouldSend) {
              continue; // Already sent recently
            }

            // Get contact and deal info
            const { data: contact } = await supabase
              .from('contacts')
              .select('id, full_name, companies:company_id (name)')
              .eq('email', email.from_email.toLowerCase())
              .maybeSingle();

            let dealId: string | undefined;
            let dealName: string | undefined;
            let dealStage: string | undefined;

            if (contact) {
              const { data: deal } = await supabase
                .from('deals')
                .select('id, title, stage')
                .eq('user_id', userId)
                .or(`contact_id.eq.${contact.id},company_id.eq.${contact.companies?.id || ''}`)
                .in('stage', ['sql', 'opportunity', 'verbal', 'proposal', 'negotiation'])
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (deal) {
                dealId = deal.id;
                dealName = deal.title;
                dealStage = deal.stage;
              }
            }

            // Analyze email using skills
            let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
            let keyPoints: string[] = [];
            let suggestedReply: string | undefined;
            let suggestedActions: string[] = ['Reply to the email', 'Update deal status if applicable'];

            try {
              // Sentiment analysis
              const sentimentResult = await runSkill(
                supabase,
                'email_analysis',
                {
                  subject: email.subject || '',
                  body: email.body || '',
                },
                org.org_id,
                userId
              );

              if (sentimentResult.success && sentimentResult.output) {
                const sentimentScore = sentimentResult.output.sentiment_score || 0;
                sentiment = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';
                
                if (sentimentResult.output.key_topics) {
                  keyPoints = Array.isArray(sentimentResult.output.key_topics)
                    ? sentimentResult.output.key_topics
                    : [];
                }
              }

              // Generate reply draft
              const replyResult = await runSkill(
                supabase,
                'email_composer',
                {
                  context: 'reply_to_inbound',
                  originalSubject: email.subject,
                  originalBody: email.body,
                  fromEmail: email.from_email,
                  sentiment,
                },
                org.org_id,
                userId
              );

              if (replyResult.success && replyResult.output?.draft) {
                suggestedReply = replyResult.output.draft;
              }

              // Generate actions
              const actionsResult = await runSkill(
                supabase,
                'suggest_next_actions',
                {
                  activityContext: JSON.stringify({
                    type: 'email_reply',
                    from: email.from_email,
                    sentiment,
                    dealId,
                  }),
                },
                org.org_id,
                userId
              );

              if (actionsResult.success && actionsResult.output) {
                if (Array.isArray(actionsResult.output)) {
                  suggestedActions = actionsResult.output
                    .slice(0, 3)
                    .map((item: any) => item.title || item.action || String(item));
                } else if (actionsResult.output.actions) {
                  suggestedActions = actionsResult.output.actions;
                }
              }
            } catch (skillError) {
              console.warn('[slack-email-reply-alert] Skill execution failed, using defaults:', skillError);
            }

            // Build alert data
            const alertData: EmailReplyAlertData = {
              userName: recipient.name || recipient.email || 'there',
              slackUserId: recipient.slackUserId,
              email: {
                subject: email.subject || '(No subject)',
                from: email.from_email,
                fromName: email.from_name,
                threadId: email.thread_id,
                receivedAt: email.received_at || reply.created_at,
              },
              contact: contact ? {
                name: contact.full_name || email.from_name || email.from_email,
                companyName: (contact.companies as any)?.name,
              } : undefined,
              deal: dealId ? {
                name: dealName || 'Unknown',
                id: dealId,
                stage: dealStage || 'unknown',
              } : undefined,
              sentiment,
              keyPoints,
              suggestedReply,
              suggestedActions,
              appUrl: APP_URL,
            };

            // Build Slack message
            const slackMessage = buildEmailReplyAlertMessage(alertData);

            // Deliver to Slack
            const slackResult = await deliverToSlack(
              supabase,
              {
                type: 'email_reply_alert',
                orgId: org.org_id,
                recipientUserId: userId,
                recipientSlackUserId: recipient.slackUserId,
                entityType: 'email',
                entityId: email.id,
                title: `Reply from ${alertData.contact?.name || email.from_email}`,
                message: slackMessage.text || `New reply: ${email.subject}`,
                blocks: slackMessage.blocks,
                actionUrl: `${APP_URL}/emails${email.thread_id ? `?thread=${email.thread_id}` : ''}`,
                inAppCategory: 'deal',
                inAppType: sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'warning' : 'info',
                priority: sentiment === 'positive' || dealId ? 'high' : 'medium',
                metadata: {
                  from: email.from_email,
                  subject: email.subject,
                  sentiment,
                  dealId,
                },
              },
              slackSettings.botAccessToken
            );

            // Record notification sent
            if (slackResult.sent) {
              await recordNotificationSent(
                supabase,
                'email_reply_alert',
                org.org_id,
                recipient.slackUserId,
                slackResult.channelId,
                slackResult.ts,
                email.thread_id || email.id
              );
            }

            // Mirror to in-app
            await deliverToInApp(supabase, {
              type: 'email_reply_alert',
              orgId: org.org_id,
              recipientUserId: userId,
              recipientSlackUserId: recipient.slackUserId,
              entityType: 'email',
              entityId: email.id,
              title: `Reply from ${alertData.contact?.name || email.from_email}`,
              message: `New reply: ${email.subject}`,
              actionUrl: `${APP_URL}/email-actions`,
              inAppCategory: 'deal',
              inAppType: sentiment === 'positive' ? 'success' : sentiment === 'negative' ? 'warning' : 'info',
              priority: sentiment === 'positive' || dealId ? 'high' : 'medium',
              metadata: {
                from: email.from_email,
                subject: email.subject,
                sentiment,
                dealId,
              },
            });

            if (slackResult.sent) {
              totalAlertsSent++;
            } else {
              errors.push(`Failed to send to ${recipient.email || userId}: ${slackResult.error}`);
            }
          } catch (replyError) {
            console.error(`[slack-email-reply-alert] Error processing reply ${reply.id}:`, replyError);
            errors.push(`Reply ${reply.id}: ${replyError instanceof Error ? replyError.message : 'Unknown error'}`);
          }
        }
      } catch (orgError) {
        console.error(`[slack-email-reply-alert] Error processing org ${org.org_id}:`, orgError);
        errors.push(`Org ${org.org_id}: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`);
      }
    }

    return jsonResponse({
      success: true,
      alertsSent: totalAlertsSent,
      errors: errors.length > 0 ? errors : undefined,
    }, req);
  } catch (error) {
    console.error('[slack-email-reply-alert] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
