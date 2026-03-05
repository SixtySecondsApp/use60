/**
 * Autopilot Promotion Slack Notifications — AP-015
 *
 * Builds and sends Slack Block Kit DMs for autonomy tier promotion proposals.
 * Handles both single-candidate and multi-candidate (batched) messages.
 *
 * The handler for button responses lives in:
 *   supabase/functions/slack-interactive/handlers/autonomyPromotion.ts
 *
 * Button action IDs (AP-016 handles these):
 *   Single: autopilot_promote_accept | autopilot_promote_decline | autopilot_promote_never
 *   Batch:  autopilot_promote_accept_all | autopilot_promote_pick
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { type PromotionCandidate, recordPromotionEvent } from '../autonomy/promotionEngine.ts'

// =============================================================================
// Action type display names
// =============================================================================

const ACTION_TYPE_DISPLAY: Record<string, string> = {
  'crm.note_add': 'CRM note adding',
  'crm.activity_log': 'Activity logging',
  'crm.contact_enrich': 'Contact enrichment',
  'crm.next_steps_update': 'Next steps updates',
  'crm.deal_field_update': 'Deal field updates',
  'crm.deal_stage_change': 'Deal stage changes',
  'crm.deal_amount_change': 'Deal amount changes',
  'crm.deal_close_date_change': 'Close date changes',
  'email.draft_save': 'Email draft saving',
  'email.send': 'Email sending',
  'email.follow_up_send': 'Follow-up email sending',
  'email.check_in_send': 'Check-in email sending',
  'task.create': 'Task creation',
  'task.assign': 'Task assignment',
  'calendar.create_event': 'Meeting scheduling',
  'calendar.reschedule': 'Meeting rescheduling',
  'sequence.start': 'Sequence starting',
  'slack.notification_send': 'Slack notifications',
  'slack.briefing_send': 'Slack briefings',
}

function displayName(actionType: string): string {
  return ACTION_TYPE_DISPLAY[actionType] ?? actionType.replace(/[._]/g, ' ')
}

// =============================================================================
// Block Kit helpers
// =============================================================================

/** Truncate to Slack's section mrkdwn limit (3000 chars). */
const safeMrkdwn = (text: string): string =>
  text.length <= 2800 ? text : `${text.slice(0, 2797)}…`

/** Truncate to Slack's button value limit (2000 chars). */
const safeButtonValue = (value: string): string =>
  value.length <= 1900 ? value : `${value.slice(0, 1897)}…`

/** Truncate to Slack's button text limit (75 chars). */
const safeButtonText = (text: string): string =>
  text.length <= 75 ? text : `${text.slice(0, 74)}…`

function header(text: string) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: text.slice(0, 150),
      emoji: true,
    },
  }
}

function section(text: string) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: safeMrkdwn(text) },
  }
}

function divider() {
  return { type: 'divider' }
}

function button(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger',
) {
  const btn: Record<string, unknown> = {
    type: 'button',
    text: { type: 'plain_text', text: safeButtonText(text), emoji: true },
    action_id: actionId,
    value: safeButtonValue(value),
  }
  if (style) btn.style = style
  return btn
}

function actions(elements: unknown[]) {
  return { type: 'actions', elements }
}

// =============================================================================
// Slack DM helpers
// =============================================================================

/**
 * Look up the Slack user ID for a Supabase user.
 * Returns null when no mapping exists or Slack is not connected for the org.
 */
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
    console.error('[autopilot/promotionSlack] slack_user_mappings lookup error:', error)
    return null
  }

  return (data?.slack_user_id as string | null | undefined) ?? null
}

/**
 * Look up the org's Slack bot token.
 * Returns null when Slack is not connected for the org.
 */
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
    console.error('[autopilot/promotionSlack] slack_org_settings lookup error:', error)
    return null
  }

  return (data?.bot_access_token as string | null | undefined) ?? null
}

/**
 * Open a DM channel and post a message to the user.
 * Returns the Slack message timestamp on success, null on failure.
 */
