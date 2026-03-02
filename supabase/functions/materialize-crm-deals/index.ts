// supabase/functions/materialize-crm-deals/index.ts
//
// Reads unmaterialized deals from crm_deal_index and inserts them into the
// deals table, wiring up stage, contacts, and company via their respective
// index tables.
//
// POST body: { org_id: string, deal_index_ids?: string[], materialize_all?: boolean }
//
// Deploy (staging):
//   npx supabase functions deploy materialize-crm-deals \
//     --project-ref caerqjzvuerejfrdtygb --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
} from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestBody {
  org_id: string
  deal_index_ids?: string[]
  materialize_all?: boolean
}

interface DealIndexRecord {
  id: string
  org_id: string
  crm_source: 'hubspot' | 'attio'
  crm_record_id: string
  name: string | null
  stage: string | null
  pipeline: string | null
  amount: number | null
  close_date: string | null
  contact_crm_ids: string[]
  company_crm_id: string | null
  owner_crm_id: string | null
  materialized_deal_id: string | null
  is_materialized: boolean
  raw_properties: Record<string, unknown> | null
}

interface DealStage {
  id: string
  name: string
  order_position: number
}

interface ContactIndexRecord {
  id: string
  materialized_contact_id: string | null
}

interface CompanyIndexRecord {
  id: string
  name: string | null
  materialized_company_id: string | null
}

interface MaterializedDeal {
  id: string
  crm_deal_index_id: string
}

interface MaterializeResult {
  materialized: number
  failed: number
  deals: MaterializedDeal[]
  errors: Array<{ deal_index_id: string; error: string }>
}

// ---------------------------------------------------------------------------
// Stage fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Find the best-matching stage by lowercased string comparison.
 * Falls back to the stage with the lowest order_position if no match is found.
 */
