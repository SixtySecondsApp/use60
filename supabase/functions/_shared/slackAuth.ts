// supabase/functions/_shared/slackAuth.ts
// Shared Slack authentication and utility functions for slash commands and interactive handlers

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ============================================================================
// Types
// ============================================================================

export interface SlackUser {
  id: string;
  name?: string;
  username?: string;
}

export interface SlackChannel {
  id: string;
  name?: string;
}

export interface SlackMessage {
  ts: string;
  blocks?: unknown[];
}

export interface SlackAction {
  action_id: string;
  value: string;
  type: string;
  block_id?: string;
}

export interface SlackTeam {
  id: string;
  domain?: string;
}

export interface InteractivePayload {
  type: 'block_actions' | 'view_submission' | 'shortcut' | 'message_action';
  user: SlackUser;
  channel?: SlackChannel;
  message?: SlackMessage;
  response_url?: string;
  trigger_id?: string;
  actions?: SlackAction[];
  view?: {
    id: string;
    callback_id: string;
    state?: {
      values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>;
    };
    private_metadata?: string;
  };
  team?: SlackTeam;
}

export interface SlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  api_app_id: string;
}

export interface SlackOrgConnection {
  orgId: string;
  botToken: string;
}

export interface SixtyUserContext {
  userId: string;
  orgId?: string;
}

export interface TaskData {
  title: string;
  dealId?: string;
  contactId?: string;
  dueInDays?: number;
  meetingId?: string;
}

// ============================================================================
// Environment
// ============================================================================

const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET');

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Verify Slack request signature using HMAC-SHA256
 * @param body Raw request body string
 * @param timestamp X-Slack-Request-Timestamp header
 * @param signature X-Slack-Signature header
 */
export async function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): Promise<boolean> {
  if (!slackSigningSecret) {
    // Allow opting into insecure mode for local development only.
    const allowInsecure = (Deno.env.get('ALLOW_INSECURE_SLACK_SIGNATURES') || '').toLowerCase() === 'true';
    if (allowInsecure) {
      console.warn('ALLOW_INSECURE_SLACK_SIGNATURES=true - skipping signature verification');
      return true;
    }
    console.error('SLACK_SIGNING_SECRET not set - refusing request');
    return false;
  }

  // Prevent replay attacks - reject if timestamp is more than 5 minutes old
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    console.error('Slack request timestamp too old');
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(slackSigningSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBasestring));
  const hashArray = Array.from(new Uint8Array(signatureBytes));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const computedSignature = `v0=${hashHex}`;

  return computedSignature === signature;
}

// ============================================================================
// User & Org Context
// ============================================================================

/**
 * Get Slack org connection (bot token) from team ID
 */
export async function getSlackOrgConnection(
  supabase: SupabaseClient,
  teamId?: string
): Promise<SlackOrgConnection | null> {
  if (!teamId) return null;

  const { data } = await supabase
    .from('slack_org_settings')
    .select('org_id, bot_access_token')
    .eq('slack_team_id', teamId)
    .eq('is_connected', true)
    .single();

  if (!data?.org_id || !data?.bot_access_token) return null;
  return { orgId: data.org_id as string, botToken: data.bot_access_token as string };
}

/**
 * Get Sixty user context from Slack user ID
 * Maps Slack user to Sixty user via slack_user_mappings table
 */
export async function getSixtyUserContext(
  supabase: SupabaseClient,
  slackUserId: string,
  teamId?: string
): Promise<SixtyUserContext | null> {
  // First try to find by slack_user_id directly
  let query = supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId);

  if (teamId) {
    // If we have team ID, find the org
    const { data: orgSettings } = await supabase
      .from('slack_org_settings')
      .select('org_id')
      .eq('slack_team_id', teamId)
      .single();

    if (orgSettings?.org_id) {
      query = query.eq('org_id', orgSettings.org_id);
    }
  }

  const { data, error } = await query.single();

  if (error || !data?.sixty_user_id) {
    console.warn('No Sixty user mapping found for Slack user:', slackUserId);
    return null;
  }

  return {
    userId: data.sixty_user_id as string,
    orgId: (data as Record<string, unknown>)?.org_id as string | undefined
  };
}

/**
 * Get user display name from profile
 */
export async function getUserDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email')
    .eq('id', userId)
    .single();

  const profile = data as Record<string, unknown> | null;
  const full = profile?.full_name as string | null | undefined;
  if (full) return full;

  const first = profile?.first_name as string | null | undefined;
  const last = profile?.last_name as string | null | undefined;
  const combined = `${first || ''} ${last || ''}`.trim();
  if (combined) return combined;

  const email = profile?.email as string | null | undefined;
  return email || 'Unknown';
}

// ============================================================================
// Slack API Helpers
// ============================================================================

/**
 * Send ephemeral message to user (only visible to them)
 */
export async function sendEphemeral(
  responseUrl: string,
  message: { blocks: unknown[]; text: string }
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: false,
        ...message,
      }),
    });
  } catch (error) {
    console.error('Error sending ephemeral message:', error);
  }
}

/**
 * Send response to Slack (visible in channel)
 */
export async function sendResponse(
  responseUrl: string,
  message: { blocks: unknown[]; text: string },
  options?: { replace_original?: boolean; response_type?: 'ephemeral' | 'in_channel' }
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: options?.response_type || 'ephemeral',
        replace_original: options?.replace_original ?? false,
        ...message,
      }),
    });
  } catch (error) {
    console.error('Error sending response:', error);
  }
}

