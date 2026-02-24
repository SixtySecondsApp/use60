// supabase/functions/slack-waitlist-notification/index.ts
// Posts waitlist notifications to Slack using the Sales Bot
//
// Notification types:
// - new_signup: Real-time notification when someone joins the waitlist
// - daily_digest: Daily summary with stats and tool leaderboard
// - referral_milestone: When a user hits 3, 5, or 10 referrals
// - tier_upgrade: When a user reaches VIP or Priority tier

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Configuration keys in system_config table
const CONFIG_KEYS = {
  ORG_ID: 'waitlist_slack_org_id',
  CHANNEL_ID: 'waitlist_slack_channel_id',
};

// Get configuration from system_config table
async function getWaitlistConfig(supabase: ReturnType<typeof createClient>): Promise<{
  orgId: string | null;
  channelId: string | null;
}> {
  const { data: configs } = await supabase
    .from('system_config')
    .select('key, value')
    .in('key', [CONFIG_KEYS.ORG_ID, CONFIG_KEYS.CHANNEL_ID]);

  const configMap = new Map(configs?.map(c => [c.key, c.value]) || []);

  return {
    orgId: configMap.get(CONFIG_KEYS.ORG_ID) || null,
    channelId: configMap.get(CONFIG_KEYS.CHANNEL_ID) || null,
  };
}

// Slack Block Kit safety helpers
const truncate = (value: string, max: number): string => {
  const v = String(value ?? '');
  if (v.length <= max) return v;
  if (max <= 1) return v.slice(0, max);
  return `${v.slice(0, max - 1)}...`;
};

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackMessage {
  blocks: SlackBlock[];
  text: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  full_name: string;
  company_name?: string;
  signup_position: number;
  effective_position: number;
  referral_code: string;
  referred_by_code?: string;
  referral_count: number;
  dialer_tool?: string;
  dialer_other?: string;
  meeting_recorder_tool?: string;
  meeting_recorder_other?: string;
  crm_tool?: string;
  crm_other?: string;
  task_manager_tool?: string;
  task_manager_other?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  created_at: string;
}

// Block Kit builders
const header = (text: string): SlackBlock => ({
  type: 'header',
  text: { type: 'plain_text', text: truncate(text, 150), emoji: true },
});

const section = (text: string): SlackBlock => ({
  type: 'section',
  text: { type: 'mrkdwn', text: truncate(text, 2800) },
});

const sectionWithFields = (fields: Array<{ label: string; value: string }>): SlackBlock => ({
  type: 'section',
  fields: fields.slice(0, 10).map((f) => ({
    type: 'mrkdwn',
    text: truncate(`*${f.label}*\n${f.value}`, 1900),
  })),
});

const divider = (): SlackBlock => ({ type: 'divider' });

const context = (elements: string[]): SlackBlock => ({
  type: 'context',
  elements: elements.map((text) => ({ type: 'mrkdwn', text: truncate(text, 1900) })),
});

// Get tool display with emoji
const getToolDisplay = (tool: string | undefined, otherValue: string | undefined): string | null => {
  if (!tool || tool === 'None' || tool === '') return null;
  if (tool === 'Other') return otherValue || 'Other';
  return tool;
};

// Tier calculation based on effective position
const getTierInfo = (position: number): { name: string; emoji: string } => {
  if (position <= 50) return { name: 'VIP', emoji: '👑' };
  if (position <= 200) return { name: 'Priority', emoji: '⭐' };
  return { name: 'Early Bird', emoji: '🐣' };
};

// Build new signup notification message
function buildNewSignupMessage(entry: WaitlistEntry): SlackMessage {
  const blocks: SlackBlock[] = [];
  const tier = getTierInfo(entry.effective_position);

  blocks.push(header('🎉 New Waitlist Signup!'));

  // User info
  blocks.push(sectionWithFields([
    { label: 'Name', value: entry.full_name || 'Not provided' },
    { label: 'Company', value: entry.company_name || 'Not provided' },
    { label: 'Email', value: entry.email },
    { label: 'Position', value: `#${entry.effective_position} ${tier.emoji}` },
  ]));

  // Tool stack
  const dialer = getToolDisplay(entry.dialer_tool, entry.dialer_other);
  const recorder = getToolDisplay(entry.meeting_recorder_tool, entry.meeting_recorder_other);
  const crm = getToolDisplay(entry.crm_tool, entry.crm_other);
  const taskManager = getToolDisplay(entry.task_manager_tool, entry.task_manager_other);

  const tools: string[] = [];
  if (dialer) tools.push(`📞 ${dialer}`);
  if (recorder) tools.push(`🎙️ ${recorder}`);
  if (crm) tools.push(`💼 ${crm}`);
  if (taskManager) tools.push(`✅ ${taskManager}`);

  if (tools.length > 0) {
    blocks.push(divider());
    blocks.push(section(`*🛠️ Tool Stack*\n${tools.join(' • ')}`));
  }

  // Referral and UTM info
  const contextItems: string[] = [];
  if (entry.referred_by_code) {
    contextItems.push(`📣 Referred by: ${entry.referred_by_code}`);
  }
  if (entry.utm_source || entry.utm_campaign) {
    const source = [entry.utm_source, entry.utm_campaign].filter(Boolean).join(' / ');
    contextItems.push(`🔗 Source: ${source}`);
  }
  if (contextItems.length > 0) {
    blocks.push(context(contextItems));
  }

  return {
    blocks,
    text: `New waitlist signup: ${entry.full_name || entry.email} (#${entry.effective_position})`,
  };
}

