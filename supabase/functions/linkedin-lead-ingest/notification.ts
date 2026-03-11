import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

/**
 * Slack Approval Notification for LinkedIn Leads
 *
 * Sends a rich Slack DM with lead summary, ICP score, email draft preview,
 * and approval buttons. Falls back to command centre queue if Slack not connected.
 */

interface NotificationInput {
  org_id: string
  owner_id: string | null
  contact_id: string
  contact_name: string
  contact_email: string | null
  contact_title: string | null
  company_name: string | null
  company_id: string | null
  deal_id: string | null
  icp_score: number
  urgency: string
  lead_type: 'ad_form' | 'event_form'
  campaign_name: string | null
  event_name: string | null
  draft_subject: string
  draft_body: string
  model_used: string
}

export interface NotificationResult {
  channel: 'slack' | 'command_centre' | 'both'
  hitl_approval_id: string | null
  slack_sent: boolean
}

export async function sendLeadNotification(
  supabase: SupabaseClient,
  input: NotificationInput
): Promise<NotificationResult> {
  // 1. Create HITL pending approval record
  const { data: hitlRecord } = await supabase
    .from('hitl_pending_approvals')
    .insert({
      org_id: input.org_id,
      user_id: input.owner_id,
      resource_type: 'linkedin_lead_email',
      resource_id: input.contact_id,
      callback_type: 'edge_function',
      callback_target: 'email-send-as-rep',
      status: 'pending',
      original_content: {
        to: input.contact_email,
        subject: input.draft_subject,
        body: input.draft_body,
        contact_id: input.contact_id,
        company_id: input.company_id,
        deal_id: input.deal_id,
        lead_type: input.lead_type,
        campaign_name: input.campaign_name,
        model_used: input.model_used,
      },
      context: {
        source: 'linkedin_lead',
        icp_score: input.icp_score,
        urgency: input.urgency,
        contact_name: input.contact_name,
        company_name: input.company_name,
      },
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
    })
    .select('id')
    .maybeSingle()

  const hitlId = hitlRecord?.id || null

  // 2. Try Slack notification
  let slackSent = false
  if (input.owner_id) {
    try {
      slackSent = await sendSlackApproval(supabase, input, hitlId)
    } catch (err) {
      console.warn('[notification] Slack send failed (non-fatal):', err)
    }
  }

  // 3. Always create command centre item as fallback
  try {
    await supabase.from('command_centre_items').insert({
      org_id: input.org_id,
      user_id: input.owner_id,
      type: 'follow_up',
      status: 'ready',
      priority_score: input.icp_score,
      title: `LinkedIn lead: ${input.contact_name}${input.company_name ? ` (${input.company_name})` : ''}`,
      description: `${input.lead_type === 'event_form' ? 'Event registration' : 'Lead gen form'} — ${input.campaign_name || 'no campaign'}. Draft email ready for review.`,
      contact_id: input.contact_id,
      company_id: input.company_id,
      deal_id: input.deal_id,
      context: {
        source: 'linkedin_lead',
        icp_score: input.icp_score,
        urgency: input.urgency,
        draft_subject: input.draft_subject,
        hitl_approval_id: hitlId,
        lead_type: input.lead_type,
        campaign_name: input.campaign_name,
      },
    })
  } catch (err) {
    console.warn('[notification] Command centre insert failed:', err)
  }

  return {
    channel: slackSent ? 'both' : 'command_centre',
    hitl_approval_id: hitlId,
    slack_sent: slackSent,
  }
}

async function sendSlackApproval(
  supabase: SupabaseClient,
  input: NotificationInput,
  hitlId: string | null
): Promise<boolean> {
  if (!input.owner_id) return false

  // Look up user's Slack ID
  const { data: slackMapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('user_id', input.owner_id)
    .eq('org_id', input.org_id)
    .maybeSingle()

  if (!slackMapping?.slack_user_id) return false

  // Look up Slack bot token
  const { data: slackCreds } = await supabase
    .from('integration_credentials')
    .select('credentials')
    .eq('organization_id', input.org_id)
    .eq('provider', 'slack')
    .eq('is_active', true)
    .maybeSingle()

  const botToken = (slackCreds?.credentials as Record<string, unknown>)?.bot_access_token as string
  if (!botToken) return false

  // Build Slack blocks
  const urgencyEmoji = input.urgency === 'critical' ? '🔴' : input.urgency === 'high' ? '🟠' : input.urgency === 'normal' ? '🟡' : '⚪'
  const sourceLabel = input.lead_type === 'event_form' ? 'Event Registration' : 'Lead Gen Form'

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `New LinkedIn Lead: ${truncate(input.contact_name, 100)}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Name:*\n${input.contact_name}` },
        { type: 'mrkdwn', text: `*Title:*\n${input.contact_title || 'Unknown'}` },
        { type: 'mrkdwn', text: `*Company:*\n${input.company_name || 'Unknown'}` },
        { type: 'mrkdwn', text: `*ICP Score:*\n${urgencyEmoji} ${input.icp_score}/100 (${input.urgency})` },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${sourceLabel}${input.campaign_name ? ` — ${input.campaign_name}` : ''}${input.event_name ? ` — ${input.event_name}` : ''}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Draft Email:*\n*Subject:* ${truncate(input.draft_subject, 200)}\n\n${truncate(input.draft_body, 500)}` },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve & Send', emoji: true },
          style: 'primary',
          action_id: `approve::linkedin_lead_email::${hitlId}`,
          value: JSON.stringify({ hitl_id: hitlId, action: 'approve' }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit Draft', emoji: true },
          action_id: `edit::linkedin_lead_email::${hitlId}`,
          value: JSON.stringify({ hitl_id: hitlId, action: 'edit', contact_id: input.contact_id }),
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reassign', emoji: true },
          action_id: `reassign::linkedin_lead_email::${hitlId}`,
          value: JSON.stringify({ hitl_id: hitlId, action: 'reassign' }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss', emoji: true },
          style: 'danger',
          action_id: `reject::linkedin_lead_email::${hitlId}`,
          value: JSON.stringify({ hitl_id: hitlId, action: 'dismiss' }),
        },
      ],
    },
  ]

  // Send DM via Slack API
  const slackResp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: slackMapping.slack_user_id,
      text: `New LinkedIn lead: ${input.contact_name} (${input.company_name || 'Unknown'}) — ICP ${input.icp_score}/100`,
      blocks,
    }),
  })

  if (!slackResp.ok) {
    const errText = await slackResp.text()
    console.error('[notification] Slack API error:', errText)
    return false
  }

  const slackData = await slackResp.json()
  return slackData.ok === true
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}
