/**
 * Autopilot Demotion Engine — AP-017
 *
 * Evaluates demotion triggers for users on the 'auto' tier when undo signals
 * are recorded. When a trigger fires, executes the demotion: reverts the user
 * to 'approve' tier, applies a cooldown, boosts extra_required_signals, records
 * an audit event, and sends a Slack DM to notify the user.
 *
 * Severity ladder: warn → demote → emergency
 * (checked highest-severity-first; first match wins)
 *
 * Tier effects:
 *   warn (user chose to revert): 14-day cooldown, +10 extra_required_signals
 *   demote (auto):               30-day cooldown, +15 extra_required_signals
 *   emergency:                   60-day cooldown, +25 extra_required_signals
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { recordPromotionEvent } from '../autonomy/promotionEngine.ts'

// =============================================================================
// Types
// =============================================================================

export type DemotionSeverity = 'warn' | 'demote' | 'emergency'

export interface DemotionTriggerResult {
  triggered: boolean
  severity?: DemotionSeverity
  trigger_name?: string
  trigger_reason?: string
  undo_count?: number
  undo_rate?: number
  window_days?: number
}

// =============================================================================
// Internal helpers
// =============================================================================

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

/** Truncate to Slack's section mrkdwn limit (3000 chars). */
const safeMrkdwn = (text: string): string =>
  text.length <= 2800 ? text : `${text.slice(0, 2797)}…`

/** Truncate to Slack's button value limit (2000 chars). */
const safeButtonValue = (value: string): string =>
  value.length <= 1900 ? value : `${value.slice(0, 1897)}…`

/** Truncate to Slack's button text limit (75 chars). */
const safeButtonText = (text: string): string =>
  text.length <= 75 ? text : `${text.slice(0, 74)}…`

function slackHeader(text: string): unknown {
  return {
    type: 'header',
    text: { type: 'plain_text', text: text.slice(0, 150), emoji: true },
  }
}

function slackSection(text: string): unknown {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: safeMrkdwn(text) },
  }
}

function slackButton(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
): unknown {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: { type: 'plain_text', text: safeButtonText(text), emoji: true },
    action_id: actionId,
    value: safeButtonValue(value),
  }
  if (style) btn.style = style
  return btn
}

function slackActions(elements: unknown[]): unknown {
  return { type: 'actions', elements }
}

// =============================================================================
// Slack DM helpers (inlined — not imported from promotionSlack.ts)
// =============================================================================

async function getSlackUserId(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('sixty_user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[autopilot/demotionEngine] slack_user_mappings lookup error:', error)
    return null
  }

  return (data?.slack_user_id as string | null | undefined) ?? null
}

async function getBotToken(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('slack_org_settings')
    .select('bot_access_token')
    .eq('org_id', orgId)
    .eq('is_connected', true)
    .maybeSingle()

  if (error) {
    console.error('[autopilot/demotionEngine] slack_org_settings lookup error:', error)
    return null
  }

  return (data?.bot_access_token as string | null | undefined) ?? null
}

async function postSlackDM(
  botToken: string,
  slackUserId: string,
  fallbackText: string,
  blocks: unknown[],
): Promise<void> {
  try {
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    })

    const openData = await openRes.json()
    if (!openData.ok || !openData.channel?.id) {
      console.error('[autopilot/demotionEngine] conversations.open failed:', openData.error)
      return
    }

    const channelId: string = openData.channel.id

    const postRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: fallbackText,
        blocks: blocks.slice(0, 50),
      }),
    })

    const postData = await postRes.json()
    if (!postData.ok) {
      console.error('[autopilot/demotionEngine] chat.postMessage failed:', postData.error)
    }
  } catch (err) {
    console.error('[autopilot/demotionEngine] postSlackDM unexpected error:', err)
  }
}

// =============================================================================
// Demotion Slack message builders
// =============================================================================

