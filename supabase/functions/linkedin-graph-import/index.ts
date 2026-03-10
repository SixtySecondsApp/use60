import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// LinkedIn Graph Import
//
// Handles LinkedIn archive import with trust scoring engine and CRM contact
// matching. Users upload their LinkedIn data export (connections, messages)
// and this function processes, matches against CRM contacts, and computes
// relationship trust scores.
//
// Actions:
//   create_import       — Create a new import run record
//   process_connections  — Parse and insert connection records
//   match_contacts       — Match imported contacts against CRM (multi-priority)
//   compute_trust_scores — Score relationships based on messaging patterns
//   list_imports         — List import runs for the current user
//   list_contacts        — List contacts for a given import
//   list_scores          — List relationship scores (optionally by tier)
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[linkedin-graph-import]'

const VALID_ACTIONS = [
  'create_import',
  'process_connections',
  'match_contacts',
  'compute_trust_scores',
  'list_imports',
  'list_contacts',
  'list_scores',
] as const

type Action = typeof VALID_ACTIONS[number]

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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
// Trust score helpers
// ---------------------------------------------------------------------------

function computeRecencyScore(lastMessageDate: string | null): number {
  if (!lastMessageDate) return 0

  const daysSince = Math.floor(
    (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysSince <= 30) return 1.0
  if (daysSince <= 90) return 0.7
  if (daysSince <= 180) return 0.4
  if (daysSince <= 365) return 0.2
  return 0.1
}

function computeFrequencyScore(totalMessages: number): number {
  if (totalMessages >= 20) return 1.0
  if (totalMessages >= 10) return 0.7
  if (totalMessages >= 5) return 0.5
  if (totalMessages >= 1) return 0.3
  return 0
}

function computeReciprocityScore(inbound: number, outbound: number): number {
  if (inbound === 0 && outbound === 0) return 0
  if (inbound === 0 || outbound === 0) return 0.3
  return Math.min(inbound, outbound) / Math.max(inbound, outbound)
}

function computeTrustTier(compositeScore: number, totalMessages: number): string {
  if (totalMessages === 0) return 'cold'
  if (compositeScore >= 0.7) return 'strong'
  if (compositeScore >= 0.4) return 'trusted'
  if (compositeScore >= 0.15) return 'known'
  return 'cold'
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreateImport(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { org_id, file_name, file_type } = body

  if (!org_id) throw new Error('org_id is required')
  if (!file_name) throw new Error('file_name is required')
  if (!file_type) throw new Error('file_type is required')

  const { data, error } = await serviceClient
    .from('linkedin_archive_imports')
    .insert({
      user_id: userId,
      org_id,
      file_name,
      file_type,
      status: 'processing',
      total_records: 0,
      imported_records: 0,
      matched_records: 0,
      errors: [],
    })
    .select('id, user_id, org_id, file_name, file_type, status, total_records, imported_records, matched_records, errors, created_at, completed_at')
    .single()

  if (error) {
    console.error(`${LOG_PREFIX} Error creating import: ${error.message}`)
    throw new Error(`Failed to create import: ${error.message}`)
  }

  console.log(`${LOG_PREFIX} Created import ${data.id} for user ${userId}`)
  return { import: data }
}

async function handleProcessConnections(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { import_id, connections, org_id } = body

  if (!import_id) throw new Error('import_id is required')
  if (!org_id) throw new Error('org_id is required')
  if (!Array.isArray(connections) || connections.length === 0) {
    throw new Error('connections must be a non-empty array')
  }

  // Verify import belongs to user
  const { data: importRecord, error: importErr } = await serviceClient
    .from('linkedin_archive_imports')
    .select('id, user_id, total_records, imported_records')
    .eq('id', import_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (importErr || !importRecord) {
    throw new Error('Import not found or access denied')
  }

  // Build rows for upsert
  const rows = connections.map((c: Record<string, any>) => ({
    import_id,
    user_id: userId,
    org_id,
    first_name: c.first_name || null,
    last_name: c.last_name || null,
    email: c.email || null,
    company: c.company || null,
    position: c.position || null,
    linkedin_url: c.linkedin_url || null,
    connected_on: c.connected_on || null,
  }))

  // Filter out rows without linkedin_url (required for unique constraint)
  const validRows = rows.filter((r: Record<string, any>) => r.linkedin_url)
  const skipped = rows.length - validRows.length

  let imported = 0
  let duplicates = 0

  // Upsert in batches of 500
  const BATCH_SIZE = 500
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE)

    const { data: upserted, error: upsertErr } = await serviceClient
      .from('linkedin_import_contacts')
      .upsert(batch, { onConflict: 'import_id,linkedin_url', ignoreDuplicates: false })
      .select('id')

    if (upsertErr) {
      console.error(`${LOG_PREFIX} Upsert error batch ${i}: ${upsertErr.message}`)
      throw new Error(`Failed to process connections: ${upsertErr.message}`)
    }

    imported += upserted?.length ?? batch.length
  }

  // Count existing records to detect duplicates
  const { count: existingCount } = await serviceClient
    .from('linkedin_import_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('import_id', import_id)

  // Duplicates = total we tried to insert minus what's actually in DB net-new
  // Since we use upsert, all valid rows succeed but some overwrite existing
  duplicates = skipped

  // Update import totals
  const newTotal = (importRecord.total_records || 0) + connections.length
  const newImported = existingCount ?? imported

  const { error: updateErr } = await serviceClient
    .from('linkedin_archive_imports')
    .update({
      total_records: newTotal,
      imported_records: newImported,
    })
    .eq('id', import_id)

  if (updateErr) {
    console.error(`${LOG_PREFIX} Error updating import totals: ${updateErr.message}`)
  }

  console.log(`${LOG_PREFIX} Processed ${imported} connections for import ${import_id} (${duplicates} skipped)`)
  return { imported, duplicates }
}

async function handleMatchContacts(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { import_id, org_id } = body

  if (!import_id) throw new Error('import_id is required')
  if (!org_id) throw new Error('org_id is required')

  // Fetch all imported contacts for this import
  const { data: importContacts, error: fetchErr } = await serviceClient
    .from('linkedin_import_contacts')
    .select('id, first_name, last_name, email, company, linkedin_url')
    .eq('import_id', import_id)
    .eq('user_id', userId)

  if (fetchErr) {
    throw new Error(`Failed to fetch import contacts: ${fetchErr.message}`)
  }

  if (!importContacts || importContacts.length === 0) {
    return { total: 0, matched: 0, by_confidence: { exact: 0, high: 0, medium: 0, low: 0, unmatched: 0 } }
  }

  // Fetch CRM contacts for this org
  const { data: crmContacts, error: crmErr } = await serviceClient
    .from('contacts')
    .select('id, first_name, last_name, email, linkedin_url, company_id')
    .eq('org_id', org_id)

  if (crmErr) {
    console.error(`${LOG_PREFIX} Error fetching CRM contacts: ${crmErr.message}`)
    throw new Error(`Failed to fetch CRM contacts: ${crmErr.message}`)
  }

  // Fetch companies for name matching
  const { data: companies, error: compErr } = await serviceClient
    .from('companies')
    .select('id, name')
    .eq('org_id', org_id)

  if (compErr) {
    console.error(`${LOG_PREFIX} Error fetching companies: ${compErr.message}`)
  }

  // Build lookup indexes
  const crmByLinkedIn = new Map<string, { id: string }>(
    (crmContacts ?? [])
      .filter((c: any) => c.linkedin_url)
      .map((c: any) => [c.linkedin_url.toLowerCase().replace(/\/$/, ''), { id: c.id }])
  )

  const crmByEmail = new Map<string, { id: string }>(
    (crmContacts ?? [])
      .filter((c: any) => c.email)
      .map((c: any) => [c.email.toLowerCase(), { id: c.id }])
  )

  const companyNameToId = new Map<string, string>(
    (companies ?? []).map((c: any) => [c.name.toLowerCase(), c.id])
  )

  const crmByNameCompany = new Map<string, { id: string }>(
    (crmContacts ?? [])
      .filter((c: any) => c.first_name && c.last_name && c.company_id)
      .map((c: any) => {
        const key = `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}|${c.company_id}`
        return [key, { id: c.id }]
      })
  )

  const crmByName = new Map<string, { id: string }>(
    (crmContacts ?? [])
      .filter((c: any) => c.first_name && c.last_name)
      .map((c: any) => {
        const key = `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}`
        return [key, { id: c.id }]
      })
  )

  const stats = { exact: 0, high: 0, medium: 0, low: 0, unmatched: 0 }
  const updates: { id: string; matched_contact_id: string | null; match_confidence: string }[] = []

  for (const ic of importContacts) {
    let matchedId: string | null = null
    let confidence = 'unmatched'

    // Priority 1: LinkedIn URL match (exact)
    if (ic.linkedin_url) {
      const normalized = ic.linkedin_url.toLowerCase().replace(/\/$/, '')
      const match = crmByLinkedIn.get(normalized)
      if (match) {
        matchedId = match.id
        confidence = 'exact'
      }
    }

    // Priority 2: Email match (high)
    if (!matchedId && ic.email) {
      const match = crmByEmail.get(ic.email.toLowerCase())
      if (match) {
        matchedId = match.id
        confidence = 'high'
      }
    }

    // Priority 3: Name + company match (medium)
    if (!matchedId && ic.first_name && ic.last_name && ic.company) {
      const companyId = companyNameToId.get(ic.company.toLowerCase())
      if (companyId) {
        const key = `${ic.first_name.toLowerCase()}|${ic.last_name.toLowerCase()}|${companyId}`
        const match = crmByNameCompany.get(key)
        if (match) {
          matchedId = match.id
          confidence = 'medium'
        }
      }
    }

    // Priority 4: Name-only match (low — uncertain)
    if (!matchedId && ic.first_name && ic.last_name) {
      const key = `${ic.first_name.toLowerCase()}|${ic.last_name.toLowerCase()}`
      const match = crmByName.get(key)
      if (match) {
        matchedId = match.id
        confidence = 'low'
      }
    }

    stats[confidence as keyof typeof stats]++
    updates.push({ id: ic.id, matched_contact_id: matchedId, match_confidence: confidence })
  }

  // Batch update match results in chunks
  const BATCH_SIZE = 200
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE)
    const promises = batch.map((u) =>
      serviceClient
        .from('linkedin_import_contacts')
        .update({ matched_contact_id: u.matched_contact_id, match_confidence: u.match_confidence })
        .eq('id', u.id)
    )
    await Promise.all(promises)
  }

  // Update matched_records count on import
  const totalMatched = stats.exact + stats.high + stats.medium + stats.low
  const { error: updateErr } = await serviceClient
    .from('linkedin_archive_imports')
    .update({ matched_records: totalMatched })
    .eq('id', import_id)

  if (updateErr) {
    console.error(`${LOG_PREFIX} Error updating matched_records: ${updateErr.message}`)
  }

  console.log(`${LOG_PREFIX} Matched contacts for import ${import_id}: ${totalMatched}/${importContacts.length}`)

  return {
    total: importContacts.length,
    matched: totalMatched,
    by_confidence: stats,
  }
}

