import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Event Sync (LI-025)
//
// Syncs LinkedIn event registrant data and runs prioritization logic to
// surface hot/warm/cold leads by matching against existing contacts,
// companies, and deals.
//
// Actions:
//   sync_event           — Fetch registrants for a connection and upsert
//   prioritize_registrants — Score and tier registrants for an event
//   list_events          — List events for an org
//   list_registrants     — List registrants for an event with priority info
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-event-sync]'

const VALID_ACTIONS = [
  'sync_event',
  'prioritize_registrants',
  'list_events',
  'list_registrants',
] as const

type Action = typeof VALID_ACTIONS[number]

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_API_VERSION = '202511'

// ---------------------------------------------------------------------------
// Seniority scoring
// ---------------------------------------------------------------------------

const HIGH_SENIORITY_KEYWORDS = ['VP', 'DIRECTOR', 'HEAD', 'CHIEF', 'C-LEVEL', 'SVP', 'EVP', 'CTO', 'CEO', 'CFO', 'COO', 'CMO', 'CRO', 'CIO', 'CISO', 'CPO']
const MID_SENIORITY_KEYWORDS = ['MANAGER', 'LEAD', 'SENIOR']

function seniorityScore(jobTitle: string | null): number {
  if (!jobTitle) return 0
  const upper = jobTitle.toUpperCase()
  // Check high seniority first (more specific)
  for (const kw of HIGH_SENIORITY_KEYWORDS) {
    if (upper.includes(kw)) return 30
  }
  for (const kw of MID_SENIORITY_KEYWORDS) {
    if (upper.includes(kw)) return 15
  }
  return 0
}

function priorityTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot'
  if (score >= 40) return 'warm'
  return 'cold'
}

// ---------------------------------------------------------------------------
// LinkedIn API helpers
// ---------------------------------------------------------------------------

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  }
}

async function getLinkedInToken(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<{ token: string; integrationId: string }> {
  const { data, error } = await serviceClient
    .from('linkedin_org_integrations')
    .select('id, access_token_encrypted')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error(`${LOG_PREFIX} Error fetching integration: ${error.message}`)
    throw new Error('Failed to retrieve LinkedIn integration')
  }
  if (!data) throw new Error('LinkedIn integration not connected for this organization')
  if (!data.access_token_encrypted) throw new Error('LinkedIn access token not available. Please reconnect.')

  return { token: data.access_token_encrypted, integrationId: data.id }
}

/** Validate user belongs to the org */
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
// Action handlers
// ---------------------------------------------------------------------------

