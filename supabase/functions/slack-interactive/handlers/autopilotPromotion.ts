/**
 * Autopilot Promotion Handler — AP-016
 *
 * Handles button clicks from the autopilot promotion proposal Slack DMs
 * sent by AP-015 (`promotionSlack.ts`).
 *
 * action_id values:
 *   - autopilot_promote_accept      — rep accepts single promotion
 *   - autopilot_promote_decline     — rep declines (ask again in 30 days)
 *   - autopilot_promote_never       — rep permanently blocks this action type
 *   - autopilot_promote_accept_all  — rep accepts all batch promotions
 *   - autopilot_promote_pick        — rep wants to pick individually (deferred UI)
 *
 * Button value payloads (JSON):
 *   accept:      { user_id, action_type, to_tier }
 *   decline:     { user_id, action_type }
 *   never:       { user_id, action_type }
 *   accept_all:  { user_id, action_types: string[], to_tiers: Record<string, string> }
 *   pick:        { user_id, candidates: Array<{ action_type, to_tier, confidence_score }> }
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { recordPromotionEvent } from '../../_shared/autonomy/promotionEngine.ts'
import { updateRepMemory } from '../../_shared/autopilot/confidence.ts'
import { executeDemotion } from '../../_shared/autopilot/demotionEngine.ts'

// =============================================================================
// Types
// =============================================================================

interface SlackAction {
  action_id: string
  value: string
  type: string
  block_id?: string
}

interface InteractivePayload {
  user: {
    id: string
    name?: string
  }
  response_url?: string
  message?: { ts: string }
  channel?: { id: string }
  team?: { id: string; domain?: string }
}

// Value shapes per action
interface AcceptValue {
  user_id: string
  action_type: string
  to_tier: string
}

interface DeclineValue {
  user_id: string
  action_type: string
}

interface NeverValue {
  user_id: string
  action_type: string
}

interface AcceptAllValue {
  user_id: string
  action_types: string[]
  to_tiers: Record<string, string>
}

interface PickValue {
  user_id: string
  candidates: Array<{
    action_type: string
    to_tier: string
    confidence_score?: number
  }>
}

interface DemotionRevertValue {
  user_id: string
  action_type: string
}

interface DemotionKeepValue {
  user_id: string
  action_type: string
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Update the original Slack message via response_url. Fire-and-forget safe. */
async function updateSlackMessage(
  responseUrl: string,
  text: string,
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: text.substring(0, 3000) },
          },
        ],
      }),
    })
  } catch (err) {
    console.error('[autopilotPromotion] updateSlackMessage error:', err)
  }
}

const ACTION_TYPE_DISPLAY: Record<string, string> = {
  'crm.note_add': 'CRM note adding',
  'crm.activity_log': 'activity logging',
  'crm.contact_enrich': 'contact enrichment',
  'crm.next_steps_update': 'next steps updates',
  'crm.deal_field_update': 'deal field updates',
  'crm.deal_stage_change': 'deal stage changes',
  'crm.deal_amount_change': 'deal amount changes',
  'crm.deal_close_date_change': 'close date changes',
  'email.draft_save': 'email draft saving',
  'email.send': 'email sending',
  'email.follow_up_send': 'follow-up email sending',
  'email.check_in_send': 'check-in email sending',
  'task.create': 'task creation',
  'task.assign': 'task assignment',
  'calendar.create_event': 'meeting scheduling',
  'calendar.reschedule': 'meeting rescheduling',
  'sequence.start': 'sequence starting',
  'slack.notification_send': 'Slack notifications',
  'slack.briefing_send': 'Slack briefings',
}

function displayName(actionType: string): string {
  return ACTION_TYPE_DISPLAY[actionType] ?? actionType.replace(/[._]/g, ' ')
}

// =============================================================================
// Individual handlers
// =============================================================================

/**
 * autopilot_promote_accept — rep accepts a single promotion.
 * Value: { user_id, action_type, to_tier }
 */