function buildWarnBlocks(actionType: string, userId: string): unknown[] {
  const label = displayName(actionType)
  const revertValue = safeButtonValue(JSON.stringify({ user_id: userId, action_type: actionType }))
  const keepValue = safeButtonValue(JSON.stringify({ user_id: userId, action_type: actionType }))

  return [
    slackHeader('Autonomy Warning'),
    slackSection(
      `Heads up — I've seen 2+ undos on *${label}* this week. If this continues, ` +
      `I'll switch back to asking for approval.\n\nWant to revert now?`,
    ),
    slackActions([
      slackButton('Revert to approval mode', 'autopilot_demotion_revert', revertValue, 'danger'),
      slackButton("Keep auto — I'll be more careful", 'autopilot_demotion_keep', keepValue),
    ]),
  ]
}

function buildDemoteBlocks(actionType: string, undoRate: number): unknown[] {
  const label = displayName(actionType)
  const ratePct = Math.round(undoRate * 100)

  return [
    slackHeader('Autonomy Reverted'),
    slackSection(
      `I've reverted *${label}* to approval mode — your undo rate was ${ratePct}% over the ` +
      `last 2 weeks. I'll keep watching and propose auto again once your accuracy recovers.`,
    ),
  ]
}

function buildEmergencyBlocks(actionType: string): unknown[] {
  const label = displayName(actionType)

  return [
    slackHeader('Immediate Revert'),
    slackSection(
      `I've immediately reverted *${label}* to approval mode. High-stakes actions need my ` +
      `full attention — I want to make sure every one is right.`,
    ),
  ]
}

// =============================================================================
// Core API
// =============================================================================

/**
 * Evaluates demotion triggers for a user after an undo signal is recorded.
 * Only runs when the current tier is 'auto' (no point checking lower tiers).
 *
 * Trigger rules (highest severity first — first match wins):
 *   1. EMERGENCY: email.send with >= 1 undo in 7 days
 *   2. EMERGENCY: >= 3 undos in 3 days (any action type)
 *   3. DEMOTE:    > 8% undo rate in 14 days with >= 10 actions
 *   4. WARN:      > 10% undo rate in 7 days with >= 5 actions
 *
 * @param supabase   - Service role client
 * @param userId     - User to evaluate
 * @param orgId      - Org ID
 * @param actionType - The action type that was undone
 * @returns DemotionTriggerResult
 */