async function postDM(
  botToken: string,
  slackUserId: string,
  fallbackText: string,
  blocks: unknown[],
): Promise<string | null> {
  try {
    // Open the DM channel
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
      console.error('[autopilot/promotionSlack] conversations.open failed:', openData.error)
      return null
    }

    const channelId: string = openData.channel.id

    // Post the message
    const postRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: fallbackText,
        blocks: blocks.slice(0, 50), // Slack max 50 blocks
      }),
    })

    const postData = await postRes.json()
    if (!postData.ok) {
      console.error('[autopilot/promotionSlack] chat.postMessage failed:', postData.error)
      return null
    }

    return postData.ts as string
  } catch (err) {
    console.error('[autopilot/promotionSlack] postDM unexpected error:', err)
    return null
  }
}

// =============================================================================
// Message builders
// =============================================================================

/**
 * Build Block Kit blocks for a single-candidate promotion proposal.
 */
function buildSingleCandidateBlocks(candidate: PromotionCandidate): unknown[] {
  const stats = candidate.approval_stats
  const label = displayName(candidate.action_type)

  const totalSignals = stats.total_signals
  const cleanPct = Math.round(stats.clean_approval_rate * 100)
  const editCount = Math.round(
    (stats.approval_rate - stats.clean_approval_rate) * totalSignals,
  )
  const rejectionCount = Math.round(stats.rejection_rate * totalSignals)
  const undoCount = Math.round(stats.undo_rate * totalSignals)
  const daysActive = stats.days_active
  const score = candidate.confidence_score.toFixed(3)

  const scorecardLines = [
    `*${label}*`,
    `├─ ${totalSignals} updates reviewed`,
    `├─ ${Math.round(stats.clean_approval_rate * totalSignals)} approved without changes (${cleanPct}%)`,
    `├─ ${editCount} minor edit${editCount !== 1 ? 's' : ''}`,
    `├─ ${rejectionCount} rejection${rejectionCount !== 1 ? 's' : ''}`,
    `├─ ${undoCount} undo${undoCount !== 1 ? 's' : ''}`,
    `├─ Active for ${daysActive} day${daysActive !== 1 ? 's' : ''}`,
    `└─ Confidence score: ${score}`,
  ].join('\n')

  const acceptValue = JSON.stringify({
    user_id: candidate.user_id,
    action_type: candidate.action_type,
    to_tier: candidate.to_tier,
  })

  const declineValue = JSON.stringify({
    user_id: candidate.user_id,
    action_type: candidate.action_type,
  })

  const neverValue = JSON.stringify({
    user_id: candidate.user_id,
    action_type: candidate.action_type,
  })

  return [
    header('Autonomy Upgrade Available'),
    section(
      `Your *${label}* has been spot-on. Here's the scorecard:\n\n${scorecardLines}`,
    ),
    divider(),
    section(
      `Based on this track record, I can handle *${label}* automatically.\n` +
      `You'll still see a summary in your daily digest, and you can undo anything within 1 hour.`,
    ),
    actions([
      button('Yes, go auto', 'autopilot_promote_accept', acceptValue, 'primary'),
      button('Not yet (ask again in 30 days)', 'autopilot_promote_decline', declineValue),
      button('Never', 'autopilot_promote_never', neverValue, 'danger'),
    ]),
  ]
}

/**
 * Build Block Kit blocks for a multi-candidate (batch) promotion proposal.
 */
