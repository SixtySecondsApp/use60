// supabase/functions/slack-interactive/index.ts
// Handles Slack Interactivity - button clicks, modal submissions, shortcuts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  buildTaskAddedConfirmation,
  buildDealActivityMessage,
  type DealActivityData,
  buildHITLActionedConfirmation,
  type HITLActionedConfirmation,
  type HITLResourceType,
  buildActionConfirmation,
  type ActionConfirmationData,
  section,
  context as contextBlock,
  divider,
  actions as actionsBlock,
  header as headerBlock,
} from '../_shared/slackBlocks.ts';
import {
  handleMomentumSetNextStep,
  handleMomentumMarkMilestone,
  handleMomentumAnswerQuestion,
  handleMomentumNextStepSubmission,
  handleMomentumMilestoneSubmission,
} from './handlers/momentum.ts';
import {
  handlePipelineFilter,
  handlePipelineViewStage,
  handlePipelineDealOverflow,
  handleStandupViewPipeline,
  handleStandupViewRisks,
  handleApprovalOverflow,
  handleApprovalsApproveAll,
  handleApprovalsRefresh,
} from './handlers/phase5.ts';
import { handleHITLAction } from './handlers/hitl.ts';
import { handleSupportAction } from './handlers/support.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const slackSigningSecret = Deno.env.get('SLACK_SIGNING_SECRET');
const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://use60.com';

interface SlackUser {
  id: string;
  name?: string;
  username?: string;
}

interface SlackChannel {
  id: string;
  name?: string;
}

interface SlackMessage {
  ts: string;
  text?: string;
  blocks?: unknown[];
  user?: string;
  permalink?: string;
}

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
  block_id?: string;
}

interface InteractivePayload {
  type: 'block_actions' | 'view_submission' | 'shortcut' | 'message_action';
  user: SlackUser;
  channel?: SlackChannel;
  message?: SlackMessage;
  response_url?: string;
  trigger_id?: string;
  callback_id?: string; // For shortcuts and message actions
  actions?: SlackAction[];
  view?: {
    id: string;
    callback_id: string;
    state?: {
      values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>;
    };
    private_metadata?: string;
  };
  team?: {
    id: string;
    domain?: string;
  };
}

interface TaskData {
  title: string;
  dealId?: string;
  dueInDays?: number;
  meetingId?: string;
}

type SlackOrgConnection = { orgId: string; botToken: string };

// ============================================================================
// Activity Tracking for Smart Engagement Algorithm
// ============================================================================

/**
 * Log Slack interaction to user_activity_events for the Smart Engagement Algorithm.
 * This helps track user engagement with Slack notifications.
 */
async function logSlackInteraction(
  supabase: ReturnType<typeof createClient>,
  params: {
    userId: string | null;
    orgId: string | null;
    actionType: string;
    actionCategory?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!params.userId || !params.orgId) {
    console.log('[Activity] Skipping log - missing userId or orgId');
    return;
  }

  try {
    const now = new Date();
    await supabase
      .from('user_activity_events')
      .insert({
        user_id: params.userId,
        org_id: params.orgId,
        event_type: 'slack_button_click',
        event_source: 'slack',
        event_category: params.actionCategory || 'notifications',
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        action_detail: params.actionType,
        day_of_week: now.getDay(),
        hour_of_day: now.getHours(),
        metadata: params.metadata || {},
      });
    console.log('[Activity] Logged Slack interaction:', params.actionType);
  } catch (error) {
    // Non-blocking - don't fail the main request if logging fails
    console.error('[Activity] Failed to log Slack interaction:', error);
  }
}

/**
 * Verify Slack request signature
 */
async function verifySlackRequest(
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

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
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

async function getSlackOrgConnection(
  supabase: ReturnType<typeof createClient>,
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

async function getUserDisplayName(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email')
    .eq('id', userId)
    .single();

  const full = (data as any)?.full_name as string | null | undefined;
  if (full) return full;
  const first = (data as any)?.first_name as string | null | undefined;
  const last = (data as any)?.last_name as string | null | undefined;
  const combined = `${first || ''} ${last || ''}`.trim();
  if (combined) return combined;
  const email = (data as any)?.email as string | null | undefined;
  return email || 'Unknown';
}

async function postToChannel(
  botToken: string,
  channelId: string,
  message: { blocks: unknown[]; text: string }
): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
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
}

/**
 * Get Sixty user ID from Slack user ID
 */
async function getSixtyUserContext(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string,
  teamId?: string
): Promise<{ userId: string; orgId?: string } | null> {
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

  return { userId: data.sixty_user_id as string, orgId: (data as any)?.org_id as string | undefined };
}

/**
 * Create a task in the database
 */
async function createTask(
  supabase: ReturnType<typeof createClient>,
  ctx: { userId: string; orgId?: string },
  taskData: TaskData
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (taskData.dueInDays || 3));

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: taskData.title,
      // Our tasks schema uses assigned_to/created_by (not user_id)
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      // Multi-tenant: include clerk_org_id when available
      ...(ctx.orgId ? { clerk_org_id: ctx.orgId } : {}),
      deal_id: taskData.dealId || null,
      meeting_id: taskData.meetingId || null,
      due_date: dueDate.toISOString(),
      status: 'pending',
      source: 'slack_suggestion',
      metadata: taskData.meetingId ? { meeting_id: taskData.meetingId, source: 'slack_interactive' } : { source: 'slack_interactive' },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return { success: false, error: error.message };
  }

  return { success: true, taskId: data.id };
}

/**
 * Send ephemeral message to user
 */
async function sendEphemeral(
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
 * Update the original message (e.g., to show task was added)
 */
async function updateMessage(
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
 * Update the original Slack message via chat.update API (works even when response_url has expired).
 * Used for expired/invalid HITL approvals where response_url is stale.
 */
async function updateMessageViaApi(
  botToken: string,
  channelId: string,
  messageTs: string,
  blocks: unknown[],
  text: string
): Promise<void> {
  try {
    const res = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        blocks,
        text,
      }),
    });
    const result = await res.json();
    if (!result.ok) {
      console.error('chat.update failed:', result.error);
    }
  } catch (error) {
    console.error('Error updating message via API:', error);
  }
}

/**
 * Handle expired/invalid HITL approval — updates the original Slack message
 * to show an expiry notice (since response_url may be stale).
 */
async function handleExpiredHITLApproval(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  approval: HITLApprovalRecord | undefined,
  errorMessage: string
): Promise<Response> {
  // Try response_url first (works within ~30 min)
  if (payload.response_url) {
    await sendEphemeral(payload.response_url, {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `⏰ ${errorMessage}` } }],
      text: errorMessage,
    });
  }

  // Also update the original message via API to replace buttons with expiry notice
  if (approval?.slack_channel_id && approval?.slack_message_ts) {
    const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
    if (orgConnection) {
      const typeLabel = approval.resource_name || approval.resource_type;
      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `⏰ *${errorMessage}*\n_${typeLabel}_` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Clicked by <@${payload.user.id}> • ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` }] },
      ];
      await updateMessageViaApi(orgConnection.botToken, approval.slack_channel_id, approval.slack_message_ts, blocks, errorMessage);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// SLACK-001: Snooze Action Handler
// ============================================================================

/**
 * Parse snooze duration string into milliseconds offset.
 * Supports: '2h', '1d', 'tomorrow', '3d', '1w'
 */
function parseSnoozeDuration(duration: string): { ms: number; label: string } {
  const map: Record<string, { ms: number; label: string }> = {
    '2h': { ms: 2 * 60 * 60 * 1000, label: '2 hours' },
    '1d': { ms: 24 * 60 * 60 * 1000, label: 'tomorrow' },
    'tomorrow': { ms: 24 * 60 * 60 * 1000, label: 'tomorrow' },
    '3d': { ms: 3 * 24 * 60 * 60 * 1000, label: '3 days' },
    '1w': { ms: 7 * 24 * 60 * 60 * 1000, label: '1 week' },
  };
  return map[duration] || map['1d'];
}

/**
 * Handle snooze::{entity_type}::{entity_id} actions from any Slack message.
 * Stores the snooze in slack_snoozed_items and updates the original message.
 */
async function handleSnoozeAction(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  // Format: snooze::{entity_type}::{entity_id}
  if (parts.length < 3) {
    console.error('[Snooze] Invalid action_id format:', action.action_id);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const entityType = parts[1]; // 'deal', 'task', 'notification', etc.
  const entityId = parts[2];

  // Parse value for duration and context
  let snoozeData: { entityType?: string; entityId?: string; entityName?: string; duration?: string } = {};
  try {
    snoozeData = JSON.parse(action.value || '{}');
  } catch {
    snoozeData = { duration: '1d' };
  }

  const duration = parseSnoozeDuration(snoozeData.duration || '1d');
  const snoozeUntil = new Date(Date.now() + duration.ms);

  // Get user context
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Your Slack account is not linked to Sixty. Please link it in Settings.' } }],
        text: 'Account not linked',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Store snooze
  const { error: insertError } = await supabase
    .from('slack_snoozed_items')
    .insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      entity_type: entityType,
      entity_id: entityId,
      snooze_until: snoozeUntil.toISOString(),
      original_message_blocks: payload.message?.blocks || null,
      original_context: {
        entityName: snoozeData.entityName || entityId,
        notificationType: 'morning_brief',
      },
      notification_type: 'morning_brief',
      slack_user_id: payload.user.id,
    });

  if (insertError) {
    console.error('[Snooze] Insert error:', insertError);
  }

  // Update original message with confirmation
  if (payload.response_url) {
    const snoozeLabel = snoozeUntil.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const confirmation = buildActionConfirmation({
      action: 'snoozed',
      slackUserId: payload.user.id,
      timestamp: new Date().toISOString(),
      entitySummary: snoozeData.entityName || `${entityType}: ${entityId}`,
      detail: `Snoozed until ${snoozeLabel}`,
    });
    await updateMessage(payload.response_url, confirmation.blocks);
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: `snooze_${duration.label.replace(' ', '_')}`,
    actionCategory: 'notifications',
    entityType,
    entityId,
    metadata: { duration: snoozeData.duration, snooze_until: snoozeUntil.toISOString() },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// SLACK-007: Dismiss Action Handler
// ============================================================================

/**
 * Handle dismiss::{notification_type}::{notification_id} actions.
 * Marks notification as dismissed and updates message.
 */
async function handleDismissAction(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const notificationType = parts[1] || 'unknown';
  const notificationId = parts[2] || 'unknown';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  // Parse value for entity context
  let dismissData: { entityName?: string } = {};
  try {
    dismissData = JSON.parse(action.value || '{}');
  } catch {
    dismissData = {};
  }

  // Update original message with dismissed confirmation
  if (payload.response_url) {
    const confirmation = buildActionConfirmation({
      action: 'dismissed',
      slackUserId: payload.user.id,
      timestamp: new Date().toISOString(),
      entitySummary: dismissData.entityName || `${notificationType}`,
      notificationType,
    });
    await updateMessage(payload.response_url, confirmation.blocks);
  }

  // Log dismiss for Smart Engagement tracking
  await logSlackInteraction(supabase, {
    userId: ctx?.userId || null,
    orgId: ctx?.orgId || null,
    actionType: 'notification_dismissed',
    actionCategory: 'notifications',
    entityType: notificationType,
    entityId: notificationId,
    metadata: { notification_type: notificationType },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// SLACK-004: Draft Follow-up Action Handler
// ============================================================================

/**
 * Handle draft_followup::{resource_type}::{resource_id} actions.
 * Fetches context, generates email draft via Claude, creates HITL approval.
 */
async function handleDraftFollowupAction(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const resourceType = parts[1] || 'deal'; // 'deal', 'contact', 'meeting'
  const resourceId = parts[2] || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Your Slack account is not linked to Sixty. Please link it in Settings.' } }],
        text: 'Account not linked',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Send immediate acknowledgement
  if (payload.response_url) {
    await sendEphemeral(payload.response_url, {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Drafting follow-up email...' } }],
      text: 'Drafting follow-up...',
    });
  }

  // Fetch context based on resource type
  let contactName = '';
  let contactEmail = '';
  let dealContext = '';
  let recentActivity = '';
  let recipientName = '';

  try {
    if (resourceType === 'deal') {
      const { data: deal } = await supabase
        .from('deals')
        .select('id, title, value, stage, owner_id, contacts:contact_id(id, full_name, email)')
        .eq('id', resourceId)
        .maybeSingle();

      if (deal) {
        dealContext = `Deal: ${deal.title} (${deal.stage}, value: ${deal.value})`;
        const contact = deal.contacts as any;
        if (contact) {
          contactName = contact.full_name || '';
          contactEmail = contact.email || '';
          recipientName = contactName;
        }
      }

      // Get last meeting context
      const { data: lastMeeting } = await supabase
        .from('meetings')
        .select('id, title, summary, created_at')
        .eq('deal_id', resourceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastMeeting?.summary) {
        recentActivity = `Last meeting: ${lastMeeting.title}\nSummary: ${lastMeeting.summary}`;
      }
    } else if (resourceType === 'contact') {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, full_name, email, company_id(name)')
        .eq('id', resourceId)
        .maybeSingle();

      if (contact) {
        contactName = contact.full_name || '';
        contactEmail = contact.email || '';
        recipientName = contactName;
        const company = contact.company_id as any;
        dealContext = company?.name ? `Company: ${company.name}` : '';
      }

      // Get recent activities
      const { data: activities } = await supabase
        .from('activities')
        .select('type, title, created_at')
        .eq('contact_id', resourceId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (activities && activities.length > 0) {
        recentActivity = activities.map(a => `${a.type}: ${a.title}`).join('\n');
      }
    }
  } catch (err) {
    console.error('[DraftFollowup] Context fetch error:', err);
  }

  // Generate email draft via Claude
  let emailDraft = {
    subject: `Following up — ${dealContext || recipientName}`,
    body: `Hi ${recipientName || 'there'},\n\nI wanted to follow up on our recent conversation. Looking forward to hearing your thoughts.\n\nBest regards`,
  };

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (anthropicKey) {
      // Get user profile for sender name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', ctx.userId)
        .maybeSingle();

      const senderName = profile?.full_name || 'the team';
      const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      const prompt = `Write a professional, concise follow-up email.

Context:
- Sender: ${senderName}
- Recipient: ${recipientName || 'the contact'}
- ${dealContext}
- ${recentActivity || 'No recent activity context available'}
- Today's date: ${currentDate}

Requirements:
- Subject line: short, specific, conversational
- Body: 3-5 sentences max, warm but professional
- Include a clear next step or question
- Sign off with just the sender's first name

Return JSON: { "subject": "...", "body": "..." }`;

      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const text = aiData.content?.[0]?.text || '';
        // Try to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          emailDraft = { subject: parsed.subject || emailDraft.subject, body: parsed.body || emailDraft.body };
        }
      }
    }
  } catch (err) {
    console.error('[DraftFollowup] AI draft error:', err);
    // Fall back to template
  }

  // Create HITL pending approval
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const { data: approval, error: approvalError } = await supabase
    .from('hitl_pending_approvals')
    .insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      resource_type: 'email_draft',
      resource_id: resourceId,
      resource_name: `Follow-up: ${recipientName || resourceType}`,
      slack_team_id: payload.team?.id || '',
      slack_channel_id: payload.channel?.id || '',
      slack_message_ts: payload.message?.ts || '',
      status: 'pending',
      original_content: {
        to: contactEmail,
        toName: recipientName,
        subject: emailDraft.subject,
        body: emailDraft.body,
        resourceType,
        resourceId,
      },
      callback_type: 'edge_function',
      callback_target: 'hitl-send-followup-email',
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (approvalError) {
    console.error('[DraftFollowup] Approval insert error:', approvalError);
  }

  // Send HITL DM with email preview
  if (orgConnection?.botToken && approval?.id) {
    // Open DM with user
    const dmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${orgConnection.botToken}`,
      },
      body: JSON.stringify({ users: payload.user.id }),
    });

    const dmData = await dmResponse.json();
    const dmChannelId = dmData.channel?.id;

    if (dmChannelId) {
      const hitlBlocks = [
        headerBlock('Follow-up Draft Ready'),
        section(`*To:* ${recipientName || 'Contact'} ${contactEmail ? `(${contactEmail})` : ''}\n*Subject:* ${emailDraft.subject}`),
        divider(),
        section(emailDraft.body),
        divider(),
        actionsBlock([
          { text: 'Send', actionId: `approve::email_draft::${approval.id}`, value: JSON.stringify({ approvalId: approval.id }), style: 'primary' },
          { text: 'Edit', actionId: `edit::email_draft::${approval.id}`, value: JSON.stringify({ approvalId: approval.id }) },
          { text: 'Dismiss', actionId: `reject::email_draft::${approval.id}`, value: JSON.stringify({ approvalId: approval.id }) },
        ]),
        contextBlock([`Expires in 24 hours | ${resourceType}: ${recipientName || resourceId}`]),
      ];

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${orgConnection.botToken}`,
        },
        body: JSON.stringify({
          channel: dmChannelId,
          blocks: hitlBlocks,
          text: `Follow-up draft ready for ${recipientName || 'your contact'}`,
        }),
      });
    }
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'draft_followup',
    actionCategory: 'email',
    entityType: resourceType,
    entityId: resourceId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// SLACK-003: Prep Meeting Handler (from morning brief)
// ============================================================================

/**
 * Handle prep_meeting::{meeting_id} actions.
 * Triggers the meeting prep skill for the specified meeting.
 */
async function handlePrepMeetingAction(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const meetingId = parts[1] || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Acknowledge immediately
  if (payload.response_url) {
    await sendEphemeral(payload.response_url, {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Preparing meeting brief...' } }],
      text: 'Preparing meeting brief...',
    });
  }

  // Trigger the meeting-prep function
  try {
    await supabase.functions.invoke('slack-meeting-prep', {
      body: {
        meetingId,
        userId: ctx.userId,
        orgId: ctx.orgId,
        slackUserId: payload.user.id,
        isManualTrigger: true,
      },
    });
  } catch (err) {
    console.error('[PrepMeeting] Error invoking meeting-prep:', err);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Failed to prepare meeting brief. Try again or check the app.' } }],
        text: 'Meeting prep failed',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// CRM-005: Undo CRM Update Action Handler
// ============================================================================

/**
 * Handle undo_crm_update::{update_id} actions.
 * Calls the undo_crm_field_update RPC to revert a CRM field change.
 */
async function handleUndoCrmUpdate(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const updateId = parts[1] || action.value || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch the update record before undoing it (to get field info for confirmation)
    const { data: updateRecord, error: fetchError } = await supabase
      .from('crm_field_updates')
      .select('field_name, old_value, new_value')
      .eq('id', updateId)
      .single();

    if (fetchError || !updateRecord) {
      console.error('[UndoCrmUpdate] Failed to fetch update record:', fetchError);
      if (payload.response_url) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Could not find the CRM update to undo.' } }],
          text: 'Update not found',
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call the RPC to undo the update
    const { error: undoError } = await supabase.rpc('undo_crm_field_update', {
      p_update_id: updateId,
      p_user_id: ctx.userId,
    });

    if (undoError) {
      console.error('[UndoCrmUpdate] RPC error:', undoError);
      if (payload.response_url) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Failed to undo CRM update: ${undoError.message}` } }],
          text: 'Undo failed',
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Successfully undone - update the Slack message with strikethrough
    if (payload.response_url && payload.message?.blocks) {
      const updatedBlocks = payload.message.blocks.map((block: any) => {
        // Find the section block that contains this field update
        if (block.type === 'section' && block.text?.text?.includes(`*${updateRecord.field_name}*`)) {
          const oldVal = formatUpdateValue(updateRecord.old_value);
          const newVal = formatUpdateValue(updateRecord.new_value);
          return {
            ...block,
            text: {
              ...block.text,
              text: `~*${updateRecord.field_name}*: \`${oldVal}\` → \`${newVal}\`~\n_✓ Reverted by <@${payload.user.id}>_`,
            },
          };
        }
        // Remove the undo button for this specific update
        if (block.type === 'actions') {
          const filteredElements = block.elements?.filter((el: any) =>
            el.action_id !== `undo_crm_update::${updateId}`
          );
          if (filteredElements && filteredElements.length > 0) {
            return { ...block, elements: filteredElements };
          }
          // If no buttons left, return null to filter out the block
          return null;
        }
        return block;
      }).filter(Boolean); // Remove null blocks

      await updateMessage(payload.response_url, updatedBlocks);
    }

    // Log activity for analytics
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'undo_crm_update',
      actionCategory: 'crm',
      entityType: 'crm_field_update',
      entityId: updateId,
      metadata: { field_name: updateRecord.field_name },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[UndoCrmUpdate] Unexpected error:', err);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ An unexpected error occurred while undoing the CRM update.' } }],
        text: 'Unexpected error',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Format a CRM field value for display (helper for undo confirmation)
 */