async function handleComputeTrustScores(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { import_id, org_id } = body

  if (!import_id) throw new Error('import_id is required')
  if (!org_id) throw new Error('org_id is required')

  // Fetch all imported contacts for this import
  const { data: importContacts, error: fetchErr } = await serviceClient
    .from('linkedin_import_contacts')
    .select('id, connected_on')
    .eq('import_id', import_id)
    .eq('user_id', userId)

  if (fetchErr) {
    throw new Error(`Failed to fetch import contacts: ${fetchErr.message}`)
  }

  if (!importContacts || importContacts.length === 0) {
    return { total_scored: 0, by_tier: { strong: 0, trusted: 0, known: 0, cold: 0 } }
  }

  // Fetch message stats for all contacts in this import
  // We need: total, inbound, outbound, last_message_date per contact
  const contactIds = importContacts.map((c: any) => c.id)

  // Fetch messages grouped by contact_id
  // We'll do this in batches since we might have many contacts
  const messageStats = new Map<string, {
    total: number
    inbound: number
    outbound: number
    lastDate: string | null
  }>()

  const MSG_BATCH_SIZE = 500
  for (let i = 0; i < contactIds.length; i += MSG_BATCH_SIZE) {
    const batchIds = contactIds.slice(i, i + MSG_BATCH_SIZE)

    const { data: messages, error: msgErr } = await serviceClient
      .from('linkedin_import_messages')
      .select('contact_id, direction, message_date')
      .eq('import_id', import_id)
      .in('contact_id', batchIds)
      .order('message_date', { ascending: false })

    if (msgErr) {
      console.error(`${LOG_PREFIX} Error fetching messages batch ${i}: ${msgErr.message}`)
      continue
    }

    for (const msg of (messages ?? [])) {
      const existing = messageStats.get(msg.contact_id) || {
        total: 0,
        inbound: 0,
        outbound: 0,
        lastDate: null,
      }

      existing.total++
      if (msg.direction === 'inbound') existing.inbound++
      else if (msg.direction === 'outbound') existing.outbound++

      // Track most recent message date (results are ordered desc, so first is latest)
      if (!existing.lastDate && msg.message_date) {
        existing.lastDate = msg.message_date
      }

      messageStats.set(msg.contact_id, existing)
    }
  }

  // Compute scores and build upsert rows
  const tiers = { strong: 0, trusted: 0, known: 0, cold: 0 }
  const scoreRows: Record<string, any>[] = []

  for (const contact of importContacts) {
    const stats = messageStats.get(contact.id) || {
      total: 0,
      inbound: 0,
      outbound: 0,
      lastDate: null,
    }

    const recencyScore = computeRecencyScore(stats.lastDate)
    const frequencyScore = computeFrequencyScore(stats.total)
    const reciprocityScore = computeReciprocityScore(stats.inbound, stats.outbound)
    const compositeScore = recencyScore * 0.4 + frequencyScore * 0.3 + reciprocityScore * 0.3
    const trustTier = computeTrustTier(compositeScore, stats.total)

    tiers[trustTier as keyof typeof tiers]++

    scoreRows.push({
      user_id: userId,
      org_id,
      contact_id: contact.id,
      trust_tier: trustTier,
      total_messages: stats.total,
      inbound_messages: stats.inbound,
      outbound_messages: stats.outbound,
      last_message_date: stats.lastDate,
      connection_date: contact.connected_on || null,
      recency_score: recencyScore,
      frequency_score: frequencyScore,
      reciprocity_score: reciprocityScore,
      composite_score: Math.round(compositeScore * 1000) / 1000,
      updated_at: new Date().toISOString(),
    })
  }

  // Upsert scores in batches
  const SCORE_BATCH_SIZE = 500
  for (let i = 0; i < scoreRows.length; i += SCORE_BATCH_SIZE) {
    const batch = scoreRows.slice(i, i + SCORE_BATCH_SIZE)

    const { error: upsertErr } = await serviceClient
      .from('linkedin_import_relationship_scores')
      .upsert(batch, { onConflict: 'user_id,contact_id' })

    if (upsertErr) {
      console.error(`${LOG_PREFIX} Error upserting scores batch ${i}: ${upsertErr.message}`)
      throw new Error(`Failed to save trust scores: ${upsertErr.message}`)
    }
  }

  console.log(`${LOG_PREFIX} Computed trust scores for import ${import_id}: ${importContacts.length} contacts scored`)

  return {
    total_scored: importContacts.length,
    by_tier: tiers,
  }
}

