import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts'
import {
  authenticateRequest,
  createErrorResponse,
  logApiUsage,
  handleRateLimit,
  checkPermission
} from '../_shared/api-utils.ts'

import {
  handleActivitiesList, handleSingleActivity,
  handleCreateActivity, handleUpdateActivity, handleDeleteActivity
} from './handlers/activities.ts'

import {
  handleCompaniesList, handleSingleCompany,
  handleCreateCompany, handleUpdateCompany, handleDeleteCompany
} from './handlers/companies.ts'

import {
  handleContactsList, handleSingleContact,
  handleCreateContact, handleUpdateContact, handleDeleteContact
} from './handlers/contacts.ts'

import {
  handleDealsList, handleSingleDeal,
  handleCreateDeal, handleUpdateDeal, handleDeleteDeal
} from './handlers/deals.ts'

import {
  handleMeetingsList, handleSingleMeeting,
  handleCreateMeeting, handleUpdateMeeting, handleDeleteMeeting
} from './handlers/meetings.ts'

import {
  handleTasksList, handleSingleTask,
  handleCreateTask, handleUpdateTask, handleDeleteTask
} from './handlers/tasks.ts'

type EntityHandlers = {
  list: (client: any, url: URL, userId: string, permissions: any) => Promise<Response>
  single: (client: any, id: string, userId: string, permissions: any) => Promise<Response>
  create: (client: any, body: any, userId: string) => Promise<Response>
  update: (client: any, id: string, body: any, userId: string, permissions: any) => Promise<Response>
  delete: (client: any, id: string, userId: string, permissions: any) => Promise<Response>
  permissionPrefix: string
}

const entityHandlers: Record<string, EntityHandlers> = {
  activities: {
    list: handleActivitiesList,
    single: handleSingleActivity,
    create: handleCreateActivity,
    update: handleUpdateActivity,
    delete: handleDeleteActivity,
    permissionPrefix: 'activities'
  },
  companies: {
    list: handleCompaniesList,
    single: handleSingleCompany,
    create: handleCreateCompany,
    update: handleUpdateCompany,
    delete: handleDeleteCompany,
    permissionPrefix: 'companies'
  },
  contacts: {
    list: handleContactsList,
    single: handleSingleContact,
    create: handleCreateContact,
    update: handleUpdateContact,
    delete: handleDeleteContact,
    permissionPrefix: 'contacts'
  },
  deals: {
    list: handleDealsList,
    single: handleSingleDeal,
    create: handleCreateDeal,
    update: handleUpdateDeal,
    delete: handleDeleteDeal,
    permissionPrefix: 'deals'
  },
  meetings: {
    list: handleMeetingsList,
    single: handleSingleMeeting,
    create: handleCreateMeeting,
    update: handleUpdateMeeting,
    delete: handleDeleteMeeting,
    permissionPrefix: 'meetings'
  },
  tasks: {
    list: handleTasksList,
    single: handleSingleTask,
    create: handleCreateTask,
    update: handleUpdateTask,
    delete: handleDeleteTask,
    permissionPrefix: 'tasks'
  }
}

/**
 * Extract entity name and record ID from the URL path.
 * Supports both consolidated and legacy URL patterns:
 *   /functions/v1/api-v1/activities/UUID     → { entity: 'activities', id: 'UUID' }
 *   /functions/v1/api-v1?entity=activities   → { entity: 'activities', id: null }
 */
function parseEntityFromPath(url: URL): { entity: string | null; recordId: string | null } {
  const segments = url.pathname
    .split('/')
    .filter(s => s && s !== 'functions' && s !== 'v1' && s !== 'api-v1')

  const entity = segments[0] || url.searchParams.get('entity') || null
  const recordId = segments[1] || url.searchParams.get('id') || null

  return { entity, recordId }
}

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  const startTime = Date.now()
  let statusCode = 200

  try {
    const { client, user_id, permissions } = await authenticateRequest(req)

    const rateLimitResponse = await handleRateLimit(req, client)
    if (rateLimitResponse) return rateLimitResponse

    const url = new URL(req.url)
    const { entity, recordId } = parseEntityFromPath(url)

    if (!entity || !entityHandlers[entity]) {
      return createErrorResponse(
        `Invalid entity "${entity}". Valid entities: ${Object.keys(entityHandlers).join(', ')}`,
        400,
        'INVALID_ENTITY'
      )
    }

    const handlers = entityHandlers[entity]
    let response: Response

    if (req.method === 'GET') {
      if (!recordId) {
        response = await handlers.list(client, url, user_id, permissions)
      } else {
        response = await handlers.single(client, recordId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      if (!checkPermission(permissions, `${handlers.permissionPrefix}:write`)) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handlers.create(client, body, user_id)
    } else if (req.method === 'PUT') {
      if (!recordId) {
        return createErrorResponse(`${entity} ID required`, 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, `${handlers.permissionPrefix}:write`)) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handlers.update(client, recordId, body, user_id, permissions)
    } else if (req.method === 'DELETE') {
      if (!recordId) {
        return createErrorResponse(`${entity} ID required`, 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, `${handlers.permissionPrefix}:delete`)) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handlers.delete(client, recordId, user_id, permissions)
    } else {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    statusCode = response.status

    const apiKey = req.headers.get('X-API-Key')
    if (apiKey) {
      logApiUsage(client, apiKey, url.pathname, req.method, statusCode, Date.now() - startTime, req)
        .catch(console.error)
    }

    return response

  } catch (error) {
    statusCode = 500
    await captureException(error, {
      tags: { function: 'api-v1', integration: 'supabase' },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})