function formatUpdateValue(value: unknown): string {
  if (value === null || value === undefined) return '_empty_';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

// ============================================================================
// RET-005: Re-engagement HITL Action Handlers
// ============================================================================

/**
 * Handle reengagement_send::{deal_id} actions.
 * Sends the re-engagement email and updates watchlist status to 'converted'.
 */
async function handleReengagementSend(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const dealId = parts[1] || action.value || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get contact name from the message blocks for confirmation
    let contactName = 'contact';
    if (payload.message?.blocks) {
      for (const block of payload.message.blocks) {
        if (block.type === 'section' && block.fields) {
          for (const field of block.fields) {
            if (field.text?.includes('Contact')) {
              // Extract contact name from the field value
              const match = field.text.match(/Contact\*\n(.+?)(?:\n|$)/);
              if (match) contactName = match[1].trim();
            }
          }
        }
      }
    }

    // V1: Log the send intent (actual email sending will come later)
    console.log('[ReengagementSend] Would send email for deal:', dealId);

    // Update watchlist status to 'converted'
    const { error: updateError } = await supabase.rpc('update_watchlist_status', {
      p_deal_id: dealId,
      p_status: 'converted',
      p_next_check_days: null,
    });

    if (updateError) {
      console.error('[ReengagementSend] Error updating watchlist status:', updateError);
      if (payload.response_url) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to update watchlist status.' } }],
          text: 'Failed to update watchlist status.',
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update Slack message with confirmation and remove buttons
    if (payload.response_url && payload.message?.blocks) {
      const updatedBlocks = payload.message.blocks.map((block: any) => {
        // Remove the action buttons
        if (block.type === 'actions') {
          return null;
        }
        return block;
      }).filter(Boolean);

      // Add confirmation message
      updatedBlocks.push(divider());
      updatedBlocks.push(section({
        type: 'mrkdwn',
        text: `✅ *Email sent to ${contactName}*\nWatchlist status updated to converted.`,
      }));
      updatedBlocks.push(contextBlock([`Actioned by <@${payload.user.id}>`]));

      await updateMessage(payload.response_url, updatedBlocks);
    }

    // Log activity
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'reengagement_send',
      actionCategory: 'reengagement',
      entityType: 'deal',
      entityId: dealId,
      metadata: { contact_name: contactName },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ReengagementSend] Unexpected error:', err);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ An unexpected error occurred while sending the re-engagement email.' } }],
        text: 'Unexpected error',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle reengagement_edit::{deal_id} actions.
 * V1: Show placeholder message (full edit will come later).
 */
async function handleReengagementEdit(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const dealId = parts[1] || action.value || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // V1: Show ephemeral placeholder message
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '✏️ Edit functionality coming soon. Please copy and modify the draft above.'
          }
        }],
        text: 'Edit functionality coming soon.',
      });
    }

    // Log activity
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'reengagement_edit',
      actionCategory: 'reengagement',
      entityType: 'deal',
      entityId: dealId,
      metadata: { placeholder: true },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ReengagementEdit] Unexpected error:', err);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle reengagement_snooze::{deal_id} actions.
 * Snoozes the watchlist entry for 2 weeks.
 */
async function handleReengagementSnooze(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const dealId = parts[1] || action.value || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Update watchlist status to 'snoozed' with 2 weeks delay
    const { error: updateError } = await supabase.rpc('update_watchlist_status', {
      p_deal_id: dealId,
      p_status: 'snoozed',
      p_next_check_days: 14, // 2 weeks
    });

    if (updateError) {
      console.error('[ReengagementSnooze] Error updating watchlist status:', updateError);
      if (payload.response_url) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to snooze watchlist entry.' } }],
          text: 'Failed to snooze watchlist entry.',
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update Slack message with confirmation and remove buttons
    if (payload.response_url && payload.message?.blocks) {
      const updatedBlocks = payload.message.blocks.map((block: any) => {
        // Remove the action buttons
        if (block.type === 'actions') {
          return null;
        }
        return block;
      }).filter(Boolean);

      // Add confirmation message
      updatedBlocks.push(divider());
      updatedBlocks.push(section({
        type: 'mrkdwn',
        text: '⏰ *Snoozed for 2 weeks*\nYou\'ll be reminded to follow up later.',
      }));
      updatedBlocks.push(contextBlock([`Actioned by <@${payload.user.id}>`]));

      await updateMessage(payload.response_url, updatedBlocks);
    }

    // Log activity
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'reengagement_snooze',
      actionCategory: 'reengagement',
      entityType: 'deal',
      entityId: dealId,
      metadata: { snooze_days: 14 },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ReengagementSnooze] Unexpected error:', err);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ An unexpected error occurred while snoozing the watchlist entry.' } }],
        text: 'Unexpected error',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle reengagement_remove::{deal_id} actions.
 * Removes the deal from the re-engagement watchlist.
 */
async function handleReengagementRemove(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const parts = action.action_id.split('::');
  const dealId = parts[1] || action.value || '';

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Update watchlist status to 'removed'
    const { error: updateError } = await supabase.rpc('update_watchlist_status', {
      p_deal_id: dealId,
      p_status: 'removed',
      p_next_check_days: null,
    });

    if (updateError) {
      console.error('[ReengagementRemove] Error updating watchlist status:', updateError);
      if (payload.response_url) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to remove from watchlist.' } }],
          text: 'Failed to remove from watchlist.',
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update Slack message with confirmation and remove buttons
    if (payload.response_url && payload.message?.blocks) {
      const updatedBlocks = payload.message.blocks.map((block: any) => {
        // Remove the action buttons
        if (block.type === 'actions') {
          return null;
        }
        return block;
      }).filter(Boolean);

      // Add confirmation message
      updatedBlocks.push(divider());
      updatedBlocks.push(section({
        type: 'mrkdwn',
        text: '🗑️ *Removed from watchlist*\nThis deal will no longer be tracked for re-engagement.',
      }));
      updatedBlocks.push(contextBlock([`Actioned by <@${payload.user.id}>`]));

      await updateMessage(payload.response_url, updatedBlocks);
    }

    // Log activity
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'reengagement_remove',
      actionCategory: 'reengagement',
      entityType: 'deal',
      entityId: dealId,
      metadata: {},
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ReengagementRemove] Unexpected error:', err);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ An unexpected error occurred while removing from watchlist.' } }],
        text: 'Unexpected error',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle single task addition
 */
async function handleAddTask(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const taskData: TaskData = JSON.parse(action.value);
    const result = await createTask(supabase, ctx, taskData);

    // Log activity for Smart Engagement Algorithm
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'add_task',
      actionCategory: 'tasks',
      entityType: taskData.dealId ? 'deal' : taskData.meetingId ? 'meeting' : 'task',
      entityId: taskData.dealId || taskData.meetingId || result.taskId,
      metadata: { source: 'slack_button', task_title: taskData.title },
    });

    if (result.success && payload.response_url) {
      const confirmation = buildTaskAddedConfirmation(taskData.title);
      await sendEphemeral(payload.response_url, confirmation);

      // Optionally update the original message to show the task was added
      // by modifying the button to show a checkmark
      if (payload.message?.blocks) {
        const updatedBlocks = updateBlockWithCheckmark(
          payload.message.blocks as unknown[],
          action.action_id,
          taskData.title
        );
        if (updatedBlocks && payload.response_url) {
          await updateMessage(payload.response_url, updatedBlocks);
        }
      }
    } else if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ Failed to create task: ${result.error}` } }],
        text: 'Failed to create task.',
      });
    }
  } catch (error) {
    console.error('Error parsing task data:', error);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Error processing task. Please try again.' } }],
        text: 'Error processing task.',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle adding all tasks at once
 */
async function handleAddAllTasks(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty. Please contact your admin to set up the mapping.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { tasks } = JSON.parse(action.value) as { tasks: TaskData[] };
    let successCount = 0;
    const errors: string[] = [];

    for (const taskData of tasks) {
      const result = await createTask(supabase, ctx, taskData);
      if (result.success) {
        successCount++;
      } else {
        errors.push(result.error || 'Unknown error');
      }
    }

    // Log activity for Smart Engagement Algorithm
    if (successCount > 0) {
      await logSlackInteraction(supabase, {
        userId: ctx.userId,
        orgId: ctx.orgId || null,
        actionType: 'add_all_tasks',
        actionCategory: 'tasks',
        metadata: { source: 'slack_button', tasks_added: successCount, tasks_failed: errors.length },
      });
    }

    if (payload.response_url) {
      if (successCount > 0) {
        const confirmation = buildTaskAddedConfirmation('', successCount);
        await sendEphemeral(payload.response_url, confirmation);
      }

      if (errors.length > 0) {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `⚠️ ${errors.length} task(s) failed to create.` } }],
          text: 'Some tasks failed to create.',
        });
      }
    }
  } catch (error) {
    console.error('Error parsing tasks data:', error);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Error processing tasks. Please try again.' } }],
        text: 'Error processing tasks.',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle dismiss action
 */
async function handleDismiss(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  _action: SlackAction
): Promise<Response> {
  // Get user context for activity logging
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  // Log activity for Smart Engagement Algorithm (even if user not mapped - we track dismissals)
  if (ctx) {
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'dismiss_tasks',
      actionCategory: 'notifications',
      metadata: { source: 'slack_button' },
    });
  }

  // Just acknowledge - optionally we could update the message
  if (payload.response_url) {
    await sendEphemeral(payload.response_url, {
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '👍 Tasks dismissed.' } }],
      text: 'Tasks dismissed.',
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task creation from alerts (e.g., win probability alert)
 */
async function handleCreateTaskFromAlert(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { dealId, type } = JSON.parse(action.value) as { dealId?: string; type: string };

    // Generate task title based on alert type
    let taskTitle = 'Follow up on deal';
    if (type === 'win_probability') {
      taskTitle = 'Address win probability drop - review deal status';
    }

    const result = await createTask(supabase, ctx, {
      title: taskTitle,
      dealId,
      dueInDays: 1, // Urgent
    });
    // (note: ctx includes orgId when available)

    // Log activity for Smart Engagement Algorithm
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'create_task_from_alert',
      actionCategory: 'tasks',
      entityType: 'deal',
      entityId: dealId,
      metadata: { source: 'slack_button', alert_type: type, task_title: taskTitle },
    });

    if (result.success && payload.response_url) {
      const confirmation = buildTaskAddedConfirmation(taskTitle);
      await sendEphemeral(payload.response_url, confirmation);
    }
  } catch (error) {
    console.error('Error creating task from alert:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task creation from the Sales Assistant (and other proactive DMs)
 * Value is JSON and may include: title, dealId, contactId, dueInDays, source
 */
async function handleCreateTaskFromAssistant(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  if (!ctx) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Your Slack account is not linked to Sixty.' } }],
        text: 'Your Slack account is not linked to Sixty.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsed = JSON.parse(action.value || '{}') as {
      title?: string;
      dealId?: string;
      contactId?: string;
      dueInDays?: number;
      source?: string;
    };

    const title = (parsed.title || '').trim() || 'Follow up';
    const dueInDays = typeof parsed.dueInDays === 'number' ? parsed.dueInDays : 1;

    const result = await createTask(supabase, ctx, {
      title,
      dealId: parsed.dealId,
      contactId: parsed.contactId,
      dueInDays,
    });

    // Log activity for Smart Engagement Algorithm
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: 'create_task_from_assistant',
      actionCategory: 'tasks',
      entityType: parsed.dealId ? 'deal' : parsed.contactId ? 'contact' : 'task',
      entityId: parsed.dealId || parsed.contactId || result.taskId,
      metadata: { source: parsed.source || 'slack_assistant', task_title: title },
    });

    if (payload.response_url) {
      if (result.success) {
        const confirmation = buildTaskAddedConfirmation(title);
        await sendEphemeral(payload.response_url, confirmation);
      } else {
        await sendEphemeral(payload.response_url, {
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to create task.' } }],
          text: 'Failed to create task.',
        });
      }
    }
  } catch (error) {
    console.error('Error creating task from assistant:', error);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to create task.' } }],
        text: 'Failed to create task.',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Update a block to show a checkmark after task was added
 */
function updateBlockWithCheckmark(
  blocks: unknown[],
  actionId: string,
  taskTitle: string
): unknown[] | null {
  try {
    return blocks.map((block: unknown) => {
      const b = block as { type?: string; accessory?: { action_id?: string }; text?: { type: string; text: string } };
      if (b.type === 'section' && b.accessory?.action_id === actionId) {
        // Replace the button with a checkmark
        return {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ ~${taskTitle}~ _(added)_`,
          },
        };
      }
      return block;
    });
  } catch {
    return null;
  }
}

/**
 * Handle log activity button (from deal rooms)
 */