function resolveStageId(
  crmStage: string | null,
  stages: DealStage[],
): string | null {
  if (stages.length === 0) return null

  if (crmStage) {
    const needle = crmStage.toLowerCase().trim()

    // 1. Exact match
    const exact = stages.find((s) => s.name.toLowerCase() === needle)
    if (exact) return exact.id

    // 2. Substring match — CRM stage name contains the app stage name or vice versa
    const partial = stages.find(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        needle.includes(s.name.toLowerCase()),
    )
    if (partial) return partial.id
  }

  // 3. Fallback: first stage by order_position
  const sorted = [...stages].sort((a, b) => a.order_position - b.order_position)
  return sorted[0].id
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) return preflightResponse

  const corsHeaders = getCorsHeaders(req)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ------------------------------------------------------------------
    // Auth: validate the caller's JWT
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Service client bypasses RLS for all table operations
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ------------------------------------------------------------------
    // Parse and validate request body
    // ------------------------------------------------------------------
    let body: RequestBody
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { org_id, deal_index_ids, materialize_all } = body

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!deal_index_ids?.length && !materialize_all) {
      return new Response(
        JSON.stringify({
          error: 'Provide deal_index_ids or set materialize_all to true',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ------------------------------------------------------------------
    // Verify caller belongs to the requested org
    // ------------------------------------------------------------------
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .eq('org_id', org_id)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: you do not belong to this org' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ------------------------------------------------------------------
    // Fetch unmaterialized deal index records for this org
    // ------------------------------------------------------------------
    let dealsQuery = serviceClient
      .from('crm_deal_index')
      .select(
        'id, org_id, crm_source, crm_record_id, name, stage, pipeline, amount, close_date, contact_crm_ids, company_crm_id, owner_crm_id, materialized_deal_id, is_materialized, raw_properties',
      )
      .eq('org_id', org_id)
      .eq('is_materialized', false)

    if (deal_index_ids?.length) {
      dealsQuery = dealsQuery.in('id', deal_index_ids)
    }

    const { data: dealIndexRecords, error: fetchError } = await dealsQuery

    if (fetchError) {
      console.error('[materialize-crm-deals] Failed to fetch crm_deal_index:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch deal index records', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!dealIndexRecords || dealIndexRecords.length === 0) {
      return new Response(
        JSON.stringify({ materialized: 0, failed: 0, deals: [], errors: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ------------------------------------------------------------------
    // Fetch deal stages for this org once (reused per deal)
    // ------------------------------------------------------------------
    const { data: stages, error: stagesError } = await serviceClient
      .from('deal_stages')
      .select('id, name, order_position')
      .eq('org_id', org_id)
      .order('order_position', { ascending: true })

    if (stagesError) {
      console.error('[materialize-crm-deals] Failed to fetch deal_stages:', stagesError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch deal stages', details: stagesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const dealStages: DealStage[] = stages || []

    // ------------------------------------------------------------------
    // Process each deal
    // ------------------------------------------------------------------
    const result: MaterializeResult = {
      materialized: 0,
      failed: 0,
      deals: [],
      errors: [],
    }

    for (const indexRecord of dealIndexRecords as DealIndexRecord[]) {
      try {
        // ----------------------------------------------------------------
        // a. Fuzzy-match stage
        // ----------------------------------------------------------------
        const stageId = resolveStageId(indexRecord.stage, dealStages)

        // ----------------------------------------------------------------
        // b. Resolve contacts via crm_contact_index
        // ----------------------------------------------------------------
        const contactIds: string[] = []

        if (indexRecord.contact_crm_ids?.length > 0) {
          const { data: contactIndexRecords } = await serviceClient
            .from('crm_contact_index')
            .select('id, materialized_contact_id')
            .eq('org_id', org_id)
            .eq('crm_source', indexRecord.crm_source)
            .in('crm_record_id', indexRecord.contact_crm_ids)

          if (contactIndexRecords) {
            for (const cr of contactIndexRecords as ContactIndexRecord[]) {
              if (cr.materialized_contact_id) {
                contactIds.push(cr.materialized_contact_id)
              }
            }
          }
        }

        const primaryContactId = contactIds.length > 0 ? contactIds[0] : null

        // ----------------------------------------------------------------
        // c. Resolve company via crm_company_index
        // ----------------------------------------------------------------
        let resolvedCompanyId: string | null = null
        let resolvedCompanyName: string | null = null

        if (indexRecord.company_crm_id) {
          const { data: companyIndexRecord } = await serviceClient
            .from('crm_company_index')
            .select('id, name, materialized_company_id')
            .eq('org_id', org_id)
            .eq('crm_source', indexRecord.crm_source)
            .eq('crm_record_id', indexRecord.company_crm_id)
            .maybeSingle()

          if (companyIndexRecord) {
            const cr = companyIndexRecord as CompanyIndexRecord
            resolvedCompanyId = cr.materialized_company_id ?? null
            resolvedCompanyName = cr.name ?? null
          }
        }

        // Also attempt to pull company name from raw_properties if index did not have it
        if (!resolvedCompanyName && indexRecord.raw_properties) {
          const raw = indexRecord.raw_properties as Record<string, unknown>
          // HubSpot: properties.company or associations.company_name
          const props = (raw.properties ?? raw) as Record<string, unknown>
          const rawCompanyName =
            (props.company_name as string | undefined) ??
            (props.company as string | undefined) ??
            null
          if (rawCompanyName) resolvedCompanyName = rawCompanyName
        }

        // ----------------------------------------------------------------
        // d. Insert into deals
        // ----------------------------------------------------------------
        const dealInsertPayload: Record<string, unknown> = {
          org_id,
          name: indexRecord.name ?? 'Untitled Deal',
          company: resolvedCompanyName ?? '',
          value: indexRecord.amount ?? 0,
          one_off_revenue: indexRecord.amount ?? 0,
          stage_id: stageId,
          expected_close_date: indexRecord.close_date ?? null,
          owner_id: user.id,
          status: 'active',
        }

        if (primaryContactId) {
          dealInsertPayload.primary_contact_id = primaryContactId
        }

        if (resolvedCompanyId) {
          dealInsertPayload.company_id = resolvedCompanyId
        }

        const { data: newDeal, error: dealInsertError } = await serviceClient
          .from('deals')
          .insert(dealInsertPayload)
          .select('id')
          .single()

        if (dealInsertError || !newDeal) {
          throw new Error(dealInsertError?.message ?? 'Deal insert returned no data')
        }

        const newDealId: string = newDeal.id

        // ----------------------------------------------------------------
        // e. Insert deal_contacts junction rows
        // ----------------------------------------------------------------
        if (contactIds.length > 0) {
          const junctionRows = contactIds.map((contactId) => ({
            deal_id: newDealId,
            contact_id: contactId,
          }))

          const { error: junctionError } = await serviceClient
            .from('deal_contacts')
            .insert(junctionRows)

          if (junctionError) {
            // Non-fatal — log and continue; the deal itself was created
            console.warn(
              `[materialize-crm-deals] deal_contacts insert failed for deal ${newDealId}:`,
              junctionError.message,
            )
          }
        }

        // ----------------------------------------------------------------
        // f. Mark crm_deal_index as materialized
        // ----------------------------------------------------------------
        const { error: indexUpdateError } = await serviceClient
          .from('crm_deal_index')
          .update({
            is_materialized: true,
            materialized_deal_id: newDealId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', indexRecord.id)

        if (indexUpdateError) {
          // Non-fatal — deal exists; we just failed to mark the index
          console.warn(
            `[materialize-crm-deals] Failed to update crm_deal_index ${indexRecord.id}:`,
            indexUpdateError.message,
          )
        }

        result.materialized++
        result.deals.push({ id: newDealId, crm_deal_index_id: indexRecord.id })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          `[materialize-crm-deals] Failed to materialize deal index ${indexRecord.id}:`,
          message,
        )
        result.failed++
        result.errors.push({ deal_index_id: indexRecord.id, error: message })
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[materialize-crm-deals] Unhandled error:', message)
    return new Response(
      JSON.stringify({ error: message }),
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
