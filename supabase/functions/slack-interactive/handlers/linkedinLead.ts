/**
 * LinkedIn Lead Email — Slack interactive handler
 *
 * Handles the 4 action buttons from LinkedIn lead notification DMs:
 *   approve::linkedin_lead_email::{hitlId}  → send the email
 *   edit::linkedin_lead_email::{hitlId}     → redirect to app
 *   reassign::linkedin_lead_email::{hitlId} → open modal with user picker
 *   reject::linkedin_lead_email::{hitlId}   → dismiss
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { recordSignal, type ApprovalEvent } from '../../_shared/autopilot/signals.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackAction {
  action_id: string
  value: string
  type: string
  block_id?: string
}

interface InteractivePayload {
  type: string
  user: { id: string; name?: string }
  channel?: { id: string }
  message?: { ts: string }
  response_url?: string
  trigger_id?: string
  actions?: SlackAction[]
  team?: { id: string; domain?: string }
}

interface HandleResult {
  success: boolean
  responseBlocks?: unknown[]
  error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function section(text: string) {
  return { type: 'section', text: { type: 'mrkdwn', text } }
}

function context(texts: string[]) {
  return { type: 'context', elements: texts.map((t) => ({ type: 'mrkdwn', text: t })) }
}

function divider() {
  return { type: 'divider' }
}

async function resolveUserId(
  supabase: ReturnType<typeof createClient>,
  slackUserId: string,
  teamId?: string,
): Promise<{ userId: string; orgId: string | null }> {
  let orgId: string | null = null
  if (teamId) {
    const { data: orgSettings } = await supabase
      .from('slack_org_settings')
      .select('org_id')
      .eq('slack_team_id', teamId)
      .maybeSingle()
    orgId = orgSettings?.org_id ?? null
  }

  const query = supabase
    .from('slack_user_mappings')
    .select('sixty_user_id, org_id')
    .eq('slack_user_id', slackUserId)

  const { data } = orgId
    ? await query.eq('org_id', orgId).maybeSingle()
    : await query.limit(1).maybeSingle()

  return {
    userId: data?.sixty_user_id || `slack:${slackUserId}`,
    orgId: data?.org_id || orgId,
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Returns non-null if the action_id matches `{action}::linkedin_lead_email::{id}`.
 */
export function isLinkedInLeadAction(actionId: string): boolean {
  return actionId.includes('::linkedin_lead_email::')
}