// Build daily digest message
async function buildDailyDigestMessage(supabase: ReturnType<typeof createClient>): Promise<SlackMessage> {
  const blocks: SlackBlock[] = [];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  blocks.push(header('☀️ Waitlist Daily Digest'));
  blocks.push(context([`📅 ${dateStr}`]));

  // Get signup stats
  const { data: stats } = await supabase.rpc('get_waitlist_signup_stats');

  // Fallback if RPC doesn't exist - query directly
  let today = 0, thisWeek = 0, thisMonth = 0, allTime = 0;

  if (stats) {
    today = stats.today || 0;
    thisWeek = stats.this_week || 0;
    thisMonth = stats.this_month || 0;
    allTime = stats.all_time || 0;
  } else {
    // Direct query fallback
    const { data: countData } = await supabase
      .from('meetings_waitlist')
      .select('created_at', { count: 'exact' });

    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const weekAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (countData) {
      allTime = countData.length;
      today = countData.filter(r => new Date(r.created_at) >= todayStart).length;
      thisWeek = countData.filter(r => new Date(r.created_at) >= weekAgo).length;
      thisMonth = countData.filter(r => new Date(r.created_at) >= monthAgo).length;
    }
  }

  blocks.push(divider());
  blocks.push(section(`*📊 Signup Summary*\nToday: *${today}* • Week: *${thisWeek}* • Month: *${thisMonth}*\nAll Time: *${allTime}* total`));

  // Get top tools for each category
  const categories = [
    { field: 'dialer_tool', other: 'dialer_other', emoji: '📞', label: 'Top Dialers' },
    { field: 'meeting_recorder_tool', other: 'meeting_recorder_other', emoji: '🎙️', label: 'Top Meeting Recorders' },
    { field: 'crm_tool', other: 'crm_other', emoji: '💼', label: 'Top CRMs' },
    { field: 'task_manager_tool', other: 'task_manager_other', emoji: '✅', label: 'Top Task Managers' },
  ];

  for (const cat of categories) {
    const { data: toolData } = await supabase
      .from('meetings_waitlist')
      .select(`${cat.field}, ${cat.other}`)
      .not(cat.field, 'is', null)
      .not(cat.field, 'eq', 'None')
      .not(cat.field, 'eq', '');

    if (toolData && toolData.length > 0) {
      // Count tools
      const counts: Record<string, number> = {};
      for (const row of toolData) {
        const toolValue = row[cat.field];
        const otherValue = row[cat.other];
        const displayName = toolValue === 'Other' ? (otherValue || 'Other') : toolValue;
        if (displayName) {
          counts[displayName] = (counts[displayName] || 0) + 1;
        }
      }

      // Sort and get top 5
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (sorted.length > 0) {
        const toolList = sorted.map(([name, count]) => `${name} (${count})`).join(' • ');
        blocks.push(divider());
        blocks.push(section(`*${cat.emoji} ${cat.label}*\n${toolList}`));
      }
    }
  }

  return {
    blocks,
    text: `Waitlist Daily Digest - ${dateStr}: ${today} new signups today, ${allTime} total`,
  };
}

// Build referral milestone message
function buildReferralMilestoneMessage(entry: WaitlistEntry, milestone: number): SlackMessage {
  const blocks: SlackBlock[] = [];
  const tier = getTierInfo(entry.effective_position);

  blocks.push(header('🏆 Referral Milestone!'));
  blocks.push(section(`*${entry.full_name || 'User'}* just hit *${milestone} referrals*!\n${entry.email}`));
  blocks.push(divider());

  // Calculate position boost (each referral gives -5 position boost)
  const originalPosition = entry.signup_position;
  const boostedPosition = entry.effective_position;

  blocks.push(sectionWithFields([
    { label: 'Position Boost', value: `#${originalPosition} → #${boostedPosition}` },
    { label: 'Current Tier', value: `${tier.emoji} ${tier.name} Access` },
  ]));

  return {
    blocks,
    text: `Referral Milestone: ${entry.full_name || entry.email} hit ${milestone} referrals!`,
  };
}

