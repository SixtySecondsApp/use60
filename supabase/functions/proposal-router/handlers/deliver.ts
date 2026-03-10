// Handler extracted from proposal-deliver/index.ts
// PIP-003: Stage 5 of the V2 proposal pipeline — Deliver

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts'
import { logAICostEvent } from '../../_shared/costTracking.ts'

// =============================================================================
// Types
// =============================================================================

interface SlackThread {
  channel_id: string
  thread_ts: string
  bot_token: string
}

interface DeliverRequest {
  proposal_id: string
  /** If provided, skip fetching from DB */
  pdf_url?: string
  /** Override: don't send Slack DM */
  skip_slack?: boolean
  /**
   * AUT-004 / TRG-003: When the pipeline was triggered via Slack, pass the originating
   * thread context so we can post the final message into that thread rather than
   * opening a new DM. Takes precedence over the DM path when present.
   */
  slack_thread?: SlackThread
}

interface ProposalRow {
  id: string
  org_id: string
  user_id: string
  deal_id: string | null
  meeting_id: string | null
  contact_id: string | null
  title: string
  status: string
  trigger_type: string
  autonomy_tier: string
  pdf_url: string | null
  pdf_s3_key: string | null
  credits_used: number | null
}

interface DealRow {
  id: string
  name: string
  company: string | null
  stage_id: string | null
  owner_id: string
}

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
}

const LOG_PREFIX = '[proposal-deliver]'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build Slack Block Kit message for proposal notification.
 */
function buildProposalSlackBlocks(
  proposal: ProposalRow,
  deal: DealRow | null,
  contact: ContactRow | null,
  appUrl: string,
): any[] {
  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
    : 'Unknown'
  const company = deal?.company || contact?.company || 'Unknown company'
  const triggerLabel: Record<string, string> = {
    auto_post_meeting: 'Post-meeting auto-trigger',
    manual_button: 'Manual generate',
    copilot: 'Copilot request',
    slack: 'Slack command',
  }

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Proposal Ready',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${proposal.title}*\nFor *${contactName}* at *${company}*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Trigger:*\n${triggerLabel[proposal.trigger_type] || proposal.trigger_type}`,
        },
        {
          type: 'mrkdwn',
          text: `*Credits:*\n${proposal.credits_used?.toFixed(1) ?? '—'}`,
        },
      ],
    },
  ]

  // Add action buttons
  const actions: any[] = []

  if (proposal.pdf_url) {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Download PDF', emoji: true },
      url: proposal.pdf_url,
      action_id: 'proposal_download_pdf',
    })
  }

  actions.push({
    type: 'button',
    text: { type: 'plain_text', text: 'View in 60', emoji: true },
    url: `${appUrl}/proposals/${proposal.id}`,
    action_id: 'proposal_view_in_app',
  })

  if (proposal.autonomy_tier !== 'auto') {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Send to Client', emoji: true },
      style: 'primary',
      action_id: `proposal_send_${proposal.id}`,
      value: proposal.id,
    })
  }

  blocks.push({ type: 'actions', elements: actions })

  // Auto tier: show undo button
  if (proposal.autonomy_tier === 'auto') {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'This proposal was auto-sent to the client. You have 5 minutes to undo.',
        },
      ],
    })
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Undo Send', emoji: true },
          style: 'danger',
          action_id: `proposal_undo_send_${proposal.id}`,
          value: proposal.id,
        },
      ],
    })
  }

  return blocks
}

/**
 * AUT-004 / TRG-003: Post the final proposal message into a specific Slack thread.
 */