export async function evaluateDemotionTriggers(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  actionType: string,
): Promise<DemotionTriggerResult> {
  // -------------------------------------------------------------------------
  // Step 1 — Check current tier — only evaluate 'auto' tier users
  // -------------------------------------------------------------------------
  const { data: confidence, error: confidenceError } = await supabase
    .from('autopilot_confidence')
    .select('current_tier')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .maybeSingle()

  if (confidenceError) {
    console.error('[autopilot/demotionEngine] evaluateDemotionTriggers confidence fetch error:', confidenceError)
    return { triggered: false }
  }

  if (!confidence || confidence.current_tier !== 'auto') {
    return { triggered: false }
  }

  // -------------------------------------------------------------------------
  // Step 2 — Query autopilot_signals for the last 14 days
  // -------------------------------------------------------------------------
  const now = new Date()
  const cutoff14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff3d  = new Date(now.getTime() -  3 * 24 * 60 * 60 * 1000).toISOString()

  const { data: signals, error: signalsError } = await supabase
    .from('autopilot_signals')
    .select('signal, created_at')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .gte('created_at', cutoff14d)

  if (signalsError) {
    console.error('[autopilot/demotionEngine] evaluateDemotionTriggers signals fetch error:', signalsError)
    return { triggered: false }
  }

  const rows = (signals ?? []) as Array<{ signal: string; created_at: string }>

  // Categorise rows into time windows
  const isUndo = (s: string) => s === 'undone' || s === 'auto_undone'

  const undos3d  = rows.filter((r) => isUndo(r.signal) && r.created_at >= cutoff3d).length
  const undos7d  = rows.filter((r) => isUndo(r.signal) && r.created_at >= cutoff7d).length
  const undos14d = rows.filter((r) => isUndo(r.signal)).length

  const total7d  = rows.filter((r) => r.created_at >= cutoff7d).length
  const total14d = rows.length

  const undoRate7d  = total7d  > 0 ? undos7d  / total7d  : 0
  const undoRate14d = total14d > 0 ? undos14d / total14d : 0

  // -------------------------------------------------------------------------
  // Step 3 — Apply trigger rules (EMERGENCY > DEMOTE > WARN)
  // -------------------------------------------------------------------------

  // Rule 1: EMERGENCY — email.send: even 1 undo in 7 days
  if (actionType === 'email.send' && undos7d >= 1) {
    return {
      triggered: true,
      severity: 'emergency',
      trigger_name: 'email_undo_any',
      trigger_reason: `email.send had ${undos7d} undo(s) in the last 7 days`,
      undo_count: undos7d,
      window_days: 7,
    }
  }

  // Rule 2: EMERGENCY — 3+ undos in 3 days (any action type)
  if (undos3d >= 3) {
    return {
      triggered: true,
      severity: 'emergency',
      trigger_name: 'undo_spike',
      trigger_reason: `${undos3d} undos in the last 3 days`,
      undo_count: undos3d,
      window_days: 3,
    }
  }

  // Rule 3: DEMOTE — >8% undo rate over 14 days with >= 10 actions
  if (undoRate14d > 0.08 && total14d >= 10) {
    return {
      triggered: true,
      severity: 'demote',
      trigger_name: 'sustained_undo_rate',
      trigger_reason: `${Math.round(undoRate14d * 100)}% undo rate over last 14 days (${total14d} actions)`,
      undo_count: undos14d,
      undo_rate: undoRate14d,
      window_days: 14,
    }
  }

  // Rule 4: WARN — >10% undo rate over 7 days with >= 5 actions
  if (undoRate7d > 0.10 && total7d >= 5) {
    return {
      triggered: true,
      severity: 'warn',
      trigger_name: 'undo_rate_rising',
      trigger_reason: `${Math.round(undoRate7d * 100)}% undo rate over last 7 days (${total7d} actions)`,
      undo_count: undos7d,
      undo_rate: undoRate7d,
      window_days: 7,
    }
  }

  return { triggered: false }
}

/**
 * Executes the demotion — updates autopilot_confidence to 'approve' tier,
 * applies a severity-based cooldown, boosts extra_required_signals, records
 * an audit event in autopilot_events, and sends a Slack DM to the user.
 *
 * Cooldown periods:
 *   warn (user chose to revert): 14 days
 *   demote (auto):               30 days
 *   emergency:                   60 days
 *
 * extra_required_signals boost:
 *   warn (user chose to revert): +10
 *   demote:                      +15
 *   emergency:                   +25
 *
 * Fire-and-forget safe — all errors are caught and logged.
 *
 * @param supabase       - Service role client
 * @param userId         - User to demote
 * @param orgId          - Org ID
 * @param actionType     - The action type being demoted
 * @param severity       - Severity of the demotion trigger
 * @param triggerResult  - Full trigger result for audit logging
 */