// Build tier upgrade message
function buildTierUpgradeMessage(entry: WaitlistEntry, newTier: string): SlackMessage {
  const blocks: SlackBlock[] = [];
  const tierEmoji = newTier === 'VIP' ? '👑' : '⭐';

  blocks.push(header(`${tierEmoji} ${newTier} Tier Reached!`));
  blocks.push(section(`*${entry.full_name || 'User'}* upgraded to *${newTier}* tier!\n${entry.email}`));
  blocks.push(divider());

  blocks.push(sectionWithFields([
    { label: 'New Position', value: `#${entry.effective_position}` },
    { label: 'Referrals', value: `${entry.referral_count} total` },
  ]));

  return {
    blocks,
    text: `Tier Upgrade: ${entry.full_name || entry.email} reached ${newTier} tier!`,
  };
}

// Get Slack bot token - tries slack_integrations first (user OAuth), then slack_org_settings (org bot)
async function getSlackBotToken(
  supabase: ReturnType<typeof createClient>,
  teamIdOrOrgId: string
): Promise<string | null> {
  // First try slack_integrations (user-level OAuth) by team_id
  const { data: integration } = await supabase
    .from('slack_integrations')
    .select('access_token')
    .eq('team_id', teamIdOrOrgId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (integration?.access_token) {
    console.log('Using token from slack_integrations');
    return integration.access_token;
  }

  // Fallback to slack_org_settings (org-level bot) by org_id
  const { data: orgSettings } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', teamIdOrOrgId)
    .eq('is_connected', true)
    .single();

  if (orgSettings?.bot_access_token) {
    console.log('Using token from slack_org_settings');
    return orgSettings.bot_access_token;
  }

  return null;
}

// Post message to Slack
async function postToSlack(
  botToken: string,
  channel: string,
  message: SlackMessage
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      blocks: message.blocks,
      text: message.text,
    }),
  });

  const result = await response.json();

  // Auto-join channel if bot not in channel
  if (!result.ok && result.error === 'not_in_channel') {
    await fetch('https://slack.com/api/conversations.join', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel }),
    });

    // Retry the message
    const retryResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    return retryResponse.json();
  }

  return result;
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { type, entry_id, milestone, new_tier } = body;

    console.log('[slack-waitlist-notification] Request:', { type, entry_id, milestone, new_tier });

    if (!type) {
      return new Response(
        JSON.stringify({ error: 'type parameter required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get configuration from database
    const config = await getWaitlistConfig(supabase);

    if (!config.orgId) {
      console.error('waitlist_slack_org_id not configured in system_config');
      return new Response(
        JSON.stringify({ success: false, error: 'Slack org not configured. Set waitlist_slack_org_id in Admin > Waitlist.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!config.channelId) {
      console.error('waitlist_slack_channel_id not configured in system_config');
      return new Response(
        JSON.stringify({ success: false, error: 'Slack channel not configured. Set waitlist_slack_channel_id in Admin > Waitlist.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Slack bot token
    const botToken = await getSlackBotToken(supabase, config.orgId);
    if (!botToken) {
      console.error('Could not retrieve Slack bot token for org:', config.orgId);
      return new Response(
        JSON.stringify({ success: false, error: 'Slack not connected for this organization' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channelId = config.channelId;

    let message: SlackMessage;

    switch (type) {
      case 'new_signup': {
        if (!entry_id) {
          return new Response(
            JSON.stringify({ error: 'entry_id required for new_signup' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: entry, error } = await supabase
          .from('meetings_waitlist')
          .select('*')
          .eq('id', entry_id)
          .single();

        if (error || !entry) {
          console.error('Waitlist entry not found:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'Entry not found' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        message = buildNewSignupMessage(entry as WaitlistEntry);
        break;
      }

      case 'daily_digest': {
        message = await buildDailyDigestMessage(supabase);
        break;
      }

      case 'referral_milestone': {
        if (!entry_id || !milestone) {
          return new Response(
            JSON.stringify({ error: 'entry_id and milestone required for referral_milestone' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: entry, error } = await supabase
          .from('meetings_waitlist')
          .select('*')
          .eq('id', entry_id)
          .single();

        if (error || !entry) {
          console.error('Waitlist entry not found:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'Entry not found' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        message = buildReferralMilestoneMessage(entry as WaitlistEntry, milestone);
        break;
      }

      case 'tier_upgrade': {
        if (!entry_id || !new_tier) {
          return new Response(
            JSON.stringify({ error: 'entry_id and new_tier required for tier_upgrade' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: entry, error } = await supabase
          .from('meetings_waitlist')
          .select('*')
          .eq('id', entry_id)
          .single();

        if (error || !entry) {
          console.error('Waitlist entry not found:', error);
          return new Response(
            JSON.stringify({ success: false, error: 'Entry not found' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        message = buildTierUpgradeMessage(entry as WaitlistEntry, new_tier);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Post to Slack
    const result = await postToSlack(botToken, channelId, message);

    if (!result.ok) {
      console.error('Slack API error:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[slack-waitlist-notification] Success:', { type, ts: result.ts });
    return new Response(
      JSON.stringify({ success: true, ts: result.ts }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[slack-waitlist-notification] Error:', error);

    // Capture error to Sentry
    await captureException(error, {
      tags: {
        function: 'slack-waitlist-notification',
        integration: 'slack',
      },
    });

    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