async function handleLogActivity(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  // Open a modal for logging an activity against a deal.
  const dealId = action.value;
  const channelId = payload.channel?.id;
  const triggerId = payload.trigger_id;

  if (!dealId || !triggerId) {
    // Acknowledge to Slack even if we cannot open modal
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Slack is not connected for this workspace/org.' } }],
        text: 'Slack is not connected.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const privateMetadata = JSON.stringify({
    dealId,
    channelId: channelId || null,
    orgId: orgConnection.orgId,
  });

  // Minimal, high-signal modal (no schema guessing beyond type + notes)
  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'log_activity_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: 'Log Activity' },
        submit: { type: 'plain_text', text: 'Log' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'activity_type',
            label: { type: 'plain_text', text: 'Activity type' },
            element: {
              type: 'static_select',
              action_id: 'type_select',
              placeholder: { type: 'plain_text', text: 'Select a type' },
              options: [
                { text: { type: 'plain_text', text: '📧 Email' }, value: 'outbound_email' },
                { text: { type: 'plain_text', text: '📞 Call' }, value: 'outbound_call' },
                { text: { type: 'plain_text', text: '💬 LinkedIn' }, value: 'outbound_linkedin' },
                { text: { type: 'plain_text', text: '📅 Meeting' }, value: 'meeting' },
                { text: { type: 'plain_text', text: '📝 Proposal' }, value: 'proposal' },
                { text: { type: 'plain_text', text: '📌 Note' }, value: 'note' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'activity_details',
            optional: true,
            label: { type: 'plain_text', text: 'Details (optional)' },
            element: {
              type: 'plain_text_input',
              action_id: 'details_input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'What happened? Next step?' },
            },
          },
        ],
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleLogActivitySubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const teamId = payload.team?.id;
  const orgConnection = await getSlackOrgConnection(supabase, teamId);

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    // Close modal; user isn't mapped
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: { dealId?: string; channelId?: string | null; orgId?: string } = {};
  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    meta = {};
  }

  const dealId = meta.dealId;
  if (!dealId) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = (payload.view?.state?.values || {}) as any;
  const typeValue =
    values['activity_type']?.['type_select']?.selected_option?.value ||
    values['activity_type']?.['type_select']?.value ||
    'note';
  const detailsValue = values['activity_details']?.['details_input']?.value || '';

  // Map modal type to activities schema
  let activityType = 'note';
  let outboundType: string | null = null;
  let activityLabel = 'Note';
  if (typeValue === 'outbound_email') {
    activityType = 'outbound';
    outboundType = 'email';
    activityLabel = 'Email';
  } else if (typeValue === 'outbound_call') {
    activityType = 'outbound';
    outboundType = 'call';
    activityLabel = 'Call';
  } else if (typeValue === 'outbound_linkedin') {
    activityType = 'outbound';
    outboundType = 'linkedin';
    activityLabel = 'LinkedIn';
  } else if (typeValue === 'meeting') {
    activityType = 'meeting';
    activityLabel = 'Meeting';
  } else if (typeValue === 'proposal') {
    activityType = 'proposal';
    activityLabel = 'Proposal';
  } else if (typeValue === 'note') {
    activityType = 'note';
    activityLabel = 'Note';
  }

  // Pull deal/company for required activity fields (best effort)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, company, company_id, primary_contact_id, companies(name)')
    .eq('id', dealId)
    .single();

  const clientName =
    (deal as any)?.companies?.name ||
    (deal as any)?.company ||
    'Unknown';

  const salesRep = await getUserDisplayName(supabase, ctx.userId);

  // Insert activity
  const nowIso = new Date().toISOString();
  const { error: insertError } = await supabase
    .from('activities')
    .insert({
      user_id: ctx.userId,
      owner_id: ctx.userId,
      deal_id: dealId,
      company_id: (deal as any)?.company_id || null,
      contact_id: (deal as any)?.primary_contact_id || null,
      client_name: clientName,
      sales_rep: salesRep,
      type: activityType,
      outbound_type: outboundType,
      details: detailsValue || null,
      subject: detailsValue ? detailsValue.slice(0, 120) : `${activityLabel} logged via Slack`,
      date: nowIso,
      status: 'completed',
      priority: 'medium',
      quantity: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (insertError) {
    console.error('Failed to insert activity from Slack modal:', insertError);
    // Keep the modal open and show an inline error.
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          activity_details: 'Failed to save activity. Please try again.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!insertError && orgConnection?.botToken && meta.channelId) {
    const dealName = (deal as any)?.name || 'Deal';
    const message = buildDealActivityMessage({
      dealName,
      dealId,
      activityType: activityLabel,
      description: detailsValue || `${activityLabel} logged.`,
      createdBy: salesRep,
      slackUserId: payload.user.id,
      appUrl,
    } as DealActivityData);
    await postToChannel(orgConnection.botToken, meta.channelId, message);
  }

  // Close modal
  return new Response('', { status: 200, headers: corsHeaders });
}

// ============================================================================
// HITL (Human-in-the-Loop) Support
// ============================================================================

interface ParsedHITLAction {
  action: 'approve' | 'reject' | 'edit';
  resourceType: HITLResourceType;
  approvalId: string;
}

interface HITLApprovalRecord {
  id: string;
  org_id: string;
  user_id: string | null;
  created_by: string | null;
  resource_type: HITLResourceType;
  resource_id: string;
  resource_name: string | null;
  slack_team_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  slack_thread_ts: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'edited' | 'expired' | 'cancelled';
  original_content: Record<string, unknown>;
  edited_content: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  actioned_by: string | null;
  actioned_at: string | null;
  callback_type: 'edge_function' | 'webhook' | 'workflow' | null;
  callback_target: string | null;
  callback_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Parse HITL action ID
 * Format: {action}::{resource_type}::{approval_id}
 * Example: approve::email_draft::abc123
 */
function parseHITLActionId(actionId: string): ParsedHITLAction | null {
  const parts = actionId.split('::');
  if (parts.length !== 3) return null;

  const [action, resourceType, approvalId] = parts;

  if (!['approve', 'reject', 'edit'].includes(action)) return null;

  const validResourceTypes: HITLResourceType[] = [
    'email_draft', 'follow_up', 'task_list', 'summary',
    'meeting_notes', 'proposal_section', 'coaching_tip'
  ];
  if (!validResourceTypes.includes(resourceType as HITLResourceType)) return null;

  return {
    action: action as 'approve' | 'reject' | 'edit',
    resourceType: resourceType as HITLResourceType,
    approvalId,
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractFirstSlackCodeBlock(text: string): string | null {
  const start = text.indexOf('```');
  if (start === -1) return null;
  const end = text.indexOf('```', start + 3);
  if (end === -1) return null;
  return text.slice(start + 3, end).trim();
}

function isProbablySimulatedPlaceholderBody(body: string): boolean {
  const s = body.trim().toLowerCase();
  if (!s) return true;
  // Heuristic: common demo placeholders; keep broad to avoid regressions.
  return (
    (s.includes('simulated') && s.includes('draft') && s.length < 300) ||
    s === 'simulated email draft content' ||
    s === 'simulated draft content'
  );
}

/**
 * Best-effort: derive email draft fields from the Slack message blocks.
 * This is especially useful for demo/simulation flows where DB content may be placeholder.
 */
function deriveEmailDraftFromSlackMessage(message: any): { subject?: string; body?: string; recipient?: string } | null {
  const blocks = message?.blocks;
  if (!Array.isArray(blocks)) return null;

  let recipient: string | undefined;
  let subject: string | undefined;
  let body: string | undefined;

  for (const b of blocks) {
    const text = b?.text?.text;
    if (b?.type !== 'section' || !isNonEmptyString(text)) continue;

    // Case A: proactive simulator HITL message uses a code block with `Subject: ...` then the body.
    if (text.includes('```') && text.includes('Subject:')) {
      const code = extractFirstSlackCodeBlock(text);
      if (!code) continue;
      const lines = code.split('\n');
      const subjLine = lines.find((l) => l.trim().toLowerCase().startsWith('subject:'));
      if (subjLine) {
        subject = subjLine.replace(/^subject:\s*/i, '').trim() || subject;
      }
      // Body: everything after the first blank line following Subject line (or after Subject line)
      const subjIdx = lines.findIndex((l) => l.trim().toLowerCase().startsWith('subject:'));
      if (subjIdx !== -1) {
        const afterSubj = lines.slice(subjIdx + 1);
        const firstBlank = afterSubj.findIndex((l) => l.trim() === '');
        const bodyLines = firstBlank !== -1 ? afterSubj.slice(firstBlank + 1) : afterSubj;
        const candidateBody = bodyLines.join('\n').trim();
        if (candidateBody) body = candidateBody;
      }
    }

    // Case B: shared HITL builder uses separate *To:*, *Subject:*, *Message:* sections.
    if (text.startsWith('*To:*')) {
      const cand = text.replace(/^\*To:\*\s*/i, '').trim();
      if (cand) recipient = cand;
    }
    if (text.startsWith('*Subject:*')) {
      const cand = text.replace(/^\*Subject:\*\s*/i, '').trim();
      if (cand) subject = cand;
    }
    if (text.startsWith('*Message:*')) {
      const cand = text.replace(/^\*Message:\*\s*/i, '').trim();
      if (cand) body = cand;
    }
  }

  if (!recipient && !subject && !body) return null;
  return { recipient, subject, body };
}

/**
 * Validate that a HITL approval exists and is pending
 */
async function validateHITLApproval(
  supabase: ReturnType<typeof createClient>,
  approvalId: string,
  _userId?: string
): Promise<{ valid: boolean; approval?: HITLApprovalRecord; error?: string }> {
  const { data, error } = await supabase
    .from('hitl_pending_approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (error || !data) {
    return { valid: false, error: 'Approval not found' };
  }

  const approval = data as HITLApprovalRecord;

  if (approval.status !== 'pending') {
    return { valid: false, error: `Approval already ${approval.status}`, approval };
  }

  if (new Date(approval.expires_at) < new Date()) {
    return { valid: false, error: 'Approval has expired', approval };
  }

  return { valid: true, approval };
}

/**
 * Get resource type label for display
 */
function getResourceTypeLabel(resourceType: HITLResourceType): string {
  const labels: Record<HITLResourceType, string> = {
    email_draft: 'Email Draft',
    follow_up: 'Follow-up',
    task_list: 'Task List',
    summary: 'Summary',
    meeting_notes: 'Meeting Notes',
    proposal_section: 'Proposal Section',
    coaching_tip: 'Coaching Tip',
  };
  return labels[resourceType] || resourceType;
}

/**
 * Trigger callback after HITL action
 */
async function triggerHITLCallback(
  approval: HITLApprovalRecord,
  action: 'approved' | 'rejected' | 'edited',
  content: Record<string, unknown>
): Promise<void> {
  if (!approval.callback_type || !approval.callback_target) {
    console.log('No callback configured for approval:', approval.id);
    return;
  }

  const callbackPayload = {
    approval_id: approval.id,
    resource_type: approval.resource_type,
    resource_id: approval.resource_id,
    resource_name: approval.resource_name,
    action,
    content,
    original_content: approval.original_content,
    callback_metadata: approval.callback_metadata,
    actioned_at: new Date().toISOString(),
  };

  try {
    switch (approval.callback_type) {
      case 'edge_function': {
        // Call another Supabase edge function
        const functionUrl = `${supabaseUrl}/functions/v1/${approval.callback_target}`;
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(callbackPayload),
        });
        if (!response.ok) {
          console.error('Callback edge function failed:', await response.text());
        }
        break;
      }

      case 'webhook': {
        // Call external webhook URL
        const response = await fetch(approval.callback_target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(callbackPayload),
        });
        if (!response.ok) {
          console.error('Callback webhook failed:', await response.text());
        }
        break;
      }

      case 'workflow': {
        // Future: trigger internal workflow
        console.log('Workflow callback not yet implemented:', approval.callback_target);
        break;
      }
    }
  } catch (error) {
    console.error('Error triggering HITL callback:', error);
  }
}

/**
 * Log HITL action to integration_sync_logs
 */
async function logHITLAction(
  supabase: ReturnType<typeof createClient>,
  approval: HITLApprovalRecord,
  action: string,
  userId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase
      .from('integration_sync_logs')
      .insert({
        org_id: approval.org_id,
        integration_type: 'slack_hitl',
        sync_type: 'hitl_action',
        status: 'success',
        records_synced: 1,
        message: `HITL ${action}: ${approval.resource_type} - ${approval.resource_name || approval.resource_id}`,
        metadata: {
          approval_id: approval.id,
          resource_type: approval.resource_type,
          resource_id: approval.resource_id,
          action,
          actioned_by: userId,
          ...details,
        },
      });
  } catch (error) {
    console.error('Error logging HITL action:', error);
  }
}

/**
 * Handle notification frequency feedback (Smart Engagement Algorithm)
 * Processes bi-weekly feedback buttons: "Want more" / "Just right" / "Too many"
 */
async function handleNotificationFeedback(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Parse feedback from action_id: notification_feedback_more, notification_feedback_right, notification_feedback_less
  const feedbackMap: Record<string, { value: string; frequency: string; emoji: string; message: string }> = {
    'notification_feedback_more': {
      value: 'more',
      frequency: 'high',
      emoji: '🚀',
      message: "Got it! I'll send you more updates to keep you in the loop.",
    },
    'notification_feedback_right': {
      value: 'just_right',
      frequency: 'moderate',
      emoji: '👍',
      message: "Perfect! I'll keep the current frequency.",
    },
    'notification_feedback_less': {
      value: 'less',
      frequency: 'low',
      emoji: '🔕',
      message: "Understood! I'll dial back the notifications and only share the essentials.",
    },
  };

  const feedback = feedbackMap[action.action_id];
  if (!feedback) {
    console.error('Unknown notification feedback action_id:', action.action_id);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Record the feedback
    await supabase.from('notification_feedback').insert({
      user_id: ctx.userId,
      org_id: ctx.orgId,
      feedback_type: 'frequency_preference',
      feedback_value: feedback.value,
      feedback_source: 'slack_button',
    });

    // 2. Update user's preferred notification frequency
    await supabase
      .from('user_engagement_metrics')
      .update({
        preferred_notification_frequency: feedback.frequency,
        last_feedback_requested_at: new Date().toISOString(),
        notifications_since_last_feedback: 0,
      })
      .eq('user_id', ctx.userId);

    // 3. Log activity for engagement tracking
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: `notification_feedback_${feedback.value}`,
      actionCategory: 'notifications',
      metadata: {
        feedback_value: feedback.value,
        new_frequency: feedback.frequency,
      },
    });

    // 4. Update the original message to show confirmation
    if (payload.response_url) {
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: true,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${feedback.emoji} ${feedback.message}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '_You can always change this in Settings → Notifications_',
                },
              ],
            },
          ],
        }),
      });
    }

    console.log(`[Engagement] User ${ctx.userId} set notification preference to: ${feedback.frequency}`);
  } catch (error) {
    console.error('Error handling notification feedback:', error);

    // Send error ephemeral
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Something went wrong saving your preference. Please try again.' } }],
        text: 'Error saving preference',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle per-notification feedback (Smart Engagement Algorithm)
 * Processes thumbs up/down feedback on individual notifications
 */
async function handlePerNotificationFeedback(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse the feedback value
    let feedbackData: { notification_id?: string; feedback: string };
    try {
      feedbackData = JSON.parse(action.value || '{}');
    } catch {
      // Handle simple action_id based feedback
      feedbackData = {
        feedback: action.action_id === 'notification_helpful' ? 'helpful' : 'not_helpful',
      };
    }

    const { notification_id, feedback } = feedbackData;
    const isHelpful = feedback === 'helpful';

    // 1. Record the feedback
    await supabase.from('notification_feedback').insert({
      user_id: ctx.userId,
      org_id: ctx.orgId,
      feedback_type: 'per_notification',
      feedback_value: feedback,
      feedback_source: 'slack_button',
      triggered_by_notification_id: notification_id || null,
    });

    // 2. Adjust fatigue level based on feedback
    const fatigueAdjustment = isHelpful ? -5 : 10;
    await supabase.rpc('adjust_notification_fatigue', {
      p_user_id: ctx.userId,
      p_adjustment: fatigueAdjustment,
    });

    // 3. Update notification interaction if we have the ID
    if (notification_id) {
      await supabase
        .from('notification_interactions')
        .update({
          feedback_rating: feedback,
          feedback_at: new Date().toISOString(),
        })
        .eq('id', notification_id);
    }

    // 4. Log activity for engagement tracking
    await logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId || null,
      actionType: `notification_${feedback}`,
      actionCategory: 'notifications',
      metadata: {
        feedback_value: feedback,
        notification_id: notification_id || null,
      },
    });

    // 5. Send subtle confirmation (update the feedback buttons to show selected)
    if (payload.response_url) {
      const confirmationEmoji = isHelpful ? ':thumbsup:' : ':pray:';
      const confirmationText = isHelpful
        ? 'Thanks for the feedback!'
        : "Got it, I'll try to do better.";

      // Remove the feedback buttons and add a subtle confirmation
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: false,
          response_type: 'ephemeral',
          text: `${confirmationEmoji} ${confirmationText}`,
        }),
      });
    }

    console.log(`[Engagement] User ${ctx.userId} gave ${feedback} feedback on notification`);
  } catch (error) {
    console.error('Error handling per-notification feedback:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle HITL approve action
 */
async function handleHITLApprove(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  hitlAction: ParsedHITLAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  // Validate the approval
  const validation = await validateHITLApproval(supabase, hitlAction.approvalId);
  if (!validation.valid || !validation.approval) {
    return handleExpiredHITLApproval(supabase, payload, validation.approval, validation.error || 'Invalid approval');
  }

  const approval = validation.approval;

  // Process the approval action
  const { error: updateError } = await supabase.rpc('process_hitl_action', {
    p_approval_id: hitlAction.approvalId,
    p_action: 'approved',
    p_actioned_by: ctx?.userId || null,
    p_response: { slack_user_id: payload.user.id },
  });

  if (updateError) {
    console.error('Error processing HITL approve:', updateError);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to process approval. Please try again.' } }],
        text: 'Failed to process approval.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update the original Slack message
  if (payload.response_url) {
    const confirmationData: HITLActionedConfirmation = {
      action: 'approved',
      resourceType: hitlAction.resourceType,
      resourceName: approval.resource_name || getResourceTypeLabel(hitlAction.resourceType),
      slackUserId: payload.user.id,
      timestamp: new Date().toISOString(),
    };
    const confirmationMessage = buildHITLActionedConfirmation(confirmationData);
    await updateMessage(payload.response_url, confirmationMessage.blocks);
  }

  // Log the action
  await logHITLAction(supabase, approval, 'approved', ctx?.userId || payload.user.id);

  // Trigger callback
  await triggerHITLCallback(approval, 'approved', approval.original_content);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle HITL reject action
 */
async function handleHITLReject(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  hitlAction: ParsedHITLAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  // Validate the approval
  const validation = await validateHITLApproval(supabase, hitlAction.approvalId);
  if (!validation.valid || !validation.approval) {
    return handleExpiredHITLApproval(supabase, payload, validation.approval, validation.error || 'Invalid approval');
  }

  const approval = validation.approval;

  // Process the rejection
  const { error: updateError } = await supabase.rpc('process_hitl_action', {
    p_approval_id: hitlAction.approvalId,
    p_action: 'rejected',
    p_actioned_by: ctx?.userId || null,
    p_response: { slack_user_id: payload.user.id },
  });

  if (updateError) {
    console.error('Error processing HITL reject:', updateError);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to process rejection. Please try again.' } }],
        text: 'Failed to process rejection.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update the original Slack message
  if (payload.response_url) {
    const confirmationData: HITLActionedConfirmation = {
      action: 'rejected',
      resourceType: hitlAction.resourceType,
      resourceName: approval.resource_name || getResourceTypeLabel(hitlAction.resourceType),
      slackUserId: payload.user.id,
      timestamp: new Date().toISOString(),
    };
    const confirmationMessage = buildHITLActionedConfirmation(confirmationData);
    await updateMessage(payload.response_url, confirmationMessage.blocks);
  }

  // Log the action
  await logHITLAction(supabase, approval, 'rejected', ctx?.userId || payload.user.id);

  // Trigger callback (with original content since nothing was changed)
  await triggerHITLCallback(approval, 'rejected', approval.original_content);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build edit modal blocks based on resource type
 */
function buildHITLEditModalBlocks(
  resourceType: HITLResourceType,
  originalContent: Record<string, unknown>
): unknown[] {
  const blocks: unknown[] = [];

  switch (resourceType) {
    case 'email_draft':
      // Normalize recipient for the "To:" context line (supports multiple producer shapes).
      if (!originalContent.recipient && (originalContent.recipientEmail || originalContent.to)) {
        originalContent.recipient = (originalContent.recipientEmail as string) || (originalContent.to as string);
      }

      blocks.push(
        {
          type: 'input',
          block_id: 'subject',
          label: { type: 'plain_text', text: 'Subject' },
          element: {
            type: 'plain_text_input',
            action_id: 'subject_input',
            initial_value: (originalContent.subject as string) || '',
            placeholder: { type: 'plain_text', text: 'Email subject' },
          },
        },
        {
          type: 'input',
          block_id: 'body',
          label: { type: 'plain_text', text: 'Message' },
          element: {
            type: 'plain_text_input',
            action_id: 'body_input',
            multiline: true,
            initial_value: (originalContent.body as string) || (originalContent.content as string) || '',
            placeholder: { type: 'plain_text', text: 'Email body' },
          },
        }
      );
      if (originalContent.recipient) {
        blocks.unshift({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `*To:* ${originalContent.recipient}` }],
        });
      }
      break;

    case 'task_list':
      const tasks = Array.isArray(originalContent.tasks)
        ? (originalContent.tasks as string[]).join('\n')
        : (originalContent.body as string) || '';
      blocks.push({
        type: 'input',
        block_id: 'tasks',
        label: { type: 'plain_text', text: 'Tasks (one per line)' },
        element: {
          type: 'plain_text_input',
          action_id: 'tasks_input',
          multiline: true,
          initial_value: tasks,
          placeholder: { type: 'plain_text', text: 'Enter tasks, one per line' },
        },
      });
      break;

    case 'follow_up':
    case 'summary':
    case 'meeting_notes':
    case 'proposal_section':
    case 'coaching_tip':
    default:
      // Generic content editor
      blocks.push({
        type: 'input',
        block_id: 'content',
        label: { type: 'plain_text', text: 'Content' },
        element: {
          type: 'plain_text_input',
          action_id: 'content_input',
          multiline: true,
          initial_value: (originalContent.body as string) || (originalContent.content as string) || '',
          placeholder: { type: 'plain_text', text: 'Edit content...' },
        },
      });
      break;
  }

  // Add optional feedback field
  blocks.push({
    type: 'input',
    block_id: 'feedback',
    optional: true,
    label: { type: 'plain_text', text: 'Feedback (optional)' },
    element: {
      type: 'plain_text_input',
      action_id: 'feedback_input',
      multiline: true,
      placeholder: { type: 'plain_text', text: 'What should be improved in the future?' },
    },
  });

  return blocks;
}

/**
 * Handle HITL edit action - opens a modal for editing
 */
async function handleHITLEdit(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  hitlAction: ParsedHITLAction
): Promise<Response> {
  const triggerId = payload.trigger_id;

  if (!triggerId) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Unable to open edit dialog.' } }],
        text: 'Unable to open edit dialog.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate the approval
  const validation = await validateHITLApproval(supabase, hitlAction.approvalId);
  if (!validation.valid || !validation.approval) {
    return handleExpiredHITLApproval(supabase, payload, validation.approval, validation.error || 'Invalid approval');
  }

  const approval = validation.approval;

  // Get org connection for bot token
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection) {
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Slack is not connected for this workspace.' } }],
        text: 'Slack is not connected.',
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Use stored content by default, but for simulations/demos we can safely seed from the Slack message
  // so the modal shows the real draft body even if the DB stored a placeholder.
  let modalSeedContent: Record<string, unknown> = approval.original_content || {};
  if (hitlAction.resourceType === 'email_draft') {
    const derived = deriveEmailDraftFromSlackMessage(payload.message);
    if (derived) {
      const existingBody = isNonEmptyString(modalSeedContent.body) ? String(modalSeedContent.body).trim() : '';
      const derivedBody = isNonEmptyString(derived.body) ? derived.body.trim() : '';
      const shouldUseDerivedBody =
        isNonEmptyString(derivedBody) &&
        (!existingBody || isProbablySimulatedPlaceholderBody(existingBody) || derivedBody.length > existingBody.length);

      const existingSubject = isNonEmptyString(modalSeedContent.subject) ? String(modalSeedContent.subject).trim() : '';
      const derivedSubject = isNonEmptyString(derived.subject) ? derived.subject.trim() : '';
      const shouldUseDerivedSubject =
        isNonEmptyString(derivedSubject) &&
        (!existingSubject || derivedSubject.length > existingSubject.length);

      modalSeedContent = {
        ...modalSeedContent,
        ...(derived.recipient ? { recipient: derived.recipient } : {}),
        ...(shouldUseDerivedSubject ? { subject: derivedSubject } : {}),
        ...(shouldUseDerivedBody ? { body: derivedBody } : {}),
      };
    }
  }

  // Build modal blocks based on resource type
  const editBlocks = buildHITLEditModalBlocks(
    hitlAction.resourceType,
    modalSeedContent
  );

  const privateMetadata = JSON.stringify({
    approvalId: hitlAction.approvalId,
    resourceType: hitlAction.resourceType,
    channelId: payload.channel?.id,
    messageTs: payload.message?.ts,
    responseUrl: payload.response_url,
  });

  // Open the edit modal
  const modalResponse = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'hitl_edit_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: `Edit ${getResourceTypeLabel(hitlAction.resourceType)}`, emoji: true },
        submit: { type: 'plain_text', text: '✅ Save & Approve', emoji: true },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: editBlocks,
      },
    }),
  });

  const modalResult = await modalResponse.json();
  if (!modalResult.ok) {
    console.error('Failed to open HITL edit modal:', modalResult);
    if (payload.response_url) {
      await sendEphemeral(payload.response_url, {
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '❌ Failed to open edit dialog. Please try again.' } }],
        text: 'Failed to open edit dialog.',
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Extract edited content from modal submission based on resource type
 */
function extractEditedContent(
  resourceType: HITLResourceType,
  values: Record<string, Record<string, { value?: string }>>
): Record<string, unknown> {
  const editedContent: Record<string, unknown> = {};

  switch (resourceType) {
    case 'email_draft':
      editedContent.subject = values['subject']?.['subject_input']?.value || '';
      editedContent.body = values['body']?.['body_input']?.value || '';
      break;

    case 'task_list':
      const tasksText = values['tasks']?.['tasks_input']?.value || '';
      editedContent.tasks = tasksText.split('\n').filter((t: string) => t.trim());
      editedContent.body = tasksText;
      break;

    default:
      editedContent.content = values['content']?.['content_input']?.value || '';
      editedContent.body = editedContent.content;
      break;
  }

  return editedContent;
}

/**
 * Handle HITL edit modal submission
 */
async function handleHITLEditSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  let meta: {
    approvalId?: string;
    resourceType?: HITLResourceType;
    channelId?: string;
    messageTs?: string;
    responseUrl?: string;
  } = {};

  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    console.error('Failed to parse HITL edit modal metadata');
    return new Response('', { status: 200, headers: corsHeaders });
  }

  if (!meta.approvalId || !meta.resourceType) {
    console.error('Missing approval ID or resource type in HITL edit modal');
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Validate the approval is still valid
  const validation = await validateHITLApproval(supabase, meta.approvalId);
  if (!validation.valid || !validation.approval) {
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          content: validation.error || 'This approval is no longer valid.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const approval = validation.approval;
  const values = (payload.view?.state?.values || {}) as Record<string, Record<string, { value?: string }>>;

  // Extract edited content
  const editedContent = extractEditedContent(meta.resourceType, values);
  const feedback = values['feedback']?.['feedback_input']?.value || null;

  // Process the edit action
  const { error: updateError } = await supabase.rpc('process_hitl_action', {
    p_approval_id: meta.approvalId,
    p_action: 'edited',
    p_actioned_by: ctx?.userId || null,
    p_response: {
      slack_user_id: payload.user.id,
      feedback,
    },
    p_edited_content: editedContent,
  });

  if (updateError) {
    console.error('Error processing HITL edit submission:', updateError);
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          content: 'Failed to save changes. Please try again.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update the original message if we have the response URL
  if (meta.responseUrl) {
    const confirmationData: HITLActionedConfirmation = {
      action: 'edited',
      resourceType: meta.resourceType,
      resourceName: approval.resource_name || getResourceTypeLabel(meta.resourceType),
      slackUserId: payload.user.id,
      timestamp: new Date().toISOString(),
      editSummary: feedback || undefined,
    };
    const confirmationMessage = buildHITLActionedConfirmation(confirmationData);
    await updateMessage(meta.responseUrl, confirmationMessage.blocks);
  }

  // Log the action
  await logHITLAction(supabase, approval, 'edited', ctx?.userId || payload.user.id, { feedback });

  // Trigger callback with edited content
  await triggerHITLCallback(approval, 'edited', editedContent);

  // Close the modal
  return new Response('', { status: 200, headers: corsHeaders });
}

// ============================================================================
// Message Shortcut: Create Task from Message
// ============================================================================

/**
 * Handle "Create task from message" shortcut
 * Opens a modal pre-filled with the message text as task title
 */
async function handleCreateTaskFromMessage(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const triggerId = payload.trigger_id;

  if (!triggerId) {
    console.error('No trigger_id for message shortcut');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    // Open a simple modal explaining they need to link their account
    const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
    if (orgConnection?.botToken) {
      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            title: { type: 'plain_text', text: 'Account Not Linked' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ Your Slack account is not linked to Sixty.\n\nPlease contact your admin to set up the mapping, or visit Sixty settings to connect your Slack account.',
                },
              },
            ],
          },
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Extract message details
  const messageText = payload.message?.text || '';
  const messageTs = payload.message?.ts || '';
  const channelId = payload.channel?.id || '';

  // Build Slack permalink for backlink
  const teamDomain = payload.team?.domain || '';
  const slackPermalink = channelId && messageTs
    ? `https://${teamDomain}.slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`
    : null;

  // Truncate message for title (max 100 chars)
  const suggestedTitle = messageText.length > 100
    ? messageText.substring(0, 97) + '...'
    : messageText;

  // Fetch user's deals for optional association
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name')
    .eq('user_id', ctx.userId)
    .in('status', ['discovery', 'qualification', 'proposal', 'negotiation'])
    .order('updated_at', { ascending: false })
    .limit(20);

  const dealOptions = (deals || []).map((deal: { id: string; name: string }) => ({
    text: { type: 'plain_text', text: deal.name.substring(0, 75) },
    value: deal.id,
  }));

  const privateMetadata = JSON.stringify({
    channelId,
    messageTs,
    slackPermalink,
    orgId: orgConnection.orgId,
  });

  // Build modal blocks
  const modalBlocks: unknown[] = [
    {
      type: 'input',
      block_id: 'task_title',
      label: { type: 'plain_text', text: 'Task Title' },
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        initial_value: suggestedTitle,
        placeholder: { type: 'plain_text', text: 'What needs to be done?' },
      },
    },
    {
      type: 'input',
      block_id: 'task_notes',
      optional: true,
      label: { type: 'plain_text', text: 'Notes' },
      element: {
        type: 'plain_text_input',
        action_id: 'notes_input',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'Additional context...' },
      },
    },
    {
      type: 'input',
      block_id: 'due_date',
      label: { type: 'plain_text', text: 'Due' },
      element: {
        type: 'static_select',
        action_id: 'due_select',
        initial_option: { text: { type: 'plain_text', text: 'In 3 days' }, value: '3' },
        options: [
          { text: { type: 'plain_text', text: 'Today' }, value: '0' },
          { text: { type: 'plain_text', text: 'Tomorrow' }, value: '1' },
          { text: { type: 'plain_text', text: 'In 3 days' }, value: '3' },
          { text: { type: 'plain_text', text: 'In 1 week' }, value: '7' },
          { text: { type: 'plain_text', text: 'In 2 weeks' }, value: '14' },
        ],
      },
    },
  ];

  // Add deal selector if user has deals
  if (dealOptions.length > 0) {
    modalBlocks.push({
      type: 'input',
      block_id: 'deal_association',
      optional: true,
      label: { type: 'plain_text', text: 'Link to Deal (optional)' },
      element: {
        type: 'static_select',
        action_id: 'deal_select',
        placeholder: { type: 'plain_text', text: 'Select a deal...' },
        options: dealOptions,
      },
    });
  }

  // Add context about the source message
  if (slackPermalink) {
    modalBlocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `📎 Task will include a link back to the <${slackPermalink}|original message>` },
      ],
    });
  }

  // Open the modal
  const modalResponse = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'create_task_from_message_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: 'Create Task' },
        submit: { type: 'plain_text', text: 'Create Task' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: modalBlocks,
      },
    }),
  });

  const modalResult = await modalResponse.json();
  if (!modalResult.ok) {
    console.error('Failed to open create task modal:', modalResult);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle submission of "Create task from message" modal
 */
async function handleCreateTaskFromMessageSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: {
    channelId?: string;
    messageTs?: string;
    slackPermalink?: string;
    orgId?: string;
  } = {};

  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    console.error('Failed to parse create task modal metadata');
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = (payload.view?.state?.values || {}) as Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>;

  const title = values['task_title']?.['title_input']?.value || 'Task from Slack';
  const notes = values['task_notes']?.['notes_input']?.value || '';
  const dueInDays = parseInt(values['due_date']?.['due_select']?.selected_option?.value || '3', 10);
  const dealId = values['deal_association']?.['deal_select']?.selected_option?.value || null;

  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueInDays);

  // Build description with Slack backlink
  let description = notes;
  if (meta.slackPermalink) {
    description = notes
      ? `${notes}\n\n---\n📎 Created from Slack message: ${meta.slackPermalink}`
      : `📎 Created from Slack message: ${meta.slackPermalink}`;
  }

  // Create the task
  const { data: task, error: insertError } = await supabase
    .from('tasks')
    .insert({
      title,
      description: description || null,
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
      deal_id: dealId,
      due_date: dueDate.toISOString(),
      status: 'pending',
      source: 'slack_message_shortcut',
      metadata: {
        source: 'slack_message_shortcut',
        slack_channel_id: meta.channelId,
        slack_message_ts: meta.messageTs,
        slack_permalink: meta.slackPermalink,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to create task from message shortcut:', insertError);
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          task_title: 'Failed to create task. Please try again.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log activity for Smart Engagement Algorithm
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'create_task_from_message',
    actionCategory: 'tasks',
    entityType: dealId ? 'deal' : 'task',
    entityId: dealId || task?.id,
    metadata: {
      source: 'slack_message_shortcut',
      task_title: title,
      has_deal: !!dealId,
    },
  });

  // Post ephemeral confirmation in the channel
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && meta.channelId) {
    const taskUrl = `${appUrl}/tasks/${task?.id}`;
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: meta.channelId,
        user: payload.user.id,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Task created: *${title}*\n📅 Due ${dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'View in Sixty', emoji: true },
              url: taskUrl,
              action_id: 'view_task_in_sixty',
            },
          },
        ],
        text: `Task created: ${title}`,
      }),
    });
  }

  // Close the modal
  return new Response('', { status: 200, headers: corsHeaders });
}