async function handleAutopilotPromoteAccept(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: AcceptValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] accept: failed to parse value:', action.value)
    return
  }

  const { user_id, action_type, to_tier } = parsed
  if (!user_id || !action_type || !to_tier) {
    console.error('[autopilotPromotion] accept: missing required fields in value')
    return
  }

  // 1. Fetch current tier before updating (needed for audit log)
  const { data: existing } = await supabase
    .from('autopilot_confidence')
    .select('current_tier, org_id')
    .eq('user_id', user_id)
    .eq('action_type', action_type)
    .maybeSingle()

  const from_tier: string = existing?.current_tier ?? 'suggest'
  const org_id: string = existing?.org_id ?? ''

  // 2. Update autopilot_confidence
  const { error: updateError } = await supabase
    .from('autopilot_confidence')
    .update({
      current_tier: to_tier,
      promotion_eligible: false,
      cooldown_until: null,
    })
    .eq('user_id', user_id)
    .eq('action_type', action_type)

  if (updateError) {
    console.error('[autopilotPromotion] accept: confidence update error:', updateError)
  }

  // 3. Record audit event
  if (org_id) {
    recordPromotionEvent(supabase, {
      org_id,
      user_id,
      action_type,
      event_type: 'promotion_accepted',
      from_tier,
      to_tier,
      trigger_reason: 'User accepted promotion via Slack',
    }).catch(() => {})
  }

  // 4. Update rep memory (fire-and-forget)
  if (org_id) {
    updateRepMemory(supabase, user_id, org_id).catch(() => {})
  }

  // 5. Update Slack message
  if (payload.response_url) {
    const label = displayName(action_type)
    await updateSlackMessage(
      payload.response_url,
      `Done! I'll now handle *${label}* automatically. You'll see a summary in your daily digest.`,
    )
  }
}

/**
 * autopilot_promote_decline — rep declines, 30-day cooldown.
 * Value: { user_id, action_type }
 */
async function handleAutopilotPromoteDecline(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: DeclineValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] decline: failed to parse value:', action.value)
    return
  }

  const { user_id, action_type } = parsed
  if (!user_id || !action_type) {
    console.error('[autopilotPromotion] decline: missing required fields in value')
    return
  }

  const cooldownDate = new Date()
  cooldownDate.setDate(cooldownDate.getDate() + 30)
  const cooldownIso = cooldownDate.toISOString()

  // 1. Fetch current tier and org_id for audit log
  const { data: existing } = await supabase
    .from('autopilot_confidence')
    .select('current_tier, org_id')
    .eq('user_id', user_id)
    .eq('action_type', action_type)
    .maybeSingle()

  const from_tier: string = existing?.current_tier ?? 'suggest'
  const org_id: string = existing?.org_id ?? ''

  // 2. Apply cooldown
  const { error: updateError } = await supabase
    .from('autopilot_confidence')
    .update({
      cooldown_until: cooldownIso,
      promotion_eligible: false,
    })
    .eq('user_id', user_id)
    .eq('action_type', action_type)

  if (updateError) {
    console.error('[autopilotPromotion] decline: confidence update error:', updateError)
  }

  // 3. Record audit event
  if (org_id) {
    recordPromotionEvent(supabase, {
      org_id,
      user_id,
      action_type,
      event_type: 'promotion_declined',
      from_tier,
      to_tier: from_tier,
      cooldown_until: cooldownIso,
      trigger_reason: 'User declined promotion via Slack — 30-day cooldown applied',
    }).catch(() => {})
  }

  // 4. Update Slack message
  if (payload.response_url) {
    await updateSlackMessage(
      payload.response_url,
      `Got it — I'll keep showing these for approval. I'll check back in 30 days if your track record stays strong.`,
    )
  }
}

/**
 * autopilot_promote_never — rep permanently blocks promotion for this action type.
 * Value: { user_id, action_type }
 */