async function handleListImports(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient
    .from('linkedin_archive_imports')
    .select('id, user_id, org_id, file_name, file_type, status, total_records, imported_records, matched_records, errors, created_at, completed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list imports: ${error.message}`)
  }

  return { imports: data ?? [], count: data?.length ?? 0 }
}

async function handleListContacts(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { import_id } = body

  if (!import_id) throw new Error('import_id is required')

  // Verify import belongs to user
  const { data: importRecord } = await serviceClient
    .from('linkedin_archive_imports')
    .select('id')
    .eq('id', import_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!importRecord) {
    throw new Error('Import not found or access denied')
  }

  const { data, error } = await serviceClient
    .from('linkedin_import_contacts')
    .select('id, import_id, first_name, last_name, email, company, position, linkedin_url, connected_on, matched_contact_id, match_confidence, created_at')
    .eq('import_id', import_id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list contacts: ${error.message}`)
  }

  return { contacts: data ?? [], count: data?.length ?? 0 }
}

async function handleListScores(
  serviceClient: SupabaseClient,
  body: Record<string, any>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { trust_tier } = body

  let query = serviceClient
    .from('linkedin_import_relationship_scores')
    .select('id, user_id, org_id, contact_id, trust_tier, total_messages, inbound_messages, outbound_messages, last_message_date, connection_date, recency_score, frequency_score, reciprocity_score, composite_score, created_at, updated_at')
    .eq('user_id', userId)
    .order('composite_score', { ascending: false })

  if (trust_tier) {
    query = query.eq('trust_tier', trust_tier)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to list scores: ${error.message}`)
  }

  return { scores: data ?? [], count: data?.length ?? 0 }
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

    // Service role client for all DB operations
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Validate org membership for actions that require org_id
    const orgId = body.org_id
    if (orgId) {
      await validateOrgMembership(serviceClient, user.id, orgId)
    }

    console.log(`${LOG_PREFIX} Action: ${action}, User: ${user.id}`)

    let result: Record<string, unknown>

    switch (action as Action) {
      case 'create_import':
        result = await handleCreateImport(serviceClient, body, user.id)
        break

      case 'process_connections':
        result = await handleProcessConnections(serviceClient, body, user.id)
        break

      case 'match_contacts':
        result = await handleMatchContacts(serviceClient, body, user.id)
        break

      case 'compute_trust_scores':
        result = await handleComputeTrustScores(serviceClient, body, user.id)
        break

      case 'list_imports':
        result = await handleListImports(serviceClient, user.id)
        break

      case 'list_contacts':
        result = await handleListContacts(serviceClient, body, user.id)
        break

      case 'list_scores':
        result = await handleListScores(serviceClient, body, user.id)
        break

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }

    return jsonResponse(result, req)
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Error: ${err.message}`)
    const status = err.message?.includes('Unauthorized') ? 401
      : err.message?.includes('access') ? 403
      : 500
    return errorResponse(err.message || 'Internal server error', req, status)
  }
})
