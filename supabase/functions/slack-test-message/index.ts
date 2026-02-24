// supabase/functions/slack-test-message/index.ts
// Sends a simple test message using the org-level bot token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type SlackChannel = { id: string; name: string; is_private?: boolean; is_member?: boolean };

type SalesAssistantActionItem = {
  type: 'email' | 'ghost' | 'meeting' | 'deal';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedAction: string;
  metadata: Record<string, unknown>;
};

type SalesAssistantDigest = {
  actionItems: SalesAssistantActionItem[];
  emailsToRespond: number;
  ghostRisks: number;
  upcomingMeetings: number;
};

type ProactiveSimMessage = {
  title: string;
  summary: string;
  blocks: unknown[];
  stats?: Record<string, number | string>;
};

const SALES_ASSISTANT_BLOCKS_PROMPT = `Slack Block Kit template for Sales Assistant DM:

Design principles (from slack-blocks skill):
- Scannable: Lead with most important info (high priority first)
- Actionable: Every item has a "Create Task" button
- Contextual: Include type emoji + priority indicator + description
- Max 3 buttons per actions block

Structure:
1) header: "🎯 Your Sales Action Items" (attention-grabbing emoji)
2) section with fields: Quick stats grid (emails/ghosts/meetings)
3) divider
4) For each action item (max 5):
   - section with accessory button:
     - priority: 🔴 high, 🟡 medium, 🟢 low
     - type emoji: 📧 email, 👻 ghost, 📅 meeting, 💰 deal
     - bold title + description
     - button: "➕ Create Task" (danger if high, primary otherwise)
     - value: JSON { title, metadata, source: "slack_assistant" }
5) divider
6) context: "Powered by Sixty Sales Assistant • Updated every 15 min"

Notes:
- High priority items appear first
- Buttons handled by slack-interactive → creates tasks in Sixty
- No URL on buttons, so value is included for interactivity`;

const PROACTIVE_SIM_BLOCKS_PROMPT = `Slack Block Kit simulator messages for Proactive 60:

Design principles:
- Scannable header + short summary
- 2–4 concrete next actions
- Every action has an interactive button (Create Task / Open Deal / View Meeting)

These are simulator messages used by the Proactive Simulator page to iterate quickly.`;

async function getBotToken(supabase: ReturnType<typeof createClient>, orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .single();
  return data?.bot_access_token || null;
}

async function listChannels(botToken: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Failed to list Slack channels');

    for (const ch of json.channels || []) {
      channels.push({
        id: ch.id,
        name: ch.name,
        is_private: ch.is_private || false,
        is_member: ch.is_member || false,
      });
    }

    cursor = json.response_metadata?.next_cursor;
  } while (cursor);

  channels.sort((a, b) => a.name.localeCompare(b.name));
  return channels;
}

async function postMessage(botToken: string, channel: string, text: string) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text }),
  });
  return res.json();
}

async function postMessageWithBlocks(botToken: string, channel: string, text: string, blocks: unknown[]) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  return res.json();
}

async function openDm(botToken: string, slackUserId: string): Promise<string> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ users: slackUserId, return_im: true }),
  });
  const json = await res.json();
  if (!json.ok || !json.channel?.id) {
    throw new Error(json.error || 'Failed to open DM');
  }
  return json.channel.id as string;
}