async function sendSlackThreadReply(
  thread: SlackThread,
  proposal: ProposalRow,
  deal: DealRow | null,
  contact: ContactRow | null,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = Deno.env.get('FRONTEND_URL') || 'https://app.use60.com'

  const blocks = buildProposalSlackBlocks(proposal, deal, contact, appUrl)

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${thread.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: thread.channel_id,
        thread_ts: thread.thread_ts,
        text: `Proposal ready: ${proposal.title}`,
        blocks,
      }),
    })

    const data = await res.json()
    if (!data.ok) {
      return { success: false, error: `chat.postMessage failed: ${data.error}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Send Slack DM to the proposal creator.
 */
async function sendSlackNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  proposal: ProposalRow,
  deal: DealRow | null,
  contact: ContactRow | null,
): Promise<{ success: boolean; error?: string }> {
  const appUrl = Deno.env.get('FRONTEND_URL') || 'https://app.use60.com'

  // Find user's Slack integration
  const { data: integration } = await supabase
    .from('slack_integrations')
    .select('access_token, authed_user')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (!integration?.access_token || !integration?.authed_user) {
    console.log(`${LOG_PREFIX} No active Slack integration for user ${userId} — skipping DM`)
    return { success: false, error: 'No Slack integration' }
  }

  const slackUserId = typeof integration.authed_user === 'object'
    ? (integration.authed_user as any)?.id
    : integration.authed_user

  if (!slackUserId) {
    return { success: false, error: 'No Slack user ID found' }
  }

  try {
    // Open DM channel
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    })
    const openData = await openRes.json()

    if (!openData.ok || !openData.channel?.id) {
      return { success: false, error: `conversations.open failed: ${openData.error}` }
    }

    const blocks = buildProposalSlackBlocks(proposal, deal, contact, appUrl)

    // Send message
    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: openData.channel.id,
        text: `Proposal ready: ${proposal.title}`,
        blocks,
      }),
    })
    const msgData = await msgRes.json()

    if (!msgData.ok) {
      return { success: false, error: `chat.postMessage failed: ${msgData.error}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// =============================================================================
// Handler
// =============================================================================

export async function handleDeliver(req: Request): Promise<Response> {
  // CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    const body: DeliverRequest = await req.json()

    if (!body.proposal_id) {
      return errorResponse('proposal_id is required', req, 400)
    }

    // Auth — service role for internal pipeline calls
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`${LOG_PREFIX} Delivering proposal ${body.proposal_id}`)

    // -----------------------------------------------------------------------
    // 1. Fetch proposal
    // -----------------------------------------------------------------------
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('id, org_id, user_id, deal_id, meeting_id, contact_id, title, status, trigger_type, autonomy_tier, pdf_url, pdf_s3_key, credits_used')
      .eq('id', body.proposal_id)
      .maybeSingle<ProposalRow>()

    if (proposalError || !proposal) {
      console.error(`${LOG_PREFIX} Proposal not found:`, proposalError?.message)
      return errorResponse('Proposal not found', req, 404)
    }

    // Update pdf_url if provided (from render stage)
    if (body.pdf_url) {
      await supabase
        .from('proposals')
        .update({ pdf_url: body.pdf_url })
        .eq('id', proposal.id)
      proposal.pdf_url = body.pdf_url
    }

    // -----------------------------------------------------------------------
    // 2. Fetch related entities (parallel)
    // -----------------------------------------------------------------------
    const [dealResult, contactResult] = await Promise.all([
      proposal.deal_id
        ? supabase
            .from('deals')
            .select('id, name, company, stage_id, owner_id')
            .eq('id', proposal.deal_id)
            .maybeSingle<DealRow>()
        : Promise.resolve({ data: null, error: null }),
      proposal.contact_id
        ? supabase
            .from('contacts')
            .select('id, first_name, last_name, email, company')
            .eq('id', proposal.contact_id)
            .maybeSingle<ContactRow>()
        : Promise.resolve({ data: null, error: null }),
    ])

    const deal = dealResult.data
    const contact = contactResult.data

    // -----------------------------------------------------------------------
    // 3. Create activity record
    // -----------------------------------------------------------------------
    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : null
    const company = deal?.company || contact?.company

    const { error: activityError } = await supabase.from('activities').insert({
      org_id: proposal.org_id,
      user_id: proposal.user_id,
      deal_id: proposal.deal_id,
      contact_id: proposal.contact_id,
      type: 'proposal_generated',
      title: `Proposal generated: ${proposal.title}`,
      description: [
        contactName && `For ${contactName}`,
        company && `at ${company}`,
        `Trigger: ${proposal.trigger_type}`,
        proposal.credits_used && `Credits: ${proposal.credits_used.toFixed(1)}`,
      ]
        .filter(Boolean)
        .join(' | '),
      date: new Date().toISOString(),
      source: 'ai_agent',
      metadata: {
        proposal_id: proposal.id,
        trigger_type: proposal.trigger_type,
        autonomy_tier: proposal.autonomy_tier,
        pdf_url: proposal.pdf_url,
        credits_used: proposal.credits_used,
        pipeline_version: 2,
      },
    })

    if (activityError) {
      console.warn(`${LOG_PREFIX} Failed to create activity (non-fatal):`, activityError.message)
    }

    // -----------------------------------------------------------------------
    // 4. Send Slack notification
    // -----------------------------------------------------------------------
    let slackResult = { success: false, error: 'skipped' }

    if (!body.skip_slack) {
      if (body.slack_thread) {
        slackResult = await sendSlackThreadReply(
          body.slack_thread,
          proposal,
          deal,
          contact,
        )

        if (slackResult.success) {
          console.log(`${LOG_PREFIX} Slack thread reply sent successfully`)
        } else {
          console.warn(`${LOG_PREFIX} Slack thread reply failed (non-fatal): ${slackResult.error}`)
          // Fall back to DM if thread reply fails
          slackResult = await sendSlackNotification(supabase, proposal.user_id, proposal, deal, contact)
          if (slackResult.success) {
            console.log(`${LOG_PREFIX} Fallback Slack DM sent successfully`)
          } else {
            console.warn(`${LOG_PREFIX} Fallback Slack DM also failed (non-fatal): ${slackResult.error}`)
          }
        }
      } else {
        slackResult = await sendSlackNotification(
          supabase,
          proposal.user_id,
          proposal,
          deal,
          contact,
        )

        if (slackResult.success) {
          console.log(`${LOG_PREFIX} Slack DM sent successfully`)
        } else {
          console.warn(`${LOG_PREFIX} Slack DM failed (non-fatal): ${slackResult.error}`)
        }
      }
    }

    // -----------------------------------------------------------------------
    // 5. Update proposal status to 'ready'
    // -----------------------------------------------------------------------
    const { error: statusError } = await supabase
      .from('proposals')
      .update({
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)

    if (statusError) {
      console.error(`${LOG_PREFIX} Failed to update status:`, statusError.message)
    }

    // -----------------------------------------------------------------------
    // 6. Log minimal credit cost for notification delivery
    // -----------------------------------------------------------------------
    if (slackResult.success) {
      try {
        await logAICostEvent(
          supabase,
          proposal.user_id,
          proposal.org_id,
          'anthropic',
          'notification',
          0,
          0,
          'proposal_delivery',
          {
            proposal_id: proposal.id,
            trigger_type: proposal.trigger_type,
            notification_type: 'slack_dm',
          },
        )
      } catch (costErr) {
        console.warn(`${LOG_PREFIX} Cost logging failed (non-fatal):`, costErr)
      }
    }

    // -----------------------------------------------------------------------
    // 7. Response
    // -----------------------------------------------------------------------
    console.log(`${LOG_PREFIX} Delivery complete for proposal ${proposal.id}`)

    return jsonResponse(
      {
        success: true,
        proposal_id: proposal.id,
        status: 'ready',
        slack_sent: slackResult.success,
        activity_created: !activityError,
        pdf_url: proposal.pdf_url,
      },
      req,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error:`, message)
    return errorResponse(message, req, 500)
  }
}
