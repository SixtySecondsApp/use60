/**
 * agent-crm-approval (CRM-007)
 *
 * Handles Slack interactive payloads for CRM field update approvals.
 * Receives button clicks from buildCRMApprovalMessage() Block Kit messages.
 *
 * Actions handled:
 *   crm_approve::{field_name}::{queue_id}   — approve single field
 *   crm_reject::{field_name}::{queue_id}    — reject single field
 *   crm_edit::{field_name}::{queue_id}      — open edit modal
 *   crm_approve_all::{deal_id}              — batch approve all pending fields for deal
 *   crm_reject_all::{deal_id}              — batch reject all pending fields for deal
 * Modal callback_id:
 *   crm_edit_modal_submit                   — user submitted edited value
 *
 * Auth: Slack signing secret verification (no JWT — Slack sends unsigned requests).
 * Deploy with --no-verify-jwt.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  getCorsHeaders,
} from '../_shared/corsHelper.ts';

// =============================================================================
// Config
// =============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET');
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

// =============================================================================
// Types
// =============================================================================

interface SlackAction {
  action_id: string;
  value: string;
  type: string;
  block_id?: string;
}

interface InteractivePayload {
  type: 'block_actions' | 'view_submission';
  user: { id: string; name?: string };
  channel?: { id: string };
  message?: { ts: string; blocks?: unknown[] };
  response_url?: string;
  trigger_id?: string;
  actions?: SlackAction[];
  team?: { id: string; domain?: string };
  view?: {
    id: string;
    callback_id: string;
    private_metadata?: string;
    state?: {
      values: Record<string, Record<string, { value?: string }>>;
    };
  };
}

interface QueueEntry {
  id: string;
  org_id: string;
  user_id: string;
  deal_id: string;
  field_name: string;
  proposed_value: unknown;
  current_value: unknown;
  status: string;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
}

// =============================================================================
// Auth: Slack request signature verification
// =============================================================================

async function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) {
    const allowInsecure = Deno.env.get('ALLOW_INSECURE_SLACK_SIGNATURES') === 'true';
    if (allowInsecure) {
      console.warn('[crm-approval] ALLOW_INSECURE_SLACK_SIGNATURES=true — skipping verification');
      return true;
    }
    console.error('[crm-approval] SLACK_SIGNING_SECRET not set');
    return false;
  }

  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SLACK_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(sigBase));
  const hex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const computed = `v0=${hex}`;

  return computed === signature;
}

// =============================================================================
// Helpers
// =============================================================================

async function getUserContext(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string,
  teamId?: string
): Promise<{ userId: string; orgId: string } | null> {
  // Resolve org via team ID
  let orgId: string | null = null;
  if (teamId) {
    const { data: orgSettings } = await supabase
      .from('slack_org_settings')
      .select('org_id')
      .eq('slack_team_id', teamId)
      .eq('is_connected', true)
      .maybeSingle();
    orgId = orgSettings?.org_id ?? null;
  }

  // Build query
  let query = supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId);

  if (orgId) query = query.eq('org_id', orgId);

  const { data } = await query.maybeSingle();
  if (!data?.sixty_user_id) return null;

  return {
    userId: data.sixty_user_id,
    orgId: data.org_id ?? orgId ?? '',
  };
}

async function getOrgBotToken(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle();
  return data?.bot_access_token ?? null;
}

/**
 * Update the original Slack message via chat.update to reflect new state.
 */
async function updateOriginalMessage(
  botToken: string,
  channelId: string,
  messageTs: string,
  blocks: unknown[],
  fallbackText: string
): Promise<void> {
  try {
    const res = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: fallbackText,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn('[crm-approval] chat.update error:', data.error);
    }
  } catch (err) {
    console.error('[crm-approval] chat.update exception:', err);
  }
}

/**
 * Send ephemeral acknowledgement via response_url.
 */
async function sendEphemeral(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: false,
        text,
      }),
    });
  } catch (err) {
    console.error('[crm-approval] sendEphemeral exception:', err);
  }
}

/**
 * Open a Slack modal for field editing.
 */
