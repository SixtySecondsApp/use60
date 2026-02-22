/**
 * Deal Temperature Slack Alert Adapter (SIG-009)
 *
 * Delivers deal temperature threshold crossing alerts to deal owners via
 * Slack DM. Two alert types:
 *
 *   heating_up  — temperature crossed 60 upward (warm→hot).
 *                 Signals last 24-48h listed, buttons: [Draft check-in] [View Deal]
 *
 *   cooling_down — temperature dropped below 30 (warm→cold).
 *                 Missing/negative signals listed, buttons: [Try different channel]
 *                 [Draft break-up email] [View Deal]
 *
 * Cooldown: max 1 temperature alert per deal per 48 hours.
 * Last alert timestamp stored in deal_signal_temperature.top_signals metadata
 * or checked via agent_activity log.
 *
 * Action IDs use `deal_temp_` prefix for routing in slack-interactive.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Constants
// =============================================================================

const COOLDOWN_HOURS = 48;
const APP_URL_FALLBACK = 'https://app.use60.com';

// =============================================================================
// Types
// =============================================================================

interface TopSignal {
  type: string;
  source: string;
  description: string;
  score_delta: number;
  detected_at: string;
}

interface ThresholdCrossing {
  direction: 'warming' | 'cooling';
  threshold: number;
  label: string;
}

interface TemperaturePayload {
  deal_id: string;
  org_id: string;
  temperature: number;           // 0.0–1.0
  temperature_raw: number;       // 0–100
  trend: 'rising' | 'falling' | 'stable';
  signal_count_24h: number;
  signal_count_7d: number;
  top_signals: TopSignal[];
  last_signal: string | null;
  threshold_crossing: ThresholdCrossing;
  previous_temperature: number | null;
}

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackMessage {
  text: string;
  blocks: SlackBlock[];
}

interface DeliveryResult {
  deal_id: string;
  deal_name: string;
  owner_id: string;
  owner_slack_user_id: string | null;
  sent: boolean;
  skipped_cooldown?: boolean;
  error?: string;
}

// =============================================================================
// Slack Block Kit helpers
// =============================================================================

function truncate(value: string, max: number): string {
  const v = String(value ?? '');
  return v.length <= max ? v : `${v.slice(0, max - 1)}\u2026`;
}

function btn(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
): SlackBlock {
  const b: SlackBlock = {
    type: 'button',
    text: { type: 'plain_text', text: truncate(text, 75), emoji: true },
    action_id: truncate(actionId, 255),
    value: truncate(value, 1900),
  };
  if (style) b.style = style;
  return b;
}

function divider(): SlackBlock {
  return { type: 'divider' };
}

function header(text: string): SlackBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text: truncate(text, 150), emoji: true },
  };
}

function section(mrkdwn: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: truncate(mrkdwn, 2800) },
  };
}

function fields(items: string[]): SlackBlock {
  return {
    type: 'section',
    fields: items.map((t) => ({ type: 'mrkdwn', text: truncate(t, 1900) })),
  };
}

function ctx(text: string): SlackBlock {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: truncate(text, 1900) }],
  };
}

function actions(buttons: SlackBlock[]): SlackBlock {
  return { type: 'actions', elements: buttons };
}

// =============================================================================
// Temperature formatting helpers
// =============================================================================

/** Convert 0.0–1.0 temperature to a percentage label with emoji gauge */
function formatTemperature(temp: number, raw: number): string {
  const pct = Math.round(raw);
  if (raw >= 60) return `:fire: ${pct}% — Hot`;
  if (raw >= 30) return `:large_yellow_circle: ${pct}% — Warm`;
  return `:snowflake: ${pct}% — Cold`;
}

/** Convert trend to a directional arrow with emoji */
function formatTrend(trend: 'rising' | 'falling' | 'stable'): string {
  switch (trend) {
    case 'rising':  return ':chart_with_upwards_trend: Rising';
    case 'falling': return ':chart_with_downwards_trend: Falling';
    default:        return ':straight_ruler: Stable';
  }
}

