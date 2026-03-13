/**
 * LinkedIn Lead Ingest
 *
 * Receives normalized lead data from webhook-linkedin, then:
 *   1. Match or create company (by domain from email)
 *   2. Match or create contact
 *   3. Insert into `leads` table (same as SavvyCal pipeline)
 *   4. Draft a response email via Anthropic
 *   5. Check autonomy policy → auto-send or Slack HITL approval
 *   6. Update sync_run with results
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'
import { extractBusinessDomain, matchOrCreateCompany } from '../_shared/companyMatching.ts'
import { resolveAutonomyPolicy } from '../_shared/orchestrator/autonomyResolver.ts'

type SupabaseClient = ReturnType<typeof createClient>

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANTHROPIC_API_KEY_FALLBACK = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NormalizedLead {
  notification_id: string
  lead_type: 'ad_form' | 'event_form'
  form_id: string
  submitted_at: string
  is_test: boolean
  campaign_name: string | null
  event_name: string | null
  ad_account_name: string | null
  associated_entity: string
  submitter_urn: string
  fields: Record<string, string>
  custom_fields: Record<string, string>
  raw_payload: Record<string, unknown>
}

interface IngestPayload {
  lead: NormalizedLead
  lead_source_id: string
  org_id: string
  sync_run_id: string | null
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req)
  if (corsPreflightResponse) return corsPreflightResponse
  const corsHeaders = getCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startTime = Date.now()

  try {
    const body: IngestPayload = await req.json()
    const { lead, org_id, sync_run_id } = body

    if (!lead || !org_id) {
      return new Response(JSON.stringify({ error: 'Missing lead or org_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    console.log(`[linkedin-lead-ingest] Processing lead ${lead.notification_id} for org ${org_id}`)

    const email = lead.fields.email?.toLowerCase() || null
    const firstName = lead.fields.first_name || ''
    const lastName = lead.fields.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    const companyName = lead.fields.company_name || ''
    const jobTitle = lead.fields.job_title || ''
    const phone = lead.fields.phone || null
    const linkedinUrl = lead.fields.linkedin_url || null

    // Step 1: Auto-register lead source if new
    await autoRegisterLeadSource(supabase, org_id, lead)

    // Step 2: Match or create company
    let companyId: string | null = null
    const domain = email ? extractBusinessDomain(email) : null
    if (domain || companyName) {
      try {
        const company = await matchOrCreateCompany(supabase, {
          domain: domain || undefined,
          name: companyName || undefined,
          owner_id: null,
          source: 'linkedin_lead_gen',
        })
        companyId = company?.id || null
      } catch (err) {
        console.warn('[linkedin-lead-ingest] Company matching failed:', err)
      }
    }

    // Step 3: Match or create contact
    let contactId: string | null = null
    if (email) {
      contactId = await matchOrCreateContact(supabase, {
        email,
        firstName,
        lastName,
        phone,
        jobTitle,
        linkedinUrl,
        companyId,
        orgId: org_id,
      })
    }

    // Step 4: Find lead owner (round-robin or default from org)
    const ownerId = await resolveLeadOwner(supabase, org_id)

    // Step 5: Insert into leads table
    const leadRecord = {
      external_source: 'linkedin',
      external_id: lead.notification_id,
      external_occured_at: lead.submitted_at,
      source_channel: lead.lead_type === 'event_form' ? 'linkedin_event' : 'linkedin_ad',
      source_campaign: lead.campaign_name,
      source_medium: 'paid_social',
      status: 'new',
      priority: 'normal',
      enrichment_status: 'pending',
      prep_status: 'pending',
      owner_id: ownerId,
      created_by: ownerId,
      company_id: companyId,
      contact_id: contactId,
      contact_name: fullName || null,
      contact_first_name: firstName || null,
      contact_last_name: lastName || null,
      contact_email: email,
      contact_phone: phone,
      domain: domain || null,
      utm_source: 'linkedin',
      utm_medium: 'paid_social',
      utm_campaign: lead.campaign_name,
      tags: ['linkedin-lead-gen', lead.lead_type],
      metadata: {
        linkedin: {
          form_id: lead.form_id,
          lead_type: lead.lead_type,
          campaign_name: lead.campaign_name,
          event_name: lead.event_name,
          ad_account_name: lead.ad_account_name,
          associated_entity: lead.associated_entity,
          submitter_urn: lead.submitter_urn,
          custom_fields: lead.custom_fields,
          is_test: lead.is_test,
        },
      },
      first_seen_at: lead.submitted_at,
      clerk_org_id: org_id,
    }

    const { data: leadData, error: leadErr } = await supabase
      .from('leads')
      .upsert(leadRecord, { onConflict: 'external_id' })
      .select('id')
      .single()

    if (leadErr) {
      console.error('[linkedin-lead-ingest] Lead upsert failed:', leadErr)
      throw leadErr
    }

    console.log(`[linkedin-lead-ingest] Lead created: ${leadData.id}`)

    // Step 6: Log lead event
    await supabase.from('lead_events').insert({
      lead_id: leadData.id,
      external_source: 'linkedin',
      external_id: lead.notification_id,
      event_type: 'lead_submitted',
      payload: lead.raw_payload,
      external_occured_at: lead.submitted_at,
      received_at: new Date().toISOString(),
    }).catch(() => {})

    // Step 7: Draft email & handle autonomy
    let emailDrafted = false
    let emailSent = false
    if (email && ownerId && !lead.is_test) {
      try {
        const result = await draftAndRouteEmail(supabase, {
          orgId: org_id,
          ownerId,
          contactId,
          leadId: leadData.id,
          email,
          firstName,
          lastName,
          companyName,
          jobTitle,
          campaignName: lead.campaign_name,
          eventName: lead.event_name,
          leadType: lead.lead_type,
          customFields: lead.custom_fields,
        })
        emailDrafted = result.drafted
        emailSent = result.sent
      } catch (err) {
        console.error('[linkedin-lead-ingest] Email draft/route failed:', err)
      }
    }

    // Step 8: Update sync run
    if (sync_run_id) {
      const durationMs = Date.now() - startTime
      await supabase
        .from('linkedin_sync_runs')
        .update({
          leads_created: 1,
          leads_matched: contactId ? 1 : 0,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sync_run_id)
        .catch(() => {})
    }

    // Step 9: Fire-and-forget research for company fact profile
    if (domain && org_id) {
      triggerFactProfileResearch(org_id, domain, ownerId).catch(() => {})
    }

    return new Response(
      JSON.stringify({
        status: 'processed',
        lead_id: leadData.id,
        contact_id: contactId,
        company_id: companyId,
        email_drafted: emailDrafted,
        email_sent: emailSent,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[linkedin-lead-ingest] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ---------------------------------------------------------------------------
// Auto-register lead source
// ---------------------------------------------------------------------------

async function autoRegisterLeadSource(
  supabase: SupabaseClient,
  orgId: string,
  lead: NormalizedLead,
): Promise<void> {
  if (!lead.form_id) return

  const { data: existing } = await supabase
    .from('linkedin_lead_sources')
    .select('id')
    .eq('form_id', lead.form_id)
    .maybeSingle()

  if (existing) {
    // Increment count
    await supabase.rpc('increment_counter', {
      table_name: 'linkedin_lead_sources',
      row_id: existing.id,
      column_name: 'leads_count',
    }).catch(() => {
      // Fallback if RPC doesn't exist
      supabase
        .from('linkedin_lead_sources')
        .update({ leads_count: 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .then(() => {})
    })
    return
  }

  await supabase
    .from('linkedin_lead_sources')
    .insert({
      org_id: orgId,
      form_id: lead.form_id,
      form_name: lead.campaign_name || lead.event_name || null,
      source_type: lead.lead_type,
      campaign_name: lead.campaign_name,
      is_active: true,
      leads_count: 1,
    })
    .catch((err) => console.warn('[linkedin-lead-ingest] Lead source auto-register failed:', err))
}

// ---------------------------------------------------------------------------
// Contact matching
// ---------------------------------------------------------------------------

async function matchOrCreateContact(
  supabase: SupabaseClient,
  params: {
    email: string
    firstName: string
    lastName: string
    phone: string | null
    jobTitle: string | null
    linkedinUrl: string | null
    companyId: string | null
    orgId: string
  },
): Promise<string | null> {
  const normalizedEmail = params.email.toLowerCase().trim()

  // Try matching existing contact by email
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .ilike('email', normalizedEmail)
    .eq('clerk_org_id', params.orgId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Update with any new info
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (params.jobTitle) updates.title = params.jobTitle
    if (params.linkedinUrl) updates.linkedin_url = params.linkedinUrl
    if (params.phone) updates.phone = params.phone
    if (params.companyId) updates.company_id = params.companyId

    await supabase
      .from('contacts')
      .update(updates)
      .eq('id', existing.id)
      .catch(() => {})

    return existing.id
  }

  // Create new contact
  const fullName = `${params.firstName} ${params.lastName}`.trim()
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      email: normalizedEmail,
      first_name: params.firstName || null,
      last_name: params.lastName || null,
      full_name: fullName || null,
      phone: params.phone,
      title: params.jobTitle,
      linkedin_url: params.linkedinUrl,
      company_id: params.companyId,
      source: 'linkedin_lead_gen',
      clerk_org_id: params.orgId,
      is_primary: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[linkedin-lead-ingest] Contact creation failed:', error)
    return null
  }

  return newContact?.id ?? null
}

// ---------------------------------------------------------------------------
// Owner resolution — find the default lead owner for the org
// ---------------------------------------------------------------------------

async function resolveLeadOwner(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  // Check linkedin_org_integrations for connected_by_user_id
  const { data: integration } = await supabase
    .from('linkedin_org_integrations')
    .select('connected_by_user_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (integration?.connected_by_user_id) return integration.connected_by_user_id

  // Fallback: get org admin
  const { data: member } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  return member?.user_id ?? null
}

// ---------------------------------------------------------------------------
// Email drafting & routing
// ---------------------------------------------------------------------------

interface DraftParams {
  orgId: string
  ownerId: string
  contactId: string | null
  leadId: string
  email: string
  firstName: string
  lastName: string
  companyName: string
  jobTitle: string
  campaignName: string | null
  eventName: string | null
  leadType: 'ad_form' | 'event_form'
  customFields: Record<string, string>
}

async function draftAndRouteEmail(
  supabase: SupabaseClient,
  params: DraftParams,
): Promise<{ drafted: boolean; sent: boolean }> {
  // Get org settings for writing style + sender info
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('org_name, default_writing_style')
    .eq('org_id', params.orgId)
    .maybeSingle()

  // Get sender info
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', params.ownerId)
    .maybeSingle()

  const senderName = senderProfile
    ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim()
    : ''
  const senderEmail = senderProfile?.email || ''
  const orgName = orgSettings?.org_name || ''

  // Get Anthropic API key (org-level or fallback)
  const anthropicKey = await getAnthropicKey(supabase, params.orgId)
  if (!anthropicKey) {
    console.warn('[linkedin-lead-ingest] No Anthropic API key, skipping email draft')
    return { drafted: false, sent: false }
  }

  // Draft the email
  const { subject, body } = await composeLeadResponseEmail(anthropicKey, {
    firstName: params.firstName,
    lastName: params.lastName,
    companyName: params.companyName,
    jobTitle: params.jobTitle,
    campaignName: params.campaignName,
    eventName: params.eventName,
    leadType: params.leadType,
    customFields: params.customFields,
    senderName,
    orgName,
    writingStyle: orgSettings?.default_writing_style || null,
  })

  // Check autonomy policy
  let autonomyTier = 'approve'
  try {
    const policyResult = await resolveAutonomyPolicy(supabase, params.orgId, params.ownerId, 'linkedin_lead_email')
    autonomyTier = policyResult.policy
  } catch {
    // Default to approve
  }

  if (autonomyTier === 'auto') {
    // Auto-send
    const sendResult = await sendEmail(params.ownerId, params.email, subject, body)
    if (sendResult.ok) {
      // Record auto-executed signal
      await supabase.from('autopilot_signals').insert({
        org_id: params.orgId,
        user_id: params.ownerId,
        action_type: 'linkedin_lead_email',
        agent_name: 'linkedin-lead-ingest',
        signal: 'auto_executed',
        contact_id: params.contactId,
      }).catch(() => {})

      return { drafted: true, sent: true }
    }
  }

  // Create HITL approval + send Slack notification
  const contactName = `${params.firstName} ${params.lastName}`.trim()
  const { data: approval } = await supabase
    .from('hitl_pending_approvals')
    .insert({
      org_id: params.orgId,
      user_id: params.ownerId,
      resource_type: 'email_draft',
      resource_id: params.leadId,
      resource_name: `Email to ${contactName}${params.companyName ? ` (${params.companyName})` : ''}`,
      status: 'pending',
      original_content: {
        contact_name: contactName,
        company_name: params.companyName,
        job_title: params.jobTitle,
        email: params.email,
        subject,
        body,
        lead_type: params.leadType,
        campaign_name: params.campaignName,
        event_name: params.eventName,
      },
      callback_type: 'edge_function',
      callback_target: 'email-send-as-rep',
      callback_metadata: {
        contact_id: params.contactId,
        lead_id: params.leadId,
        to: params.email,
        subject,
        body,
        userId: params.ownerId,
      },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  const hitlId = approval?.id
  if (hitlId) {
    await sendSlackApprovalDM(supabase, {
      orgId: params.orgId,
      ownerId: params.ownerId,
      hitlId,
      contactName,
      companyName: params.companyName,
      jobTitle: params.jobTitle,
      email: params.email,
      subject,
      body,
      leadType: params.leadType,
      campaignName: params.campaignName,
      eventName: params.eventName,
      contactId: params.contactId,
    })
  }

  return { drafted: true, sent: false }
}

// ---------------------------------------------------------------------------
// Anthropic API key resolution
// ---------------------------------------------------------------------------

async function getAnthropicKey(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  // Check org-level user_settings for stored key
  const { data: settings } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('org_id', orgId)
    .limit(1)
    .maybeSingle()

  const orgKey = (settings?.preferences as Record<string, unknown>)?.anthropic_api_key as string
  if (orgKey) return orgKey

  return ANTHROPIC_API_KEY_FALLBACK || null
}

// ---------------------------------------------------------------------------
// Email composition via Anthropic
// ---------------------------------------------------------------------------

async function composeLeadResponseEmail(
  apiKey: string,
  params: {
    firstName: string
    lastName: string
    companyName: string
    jobTitle: string
    campaignName: string | null
    eventName: string | null
    leadType: 'ad_form' | 'event_form'
    customFields: Record<string, string>
    senderName: string
    orgName: string
    writingStyle: Record<string, unknown> | null
  },
): Promise<{ subject: string; body: string }> {
  const contactContext = [
    params.firstName ? `Name: ${params.firstName} ${params.lastName}` : null,
    params.companyName ? `Company: ${params.companyName}` : null,
    params.jobTitle ? `Title: ${params.jobTitle}` : null,
    params.leadType === 'event_form' && params.eventName
      ? `Event: ${params.eventName}`
      : params.campaignName
        ? `Campaign: ${params.campaignName}`
        : null,
    Object.keys(params.customFields).length > 0
      ? `Custom responses: ${Object.entries(params.customFields).map(([k, v]) => `${k}: ${v}`).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const styleGuidance = params.writingStyle
    ? `\nWriting style: ${JSON.stringify(params.writingStyle)}`
    : '\nTone: Professional, warm, concise. No fluff.'

  const prompt = `You are a sales rep at ${params.orgName || 'our company'}. A new lead just submitted a form on LinkedIn${params.leadType === 'event_form' ? ' (event registration)' : ' (ad lead gen form)'}.

Lead info:
${contactContext}

Write a short, personal response email to this lead. The goal is to:
1. Thank them for their interest
2. Reference what they signed up for specifically
3. Propose a brief call or next step
4. Sound human, not templated

Rules:
- Under 150 words
- No "I hope this email finds you well" or similar clichés
- Use their first name
- One clear CTA
- Sign off as ${params.senderName || 'the team'}
${styleGuidance}

Respond in JSON format: {"subject": "...", "body": "..."} where body is plain text (not HTML).`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[linkedin-lead-ingest] Anthropic error:', resp.status, errText)
      return fallbackEmail(params)
    }

    const result = await resp.json()
    const text = result.content?.[0]?.text || ''

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return { subject: parsed.subject, body: parsed.body }
    }

    return fallbackEmail(params)
  } catch (err) {
    console.error('[linkedin-lead-ingest] Compose error:', err)
    return fallbackEmail(params)
  }
}

function fallbackEmail(params: {
  firstName: string
  companyName: string
  campaignName: string | null
  eventName: string | null
  senderName: string
  orgName: string
}): { subject: string; body: string } {
  const name = params.firstName || 'there'
  const context = params.eventName || params.campaignName || 'your recent enquiry'
  return {
    subject: `Thanks for your interest, ${name}`,
    body: `Hi ${name},\n\nThanks for reaching out${params.companyName ? ` from ${params.companyName}` : ''}. I saw you came through via ${context} and wanted to follow up personally.\n\nWould you be open to a quick 15-minute call this week? Happy to work around your schedule.\n\nBest,\n${params.senderName || params.orgName || 'The team'}`,
  }
}

// ---------------------------------------------------------------------------
// Send email via edge function
// ---------------------------------------------------------------------------

async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/email-send-as-rep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ userId, to, subject, body }),
    })
    return { ok: resp.ok }
  } catch {
    return { ok: false }
  }
}

// ---------------------------------------------------------------------------
// Slack approval DM
// ---------------------------------------------------------------------------

async function sendSlackApprovalDM(
  supabase: SupabaseClient,
  params: {
    orgId: string
    ownerId: string
    hitlId: string
    contactName: string
    companyName: string
    jobTitle: string
    email: string
    subject: string
    body: string
    leadType: 'ad_form' | 'event_form'
    campaignName: string | null
    eventName: string | null
    contactId: string | null
  },
): Promise<void> {
  // Resolve Slack user
  const { data: slackMapping } = await supabase
    .from('slack_user_mappings')
    .select('slack_user_id')
    .eq('org_id', params.orgId)
    .eq('sixty_user_id', params.ownerId)
    .maybeSingle()

  if (!slackMapping?.slack_user_id) {
    console.warn('[linkedin-lead-ingest] No Slack mapping for owner', params.ownerId)
    return
  }

  // Get bot token
  const { data: slackIntegration } = await supabase
    .from('slack_integrations')
    .select('access_token')
    .eq('user_id', params.ownerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const botToken = slackIntegration?.access_token || Deno.env.get('SLACK_BOT_TOKEN')
  if (!botToken) {
    console.warn('[linkedin-lead-ingest] No Slack bot token')
    return
  }

  const sourceLabel = params.leadType === 'event_form'
    ? `LinkedIn Event: ${params.eventName || 'Unknown'}`
    : `LinkedIn Ad: ${params.campaignName || 'Lead Gen Form'}`

  const truncatedBody = params.body.length > 300
    ? params.body.substring(0, 297) + '...'
    : params.body

  const valuePayload = JSON.stringify({
    contact_id: params.contactId,
    hitl_id: params.hitlId,
  })

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*New LinkedIn Lead*\n*${params.contactName}*${params.companyName ? ` · ${params.companyName}` : ''}${params.jobTitle ? `\n${params.jobTitle}` : ''}`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Source: ${sourceLabel}` },
        { type: 'mrkdwn', text: `Email: ${params.email}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft Email*\n*Subject:* ${params.subject}\n\n>${truncatedBody.split('\n').join('\n>')}`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send', emoji: true },
          style: 'primary',
          action_id: `approve::linkedin_lead_email::${params.hitlId}`,
          value: valuePayload,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit', emoji: true },
          action_id: `edit::linkedin_lead_email::${params.hitlId}`,
          value: valuePayload,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reassign', emoji: true },
          action_id: `reassign::linkedin_lead_email::${params.hitlId}`,
          value: valuePayload,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss', emoji: true },
          style: 'danger',
          action_id: `reject::linkedin_lead_email::${params.hitlId}`,
          value: valuePayload,
        },
      ],
    },
  ]

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: slackMapping.slack_user_id,
      text: `New LinkedIn lead: ${params.contactName}${params.companyName ? ` (${params.companyName})` : ''}`,
      blocks,
    }),
  })
    .then(async (res) => {
      if (!res.ok) console.error('[linkedin-lead-ingest] Slack DM failed:', res.status)
      const json = await res.json().catch(() => ({}))
      if (!json.ok) console.error('[linkedin-lead-ingest] Slack API error:', json.error)

      // Store Slack message info on the HITL record
      if (json.ok && json.ts) {
        await supabase
          .from('hitl_pending_approvals')
          .update({
            slack_channel_id: json.channel,
            slack_message_ts: json.ts,
          })
          .eq('id', params.hitlId)
          .catch(() => {})
      }
    })
    .catch((err) => console.error('[linkedin-lead-ingest] Slack DM error:', err))
}

// ---------------------------------------------------------------------------
// Trigger fact profile research for the company
// ---------------------------------------------------------------------------

async function triggerFactProfileResearch(
  orgId: string,
  domain: string,
  createdBy: string | null,
): Promise<void> {
  const researchUrl = `${SUPABASE_URL}/functions/v1/research-fact-profile`
  await fetch(researchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      action: 'research',
      org_id: orgId,
      domain,
      created_by: createdBy,
    }),
  }).catch((err) => console.error('[linkedin-lead-ingest] Fact profile research trigger failed:', err))
}
