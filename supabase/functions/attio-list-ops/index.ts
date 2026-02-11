import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts'
import { AttioClient } from '../_shared/attio.ts'

/**
 * Attio List Operations
 *
 * Action router for Attio list management:
 * - get_lists: List all Attio lists (including deal pipelines)
 * - get_list_entries: Query entries in a list
 * - add_to_list: Add a record to a list
 * - remove_from_list: Remove an entry from a list
 */
serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse('Server misconfigured', req, 500)
  }

  // Validate user JWT
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader) return errorResponse('Unauthorized', req, 401)

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) return errorResponse('Unauthorized', req, 401)

  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await req.json()
    const { action, org_id } = body

    if (!action || !org_id) {
      return errorResponse('Missing action or org_id', req, 400)
    }

    // Check org membership (admin/owner for write ops, member for read)
    const { data: membership } = await svc
      .from('organization_memberships')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse('Not a member of this organization', req, 403)
    }

    const isAdmin = membership.role === 'owner' || membership.role === 'admin'
    const isWriteAction = ['add_to_list', 'remove_from_list'].includes(action)
    if (isWriteAction && !isAdmin) {
      return errorResponse('Admin role required for write operations', req, 403)
    }

    // Get Attio credentials
    const { data: creds, error: credsError } = await svc
      .from('attio_org_credentials')
      .select('access_token')
      .eq('org_id', org_id)
      .maybeSingle()

    if (credsError || !creds?.access_token) {
      return errorResponse('Attio not connected', req, 400)
    }

    const client = new AttioClient({ accessToken: creds.access_token })

    switch (action) {
      case 'get_lists': {
        const result = await client.listLists()
        return jsonResponse({ success: true, data: result.data }, req)
      }

      case 'get_list_entries': {
        const { list_id, filter, sorts, limit, offset } = body
        if (!list_id) return errorResponse('Missing list_id', req, 400)

        const result = await client.queryListEntries(list_id, {
          filter,
          sorts,
          limit: limit || 100,
          offset: offset || 0,
        })
        return jsonResponse({ success: true, data: result.data, next_offset: result.next_offset }, req)
      }

      case 'add_to_list': {
        const { list_id, parent_object, parent_record_id, entry_values } = body
        if (!list_id || !parent_object || !parent_record_id) {
          return errorResponse('Missing list_id, parent_object, or parent_record_id', req, 400)
        }

        const result = await client.addToList(list_id, parent_object, parent_record_id, entry_values)
        return jsonResponse({ success: true, data: result }, req)
      }

      case 'remove_from_list': {
        const { list_id: removeListId, entry_id } = body
        if (!removeListId || !entry_id) {
          return errorResponse('Missing list_id or entry_id', req, 400)
        }

        await client.removeFromList(removeListId, entry_id)
        return jsonResponse({ success: true }, req)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400)
    }
  } catch (error) {
    console.error('[attio-list-ops] Error:', error)
    const status = (error as any)?.status || 500
    return errorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      req,
      status
    )
  }
})