function buildBatchCandidateBlocks(candidates: PromotionCandidate[]): unknown[] {
  const count = candidates.length

  // Build the list of action types
  const listItems = candidates
    .map((c, i) => {
      const stats = c.approval_stats
      const label = displayName(c.action_type)
      const cleanPct = Math.round(stats.clean_approval_rate * 100)
      const cleanCount = Math.round(stats.clean_approval_rate * stats.total_signals)
      const ordinal = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][i] ?? `${i + 1}.`
      return (
        `${ordinal} *${label}* — ${cleanCount} clean approvals (${cleanPct}%)\n` +
        `   Currently: you approve each one`
      )
    })
    .join('\n\n')

  const toTiers: Record<string, string> = {}
  candidates.forEach((c) => {
    toTiers[c.action_type] = c.to_tier
  })

  const acceptAllValue = JSON.stringify({
    user_id: candidates[0].user_id,
    action_types: candidates.map((c) => c.action_type),
    to_tiers: toTiers,
  })

  const pickValue = JSON.stringify({
    user_id: candidates[0].user_id,
    candidates: candidates.map((c) => ({
      action_type: c.action_type,
      to_tier: c.to_tier,
      confidence_score: c.confidence_score,
    })),
  })

  return [
    header(`Autonomy Upgrades Available (${count})`),
    section(
      `Your accuracy has been excellent across *${count}* action type${count !== 1 ? 's' : ''}.\n` +
      `Here's what I can start handling automatically:\n\n${listItems}`,
    ),
    divider(),
    actions([
      button(
        `Auto-approve all ${count}`,
        'autopilot_promote_accept_all',
        acceptAllValue,
        'primary',
      ),
      button('Pick which ones', 'autopilot_promote_pick', pickValue),
    ]),
  ]
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Sends a promotion proposal to a user via Slack DM.
 * Handles both single-candidate and multi-candidate (batch) proposals.
 *
 * Also records a `promotion_proposed` event for each candidate in
 * `autopilot_events` as an audit log entry.
 *
 * Fire-and-forget safe — all errors are caught and logged.
 *
 * @returns true if the Slack message was sent successfully, false otherwise.
 */
export async function sendPromotionProposal(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  candidates: PromotionCandidate[],
): Promise<boolean> {
  if (candidates.length === 0) {
    console.warn('[autopilot/promotionSlack] sendPromotionProposal called with empty candidates')
    return false
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Look up Slack credentials
    // -------------------------------------------------------------------------
    const [slackUserId, botToken] = await Promise.all([
      getSlackUserId(supabase, userId, orgId),
      getBotToken(supabase, orgId),
    ])

    if (!slackUserId) {
      console.warn(
        `[autopilot/promotionSlack] No Slack user_id found for user ${userId} in org ${orgId}`,
      )
      return false
    }

    if (!botToken) {
      console.warn(
        `[autopilot/promotionSlack] No Slack bot token found for org ${orgId}`,
      )
      return false
    }

    // -------------------------------------------------------------------------
    // 2. Build the appropriate message
    // -------------------------------------------------------------------------
    const isBatch = candidates.length > 1
    const blocks = isBatch
      ? buildBatchCandidateBlocks(candidates)
      : buildSingleCandidateBlocks(candidates[0])

    const fallbackText = isBatch
      ? `Autonomy upgrades available: ${candidates.map((c) => displayName(c.action_type)).join(', ')}`
      : `Autonomy upgrade available for ${displayName(candidates[0].action_type)}`

    // -------------------------------------------------------------------------
    // 3. Send the DM
    // -------------------------------------------------------------------------
    const ts = await postDM(botToken, slackUserId, fallbackText, blocks)
    if (!ts) {
      return false
    }

    console.log(
      `[autopilot/promotionSlack] Proposal sent to user ${userId} (slack ${slackUserId}) ` +
      `for ${candidates.length} action type(s): ${candidates.map((c) => c.action_type).join(', ')}`,
    )

    // -------------------------------------------------------------------------
    // 4. Record promotion_proposed events (audit log, fire-and-forget)
    // -------------------------------------------------------------------------
    for (const candidate of candidates) {
      recordPromotionEvent(supabase, {
        org_id: candidate.org_id,
        user_id: candidate.user_id,
        action_type: candidate.action_type,
        event_type: 'promotion_proposed',
        from_tier: candidate.from_tier,
        to_tier: candidate.to_tier,
        confidence_score: candidate.confidence_score,
        approval_stats: candidate.approval_stats as Record<string, unknown>,
        threshold_config: candidate.threshold_config as Record<string, unknown>,
        trigger_reason:
          `Score ${candidate.confidence_score.toFixed(3)} meets threshold after ` +
          `${candidate.approval_stats.total_signals} signals`,
      }).catch(() => {})
    }

    return true
  } catch (err) {
    console.error('[autopilot/promotionSlack] Unexpected error in sendPromotionProposal:', err)
    return false
  }
}