// ============================================================================
// PHASE 3: Message Shortcut Handlers
// ============================================================================

/**
 * Handle "Summarize thread" message shortcut
 * Fetches thread replies and generates an AI summary
 */
async function handleSummarizeThread(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const messageText = payload.message?.text || '';

  if (!triggerId) {
    console.error('No trigger_id for summarize thread shortcut');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  const orgConnection = await getSlackOrgConnection(supabase, teamId);

  if (!ctx || !orgConnection?.botToken) {
    // Show error modal
    if (orgConnection?.botToken) {
      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            title: { type: 'plain_text', text: 'Account Not Linked' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ Your Slack account is not linked to Sixty.\n\nPlease contact your admin or visit Sixty settings to connect.',
                },
              },
            ],
          },
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Show loading modal
  const loadingModalRes = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'summarize_thread_modal',
        title: { type: 'plain_text', text: '📝 Summarizing...', emoji: true },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⏳ Analyzing the conversation...\n\nThis may take a few seconds.',
            },
          },
        ],
      },
    }),
  });

  const loadingModalData = await loadingModalRes.json();
  const viewId = loadingModalData?.view?.id;

  // Fetch thread replies if this is a thread parent
  let threadContent = messageText;
  let replyCount = 0;

  if (channelId && messageTs) {
    try {
      const repliesRes = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${messageTs}&limit=50`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
        },
      });
      const repliesData = await repliesRes.json();

      if (repliesData.ok && repliesData.messages?.length > 1) {
        replyCount = repliesData.messages.length - 1;
        threadContent = repliesData.messages
          .map((msg: { text?: string; user?: string }) => msg.text || '')
          .join('\n\n---\n\n');
      }
    } catch (err) {
      console.error('Failed to fetch thread replies:', err);
    }
  }

  // Generate summary using AI
  let summary = '';
  let keyPoints: string[] = [];
  let actionItems: string[] = [];

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that summarizes Slack conversations. Provide a concise summary with key points and action items. Output JSON with this structure: { "summary": "2-3 sentence overview", "keyPoints": ["point1", "point2"], "actionItems": ["action1", "action2"] }`,
            },
            {
              role: 'user',
              content: `Summarize this Slack conversation:\n\n${threadContent.substring(0, 4000)}`,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      try {
        const parsed = JSON.parse(content);
        summary = parsed.summary || 'Unable to generate summary.';
        keyPoints = parsed.keyPoints || [];
        actionItems = parsed.actionItems || [];
      } catch {
        summary = content || 'Unable to generate summary.';
      }
    } else {
      // Fallback: Simple extractive summary
      const sentences = threadContent.split(/[.!?]+/).filter((s: string) => s.trim().length > 10);
      summary = sentences.slice(0, 3).join('. ').trim() + '.';
      if (summary.length < 20) {
        summary = threadContent.substring(0, 200) + (threadContent.length > 200 ? '...' : '');
      }
    }
  } catch (err) {
    console.error('AI summary error:', err);
    summary = 'Unable to generate summary. Please try again.';
  }

  // Build summary blocks
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📝 Thread Summary', emoji: true },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: replyCount > 0 ? `Summarized ${replyCount + 1} messages` : 'Summarized 1 message' },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary*\n${summary}`,
      },
    },
  ];

  if (keyPoints.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Key Points*\n${keyPoints.map((p: string) => `• ${p}`).join('\n')}`,
      },
    });
  }

  if (actionItems.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action Items*\n${actionItems.map((a: string) => `☐ ${a}`).join('\n')}`,
      },
    });

    // Add button to create tasks from action items
    const actionData = JSON.stringify({
      channelId,
      messageTs,
      actionItems,
    });

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '➕ Create Tasks from Action Items', emoji: true },
          action_id: 'create_tasks_from_summary',
          value: actionData,
          style: 'primary',
        },
      ],
    });
  }

  // Update modal with summary
  if (viewId) {
    await fetch('https://slack.com/api/views.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        view_id: viewId,
        view: {
          type: 'modal',
          callback_id: 'summarize_thread_modal',
          title: { type: 'plain_text', text: '📝 Summary', emoji: true },
          close: { type: 'plain_text', text: 'Close' },
          blocks,
        },
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'summarize_thread',
    actionCategory: 'ai_assist',
    entityType: 'thread',
    entityId: messageTs || null,
    metadata: {
      source: 'slack_message_shortcut',
      reply_count: replyCount,
      has_action_items: actionItems.length > 0,
    },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Log activity" message shortcut
 * Opens a modal to log an activity linked to a contact/deal
 */
async function handleLogActivityFromMessage(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const messageText = payload.message?.text || '';

  if (!triggerId) {
    console.error('No trigger_id for log activity shortcut');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  const orgConnection = await getSlackOrgConnection(supabase, teamId);

  if (!ctx || !orgConnection?.botToken) {
    if (orgConnection?.botToken) {
      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            title: { type: 'plain_text', text: 'Account Not Linked' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ Your Slack account is not linked to Sixty.',
                },
              },
            ],
          },
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build permalink for backlink
  const teamDomain = payload.team?.domain || '';
  const slackPermalink = channelId && messageTs
    ? `https://${teamDomain}.slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`
    : null;

  // Fetch user's active deals for selector
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name, company')
    .eq('user_id', ctx.userId)
    .in('status', ['discovery', 'qualification', 'proposal', 'negotiation'])
    .order('updated_at', { ascending: false })
    .limit(50);

  // Fetch user's recent contacts for selector
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, name, email, company')
    .eq('user_id', ctx.userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  // Pre-populate notes with message snippet
  const truncatedMessage = messageText.length > 200
    ? messageText.substring(0, 197) + '...'
    : messageText;

  // Build modal
  const dealOptions = (deals || []).map((d: { id: string; name: string; company?: string }) => ({
    text: { type: 'plain_text' as const, text: d.company ? `${d.name} (${d.company})` : d.name },
    value: d.id,
  }));

  const contactOptions = (contacts || []).map((c: { id: string; name: string; company?: string }) => ({
    text: { type: 'plain_text' as const, text: c.company ? `${c.name} (${c.company})` : c.name },
    value: c.id,
  }));

  const blocks: unknown[] = [
    {
      type: 'input',
      block_id: 'activity_type',
      label: { type: 'plain_text', text: 'Activity Type' },
      element: {
        type: 'static_select',
        action_id: 'type_select',
        placeholder: { type: 'plain_text', text: 'Select activity type' },
        initial_option: { text: { type: 'plain_text', text: 'Note' }, value: 'note' },
        options: [
          { text: { type: 'plain_text', text: 'Call' }, value: 'call' },
          { text: { type: 'plain_text', text: 'Email' }, value: 'email' },
          { text: { type: 'plain_text', text: 'Meeting' }, value: 'meeting' },
          { text: { type: 'plain_text', text: 'Note' }, value: 'note' },
          { text: { type: 'plain_text', text: 'Message' }, value: 'message' },
        ],
      },
    },
    {
      type: 'input',
      block_id: 'activity_notes',
      label: { type: 'plain_text', text: 'Notes' },
      element: {
        type: 'plain_text_input',
        action_id: 'notes_input',
        multiline: true,
        initial_value: truncatedMessage,
        placeholder: { type: 'plain_text', text: 'Add notes about this activity...' },
      },
    },
  ];

  // Add deal selector if deals exist
  if (dealOptions.length > 0) {
    blocks.push({
      type: 'input',
      block_id: 'deal_link',
      optional: true,
      label: { type: 'plain_text', text: 'Link to Deal' },
      element: {
        type: 'static_select',
        action_id: 'deal_select',
        placeholder: { type: 'plain_text', text: 'Select a deal (optional)' },
        options: dealOptions,
      },
    });
  }

  // Add contact selector if contacts exist
  if (contactOptions.length > 0) {
    blocks.push({
      type: 'input',
      block_id: 'contact_link',
      optional: true,
      label: { type: 'plain_text', text: 'Link to Contact' },
      element: {
        type: 'static_select',
        action_id: 'contact_select',
        placeholder: { type: 'plain_text', text: 'Select a contact (optional)' },
        options: contactOptions,
      },
    });
  }

  // Open modal
  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'log_activity_from_message_modal',
        private_metadata: JSON.stringify({
          channelId,
          messageTs,
          slackPermalink,
          orgId: ctx.orgId,
        }),
        title: { type: 'plain_text', text: 'Log Activity' },
        submit: { type: 'plain_text', text: 'Log Activity' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks,
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle submission of "Log activity from message" modal
 */
async function handleLogActivityFromMessageSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: {
    channelId?: string;
    messageTs?: string;
    slackPermalink?: string;
    orgId?: string;
  } = {};

  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    console.error('Failed to parse log activity modal metadata');
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = (payload.view?.state?.values || {}) as Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>;

  const activityType = values['activity_type']?.['type_select']?.selected_option?.value || 'note';
  const notes = values['activity_notes']?.['notes_input']?.value || '';
  const dealId = values['deal_link']?.['deal_select']?.selected_option?.value || null;
  const contactId = values['contact_link']?.['contact_select']?.selected_option?.value || null;

  // Build description with Slack backlink
  let description = notes;
  if (meta.slackPermalink) {
    description = notes
      ? `${notes}\n\n---\n📎 Logged from Slack: ${meta.slackPermalink}`
      : `📎 Logged from Slack: ${meta.slackPermalink}`;
  }

  // Create the activity
  const { error: insertError } = await supabase
    .from('activities')
    .insert({
      user_id: ctx.userId,
      ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
      activity_type: activityType,
      title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} logged from Slack`,
      description: description || null,
      deal_id: dealId,
      contact_id: contactId,
      activity_date: new Date().toISOString(),
      metadata: {
        source: 'slack_message_shortcut',
        slack_channel_id: meta.channelId,
        slack_message_ts: meta.messageTs,
        slack_permalink: meta.slackPermalink,
      },
    });

  if (insertError) {
    console.error('Failed to create activity from message shortcut:', insertError);
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          activity_notes: 'Failed to log activity. Please try again.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'log_activity_from_message',
    actionCategory: 'activities',
    entityType: dealId ? 'deal' : (contactId ? 'contact' : 'activity'),
    entityId: dealId || contactId || null,
    metadata: {
      source: 'slack_message_shortcut',
      activity_type: activityType,
      has_deal: !!dealId,
      has_contact: !!contactId,
    },
  });

  // Post ephemeral confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && meta.channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: meta.channelId,
        user: payload.user.id,
        text: `✅ Activity logged: ${activityType}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *${activityType.charAt(0).toUpperCase() + activityType.slice(1)}* logged successfully${dealId ? ' and linked to deal' : ''}${contactId ? ' and linked to contact' : ''}.`,
            },
          },
        ],
      }),
    });
  }

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle "Draft reply" message shortcut
 * Generates AI-suggested reply with HITL approve/edit flow
 */
async function handleDraftReply(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;
  const messageTs = payload.message?.ts;
  const messageText = payload.message?.text || '';

  if (!triggerId) {
    console.error('No trigger_id for draft reply shortcut');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  const orgConnection = await getSlackOrgConnection(supabase, teamId);

  if (!ctx || !orgConnection?.botToken) {
    if (orgConnection?.botToken) {
      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: {
            type: 'modal',
            title: { type: 'plain_text', text: 'Account Not Linked' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ Your Slack account is not linked to Sixty.',
                },
              },
            ],
          },
        }),
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Show loading modal
  const loadingModalRes = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'draft_reply_modal',
        title: { type: 'plain_text', text: '✍️ Drafting...', emoji: true },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '⏳ Generating reply suggestion...\n\nThis may take a few seconds.',
            },
          },
        ],
      },
    }),
  });

  const loadingModalData = await loadingModalRes.json();
  const viewId = loadingModalData?.view?.id;

  // Fetch thread context for better reply
  let threadContext = messageText;
  if (channelId && messageTs) {
    try {
      const repliesRes = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${messageTs}&limit=10`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
        },
      });
      const repliesData = await repliesRes.json();

      if (repliesData.ok && repliesData.messages?.length > 0) {
        threadContext = repliesData.messages
          .slice(-5) // Last 5 messages for context
          .map((msg: { text?: string }) => msg.text || '')
          .join('\n\n');
      }
    } catch (err) {
      console.error('Failed to fetch thread context:', err);
    }
  }

  // Get user's profile for personalization
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', ctx.userId)
    .maybeSingle();

  // Generate reply draft using AI
  let draftReply = '';

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (openaiKey) {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant drafting Slack message replies. Write professional but friendly responses. Keep replies concise (2-4 sentences). The user's name is ${profile?.full_name || 'the user'}.`,
            },
            {
              role: 'user',
              content: `Draft a reply to this Slack conversation:\n\n${threadContext.substring(0, 2000)}\n\nThe reply should be helpful and continue the conversation naturally.`,
            },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      const aiData = await aiRes.json();
      draftReply = aiData.choices?.[0]?.message?.content || '';
    }

    if (!draftReply) {
      draftReply = 'Thanks for the message! I\'ll take a look and get back to you shortly.';
    }
  } catch (err) {
    console.error('AI draft reply error:', err);
    draftReply = 'Thanks for the message! I\'ll take a look and get back to you shortly.';
  }

  // Build modal with editable draft
  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Original Message:*',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: messageText.length > 300 ? messageText.substring(0, 297) + '...' : messageText,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'input',
      block_id: 'reply_text',
      label: { type: 'plain_text', text: 'Your Reply' },
      element: {
        type: 'plain_text_input',
        action_id: 'reply_input',
        multiline: true,
        initial_value: draftReply,
        placeholder: { type: 'plain_text', text: 'Edit your reply...' },
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '💡 Edit the draft above, then click "Send Reply" or "Copy to Clipboard".' },
      ],
    },
  ];

  // Update modal with draft
  if (viewId) {
    await fetch('https://slack.com/api/views.update', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        view_id: viewId,
        view: {
          type: 'modal',
          callback_id: 'draft_reply_submit_modal',
          private_metadata: JSON.stringify({
            channelId,
            messageTs,
            threadTs: messageTs, // Reply in thread
          }),
          title: { type: 'plain_text', text: '✍️ Draft Reply', emoji: true },
          submit: { type: 'plain_text', text: 'Send Reply' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks,
        },
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'draft_reply',
    actionCategory: 'ai_assist',
    entityType: 'message',
    entityId: messageTs || null,
    metadata: {
      source: 'slack_message_shortcut',
      ai_generated: true,
    },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle submission of "Draft reply" modal - sends the reply
 */
async function handleDraftReplySubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: {
    channelId?: string;
    messageTs?: string;
    threadTs?: string;
  } = {};

  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    console.error('Failed to parse draft reply modal metadata');
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = (payload.view?.state?.values || {}) as Record<string, Record<string, { value?: string }>>;
  const replyText = values['reply_text']?.['reply_input']?.value || '';

  if (!replyText.trim()) {
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          reply_text: 'Reply cannot be empty.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection?.botToken || !meta.channelId) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Send the reply as the user (using chat.postMessage with the bot, mentioning it's from user)
  // Note: We can't post as the user without their token, so we post as the bot with attribution
  const sendRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: meta.channelId,
      thread_ts: meta.threadTs, // Reply in thread
      text: replyText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: replyText,
          },
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `_Sent via Sixty by <@${payload.user.id}>_` },
          ],
        },
      ],
    }),
  });

  const sendData = await sendRes.json();

  if (!sendData.ok) {
    console.error('Failed to send reply:', sendData.error);
    return new Response(
      JSON.stringify({
        response_action: 'errors',
        errors: {
          reply_text: 'Failed to send reply. Please try again.',
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'send_drafted_reply',
    actionCategory: 'communication',
    entityType: 'message',
    entityId: sendData.ts || null,
    metadata: {
      source: 'slack_message_shortcut',
      in_thread: !!meta.threadTs,
    },
  });

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle "Create tasks from summary" button
 */
async function handleCreateTasksFromSummary(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let actionData: {
    channelId?: string;
    messageTs?: string;
    actionItems?: string[];
  } = {};

  try {
    actionData = JSON.parse(action.value);
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const actionItems = actionData.actionItems || [];
  if (actionItems.length === 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build permalink for backlink
  const teamDomain = payload.team?.domain || '';
  const slackPermalink = actionData.channelId && actionData.messageTs
    ? `https://${teamDomain}.slack.com/archives/${actionData.channelId}/p${actionData.messageTs.replace('.', '')}`
    : null;

  // Create tasks for each action item
  const tasksToInsert = actionItems.map((item: string, index: number) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3 + index); // Stagger due dates

    return {
      title: item.length > 100 ? item.substring(0, 97) + '...' : item,
      description: slackPermalink ? `📎 From thread summary: ${slackPermalink}` : null,
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
      due_date: dueDate.toISOString(),
      status: 'pending',
      source: 'slack_thread_summary',
      metadata: {
        source: 'slack_thread_summary',
        slack_channel_id: actionData.channelId,
        slack_message_ts: actionData.messageTs,
        slack_permalink: slackPermalink,
      },
    };
  });

  const { error: insertError } = await supabase
    .from('tasks')
    .insert(tasksToInsert);

  if (insertError) {
    console.error('Failed to create tasks from summary:', insertError);
  }

  // Post confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && payload.channel?.id) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: payload.channel.id,
        user: payload.user.id,
        text: `✅ Created ${actionItems.length} tasks from action items`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Created *${actionItems.length} tasks* from summary action items.\n\nView them in Sixty to manage and assign.`,
            },
          },
        ],
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'create_tasks_from_summary',
    actionCategory: 'tasks',
    entityType: 'task',
    entityId: null,
    metadata: {
      source: 'slack_thread_summary',
      task_count: actionItems.length,
    },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// PHASE 4: Task Action Handlers
// ============================================================================

/**
 * Handle task complete button
 */
async function handleTaskComplete(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let taskData: { taskId?: string } = {};
  try {
    taskData = JSON.parse(action.value);
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!taskData.taskId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update task status
  const { data: task, error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskData.taskId)
    .eq('assigned_to', ctx.userId)
    .select('id, title')
    .single();

  if (error || !task) {
    console.error('Failed to complete task:', error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Send ephemeral confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && payload.channel?.id) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: payload.channel.id,
        user: payload.user.id,
        text: `✅ Task completed: ${task.title}`,
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'task_complete',
    actionCategory: 'tasks',
    entityType: 'task',
    entityId: taskData.taskId,
    metadata: { task_title: task.title },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task snooze button
 */
async function handleTaskSnooze(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  days: number
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let taskData: { taskId?: string } = {};
  try {
    taskData = JSON.parse(action.value);
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!taskData.taskId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Calculate new due date
  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + days);
  newDueDate.setHours(17, 0, 0, 0); // End of business day

  // Update task
  const { data: task, error } = await supabase
    .from('tasks')
    .update({ due_date: newDueDate.toISOString() })
    .eq('id', taskData.taskId)
    .eq('assigned_to', ctx.userId)
    .select('id, title')
    .single();

  if (error || !task) {
    console.error('Failed to snooze task:', error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const dueDateStr = newDueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Send ephemeral confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && payload.channel?.id) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: payload.channel.id,
        user: payload.user.id,
        text: `⏰ Task snoozed to ${dueDateStr}: ${task.title}`,
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: `task_snooze_${days}d`,
    actionCategory: 'tasks',
    entityType: 'task',
    entityId: taskData.taskId,
    metadata: { task_title: task.title, snooze_days: days },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task edit button - opens edit modal
 */
async function handleTaskEdit(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const triggerId = payload.trigger_id;
  if (!triggerId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let taskData: { taskId?: string } = {};
  try {
    taskData = JSON.parse(action.value);
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!taskData.taskId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get task details
  const { data: task } = await supabase
    .from('tasks')
    .select('id, title, description, due_date')
    .eq('id', taskData.taskId)
    .eq('assigned_to', ctx.userId)
    .single();

  if (!task) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Open edit modal
  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'edit_task_modal',
        private_metadata: JSON.stringify({ taskId: task.id, channelId: payload.channel?.id }),
        title: { type: 'plain_text', text: 'Edit Task' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'input',
            block_id: 'task_title',
            label: { type: 'plain_text', text: 'Task' },
            element: {
              type: 'plain_text_input',
              action_id: 'title_input',
              initial_value: task.title,
            },
          },
          {
            type: 'input',
            block_id: 'task_description',
            label: { type: 'plain_text', text: 'Description' },
            optional: true,
            element: {
              type: 'plain_text_input',
              action_id: 'description_input',
              multiline: true,
              initial_value: task.description || '',
            },
          },
          {
            type: 'input',
            block_id: 'task_due_date',
            label: { type: 'plain_text', text: 'Due Date' },
            optional: true,
            element: {
              type: 'datepicker',
              action_id: 'due_date_input',
              initial_date: task.due_date ? task.due_date.split('T')[0] : undefined,
            },
          },
        ],
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task overflow menu
 */
async function handleTaskOverflow(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const selectedOption = action.value; // format: "action:taskId"
  const [overflowAction, taskId] = selectedOption.split(':');

  if (!taskId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);

  switch (overflowAction) {
    case 'complete': {
      await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('assigned_to', ctx.userId);

      if (orgConnection?.botToken && payload.channel?.id) {
        await fetch('https://slack.com/api/chat.postEphemeral', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: payload.channel.id,
            user: payload.user.id,
            text: '✅ Task completed!',
          }),
        });
      }
      break;
    }
    case 'snooze_1d':
    case 'snooze_1w': {
      const days = overflowAction === 'snooze_1d' ? 1 : 7;
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + days);
      newDueDate.setHours(17, 0, 0, 0);

      await supabase
        .from('tasks')
        .update({ due_date: newDueDate.toISOString() })
        .eq('id', taskId)
        .eq('assigned_to', ctx.userId);

      const dueDateStr = newDueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (orgConnection?.botToken && payload.channel?.id) {
        await fetch('https://slack.com/api/chat.postEphemeral', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: payload.channel.id,
            user: payload.user.id,
            text: `⏰ Task snoozed to ${dueDateStr}`,
          }),
        });
      }
      break;
    }
    case 'log_activity': {
      // Similar to existing log activity modal but for task
      if (orgConnection?.botToken && payload.trigger_id) {
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, deal_id')
          .eq('id', taskId)
          .single();

        await fetch('https://slack.com/api/views.open', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: 'modal',
              callback_id: 'log_activity_modal',
              private_metadata: JSON.stringify({
                dealId: task?.deal_id,
                taskId: taskId,
                source: 'task_overflow',
              }),
              title: { type: 'plain_text', text: 'Log Activity' },
              submit: { type: 'plain_text', text: 'Log' },
              close: { type: 'plain_text', text: 'Cancel' },
              blocks: [
                {
                  type: 'input',
                  block_id: 'activity_type',
                  label: { type: 'plain_text', text: 'Activity Type' },
                  element: {
                    type: 'static_select',
                    action_id: 'activity_type_select',
                    options: [
                      { text: { type: 'plain_text', text: 'Call' }, value: 'call' },
                      { text: { type: 'plain_text', text: 'Email' }, value: 'email' },
                      { text: { type: 'plain_text', text: 'Meeting' }, value: 'meeting' },
                      { text: { type: 'plain_text', text: 'Note' }, value: 'note' },
                    ],
                    initial_option: { text: { type: 'plain_text', text: 'Note' }, value: 'note' },
                  },
                },
                {
                  type: 'input',
                  block_id: 'activity_notes',
                  label: { type: 'plain_text', text: 'Notes' },
                  element: {
                    type: 'plain_text_input',
                    action_id: 'notes_input',
                    multiline: true,
                    initial_value: task?.title ? `Completed task: ${task.title}` : '',
                  },
                },
              ],
            },
          }),
        });
      }
      break;
    }
    case 'convert_followup': {
      // Trigger follow-up flow
      if (orgConnection?.botToken && payload.channel?.id) {
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, deal_id, deals ( id, name )')
          .eq('id', taskId)
          .single();

        const dealName = (task as any)?.deals?.name || '';
        await fetch('https://slack.com/api/chat.postEphemeral', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: payload.channel.id,
            user: payload.user.id,
            text: dealName
              ? `💬 To draft a follow-up, use: \`/sixty follow-up ${dealName}\``
              : '💬 To draft a follow-up, use: `/sixty follow-up [person or company]`',
          }),
        });
      }
      break;
    }
    case 'view': {
      // Just acknowledge - the button link handles navigation
      break;
    }
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: `task_overflow_${overflowAction}`,
    actionCategory: 'tasks',
    entityType: 'task',
    entityId: taskId,
    metadata: {},
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task filter buttons (re-fetch task list with filter)
 */