async function handleAutopilotPromoteNever(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: NeverValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] never: failed to parse value:', action.value)
    return
  }

  const { user_id, action_type } = parsed
  if (!user_id || !action_type) {
    console.error('[autopilotPromotion] never: missing required fields in value')
    return
  }

  // 1. Fetch current tier and org_id for audit log
  const { data: existing } = await supabase
    .from('autopilot_confidence')
    .select('current_tier, org_id')
    .eq('user_id', user_id)
    .eq('action_type', action_type)
    .maybeSingle()

  const from_tier: string = existing?.current_tier ?? 'suggest'
  const org_id: string = existing?.org_id ?? ''

  // 2. Permanently block
  const { error: updateError } = await supabase
    .from('autopilot_confidence')
    .update({
      never_promote: true,
      promotion_eligible: false,
    })
    .eq('user_id', user_id)
    .eq('action_type', action_type)

  if (updateError) {
    console.error('[autopilotPromotion] never: confidence update error:', updateError)
  }

  // 3. Record audit event
  if (org_id) {
    recordPromotionEvent(supabase, {
      org_id,
      user_id,
      action_type,
      event_type: 'promotion_never',
      from_tier,
      to_tier: from_tier,
      trigger_reason: 'User permanently blocked promotion via Slack',
    }).catch(() => {})
  }

  // 4. Update Slack message
  if (payload.response_url) {
    const label = displayName(action_type)
    await updateSlackMessage(
      payload.response_url,
      `Understood — I'll always ask for approval on *${label}*. You can change this in Settings → Agent Autonomy.`,
    )
  }
}

/**
 * autopilot_promote_accept_all — rep accepts all batch promotion candidates.
 * Value: { user_id, action_types: string[], to_tiers: Record<string, string> }
 */
async function handleAutopilotPromoteAcceptAll(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: AcceptAllValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] accept_all: failed to parse value:', action.value)
    return
  }

  const { user_id, action_types, to_tiers } = parsed
  if (!user_id || !Array.isArray(action_types) || action_types.length === 0 || !to_tiers) {
    console.error('[autopilotPromotion] accept_all: missing required fields in value')
    return
  }

  // Process each action type
  await Promise.all(
    action_types.map(async (action_type) => {
      const to_tier = to_tiers[action_type]
      if (!to_tier) {
        console.warn(`[autopilotPromotion] accept_all: no to_tier for action_type ${action_type}`)
        return
      }

      // Fetch current tier and org_id
      const { data: existing } = await supabase
        .from('autopilot_confidence')
        .select('current_tier, org_id')
        .eq('user_id', user_id)
        .eq('action_type', action_type)
        .maybeSingle()

      const from_tier: string = existing?.current_tier ?? 'suggest'
      const org_id: string = existing?.org_id ?? ''

      // Update confidence
      const { error: updateError } = await supabase
        .from('autopilot_confidence')
        .update({
          current_tier: to_tier,
          promotion_eligible: false,
          cooldown_until: null,
        })
        .eq('user_id', user_id)
        .eq('action_type', action_type)

      if (updateError) {
        console.error(
          `[autopilotPromotion] accept_all: confidence update error for ${action_type}:`,
          updateError,
        )
      }

      // Record audit event
      if (org_id) {
        recordPromotionEvent(supabase, {
          org_id,
          user_id,
          action_type,
          event_type: 'promotion_accepted',
          from_tier,
          to_tier,
          trigger_reason: 'User accepted batch promotion via Slack',
        }).catch(() => {})
      }
    }),
  )

  // Fire-and-forget rep memory update for the user
  // Fetch org_id from any of the updated rows
  const { data: anyRow } = await supabase
    .from('autopilot_confidence')
    .select('org_id')
    .eq('user_id', user_id)
    .eq('action_type', action_types[0])
    .maybeSingle()

  if (anyRow?.org_id) {
    updateRepMemory(supabase, user_id, anyRow.org_id as string).catch(() => {})
  }

  // Update Slack message
  if (payload.response_url) {
    const labels = action_types.map(displayName)
    let summary: string
    if (labels.length === 1) {
      summary = `*${labels[0]}*`
    } else if (labels.length === 2) {
      summary = `*${labels[0]}* and *${labels[1]}*`
    } else {
      const first = labels.slice(0, 2).map((l) => `*${l}*`).join(', ')
      const remaining = labels.length - 2
      summary = `${first}, and *${remaining} more*`
    }
    await updateSlackMessage(
      payload.response_url,
      `Done! I'll now handle ${summary} automatically.`,
    )
  }
}

/**
 * autopilot_promote_pick — rep wants to pick individually.
 * Value: { user_id, candidates: Array<{ action_type, to_tier, ... }> }
 *
 * Individual selection UI is a future enhancement. For now, direct to settings.
 */