async function handleSyncEvent(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, connection_id } = body
  if (!org_id) throw new Error('org_id is required')
  if (!connection_id) throw new Error('connection_id is required')

  // Get the connection config
  const { data: connection, error: connError } = await serviceClient
    .from('linkedin_event_connections')
    .select('id, org_id, linkedin_event_id, event_name, is_active')
    .eq('id', connection_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (connError || !connection) {
    throw new Error('Event connection not found')
  }
  if (!connection.is_active) {
    throw new Error('Event connection is not active')
  }

  // Create sync run record
  const { data: syncRun, error: syncRunError } = await serviceClient
    .from('linkedin_event_sync_runs')
    .insert({
      org_id,
      connection_id,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (syncRunError) {
    console.error(`${LOG_PREFIX} Failed to create sync run: ${syncRunError.message}`)
    throw new Error('Failed to create sync run record')
  }

  const syncRunId = syncRun.id

  try {
    // Get LinkedIn access token
    const { token } = await getLinkedInToken(serviceClient, org_id)

    // Fetch registrants from LinkedIn Events API
    const eventUrn = `urn:li:event:${connection.linkedin_event_id}`
    const registrantsUrl = `${LINKEDIN_API_BASE}/eventAttendees?event=${encodeURIComponent(eventUrn)}&q=event&count=500`

    console.log(`${LOG_PREFIX} Fetching registrants for event ${connection.linkedin_event_id}`)

    const response = await fetch(registrantsUrl, {
      method: 'GET',
      headers: linkedInHeaders(token),
    })

    if (response.status === 401) {
      throw new Error('LinkedIn token expired. Please reconnect your LinkedIn account.')
    }

    if (!response.ok) {
      const errText = await response.text()
      console.error(`${LOG_PREFIX} LinkedIn API error (${response.status}): ${errText}`)
      throw new Error(`LinkedIn API error (${response.status})`)
    }

    const responseData = await response.json()
    const elements = responseData.elements || []

    console.log(`${LOG_PREFIX} Received ${elements.length} registrants from LinkedIn`)

    // Ensure the event record exists
    const { data: existingEvent } = await serviceClient
      .from('linkedin_events')
      .select('id')
      .eq('org_id', org_id)
      .eq('linkedin_event_id', connection.linkedin_event_id)
      .maybeSingle()

    let eventId: string
    if (existingEvent) {
      eventId = existingEvent.id
      // Update registrant count
      await serviceClient
        .from('linkedin_events')
        .update({
          registrant_count: elements.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
    } else {
      // Create event record
      const { data: newEvent, error: eventError } = await serviceClient
        .from('linkedin_events')
        .insert({
          org_id,
          connection_id,
          linkedin_event_id: connection.linkedin_event_id,
          event_name: connection.event_name || 'LinkedIn Event',
          registrant_count: elements.length,
        })
        .select('id')
        .single()

      if (eventError) {
        throw new Error(`Failed to create event record: ${eventError.message}`)
      }
      eventId = newEvent.id
    }

    // Upsert registrants
    let newRegistrants = 0
    const errors: string[] = []

    for (const element of elements) {
      try {
        const attendee = element.attendee || element
        const memberId = attendee.member
          ? String(attendee.member).replace('urn:li:person:', '')
          : attendee.memberId || null

        const registrant = {
          org_id,
          event_id: eventId,
          linkedin_member_id: memberId,
          first_name: attendee.firstName || attendee.first_name || null,
          last_name: attendee.lastName || attendee.last_name || null,
          email: attendee.email || attendee.emailAddress || null,
          company: attendee.company || attendee.organization || null,
          job_title: attendee.title || attendee.jobTitle || attendee.job_title || null,
          linkedin_url: attendee.linkedInUrl || attendee.linkedin_url || null,
          registration_status: attendee.status || 'registered',
          updated_at: new Date().toISOString(),
        }

        // Upsert by event_id + linkedin_member_id (unique constraint)
        const { data: upserted, error: upsertError } = await serviceClient
          .from('linkedin_event_registrants')
          .upsert(registrant, {
            onConflict: 'event_id,linkedin_member_id',
            ignoreDuplicates: false,
          })
          .select('id, created_at, updated_at')
          .single()

        if (upsertError) {
          console.error(`${LOG_PREFIX} Upsert error for member ${memberId}: ${upsertError.message}`)
          errors.push(`Member ${memberId}: ${upsertError.message}`)
          continue
        }

        // Determine if this was a new insert (created_at close to updated_at)
        if (upserted) {
          const created = new Date(upserted.created_at).getTime()
          const updated = new Date(upserted.updated_at).getTime()
          if (Math.abs(updated - created) < 2000) {
            newRegistrants++
          }
        }
      } catch (regErr) {
        const msg = regErr instanceof Error ? regErr.message : String(regErr)
        errors.push(msg)
      }
    }

    // Update sync run as completed
    await serviceClient
      .from('linkedin_event_sync_runs')
      .update({
        status: 'completed',
        registrants_synced: elements.length,
        new_registrants: newRegistrants,
        errors: errors.length > 0 ? errors : [],
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncRunId)

    console.log(`${LOG_PREFIX} Sync complete: ${elements.length} synced, ${newRegistrants} new, ${errors.length} errors`)

    return {
      sync_run_id: syncRunId,
      event_id: eventId,
      registrants_synced: elements.length,
      new_registrants: newRegistrants,
      errors,
    }
  } catch (err) {
    // Mark sync run as failed
    const errMsg = err instanceof Error ? err.message : String(err)
    await serviceClient
      .from('linkedin_event_sync_runs')
      .update({
        status: 'failed',
        errors: [errMsg],
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncRunId)

    throw err
  }
}

async function handlePrioritizeRegistrants(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, event_id } = body
  if (!org_id) throw new Error('org_id is required')
  if (!event_id) throw new Error('event_id is required')

  // Verify event belongs to org
  const { data: event, error: eventError } = await serviceClient
    .from('linkedin_events')
    .select('id, org_id')
    .eq('id', event_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (eventError || !event) {
    throw new Error('Event not found')
  }

  // Fetch all registrants for this event
  const { data: registrants, error: regError } = await serviceClient
    .from('linkedin_event_registrants')
    .select('id, first_name, last_name, email, company, job_title, linkedin_url')
    .eq('event_id', event_id)
    .eq('org_id', org_id)

  if (regError) {
    throw new Error(`Failed to fetch registrants: ${regError.message}`)
  }

  if (!registrants || registrants.length === 0) {
    return { event_id, prioritized: 0, summary: { hot: 0, warm: 0, cold: 0 } }
  }

  console.log(`${LOG_PREFIX} Prioritizing ${registrants.length} registrants for event ${event_id}`)

  // Batch-load contacts for this org for matching
  const { data: contacts } = await serviceClient
    .from('contacts')
    .select('id, first_name, last_name, email, linkedin_url, company_id')
    .eq('org_id', org_id)

  // Batch-load companies for this org
  const { data: companies } = await serviceClient
    .from('companies')
    .select('id, name')
    .eq('org_id', org_id)

  // Batch-load open deals for this org
  const { data: deals } = await serviceClient
    .from('deals')
    .select('id, company_id, contact_id, stage, status')
    .eq('org_id', org_id)

  const orgContacts = contacts || []
  const orgCompanies = companies || []
  const orgDeals = deals || []

  // Build lookup structures
  const contactsByEmail = new Map<string, typeof orgContacts[0]>()
  const contactsByLinkedIn = new Map<string, typeof orgContacts[0]>()
  const contactsByName = new Map<string, typeof orgContacts[0]>()
  for (const c of orgContacts) {
    if (c.email) contactsByEmail.set(c.email.toLowerCase(), c)
    if (c.linkedin_url) contactsByLinkedIn.set(c.linkedin_url.toLowerCase(), c)
    const fullName = `${(c.first_name || '').toLowerCase()} ${(c.last_name || '').toLowerCase()}`.trim()
    if (fullName) contactsByName.set(fullName, c)
  }

  const companiesByName = new Map<string, typeof orgCompanies[0]>()
  for (const co of orgCompanies) {
    if (co.name) companiesByName.set(co.name.toLowerCase(), co)
  }

  // Build set of company_ids and contact_ids that have open deals
  const companyIdsWithDeals = new Set<string>()
  const contactIdsWithDeals = new Set<string>()
  // Also track if they are existing customers (closed-won or active deals)
  const companyIdsCustomer = new Set<string>()
  const contactIdsCustomer = new Set<string>()

  for (const d of orgDeals) {
    const isOpen = !d.status || d.status === 'open' || d.status === 'active'
    const isWon = d.status === 'won' || d.status === 'closed_won' || d.stage === 'closed_won'

    if (isOpen) {
      if (d.company_id) companyIdsWithDeals.add(d.company_id)
      if (d.contact_id) contactIdsWithDeals.add(d.contact_id)
    }
    if (isWon) {
      if (d.company_id) companyIdsCustomer.add(d.company_id)
      if (d.contact_id) contactIdsCustomer.add(d.contact_id)
    }
  }

  const summary = { hot: 0, warm: 0, cold: 0 }
  let prioritized = 0

  for (const reg of registrants) {
    let matchedContactId: string | null = null
    let matchedCompanyId: string | null = null
    let score = 0

    // --- Match contact ---
    // 1. By email
    if (reg.email) {
      const contact = contactsByEmail.get(reg.email.toLowerCase())
      if (contact) matchedContactId = contact.id
    }

    // 2. By LinkedIn URL
    if (!matchedContactId && reg.linkedin_url) {
      const contact = contactsByLinkedIn.get(reg.linkedin_url.toLowerCase())
      if (contact) matchedContactId = contact.id
    }

    // 3. By name + company heuristic
    if (!matchedContactId && reg.first_name && reg.last_name) {
      const fullName = `${reg.first_name.toLowerCase()} ${reg.last_name.toLowerCase()}`
      const candidate = contactsByName.get(fullName)
      if (candidate) {
        // If we have a company match too, boost confidence
        if (reg.company && candidate.company_id) {
          // Check if the company matches
          const { data: candidateCompany } = await serviceClient
            .from('companies')
            .select('name')
            .eq('id', candidate.company_id)
            .maybeSingle()

          if (candidateCompany && candidateCompany.name &&
              reg.company.toLowerCase().includes(candidateCompany.name.toLowerCase())) {
            matchedContactId = candidate.id
          }
        } else {
          // Name-only match — use it but with lower confidence
          matchedContactId = candidate.id
        }
      }
    }

    // --- Match company ---
    if (reg.company) {
      const companyLower = reg.company.toLowerCase()
      const company = companiesByName.get(companyLower)
      if (company) {
        matchedCompanyId = company.id
      } else {
        // Try partial matching — check if any company name is contained
        for (const [name, co] of companiesByName) {
          if (companyLower.includes(name) || name.includes(companyLower)) {
            matchedCompanyId = co.id
            break
          }
        }
      }
    }

    // If we matched a contact with a company_id, use that as matched company too
    if (!matchedCompanyId && matchedContactId) {
      const matchedContact = orgContacts.find(c => c.id === matchedContactId)
      if (matchedContact?.company_id) {
        matchedCompanyId = matchedContact.company_id
      }
    }

    // --- Compute ICP score ---

    // Job title seniority: +30 (high), +15 (mid), +0 (other)
    score += seniorityScore(reg.job_title)

    // Company match: +20
    if (matchedCompanyId) {
      score += 20
    }

    // Existing pipeline (open deal): +25
    const hasOpenDeal =
      (matchedContactId && contactIdsWithDeals.has(matchedContactId)) ||
      (matchedCompanyId && companyIdsWithDeals.has(matchedCompanyId))
    if (hasOpenDeal) {
      score += 25
    }

    // Existing customer (closed-won): +25
    const isCustomer =
      (matchedContactId && contactIdsCustomer.has(matchedContactId)) ||
      (matchedCompanyId && companyIdsCustomer.has(matchedCompanyId))
    if (isCustomer) {
      score += 25
    }

    // Cap at 100
    score = Math.min(score, 100)

    const tier = priorityTier(score)
    summary[tier]++

    // Update registrant
    const { error: updateError } = await serviceClient
      .from('linkedin_event_registrants')
      .update({
        matched_contact_id: matchedContactId,
        matched_company_id: matchedCompanyId,
        icp_score: score,
        priority_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reg.id)

    if (updateError) {
      console.error(`${LOG_PREFIX} Failed to update registrant ${reg.id}: ${updateError.message}`)
    } else {
      prioritized++
    }
  }

  console.log(`${LOG_PREFIX} Prioritization complete: ${prioritized} scored — hot: ${summary.hot}, warm: ${summary.warm}, cold: ${summary.cold}`)

  return {
    event_id,
    prioritized,
    total: registrants.length,
    summary,
  }
}

async function handleListEvents(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id } = body
  if (!org_id) throw new Error('org_id is required')

  const { data, error } = await serviceClient
    .from('linkedin_events')
    .select('id, org_id, connection_id, linkedin_event_id, event_name, event_description, event_url, event_type, start_date, end_date, organizer_name, registrant_count, attendee_count, metadata, created_at, updated_at')
    .eq('org_id', org_id)
    .order('start_date', { ascending: false })

  if (error) throw new Error(`Failed to list events: ${error.message}`)

  return { events: data ?? [], count: data?.length ?? 0 }
}

async function handleListRegistrants(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
): Promise<Record<string, unknown>> {
  const { org_id, event_id, priority_tier: filterTier, limit, offset } = body
  if (!org_id) throw new Error('org_id is required')
  if (!event_id) throw new Error('event_id is required')

  // Verify event belongs to org
  const { data: event, error: eventError } = await serviceClient
    .from('linkedin_events')
    .select('id')
    .eq('id', event_id)
    .eq('org_id', org_id)
    .maybeSingle()

  if (eventError || !event) {
    throw new Error('Event not found')
  }

  let query = serviceClient
    .from('linkedin_event_registrants')
    .select('id, first_name, last_name, email, company, job_title, linkedin_url, registration_status, priority_tier, icp_score, matched_contact_id, matched_company_id, followup_status, followup_draft, metadata, created_at, updated_at')
    .eq('event_id', event_id)
    .eq('org_id', org_id)
    .order('icp_score', { ascending: false, nullsFirst: false })

  if (filterTier) {
    query = query.eq('priority_tier', filterTier)
  }

  const pageLimit = Math.min(limit || 100, 500)
  const pageOffset = offset || 0
  query = query.range(pageOffset, pageOffset + pageLimit - 1)

  const { data, error } = await query

  if (error) throw new Error(`Failed to list registrants: ${error.message}`)

  // Get total count for this event
  const { count: totalCount } = await serviceClient
    .from('linkedin_event_registrants')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event_id)
    .eq('org_id', org_id)

  return {
    registrants: data ?? [],
    count: data?.length ?? 0,
    total: totalCount ?? 0,
    limit: pageLimit,
    offset: pageOffset,
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
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', req, 401)

    // All actions require org_id
    const orgId = body.org_id
    if (!orgId) {
      return errorResponse('org_id is required', req, 400)
    }

    // Validate org membership
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await validateOrgMembership(serviceClient, user.id, orgId)

    // Route to handler
    console.log(`${LOG_PREFIX} Action: ${action} | User: ${user.id} | Org: ${orgId}`)

    let result: Record<string, unknown>

    switch (action as Action) {
      case 'sync_event':
        result = await handleSyncEvent(serviceClient, body)
        break
      case 'prioritize_registrants':
        result = await handlePrioritizeRegistrants(serviceClient, body)
        break
      case 'list_events':
        result = await handleListEvents(serviceClient, body)
        break
      case 'list_registrants':
        result = await handleListRegistrants(serviceClient, body)
        break
      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }

    return jsonResponse(result, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Error: ${message}`)
    const status = message.includes('Unauthorized') || message.includes('do not have access')
      ? 403
      : message.includes('not found')
        ? 404
        : message.includes('token expired')
          ? 401
          : 500
    return errorResponse(message, req, status)
  }
})