/**
 * Update the original message
 */
export async function updateMessage(
  responseUrl: string,
  blocks: unknown[]
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        blocks,
      }),
    });
  } catch (error) {
    console.error('Error updating message:', error);
  }
}

/**
 * Post message to a Slack channel
 */
export async function postToChannel(
  botToken: string,
  channelId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    const result = await response.json();
    return { ok: result.ok, ts: result.ts, error: result.error };
  } catch (error) {
    console.error('Error posting to channel:', error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Post ephemeral message to a user in a channel
 */
export async function postEphemeralToChannel(
  botToken: string,
  channelId: string,
  userId: string,
  message: { blocks: unknown[]; text: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: userId,
        blocks: message.blocks,
        text: message.text,
      }),
    });

    const result = await response.json();
    return { ok: result.ok, error: result.error };
  } catch (error) {
    console.error('Error posting ephemeral to channel:', error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Open a modal view
 */
export async function openModal(
  botToken: string,
  triggerId: string,
  view: {
    type: 'modal';
    callback_id: string;
    title: { type: 'plain_text'; text: string };
    submit?: { type: 'plain_text'; text: string };
    close?: { type: 'plain_text'; text: string };
    blocks: unknown[];
    private_metadata?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://slack.com/api/views.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view,
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('Failed to open modal:', result.error);
    }
    return { ok: result.ok, error: result.error };
  } catch (error) {
    console.error('Error opening modal:', error);
    return { ok: false, error: String(error) };
  }
}

// ============================================================================
// Task Creation
// ============================================================================

/**
 * Create a task in the database
 */
export async function createTask(
  supabase: SupabaseClient,
  ctx: SixtyUserContext,
  taskData: TaskData
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (taskData.dueInDays || 3));

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: taskData.title,
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
      deal_id: taskData.dealId || null,
      contact_id: taskData.contactId || null,
      meeting_id: taskData.meetingId || null,
      due_date: dueDate.toISOString(),
      status: 'pending',
      source: 'slack_command',
      metadata: {
        source: 'slack_slash_command',
        ...(taskData.meetingId ? { meeting_id: taskData.meetingId } : {}),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return { success: false, error: error.message };
  }

  return { success: true, taskId: data.id };
}

// ============================================================================
// Slash Command Parsing
// ============================================================================

/**
 * Parse slash command payload from URL-encoded form data
 */
export function parseSlashCommandPayload(rawBody: string): SlashCommandPayload | null {
  try {
    const params = new URLSearchParams(rawBody);

    return {
      token: params.get('token') || '',
      team_id: params.get('team_id') || '',
      team_domain: params.get('team_domain') || '',
      channel_id: params.get('channel_id') || '',
      channel_name: params.get('channel_name') || '',
      user_id: params.get('user_id') || '',
      user_name: params.get('user_name') || '',
      command: params.get('command') || '',
      text: params.get('text') || '',
      response_url: params.get('response_url') || '',
      trigger_id: params.get('trigger_id') || '',
      api_app_id: params.get('api_app_id') || '',
    };
  } catch (error) {
    console.error('Error parsing slash command payload:', error);
    return null;
  }
}

/**
 * Parse subcommand and arguments from command text
 * Example: "contact john@acme.com" -> { subcommand: "contact", args: ["john@acme.com"] }
 */
export function parseCommandText(text: string): { subcommand: string; args: string[]; rawArgs: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { subcommand: '', args: [], rawArgs: '' };
  }

  const parts = trimmed.split(/\s+/);
  const subcommand = parts[0].toLowerCase();
  const args = parts.slice(1);
  const rawArgs = trimmed.substring(subcommand.length).trim();

  return { subcommand, args, rawArgs };
}

// ============================================================================
// Response Builders
// ============================================================================

/**
 * Build a simple error response for Slack
 */
export function buildErrorResponse(message: string): { blocks: unknown[]; text: string } {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `❌ ${message}` },
      },
    ],
    text: message,
  };
}

/**
 * Build a simple success response for Slack
 */
export function buildSuccessResponse(message: string): { blocks: unknown[]; text: string } {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ ${message}` },
      },
    ],
    text: message,
  };
}

/**
 * Build a loading response (shown while processing)
 */
export function buildLoadingResponse(message: string = 'Processing...'): { blocks: unknown[]; text: string } {
  return {
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `⏳ ${message}` },
      },
    ],
    text: message,
  };
}

/**
 * Build help message for /sixty command
 */
export function buildHelpMessage(): { blocks: unknown[]; text: string } {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Sixty — your AI sales copilot', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Just type what you need in plain English:\n' +
            '>`/sixty prep me for my next meeting`\n' +
            '>`/sixty what\'s happening with Acme?`\n' +
            '>`/sixty which deals are at risk this week?`',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Shortcuts* (skip the AI, instant results):\n' +
            '`today` — day at a glance\n' +
            '`prep` — next meeting brief\n' +
            '`deal <name>` — deal snapshot\n' +
            '`contact <name>` — contact lookup\n' +
            '`follow-up <who>` — draft a follow-up\n' +
            '`risks` — at-risk deals\n' +
            '`debrief` — post-meeting summary\n' +
            '`task add <text>` — create a task\n' +
            '`pipeline` — pipeline summary\n' +
            '`standup` — team standup digest',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Tip: `/60` works as a shortcut too!' },
        ],
      },
    ],
    text: 'Sixty — your AI sales copilot. Type what you need: /sixty prep me for my next meeting',
  };
}