export async function handleLinkedInLeadAction(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<HandleResult> {
  const parts = action.action_id.split('::')
  if (parts.length !== 3) {
    return { success: false, error: 'Invalid action_id format' }
  }

  const [actionType, , hitlId] = parts
  let valuePayload: Record<string, unknown> = {}
  try {
    valuePayload = JSON.parse(action.value || '{}')
  } catch { /* ignore */ }

  const { userId, orgId } = await resolveUserId(supabase, payload.user.id, payload.team?.id)
  const startedAt = payload.message?.ts ? Number(payload.message.ts) * 1000 : Date.now()
  const timeToRespondMs = Date.now() - startedAt

  // Load the HITL approval record
  const { data: approval, error: loadErr } = await supabase
    .from('hitl_pending_approvals')
    .select('id, status, resource_type, resource_name, original_content, org_id, user_id, callback_type, callback_target, callback_metadata')
    .eq('id', hitlId)
    .maybeSingle()

  if (loadErr || !approval) {
    return {
      success: false,
      responseBlocks: [
        section('This approval has expired or was already handled.'),
        context([`<@${payload.user.id}> tried to ${actionType} at ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`]),
      ],
      error: 'Approval not found',
    }
  }

  if (approval.status !== 'pending') {
    return {
      success: true,
      responseBlocks: [
        section(`This lead email was already *${approval.status}*.`),
        context([`<@${payload.user.id}> · ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`]),
      ],
    }
  }

  const contactId = (valuePayload.contact_id as string) || (approval.callback_metadata as Record<string, unknown>)?.contact_id as string || null
  const contactName = (approval.original_content as Record<string, unknown>)?.contact_name as string || 'Contact'
  const companyName = (approval.original_content as Record<string, unknown>)?.company_name as string || ''
  const subject = (approval.original_content as Record<string, unknown>)?.subject as string || ''
  const entitySummary = `${contactName}${companyName ? ` (${companyName})` : ''}`
  const ts = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  switch (actionType) {
    case 'approve': {
      // Update HITL status
      await supabase
        .from('hitl_pending_approvals')
        .update({ status: 'approved', actioned_by: userId, actioned_at: new Date().toISOString() })
        .eq('id', hitlId)

      // Send the email via callback
      const callbackResult = await triggerCallback(supabase, approval, 'approved')

      // Record signal (fire-and-forget)
      const signalEvent: ApprovalEvent = {
        user_id: userId,
        org_id: orgId || approval.org_id,
        action_type: 'linkedin_lead_email',
        agent_name: 'linkedin-lead-ingest',
        signal: 'approved',
        time_to_respond_ms: timeToRespondMs,
        autonomy_tier_at_time: 'approve',
        contact_id: contactId ?? undefined,
      }
      recordSignal(supabase, signalEvent).catch(() => {})

      // Check for autonomy promotion (fire-and-forget)
      checkAutonomyPromotion(supabase, orgId || approval.org_id, userId, payload.user.id).catch(() => {})

      return {
        success: true,
        responseBlocks: [
          section(`*${entitySummary}* — Email ${callbackResult.ok ? 'Sent' : 'Queued'}`),
          context([
            subject ? `Subject: ${subject}` : null,
            `Approved by <@${payload.user.id}> · ${ts}`,
          ].filter(Boolean) as string[]),
        ],
      }
    }

    case 'edit': {
      // Update HITL to 'editing' state
      await supabase
        .from('hitl_pending_approvals')
        .update({ status: 'editing', actioned_by: userId, actioned_at: new Date().toISOString() })
        .eq('id', hitlId)

      // Build app URL for editing
      const appUrl = contactId
        ? `${Deno.env.get('APP_URL') || 'https://app.use60.com'}/contacts/${contactId}?draft=${hitlId}`
        : `${Deno.env.get('APP_URL') || 'https://app.use60.com'}/command-centre?highlight=${hitlId}`

      return {
        success: true,
        responseBlocks: [
          section(`*${entitySummary}* — Editing`),
          section(`<${appUrl}|Open in 60 to edit the draft>`),
          context([`Editing by <@${payload.user.id}> · ${ts}`]),
        ],
      }
    }

    case 'reassign': {
      // Open a Slack modal with user picker
      if (!payload.trigger_id) {
        return { success: false, error: 'No trigger_id for modal' }
      }

      const botToken = Deno.env.get('SLACK_BOT_TOKEN')
      if (!botToken) {
        return { success: false, error: 'Slack bot token not configured' }
      }

      const modalView = {
        type: 'modal',
        callback_id: `linkedin_lead_reassign::${hitlId}`,
        title: { type: 'plain_text', text: 'Reassign Lead' },
        submit: { type: 'plain_text', text: 'Reassign' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `Reassign the email draft for *${entitySummary}* to another team member.` },
          },
          {
            type: 'input',
            block_id: 'reassign_user',
            element: {
              type: 'users_select',
              action_id: 'selected_user',
              placeholder: { type: 'plain_text', text: 'Choose a user' },
            },
            label: { type: 'plain_text', text: 'Assign to' },
          },
        ],
      }

      await fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trigger_id: payload.trigger_id,
          view: modalView,
        }),
      })

      return {
        success: true,
        responseBlocks: [
          section(`*${entitySummary}* — Reassigning...`),
          context([`<@${payload.user.id}> is reassigning · ${ts}`]),
        ],
      }
    }

    case 'reject': {
      // Dismiss / reject the lead email
      await supabase
        .from('hitl_pending_approvals')
        .update({ status: 'rejected', actioned_by: userId, actioned_at: new Date().toISOString() })
        .eq('id', hitlId)

      // Record signal
      const rejectSignal: ApprovalEvent = {
        user_id: userId,
        org_id: orgId || approval.org_id,
        action_type: 'linkedin_lead_email',
        agent_name: 'linkedin-lead-ingest',
        signal: 'rejected',
        time_to_respond_ms: timeToRespondMs,
        autonomy_tier_at_time: 'approve',
        contact_id: contactId ?? undefined,
      }
      recordSignal(supabase, rejectSignal).catch(() => {})

      return {
        success: true,
        responseBlocks: [
          section(`*${entitySummary}* — Dismissed`),
          context([`Dismissed by <@${payload.user.id}> · ${ts}`]),
        ],
      }
    }

    default:
      return { success: false, error: `Unknown action: ${actionType}` }
  }
}

// ---------------------------------------------------------------------------
// Reassign modal submission handler
// ---------------------------------------------------------------------------

export async function handleLinkedInLeadReassignSubmission(
  supabase: ReturnType<typeof createClient>,
  payload: InteractivePayload & { view?: { callback_id: string; state?: { values: Record<string, Record<string, { selected_user: string }>> } } },
): Promise<HandleResult> {
  const callbackId = payload.view?.callback_id || ''
  const hitlId = callbackId.replace('linkedin_lead_reassign::', '')

  const selectedSlackUser = payload.view?.state?.values?.reassign_user?.selected_user?.selected_user
  if (!selectedSlackUser) {
    return { success: false, error: 'No user selected' }
  }

  // Resolve new user
  const { userId: newUserId } = await resolveUserId(supabase, selectedSlackUser, payload.team?.id)

  // Update the approval record to the new user
  await supabase
    .from('hitl_pending_approvals')
    .update({ user_id: newUserId, updated_at: new Date().toISOString() })
    .eq('id', hitlId)

  // Send a new DM to the reassigned user with the lead info
  const { data: approval } = await supabase
    .from('hitl_pending_approvals')
    .select('id, resource_name, original_content')
    .eq('id', hitlId)
    .maybeSingle()

  if (approval) {
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (botToken) {
      const content = approval.original_content as Record<string, unknown> || {}
      const contactName = (content.contact_name as string) || 'Contact'
      const companyName = (content.company_name as string) || ''

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: selectedSlackUser,
          text: `LinkedIn lead reassigned to you: ${contactName}${companyName ? ` (${companyName})` : ''}`,
          blocks: [
            section(`*LinkedIn lead reassigned to you*\n${contactName}${companyName ? ` (${companyName})` : ''}`),
            context([`Reassigned by <@${payload.user.id}>`]),
            divider(),
            section(`Please review in <${Deno.env.get('APP_URL') || 'https://app.use60.com'}/command-centre?highlight=${hitlId}|the Command Centre>.`),
          ],
        }),
      })
    }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// Trigger callback (send email)