/** Format a signal list for display in Slack (max N items) */
function formatSignalList(signals: TopSignal[], max = 5): string {
  if (signals.length === 0) return '_No recent signals_';

  const labelMap: Record<string, string> = {
    meeting_request:        ':calendar: Meeting request',
    positive_buying_signal: ':star: Positive buying signal',
    forward_detected:       ':email: Email forwarded',
    fast_reply:             ':rocket: Fast reply',
    pricing_question:       ':moneybag: Pricing question',
    proposal_opened:        ':eyes: Proposal opened',
    email_reply:            ':speech_balloon: Email reply',
    email_received:         ':incoming_envelope: Email received',
    email_clicked:          ':link: Email link clicked',
    account_signal:         ':satellite: Account signal',
    silence_detected:       ':red_circle: Silence detected',
    slow_reply:             ':warning: Slow reply',
    objection:              ':warning: Objection raised',
  };

  return signals
    .slice(0, max)
    .map((s) => {
      const label = labelMap[s.type] ?? `:bell: ${s.type.replace(/_/g, ' ')}`;
      const delta = s.score_delta > 0 ? `+${s.score_delta.toFixed(1)}` : s.score_delta.toFixed(1);
      const ago = getRelativeTime(s.detected_at);
      return `${label} (${delta} pts, ${ago})`;
    })
    .join('\n');
}

function getRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// =============================================================================
// Message builders
// =============================================================================

function buildHeatingUpMessage(
  dealId: string,
  dealName: string,
  dealValue: number | null,
  payload: TemperaturePayload,
  appUrl: string,
): SlackMessage {
  const valueLabel = dealValue != null ? ` ($${dealValue.toLocaleString()})` : '';
  const recentSignals = payload.top_signals.filter(
    (s) => {
      const hours = (Date.now() - new Date(s.detected_at).getTime()) / (1000 * 60 * 60);
      return hours <= 48;
    }
  );

  return {
    text: `Deal heating up: ${dealName} — temperature crossed 60%`,
    blocks: [
      header(`✅ Momentum Rising | ${truncate(dealName, 100)}`),
      ctx('Trigger: Temperature crossed 60% threshold'),
      section(
        `:fire: *${dealName}*${valueLabel} is gaining momentum.\n` +
        `Temperature crossed *60%* — this deal needs attention now.`
      ),
      divider(),
      fields([
        `*Temperature:* ${formatTemperature(payload.temperature, payload.temperature_raw)}`,
        `*Trend:* ${formatTrend(payload.trend)}`,
        `*Signals (24h):* ${payload.signal_count_24h}`,
        `*Signals (7d):* ${payload.signal_count_7d}`,
      ]),
      section(
        `*Recent signals driving this:*\n${formatSignalList(recentSignals)}`
      ),
      divider(),
      actions([
        btn('Draft Check-in', `deal_temp_draft_checkin::${dealId}`, dealId, 'primary'),
        btn('View Deal', `deal_temp_view_deal::${dealId}`, dealId),
      ]),
      ctx(`<${appUrl}/deals/${dealId}|Open deal in use60>`),
    ],
  };
}

function buildCoolingDownMessage(
  dealId: string,
  dealName: string,
  dealValue: number | null,
  payload: TemperaturePayload,
  appUrl: string,
): SlackMessage {
  const valueLabel = dealValue != null ? ` ($${dealValue.toLocaleString()})` : '';

  // Identify negative/missing signals for the cooling context
  const negativeSignals = payload.top_signals.filter((s) => s.score_delta < 0);
  const signalContext = negativeSignals.length > 0
    ? `*Signals of concern:*\n${formatSignalList(negativeSignals)}`
    : `*Signal count has dropped:* ${payload.signal_count_24h} in last 24h vs avg of ${
        Math.round(payload.signal_count_7d / 7)
      }/day over past week`;

  return {
    text: `Deal cooling down: ${dealName} — temperature dropped below 30%`,
    blocks: [
      header(`💡 Deal Cooling | ${truncate(dealName, 100)}`),
      ctx('Trigger: Temperature dropped below 30% threshold'),
      section(
        `:snowflake: *${dealName}*${valueLabel} is losing heat.\n` +
        `Temperature dropped below *30%* — this deal is at risk of going cold.`
      ),
      divider(),
      fields([
        `*Temperature:* ${formatTemperature(payload.temperature, payload.temperature_raw)}`,
        `*Trend:* ${formatTrend(payload.trend)}`,
        `*Signals (24h):* ${payload.signal_count_24h}`,
        `*Signals (7d):* ${payload.signal_count_7d}`,
      ]),
      section(signalContext),
      divider(),
      actions([
        btn('Try Different Channel', `deal_temp_try_channel::${dealId}`, dealId, 'primary'),
        btn('Draft Break-up Email', `deal_temp_draft_breakup::${dealId}`, dealId),
        btn('View Deal', `deal_temp_view_deal::${dealId}`, dealId),
      ]),
      ctx(`<${appUrl}/deals/${dealId}|Open deal in use60>`),
    ],
  };
}