async function handleAutopilotPromotePick(
  payload: InteractivePayload,
): Promise<void> {
  if (payload.response_url) {
    await updateSlackMessage(
      payload.response_url,
      `Please visit *Settings → Agent Autonomy* in the app to choose which actions to promote individually.`,
    )
  }
}

/**
 * autopilot_demotion_revert — rep clicks "Revert to approval mode" from the
 * warning Slack message. Executes a severity='warn' demotion (14-day cooldown,
 * +10 extra_required_signals) and updates the Slack message.
 * Value: { user_id, action_type }
 */
async function handleAutopilotDemotionRevert(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: DemotionRevertValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] demotion_revert: failed to parse value:', action.value)
    return
  }

  const { user_id, action_type } = parsed
  if (!user_id || !action_type) {
    console.error('[autopilotPromotion] demotion_revert: missing required fields in value')
    return
  }

  // Fetch org_id for the demotion call
  const { data: existing } = await supabase
    .from('autopilot_confidence')
    .select('org_id')
    .eq('user_id', user_id)
    .eq('action_type', action_type)
    .maybeSingle()

  const org_id: string = existing?.org_id ?? ''

  if (!org_id) {
    console.error('[autopilotPromotion] demotion_revert: could not resolve org_id for user:', user_id)
    return
  }

  // Execute demotion with severity='warn' (user-initiated revert from warning)
  await executeDemotion(supabase, user_id, org_id, action_type, 'warn', {
    triggered: true,
    severity: 'warn',
    trigger_name: 'user_revert',
    trigger_reason: 'User chose to revert to approval mode via Slack warning message',
  })

  // Update the Slack message to confirm
  if (payload.response_url) {
    const label = displayName(action_type)
    await updateSlackMessage(
      payload.response_url,
      `Reverted *${label}* to approval mode. I'll monitor and re-propose when your track record recovers.`,
    )
  }
}

/**
 * autopilot_demotion_keep — rep clicks "Keep auto — I'll be more careful" from
 * the warning Slack message. No demotion is applied; just confirms the choice.
 * Value: { user_id, action_type }
 */
async function handleAutopilotDemotionKeep(
  payload: InteractivePayload,
  action: SlackAction,
): Promise<void> {
  let parsed: DemotionKeepValue
  try {
    parsed = JSON.parse(action.value)
  } catch {
    console.error('[autopilotPromotion] demotion_keep: failed to parse value:', action.value)
    return
  }

  const { action_type } = parsed
  if (!action_type) {
    console.error('[autopilotPromotion] demotion_keep: missing action_type in value')
    return
  }

  // Update the Slack message to confirm
  if (payload.response_url) {
    const label = displayName(action_type)
    await updateSlackMessage(
      payload.response_url,
      `Keeping *${label}* on auto. I'll keep monitoring.`,
    )
  }
}

// =============================================================================
// Public dispatcher
// =============================================================================

/**
 * Dispatches `autopilot_promote_*` and `autopilot_demotion_*` button clicks
 * to the appropriate handler. All errors are caught and logged — never
 * re-thrown to the caller.
 */
export async function handleAutopilotPromotion(
  supabase: SupabaseClient,
  payload: InteractivePayload,
  actionId: string,
  action: SlackAction,
): Promise<void> {
  try {
    switch (actionId) {
      case 'autopilot_promote_accept':
        await handleAutopilotPromoteAccept(supabase, payload, action)
        break
      case 'autopilot_promote_decline':
        await handleAutopilotPromoteDecline(supabase, payload, action)
        break
      case 'autopilot_promote_never':
        await handleAutopilotPromoteNever(supabase, payload, action)
        break
      case 'autopilot_promote_accept_all':
        await handleAutopilotPromoteAcceptAll(supabase, payload, action)
        break
      case 'autopilot_promote_pick':
        await handleAutopilotPromotePick(payload)
        break
      case 'autopilot_demotion_revert':
        await handleAutopilotDemotionRevert(supabase, payload, action)
        break
      case 'autopilot_demotion_keep':
        await handleAutopilotDemotionKeep(payload, action)
        break
      default:
        console.warn('[autopilotPromotion] Unknown action_id:', actionId)
    }
  } catch (err) {
    console.error('[autopilotPromotion] Unhandled error in handleAutopilotPromotion:', err)
  }
}
