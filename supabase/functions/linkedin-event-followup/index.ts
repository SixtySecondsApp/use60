import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Event Follow-up Engine (LI-026)
//
// Pre-event coordination and post-event follow-up for LinkedIn Events.
//
// Actions:
//   pre_event_summary     – Structured overview of registrants, priorities, and open deals
//   generate_followups    – Template-based follow-up draft generation per segment
//   update_followup_status – Update a single registrant's follow-up status/draft
//   mark_attendance       – Bulk update registration_status for registrants
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-event-followup]'

const VALID_ACTIONS = [
  'pre_event_summary',
  'generate_followups',
  'update_followup_status',
  'mark_attendance',
] as const

type Action = (typeof VALID_ACTIONS)[number]

const VALID_FOLLOWUP_STATUSES = ['pending', 'drafted', 'sent', 'replied'] as const
const VALID_REGISTRATION_STATUSES = ['registered', 'attended', 'no_show', 'cancelled'] as const

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function validateOrgMembership(
  serviceClient: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<void> {
  const { data, error } = await serviceClient
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('You do not have access to this organization')
  }
}

// ---------------------------------------------------------------------------
// Follow-up template helpers
// ---------------------------------------------------------------------------

interface TemplateVars {
  first_name: string
  event_name: string
  company: string
  job_title: string
}

function fillTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{first_name\}/g, vars.first_name)
    .replace(/\{event_name\}/g, vars.event_name)
    .replace(/\{company\}/g, vars.company)
    .replace(/\{job_title\}/g, vars.job_title)
}

const TEMPLATE_ATTENDED =
  'Hi {first_name}, Great connecting at {event_name}! I noticed you\'re at {company} as {job_title} - I\'d love to explore how we might help. Would you be open to a quick call this week?'

const TEMPLATE_NO_SHOW =
  'Hi {first_name}, Sorry we missed you at {event_name}! I wanted to share the key takeaways and see if there\'s a better time to connect. Would a brief chat work for you?'

const TEMPLATE_EXISTING_CONTACT_PREFIX =
  'Hi {first_name}, Great seeing a familiar face at {event_name}! '

const TEMPLATE_EXISTING_CONTACT_ATTENDED_BODY =
  'I noticed you\'re at {company} as {job_title} - I\'d love to explore how we might help. Would you be open to a quick call this week?'

const TEMPLATE_EXISTING_CONTACT_NO_SHOW_BODY =
  'I wanted to share the key takeaways and see if there\'s a better time to connect. Would a brief chat work for you?'