export async function executeDemotion(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  actionType: string,
  severity: DemotionSeverity,
  triggerResult: DemotionTriggerResult,
): Promise<void> {
  try {
    // -------------------------------------------------------------------------
    // Step 1 — Fetch current tier and existing extra_required_signals
    // -------------------------------------------------------------------------
    const { data: confidence, error: confidenceError } = await supabase
      .from('autopilot_confidence')
      .select('current_tier, org_id, extra_required_signals')
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .maybeSingle()

    if (confidenceError) {
      console.error('[autopilot/demotionEngine] executeDemotion confidence fetch error:', confidenceError)
      return
    }

    if (!confidence) {
      console.warn(`[autopilot/demotionEngine] executeDemotion: no confidence row for user=${userId} action=${actionType}`)
      return
    }

    const fromTier: string = confidence.current_tier
    const resolvedOrgId: string = confidence.org_id ?? orgId
    const existingExtra: number = confidence.extra_required_signals ?? 0

    // -------------------------------------------------------------------------
    // Step 2 — Derive cooldown and extra_required_signals boost by severity
    // -------------------------------------------------------------------------
    const cooldownDays: Record<DemotionSeverity, number> = {
      warn:      14,
      demote:    30,
      emergency: 60,
    }

    const extraSignalsBoost: Record<DemotionSeverity, number> = {
      warn:      10,
      demote:    15,
      emergency: 25,
    }

    const eventType: Record<DemotionSeverity, 'demotion_warning' | 'demotion_auto' | 'demotion_emergency'> = {
      warn:      'demotion_warning',
      demote:    'demotion_auto',
      emergency: 'demotion_emergency',
    }

    const days = cooldownDays[severity]
    const boost = extraSignalsBoost[severity]

    const cooldownUntil = new Date()
    cooldownUntil.setDate(cooldownUntil.getDate() + days)
    const cooldownIso = cooldownUntil.toISOString()

    const newExtraSignals = existingExtra + boost

    // -------------------------------------------------------------------------
    // Step 3 — Update autopilot_confidence
    // -------------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from('autopilot_confidence')
      .update({
        current_tier: 'approve',
        cooldown_until: cooldownIso,
        extra_required_signals: newExtraSignals,
        promotion_eligible: false,
      })
      .eq('user_id', userId)
      .eq('action_type', actionType)

    if (updateError) {
      console.error('[autopilot/demotionEngine] executeDemotion confidence update error:', updateError)
      return
    }

    // -------------------------------------------------------------------------
    // Step 4 — Record audit event
    // -------------------------------------------------------------------------
    await recordPromotionEvent(supabase, {
      org_id: resolvedOrgId,
      user_id: userId,
      action_type: actionType,
      event_type: eventType[severity],
      from_tier: fromTier,
      to_tier: 'approve',
      trigger_reason: triggerResult.trigger_reason,
      cooldown_until: cooldownIso,
    })

    console.log(
      `[autopilot/demotionEngine] Demoted user=${userId} action=${actionType} ` +
      `severity=${severity} trigger=${triggerResult.trigger_name} ` +
      `cooldown=${days}d extraSignals=+${boost}`,
    )

    // -------------------------------------------------------------------------
    // Step 5 — Send Slack DM (fire-and-forget — don't let Slack failures block)
    // -------------------------------------------------------------------------
    sendDemotionSlackDM(supabase, userId, resolvedOrgId, actionType, severity, triggerResult).catch(
      (err) => console.error('[autopilot/demotionEngine] Slack DM error:', err),
    )
  } catch (err) {
    console.error('[autopilot/demotionEngine] executeDemotion unexpected error:', err)
  }
}

/**
 * Sends a Slack DM to the user notifying them of the demotion.
 * Internal helper — not exported.
 */
async function sendDemotionSlackDM(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  actionType: string,
  severity: DemotionSeverity,
  triggerResult: DemotionTriggerResult,
): Promise<void> {
  const [slackUserId, botToken] = await Promise.all([
    getSlackUserId(supabase, userId, orgId),
    getBotToken(supabase, orgId),
  ])

  if (!slackUserId) {
    console.warn(`[autopilot/demotionEngine] No Slack user_id for user=${userId} org=${orgId}`)
    return
  }

  if (!botToken) {
    console.warn(`[autopilot/demotionEngine] No Slack bot token for org=${orgId}`)
    return
  }

  let fallbackText: string
  let blocks: unknown[]

  if (severity === 'warn') {
    fallbackText = `Autonomy warning for ${displayName(actionType)}`
    blocks = buildWarnBlocks(actionType, userId)
  } else if (severity === 'demote') {
    const undoRate = triggerResult.undo_rate ?? 0
    fallbackText = `Autonomy reverted for ${displayName(actionType)}`
    blocks = buildDemoteBlocks(actionType, undoRate)
  } else {
    // emergency
    fallbackText = `Immediate autonomy revert for ${displayName(actionType)}`
    blocks = buildEmergencyBlocks(actionType)
  }

  await postSlackDM(botToken, slackUserId, fallbackText, blocks)
}