async function handleTaskFilter(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const filter = action.action_id.replace('task_filter_', '');
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let query = supabase
    .from('tasks')
    .select('id, title, status, due_date, deals ( name )')
    .eq('assigned_to', ctx.userId)
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false });

  if (filter === 'overdue') {
    query = query.lt('due_date', todayStart.toISOString());
  } else if (filter === 'today') {
    query = query.gte('due_date', todayStart.toISOString()).lte('due_date', todayEnd.toISOString());
  } else if (filter === 'week') {
    query = query.gte('due_date', todayStart.toISOString()).lte('due_date', weekEnd.toISOString());
  }

  const { data: tasks } = await query.limit(10);

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection?.botToken || !payload.response_url) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build task list blocks
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Tasks - ${filter.charAt(0).toUpperCase() + filter.slice(1)}` },
    },
  ];

  if (!tasks || tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `No ${filter} tasks found.` },
    });
  } else {
    tasks.forEach((task: any) => {
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const isOverdue = dueDate && dueDate < now;
      let dueDateStr = 'No due date';
      if (dueDate) {
        const taskDate = new Date(dueDate);
        taskDate.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (taskDate.getTime() === today.getTime()) {
          dueDateStr = 'Today';
        } else if (taskDate.getTime() === tomorrow.getTime()) {
          dueDateStr = 'Tomorrow';
        } else {
          dueDateStr = dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
      }

      const dealInfo = task.deals?.name ? ` • ${task.deals.name}` : '';
      const overdueEmoji = isOverdue ? ' :warning:' : '';

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:white_circle: *${task.title}*\n${dueDateStr}${overdueEmoji}${dealInfo}`,
        },
        accessory: {
          type: 'overflow',
          action_id: 'task_overflow',
          options: [
            { text: { type: 'plain_text', text: 'Complete' }, value: `complete:${task.id}` },
            { text: { type: 'plain_text', text: 'Snooze 1 day' }, value: `snooze_1d:${task.id}` },
            { text: { type: 'plain_text', text: 'Snooze 1 week' }, value: `snooze_1w:${task.id}` },
          ],
        },
      });
    });
  }

  // Add filter buttons
  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Overdue' },
          action_id: 'task_filter_overdue',
          ...(filter === 'overdue' ? { style: 'primary' } : {}),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Today' },
          action_id: 'task_filter_today',
          ...(filter === 'today' ? { style: 'primary' } : {}),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'This Week' },
          action_id: 'task_filter_week',
          ...(filter === 'week' ? { style: 'primary' } : {}),
        },
      ],
    }
  );

  // Update the message via response_url
  await fetch(payload.response_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      replace_original: true,
      blocks,
      text: `Tasks - ${filter}`,
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle open add task modal button
 */
async function handleOpenAddTaskModal(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const triggerId = payload.trigger_id;
  if (!triggerId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get user's recent deals for selector
  const { data: deals } = await supabase
    .from('deals')
    .select('id, name')
    .eq('user_id', ctx.userId)
    .not('status', 'eq', 'closed_won')
    .not('status', 'eq', 'closed_lost')
    .order('updated_at', { ascending: false })
    .limit(15);

  const dealOptions = deals && deals.length > 0
    ? deals.map((d: any) => ({
        text: { type: 'plain_text', text: truncateText(d.name, 50) },
        value: d.id,
      }))
    : [];

  const blocks: unknown[] = [
    {
      type: 'input',
      block_id: 'task_title',
      label: { type: 'plain_text', text: 'Task' },
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        placeholder: { type: 'plain_text', text: 'What needs to be done?' },
      },
    },
    {
      type: 'input',
      block_id: 'task_due_date',
      label: { type: 'plain_text', text: 'Due Date' },
      optional: true,
      element: {
        type: 'datepicker',
        action_id: 'due_date_input',
      },
    },
  ];

  // Add deal selector if deals exist
  if (dealOptions.length > 0) {
    blocks.push({
      type: 'input',
      block_id: 'task_deal',
      label: { type: 'plain_text', text: 'Link to Deal' },
      optional: true,
      element: {
        type: 'static_select',
        action_id: 'deal_select',
        placeholder: { type: 'plain_text', text: 'Select a deal...' },
        options: dealOptions,
      },
    });
  }

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'add_task_modal',
        private_metadata: JSON.stringify({ channelId: payload.channel?.id }),
        title: { type: 'plain_text', text: 'Add Task' },
        submit: { type: 'plain_text', text: 'Create' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks,
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle add task modal submission
 */
async function handleAddTaskModalSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = payload.view?.state?.values || {};
  const title = values.task_title?.title_input?.value;
  const dueDate = values.task_due_date?.due_date_input?.selected_date;
  const dealId = values.task_deal?.deal_select?.selected_option?.value;

  if (!title) {
    return new Response(JSON.stringify({
      response_action: 'errors',
      errors: { task_title: 'Please enter a task title' },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Create task
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      title,
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      ...(ctx.orgId ? { org_id: ctx.orgId } : {}),
      deal_id: dealId || null,
      due_date: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
      status: 'pending',
      source: 'slack_modal',
      metadata: { source: 'slack_add_task_modal' },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create task from modal:', error);
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Send confirmation
  let privateMetadata: { channelId?: string } = {};
  try {
    privateMetadata = JSON.parse(payload.view?.private_metadata || '{}');
  } catch {
    privateMetadata = {};
  }

  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && privateMetadata.channelId) {
    const dueDateStr = dueDate
      ? new Date(dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : 'No due date';

    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: privateMetadata.channelId,
        user: payload.user.id,
        text: `✅ Task created: ${title}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `✅ *Task created*\n${title}\n${dueDateStr}` },
          },
        ],
      }),
    });
  }

  // Log interaction
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'task_create_from_modal',
    actionCategory: 'tasks',
    entityType: 'task',
    entityId: task.id,
    metadata: { has_due_date: !!dueDate, has_deal: !!dealId },
  });

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle edit task modal submission
 */
async function handleEditTaskModalSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let privateMetadata: { taskId?: string; channelId?: string } = {};
  try {
    privateMetadata = JSON.parse(payload.view?.private_metadata || '{}');
  } catch {
    privateMetadata = {};
  }

  if (!privateMetadata.taskId) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = payload.view?.state?.values || {};
  const title = values.task_title?.title_input?.value;
  const description = values.task_description?.description_input?.value;
  const dueDate = values.task_due_date?.due_date_input?.selected_date;

  if (!title) {
    return new Response(JSON.stringify({
      response_action: 'errors',
      errors: { task_title: 'Please enter a task title' },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Update task
  await supabase
    .from('tasks')
    .update({
      title,
      description: description || null,
      due_date: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
    })
    .eq('id', privateMetadata.taskId)
    .eq('assigned_to', ctx.userId);

  // Send confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && privateMetadata.channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: privateMetadata.channelId,
        user: payload.user.id,
        text: `✅ Task updated: ${title}`,
      }),
    });
  }

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle focus task done button
 */
async function handleFocusTaskDone(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  let actionData: { taskId?: string; index?: number } = {};
  try {
    actionData = JSON.parse(action.value);
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!actionData.taskId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Complete the task
  const { data: task } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', actionData.taskId)
    .eq('assigned_to', ctx.userId)
    .select('title')
    .single();

  // Refresh focus view
  return handleFocusRefresh(supabase, payload);
}

/**
 * Handle focus refresh button
 */
async function handleFocusRefresh(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Get priority tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, due_date, deals ( name )')
    .eq('assigned_to', ctx.userId)
    .in('status', ['pending', 'in_progress'])
    .lte('due_date', todayEnd.toISOString())
    .order('due_date', { ascending: true })
    .limit(5);

  // Get next meeting
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, start_time')
    .eq('owner_user_id', ctx.userId)
    .gte('start_time', now.toISOString())
    .lte('start_time', todayEnd.toISOString())
    .order('start_time', { ascending: true })
    .limit(1);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Focus Mode', emoji: true },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Your top priorities for ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}` },
      ],
    },
    { type: 'divider' },
  ];

  // Add next meeting
  if (meetings && meetings.length > 0) {
    const nextMeeting = meetings[0];
    const meetingTime = new Date(nextMeeting.start_time);
    const timeStr = meetingTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:calendar: *Next up at ${timeStr}*\n${nextMeeting.title}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Prep', emoji: true },
        action_id: 'focus_meeting_prep',
        value: nextMeeting.id,
      },
    });
    blocks.push({ type: 'divider' });
  }

  // Add tasks
  if (!tasks || tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: ':tada: *No urgent tasks!*\nYou\'re all caught up for today.' },
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:dart: *Top ${tasks.length} Tasks*` },
    });

    tasks.forEach((task: any, index: number) => {
      const dueDate = task.due_date ? new Date(task.due_date) : null;
      const isOverdue = dueDate && dueDate < now;
      const dealInfo = task.deals?.name ? ` (${task.deals.name})` : '';
      const overdueTag = isOverdue ? ' :warning: *overdue*' : '';

      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `${index + 1}. ${task.title}${dealInfo}${overdueTag}` },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Done', emoji: true },
          action_id: 'focus_task_done',
          value: JSON.stringify({ taskId: task.id, index }),
          style: 'primary',
        },
      });
    });
  }

  // Add action buttons
  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: ':arrows_counterclockwise: Refresh', emoji: true }, action_id: 'focus_refresh' },
        { type: 'button', text: { type: 'plain_text', text: ':clipboard: All Tasks', emoji: true }, action_id: 'focus_view_all' },
        { type: 'button', text: { type: 'plain_text', text: ':heavy_plus_sign: Quick Add', emoji: true }, action_id: 'open_add_task_modal' },
      ],
    }
  );

  // Update message
  if (payload.response_url) {
    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        blocks,
        text: 'Focus Mode',
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle focus view all button
 */
async function handleFocusViewAll(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  // Trigger task list command
  const action: SlackAction = { action_id: 'task_filter_week', value: '', type: 'button' };
  return handleTaskFilter(supabase, payload, action);
}

/**
 * Handle focus meeting prep button
 */
async function handleFocusMeetingPrep(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const meetingId = action.value;
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);

  if (orgConnection?.botToken && payload.channel?.id) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: payload.channel.id,
        user: payload.user.id,
        text: 'Use `/sixty meeting-brief` to get your meeting prep.',
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// PHASE 2: Contact & Deal Action Handlers
// ============================================================================

/**
 * Handle "Create Task" button from contact card
 */
async function handleCreateTaskForContact(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  if (!triggerId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let contactData: { contactId?: string; contactName?: string } = {};
  try {
    contactData = JSON.parse(action.value);
  } catch {
    contactData = {};
  }

  // Get contact's active deal for the deal selector
  let dealOptions: Array<{ text: { type: string; text: string }; value: string }> = [];
  if (contactData.contactId) {
    const { data: contactDeals } = await supabase
      .from('deal_contacts')
      .select('deal_id, deals!inner(id, name)')
      .eq('contact_id', contactData.contactId)
      .limit(5);

    if (contactDeals && contactDeals.length > 0) {
      dealOptions = contactDeals.map((dc: any) => ({
        text: { type: 'plain_text', text: truncateText(dc.deals.name, 50) },
        value: dc.deals.id,
      }));
    }
  }

  // Fallback: Get user's recent deals
  if (dealOptions.length === 0) {
    const { data: userDeals } = await supabase
      .from('deals')
      .select('id, name')
      .eq('user_id', ctx.userId)
      .not('status', 'eq', 'closed_won')
      .not('status', 'eq', 'closed_lost')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (userDeals && userDeals.length > 0) {
      dealOptions = userDeals.map((d: any) => ({
        text: { type: 'plain_text', text: truncateText(d.name, 50) },
        value: d.id,
      }));
    }
  }

  const privateMetadata = JSON.stringify({
    contactId: contactData.contactId,
    contactName: contactData.contactName,
    channelId,
    orgId: ctx.orgId,
  });

  const blocks: unknown[] = [
    {
      type: 'input',
      block_id: 'task_title',
      label: { type: 'plain_text', text: 'Task' },
      element: {
        type: 'plain_text_input',
        action_id: 'title_input',
        placeholder: { type: 'plain_text', text: `Follow up with ${contactData.contactName || 'contact'}` },
      },
    },
    {
      type: 'input',
      block_id: 'task_notes',
      optional: true,
      label: { type: 'plain_text', text: 'Notes' },
      element: {
        type: 'plain_text_input',
        action_id: 'notes_input',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'Additional context...' },
      },
    },
    {
      type: 'input',
      block_id: 'task_due',
      label: { type: 'plain_text', text: 'Due' },
      element: {
        type: 'static_select',
        action_id: 'due_select',
        initial_option: { text: { type: 'plain_text', text: 'Tomorrow' }, value: '1' },
        options: [
          { text: { type: 'plain_text', text: 'Today' }, value: '0' },
          { text: { type: 'plain_text', text: 'Tomorrow' }, value: '1' },
          { text: { type: 'plain_text', text: 'In 3 days' }, value: '3' },
          { text: { type: 'plain_text', text: 'In 1 week' }, value: '7' },
          { text: { type: 'plain_text', text: 'In 2 weeks' }, value: '14' },
        ],
      },
    },
  ];

  if (dealOptions.length > 0) {
    blocks.push({
      type: 'input',
      block_id: 'task_deal',
      optional: true,
      label: { type: 'plain_text', text: 'Link to Deal' },
      element: {
        type: 'static_select',
        action_id: 'deal_select',
        placeholder: { type: 'plain_text', text: 'Select a deal...' },
        options: dealOptions,
      },
    });
  }

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'create_task_for_contact_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: 'Create Task' },
        submit: { type: 'plain_text', text: 'Create' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks,
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Create Task" button from deal card
 */
async function handleCreateTaskForDeal(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  if (!triggerId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let dealData: { dealId?: string; dealName?: string } = {};
  try {
    dealData = JSON.parse(action.value);
  } catch {
    dealData = {};
  }

  const privateMetadata = JSON.stringify({
    dealId: dealData.dealId,
    dealName: dealData.dealName,
    channelId,
    orgId: ctx.orgId,
  });

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'create_task_for_deal_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: 'Create Task' },
        submit: { type: 'plain_text', text: 'Create' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Deal:* ${dealData.dealName || 'Unknown'}` },
          },
          {
            type: 'input',
            block_id: 'task_title',
            label: { type: 'plain_text', text: 'Task' },
            element: {
              type: 'plain_text_input',
              action_id: 'title_input',
              placeholder: { type: 'plain_text', text: 'What needs to be done?' },
            },
          },
          {
            type: 'input',
            block_id: 'task_notes',
            optional: true,
            label: { type: 'plain_text', text: 'Notes' },
            element: {
              type: 'plain_text_input',
              action_id: 'notes_input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Additional context...' },
            },
          },
          {
            type: 'input',
            block_id: 'task_due',
            label: { type: 'plain_text', text: 'Due' },
            element: {
              type: 'static_select',
              action_id: 'due_select',
              initial_option: { text: { type: 'plain_text', text: 'Tomorrow' }, value: '1' },
              options: [
                { text: { type: 'plain_text', text: 'Today' }, value: '0' },
                { text: { type: 'plain_text', text: 'Tomorrow' }, value: '1' },
                { text: { type: 'plain_text', text: 'In 3 days' }, value: '3' },
                { text: { type: 'plain_text', text: 'In 1 week' }, value: '7' },
                { text: { type: 'plain_text', text: 'In 2 weeks' }, value: '14' },
              ],
            },
          },
        ],
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle task creation modal submissions (for both contact and deal)
 */