function buildSalesAssistantBlocks(digest: SalesAssistantDigest): any[] {
  const blocks: any[] = [];

  // Header - attention grabbing
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: '🎯 Your Sales Action Items', emoji: true },
  });

  // Quick stats as section fields (scannable at a glance)
  blocks.push({
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: `*📧 Emails*\n${digest.emailsToRespond} to respond` },
      { type: 'mrkdwn', text: `*👻 Ghost Risks*\n${digest.ghostRisks} detected` },
      { type: 'mrkdwn', text: `*📅 Meetings*\n${digest.upcomingMeetings} upcoming` },
      { type: 'mrkdwn', text: `*🔥 Priority*\n${digest.actionItems.filter(i => i.priority === 'high').length} urgent` },
    ],
  });

  blocks.push({ type: 'divider' });

  // Sort by priority (high first)
  const sortedItems = [...digest.actionItems].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  // Action items (max 5)
  for (const item of sortedItems.slice(0, 5)) {
    const emoji: Record<string, string> = { email: '📧', ghost: '👻', meeting: '📅', deal: '💰' };
    const typeEmoji = emoji[item.type] || '📌';
    const priorityIndicator = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${priorityIndicator} ${typeEmoji} *${item.title}*\n${item.description}`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
        action_id: 'create_task_from_assistant',
        value: JSON.stringify({
          title: item.suggestedAction,
          ...(item.metadata || {}),
          source: 'slack_assistant',
        }),
        style: item.priority === 'high' ? 'danger' : 'primary',
      },
    });
  }

  // Empty state
  if (digest.actionItems.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: "✅ *You're all caught up!*\nNo urgent items right now. Great job staying on top of things." },
    });
  }

  blocks.push({ type: 'divider' });

  // Footer context
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '⚡ _Powered by Sixty Sales Assistant • Updated every 15 min_' }],
  });

  return blocks;
}

function sampleDigest(): SalesAssistantDigest {
  return {
    emailsToRespond: 3,
    ghostRisks: 1,
    upcomingMeetings: 2,
    actionItems: [
      {
        type: 'email',
        priority: 'high',
        title: '🔥 Hot prospect awaiting pricing',
        description: 'Sarah from Acme Corp asked for enterprise pricing. They have budget approved for Q1. Reply within 2 hours to keep momentum.',
        suggestedAction: 'Send enterprise pricing with 3-year discount option',
        metadata: { emailId: 'sample-email-1', dueInDays: 0 },
      },
      {
        type: 'ghost',
        priority: 'high',
        title: 'Decision maker going dark',
        description: 'John (VP Sales @ Beta Inc) has not responded in 8 days after verbal agreement. £45K deal at risk.',
        suggestedAction: 'Send breakup email + offer executive sponsor call',
        metadata: { contactId: 'sample-contact', dealId: 'sample-deal', dueInDays: 1 },
      },
      {
        type: 'meeting',
        priority: 'medium',
        title: 'Discovery call in 30 mins',
        description: 'Call with Gamma Ltd - first meeting with their CTO. Review their tech stack challenges from the initial email.',
        suggestedAction: 'Review tech requirements + prepare 3 discovery questions',
        metadata: { meetingId: 'sample-meeting-1', dueInDays: 0 },
      },
      {
        type: 'deal',
        priority: 'medium',
        title: 'Deal stalled in negotiation',
        description: 'Delta Corp deal (£28K) has been in Verbal stage for 12 days. No contract signed yet.',
        suggestedAction: 'Schedule contract review call this week',
        metadata: { dealId: 'sample-deal-2', dueInDays: 2 },
      },
      {
        type: 'email',
        priority: 'low',
        title: 'Follow-up on proposal',
        description: 'Epsilon Ltd received proposal 5 days ago. Send friendly check-in.',
        suggestedAction: 'Send value-add follow-up with case study',
        metadata: { emailId: 'sample-email-2', dueInDays: 1 },
      },
    ],
  };
}

async function buildLiveDigest(supabase: ReturnType<typeof createClient>, userId: string): Promise<SalesAssistantDigest> {
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  const actionItems: SalesAssistantActionItem[] = [];

  // Emails needing response (recent categorizations)
  const { data: toRespond } = await supabase
    .from('email_categorizations')
    .select('external_id, signals, thread_id, processed_at')
    .eq('user_id', userId)
    .eq('category', 'to_respond')
    .gte('processed_at', fifteenMinAgo.toISOString())
    .order('processed_at', { ascending: false })
    .limit(5);

  for (const email of toRespond || []) {
    const urgency = (email as any).signals?.urgency || 'medium';
    actionItems.push({
      type: 'email',
      priority: urgency === 'high' ? 'high' : 'medium',
      title: 'Email needs response',
      description: 'A recent email was categorized as needing a reply.',
      suggestedAction: 'Reply to the email thread',
      metadata: { emailId: (email as any).external_id, threadId: (email as any).thread_id, dueInDays: urgency === 'high' ? 1 : 3 },
    });
  }

  // Ghost detection signals (high confidence)
  const { data: ghostSignals } = await supabase
    .from('ghost_detection_signals')
    .select('contact_id, deal_id, signal_type, confidence, detected_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('confidence', 0.7)
    .order('detected_at', { ascending: false })
    .limit(3);

  for (const s of ghostSignals || []) {
    actionItems.push({
      type: 'ghost',
      priority: 'high',
      title: 'Contact may be ghosting',
      description: `Signal: ${(s as any).signal_type} (confidence ${(s as any).confidence})`,
      suggestedAction: 'Send a re-engagement follow-up',
      metadata: { contactId: (s as any).contact_id, dealId: (s as any).deal_id, dueInDays: 1 },
    });
  }

  // Upcoming meetings (next 4 hours)
  const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const { data: upcomingMeetings } = await supabase
    .from('calendar_events')
    .select('id, title, start_time')
    .eq('user_id', userId)
    .gte('start_time', now.toISOString())
    .lte('start_time', fourHoursFromNow.toISOString())
    .order('start_time', { ascending: true })
    .limit(3);

  for (const m of upcomingMeetings || []) {
    actionItems.push({
      type: 'meeting',
      priority: 'medium',
      title: 'Upcoming meeting',
      description: `${(m as any).title || 'Meeting'} at ${new Date((m as any).start_time).toLocaleTimeString()}`,
      suggestedAction: 'Review context + prepare agenda',
      metadata: { meetingId: (m as any).id, dueInDays: 0 },
    });
  }

  return {
    actionItems,
    emailsToRespond: (toRespond || []).length,
    ghostRisks: (ghostSignals || []).length,
    upcomingMeetings: (upcomingMeetings || []).length,
  };
}

function buildMorningBriefBlocks(message: ProactiveSimMessage): any[] {
  const blocks: any[] = [];
  blocks.push({ type: 'header', text: { type: 'plain_text', text: `☀️ Morning Brief`, emoji: true } });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${message.title}*\n${message.summary}` } });
  if (message.stats) {
    const fields = Object.entries(message.stats).slice(0, 6).map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${v}` }));
    if (fields.length) blocks.push({ type: 'section', fields });
  }
  blocks.push({ type: 'divider' });
  blocks.push(...(message.blocks as any[]));
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '⚡ _Proactive 60 Simulator • Morning Brief_' }] });
  return blocks;
}

function buildStaleDealAlertBlocks(message: ProactiveSimMessage): any[] {
  const blocks: any[] = [];
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '⏳ Stale Deal Alert', emoji: true } });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${message.title}*\n${message.summary}` } });
  blocks.push({ type: 'divider' });
  blocks.push(...(message.blocks as any[]));
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '⚡ _Proactive 60 Simulator • Stale Deal_' }] });
  return blocks;
}

