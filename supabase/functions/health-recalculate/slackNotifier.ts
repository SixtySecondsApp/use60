// supabase/functions/health-recalculate/slackNotifier.ts
// Sends Slack Block Kit alerts for critical deal health changes

import { AlertPayload } from './alertEvaluator.ts';

// =============================================================================
// Types
// =============================================================================

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackMessage {
  blocks: SlackBlock[];
  text: string;
}

interface UserAlertPreferences {
  alert_types_enabled?: {
    health_drop?: boolean;
    ghost_risk?: boolean;
    no_activity?: boolean;
    stage_stall?: boolean;
    sentiment_decline?: boolean;
    close_date_risk?: boolean;
  };
  notification_channels?: {
    in_app?: boolean;
    slack?: boolean;
  };
  severity_threshold?: 'info' | 'warning' | 'critical';
}

// =============================================================================
// Slack Block Builders (from slack-block-kit skill)
// =============================================================================

const truncate = (value: string, max: number): string => {
  const v = String(value ?? '');
  if (v.length <= max) return v;
  if (max <= 1) return v.slice(0, max);
  return `${v.slice(0, max - 1)}…`;
};

const safeHeaderText = (text: string): string => truncate(text, 150);
const safeButtonText = (text: string): string => truncate(text, 75);
const safeMrkdwn = (text: string): string => truncate(text, 2800);
const safeButtonValue = (value: string): string => truncate(value, 1900);

function header(text: string): SlackBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text: safeHeaderText(text), emoji: true },
  };
}

function section(text: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: safeMrkdwn(text) },
  };
}

function actions(buttons: Array<{
  text: string;
  action_id: string;
  value?: string;
  url?: string;
  style?: 'primary' | 'danger';
}>): SlackBlock {
  return {
    type: 'actions',
    elements: buttons.map((btn) => {
      if (btn.url) {
        return {
          type: 'button',
          text: { type: 'plain_text', text: safeButtonText(btn.text), emoji: true },
          url: btn.url,
          style: btn.style,
        };
      }
      return {
        type: 'button',
        text: { type: 'plain_text', text: safeButtonText(btn.text), emoji: true },
        action_id: btn.action_id,
        value: btn.value ? safeButtonValue(btn.value) : undefined,
        style: btn.style,
      };
    }),
  };
}

function context(elements: Array<{ text: string }>): SlackBlock {
  return {
    type: 'context',
    elements: elements.map((el) => ({
      type: 'mrkdwn',
      text: truncate(el.text, 1900),
    })),
  };
}

function divider(): SlackBlock {
  return { type: 'divider' };
}

// =============================================================================
// Alert Message Builder
// =============================================================================

/**
 * Build Slack Block Kit message for deal health alert
 */
function buildDealHealthAlertMessage(
  alert: AlertPayload,
  dealName: string,
  appBaseUrl: string
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header with severity emoji
  const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
  blocks.push(header(`${severityEmoji} ${alert.title}`));

  // Main message
  blocks.push(section(alert.message));

  // Risk signals (if metadata has risk_factors)
  const riskFactors = alert.metadata?.risk_factors as string[] | undefined;
  if (riskFactors && riskFactors.length > 0) {
    const riskText = riskFactors.map((r) => `• ${r.replace(/_/g, ' ')}`).join('\n');
    blocks.push(section(`*Risk Signals:*\n${riskText}`));
  }

  // Suggested actions
  if (alert.suggested_actions && alert.suggested_actions.length > 0) {
    const actionsText = alert.suggested_actions
      .slice(0, 3)
      .map((action, i) => `${i + 1}. ${action}`)
      .join('\n');
    blocks.push(section(`*Suggested Actions:*\n${actionsText}`));
  }

  blocks.push(divider());

  // Action buttons (max 3)
  const buttons = [
    {
      text: 'Open Deal',
      action_id: `health_alert_open_deal_${alert.deal_id}`,
      value: alert.deal_id,
      style: 'primary' as const,
    },
    {
      text: 'Ask Copilot',
      url: `${appBaseUrl}/crm/pipeline?copilot=true&context=deal:${alert.deal_id}`,
    },
    {
      text: 'Snooze Alert',
      action_id: `health_alert_snooze_${alert.deal_id}`,
      value: alert.deal_id,
    },
  ];

  blocks.push(actions(buttons));

  // Footer context
  blocks.push(
    context([
      {
        text: `Deal: ${dealName} | Severity: ${alert.severity} | ${new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`,
      },
    ])
  );

  return {
    blocks,
    text: `${severityEmoji} Deal Health Alert: ${alert.title} - ${dealName}`,
  };
}

// =============================================================================
// User Preferences Check
// =============================================================================

/**
 * Check if user has Slack notifications enabled for this alert type
 */
async function shouldSendSlackAlert(
  supabase: any,
  userId: string,
  alert: AlertPayload
): Promise<boolean> {
  // Check user preferences in user_settings table
  const { data: settings } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (!settings) return true; // Default to enabled if no preferences set

  const prefs = settings.preferences as UserAlertPreferences | null;
  if (!prefs) return true;

  // Check if alert type is enabled
  const alertTypesEnabled = prefs.alert_types_enabled || {};
  const isTypeEnabled = alertTypesEnabled[alert.alert_type as keyof typeof alertTypesEnabled];
  if (isTypeEnabled === false) return false;

  // Check if Slack channel is enabled
  const channels = prefs.notification_channels || { slack: true };
  if (!channels.slack) return false;

  // Check severity threshold
  const threshold = prefs.severity_threshold || 'info';
  const severityOrder = { info: 0, warning: 1, critical: 2 };
  const alertSeverityLevel = severityOrder[alert.severity];
  const thresholdLevel = severityOrder[threshold];
  if (alertSeverityLevel < thresholdLevel) return false;

  return true;
}

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Check if user has exceeded daily Slack alert limit (10 per day)
 */