// ---------------------------------------------------------------------------

async function triggerCallback(
  supabase: ReturnType<typeof createClient>,
  approval: Record<string, unknown>,
  action: 'approved' | 'rejected',
): Promise<{ ok: boolean; error?: string }> {
  const callbackType = approval.callback_type as string | null
  const callbackTarget = approval.callback_target as string | null

  if (!callbackType || !callbackTarget) {
    return { ok: true } // No callback configured
  }

  try {
    if (callbackType === 'edge_function') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      const functionUrl = `${supabaseUrl}/functions/v1/${callbackTarget}`

      const resp = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          approval_id: approval.id,
          resource_type: approval.resource_type,
          action,
          content: approval.original_content,
          callback_metadata: approval.callback_metadata,
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error(`[linkedinLead] Callback failed: ${resp.status} ${errText}`)
        return { ok: false, error: errText }
      }
      return { ok: true }
    }

    return { ok: true }
  } catch (err) {
    console.error('[linkedinLead] Callback error:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown' }
  }
}

// ---------------------------------------------------------------------------
// Autonomy promotion check — after 5 consecutive clean approvals
// ---------------------------------------------------------------------------

const PROMOTION_THRESHOLD = 5
const PROMOTION_COOLDOWN_DAYS = 7

async function checkAutonomyPromotion(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  slackUserId: string,
): Promise<void> {
  try {
    // Check if already auto
    const { data: existingPolicy } = await supabase
      .from('autonomy_policies')
      .select('policy')
      .eq('org_id', orgId)
      .eq('action_type', 'linkedin_lead_email')
      .is('user_id', null)
      .maybeSingle()

    if (existingPolicy?.policy === 'auto') return // Already promoted

    // Check cooldown
    const { data: confidence } = await supabase
      .from('autopilot_confidence')
      .select('cooldown_until')
      .eq('org_id', orgId)
      .eq('action_type', 'linkedin_lead_email')
      .maybeSingle()

    if (confidence?.cooldown_until && new Date(confidence.cooldown_until) > new Date()) {
      return // Still in cooldown
    }

    // Get last N signals for this action type
    const { data: signals } = await supabase
      .from('autopilot_signals')
      .select('signal')
      .eq('org_id', orgId)
      .eq('action_type', 'linkedin_lead_email')
      .order('created_at', { ascending: false })
      .limit(PROMOTION_THRESHOLD)

    if (!signals || signals.length < PROMOTION_THRESHOLD) return

    // All must be clean approvals (no edits, no rejections)
    const allClean = signals.every((s: { signal: string }) => s.signal === 'approved')
    if (!allClean) return

    // Send promotion DM via Slack
    const botToken = Deno.env.get('SLACK_BOT_TOKEN')
    if (!botToken) return

    // Create a promotion record
    const { data: promotion } = await supabase
      .from('autonomy_audit_log')
      .insert({
        org_id: orgId,
        action_type: 'linkedin_lead_email',
        old_tier: 'approve',
        new_tier: 'auto',
        reason: `${PROMOTION_THRESHOLD} consecutive clean approvals`,
        triggered_by: 'system',
        status: 'proposed',
      })
      .select('id')
      .single()

    const promotionId = promotion?.id || crypto.randomUUID()

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackUserId,
        text: 'LinkedIn lead emails: Enable auto-send?',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Auto-send LinkedIn lead emails?*\n\nYou've approved ${PROMOTION_THRESHOLD} LinkedIn lead emails in a row without edits. Want 60 to send these automatically going forward?\n\nYou can always revert this in Settings > Integrations > LinkedIn.`,
            },
          },
          { type: 'divider' },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Enable Auto-Send', emoji: true },
                style: 'primary',
                action_id: 'autonomy_promotion_approve',
                value: JSON.stringify({ promotion_id: promotionId, org_id: orgId, action_type: 'linkedin_lead_email' }),
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Not Yet', emoji: true },
                action_id: 'autonomy_promotion_reject',
                value: JSON.stringify({ promotion_id: promotionId, org_id: orgId, action_type: 'linkedin_lead_email' }),
              },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    console.error('[linkedinLead] Autonomy promotion check error:', err)
  }
}