async function openEditModal(
  triggerId: string,
  botToken: string,
  queueId: string,
  fieldName: string,
  currentValue: unknown
): Promise<void> {
  const displayValue = currentValue !== null && currentValue !== undefined
    ? String(currentValue)
    : '';

  const view = {
    type: 'modal',
    callback_id: 'crm_edit_modal_submit',
    private_metadata: JSON.stringify({ queueId, fieldName }),
    title: { type: 'plain_text', text: 'Edit CRM Field' },
    submit: { type: 'plain_text', text: 'Apply' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Editing:* ${fieldName.replace(/_/g, ' ')}`,
        },
      },
      {
        type: 'input',
        block_id: 'crm_edit_value_block',
        label: { type: 'plain_text', text: 'New Value' },
        element: {
          type: 'plain_text_input',
          action_id: 'crm_edit_value_input',
          initial_value: displayValue,
          multiline: displayValue.length > 80,
        },
      },
    ],
  };

  const res = await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trigger_id: triggerId, view }),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error('[crm-approval] views.open error:', data.error);
  }
}

/**
 * Apply an approved/edited value to the deals table.
 */
async function applyFieldToDeal(
  supabase: ReturnType<typeof createClient>,
  dealId: string,
  fieldName: string,
  newValue: unknown
): Promise<{ success: boolean; error?: string }> {
  // Map field names to deals table columns (mirrors crmUpdate.ts FIELD_MAPPING)
  const columnMap: Record<string, string> = {
    stage: 'stage_id', // requires lookup — handled separately
    next_steps: 'next_steps',
    close_date: 'expected_close_date',
    deal_value: 'value',
    // note/summary/stakeholders/blockers — append to notes
    stakeholders: 'notes',
    blockers: 'notes',
    summary: 'notes',
  };

  const column = columnMap[fieldName];
  if (!column) {
    return { success: false, error: `Unknown field: ${fieldName}` };
  }

  try {
    if (fieldName === 'stage') {
      // Look up stage by name
      const { data: stageData } = await supabase
        .from('deal_stages')
        .select('id')
        .ilike('name', String(newValue))
        .limit(1)
        .maybeSingle();

      if (!stageData) {
        return { success: false, error: `Stage not found: ${newValue}` };
      }

      const { error } = await supabase
        .from('deals')
        .update({ stage_id: stageData.id, stage_changed_at: new Date().toISOString() })
        .eq('id', dealId);

      return { success: !error, error: error?.message };
    }

    if (['stakeholders', 'blockers', 'summary'].includes(fieldName)) {
      // Append to notes
      const { data: dealData } = await supabase
        .from('deals')
        .select('notes')
        .eq('id', dealId)
        .maybeSingle();

      const existingNotes = dealData?.notes || '';
      const prefix = fieldName === 'summary' ? 'Meeting Summary'
        : fieldName === 'stakeholders' ? 'Stakeholders'
        : 'Blockers';
      const timestamp = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const separator = existingNotes ? '\n\n' : '';
      const newNotes = `${existingNotes}${separator}[${timestamp}] ${prefix}: ${String(newValue)}`;

      const { error } = await supabase
        .from('deals')
        .update({ notes: newNotes })
        .eq('id', dealId);

      return { success: !error, error: error?.message };
    }

    // Direct column update
    const { error } = await supabase
      .from('deals')
      .update({ [column]: newValue, updated_at: new Date().toISOString() })
      .eq('id', dealId);

    return { success: !error, error: error?.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Record approval decision in crm_field_updates.
 */
async function recordFieldUpdate(
  supabase: ReturnType<typeof createClient>,
  entry: QueueEntry,
  userId: string,
  status: 'approved' | 'rejected' | 'edited',
  editedValue?: unknown
): Promise<void> {
  try {
    await supabase.from('crm_field_updates').insert({
      org_id: entry.org_id,
      deal_id: entry.deal_id,
      user_id: userId,
      field_name: entry.field_name,
      old_value: entry.current_value !== null ? JSON.parse(JSON.stringify(entry.current_value)) : null,
      new_value: editedValue !== undefined
        ? JSON.parse(JSON.stringify(editedValue))
        : JSON.parse(JSON.stringify(entry.proposed_value)),
      status,
      change_source: status === 'approved' ? 'slack_approved'
        : status === 'edited' ? 'slack_edited'
        : 'slack_rejected',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[crm-approval] Failed to record crm_field_update:', err);
  }
}

// =============================================================================
// Confirmation message builder (replaces original after action)
// =============================================================================

function buildConfirmationBlocks(
  action: 'approved' | 'rejected' | 'edited' | 'approved_all' | 'rejected_all',
  slackUserId: string,
  detail?: string
): unknown[] {
  const config = {
    approved: { label: 'Approved', icon: '' },
    rejected: { label: 'Rejected', icon: '' },
    edited: { label: 'Edited & Applied', icon: '' },
    approved_all: { label: 'All fields approved', icon: '' },
    rejected_all: { label: 'All fields rejected', icon: '' },
  }[action];

  const timestamp = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${config.icon} *${config.label}* by <@${slackUserId}>` +
          (detail ? `\n_${detail}_` : ''),
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: timestamp }],
    },
  ];

  return blocks;
}