async function checkRateLimit(supabase: any, userId: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: alerts, error } = await supabase
    .from('deal_health_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('notification_sent', true)
    .gte('notification_sent_at', todayStart.toISOString());

  if (error) {
    console.error('[SlackNotifier] Error checking rate limit:', error);
    return false; // Allow on error to avoid blocking critical alerts
  }

  const count = alerts || 0;
  return count < 10;
}

// =============================================================================
// Slack Credentials
// =============================================================================

/**
 * Get Slack bot token for user's organization
 */
async function getSlackBotToken(supabase: any, userId: string): Promise<string | null> {
  // Get user's org_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.org_id) return null;

  // Get Slack org settings with bot token
  const { data: slackSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token, is_connected')
    .eq('org_id', profile.org_id)
    .eq('is_connected', true)
    .maybeSingle();

  if (!slackSettings?.bot_access_token) return null;

  return slackSettings.bot_access_token;
}

/**
 * Get user's Slack user ID from mapping table
 */
async function getUserSlackId(supabase: any, userId: string): Promise<string | null> {
  const { data: mapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', userId)
    .maybeSingle();

  return mapping?.slack_user_id || null;
}

// =============================================================================
// Slack API Call
// =============================================================================

/**
 * Post message to Slack via DM
 */
async function postSlackMessage(
  botToken: string,
  slackUserId: string,
  message: SlackMessage
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Open DM channel with user
    const dmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        users: slackUserId,
      }),
    });

    const dmResult = await dmResponse.json();
    if (!dmResult.ok) {
      console.error('[SlackNotifier] Failed to open DM:', dmResult.error);
      return { ok: false, error: dmResult.error };
    }

    const channelId = dmResult.channel.id;

    // Post message to DM
    const msgResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    const msgResult = await msgResponse.json();
    return { ok: msgResult.ok, error: msgResult.error };
  } catch (error) {
    console.error('[SlackNotifier] Error posting Slack message:', error);
    return { ok: false, error: String(error) };
  }
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Send Slack alerts for critical deal health changes
 * Called from health-recalculate after alerts are inserted to DB
 */
export async function sendSlackAlerts(
  supabase: any,
  alerts: AlertPayload[],
  appBaseUrl: string = 'https://app.use60.com'
): Promise<{ sent: number; skipped: number; failed: number }> {
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Group alerts by user_id for batch processing
  const alertsByUser = new Map<string, AlertPayload[]>();
  for (const alert of alerts) {
    // Only send Slack for alerts with 'slack' in channels array
    if (!alert.channels.includes('slack')) continue;

    // Get user_id from deal
    const { data: deal } = await supabase
      .from('deals')
      .select('owner_id, name')
      .eq('id', alert.deal_id)
      .maybeSingle();

    if (!deal) continue;

    const userId = deal.owner_id;
    if (!alertsByUser.has(userId)) {
      alertsByUser.set(userId, []);
    }
    alertsByUser.get(userId)!.push({ ...alert, metadata: { ...alert.metadata, dealName: deal.name } });
  }

  // Process alerts per user
  for (const [userId, userAlerts] of alertsByUser) {
    // Check rate limit (10 per day)
    const withinLimit = await checkRateLimit(supabase, userId);
    if (!withinLimit) {
      console.log(`[SlackNotifier] Rate limit exceeded for user ${userId}, skipping ${userAlerts.length} alerts`);
      skippedCount += userAlerts.length;
      continue;
    }

    // Get Slack credentials
    const botToken = await getSlackBotToken(supabase, userId);
    const slackUserId = await getUserSlackId(supabase, userId);

    if (!botToken || !slackUserId) {
      console.log(`[SlackNotifier] No Slack credentials for user ${userId}, skipping ${userAlerts.length} alerts`);
      skippedCount += userAlerts.length;
      continue;
    }

    // Send each alert (respecting preferences)
    for (const alert of userAlerts) {
      // Check user preferences
      const shouldSend = await shouldSendSlackAlert(supabase, userId, alert);
      if (!shouldSend) {
        console.log(`[SlackNotifier] User preferences disabled for ${alert.alert_type}, skipping`);
        skippedCount++;
        continue;
      }

      // Build message
      const dealName = alert.metadata?.dealName as string;
      const message = buildDealHealthAlertMessage(alert, dealName, appBaseUrl);

      // Post to Slack
      const result = await postSlackMessage(botToken, slackUserId, message);

      if (result.ok) {
        sentCount++;
        console.log(`[SlackNotifier] Sent ${alert.alert_type} alert for deal ${alert.deal_id} to user ${userId}`);

        // Update alert record in DB
        await supabase
          .from('deal_health_alerts')
          .update({
            notification_sent: true,
            notification_sent_at: new Date().toISOString(),
          })
          .eq('deal_id', alert.deal_id)
          .eq('alert_type', alert.alert_type);
      } else {
        failedCount++;
        console.error(
          `[SlackNotifier] Failed to send ${alert.alert_type} alert for deal ${alert.deal_id}: ${result.error}`
        );
      }
    }
  }

  console.log(`[SlackNotifier] Sent ${sentCount}, skipped ${skippedCount}, failed ${failedCount} Slack alerts`);
  return { sent: sentCount, skipped: skippedCount, failed: failedCount };
}
