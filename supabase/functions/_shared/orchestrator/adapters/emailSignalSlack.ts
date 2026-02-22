/**
 * Email Signal Slack HITL Delivery Adapter (SIG-006)
 *
 * Delivers email signal alerts to deal/contact owners via Slack DM.
 * Supports per-signal Block Kit templates, rate limiting (5/hour),
 * and digest mode when >3 signals arrive within a 30-minute window.
 *
 * Action IDs use the `email_signal_` prefix for routing in slack-interactive.
 * Routing: slack-interactive/index.ts handles `email_signal_*::` action_ids.
 */

import type { SkillAdapter, SequenceState, SequenceStep, StepResult } from '../types.ts';
import { getServiceClient } from './contextEnrichment.ts';

// =============================================================================
// Types
// =============================================================================

export type EmailSignalType =
  | 'meeting_request'
  | 'pricing_question'
  | 'positive_buying_signal'
  | 'objection'
  | 'competitor_mention'
  | 'introduction_offer'
  | 'forward_detected'
  | 'silence_detected'
  | 'fast_reply'
  | 'slow_reply'
  | 'out_of_office'
  | 'new_cc_contact';

export interface EmailSignalEvent {
  id: string;
  org_id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  communication_event_id: string | null;
  signal_type: EmailSignalType;
  confidence: number;
  context: string | null;
  metadata: Record<string, unknown>;
  actioned: boolean;
  created_at: string;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
}

interface DealRow {
  id: string;
  name: string;
  value: number | null;
  owner_id: string | null;
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}

interface SlackMappingRow {
  sixty_user_id: string;
  slack_user_id: string;
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
  signal_id: string;
  signal_type: EmailSignalType;
  user_id: string;
  slack_user_id: string | null;
  sent: boolean;
  digest: boolean;
  error?: string;
}

// =============================================================================
// Rate limiting state (in-memory for adapter lifetime)
// =============================================================================

interface RateLimitState {
  /** ISO timestamps of alerts sent in the current window */
  sentAt: string[];
}

// user_id -> rate limit state
const rateLimitMap = new Map<string, RateLimitState>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DIGEST_THRESHOLD = 3;
const DIGEST_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Returns how many alerts have been sent to this user in the last hour.
 * Prunes stale timestamps.
 */
function getRecentAlertCount(userId: string): number {
  const state = rateLimitMap.get(userId);
  if (!state) return 0;
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  state.sentAt = state.sentAt.filter((ts) => new Date(ts).getTime() > cutoff);
  rateLimitMap.set(userId, state);
  return state.sentAt.length;
}

/**
 * How many alerts were sent in the last 30 minutes (for digest threshold).
 */
function getRecentAlertCountIn30Min(userId: string): number {
  const state = rateLimitMap.get(userId);
  if (!state) return 0;
  const cutoff = Date.now() - DIGEST_WINDOW_MS;
  return state.sentAt.filter((ts) => new Date(ts).getTime() > cutoff).length;
}

function recordAlertSent(userId: string): void {
  const state = rateLimitMap.get(userId) ?? { sentAt: [] };
  state.sentAt.push(new Date().toISOString());
  rateLimitMap.set(userId, state);
}

// =============================================================================
// Slack helpers
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
// Slack Block Kit builders
// =============================================================================