function generateDraft(
  registrant: {
    first_name: string | null
    last_name: string | null
    company: string | null
    job_title: string | null
    registration_status: string
    matched_contact_id: string | null
    matched_company_id: string | null
  },
  eventName: string,
): string {
  const vars: TemplateVars = {
    first_name: registrant.first_name || 'there',
    event_name: eventName,
    company: registrant.company || 'your company',
    job_title: registrant.job_title || 'your role',
  }

  const isExistingContact = !!(registrant.matched_contact_id || registrant.matched_company_id)
  const isAttended = registrant.registration_status === 'attended'

  if (isExistingContact) {
    const prefix = fillTemplate(TEMPLATE_EXISTING_CONTACT_PREFIX, vars)
    const body = isAttended
      ? fillTemplate(TEMPLATE_EXISTING_CONTACT_ATTENDED_BODY, vars)
      : fillTemplate(TEMPLATE_EXISTING_CONTACT_NO_SHOW_BODY, vars)
    return prefix + body
  }

  if (isAttended) {
    return fillTemplate(TEMPLATE_ATTENDED, vars)
  }

  // no_show, registered, cancelled, or any other status
  return fillTemplate(TEMPLATE_NO_SHOW, vars)
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handlePreEventSummary(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { event_id, org_id } = body
  if (!event_id) throw new Error('event_id is required')
  if (!org_id) throw new Error('org_id is required')

  // Fetch event
  const { data: event, error: eventError } = await serviceClient
    .from('linkedin_events')
    .select('id, org_id, event_name, event_type, start_date, end_date, registrant_count, attendee_count')
    .eq('id', event_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (eventError) {
    console.error(`${LOG_PREFIX} Error fetching event: ${eventError.message}`)
    throw new Error('Failed to fetch event')
  }
  if (!event) throw new Error('Event not found')

  // Fetch registrants
  const { data: registrants, error: regError } = await serviceClient
    .from('linkedin_event_registrants')
    .select('id, first_name, last_name, email, company, job_title, linkedin_url, registration_status, priority_tier, icp_score, matched_contact_id, matched_company_id, followup_status')
    .eq('event_id', event_id)
    .eq('org_id', org_id)

  if (regError) {
    console.error(`${LOG_PREFIX} Error fetching registrants: ${regError.message}`)
    throw new Error('Failed to fetch registrants')
  }

  const allRegistrants = registrants ?? []

  // Priority breakdown
  const priorityBreakdown = { hot: 0, warm: 0, cold: 0 }
  for (const r of allRegistrants) {
    const tier = (r.priority_tier || 'cold') as keyof typeof priorityBreakdown
    if (tier in priorityBreakdown) {
      priorityBreakdown[tier]++
    } else {
      priorityBreakdown.cold++
    }
  }

  // Top 10 registrants by priority (hot first, then warm, then cold), then icp_score desc
  const tierOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 }
  const sorted = [...allRegistrants].sort((a, b) => {
    const tierA = tierOrder[a.priority_tier || 'cold'] ?? 2
    const tierB = tierOrder[b.priority_tier || 'cold'] ?? 2
    if (tierA !== tierB) return tierA - tierB
    return (b.icp_score ?? 0) - (a.icp_score ?? 0)
  })
  const topRegistrants = sorted.slice(0, 10).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    email: r.email,
    company: r.company,
    job_title: r.job_title,
    priority_tier: r.priority_tier,
    icp_score: r.icp_score,
    registration_status: r.registration_status,
    followup_status: r.followup_status,
  }))

  // Target accounts — companies with most registrants
  const companyCounts: Record<string, { company: string; count: number; matched_company_id: string | null }> = {}
  for (const r of allRegistrants) {
    const key = (r.company || 'Unknown').toLowerCase()
    if (!companyCounts[key]) {
      companyCounts[key] = { company: r.company || 'Unknown', count: 0, matched_company_id: r.matched_company_id }
    }
    companyCounts[key].count++
  }
  const targetAccounts = Object.values(companyCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Open deals linked to matched contacts/companies
  const matchedContactIds = allRegistrants
    .map((r) => r.matched_contact_id)
    .filter(Boolean) as string[]
  const matchedCompanyIds = allRegistrants
    .map((r) => r.matched_company_id)
    .filter(Boolean) as string[]

  let openDeals: any[] = []

  if (matchedContactIds.length > 0 || matchedCompanyIds.length > 0) {
    // Build queries for contact-linked and company-linked deals
    const dealQueries: Promise<any>[] = []

    if (matchedContactIds.length > 0) {
      dealQueries.push(
        serviceClient
          .from('deals')
          .select('id, org_id, company_id, contact_id, stage, status, amount, owner_id')
          .eq('org_id', org_id)
          .in('contact_id', matchedContactIds)
          .neq('status', 'lost')
          .then((res) => res.data ?? []),
      )
    }

    if (matchedCompanyIds.length > 0) {
      dealQueries.push(
        serviceClient
          .from('deals')
          .select('id, org_id, company_id, contact_id, stage, status, amount, owner_id')
          .eq('org_id', org_id)
          .in('company_id', matchedCompanyIds)
          .neq('status', 'lost')
          .then((res) => res.data ?? []),
      )
    }

    const dealResults = await Promise.all(dealQueries)
    const allDeals = dealResults.flat()

    // Deduplicate by deal id
    const seen = new Set<string>()
    for (const d of allDeals) {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        openDeals.push(d)
      }
    }
  }

  console.log(
    `${LOG_PREFIX} pre_event_summary: event=${event_id} registrants=${allRegistrants.length} deals=${openDeals.length}`,
  )

  return {
    event_name: event.event_name,
    total_registrants: allRegistrants.length,
    priority_breakdown: priorityBreakdown,
    top_registrants: topRegistrants,
    target_accounts: targetAccounts,
    open_deals: openDeals,
  }
}