async function handleCreateTaskModalSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: { contactId?: string; contactName?: string; dealId?: string; dealName?: string; channelId?: string; orgId?: string } = {};
  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    meta = {};
  }

  const values = (payload.view?.state?.values || {}) as any;
  const title = values['task_title']?.['title_input']?.value || 'Follow up';
  const notes = values['task_notes']?.['notes_input']?.value || '';
  const dueDays = parseInt(values['task_due']?.['due_select']?.selected_option?.value || '1', 10);
  const selectedDealId = values['task_deal']?.['deal_select']?.selected_option?.value;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  const dealId = meta.dealId || selectedDealId || null;

  // Create the task
  const { data: task } = await supabase
    .from('tasks')
    .insert({
      user_id: ctx.userId,
      title,
      notes,
      due_date: dueDate.toISOString(),
      status: 'pending',
      contact_id: meta.contactId || null,
      deal_id: dealId,
      source: 'slack',
      metadata: {
        created_via: 'slack_action',
        contact_name: meta.contactName || null,
        deal_name: meta.dealName || null,
      },
    })
    .select('id')
    .single();

  // Log activity for Smart Engagement Algorithm
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: meta.contactId ? 'create_task_for_contact' : 'create_task_for_deal',
    actionCategory: 'tasks',
    entityType: dealId ? 'deal' : 'contact',
    entityId: dealId || meta.contactId,
    metadata: {
      source: 'slack_card_action',
      task_title: title,
    },
  });

  // Post ephemeral confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.use60.com';

  if (orgConnection?.botToken && meta.channelId) {
    const taskUrl = `${appUrl}/tasks/${task?.id}`;
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: meta.channelId,
        user: payload.user.id,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Task created: *${title}*\n📅 Due ${dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'View in Sixty', emoji: true },
              url: taskUrl,
              action_id: 'view_task_in_sixty',
            },
          },
        ],
        text: `Task created: ${title}`,
      }),
    });
  }

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle "Update Stage" button from deal card
 */
