import { captureException } from '../../_shared/sentryEdge.ts'
import {
  authenticateRequest,
  createErrorResponse,
  logApiUsage,
  handleRateLimit,
  checkPermission
} from '../../_shared/api-utils.ts'
import {
  handleActivitiesList,
  handleSingleActivity,
  handleCreateActivity,
  handleUpdateActivity,
  handleDeleteActivity
} from '../../api-v1/handlers/activities.ts'

/**
 * Unified handler for the activities entity.
 *
 * Routing is determined by HTTP method first, then by `sub_action` in the
 * JSON body for POST-only callers coming through the action router.
 *
 * sub_action values: list | get | create (default) | update | delete
 */
export async function handleActivities(req: Request): Promise<Response> {
  let statusCode = 200

  try {
    const { client, user_id, permissions } = await authenticateRequest(req)

    const rateLimitResponse = await handleRateLimit(req, client)
    if (rateLimitResponse) return rateLimitResponse

    const url = new URL(req.url)
    const body = req.method !== 'GET' ? await req.json() : null
    const subAction = body?.sub_action as string | undefined
    const recordId = body?.id || url.searchParams.get('id') || null

    let response: Response

    // Route by HTTP method, with sub_action overrides for POST-based router
    if (req.method === 'GET' || subAction === 'list' || subAction === 'get') {
      if (subAction === 'get' && recordId) {
        response = await handleSingleActivity(client, recordId, user_id, permissions)
      } else if (recordId && !subAction) {
        response = await handleSingleActivity(client, recordId, user_id, permissions)
      } else {
        response = await handleActivitiesList(client, url, user_id, permissions)
      }
    } else if (req.method === 'PUT' || subAction === 'update') {
      if (!recordId) {
        return createErrorResponse('Activity ID required', 400, 'MISSING_ID', undefined, req)
      }
      if (!checkPermission(permissions, 'activities:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS', undefined, req)
      }
      const { sub_action: _sa, action: _a, id: _id, ...updateBody } = body || {}
      response = await handleUpdateActivity(client, recordId, updateBody, user_id, permissions)
    } else if (req.method === 'DELETE' || subAction === 'delete') {
      if (!recordId) {
        return createErrorResponse('Activity ID required', 400, 'MISSING_ID', undefined, req)
      }
      if (!checkPermission(permissions, 'activities:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS', undefined, req)
      }
      response = await handleDeleteActivity(client, recordId, user_id, permissions)
    } else {
      // Default POST = create
      if (!checkPermission(permissions, 'activities:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS', undefined, req)
      }
      const { sub_action: _sa, action: _a, ...createBody } = body || {}
      response = await handleCreateActivity(client, createBody, user_id)
    }

    statusCode = response.status

    const apiKey = req.headers.get('X-API-Key')
    if (apiKey) {
      logApiUsage(client, apiKey, '/api-v1-router/activities', req.method, statusCode, user_id, req)
        .catch(console.error)
    }

    return response
  } catch (error: unknown) {
    statusCode = 500
    await captureException(error, {
      tags: { function: 'api-v1-router', handler: 'activities', integration: 'supabase' },
    })
    return createErrorResponse((error as Error).message || 'Internal server error', statusCode, undefined, undefined, req)
  }
}
