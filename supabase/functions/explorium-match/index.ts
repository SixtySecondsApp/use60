import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPLORIUM_API_BASE = 'https://api.explorium.ai/v1'
const BATCH_SIZE = 50
const MAX_CONCURRENT_BATCHES = 4

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessInput {
  name?: string
  domain?: string
  linkedin_url?: string
}

interface ProspectInput {
  email?: string
  full_name?: string
  company_name?: string
  linkedin?: string
}

interface MatchedBusiness {
  input: BusinessInput
  business_id: string | null
}

interface MatchedProspect {
  input: ProspectInput
  prospect_id: string | null
  error?: string
}

interface MatchBusinessesAction {
  action: 'match_businesses'
  businesses: BusinessInput[]
}

interface MatchProspectsAction {
  action: 'match_prospects'
  prospects: ProspectInput[]
}

interface SyncCrmOrgAction {
  action: 'sync_crm_org'
}

type ActionBody =
  | MatchBusinessesAction
  | MatchProspectsAction
  | SyncCrmOrgAction

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Chunk an array into sub-arrays of at most `size` elements.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Run an array of async factory functions with a maximum concurrency cap.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrent: number,
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++
      results[currentIndex] = await tasks[currentIndex]()
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrent, tasks.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

/**
 * Resolve the Explorium API key for a given org.
 * Prefers BYOK from integration_credentials; falls back to platform env key.
 */
async function resolveExploriumApiKey(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
): Promise<string | null> {
  const { data: cred } = await serviceClient
    .from('integration_credentials')
    .select('credentials')
    .eq('organization_id', orgId)
    .eq('provider', 'explorium')
    .maybeSingle()

  const byok = (cred?.credentials as Record<string, string> | null)?.api_key
  if (byok) return byok

  return Deno.env.get('EXPLORIUM_API_KEY') || null
}

// ---------------------------------------------------------------------------
// Explorium API callers
// ---------------------------------------------------------------------------

async function callMatchBusinesses(
  items: BusinessInput[],
  apiKey: string,
): Promise<MatchedBusiness[]> {
  const response = await fetch(`${EXPLORIUM_API_BASE}/businesses/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': apiKey,
    },
    body: JSON.stringify({ businesses_to_match: items }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(
      `[explorium-match] businesses/match HTTP ${response.status}:`,
      text,
    )
    throw new Error(
      `Explorium businesses/match failed: ${response.status} ${text}`,
    )
  }

  const data = await response.json()
  return (data.matched_businesses ?? []) as MatchedBusiness[]
}

async function callMatchProspects(
  items: ProspectInput[],
  apiKey: string,
): Promise<MatchedProspect[]> {
  const response = await fetch(`${EXPLORIUM_API_BASE}/prospects/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_key': apiKey,
    },
    body: JSON.stringify({ prospects_to_match: items }),
  })

  if (!response.ok) {
    const text = await response.text()
    console.error(
      `[explorium-match] prospects/match HTTP ${response.status}:`,
      text,
    )
    throw new Error(
      `Explorium prospects/match failed: ${response.status} ${text}`,
    )
  }

  const data = await response.json()
  return (data.matched_prospects ?? []) as MatchedProspect[]
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

interface MatchResult<T> {
  matched: T[]
  total: number
  matched_count: number
}

async function handleMatchBusinesses(
  businesses: BusinessInput[],
  apiKey: string,
): Promise<MatchResult<MatchedBusiness>> {
  const batches = chunkArray(businesses, BATCH_SIZE)

  const tasks = batches.map(
    (batch) => () => callMatchBusinesses(batch, apiKey),
  )

  const batchResults = await runWithConcurrency(tasks, MAX_CONCURRENT_BATCHES)
  const matched = batchResults.flat()
  const matchedCount = matched.filter((m) => m.business_id !== null).length

  return {
    matched,
    total: businesses.length,
    matched_count: matchedCount,
  }
}