// =============================================================================
// Action handlers
// =============================================================================

async function handleApprove(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  const { queueId } = JSON.parse(action.value);

  // Fetch queue entry
  const { data: entry } = await supabase
    .from('crm_approval_queue')
    .select('id, org_id, user_id, deal_id, field_name, proposed_value, current_value, status, slack_message_ts, slack_channel_id')
    .eq('id', queueId)
    .maybeSingle() as { data: QueueEntry | null };

  if (!entry) {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'Approval entry not found.');
    return;
  }

  if (entry.status === 'expired') {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'This approval has expired.');
    return;
  }

  if (entry.status !== 'pending') {
    if (payload.response_url) await sendEphemeral(payload.response_url, `This field was already ${entry.status}.`);
    return;
  }

  // Apply to deals table
  const applyResult = await applyFieldToDeal(supabase, entry.deal_id, entry.field_name, entry.proposed_value);
  const newStatus = applyResult.success ? 'approved' : 'failed';

  // Update queue entry
  await supabase
    .from('crm_approval_queue')
    .update({
      status: newStatus,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);

  // Record in crm_field_updates
  if (applyResult.success) {
    await recordFieldUpdate(supabase, entry, ctx.userId, 'approved');
  }

  // Update original Slack message
  if (entry.slack_channel_id && entry.slack_message_ts) {
    const botToken = await getOrgBotToken(supabase, ctx.orgId);
    if (botToken) {
      const fieldLabel = entry.field_name.replace(/_/g, ' ');
      await updateOriginalMessage(
        botToken,
        entry.slack_channel_id,
        entry.slack_message_ts,
        buildConfirmationBlocks('approved', payload.user.id, `${fieldLabel} approved`),
        `CRM field approved by ${payload.user.name || payload.user.id}`
      );
    }
  }
}

async function handleReject(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  const { queueId } = JSON.parse(action.value);

  const { data: entry } = await supabase
    .from('crm_approval_queue')
    .select('id, org_id, user_id, deal_id, field_name, proposed_value, current_value, status, slack_message_ts, slack_channel_id')
    .eq('id', queueId)
    .maybeSingle() as { data: QueueEntry | null };

  if (!entry) {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'Approval entry not found.');
    return;
  }

  if (entry.status === 'expired') {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'This approval has expired.');
    return;
  }

  if (entry.status !== 'pending') {
    if (payload.response_url) await sendEphemeral(payload.response_url, `This field was already ${entry.status}.`);
    return;
  }

  await supabase
    .from('crm_approval_queue')
    .update({
      status: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);

  await recordFieldUpdate(supabase, entry, ctx.userId, 'rejected');

  if (entry.slack_channel_id && entry.slack_message_ts) {
    const botToken = await getOrgBotToken(supabase, ctx.orgId);
    if (botToken) {
      const fieldLabel = entry.field_name.replace(/_/g, ' ');
      await updateOriginalMessage(
        botToken,
        entry.slack_channel_id,
        entry.slack_message_ts,
        buildConfirmationBlocks('rejected', payload.user.id, `${fieldLabel} rejected`),
        `CRM field rejected by ${payload.user.name || payload.user.id}`
      );
    }
  }
}

