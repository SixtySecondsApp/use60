import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Action =
  | 'get_rules'
  | 'create_rule'
  | 'update_rule'
  | 'delete_rule'
  | 'get_mappings'
  | 'upsert_mapping'
  | 'toggle_mapping'
  | 'get_conversion_status'
  | 'sync_rule_to_linkedin'

interface RequestBody {
  action: Action
  // Rule params
  rule_id?: string
  name?: string
  milestone_event?: string
  linkedin_ad_account_id?: string
  attribution_type?: string
  post_click_window_days?: number
  view_through_window_days?: number
  conversion_value_amount?: number
  conversion_value_currency?: string
  is_active?: boolean
  // Mapping params
  mapping_id?: string
  is_enabled?: boolean
  value_amount?: number
  value_currency?: string
  // Pagination
  page?: number
  page_size?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOrgId(userClient: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await userClient
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return data?.org_id ?? null
}

async function checkAdminRole(userClient: ReturnType<typeof createClient>, userId: string, orgId: string): Promise<boolean> {
  const { data } = await userClient
    .from('organization_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data?.role === 'owner' || data?.role === 'admin'
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', req, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return errorResponse('Unauthorized', req, 401)

    const orgId = await resolveOrgId(userClient, user.id)
    if (!orgId) return errorResponse('No organization found', req, 403)

    const body: RequestBody = await req.json()
    const { action } = body

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    switch (action) {
      // ---------------------------------------------------------------
      // GET RULES
      // ---------------------------------------------------------------
      case 'get_rules': {
        const { data, error } = await userClient
          .from('linkedin_conversion_rules')
          .select('id, name, milestone_event, linkedin_ad_account_id, linkedin_rule_id, attribution_type, post_click_window_days, view_through_window_days, conversion_value_amount, conversion_value_currency, is_active, is_synced, last_synced_at, sync_error, created_at, updated_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ rules: data }, req)
      }

      // ---------------------------------------------------------------
      // CREATE RULE
      // ---------------------------------------------------------------
      case 'create_rule': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)

        if (!body.name || !body.milestone_event || !body.linkedin_ad_account_id) {
          return errorResponse('name, milestone_event, and linkedin_ad_account_id are required', req, 400)
        }

        const { data, error } = await serviceClient
          .from('linkedin_conversion_rules')
          .insert({
            org_id: orgId,
            name: body.name,
            milestone_event: body.milestone_event,
            linkedin_ad_account_id: body.linkedin_ad_account_id,
            attribution_type: body.attribution_type || 'LAST_TOUCH_BY_CAMPAIGN',
            post_click_window_days: body.post_click_window_days ?? 30,
            view_through_window_days: body.view_through_window_days ?? 7,
            conversion_value_amount: body.conversion_value_amount,
            conversion_value_currency: body.conversion_value_currency || 'USD',
            created_by: user.id,
          })
          .select('id, name, milestone_event, linkedin_ad_account_id, is_active, is_synced, created_at')
          .single()

        if (error) {
          if (error.code === '23505') {
            return errorResponse('A rule for this milestone and ad account already exists', req, 409)
          }
          return errorResponse(error.message, req, 500)
        }

        // Auto-create mapping for this rule
        await serviceClient
          .from('linkedin_conversion_mappings')
          .insert({
            org_id: orgId,
            rule_id: data.id,
            milestone_event: body.milestone_event,
            is_enabled: true,
            value_amount: body.conversion_value_amount,
            value_currency: body.conversion_value_currency || 'USD',
            changed_by: user.id,
          })

        return jsonResponse({ rule: data }, req, 201)
      }

      // ---------------------------------------------------------------
      // UPDATE RULE
      // ---------------------------------------------------------------
      case 'update_rule': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)
        if (!body.rule_id) return errorResponse('rule_id is required', req, 400)

        const updates: Record<string, unknown> = {}
        if (body.name !== undefined) updates.name = body.name
        if (body.is_active !== undefined) updates.is_active = body.is_active
        if (body.attribution_type !== undefined) updates.attribution_type = body.attribution_type
        if (body.post_click_window_days !== undefined) updates.post_click_window_days = body.post_click_window_days
        if (body.view_through_window_days !== undefined) updates.view_through_window_days = body.view_through_window_days
        if (body.conversion_value_amount !== undefined) updates.conversion_value_amount = body.conversion_value_amount
        if (body.conversion_value_currency !== undefined) updates.conversion_value_currency = body.conversion_value_currency

        const { data, error } = await serviceClient
          .from('linkedin_conversion_rules')
          .update(updates)
          .eq('id', body.rule_id)
          .eq('org_id', orgId)
          .select('id, name, milestone_event, is_active, is_synced, updated_at')
          .single()

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ rule: data }, req)
      }

      // ---------------------------------------------------------------
      // DELETE RULE
      // ---------------------------------------------------------------
      case 'delete_rule': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)
        if (!body.rule_id) return errorResponse('rule_id is required', req, 400)

        const { error } = await serviceClient
          .from('linkedin_conversion_rules')
          .delete()
          .eq('id', body.rule_id)
          .eq('org_id', orgId)

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ deleted: true }, req)
      }

      // ---------------------------------------------------------------
      // GET MAPPINGS
      // ---------------------------------------------------------------
      case 'get_mappings': {
        const { data, error } = await userClient
          .from('linkedin_conversion_mappings')
          .select('id, rule_id, milestone_event, is_enabled, value_amount, value_currency, version, changed_at, created_at, updated_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ mappings: data }, req)
      }

      // ---------------------------------------------------------------
      // UPSERT MAPPING
      // ---------------------------------------------------------------
      case 'upsert_mapping': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)
        if (!body.rule_id || !body.milestone_event) {
          return errorResponse('rule_id and milestone_event are required', req, 400)
        }

        const { data, error } = await serviceClient
          .from('linkedin_conversion_mappings')
          .upsert({
            org_id: orgId,
            rule_id: body.rule_id,
            milestone_event: body.milestone_event,
            is_enabled: body.is_enabled ?? true,
            value_amount: body.value_amount,
            value_currency: body.value_currency || 'USD',
            changed_by: user.id,
            changed_at: new Date().toISOString(),
          }, {
            onConflict: 'org_id,rule_id,milestone_event',
          })
          .select('id, rule_id, milestone_event, is_enabled, value_amount, version, updated_at')
          .single()

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ mapping: data }, req)
      }

      // ---------------------------------------------------------------
      // TOGGLE MAPPING
      // ---------------------------------------------------------------
      case 'toggle_mapping': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)
        if (!body.mapping_id) return errorResponse('mapping_id is required', req, 400)

        // Get current state
        const { data: current } = await serviceClient
          .from('linkedin_conversion_mappings')
          .select('is_enabled, version')
          .eq('id', body.mapping_id)
          .eq('org_id', orgId)
          .maybeSingle()

        if (!current) return errorResponse('Mapping not found', req, 404)

        const { data, error } = await serviceClient
          .from('linkedin_conversion_mappings')
          .update({
            is_enabled: body.is_enabled ?? !current.is_enabled,
            version: current.version + 1,
            changed_by: user.id,
            changed_at: new Date().toISOString(),
          })
          .eq('id', body.mapping_id)
          .eq('org_id', orgId)
          .select('id, milestone_event, is_enabled, version, updated_at')
          .single()

        if (error) return errorResponse(error.message, req, 500)
        return jsonResponse({ mapping: data }, req)
      }

      // ---------------------------------------------------------------
      // GET CONVERSION STATUS (event delivery stats)
      // ---------------------------------------------------------------
      case 'get_conversion_status': {
        const pageSize = Math.min(body.page_size ?? 20, 100)
        const page = body.page ?? 0

        // Recent events
        const { data: events, error: eventsError } = await userClient
          .from('linkedin_conversion_events')
          .select('id, milestone_event, status, event_time, deal_id, contact_id, user_email, value_amount, retry_count, last_error, delivered_at, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (eventsError) return errorResponse(eventsError.message, req, 500)

        // Summary stats
        const { data: stats } = await serviceClient.rpc('get_conversion_stats', { p_org_id: orgId }).maybeSingle()

        return jsonResponse({
          events,
          stats: stats ?? {
            total_events: 0,
            delivered: 0,
            pending: 0,
            failed: 0,
            delivery_rate: 0,
          },
          page,
          page_size: pageSize,
        }, req)
      }

      // ---------------------------------------------------------------
      // SYNC RULE TO LINKEDIN (creates rule via Conversions API)
      // ---------------------------------------------------------------
      case 'sync_rule_to_linkedin': {
        const isAdmin = await checkAdminRole(userClient, user.id, orgId)
        if (!isAdmin) return errorResponse('Admin access required', req, 403)
        if (!body.rule_id) return errorResponse('rule_id is required', req, 400)

        // Get rule details
        const { data: rule } = await serviceClient
          .from('linkedin_conversion_rules')
          .select('id, name, milestone_event, linkedin_ad_account_id, attribution_type, post_click_window_days, view_through_window_days')
          .eq('id', body.rule_id)
          .eq('org_id', orgId)
          .maybeSingle()

        if (!rule) return errorResponse('Rule not found', req, 404)

        // Get integration credentials
        const { data: integration } = await serviceClient
          .from('linkedin_org_integrations')
          .select('access_token_encrypted, conversions_enabled')
          .eq('org_id', orgId)
          .eq('is_connected', true)
          .maybeSingle()

        if (!integration?.access_token_encrypted) {
          return errorResponse('LinkedIn integration not connected or missing access token', req, 400)
        }

        if (!integration.conversions_enabled) {
          return errorResponse('Conversions are not enabled for this integration', req, 400)
        }

        try {
          // Create conversion rule on LinkedIn
          const linkedinResponse = await fetch(
            `https://api.linkedin.com/rest/conversions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${integration.access_token_encrypted}`,
                'Content-Type': 'application/json',
                'LinkedIn-Version': '202401',
                'X-Restli-Protocol-Version': '2.0.0',
              },
              body: JSON.stringify({
                name: rule.name,
                account: `urn:li:sponsoredAccount:${rule.linkedin_ad_account_id}`,
                type: 'CONVERSION',
                attributionType: rule.attribution_type,
                postClickAttributionWindowSize: rule.post_click_window_days,
                viewThroughAttributionWindowSize: rule.view_through_window_days,
                conversionMethod: 'CONVERSIONS_API',
              }),
            }
          )

          if (!linkedinResponse.ok) {
            const errorBody = await linkedinResponse.text()
            await serviceClient
              .from('linkedin_conversion_rules')
              .update({ sync_error: errorBody, last_synced_at: new Date().toISOString() })
              .eq('id', rule.id)

            return errorResponse(`LinkedIn API error: ${linkedinResponse.status} — ${errorBody}`, req, 502)
          }

          const linkedinData = await linkedinResponse.json()
          const ruleId = linkedinData.id || linkedinData.value?.id

          // Update rule with LinkedIn ID
          await serviceClient
            .from('linkedin_conversion_rules')
            .update({
              linkedin_rule_id: ruleId,
              is_synced: true,
              last_synced_at: new Date().toISOString(),
              sync_error: null,
            })
            .eq('id', rule.id)

          return jsonResponse({
            synced: true,
            linkedin_rule_id: ruleId,
          }, req)

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          await serviceClient
            .from('linkedin_conversion_rules')
            .update({ sync_error: message, last_synced_at: new Date().toISOString() })
            .eq('id', rule.id)

          return errorResponse(`Failed to sync: ${message}`, req, 500)
        }
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }
  } catch (err) {
    console.error('[linkedin-conversion-config]', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500)
  }
})