function buildEmailReplyAlertBlocks(message: ProactiveSimMessage): any[] {
  const blocks: any[] = [];
  blocks.push({ type: 'header', text: { type: 'plain_text', text: '📨 Reply Received', emoji: true } });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${message.title}*\n${message.summary}` } });
  blocks.push({ type: 'divider' });
  blocks.push(...(message.blocks as any[]));
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '⚡ _Proactive 60 Simulator • Email Reply_' }] });
  return blocks;
}

function sampleMorningBrief(): ProactiveSimMessage {
  return {
    title: 'Here’s what matters today',
    summary: '2 meetings, 1 deal at risk, and 3 emails needing a response. Focus on Acme first — they’re going quiet.',
    stats: { '📅 Meetings': 2, '📧 To respond': 3, '👻 Ghost risks': 1, '💰 At-risk deals': 1 },
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '🔴 *Top priority*: Follow up with *Acme (Demo)* — last reply 8 days ago.' },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
          action_id: 'create_task_from_assistant',
          value: JSON.stringify({ title: 'Follow up with Acme — confirm next steps', dueInDays: 1, source: 'proactive_morning_brief' }),
          style: 'danger',
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '🟡 *Prep*: 10:00 — Discovery with *TechStart* (ask about timeline + security).' },
      },
    ],
  };
}

function sampleStaleDealAlert(dealId?: string | null): ProactiveSimMessage {
  return {
    title: dealId ? `Deal looks stale (${dealId})` : 'Deal looks stale',
    summary: 'No activity in 14+ days. Suggested: send a quick “next steps” email and propose times.',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Suggested next step: *Send “next steps + timeline” email*' },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
          action_id: 'create_task_from_assistant',
          value: JSON.stringify({ title: 'Send next steps email + propose meeting times', dealId: dealId || undefined, dueInDays: 1, source: 'proactive_stale_deal' }),
          style: 'primary',
        },
      },
    ],
  };
}

function sampleEmailReplyAlert(): ProactiveSimMessage {
  return {
    title: 'Prospect replied: “Sounds good — what does pricing look like?”',
    summary: 'They’re asking about pricing. Suggested response: share the right tier + ask 1 qualifying question.',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Draft response idea*\n“Happy to share pricing — which team size are we scoping for?”' },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: '➕ Create Task', emoji: true },
          action_id: 'create_task_from_assistant',
          value: JSON.stringify({ title: 'Reply with pricing + ask team size', dueInDays: 0, source: 'proactive_email_reply' }),
          style: 'primary',
        },
      },
    ],
  };
}

async function joinChannel(botToken: string, channel: string) {
  const res = await fetch('https://slack.com/api/conversations.join', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel }),
  });
  return res.json();
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[slack-test-message] Environment check:', {
      supabaseUrl: supabaseUrl ? 'SET' : 'MISSING',
      serviceKey: supabaseServiceKey ? `SET (${supabaseServiceKey.slice(0, 20)}...)` : 'MISSING'
    });

    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({
        error: 'Internal configuration error: service role key not available'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const auth = await getAuthContext(req, supabase, supabaseServiceKey);

    console.log('[slack-test-message] Auth context:', {
      mode: auth.mode,
      userId: auth.userId,
      isPlatformAdmin: auth.isPlatformAdmin
    });

    const body = await req.json().catch(() => ({}));
    const orgId = body.orgId as string | undefined;
    const requestedChannelId = body.channelId as string | undefined;
    const action = (body.action as string | undefined) || 'simple';
    const mode = (body.mode as string | undefined) || 'live';
    const dmAudience = body.dmAudience as 'owner' | 'stakeholders' | 'both' | undefined;
    const stakeholderSlackIds = (body.stakeholderSlackIds as string[] | undefined) || [];

    if (!orgId) {
      return new Response(JSON.stringify({ error: 'orgId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (auth.mode === 'user' && auth.userId && !auth.isPlatformAdmin) {
      // Allow members to send DMs to themselves; keep admin-only for channel posting.
      // If sending DM only (dmAudience set, no channelId), allow all members
      // If posting to channel (channelId set) or simple action, require owner/admin
      const isDmOnly = dmAudience && !requestedChannelId;
      const allowed = isDmOnly
        ? (['owner', 'admin', 'member', 'readonly'] as const)
        : (['owner', 'admin'] as const);

      console.log('[slack-test-message] Checking permissions:', {
        orgId,
        userId: auth.userId,
        isDmOnly,
        allowedRoles: allowed,
        dmAudience,
        requestedChannelId
      });

      await requireOrgRole(supabase, orgId, auth.userId, [...allowed]);
      console.log('[slack-test-message] Permission check passed');
    }

    const botToken = await getBotToken(supabase, orgId);
    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Slack not connected for this organization' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sales Assistant preview / DM to self (Block Kit)
    if (action === 'preview_sales_assistant' || action === 'send_sales_assistant_dm') {
      if (auth.mode !== 'user' || !auth.userId) {
        return new Response(JSON.stringify({ error: 'User auth required for Sales Assistant preview' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', orgId)
        .eq('sixty_user_id', auth.userId)
        .maybeSingle();

      const slackUserId = (body.slackUserId as string | undefined) || mapping?.slack_user_id;
      if (!slackUserId) {
        return new Response(JSON.stringify({ error: 'No Slack user mapping found for this user. Connect Slack + link user mapping first.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const digest = mode === 'sample' ? sampleDigest() : await buildLiveDigest(supabase, auth.userId);
      const blocks = buildSalesAssistantBlocks(digest);

      if (action === 'preview_sales_assistant') {
        return new Response(
          JSON.stringify({
            success: true,
            mode,
            digest,
            blocks,
            blocks_prompt: SALES_ASSISTANT_BLOCKS_PROMPT,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send DM to the user
      const dmChannelId = await openDm(botToken, slackUserId);
      const text = `🎯 You have ${digest.actionItems.length} action items that need attention`;
      const result = await postMessageWithBlocks(botToken, dmChannelId, text, blocks);

      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, error: result.error || 'Slack API error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          channelId: result.channel,
          ts: result.ts,
          mode,
          digest,
          blocks,
          blocks_prompt: SALES_ASSISTANT_BLOCKS_PROMPT,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Proactive simulator messages (DM to self)
    if (
      action === 'preview_morning_brief' ||
      action === 'send_morning_brief_dm' ||
      action === 'preview_stale_deal_alert' ||
      action === 'send_stale_deal_alert_dm' ||
      action === 'preview_email_reply_alert' ||
      action === 'send_email_reply_alert_dm'
    ) {
      if (auth.mode !== 'user' || !auth.userId) {
        return new Response(JSON.stringify({ error: 'User auth required for proactive simulator actions' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: mapping } = await supabase
        .from('slack_user_mappings')
        .select('slack_user_id')
        .eq('org_id', orgId)
        .eq('sixty_user_id', auth.userId)
        .maybeSingle();

      const slackUserId = (body.slackUserId as string | undefined) || mapping?.slack_user_id;
      if (!slackUserId) {
        return new Response(JSON.stringify({ error: 'No Slack user mapping found for this user. Connect Slack + link user mapping first.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const dealId = (body.dealId as string | null | undefined) ?? null;

      let msg: ProactiveSimMessage;
      let blocks: unknown[];
      let text: string;

      if (action === 'preview_morning_brief' || action === 'send_morning_brief_dm') {
        msg = sampleMorningBrief();
        blocks = buildMorningBriefBlocks(msg);
        text = '☀️ Your Morning Brief is ready';
      } else if (action === 'preview_stale_deal_alert' || action === 'send_stale_deal_alert_dm') {
        msg = sampleStaleDealAlert(dealId);
        blocks = buildStaleDealAlertBlocks(msg);
        text = '⏳ Stale deal alert';
      } else {
        msg = sampleEmailReplyAlert();
        blocks = buildEmailReplyAlertBlocks(msg);
        text = '📨 Reply received';
      }

      if (action.startsWith('preview_')) {
        return new Response(
          JSON.stringify({
            success: true,
            message: msg,
            blocks,
            blocks_prompt: PROACTIVE_SIM_BLOCKS_PROMPT,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const dmChannelId = await openDm(botToken, slackUserId);
      const result = await postMessageWithBlocks(botToken, dmChannelId, text, blocks as any[]);
      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, error: result.error || 'Slack API error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          channelId: result.channel,
          ts: result.ts,
          message: msg,
          blocks,
          blocks_prompt: PROACTIVE_SIM_BLOCKS_PROMPT,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let channelId = requestedChannelId;
    let channelName: string | undefined;
    const dmRecipients: string[] = [];
    const dmResults: any[] = [];

    // Handle DM audience if specified
    if (dmAudience) {
      const sendToOwner = dmAudience === 'owner' || dmAudience === 'both';
      const sendToStakeholders = dmAudience === 'stakeholders' || dmAudience === 'both';

      // Add owner's Slack ID
      if (sendToOwner && auth.mode === 'user' && auth.userId) {
        console.log('[slack-test-message] Looking up Slack mapping:', { orgId, userId: auth.userId, authMode: auth.mode });

        const { data: mapping, error: mappingError } = await supabase
          .from('slack_user_mappings')
          .select('slack_user_id')
          .eq('org_id', orgId)
          .eq('sixty_user_id', auth.userId)
          .maybeSingle();

        console.log('[slack-test-message] Mapping query result:', { mapping, error: mappingError });

        if (mapping?.slack_user_id) {
          dmRecipients.push(mapping.slack_user_id);
        } else {
          return new Response(JSON.stringify({
            error: 'No Slack user mapping found. Please link your Slack account in Personal Slack settings.',
            debug: { orgId, userId: auth.userId, authMode: auth.mode, mappingError: mappingError?.message }
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Add stakeholder Slack IDs
      if (sendToStakeholders && stakeholderSlackIds.length > 0) {
        dmRecipients.push(...stakeholderSlackIds.filter(Boolean));
      }

      // Send DMs to all recipients
      const dmText = '✅ Sixty Slack test DM: you are configured to receive notifications.';
      for (const slackUserId of dmRecipients) {
        try {
          const dmChannelId = await openDm(botToken, slackUserId);
          const dmResult = await postMessage(botToken, dmChannelId, dmText);
          dmResults.push({
            slackUserId,
            success: dmResult.ok,
            error: dmResult.error,
          });
        } catch (error) {
          dmResults.push({
            slackUserId,
            success: false,
            error: error.message || 'Failed to send DM',
          });
        }
      }
    }

    // Handle channel posting if channelId provided
    let channelResult: any = null;
    if (channelId) {
      const text = '✅ Sixty Slack test message: your workspace is connected and the bot can post messages.';
      let result = await postMessage(botToken, channelId, text);

      if (!result.ok && result.error === 'not_in_channel') {
        const joined = await joinChannel(botToken, channelId);
        if (joined.ok) {
          result = await postMessage(botToken, channelId, text);
        }
      }

      if (!result.ok) {
        return new Response(JSON.stringify({ success: false, error: result.error || 'Slack API error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      channelResult = result;
    } else if (dmRecipients.length === 0) {
      // If no channel and no DMs, fall back to general channel
      const channels = await listChannels(botToken);
      const preferred =
        channels.find((c) => c.name === 'general') ||
        channels.find((c) => c.name === 'random') ||
        channels.find((c) => !c.is_private) ||
        channels[0];

      if (!preferred?.id) {
        return new Response(JSON.stringify({ error: 'No Slack channels available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      channelId = preferred.id;
      channelName = preferred.name;

      const text = '✅ Sixty Slack test message: your workspace is connected and the bot can post messages.';
      channelResult = await postMessage(botToken, channelId, text);

      if (!channelResult.ok) {
        return new Response(JSON.stringify({ success: false, error: channelResult.error || 'Slack API error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        channelId: channelResult?.channel,
        channelName,
        dmCount: dmRecipients.length,
        dmResults,
        ts: channelResult?.ts,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});