function truncate(value: string, max: number): string {
  const v = String(value ?? '');
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}\u2026`;
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

function context(text: string): SlackBlock {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: truncate(text, 1900) }],
  };
}

function actions(buttons: SlackBlock[]): SlackBlock {
  return { type: 'actions', elements: buttons };
}

// =============================================================================
// Signal-specific message builders
// =============================================================================

interface SignalMessageContext {
  signal: EmailSignalEvent;
  contactName: string;
  contactEmail: string | null;
  dealName: string | null;
  dealValue: number | null;
  appUrl: string;
}

function buildFastReplyMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, dealValue, appUrl } = ctx;
  const dealLabel = dealName
    ? `*${dealName}*${dealValue != null ? ` ($${dealValue.toLocaleString()})` : ''}`
    : 'an active deal';

  return {
    text: `Fast reply from ${contactName} — they are engaged!`,
    blocks: [
      header('Fast Reply Detected'),
      section(
        `:rocket: *${contactName}* replied unusually quickly on ${dealLabel}.\n` +
        `This is a strong buying signal — reach out while engagement is high.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Confidence:* ${Math.round(signal.confidence * 100)}%`,
      ]),
      divider(),
      actions([
        btn('View Email', `email_signal_view_email::${signal.id}`, signal.id, 'primary'),
        btn('Note in CRM', `email_signal_note_crm::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildSlowReplyMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, appUrl } = ctx;
  const avgHours = signal.metadata?.avg_response_time_hours as number | null;
  const avgLabel = avgHours != null ? ` (avg: ${avgHours.toFixed(1)}h)` : '';

  return {
    text: `Slow reply from ${contactName} — they may be cooling off.`,
    blocks: [
      header('Slow Reply Detected'),
      section(
        `:warning: *${contactName}* took longer than usual to reply` +
        (dealName ? ` on *${dealName}*` : '') +
        `${avgLabel}.\nConsider a proactive follow-up to keep momentum.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Response time baseline:* ${avgLabel || 'unknown'}`,
      ]),
      divider(),
      actions([
        btn('Draft Follow-up', `email_signal_draft_followup::${signal.id}`, signal.id, 'primary'),
        btn('Dismiss', `email_signal_dismiss::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildForwardDetectedMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, appUrl } = ctx;
  const unknownEmails = signal.metadata?.unknown_emails as string[] | null;
  const forwardedTo = unknownEmails?.length
    ? `\nForwarded to: ${unknownEmails.slice(0, 3).join(', ')}`
    : '';

  return {
    text: `${contactName} forwarded your email — new contacts may be involved.`,
    blocks: [
      header('Email Forwarded'),
      section(
        `:email: *${contactName}* forwarded an email` +
        (dealName ? ` related to *${dealName}*` : '') +
        `.${forwardedTo}\nNew stakeholders may be entering the conversation.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*New contacts:* ${unknownEmails?.length ?? 'unknown'}`,
      ]),
      divider(),
      actions([
        btn('Research New Contact', `email_signal_research_contact::${signal.id}`, signal.id, 'primary'),
        btn('Note in CRM', `email_signal_note_crm::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildMeetingRequestMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, appUrl } = ctx;

  return {
    text: `${contactName} wants to schedule a meeting!`,
    blocks: [
      header('Meeting Request'),
      section(
        `:calendar: *${contactName}* is requesting a meeting` +
        (dealName ? ` about *${dealName}*` : '') +
        `.\nRespond while their interest is high.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Confidence:* ${Math.round(signal.confidence * 100)}%`,
      ]),
      divider(),
      actions([
        btn('Send Available Times', `email_signal_send_times::${signal.id}`, signal.id, 'primary'),
        btn('View Calendar', `email_signal_view_calendar::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildPricingQuestionMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, dealValue, appUrl } = ctx;
  const valueLabel = dealValue != null ? ` — deal value $${dealValue.toLocaleString()}` : '';

  return {
    text: `${contactName} asked a pricing question — revenue signal!`,
    blocks: [
      header('Pricing Question'),
      section(
        `:moneybag: *${contactName}* is asking about pricing` +
        (dealName ? ` on *${dealName}*` : '') +
        `${valueLabel}.\nThis is a strong buying intent signal.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Confidence:* ${Math.round(signal.confidence * 100)}%`,
      ]),
      divider(),
      actions([
        btn('Draft Response', `email_signal_draft_response::${signal.id}`, signal.id, 'primary'),
        btn('Note in CRM', `email_signal_note_crm::${signal.id}`, signal.id),
        btn('Dismiss', `email_signal_dismiss::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildSilenceDetectedMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, dealValue, appUrl } = ctx;
  const hoursSilent = signal.metadata?.hours_since_sent as number | null;
  const daysSilent = hoursSilent != null ? Math.round(hoursSilent / 24) : null;
  const silenceLabel = daysSilent != null ? `${daysSilent} day${daysSilent !== 1 ? 's' : ''}` : 'several days';
  const valueLabel = dealValue != null ? ` ($${dealValue.toLocaleString()})` : '';

  return {
    text: `No reply from ${contactName} in ${silenceLabel} — risk of going dark.`,
    blocks: [
      header('Silence Detected — Follow-up Needed'),
      section(
        `:red_circle: No reply from *${contactName}*` +
        (dealName ? ` on *${dealName}*${valueLabel}` : '') +
        ` for *${silenceLabel}*.\nThis deal is at risk of going silent.`,
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Days silent:* ${silenceLabel}`,
        `*Ghost risk:* ${signal.metadata?.ghost_risk != null ? `${Math.round((signal.metadata.ghost_risk as number) * 100)}%` : 'unknown'}`,
        `*Confidence:* ${Math.round(signal.confidence * 100)}%`,
      ]),
      divider(),
      actions([
        btn('Draft Check-in', `email_signal_draft_checkin::${signal.id}`, signal.id, 'primary'),
        btn('Try Different Channel', `email_signal_try_channel::${signal.id}`, signal.id),
        btn('Dismiss', `email_signal_dismiss::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildGenericSignalMessage(ctx: SignalMessageContext): SlackMessage {
  const { signal, contactName, dealName, appUrl } = ctx;
  const labelMap: Partial<Record<EmailSignalType, string>> = {
    positive_buying_signal: 'Positive Buying Signal',
    objection: 'Objection Detected',
    competitor_mention: 'Competitor Mentioned',
    introduction_offer: 'Introduction Offer',
    out_of_office: 'Out of Office Reply',
    new_cc_contact: 'New Contact in CC',
  };
  const label = labelMap[signal.signal_type] ?? signal.signal_type.replace(/_/g, ' ');
  const emoji = signal.signal_type === 'positive_buying_signal' ? ':star:' :
    signal.signal_type === 'objection' ? ':warning:' :
    signal.signal_type === 'competitor_mention' ? ':crossed_swords:' :
    ':bell:';

  return {
    text: `${label}: ${contactName}${dealName ? ` — ${dealName}` : ''}`,
    blocks: [
      header(label),
      section(
        `${emoji} Signal detected from *${contactName}*` +
        (dealName ? ` on *${dealName}*` : '') + '.',
      ),
      signal.context
        ? section(`_"${truncate(signal.context, 400)}"_`)
        : { type: 'divider' },
      fields([
        `*Contact:* ${contactName}`,
        `*Confidence:* ${Math.round(signal.confidence * 100)}%`,
      ]),
      divider(),
      actions([
        btn('View in CRM', `email_signal_view_crm::${signal.id}`, signal.id, 'primary'),
        btn('Note in CRM', `email_signal_note_crm::${signal.id}`, signal.id),
        btn('Dismiss', `email_signal_dismiss::${signal.id}`, signal.id),
      ]),
      context(`Signal ID: ${signal.id} • <${appUrl}|Open in use60>`),
    ],
  };
}

function buildSignalMessage(ctx: SignalMessageContext): SlackMessage {
  switch (ctx.signal.signal_type) {
    case 'fast_reply':          return buildFastReplyMessage(ctx);
    case 'slow_reply':          return buildSlowReplyMessage(ctx);
    case 'forward_detected':    return buildForwardDetectedMessage(ctx);
    case 'meeting_request':     return buildMeetingRequestMessage(ctx);
    case 'pricing_question':    return buildPricingQuestionMessage(ctx);
    case 'silence_detected':    return buildSilenceDetectedMessage(ctx);
    default:                    return buildGenericSignalMessage(ctx);
  }
}

// =============================================================================
// Digest builder (>3 signals in 30-minute window)
// =============================================================================

function buildDigestMessage(
  signals: EmailSignalEvent[],
  contactNameMap: Map<string | null, string>,
  dealNameMap: Map<string | null, string | null>,
  appUrl: string,
): SlackMessage {
  const signalLines = signals.map((s) => {
    const labelMap: Partial<Record<EmailSignalType, string>> = {
      fast_reply: ':rocket: Fast reply',
      slow_reply: ':warning: Slow reply',
      forward_detected: ':email: Forwarded',
      meeting_request: ':calendar: Meeting request',
      pricing_question: ':moneybag: Pricing question',
      silence_detected: ':red_circle: Silence detected',
      positive_buying_signal: ':star: Buying signal',
      objection: ':warning: Objection',
      competitor_mention: ':crossed_swords: Competitor mention',
      out_of_office: ':palm_tree: Out of office',
      new_cc_contact: ':bust_in_silhouette: New CC contact',
      introduction_offer: ':handshake: Introduction',
    };
    const label = labelMap[s.signal_type] ?? s.signal_type.replace(/_/g, ' ');
    const contact = contactNameMap.get(s.contact_id) ?? 'Unknown contact';
    const deal = s.deal_id ? (dealNameMap.get(s.deal_id) ?? 'Unknown deal') : null;
    return `${label} — *${contact}*${deal ? ` (${deal})` : ''}`;
  });

  return {
    text: `${signals.length} email signals need your attention`,
    blocks: [
      header(`${signals.length} Email Signals`),
      section(
        `You have *${signals.length} signals* that need attention:`,
      ),
      section(signalLines.slice(0, 10).join('\n')),
      ...(signals.length > 10
        ? [context(`...and ${signals.length - 10} more`)]
        : []),
      divider(),
      actions([
        btn('View All Signals', 'email_signal_view_all', 'view_all', 'primary'),
        btn('Dismiss All', 'email_signal_dismiss_all', 'dismiss_all'),
      ]),
      context(`<${appUrl}|Open use60> to review and take action`),
    ],
  };
}

// =============================================================================
// Main Adapter
// =============================================================================

export const emailSignalSlackAdapter: SkillAdapter = {
  name: 'deliver-email-signal-slack',

  async execute(state: SequenceState, _step: SequenceStep): Promise<StepResult> {
    const start = Date.now();
    try {
      console.log('[email-signal-slack] Delivering email signal alerts...');

      const supabase = getServiceClient();
      const orgId = state.event.org_id;
      const appUrl = Deno.env.get('APP_URL') || 'https://app.use60.com';

      if (!orgId) {
        throw new Error('org_id is required in event payload');
      }

      // 1. Get signals from upstream classifier output or event payload
      const classifierOutput = state.outputs['agent-email-signals'] as
        | { signals?: EmailSignalEvent[]; results?: Array<{ signals: EmailSignalEvent[] }> }
        | undefined;

      // Flatten: either a direct signals array or from batch results
      let signals: EmailSignalEvent[] = [];
      if (classifierOutput?.signals) {
        signals = classifierOutput.signals;
      } else if (classifierOutput?.results) {
        for (const r of classifierOutput.results) {
          if (Array.isArray(r.signals)) signals.push(...r.signals);
        }
      } else if (state.event.payload?.signals) {
        signals = state.event.payload.signals as EmailSignalEvent[];
      }

      // Filter out already-actioned signals
      signals = signals.filter((s) => !s.actioned);

      if (signals.length === 0) {
        console.log('[email-signal-slack] No unactioned signals to deliver');
        return {
          success: true,
          output: { delivered: 0, skipped: 0, digest: 0, results: [] },
          duration_ms: Date.now() - start,
        };
      }

      console.log(`[email-signal-slack] Processing ${signals.length} signals...`);

      // 2. Get Slack bot token
      const { data: slackIntegration } = await supabase
        .from('slack_integrations')
        .select('access_token')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const botToken = slackIntegration?.access_token as string | null;
      if (!botToken) {
        console.warn('[email-signal-slack] No Slack bot token, skipping delivery');
        return {
          success: true,
          output: {
            delivered: 0,
            skipped: signals.length,
            digest: 0,
            results: [],
            skipped_reason: 'no_slack_integration',
          },
          duration_ms: Date.now() - start,
        };
      }

      // 3. Collect all contact_ids and deal_ids for batch lookup
      const contactIds = [...new Set(signals.map((s) => s.contact_id).filter(Boolean) as string[])];
      const dealIds = [...new Set(signals.map((s) => s.deal_id).filter(Boolean) as string[])];
      const userIds = [...new Set(signals.map((s) => s.user_id))];

      // 4. Batch DB lookups
      const [contactsResult, dealsResult, profilesResult, slackMappingsResult] =
        await Promise.all([
          contactIds.length > 0
            ? supabase
                .from('contacts')
                .select('id, first_name, last_name, email, company_name')
                .in('id', contactIds)
            : Promise.resolve({ data: [] as ContactRow[] }),
          dealIds.length > 0
            ? supabase
                .from('deals')
                .select('id, name, value, owner_id')
                .in('id', dealIds)
            : Promise.resolve({ data: [] as DealRow[] }),
          userIds.length > 0
            ? supabase
                .from('profiles')
                .select('id, first_name, last_name, full_name')
                .in('id', userIds)
            : Promise.resolve({ data: [] as ProfileRow[] }),
          userIds.length > 0
            ? supabase
                .from('slack_user_mappings')
                .select('sixty_user_id, slack_user_id')
                .eq('org_id', orgId)
                .in('sixty_user_id', userIds)
            : Promise.resolve({ data: [] as SlackMappingRow[] }),
        ]);

      // 5. Build lookup maps
      const contactMap = new Map<string, ContactRow>();
      for (const c of (contactsResult.data ?? []) as ContactRow[]) {
        contactMap.set(c.id, c);
      }

      const dealMap = new Map<string, DealRow>();
      for (const d of (dealsResult.data ?? []) as DealRow[]) {
        dealMap.set(d.id, d);
      }

      const profileMap = new Map<string, ProfileRow>();
      for (const p of (profilesResult.data ?? []) as ProfileRow[]) {
        profileMap.set(p.id, p);
      }

      const slackIdMap = new Map<string, string>();
      for (const m of (slackMappingsResult.data ?? []) as SlackMappingRow[]) {
        slackIdMap.set(m.sixty_user_id, m.slack_user_id);
      }

      // Helper: resolve a display name for a contact
      const getContactName = (contactId: string | null): string => {
        if (!contactId) return 'Unknown contact';
        const c = contactMap.get(contactId);
        if (!c) return 'Unknown contact';
        return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown contact';
      };

      // Maps for digest builder
      const contactNameMap = new Map<string | null, string>();
      const dealNameMap = new Map<string | null, string | null>();
      for (const s of signals) {
        contactNameMap.set(s.contact_id, getContactName(s.contact_id));
        if (s.deal_id) dealNameMap.set(s.deal_id, dealMap.get(s.deal_id)?.name ?? null);
      }

      // 6. Group signals by user_id for per-user delivery + rate limiting
      const signalsByUser = new Map<string, EmailSignalEvent[]>();
      for (const signal of signals) {
        const list = signalsByUser.get(signal.user_id) ?? [];
        list.push(signal);
        signalsByUser.set(signal.user_id, list);
      }

      let delivered = 0;
      let skipped = 0;
      let digestCount = 0;
      const results: DeliveryResult[] = [];

      for (const [userId, userSignals] of signalsByUser) {
        const slackUserId = slackIdMap.get(userId) ?? null;

        if (!slackUserId) {
          console.warn(`[email-signal-slack] No Slack mapping for user ${userId}`);
          for (const s of userSignals) {
            skipped++;
            results.push({
              signal_id: s.id,
              signal_type: s.signal_type,
              user_id: userId,
              slack_user_id: null,
              sent: false,
              digest: false,
              error: 'no_slack_mapping',
            });
          }
          continue;
        }

        // Rate limit check
        const recentCount = getRecentAlertCount(userId);
        if (recentCount >= RATE_LIMIT_MAX) {
          console.warn(`[email-signal-slack] Rate limit reached for user ${userId} (${recentCount}/hr)`);
          for (const s of userSignals) {
            skipped++;
            results.push({
              signal_id: s.id,
              signal_type: s.signal_type,
              user_id: userId,
              slack_user_id: slackUserId,
              sent: false,
              digest: false,
              error: 'rate_limit_exceeded',
            });
          }
          continue;
        }

        // Digest mode: >3 signals in the last 30 minutes
        const recent30MinCount = getRecentAlertCountIn30Min(userId);
        if (recent30MinCount + userSignals.length > DIGEST_THRESHOLD) {
          console.log(
            `[email-signal-slack] Digest mode for user ${userId} ` +
            `(${recent30MinCount} recent + ${userSignals.length} new > ${DIGEST_THRESHOLD})`,
          );
          const digestMessage = buildDigestMessage(userSignals, contactNameMap, dealNameMap, appUrl);
          const sendResult = await sendSlackDM(botToken, slackUserId, digestMessage);

          if (sendResult.success) {
            recordAlertSent(userId);
            digestCount++;
            delivered += userSignals.length;
            console.log(`[email-signal-slack] Digest sent to user ${userId} (${userSignals.length} signals)`);
          } else {
            console.warn(`[email-signal-slack] Digest send failed for ${userId}: ${sendResult.error}`);
          }

          for (const s of userSignals) {
            results.push({
              signal_id: s.id,
              signal_type: s.signal_type,
              user_id: userId,
              slack_user_id: slackUserId,
              sent: sendResult.success,
              digest: true,
              error: sendResult.error,
            });
          }
          continue;
        }

        // Individual signal delivery
        for (const signal of userSignals) {
          // Re-check rate limit for each signal (may have incremented)
          if (getRecentAlertCount(userId) >= RATE_LIMIT_MAX) {
            skipped++;
            results.push({
              signal_id: signal.id,
              signal_type: signal.signal_type,
              user_id: userId,
              slack_user_id: slackUserId,
              sent: false,
              digest: false,
              error: 'rate_limit_exceeded',
            });
            continue;
          }

          const contact = contactMap.get(signal.contact_id ?? '');
          const deal = signal.deal_id ? dealMap.get(signal.deal_id) : undefined;

          const msgCtx: SignalMessageContext = {
            signal,
            contactName: getContactName(signal.contact_id),
            contactEmail: contact?.email ?? null,
            dealName: deal?.name ?? null,
            dealValue: deal?.value ?? null,
            appUrl,
          };

          const message = buildSignalMessage(msgCtx);
          const sendResult = await sendSlackDM(botToken, slackUserId, message);

          if (sendResult.success) {
            recordAlertSent(userId);
            delivered++;
            console.log(
              `[email-signal-slack] Delivered ${signal.signal_type} signal ` +
              `${signal.id} to user ${userId}`,
            );
          } else {
            skipped++;
            console.warn(
              `[email-signal-slack] Failed to deliver signal ${signal.id}: ${sendResult.error}`,
            );
          }

          results.push({
            signal_id: signal.id,
            signal_type: signal.signal_type,
            user_id: userId,
            slack_user_id: slackUserId,
            sent: sendResult.success,
            digest: false,
            error: sendResult.error,
          });

          // Log agent_activity for the feed
          if (sendResult.success) {
            try {
              await supabase.rpc('insert_agent_activity', {
                p_user_id: userId,
                p_org_id: orgId,
                p_sequence_type: 'email_signal_alert',
                p_title: `Email signal: ${signal.signal_type.replace(/_/g, ' ')}`,
                p_summary: signal.context ?? `${signal.signal_type} detected`,
                p_metadata: {
                  signal_id: signal.id,
                  signal_type: signal.signal_type,
                  contact_id: signal.contact_id,
                  deal_id: signal.deal_id,
                  confidence: signal.confidence,
                },
                p_job_id: null,
              });
            } catch (actErr) {
              console.warn('[email-signal-slack] Failed to log agent_activity (non-fatal):', actErr);
            }
          }
        }
      }

      console.log(
        `[email-signal-slack] Complete: ${delivered} delivered, ` +
        `${digestCount} digest(s), ${skipped} skipped`,
      );

      return {
        success: true,
        output: {
          delivered,
          skipped,
          digest_messages: digestCount,
          results,
        },
        duration_ms: Date.now() - start,
      };

    } catch (err) {
      console.error('[email-signal-slack] Error:', err);
      return {
        success: false,
        error: String(err),
        duration_ms: Date.now() - start,
      };
    }
  },
};
