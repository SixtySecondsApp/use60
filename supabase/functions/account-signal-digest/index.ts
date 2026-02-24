import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { verifyCronSecret, isServiceRoleAuth } from '../_shared/edgeAuth.ts';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';
import {
  getSlackOrgSettings,
  getSlackRecipients,
  shouldSendNotification,
  recordNotificationSent,
  deliverToSlack,
  deliverToInApp,
} from '../_shared/proactive/index.ts';
import {
  buildAccountSignalAlert,
  buildAccountIntelligenceDigest,
  type AccountDigestEntry,
  type AccountSignalAlertData,
} from '../_shared/slackBlocks.ts';

/**
 * account-signal-digest — Weekly Monday intelligence digest.
 *
 * Sends a grouped summary of all unread signals from the past 7 days.
 * Also sends immediate DMs for high-severity signals not yet notified.
 *
 * Runs Monday 7am UTC via cron (after account-monitor at 6:30am).
 */

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
    const cronSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    const isCronAuth = verifyCronSecret(req, cronSecret);
    const isServiceRole = isServiceRoleAuth(authHeader, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronAuth && !isServiceRole) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const summary = {
      orgs_processed: 0,
      digests_sent: 0,
      immediate_alerts_sent: 0,
      signals_included: 0,
    };

    // Get all orgs with active watchlist entries
    const { data: orgRows } = await supabase
      .from('account_watchlist')
      .select('org_id')
      .eq('is_active', true);

    const orgIds = [...new Set((orgRows ?? []).map(r => r.org_id))];

    for (const orgId of orgIds) {
      // Check if org has Slack connected
      const slackSettings = await getSlackOrgSettings(supabase, orgId);
      if (!slackSettings) continue;

      summary.orgs_processed++;

      // Get all unread signals from the past 7 days for this org
      const { data: signals } = await supabase
        .from('account_signals')
        .select(`
          id, org_id, watchlist_id, signal_type, severity, relevance_score,
          title, summary, recommended_action, source,
          is_read, slack_notified, detected_at,
          account_watchlist:watchlist_id (
            id, user_id,
            companies:company_id (name),
            contacts:contact_id (first_name, last_name)
          )
        `)
        .eq('org_id', orgId)
        .eq('is_dismissed', false)
        .gte('detected_at', sevenDaysAgo)
        .order('detected_at', { ascending: false });

      if (!signals?.length) continue;

      // Send immediate alerts for high/critical signals not yet notified via Slack
      const urgentSignals = signals.filter(
        s => ['high', 'critical'].includes(s.severity) && !s.slack_notified
      );

      for (const signal of urgentSignals) {
        const watchlist = signal.account_watchlist as any;
        if (!watchlist) continue;

        const companyName = watchlist.companies?.name ||
          `${watchlist.contacts?.first_name ?? ''} ${watchlist.contacts?.last_name ?? ''}`.trim() ||
          'Unknown Account';

        const recipient = await getSlackRecipients(supabase, orgId)
          .then(r => r.find(rec => rec.userId === watchlist.user_id));

        if (!recipient) continue;

        const canSend = await shouldSendNotification(
          supabase, 'account_signal_alert', orgId, recipient.userId, signal.watchlist_id
        );
        if (!canSend) continue;

        const alertData: AccountSignalAlertData = {
          companyName,
          signalType: signal.signal_type,
          severity: signal.severity,
          title: signal.title,
          summary: signal.summary,
          recommendedAction: signal.recommended_action ?? '',
          watchlistId: signal.watchlist_id,
          signalId: signal.id,
          appUrl: APP_URL,
        };

        const { blocks, text } = buildAccountSignalAlert(alertData);

        const slackResult = await deliverToSlack(supabase, {
          type: 'account_signal_alert',
          orgId,
          recipientUserId: recipient.userId,
          recipientSlackUserId: recipient.slackUserId,
          title: `Account Signal: ${companyName}`,
          message: text,
          blocks,
          priority: signal.severity === 'critical' ? 'urgent' : 'high',
          entityType: 'account_watchlist',
          entityId: signal.watchlist_id,
          inAppCategory: 'deal',
          inAppType: 'warning',
          actionUrl: `${APP_URL}/settings/smart-listening`,
        });

        if (slackResult?.slack?.sent) {
          await recordNotificationSent(
            supabase, 'account_signal_alert', orgId, recipient.userId,
            slackResult.slack.channelId, slackResult.slack.ts, signal.watchlist_id
          );
          await supabase
            .from('account_signals')
            .update({ slack_notified: true })
            .eq('id', signal.id);
          summary.immediate_alerts_sent++;
        }
      }

      // Group unread signals by user → by watchlist entry (for digest)
      const unreadSignals = signals.filter(s => !s.is_read);
      if (!unreadSignals.length) continue;

      const signalsByUser: Record<string, typeof unreadSignals> = {};
      for (const signal of unreadSignals) {
        const userId = (signal.account_watchlist as any)?.user_id;
        if (!userId) continue;
        if (!signalsByUser[userId]) signalsByUser[userId] = [];
        signalsByUser[userId].push(signal);
      }

      // Send digest per user
      const recipients = await getSlackRecipients(supabase, orgId);

      for (const [userId, userSignals] of Object.entries(signalsByUser)) {
        const recipient = recipients.find(r => r.userId === userId);
        if (!recipient) continue;

        const canSend = await shouldSendNotification(
          supabase, 'account_intelligence_digest', orgId, recipient.userId
        );
        if (!canSend) continue;

        // Group by watchlist entry
        const byWatchlist: Record<string, typeof userSignals> = {};
        for (const signal of userSignals) {
          if (!byWatchlist[signal.watchlist_id]) byWatchlist[signal.watchlist_id] = [];
          byWatchlist[signal.watchlist_id].push(signal);
        }

        const accounts: AccountDigestEntry[] = [];
        for (const [watchlistId, wSignals] of Object.entries(byWatchlist)) {
          const watchlist = wSignals[0]?.account_watchlist as any;
          const companyName = watchlist?.companies?.name ||
            `${watchlist?.contacts?.first_name ?? ''} ${watchlist?.contacts?.last_name ?? ''}`.trim() ||
            'Unknown';

          accounts.push({
            companyName,
            watchlistId,
            signals: wSignals.map(s => ({
              signalType: s.signal_type,
              severity: s.severity,
              title: s.title,
            })),
          });
        }

        // Sort: most signals first
        accounts.sort((a, b) => b.signals.length - a.signals.length);

        const weekDate = new Date().toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });

        const { blocks, text } = buildAccountIntelligenceDigest({
          recipientName: recipient.name?.split(' ')[0] ?? 'there',
          weekDate,
          accounts,
          totalSignals: userSignals.length,
          appUrl: APP_URL,
        });

        const slackResult = await deliverToSlack(supabase, {
          type: 'account_intelligence_digest',
          orgId,
          recipientUserId: recipient.userId,
          recipientSlackUserId: recipient.slackUserId,
          title: `Weekly Account Intelligence — ${weekDate}`,
          message: text,
          blocks,
          priority: 'medium',
          inAppCategory: 'team',
          inAppType: 'info',
          actionUrl: `${APP_URL}/settings/smart-listening`,
        });

        if (slackResult?.slack?.sent) {
          await recordNotificationSent(
            supabase, 'account_intelligence_digest', orgId, recipient.userId,
            slackResult.slack.channelId, slackResult.slack.ts
          );
          summary.digests_sent++;
          summary.signals_included += userSignals.length;
        }

        // Mirror to in-app
        await deliverToInApp(supabase, {
          type: 'account_intelligence_digest',
          orgId,
          recipientUserId: recipient.userId,
          title: `Weekly Account Intelligence — ${weekDate}`,
          message: `${userSignals.length} signals across ${accounts.length} accounts`,
          priority: 'medium',
          inAppCategory: 'team',
          inAppType: 'info',
          actionUrl: `${APP_URL}/settings/smart-listening`,
        });
      }
    }

    console.log('[account-signal-digest] Complete:', summary);
    return jsonResponse(summary, req);

  } catch (error) {
    console.error('[account-signal-digest] Fatal error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
});