async function handleEdit(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  if (!payload.trigger_id) {
    console.warn('[crm-approval] No trigger_id for edit modal');
    return;
  }

  const { queueId, fieldName } = JSON.parse(action.value);

  const { data: entry } = await supabase
    .from('crm_approval_queue')
    .select('proposed_value, status')
    .eq('id', queueId)
    .maybeSingle();

  if (!entry) {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'Approval entry not found.');
    return;
  }

  if (entry.status === 'expired') {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'This approval has expired.');
    return;
  }

  const botToken = await getOrgBotToken(supabase, ctx.orgId);
  if (!botToken) {
    console.error('[crm-approval] No bot token for edit modal');
    return;
  }

  await openEditModal(payload.trigger_id, botToken, queueId, fieldName, entry.proposed_value);
}

async function handleApproveAll(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  const { queueIds, dealId } = JSON.parse(action.value);

  const { data: entries } = await supabase
    .from('crm_approval_queue')
    .select('id, org_id, user_id, deal_id, field_name, proposed_value, current_value, status, slack_message_ts, slack_channel_id')
    .in('id', queueIds)
    .eq('status', 'pending') as { data: QueueEntry[] | null };

  if (!entries?.length) {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'No pending approvals found.');
    return;
  }

  // Apply all fields
  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const applyResult = await applyFieldToDeal(supabase, entry.deal_id, entry.field_name, entry.proposed_value);
      const newStatus = applyResult.success ? 'approved' : 'failed';

      await supabase
        .from('crm_approval_queue')
        .update({
          status: newStatus,
          approved_by: ctx.userId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      if (applyResult.success) {
        await recordFieldUpdate(supabase, entry, ctx.userId, 'approved');
      }
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;

  // Update the Slack message
  if (entries[0]?.slack_channel_id && entries[0]?.slack_message_ts) {
    const botToken = await getOrgBotToken(supabase, ctx.orgId);
    if (botToken) {
      await updateOriginalMessage(
        botToken,
        entries[0].slack_channel_id,
        entries[0].slack_message_ts,
        buildConfirmationBlocks('approved_all', payload.user.id, `${succeeded} field(s) applied`),
        `All CRM fields approved by ${payload.user.name || payload.user.id}`
      );
    }
  }
}

async function handleRejectAll(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  const { queueIds, dealId } = JSON.parse(action.value);

  const { data: entries } = await supabase
    .from('crm_approval_queue')
    .select('id, org_id, user_id, deal_id, field_name, proposed_value, current_value, status, slack_message_ts, slack_channel_id')
    .in('id', queueIds)
    .eq('status', 'pending') as { data: QueueEntry[] | null };

  if (!entries?.length) {
    if (payload.response_url) await sendEphemeral(payload.response_url, 'No pending approvals found.');
    return;
  }

  await supabase
    .from('crm_approval_queue')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .in('id', entries.map((e) => e.id));

  await Promise.allSettled(
    entries.map((entry) => recordFieldUpdate(supabase, entry, ctx.userId, 'rejected'))
  );

  if (entries[0]?.slack_channel_id && entries[0]?.slack_message_ts) {
    const botToken = await getOrgBotToken(supabase, ctx.orgId);
    if (botToken) {
      await updateOriginalMessage(
        botToken,
        entries[0].slack_channel_id,
        entries[0].slack_message_ts,
        buildConfirmationBlocks('rejected_all', payload.user.id, `${entries.length} field(s) rejected`),
        `All CRM fields rejected by ${payload.user.name || payload.user.id}`
      );
    }
  }
}

async function handleModalSubmit(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  ctx: { userId: string; orgId: string }
): Promise<void> {
  if (!payload.view) return;

  let queueId: string;
  let fieldName: string;
  try {
    const meta = JSON.parse(payload.view.private_metadata || '{}');
    queueId = meta.queueId;
    fieldName = meta.fieldName;
  } catch {
    console.error('[crm-approval] Invalid modal private_metadata');
    return;
  }

  const editedValue = payload.view.state?.values?.crm_edit_value_block?.crm_edit_value_input?.value;
  if (editedValue === undefined || editedValue === null) return;

  const { data: entry } = await supabase
    .from('crm_approval_queue')
    .select('id, org_id, user_id, deal_id, field_name, proposed_value, current_value, status, slack_message_ts, slack_channel_id')
    .eq('id', queueId)
    .maybeSingle() as { data: QueueEntry | null };

  if (!entry || entry.status !== 'pending') return;

  const applyResult = await applyFieldToDeal(supabase, entry.deal_id, entry.field_name, editedValue);

  await supabase
    .from('crm_approval_queue')
    .update({
      status: applyResult.success ? 'edited' : 'failed',
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      edited_value: editedValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);

  if (applyResult.success) {
    await recordFieldUpdate(supabase, entry, ctx.userId, 'edited', editedValue);
  }

  // Update original Slack message
  if (entry.slack_channel_id && entry.slack_message_ts) {
    const botToken = await getOrgBotToken(supabase, ctx.orgId);
    if (botToken) {
      const fieldLabel = entry.field_name.replace(/_/g, ' ');
      await updateOriginalMessage(
        botToken,
        entry.slack_channel_id,
        entry.slack_message_ts,
        buildConfirmationBlocks('edited', payload.user.id, `${fieldLabel} updated to: ${String(editedValue).slice(0, 80)}`),
        `CRM field edited and applied by ${payload.user.name || payload.user.id}`
      );
    }
  }
}

// =============================================================================
// Main handler
// =============================================================================

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // Verify Slack signature
    const timestamp = req.headers.get('x-slack-request-timestamp');
    const signature = req.headers.get('x-slack-signature');
    const isValid = await verifySlackSignature(rawBody, timestamp, signature);

    if (!isValid) {
      console.error('[crm-approval] Invalid Slack signature');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Parse URL-encoded payload
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');

    if (!payloadStr) {
      return new Response('Bad Request: missing payload', { status: 400, headers: corsHeaders });
    }

    const payload: InteractivePayload = JSON.parse(payloadStr);

    // Must respond within 3s — Slack times out quickly
    // Acknowledge immediately, process async
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

    // Process in background
    (async () => {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const ctx = await getUserContext(supabase, payload.user.id, payload.team?.id);
        if (!ctx) {
          console.warn('[crm-approval] No user context for Slack user:', payload.user.id);
          if (payload.response_url) {
            await sendEphemeral(
              payload.response_url,
              'Your Slack account is not linked to Sixty. Please link it in Settings.'
            );
          }
          return;
        }

        // Modal submission
        if (payload.type === 'view_submission' && payload.view?.callback_id === 'crm_edit_modal_submit') {
          await handleModalSubmit(supabase, payload, ctx);
          return;
        }

        // Block actions
        if (payload.type === 'block_actions' && payload.actions?.length) {
          for (const action of payload.actions) {
            const actionId = action.action_id;

            if (actionId.startsWith('crm_approve::') && !actionId.startsWith('crm_approve_all')) {
              await handleApprove(supabase, payload, action, ctx);
            } else if (actionId.startsWith('crm_reject::') && !actionId.startsWith('crm_reject_all')) {
              await handleReject(supabase, payload, action, ctx);
            } else if (actionId.startsWith('crm_edit::')) {
              await handleEdit(supabase, payload, action, ctx);
            } else if (actionId.startsWith('crm_approve_all::')) {
              await handleApproveAll(supabase, payload, action, ctx);
            } else if (actionId.startsWith('crm_reject_all::')) {
              await handleRejectAll(supabase, payload, action, ctx);
            } else {
              console.log('[crm-approval] Unhandled action_id:', actionId);
            }
          }
        }
      } catch (err) {
        console.error('[crm-approval] Background processing error:', err);
      }
    })();

    return response;
  } catch (error) {
    console.error('[crm-approval] Fatal error:', error);
    return new Response('Internal Server Error', { status: 500, headers: getCorsHeaders(req) });
  }
});