async function handleUpdateDealStage(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const triggerId = payload.trigger_id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  if (!triggerId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let dealData: { dealId?: string; dealName?: string } = {};
  try {
    dealData = JSON.parse(action.value);
  } catch {
    dealData = {};
  }

  // Get current deal and available stages
  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, stage_id, pipeline_id')
    .eq('id', dealData.dealId)
    .maybeSingle();

  if (!deal) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get stages for this pipeline
  const { data: stages } = await supabase
    .from('deal_stages')
    .select('id, name, order_index')
    .eq('pipeline_id', deal.pipeline_id)
    .order('order_index', { ascending: true });

  if (!stages || stages.length === 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const stageOptions = stages.map((s: any) => ({
    text: { type: 'plain_text', text: s.name },
    value: s.id,
  }));

  const currentStageOption = stageOptions.find((s: any) => s.value === deal.stage_id);

  const privateMetadata = JSON.stringify({
    dealId: deal.id,
    dealName: deal.name,
    channelId,
    orgId: ctx.orgId,
    currentStageId: deal.stage_id,
  });

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${orgConnection.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'update_deal_stage_modal',
        private_metadata: privateMetadata,
        title: { type: 'plain_text', text: 'Update Stage' },
        submit: { type: 'plain_text', text: 'Update' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Deal:* ${deal.name}` },
          },
          {
            type: 'input',
            block_id: 'stage_select',
            label: { type: 'plain_text', text: 'New Stage' },
            element: {
              type: 'static_select',
              action_id: 'stage_input',
              initial_option: currentStageOption,
              options: stageOptions,
            },
          },
          {
            type: 'input',
            block_id: 'stage_notes',
            optional: true,
            label: { type: 'plain_text', text: 'Notes' },
            element: {
              type: 'plain_text_input',
              action_id: 'notes_input',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Why is the stage changing?' },
            },
          },
        ],
      },
    }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle stage update modal submission
 */
async function handleUpdateDealStageSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload
): Promise<Response> {
  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
  if (!ctx) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  let meta: { dealId?: string; dealName?: string; channelId?: string; orgId?: string; currentStageId?: string } = {};
  try {
    meta = payload.view?.private_metadata ? JSON.parse(payload.view.private_metadata) : {};
  } catch {
    meta = {};
  }

  if (!meta.dealId) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  const values = (payload.view?.state?.values || {}) as any;
  const newStageId = values['stage_select']?.['stage_input']?.selected_option?.value;
  const notes = values['stage_notes']?.['notes_input']?.value || '';

  if (!newStageId || newStageId === meta.currentStageId) {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  // Get stage name for the activity log
  const { data: stage } = await supabase
    .from('deal_stages')
    .select('name')
    .eq('id', newStageId)
    .maybeSingle();

  // Update the deal
  await supabase
    .from('deals')
    .update({
      stage_id: newStageId,
      stage_changed_at: new Date().toISOString(),
    })
    .eq('id', meta.dealId);

  // Log the activity
  await supabase
    .from('activities')
    .insert({
      user_id: ctx.userId,
      deal_id: meta.dealId,
      activity_type: 'stage_change',
      activity_date: new Date().toISOString(),
      notes: notes || `Stage changed to ${stage?.name || 'Unknown'}`,
      metadata: {
        source: 'slack',
        old_stage_id: meta.currentStageId,
        new_stage_id: newStageId,
        new_stage_name: stage?.name,
      },
    });

  // Log for Smart Engagement
  await logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId || null,
    actionType: 'update_deal_stage',
    actionCategory: 'deals',
    entityType: 'deal',
    entityId: meta.dealId,
    metadata: {
      source: 'slack_card_action',
      new_stage: stage?.name,
    },
  });

  // Post ephemeral confirmation
  const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
  if (orgConnection?.botToken && meta.channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: meta.channelId,
        user: payload.user.id,
        text: `✅ ${meta.dealName} moved to *${stage?.name}*`,
      }),
    });
  }

  return new Response('', { status: 200, headers: corsHeaders });
}

/**
 * Handle "Log Activity" button from deal card
 */
async function handleLogDealActivity(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  // This reuses the existing handleLogActivity but parses deal info from the action value
  let dealData: { dealId?: string; dealName?: string } = {};
  try {
    dealData = JSON.parse(action.value);
  } catch {
    dealData = {};
  }

  // Create a modified action with just the dealId
  const modifiedAction: SlackAction = {
    ...action,
    value: dealData.dealId || '',
  };

  return handleLogActivity(supabase, payload, modifiedAction);
}

/**
 * Handle "Draft Follow-up" button from contact card (HITL flow)
 */
async function handleDraftFollowupContact(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let contactData: { contactId?: string; contactName?: string; email?: string } = {};
  try {
    contactData = JSON.parse(action.value);
  } catch {
    contactData = {};
  }

  // Post an ephemeral "generating" message
  if (channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: payload.user.id,
        text: `✨ Drafting follow-up for ${contactData.contactName || 'contact'}...`,
      }),
    });
  }

  // Call the follow-up generation edge function
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.use60.com';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/slack-slash-commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: new URLSearchParams({
        command: '/sixty',
        text: `follow-up ${contactData.contactName || contactData.email || ''}`,
        user_id: payload.user.id,
        team_id: teamId || '',
        channel_id: channelId || '',
        trigger_id: payload.trigger_id || '',
        response_url: payload.response_url || '',
      }).toString(),
    });

    // The follow-up command will post its own HITL message
  } catch (error) {
    console.error('Error calling follow-up command:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Draft Check-in" button from deal card (HITL flow)
 */
async function handleDraftCheckinDeal(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let dealData: { dealId?: string; dealName?: string; contactEmail?: string } = {};
  try {
    dealData = JSON.parse(action.value);
  } catch {
    dealData = {};
  }

  // Post an ephemeral "generating" message
  if (channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: payload.user.id,
        text: `✨ Drafting check-in for ${dealData.dealName || 'deal'}...`,
      }),
    });
  }

  // Call the follow-up generation edge function with deal context
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  try {
    await fetch(`${supabaseUrl}/functions/v1/slack-slash-commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: new URLSearchParams({
        command: '/sixty',
        text: `follow-up ${dealData.dealName || ''}`,
        user_id: payload.user.id,
        team_id: teamId || '',
        channel_id: channelId || '',
        trigger_id: payload.trigger_id || '',
        response_url: payload.response_url || '',
      }).toString(),
    });
  } catch (error) {
    console.error('Error calling follow-up command:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Helper to truncate text
 */
function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// Phase 2: Risks Command Handlers
// ============================================================================

/**
 * Handle risks filter button clicks (stale, closing, all)
 * Re-triggers the /sixty risks command with the selected filter
 */
async function handleRisksFilter(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (ctx) {
    // Log interaction for Smart Engagement Algorithm
    logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'risks_filter_change',
      actionCategory: 'navigation',
      entityType: 'deal',
      metadata: { filter: action.value },
    });
  }

  // Get filter from action value (stale, closing, or all/empty)
  const filter = action.value === 'all' ? '' : action.value;

  // Post loading message
  if (channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: payload.user.id,
        text: ':hourglass: Updating risk view...',
      }),
    });
  }

  // Call the risks command with the filter
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  try {
    await fetch(`${supabaseUrl}/functions/v1/slack-slash-commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: new URLSearchParams({
        command: '/sixty',
        text: `risks ${filter}`,
        user_id: payload.user.id,
        team_id: teamId || '',
        channel_id: channelId || '',
        trigger_id: payload.trigger_id || '',
        response_url: payload.response_url || '',
      }).toString(),
    });
  } catch (error) {
    console.error('Error calling risks command:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle deal risk overflow menu actions
 * Actions: view_deal, draft_checkin, log_activity, update_stage
 */
async function handleDealRiskOverflow(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  // Overflow menus have selected_option in the action
  const selectedOption = (action as any).selected_option?.value || action.value;
  if (!selectedOption) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const [actionType, dealId, ...dealNameParts] = selectedOption.split(':');
  const dealName = dealNameParts.join(':');

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);

  // Log interaction
  if (ctx) {
    logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: `risk_overflow_${actionType}`,
      actionCategory: 'deal_action',
      entityType: 'deal',
      entityId: dealId,
      metadata: { dealName },
    });
  }

  switch (actionType) {
    case 'view_deal': {
      // Post link to deal in app
      const appUrlEnv = Deno.env.get('APP_URL') || 'https://app.use60.com';
      if (channelId) {
        await fetch('https://slack.com/api/chat.postEphemeral', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            user: payload.user.id,
            text: `<${appUrlEnv}/deals/${dealId}|View ${dealName || 'deal'} in Sixty>`,
          }),
        });
      }
      break;
    }

    case 'draft_checkin': {
      // Trigger follow-up command for check-in
      if (channelId) {
        await fetch('https://slack.com/api/chat.postEphemeral', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgConnection.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: channelId,
            user: payload.user.id,
            text: `✨ Drafting check-in for ${dealName || 'deal'}...`,
          }),
        });
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      try {
        await fetch(`${supabaseUrl}/functions/v1/slack-slash-commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          },
          body: new URLSearchParams({
            command: '/sixty',
            text: `follow-up ${dealName || ''}`,
            user_id: payload.user.id,
            team_id: teamId || '',
            channel_id: channelId || '',
            trigger_id: payload.trigger_id || '',
            response_url: payload.response_url || '',
          }).toString(),
        });
      } catch (error) {
        console.error('Error calling follow-up command:', error);
      }
      break;
    }

    case 'log_activity': {
      // Open log activity modal - reuse existing logic
      const fakeAction: SlackAction = {
        action_id: 'log_activity',
        value: JSON.stringify({ dealId, dealName, entityType: 'deal' }),
        type: 'button',
      };
      return handleLogActivity(supabase, payload, fakeAction);
    }

    case 'update_stage': {
      // Open update stage modal - reuse existing logic
      const fakeAction: SlackAction = {
        action_id: 'update_deal_stage',
        value: JSON.stringify({ dealId, dealName }),
        type: 'button',
      };
      return handleUpdateDealStage(supabase, payload, fakeAction);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Phase 3: Debrief Handlers
// ============================================================================

/**
 * Handle debrief meeting selection from picker
 * When user has multiple meetings today and picks one for debrief
 */
async function handleDebriefMeetingSelect(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const meetingId = action.value;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);

  // Log interaction
  if (ctx) {
    logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'debrief_meeting_select',
      actionCategory: 'meeting_action',
      entityType: 'meeting',
      entityId: meetingId,
    });
  }

  // Send loading message
  if (channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: payload.user.id,
        text: '⏳ Generating meeting debrief...',
      }),
    });
  }

  // Fetch meeting data and build debrief
  try {
    const { data: meeting } = await supabase
      .from('meetings')
      .select(`
        id, title, start_time, end_time, owner_user_id,
        transcript_text, summary, attendee_emails,
        sentiment_score, talk_time_rep, talk_time_customer,
        action_items, coaching_insights, key_quotes
      `)
      .eq('id', meetingId)
      .maybeSingle();

    if (!meeting) {
      if (payload.response_url) {
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: false,
            text: '❌ Meeting not found. It may have been deleted.',
          }),
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Import buildMeetingDebriefMessage dynamically since we're in the interactive handler
    const slackBlocks = await import('../_shared/slackBlocks.ts');

    // Build debrief data (simplified version - key data only)
    const appUrlEnv = Deno.env.get('APP_URL') || 'https://app.use60.com';
    const startTime = new Date(meeting.start_time);
    const endTime = new Date(meeting.end_time);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    // Parse attendees
    const attendees: string[] = [];
    if (meeting.attendee_emails && Array.isArray(meeting.attendee_emails)) {
      meeting.attendee_emails.slice(0, 5).forEach((email: unknown) => {
        if (typeof email === 'string') {
          const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          attendees.push(name);
        }
      });
    }

    // Determine sentiment
    let sentiment: 'positive' | 'neutral' | 'challenging' = 'neutral';
    if (meeting.sentiment_score !== undefined && meeting.sentiment_score !== null) {
      if (meeting.sentiment_score >= 0.6) sentiment = 'positive';
      else if (meeting.sentiment_score <= 0.4) sentiment = 'challenging';
    }

    // Parse action items
    let actionItems: Array<{ task: string; dueInDays?: number; suggestedOwner?: string }> = [];
    if (meeting.action_items && Array.isArray(meeting.action_items)) {
      actionItems = meeting.action_items.map((item: unknown) => ({
        task: typeof item === 'string' ? item : (item as any).task || (item as any).title || String(item),
        dueInDays: (item as any)?.dueInDays || (item as any)?.due_in_days || 3,
        suggestedOwner: (item as any)?.suggestedOwner || (item as any)?.suggested_owner,
      }));
    }

    if (actionItems.length === 0 && meeting.summary) {
      actionItems = [
        { task: 'Send follow-up email with meeting notes', dueInDays: 1 },
        { task: 'Review and add any additional action items', dueInDays: 2 },
      ];
    }

    const debriefData = {
      meetingId: meeting.id,
      meetingTitle: meeting.title || 'Meeting',
      attendees,
      duration: durationMinutes,
      summary: meeting.summary || 'No summary available. View the meeting for full details.',
      sentiment,
      sentimentScore: meeting.sentiment_score || 0.5,
      talkTimeRep: meeting.talk_time_rep || 50,
      talkTimeCustomer: meeting.talk_time_customer || 50,
      actionItems,
      coachingInsight: meeting.coaching_insights || getDefaultCoachingInsight(sentiment),
      keyQuotes: meeting.key_quotes || undefined,
      appUrl: appUrlEnv,
    };

    const debriefMessage = slackBlocks.buildMeetingDebriefMessage(debriefData);

    // Send the debrief via response_url to update the message
    if (payload.response_url) {
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: true,
          ...debriefMessage,
        }),
      });
    }

  } catch (error) {
    console.error('Error generating debrief:', error);
    if (payload.response_url) {
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_original: false,
          text: '❌ Failed to generate meeting debrief. Please try again.',
        }),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Get default coaching insight based on sentiment
 */
function getDefaultCoachingInsight(sentiment: 'positive' | 'neutral' | 'challenging'): string {
  switch (sentiment) {
    case 'positive':
      return 'Great energy in this meeting! Consider striking while the momentum is hot with a follow-up.';
    case 'challenging':
      return 'This meeting had some friction. Consider addressing concerns directly in your follow-up.';
    default:
      return 'Review the summary and identify 2-3 key points to reinforce in your follow-up.';
  }
}

/**
 * Handle "Draft Follow-up" button from debrief
 * Triggers the follow-up command for meeting attendees
 */