// =============================================================================
// Slack DM delivery
// =============================================================================

async function sendSlackDM(
  botToken: string,
  slackUserId: string,
  message: SlackMessage,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Open DM channel
    const openResp = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });
    const openData: { ok: boolean; channel?: { id: string }; error?: string } =
      await openResp.json();

    if (!openData.ok || !openData.channel?.id) {
      return { success: false, error: `conversations.open failed: ${openData.error}` };
    }

    // 2. Post message
    const postResp = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: openData.channel.id,
        text: message.text,
        blocks: message.blocks,
      }),
    });
    const postData: { ok: boolean; error?: string } = await postResp.json();

    if (!postData.ok) {
      return { success: false, error: `chat.postMessage failed: ${postData.error}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// Cooldown check (48-hour per-deal gate)
// =============================================================================

/**
 * Returns true if a temperature alert has been sent for this deal within
 * the last COOLDOWN_HOURS, based on agent_activity log.
 */
async function isOnCooldown(
  supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2.43.4').createClient>,
  dealId: string,
  orgId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('agent_activity')
    .select('id')
    .eq('org_id', orgId)
    .eq('sequence_type', 'deal_temperature_alert')
    .gte('created_at', cutoff)
    .contains('metadata', { deal_id: dealId })
    .limit(1)
    .maybeSingle();

  return !!data;
}

// =============================================================================
// Main Adapter
// =============================================================================

export const dealTemperatureSlackAdapter: SkillAdapter = {
  name: 'deliver-temperature-alert',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[deal-temperature-slack] Delivering temperature threshold alerts...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const appUrl = Deno.env.get('APP_URL') || APP_URL_FALLBACK;

      if (!orgId) {
        throw new Error('org_id is required in event context');
      }

      // -----------------------------------------------------------------------
      // 1. Resolve temperature payloads from upstream or event payload
      // -----------------------------------------------------------------------
      const temperatureOutput = state.outputs['agent-deal-temperature'] as
        | { results?: TemperaturePayload[]; result?: TemperaturePayload }
        | undefined;

      let payloads: TemperaturePayload[] = [];

      if (temperatureOutput?.result) {
        // Single-deal mode from agent-deal-temperature
        payloads = [temperatureOutput.result];
      } else if (temperatureOutput?.results) {
        payloads = temperatureOutput.results;
      } else if (state.event.payload?.threshold_crossing) {
        // Direct event: deal_temperature.threshold_crossed
        payloads = [state.event.payload as unknown as TemperaturePayload];
      }

      // Filter to only those with an actual threshold crossing
      payloads = payloads.filter((p) => !!p.threshold_crossing);

      if (payloads.length === 0) {
        console.log('[deal-temperature-slack] No threshold crossings to alert on');
        return {
          success: true,
          output: { delivered: 0, skipped: 0, results: [] },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[deal-temperature-slack] Processing ${payloads.length} threshold crossing(s)...`);

      // -----------------------------------------------------------------------
      // 2. Get Slack bot token for the org
      // -----------------------------------------------------------------------
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const botToken = slackIntegration?.access_token as string | null;

      if (!botToken) {
        console.warn('[deal-temperature-slack] No Slack bot token, skipping delivery');
        return {
          success: true,
          output: {
            delivered: 0,
            skipped: payloads.length,
            results: [],
            skipped_reason: 'no_slack_integration',
          },
          duration_ms: Date.now() - start,
        };
      }

      // -----------------------------------------------------------------------
      // 3. Batch-load deal + owner data
      // -----------------------------------------------------------------------
      const dealIds = payloads.map((p) => p.deal_id);

      const { data: dealRows } = await supabase
        .from('deals')
        .select('id, name, value, owner_id')
        .in('id', dealIds);

      const dealMap = new Map<string, { name: string; value: number | null; owner_id: string | null }>();
      for (const d of dealRows || []) {
        dealMap.set(d.id, { name: d.name, value: d.value, owner_id: d.owner_id });
      }

      const ownerIds = [...new Set(
        (dealRows || [])
          .map((d) => d.owner_id)
          .filter((id): id is string => !!id)
      )];

      const [slackMappingsResult] = await Promise.all([
        ownerIds.length > 0
          ? supabase
              .from('slack_user_mappings')
              .select('sixty_user_id, slack_user_id')
              .eq('org_id', orgId)
              .in('sixty_user_id', ownerIds)
          : Promise.resolve({ data: [] }),
      ]);

      const ownerToSlackId = new Map<string, string>();
      for (const m of slackMappingsResult.data || []) {
        ownerToSlackId.set(m.sixty_user_id, m.slack_user_id);
      }

      // -----------------------------------------------------------------------
      // 4. Deliver one alert per threshold crossing
      // -----------------------------------------------------------------------
      let delivered = 0;
      let skipped = 0;
      const results: DeliveryResult[] = [];

      for (const payload of payloads) {
        const deal = dealMap.get(payload.deal_id);
        const dealName = deal?.name ?? `Deal ${payload.deal_id.slice(0, 8)}`;
        const ownerId = deal?.owner_id ?? null;
        const ownerSlackId = ownerId ? ownerToSlackId.get(ownerId) ?? null : null;

        if (!ownerSlackId) {
          console.warn(
            `[deal-temperature-slack] No Slack mapping for owner of deal ${payload.deal_id}`
          );
          skipped++;
          results.push({
            deal_id: payload.deal_id,
            deal_name: dealName,
            owner_id: ownerId ?? '',
            owner_slack_user_id: null,
            sent: false,
            error: 'no_slack_mapping',
          });
          continue;
        }

        // 48-hour cooldown check
        const onCooldown = await isOnCooldown(supabase, payload.deal_id, orgId);
        if (onCooldown) {
          console.log(
            `[deal-temperature-slack] Deal ${payload.deal_id} on cooldown, skipping alert`
          );
          skipped++;
          results.push({
            deal_id: payload.deal_id,
            deal_name: dealName,
            owner_id: ownerId ?? '',
            owner_slack_user_id: ownerSlackId,
            sent: false,
            skipped_cooldown: true,
          });
          continue;
        }

        // Build message based on crossing direction
        const crossing = payload.threshold_crossing;
        let message: SlackMessage;

        if (crossing.direction === 'warming' && crossing.threshold >= 60) {
          message = buildHeatingUpMessage(
            payload.deal_id,
            dealName,
            deal?.value ?? null,
            payload,
            appUrl
          );
        } else if (crossing.direction === 'cooling' && crossing.threshold <= 30) {
          message = buildCoolingDownMessage(
            payload.deal_id,
            dealName,
            deal?.value ?? null,
            payload,
            appUrl
          );
        } else {
          // warm→hot crossing at 60 cooling, or other intermediate — use heating/cooling based on direction
          if (crossing.direction === 'warming') {
            message = buildHeatingUpMessage(
              payload.deal_id, dealName, deal?.value ?? null, payload, appUrl
            );
          } else {
            message = buildCoolingDownMessage(
              payload.deal_id, dealName, deal?.value ?? null, payload, appUrl
            );
          }
        }

        const sendResult = await sendSlackDM(botToken, ownerSlackId, message);

        if (sendResult.success) {
          delivered++;
          console.log(
            `[deal-temperature-slack] Alert delivered for deal ${dealName} ` +
            `(${crossing.label}) to owner ${ownerId} (slack: ${ownerSlackId})`
          );

          // Log agent_activity (also serves as cooldown record)
          try {
            await supabase.rpc('insert_agent_activity', {
              p_user_id: ownerId,
              p_org_id: orgId,
              p_sequence_type: 'deal_temperature_alert',
              p_title: `Temperature alert: ${dealName} — ${crossing.label}`,
              p_summary:
                `Deal temperature ${crossing.direction === 'warming' ? 'rose to' : 'dropped to'} ` +
                `${Math.round(payload.temperature_raw)}% (${crossing.label})`,
              p_metadata: {
                deal_id: payload.deal_id,
                temperature: payload.temperature,
                temperature_raw: payload.temperature_raw,
                trend: payload.trend,
                threshold_label: crossing.label,
                crossing_direction: crossing.direction,
                crossing_threshold: crossing.threshold,
              },
              p_job_id: null,
            });
          } catch (actErr) {
            console.warn('[deal-temperature-slack] Failed to log agent_activity (non-fatal):', actErr);
          }
        } else {
          skipped++;
          console.warn(
            `[deal-temperature-slack] Failed to deliver for deal ${payload.deal_id}: ${sendResult.error}`
          );
        }

        results.push({
          deal_id: payload.deal_id,
          deal_name: dealName,
          owner_id: ownerId ?? '',
          owner_slack_user_id: ownerSlackId,
          sent: sendResult.success,
          error: sendResult.error,
        });
      }

      console.log(
        `[deal-temperature-slack] Complete: ${delivered} delivered, ${skipped} skipped`
      );

      return {
        success: true,
        output: { delivered, skipped, results },
        duration_ms: Date.now() - start,
      };

    } catch (err) {
      console.error('[deal-temperature-slack] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