async function handleGenerateFollowups(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { event_id, org_id, segment } = body
  if (!event_id) throw new Error('event_id is required')
  if (!org_id) throw new Error('org_id is required')

  const validSegments = ['attended', 'no_show', 'all']
  const targetSegment = segment || 'all'
  if (!validSegments.includes(targetSegment)) {
    throw new Error(`Invalid segment. Must be one of: ${validSegments.join(', ')}`)
  }

  // Fetch event name
  const { data: event, error: eventError } = await serviceClient
    .from('linkedin_events')
    .select('id, event_name')
    .eq('id', event_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (eventError) {
    console.error(`${LOG_PREFIX} Error fetching event: ${eventError.message}`)
    throw new Error('Failed to fetch event')
  }
  if (!event) throw new Error('Event not found')

  // Fetch registrants matching the segment
  let query = serviceClient
    .from('linkedin_event_registrants')
    .select('id, first_name, last_name, company, job_title, registration_status, matched_contact_id, matched_company_id')
    .eq('event_id', event_id)
    .eq('org_id', org_id)

  if (targetSegment === 'attended') {
    query = query.eq('registration_status', 'attended')
  } else if (targetSegment === 'no_show') {
    query = query.eq('registration_status', 'no_show')
  }
  // 'all' — no additional filter

  const { data: registrants, error: regError } = await query

  if (regError) {
    console.error(`${LOG_PREFIX} Error fetching registrants: ${regError.message}`)
    throw new Error('Failed to fetch registrants')
  }

  const allRegistrants = registrants ?? []

  if (allRegistrants.length === 0) {
    return { total_drafted: 0, by_segment: { attended: 0, no_show: 0, other: 0 } }
  }

  // Generate drafts and batch update
  const bySegment = { attended: 0, no_show: 0, other: 0 }
  let totalDrafted = 0

  // Process in chunks of 50 to avoid oversized payloads
  const CHUNK_SIZE = 50
  for (let i = 0; i < allRegistrants.length; i += CHUNK_SIZE) {
    const chunk = allRegistrants.slice(i, i + CHUNK_SIZE)

    const updates = chunk.map((r) => {
      const draft = generateDraft(r, event.event_name)
      const segmentKey =
        r.registration_status === 'attended'
          ? 'attended'
          : r.registration_status === 'no_show'
            ? 'no_show'
            : 'other'
      bySegment[segmentKey]++
      totalDrafted++

      return serviceClient
        .from('linkedin_event_registrants')
        .update({ followup_draft: draft, followup_status: 'drafted' })
        .eq('id', r.id)
    })

    await Promise.all(updates)
  }

  console.log(
    `${LOG_PREFIX} generate_followups: event=${event_id} total_drafted=${totalDrafted} attended=${bySegment.attended} no_show=${bySegment.no_show} other=${bySegment.other}`,
  )

  return { total_drafted: totalDrafted, by_segment: bySegment }
}

async function handleUpdateFollowupStatus(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { registrant_id, org_id, followup_status, followup_draft } = body
  if (!registrant_id) throw new Error('registrant_id is required')
  if (!org_id) throw new Error('org_id is required')
  if (!followup_status) throw new Error('followup_status is required')

  if (!VALID_FOLLOWUP_STATUSES.includes(followup_status)) {
    throw new Error(`Invalid followup_status. Must be one of: ${VALID_FOLLOWUP_STATUSES.join(', ')}`)
  }

  // Verify registrant belongs to org
  const { data: existing, error: fetchError } = await serviceClient
    .from('linkedin_event_registrants')
    .select('id, org_id, followup_status')
    .eq('id', registrant_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (fetchError) {
    console.error(`${LOG_PREFIX} Error fetching registrant: ${fetchError.message}`)
    throw new Error('Failed to fetch registrant')
  }
  if (!existing) throw new Error('Registrant not found in this organization')

  const updatePayload: Record<string, any> = {
    followup_status,
    updated_at: new Date().toISOString(),
  }
  if (followup_draft !== undefined) {
    updatePayload.followup_draft = followup_draft
  }

  const { error: updateError } = await serviceClient
    .from('linkedin_event_registrants')
    .update(updatePayload)
    .eq('id', registrant_id)

  if (updateError) {
    console.error(`${LOG_PREFIX} Error updating followup status: ${updateError.message}`)
    throw new Error('Failed to update follow-up status')
  }

  console.log(
    `${LOG_PREFIX} update_followup_status: registrant=${registrant_id} status=${followup_status}`,
  )

  return {
    registrant_id,
    followup_status,
    ...(followup_draft !== undefined ? { followup_draft } : {}),
  }
}

async function handleMarkAttendance(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { registrant_ids, org_id, registration_status } = body
  if (!registrant_ids || !Array.isArray(registrant_ids) || registrant_ids.length === 0) {
    throw new Error('registrant_ids must be a non-empty array')
  }
  if (!org_id) throw new Error('org_id is required')
  if (!registration_status) throw new Error('registration_status is required')

  if (!VALID_REGISTRATION_STATUSES.includes(registration_status)) {
    throw new Error(
      `Invalid registration_status. Must be one of: ${VALID_REGISTRATION_STATUSES.join(', ')}`,
    )
  }

  // Bulk update — process in chunks
  const CHUNK_SIZE = 100
  let totalUpdated = 0

  for (let i = 0; i < registrant_ids.length; i += CHUNK_SIZE) {
    const chunk = registrant_ids.slice(i, i + CHUNK_SIZE)

    const { data, error } = await serviceClient
      .from('linkedin_event_registrants')
      .update({
        registration_status,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', org_id)
      .in('id', chunk)
      .select('id')

    if (error) {
      console.error(`${LOG_PREFIX} Error in bulk attendance update: ${error.message}`)
      throw new Error('Failed to update registration status')
    }

    totalUpdated += data?.length ?? 0
  }

  console.log(
    `${LOG_PREFIX} mark_attendance: status=${registration_status} updated=${totalUpdated}/${registrant_ids.length}`,
  )

  return {
    registration_status,
    total_updated: totalUpdated,
    total_requested: registrant_ids.length,
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const body = await req.json()
    const { action } = body

    if (!action || !VALID_ACTIONS.includes(action)) {
      return errorResponse(
        `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        req,
        400,
      )
    }

    // Authenticate user via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Unauthorized', req, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', req, 401)

    const orgId = body.org_id
    if (!orgId) return errorResponse('org_id is required', req, 400)

    // Service role client for all DB operations
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Validate org membership
    await validateOrgMembership(serviceClient, user.id, orgId)

    console.log(`${LOG_PREFIX} action=${action} user=${user.id} org=${orgId}`)

    let result: Record<string, unknown>

    switch (action as Action) {
      case 'pre_event_summary':
        result = await handlePreEventSummary(serviceClient, body)
        break
      case 'generate_followups':
        result = await handleGenerateFollowups(serviceClient, body)
        break
      case 'update_followup_status':
        result = await handleUpdateFollowupStatus(serviceClient, body)
        break
      case 'mark_attendance':
        result = await handleMarkAttendance(serviceClient, body)
        break
      default:
        return errorResponse('Unhandled action', req, 400)
    }

    return jsonResponse(result, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error(`${LOG_PREFIX} Error: ${message}`)
    const status = message.includes('Unauthorized') || message.includes('access')
      ? 403
      : message.includes('not found') || message.includes('Not found')
        ? 404
        : 500
    return errorResponse(message, req, status)
  }
})