async function handleDebriefDraftFollowup(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  let actionData: { meetingId?: string; meetingTitle?: string; dealId?: string; dealName?: string; attendees?: string[] } = {};
  try {
    actionData = JSON.parse(action.value);
  } catch {
    console.error('Failed to parse action value:', action.value);
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);

  // Log interaction
  if (ctx) {
    logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'debrief_draft_followup',
      actionCategory: 'meeting_action',
      entityType: 'meeting',
      entityId: actionData.meetingId,
      metadata: { dealId: actionData.dealId },
    });
  }

  // Send loading message
  if (channelId) {
    await fetch('https://slack.com/api/chat.postEphemeral', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orgConnection.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        user: payload.user.id,
        text: `✨ Drafting follow-up for ${actionData.meetingTitle || 'meeting'}...`,
      }),
    });
  }

  // Call the follow-up command with meeting context
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const followUpTarget = actionData.dealName || actionData.attendees?.[0] || actionData.meetingTitle || '';

  try {
    await fetch(`${supabaseUrl}/functions/v1/slack-slash-commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      body: new URLSearchParams({
        command: '/sixty',
        text: `follow-up ${followUpTarget}`,
        user_id: payload.user.id,
        team_id: teamId || '',
        channel_id: channelId || '',
        trigger_id: payload.trigger_id || '',
        response_url: payload.response_url || '',
      }).toString(),
    });
  } catch (error) {
    console.error('Error calling follow-up command:', error);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Update Deal" button from debrief
 * Opens the update deal stage modal
 */
async function handleDebriefUpdateDeal(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  let actionData: { meetingId?: string; dealId?: string; dealName?: string } = {};
  try {
    actionData = JSON.parse(action.value);
  } catch {
    console.error('Failed to parse action value:', action.value);
  }

  if (!actionData.dealId) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);

  // Log interaction
  if (ctx) {
    logSlackInteraction(supabase, {
      userId: ctx.userId,
      orgId: ctx.orgId,
      actionType: 'debrief_update_deal',
      actionCategory: 'deal_action',
      entityType: 'deal',
      entityId: actionData.dealId,
      metadata: { meetingId: actionData.meetingId },
    });
  }

  // Reuse the existing update deal stage handler
  const fakeAction: SlackAction = {
    action_id: 'update_deal_stage',
    value: JSON.stringify({ dealId: actionData.dealId, dealName: actionData.dealName }),
    type: 'button',
  };

  return handleUpdateDealStage(supabase, payload, fakeAction);
}

/**
 * Handle individual "Add Task" button from debrief action items
 */
async function handleDebriefAddTask(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  let taskData: { title?: string; dealId?: string; dueInDays?: number; meetingId?: string } = {};
  try {
    taskData = JSON.parse(action.value);
  } catch {
    console.error('Failed to parse task value:', action.value);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Log interaction
  logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId,
    actionType: 'debrief_add_task',
    actionCategory: 'task_action',
    entityType: 'task',
    metadata: { meetingId: taskData.meetingId, dealId: taskData.dealId },
  });

  // Calculate due date
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (taskData.dueInDays || 3));

  // Create the task
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      clerk_org_id: ctx.orgId,
      title: taskData.title || 'Follow-up task',
      due_date: dueDate.toISOString(),
      status: 'pending',
      priority: 'medium',
      deal_id: taskData.dealId || null,
      meeting_id: taskData.meetingId || null,
      source: 'slack_debrief',
    })
    .select('id, title')
    .single();

  if (error) {
    console.error('Error creating task:', error);
    if (channelId) {
      await fetch('https://slack.com/api/chat.postEphemeral', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          user: payload.user.id,
          text: '❌ Failed to create task. Please try again.',
        }),
      });
    }
  } else {
    if (channelId) {
      const appUrlEnv = Deno.env.get('APP_URL') || 'https://app.use60.com';
      await fetch('https://slack.com/api/chat.postEphemeral', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          user: payload.user.id,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ Task created: *${taskData.title}*\nDue: ${dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
              },
              accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'View Task', emoji: true },
                url: `${appUrlEnv}/tasks/${task.id}`,
              },
            },
          ],
          text: `Task created: ${taskData.title}`,
        }),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Handle "Add All Tasks" button from debrief
 */
async function handleDebriefAddAllTasks(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction
): Promise<Response> {
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;

  let tasksData: { tasks?: Array<{ title: string; dealId?: string; dueInDays?: number; meetingId?: string }> } = {};
  try {
    tasksData = JSON.parse(action.value);
  } catch {
    console.error('Failed to parse tasks value:', action.value);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!tasksData.tasks || tasksData.tasks.length === 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orgConnection = await getSlackOrgConnection(supabase, teamId);
  if (!orgConnection?.botToken) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const ctx = await getSixtyUserContext(supabase, payload.user.id, teamId);
  if (!ctx) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Log interaction
  logSlackInteraction(supabase, {
    userId: ctx.userId,
    orgId: ctx.orgId,
    actionType: 'debrief_add_all_tasks',
    actionCategory: 'task_action',
    entityType: 'task',
    metadata: { taskCount: tasksData.tasks.length },
  });

  // Create all tasks
  const taskInserts = tasksData.tasks.map(task => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (task.dueInDays || 3));

    return {
      assigned_to: ctx.userId,
      created_by: ctx.userId,
      clerk_org_id: ctx.orgId,
      title: task.title,
      due_date: dueDate.toISOString(),
      status: 'pending',
      priority: 'medium',
      deal_id: task.dealId || null,
      meeting_id: task.meetingId || null,
      source: 'slack_debrief',
    };
  });

  const { data: tasks, error } = await supabase
    .from('tasks')
    .insert(taskInserts)
    .select('id');

  if (error) {
    console.error('Error creating tasks:', error);
    if (channelId) {
      await fetch('https://slack.com/api/chat.postEphemeral', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          user: payload.user.id,
          text: '❌ Failed to create tasks. Please try again.',
        }),
      });
    }
  } else {
    if (channelId) {
      const appUrlEnv = Deno.env.get('APP_URL') || 'https://app.use60.com';
      const taskList = tasksData.tasks.slice(0, 3).map(t => `• ${t.title}`).join('\n');
      const moreText = tasksData.tasks.length > 3 ? `\n_+ ${tasksData.tasks.length - 3} more_` : '';

      await fetch('https://slack.com/api/chat.postEphemeral', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orgConnection.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          user: payload.user.id,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ Created ${tasks?.length || tasksData.tasks.length} tasks:\n${taskList}${moreText}`,
              },
              accessory: {
                type: 'button',
                text: { type: 'plain_text', text: 'View Tasks', emoji: true },
                url: `${appUrlEnv}/tasks`,
              },
            },
          ],
          text: `Created ${tasks?.length || tasksData.tasks.length} tasks`,
        }),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Slack signs the *raw* request body. Do not use req.formData() here because it
    // normalizes/decodes the body and breaks signature verification.
    const rawBody = await req.text();
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    let payloadStr: string | null = null;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody);
      payloadStr = params.get('payload');
    } else if (contentType.includes('application/json')) {
      // Defensive: some proxies may forward JSON. Slack normally sends urlencoded.
      const parsed = JSON.parse(rawBody);
      payloadStr = typeof parsed?.payload === 'string' ? parsed.payload : rawBody;
    } else {
      // Best effort: attempt urlencoded parse
      const params = new URLSearchParams(rawBody);
      payloadStr = params.get('payload');
    }

    if (!payloadStr) {
      return new Response(
        JSON.stringify({ error: 'No payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Slack signature
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    if (!await verifySlackRequest(rawBody, timestamp, signature)) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: InteractivePayload = JSON.parse(payloadStr);
    console.log('Received interactive payload:', { type: payload.type, user: payload.user?.id });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different interaction types
    switch (payload.type) {
      case 'block_actions': {
        const action = payload.actions?.[0];
        if (!action) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('Processing action:', action.action_id);

        // Check if this is a HITL action first (legacy format: {action}::{resource_type}::{approval_id})
        const hitlAction = parseHITLActionId(action.action_id);
        if (hitlAction) {
          console.log('Processing HITL action:', hitlAction);
          switch (hitlAction.action) {
            case 'approve':
              return handleHITLApprove(supabase, payload, action, hitlAction);
            case 'reject':
              return handleHITLReject(supabase, payload, action, hitlAction);
            case 'edit':
              return handleHITLEdit(supabase, payload, action, hitlAction);
          }
        }

        // Check if this is a sequence HITL action (new format: hitl_*)
        if (action.action_id.startsWith('hitl_')) {
          console.log('[Sequence HITL] Processing action:', action.action_id);
          const result = await handleHITLAction(action.action_id, payload, action);

          if (result) {
            if (result.success && result.responseBlocks && payload.response_url) {
              // Update the original message with response confirmation
              await updateMessage(payload.response_url, result.responseBlocks);
            } else if (!result.success && payload.response_url) {
              // Send error as ephemeral message
              await sendEphemeral(payload.response_url, {
                blocks: [
                  {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `❌ ${result.error || 'Failed to process HITL action'}` },
                  },
                ],
                text: result.error || 'Failed to process HITL action',
              });
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // =====================================================================
        // SUP-004: Route support ticket actions (support_*)
        // =====================================================================
        if (action.action_id.startsWith('support_')) {
          console.log('[Support] Processing action:', action.action_id);
          const result = await handleSupportAction(action.action_id, payload);

          if (result && payload.response_url) {
            if (result.success && result.responseBlocks) {
              await sendEphemeral(payload.response_url, {
                blocks: result.responseBlocks,
                text: result.responseText || 'Support action completed',
              });
            } else if (!result.success) {
              await sendEphemeral(payload.response_url, {
                blocks: [
                  {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `❌ ${result.error || 'Failed to process support action'}` },
                  },
                ],
                text: result.error || 'Failed to process support action',
              });
            }
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // CRM-007: Route CRM approval actions (crm_*) to agent-crm-approval
        // =====================================================================
        if (action.action_id.startsWith('crm_approve::') ||
            action.action_id.startsWith('crm_reject::') ||
            action.action_id.startsWith('crm_edit::') ||
            action.action_id.startsWith('crm_approve_all::') ||
            action.action_id.startsWith('crm_reject_all::')) {
          console.log('[CRM Approval] Forwarding action to agent-crm-approval:', action.action_id);
          // Forward the raw form body to agent-crm-approval (it handles its own Slack verification)
          fetch(`${supabaseUrl}/functions/v1/agent-crm-approval`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              // Forward Slack signing headers for verification
              'x-slack-request-timestamp': req.headers.get('x-slack-request-timestamp') || '',
              'x-slack-signature': req.headers.get('x-slack-signature') || '',
            },
            body: `payload=${encodeURIComponent(payloadStr)}`,
          }).catch(err => console.error('[CRM Approval] Forward error:', err));
          // Acknowledge immediately (agent-crm-approval handles async response)
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // ORCH-009: Route orchestrator actions (orch_*) to orchestrator handler
        // =====================================================================
        if (action.action_id.startsWith('orch_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          if (ctx?.userId && ctx?.orgId && payload.response_url) {
            const { handleOrchestratorAction } = await import('./handlers/orchestrator.ts');
            await handleOrchestratorAction({
              actionId: action.action_id,
              actionValue: action.value,
              userId: ctx.userId,
              orgId: ctx.orgId,
              channelId: payload.channel?.id || '',
              messageTs: payload.message?.ts || '',
              responseUrl: payload.response_url,
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // WIRE-002: Route proposal HITL actions (prop_*)
        // =====================================================================
        if (action.action_id.startsWith('prop_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          if (ctx?.userId && ctx?.orgId && payload.response_url) {
            const { handleProposalAction } = await import('./handlers/proposal.ts');
            await handleProposalAction({
              actionId: action.action_id,
              actionValue: action.value,
              userId: ctx.userId,
              orgId: ctx.orgId,
              channelId: payload.channel?.id || '',
              messageTs: payload.message?.ts || '',
              responseUrl: payload.response_url,
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // WIRE-002: Route calendar HITL actions (cal_*)
        // =====================================================================
        if (action.action_id.startsWith('cal_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          if (ctx?.userId && ctx?.orgId && payload.response_url) {
            const { handleCalendarAction } = await import('./handlers/calendar.ts');
            await handleCalendarAction({
              actionId: action.action_id,
              actionValue: action.value,
              userId: ctx.userId,
              orgId: ctx.orgId,
              channelId: payload.channel?.id || '',
              messageTs: payload.message?.ts || '',
              responseUrl: payload.response_url,
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // WIRE-002: Route email send HITL actions (email_*)
        // =====================================================================
        if (action.action_id.startsWith('email_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          if (ctx?.userId && ctx?.orgId && payload.response_url) {
            const { handleEmailSendAction } = await import('./handlers/emailSend.ts');
            await handleEmailSendAction({
              actionId: action.action_id,
              actionValue: action.value,
              userId: ctx.userId,
              orgId: ctx.orgId,
              channelId: payload.channel?.id || '',
              messageTs: payload.message?.ts || '',
              responseUrl: payload.response_url,
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // WIRE-002: Route campaign HITL actions (camp_*)
        // =====================================================================
        if (action.action_id.startsWith('camp_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          if (ctx?.userId && ctx?.orgId && payload.response_url) {
            const { handleCampaignAction } = await import('./handlers/campaigns.ts');
            await handleCampaignAction({
              actionId: action.action_id,
              actionValue: action.value,
              userId: ctx.userId,
              orgId: ctx.orgId,
              channelId: payload.channel?.id || '',
              messageTs: payload.message?.ts || '',
              responseUrl: payload.response_url,
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // =====================================================================
        // SLACK-001/003/004/007: Proactive Copilot action handlers
        // Format: {action}::{entity_type}::{entity_id}
        // =====================================================================
        if (action.action_id.startsWith('snooze::')) {
          return handleSnoozeAction(supabase, payload, action);
        } else if (action.action_id.startsWith('dismiss::')) {
          return handleDismissAction(supabase, payload, action);
        } else if (action.action_id.startsWith('draft_followup::')) {
          return handleDraftFollowupAction(supabase, payload, action);
        } else if (action.action_id.startsWith('prep_meeting::')) {
          return handlePrepMeetingAction(supabase, payload, action);
        } else if (action.action_id.startsWith('undo_crm_update::')) {
          return handleUndoCrmUpdate(supabase, payload, action);
        }

        // =====================================================================
        // RET-005: Re-engagement HITL action handlers
        // =====================================================================
        if (action.action_id.startsWith('reengagement_send::')) {
          return handleReengagementSend(supabase, payload, action);
        } else if (action.action_id.startsWith('reengagement_edit::')) {
          return handleReengagementEdit(supabase, payload, action);
        } else if (action.action_id.startsWith('reengagement_snooze::')) {
          return handleReengagementSnooze(supabase, payload, action);
        } else if (action.action_id.startsWith('reengagement_remove::')) {
          return handleReengagementRemove(supabase, payload, action);
        }

        // =====================================================================
        // PROACTIVE-005: Route proactive/copilot actions to slack-copilot-actions
        // =====================================================================
        const proactiveActionPrefixes = [
          'open_dashboard', 'open_copilot',
          'run_sequence_', 'confirm_', 'dismiss_',
          'get_more_info', 'view_brief', 'draft_email_',
          'proactive_', 'copilot_',
        ];
        const isProactiveAction = proactiveActionPrefixes.some(
          prefix => action.action_id === prefix || action.action_id.startsWith(prefix)
        );

        if (isProactiveAction) {
          console.log('[Proactive] Forwarding action to slack-copilot-actions:', action.action_id);
          try {
            // Forward to slack-copilot-actions function
            const response = await supabase.functions.invoke('slack-copilot-actions', {
              body: {
                type: 'block_actions',
                user: payload.user,
                team: payload.team,
                channel: payload.channel,
                message: payload.message,
                actions: [action],
                trigger_id: payload.trigger_id,
                response_url: payload.response_url,
              },
            });

            if (response.error) {
              console.error('[Proactive] Forward error:', response.error);
            }

            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (err) {
            console.error('[Proactive] Forward failed:', err);
            // Fall through to handle as unknown action if forward fails
          }
        }

        // Route to appropriate handler based on action_id
        if (action.action_id.startsWith('add_task_')) {
          return handleAddTask(supabase, payload, action);
        } else if (action.action_id === 'add_all_tasks') {
          return handleAddAllTasks(supabase, payload, action);
        } else if (action.action_id === 'dismiss_tasks') {
          return handleDismiss(supabase, payload, action);
        } else if (action.action_id === 'create_task_from_assistant') {
          return handleCreateTaskFromAssistant(supabase, payload, action);
        } else if (action.action_id === 'create_task_from_alert') {
          return handleCreateTaskFromAlert(supabase, payload, action);
        } else if (action.action_id === 'log_activity') {
          return handleLogActivity(supabase, payload, action);
        } else if (action.action_id.startsWith('notification_feedback_')) {
          // Smart Engagement Algorithm: Handle frequency feedback buttons
          return handleNotificationFeedback(supabase, payload, action);
        } else if (
          action.action_id === 'notification_helpful' ||
          action.action_id === 'notification_not_helpful' ||
          action.action_id === 'notification_overflow_feedback'
        ) {
          // Smart Engagement Algorithm: Handle per-notification feedback
          return handlePerNotificationFeedback(supabase, payload, action);
        } else if (action.action_id.startsWith('view_')) {
          // View actions are typically handled by the URL in the button
          // Just acknowledge
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Phase 2: Contact & Deal action handlers
        else if (action.action_id === 'create_task_for_contact') {
          return handleCreateTaskForContact(supabase, payload, action);
        } else if (action.action_id === 'create_task_for_deal') {
          return handleCreateTaskForDeal(supabase, payload, action);
        } else if (action.action_id === 'update_deal_stage') {
          return handleUpdateDealStage(supabase, payload, action);
        } else if (action.action_id === 'log_deal_activity') {
          return handleLogDealActivity(supabase, payload, action);
        } else if (action.action_id === 'draft_followup_contact') {
          return handleDraftFollowupContact(supabase, payload, action);
        } else if (action.action_id === 'draft_checkin_deal') {
          return handleDraftCheckinDeal(supabase, payload, action);
        }

        // Phase 2: Risks command actions
        else if (action.action_id === 'risks_filter_stale' ||
                 action.action_id === 'risks_filter_closing' ||
                 action.action_id === 'risks_filter_all') {
          return handleRisksFilter(supabase, payload, action);
        } else if (action.action_id === 'deal_risk_actions') {
          return handleDealRiskOverflow(supabase, payload, action);
        }

        // Phase 4: Deal Momentum action handlers
        else if (action.action_id === 'momentum_set_next_step') {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
          if (ctx && orgConnection?.botToken) {
            return handleMomentumSetNextStep(supabase, payload, action, ctx, orgConnection.botToken);
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (action.action_id === 'momentum_mark_milestone') {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
          if (ctx && orgConnection?.botToken) {
            return handleMomentumMarkMilestone(supabase, payload, action, ctx, orgConnection.botToken);
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (action.action_id.startsWith('momentum_answer_')) {
          const ctx = await getSixtyUserContext(supabase, payload.user.id, payload.team?.id);
          const orgConnection = await getSlackOrgConnection(supabase, payload.team?.id);
          if (ctx && orgConnection?.botToken) {
            return handleMomentumAnswerQuestion(supabase, payload, action, ctx, orgConnection.botToken);
          }
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (action.action_id === 'momentum_log_activity') {
          // Reuse existing log activity handler with deal data from action value
          return handleLogDealActivity(supabase, payload, action);
        } else if (action.action_id === 'momentum_create_task') {
          // Reuse existing create task handler with deal data from action value
          return handleCreateTaskForDeal(supabase, payload, action);
        }

        // Phase 3: Debrief command actions
        else if (action.action_id === 'debrief_meeting_select') {
          return handleDebriefMeetingSelect(supabase, payload, action);
        } else if (action.action_id === 'debrief_draft_followup') {
          return handleDebriefDraftFollowup(supabase, payload, action);
        } else if (action.action_id === 'debrief_update_deal') {
          return handleDebriefUpdateDeal(supabase, payload, action);
        } else if (action.action_id.startsWith('add_task_')) {
          return handleDebriefAddTask(supabase, payload, action);
        } else if (action.action_id === 'add_all_tasks') {
          return handleDebriefAddAllTasks(supabase, payload, action);
        }

        // Phase 3: Message shortcut button actions
        else if (action.action_id === 'create_tasks_from_summary') {
          return handleCreateTasksFromSummary(supabase, payload, action);
        }

        // Phase 4: Task action handlers
        else if (action.action_id === 'task_complete') {
          return handleTaskComplete(supabase, payload, action);
        } else if (action.action_id === 'task_snooze_1d') {
          return handleTaskSnooze(supabase, payload, action, 1);
        } else if (action.action_id === 'task_snooze_1w') {
          return handleTaskSnooze(supabase, payload, action, 7);
        } else if (action.action_id === 'task_edit') {
          return handleTaskEdit(supabase, payload, action);
        } else if (action.action_id === 'task_overflow') {
          return handleTaskOverflow(supabase, payload, action);
        } else if (action.action_id === 'task_filter_overdue' ||
                   action.action_id === 'task_filter_today' ||
                   action.action_id === 'task_filter_week') {
          return handleTaskFilter(supabase, payload, action);
        } else if (action.action_id === 'open_add_task_modal') {
          return handleOpenAddTaskModal(supabase, payload);
        } else if (action.action_id === 'focus_task_done') {
          return handleFocusTaskDone(supabase, payload, action);
        } else if (action.action_id === 'focus_refresh') {
          return handleFocusRefresh(supabase, payload);
        } else if (action.action_id === 'focus_view_all') {
          return handleFocusViewAll(supabase, payload);
        } else if (action.action_id === 'focus_meeting_prep') {
          return handleFocusMeetingPrep(supabase, payload, action);
        }

        // Phase 5: Pipeline action handlers
        else if (action.action_id === 'pipeline_filter_all' ||
                 action.action_id === 'pipeline_filter_risk' ||
                 action.action_id === 'pipeline_filter_closing' ||
                 action.action_id === 'pipeline_filter_stale') {
          return handlePipelineFilter(supabase, payload, action);
        } else if (action.action_id === 'pipeline_view_stage') {
          return handlePipelineViewStage(supabase, payload, action);
        } else if (action.action_id === 'pipeline_deal_actions') {
          return handlePipelineDealOverflow(supabase, payload, action);
        } else if (action.action_id === 'pipeline_add_deal') {
          // Just acknowledge - the button has a URL
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Phase 5: Standup action handlers
        else if (action.action_id === 'standup_view_pipeline') {
          return handleStandupViewPipeline(supabase, payload);
        } else if (action.action_id === 'standup_view_risks') {
          return handleStandupViewRisks(supabase, payload);
        } else if (action.action_id === 'standup_view_tasks') {
          // Just acknowledge - the button has a URL
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Phase 5: Approvals action handlers
        else if (action.action_id === 'approval_actions') {
          return handleApprovalOverflow(supabase, payload, action);
        } else if (action.action_id === 'approvals_approve_all') {
          return handleApprovalsApproveAll(supabase, payload);
        } else if (action.action_id === 'approvals_refresh') {
          return handleApprovalsRefresh(supabase, payload);
        } else if (action.action_id === 'approvals_settings') {
          // Just acknowledge - the button has a URL
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Unknown action - just acknowledge
        console.log('Unknown action_id:', action.action_id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'view_submission': {
        // Handle modal submissions
        console.log('View submission:', payload.view?.callback_id);
        if (payload.view?.callback_id === 'log_activity_modal') {
          return handleLogActivitySubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'crm_edit_modal_submit') {
          console.log('[CRM Approval] Forwarding edit modal submission to agent-crm-approval');
          fetch(`${supabaseUrl}/functions/v1/agent-crm-approval`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'x-slack-request-timestamp': req.headers.get('x-slack-request-timestamp') || '',
              'x-slack-signature': req.headers.get('x-slack-signature') || '',
            },
            body: `payload=${encodeURIComponent(JSON.stringify(payload))}`,
          }).catch(err => console.error('[CRM Approval] Forward error:', err));
          return new Response('', { status: 200, headers: corsHeaders });
        }
        if (payload.view?.callback_id === 'hitl_edit_modal') {
          return handleHITLEditSubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'create_task_from_message_modal') {
          return handleCreateTaskFromMessageSubmission(supabase, payload);
        }
        // Phase 3: Message shortcut modal submissions
        if (payload.view?.callback_id === 'log_activity_from_message_modal') {
          return handleLogActivityFromMessageSubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'draft_reply_submit_modal') {
          return handleDraftReplySubmission(supabase, payload);
        }
        // Phase 2: Contact & Deal modal submissions
        if (payload.view?.callback_id === 'create_task_for_contact_modal' ||
            payload.view?.callback_id === 'create_task_for_deal_modal') {
          return handleCreateTaskModalSubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'update_deal_stage_modal') {
          return handleUpdateDealStageSubmission(supabase, payload);
        }
        // Phase 4: Deal Momentum modal submissions
        if (payload.view?.callback_id === 'momentum_set_next_step_modal') {
          return handleMomentumNextStepSubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'momentum_mark_milestone_modal') {
          return handleMomentumMilestoneSubmission(supabase, payload);
        }
        // Phase 4: Task modal submissions
        if (payload.view?.callback_id === 'add_task_modal') {
          return handleAddTaskModalSubmission(supabase, payload);
        }
        if (payload.view?.callback_id === 'edit_task_modal') {
          return handleEditTaskModalSubmission(supabase, payload);
        }
        return new Response('', { status: 200, headers: corsHeaders });
      }

      case 'message_action': {
        // Handle message shortcuts (right-click on message)
        console.log('Message action received:', payload.callback_id);
        if (payload.callback_id === 'create_task_from_message') {
          return handleCreateTaskFromMessage(supabase, payload);
        }
        // Phase 3: New message shortcuts
        if (payload.callback_id === 'summarize_thread') {
          return handleSummarizeThread(supabase, payload);
        }
        if (payload.callback_id === 'log_activity_from_message') {
          return handleLogActivityFromMessage(supabase, payload);
        }
        if (payload.callback_id === 'draft_reply') {
          return handleDraftReply(supabase, payload);
        }
        // Unknown message action - acknowledge
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'shortcut': {
        // Handle global shortcuts (future feature)
        console.log('Global shortcut received:', payload.callback_id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        console.warn('Unknown interaction type:', payload.type);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Error processing interactive payload:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