async function handleMatchProspects(
  prospects: ProspectInput[],
  apiKey: string,
): Promise<MatchResult<MatchedProspect>> {
  const batches = chunkArray(prospects, BATCH_SIZE)

  const tasks = batches.map(
    (batch) => () => callMatchProspects(batch, apiKey),
  )

  const batchResults = await runWithConcurrency(tasks, MAX_CONCURRENT_BATCHES)
  const matched = batchResults.flat()
  const matchedCount = matched.filter((m) => m.prospect_id !== null).length

  return {
    matched,
    total: prospects.length,
    matched_count: matchedCount,
  }
}

// ---------------------------------------------------------------------------
// sync_crm_org handler
// ---------------------------------------------------------------------------

interface SyncResult {
  businesses_matched: number
  businesses_skipped: number
  prospects_matched: number
  prospects_skipped: number
  total_processed: number
  synced_at: string
}

async function handleSyncCrmOrg(
  orgId: string,
  serviceClient: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<SyncResult> {
  // ------------------------------------------------------------------
  // 1. Load all existing crm_id values from explorium_crm_mappings
  // ------------------------------------------------------------------
  const { data: existingMappings, error: mappingsErr } = await serviceClient
    .from('explorium_crm_mappings')
    .select('entity_type, crm_id')
    .eq('organization_id', orgId)

  if (mappingsErr) {
    console.error('[explorium-match] sync_crm_org: failed to load mappings', mappingsErr)
    throw new Error(`Failed to load existing mappings: ${mappingsErr.message}`)
  }

  const existingBusinessCrmIds = new Set<string>(
    (existingMappings ?? [])
      .filter((m) => m.entity_type === 'business')
      .map((m) => m.crm_id as string),
  )

  const existingProspectCrmIds = new Set<string>(
    (existingMappings ?? [])
      .filter((m) => m.entity_type === 'prospect')
      .map((m) => m.crm_id as string),
  )

  // ------------------------------------------------------------------
  // 2. Load org user IDs (companies/contacts are per-user, not per-org)
  // ------------------------------------------------------------------
  const { data: memberships, error: membershipsErr } = await serviceClient
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)

  if (membershipsErr) {
    console.error('[explorium-match] sync_crm_org: failed to load memberships', membershipsErr)
    throw new Error(`Failed to load org memberships: ${membershipsErr.message}`)
  }

  const orgUserIds = (memberships ?? []).map((m) => m.user_id as string)

  if (orgUserIds.length === 0) {
    console.log('[explorium-match] sync_crm_org: no org members found, nothing to sync')
    return {
      businesses_matched: 0,
      businesses_skipped: 0,
      prospects_matched: 0,
      prospects_skipped: 0,
      total_processed: 0,
      synced_at: new Date().toISOString(),
    }
  }

  // ------------------------------------------------------------------
  // 3. Load all companies for the org — skip already-mapped ones
  // ------------------------------------------------------------------
  const { data: allCompanies, error: companiesErr } = await serviceClient
    .from('companies')
    .select('id, name, domain')
    .in('owner_id', orgUserIds)

  if (companiesErr) {
    console.error('[explorium-match] sync_crm_org: failed to load companies', companiesErr)
    throw new Error(`Failed to load companies: ${companiesErr.message}`)
  }

  const newCompanies = (allCompanies ?? []).filter(
    (c) => !existingBusinessCrmIds.has(c.id as string),
  )
  const businessesSkipped = (allCompanies ?? []).length - newCompanies.length

  // ------------------------------------------------------------------
  // 4. Load all contacts for the org — skip already-mapped ones
  // ------------------------------------------------------------------
  const { data: allContacts, error: contactsErr } = await serviceClient
    .from('contacts')
    .select('id, email, full_name, first_name, last_name, company, linkedin_url')
    .in('owner_id', orgUserIds)

  if (contactsErr) {
    console.error('[explorium-match] sync_crm_org: failed to load contacts', contactsErr)
    throw new Error(`Failed to load contacts: ${contactsErr.message}`)
  }

  const newContacts = (allContacts ?? []).filter(
    (c) => !existingProspectCrmIds.has(c.id as string),
  )
  const prospectsSkipped = (allContacts ?? []).length - newContacts.length

  // ------------------------------------------------------------------
  // 5. Match delta companies
  // ------------------------------------------------------------------
  let businessesMatched = 0

  if (newCompanies.length > 0) {
    const businessInputs: Array<BusinessInput & { _crm_id: string }> =
      newCompanies.map((c) => ({
        _crm_id: c.id as string,
        ...(c.domain
          ? { domain: c.domain as string }
          : { name: c.name as string }),
        // Include name as context even when domain is available
        ...(c.domain && c.name ? { name: c.name as string } : {}),
      }))

    const batches = chunkArray(businessInputs, BATCH_SIZE)
    const tasks = batches.map((batch) => async () => {
      // Strip the internal _crm_id before sending to Explorium
      const apiInputs: BusinessInput[] = batch.map(({ _crm_id: _id, ...rest }) => rest)
      const results = await callMatchBusinesses(apiInputs, apiKey)

      // Pair results back to CRM IDs by index
      const mappingRows = results
        .map((result, idx) => {
          const crmId = batch[idx]._crm_id
          if (!result.business_id) return null
          return {
            organization_id: orgId,
            entity_type: 'business',
            crm_id: crmId,
            explorium_id: result.business_id,
          }
        })
        .filter(Boolean) as Array<{
          organization_id: string
          entity_type: string
          crm_id: string
          explorium_id: string
        }>

      if (mappingRows.length > 0) {
        const { error: upsertErr } = await serviceClient
          .from('explorium_crm_mappings')
          .upsert(mappingRows, {
            onConflict: 'organization_id,entity_type,crm_id',
          })

        if (upsertErr) {
          console.error(
            '[explorium-match] sync_crm_org: business upsert error',
            upsertErr,
          )
        }
      }

      return mappingRows.length
    })

    const batchCounts = await runWithConcurrency(tasks, MAX_CONCURRENT_BATCHES)
    businessesMatched = batchCounts.reduce((sum, n) => sum + n, 0)
  }

  // ------------------------------------------------------------------
  // 6. Match delta contacts
  // ------------------------------------------------------------------
  let prospectsMatched = 0

  if (newContacts.length > 0) {
    const prospectInputs: Array<ProspectInput & { _crm_id: string }> =
      newContacts.map((c) => {
        const fullName =
          (c.full_name as string | null) ||
          [c.first_name, c.last_name].filter(Boolean).join(' ') ||
          null

        // Prefer email as primary identifier
        if (c.email) {
          return {
            _crm_id: c.id as string,
            email: c.email as string,
          }
        }
        // Fallback to full_name + company_name
        if (fullName) {
          return {
            _crm_id: c.id as string,
            full_name: fullName,
            ...(c.company ? { company_name: c.company as string } : {}),
          }
        }
        // Last resort: linkedin
        if (c.linkedin_url) {
          return {
            _crm_id: c.id as string,
            linkedin: c.linkedin_url as string,
          }
        }
        // No usable identifier — include with empty payload (will return null)
        return { _crm_id: c.id as string }
      })

    const batches = chunkArray(prospectInputs, BATCH_SIZE)
    const tasks = batches.map((batch) => async () => {
      const apiInputs: ProspectInput[] = batch.map(
        ({ _crm_id: _id, ...rest }) => rest,
      )
      const results = await callMatchProspects(apiInputs, apiKey)

      const mappingRows = results
        .map((result, idx) => {
          const crmId = batch[idx]._crm_id
          if (!result.prospect_id) return null
          return {
            organization_id: orgId,
            entity_type: 'prospect',
            crm_id: crmId,
            explorium_id: result.prospect_id,
          }
        })
        .filter(Boolean) as Array<{
          organization_id: string
          entity_type: string
          crm_id: string
          explorium_id: string
        }>

      if (mappingRows.length > 0) {
        const { error: upsertErr } = await serviceClient
          .from('explorium_crm_mappings')
          .upsert(mappingRows, {
            onConflict: 'organization_id,entity_type,crm_id',
          })

        if (upsertErr) {
          console.error(
            '[explorium-match] sync_crm_org: prospect upsert error',
            upsertErr,
          )
        }
      }

      return mappingRows.length
    })

    const batchCounts = await runWithConcurrency(tasks, MAX_CONCURRENT_BATCHES)
    prospectsMatched = batchCounts.reduce((sum, n) => sum + n, 0)
  }

  const totalProcessed = newCompanies.length + newContacts.length

  console.log(
    `[explorium-match] sync_crm_org: matched ${businessesMatched} businesses, ${prospectsMatched} prospects` +
      ` (skipped ${businessesSkipped} businesses, ${prospectsSkipped} prospects already mapped)`,
  )

  return {
    businesses_matched: businessesMatched,
    businesses_skipped: businessesSkipped,
    prospects_matched: prospectsMatched,
    prospects_skipped: prospectsSkipped,
    total_processed: totalProcessed,
    synced_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Main serve handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ------------------------------------------------------------------
    // Parse body — auth token may be in body as fallback when headers are
    // stripped by browser extensions.
    // ------------------------------------------------------------------
    const body = await req.json()
    const { _auth_token, action, ...params } = body as ActionBody & {
      _auth_token?: string
    }

    const authHeader = req.headers.get('Authorization')
    const bearerToken =
      authHeader || (_auth_token ? `Bearer ${_auth_token}` : null)

    if (!bearerToken) {
      return respond(
        { error: 'Missing authorization. Please sign in and try again.' },
        401,
      )
    }

    // ------------------------------------------------------------------
    // Authenticate user via user-scoped client
    // ------------------------------------------------------------------
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: bearerToken } },
    })

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()

    if (authError || !user) {
      return respond({ error: 'Unauthorized' }, 401)
    }

    // ------------------------------------------------------------------
    // Get org membership
    // ------------------------------------------------------------------
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return respond({ error: 'No organization found' }, 400)
    }

    const orgId: string = membership.org_id

    // ------------------------------------------------------------------
    // Service role client (for org-wide reads and mapping writes)
    // ------------------------------------------------------------------
    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // ------------------------------------------------------------------
    // Resolve Explorium API key (platform key or BYOK)
    // ------------------------------------------------------------------
    const apiKey = await resolveExploriumApiKey(serviceClient, orgId)

    if (!apiKey) {
      return respond(
        {
          error:
            'Explorium API key not configured. Please add your Explorium API key in Settings → Integrations.',
          code: 'EXPLORIUM_NOT_CONFIGURED',
        },
        400,
      )
    }

    // ------------------------------------------------------------------
    // Route to action handler
    // ------------------------------------------------------------------
    if (action === 'match_businesses') {
      const { businesses } = params as { businesses?: BusinessInput[] }

      if (!Array.isArray(businesses) || businesses.length === 0) {
        return respond(
          { error: 'businesses must be a non-empty array' },
          400,
        )
      }

      const result = await handleMatchBusinesses(businesses, apiKey)
      return respond(result)
    }

    if (action === 'match_prospects') {
      const { prospects } = params as { prospects?: ProspectInput[] }

      if (!Array.isArray(prospects) || prospects.length === 0) {
        return respond(
          { error: 'prospects must be a non-empty array' },
          400,
        )
      }

      const result = await handleMatchProspects(prospects, apiKey)
      return respond(result)
    }

    if (action === 'sync_crm_org') {
      const result = await handleSyncCrmOrg(orgId, serviceClient, apiKey)
      return respond(result)
    }

    return respond(
      {
        error: `Unknown action: "${action}". Valid actions: match_businesses, match_prospects, sync_crm_org`,
      },
      400,
    )
  } catch (error) {
    console.error('[explorium-match] Error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'application/json',
        },
      },
    )
  }
})
