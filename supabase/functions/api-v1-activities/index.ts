import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { captureException } from '../_shared/sentryEdge.ts'
import { 
  authenticateRequest, 
  parseQueryParams, 
  applyStandardFilters,
  createSuccessResponse,
  createErrorResponse,
  extractIdFromPath,
  isValidUUID,
  validateRequiredFields,
  logApiUsage,
  handleRateLimit,
  checkPermission,
  createPaginationMeta
} from '../_shared/api-utils.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now()
  let statusCode = 200
  
  try {
    // Authenticate request
    const { client, user_id, permissions } = await authenticateRequest(req)
    
    // Check rate limit
    const rateLimitResponse = await handleRateLimit(req, client)
    if (rateLimitResponse) return rateLimitResponse

    const url = new URL(req.url)
    const activityId = extractIdFromPath(url, 'api-v1-activities')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!activityId) {
        // GET /api-v1-activities - List activities
        response = await handleActivitiesList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-activities/:id - Single activity
        response = await handleSingleActivity(client, activityId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-activities - Create activity
      if (!checkPermission(permissions, 'activities:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateActivity(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-activities/:id - Update activity
      if (!activityId) {
        return createErrorResponse('Activity ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'activities:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateActivity(client, activityId, body, user_id, permissions)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-activities/:id - Delete activity
      if (!activityId) {
        return createErrorResponse('Activity ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'activities:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteActivity(client, activityId, user_id, permissions)
    } else {
      return createErrorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
    }

    // Extract status code from response
    statusCode = response.status
    
    // Log API usage (async, don't wait)
    const apiKey = req.headers.get('X-API-Key')
    if (apiKey) {
      logApiUsage(
        client,
        apiKey,
        url.pathname,
        req.method,
        statusCode,
        Date.now() - startTime,
        req
      ).catch(console.error)
    }

    return response

  } catch (error) {
    statusCode = 500
    await captureException(error, {
      tags: {
        function: 'api-v1-activities',
        integration: 'supabase',
      },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List activities
async function handleActivitiesList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('activities')
      .select(`
        id,
        type,
        subject,
        details,
        amount,
        date,
        status,
        deal_id,
        company_id,
        contact_id,
        owner_id,
        created_at,
        updated_at,
        owner_id,
        deal_id,
        company:company_id(
          id,
          name
        ),
        contact:contact_id(
          id,
          first_name,
          last_name,
          email
        )
      `, { count: 'exact' })

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`subject.ilike."%${search}%",details.ilike."%${search}%"`)
    }
    
    if (params.type) {
      query = query.eq('type', params.type)
    }
    
    if (params.status) {
      query = query.eq('status', params.status)
    }
    
    if (params.outcome) {
      query = query.eq('outcome', params.outcome)
    }
    
    if (params.owner_id && isValidUUID(params.owner_id)) {
      query = query.eq('owner_id', params.owner_id)
    }
    
    if (params.deal_id && isValidUUID(params.deal_id)) {
      query = query.eq('deal_id', params.deal_id)
    }
    
    if (params.company_id && isValidUUID(params.company_id)) {
      query = query.eq('company_id', params.company_id)
    }
    
    if (params.contact_id && isValidUUID(params.contact_id)) {
      query = query.eq('contact_id', params.contact_id)
    }

    // stage_id filter removed - activities table doesn't have stage_id column

    // Date filters
    if (params.date_from) {
      query = query.gte('date', params.date_from)
    }
    
    if (params.date_to) {
      query = query.lte('date', params.date_to)
    }

    // Amount filters
    if (params.min_amount) {
      const minAmount = parseFloat(params.min_amount)
      if (!isNaN(minAmount)) {
        query = query.gte('amount', minAmount)
      }
    }

    if (params.max_amount) {
      const maxAmount = parseFloat(params.max_amount)
      if (!isNaN(maxAmount)) {
        query = query.lte('amount', maxAmount)
      }
    }

    // This week filter
    if (params.this_week === 'true') {
      const now = new Date()
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 7)
      query = query.gte('date', startOfWeek.toISOString()).lt('date', endOfWeek.toISOString())
    }

    // This month filter
    if (params.this_month === 'true') {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      query = query.gte('date', startOfMonth.toISOString()).lt('date', endOfMonth.toISOString())
    }

    // Apply standard filters (pagination, sorting)
    if (params.sort === 'date' || !params.sort) {
      query = query.order('date', { ascending: params.order !== 'desc' })
    } else {
      query = applyStandardFilters(query, params)
    }

    // Apply pagination
    query = query.range(params.offset, params.offset + params.limit - 1)

    const { data: activities, error, count } = await query

    if (error) {
      throw error
    }

    // Process activities to add computed fields
    const processedActivities = activities?.map((activity: any) => ({
      ...activity,
      owner_name: activity.owner 
        ? `${activity.owner.first_name || ''} ${activity.owner.last_name || ''}`.trim()
        : null,
      owner_email: activity.owner?.email || null,
      deal_name: activity.deal?.name || null,
      deal_company: activity.deal?.company || null,
      deal_value: activity.deal?.value || null,
      company_name: activity.company?.name || null,
      contact_name: activity.contact 
        ? `${activity.contact.first_name || ''} ${activity.contact.last_name || ''}`.trim()
        : null,
      contact_email: activity.contact?.email || null,
      stage_name: activity.stage?.name || null,
      stage_color: activity.stage?.color || null,
      days_ago: activity.date 
        ? Math.floor((new Date().getTime() - new Date(activity.date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      formatted_amount: activity.amount ? `$${activity.amount.toLocaleString()}` : null
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedActivities, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch activities')
  }
}

// Get single activity
async function handleSingleActivity(client: any, activityId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(activityId)) {
      return createErrorResponse('Invalid activity ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('activities')
      .select(`
        *,
        owner_id,
        deal:deal_id(
          id,
          name,
          company,
          value
        ),
        company:company_id(
          id,
          name,
          website,
          industry
        ),
        contact:contact_id(
          id,
          first_name,
          last_name,
          email,
          phone,
          title
        )
      `)
      .eq('id', activityId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    const { data: activity, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Activity not found', 404, 'ACTIVITY_NOT_FOUND')
      }
      throw error
    }

    // Process activity to add computed fields
    const processedActivity = {
      ...activity,
      owner_name: activity.owner 
        ? `${activity.owner.first_name || ''} ${activity.owner.last_name || ''}`.trim()
        : null,
      owner_email: activity.owner?.email || null,
      owner_avatar: activity.owner?.avatar_url || null,
      deal_name: activity.deal?.name || null,
      deal_company: activity.deal?.company || null,
      deal_value: activity.deal?.value || null,
      deal_stage_name: activity.deal?.deal_stages?.name || null,
      deal_stage_color: activity.deal?.deal_stages?.color || null,
      company_name: activity.company?.name || null,
      company_website: activity.company?.website || null,
      company_industry: activity.company?.industry || null,
      contact_name: activity.contact 
        ? `${activity.contact.first_name || ''} ${activity.contact.last_name || ''}`.trim()
        : null,
      contact_email: activity.contact?.email || null,
      contact_phone: activity.contact?.phone || null,
      contact_title: activity.contact?.title || null,
      stage_name: activity.stage?.name || null,
      stage_color: activity.stage?.color || null,
      stage_order: activity.stage?.order_position || null,
      days_ago: activity.date 
        ? Math.floor((new Date().getTime() - new Date(activity.date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      formatted_amount: activity.amount ? `$${activity.amount.toLocaleString()}` : null
    }

    return createSuccessResponse(processedActivity)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch activity')
  }
}

// Create activity
async function handleCreateActivity(client: any, body: any, userId: string) {
  try {
    // Validate required fields
    const requiredFields = ['type', 'subject', 'date']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate activity type
    const validTypes = ['call', 'email', 'meeting', 'task', 'proposal', 'sale', 'note', 'other', 'outbound']
    if (!validTypes.includes(body.type)) {
      return createErrorResponse(
        'Invalid activity type. Must be one of: call, email, meeting, task, proposal, sale, note, other, outbound', 
        400, 
        'INVALID_TYPE'
      )
    }

    // Validate status if provided
    const validStatuses = ['completed', 'pending', 'cancelled']
    if (body.status && !validStatuses.includes(body.status)) {
      return createErrorResponse(
        'Invalid status. Must be one of: completed, pending, cancelled', 
        400, 
        'INVALID_STATUS'
      )
    }

    // Validate outcome if provided
    const validOutcomes = ['positive', 'neutral', 'negative']
    if (body.outcome && !validOutcomes.includes(body.outcome)) {
      return createErrorResponse(
        'Invalid outcome. Must be one of: positive, neutral, negative', 
        400, 
        'INVALID_OUTCOME'
      )
    }

    // Validate UUID fields if provided
    const uuidFields = ['deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate date format
    if (body.date) {
      const date = new Date(body.date)
      if (isNaN(date.getTime())) {
        return createErrorResponse('Invalid date format', 400, 'INVALID_DATE')
      }
    }

    // Validate amount if provided
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount < 0)) {
      return createErrorResponse('Amount must be a positive number', 400, 'INVALID_AMOUNT')
    }

    const activityData = {
      ...body,
      user_id: userId,
      owner_id: userId,
      status: body.status || 'completed' // Default to completed
    }

    const { data: activity, error } = await client
      .from('activities')
      .insert(activityData)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // Process activity to add computed fields
    const processedActivity = {
      ...activity,
      owner_name: activity.owner 
        ? `${activity.owner.first_name || ''} ${activity.owner.last_name || ''}`.trim()
        : null,
      formatted_amount: activity.amount ? `$${activity.amount.toLocaleString()}` : null
    }

    return createSuccessResponse(processedActivity, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create activity')
  }
}

// Update activity
async function handleUpdateActivity(client: any, activityId: string, body: any, userId: string, permissions: any) {
  try {
    if (!isValidUUID(activityId)) {
      return createErrorResponse('Invalid activity ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate activity type if provided
    const validTypes = ['call', 'email', 'meeting', 'task', 'proposal', 'sale', 'note', 'other', 'outbound']
    if (body.type && !validTypes.includes(body.type)) {
      return createErrorResponse(
        'Invalid activity type. Must be one of: call, email, meeting, task, proposal, sale, note, other, outbound', 
        400, 
        'INVALID_TYPE'
      )
    }

    // Validate status if provided
    const validStatuses = ['completed', 'pending', 'cancelled']
    if (body.status && !validStatuses.includes(body.status)) {
      return createErrorResponse(
        'Invalid status. Must be one of: completed, pending, cancelled', 
        400, 
        'INVALID_STATUS'
      )
    }

    // Validate outcome if provided
    const validOutcomes = ['positive', 'neutral', 'negative']
    if (body.outcome && !validOutcomes.includes(body.outcome)) {
      return createErrorResponse(
        'Invalid outcome. Must be one of: positive, neutral, negative', 
        400, 
        'INVALID_OUTCOME'
      )
    }

    // Validate UUID fields if provided
    const uuidFields = ['deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate date format if provided
    if (body.date) {
      const date = new Date(body.date)
      if (isNaN(date.getTime())) {
        return createErrorResponse('Invalid date format', 400, 'INVALID_DATE')
      }
    }

    // Validate amount if provided
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount < 0)) {
      return createErrorResponse('Amount must be a positive number', 400, 'INVALID_AMOUNT')
    }

    // Check if user can edit this activity
    const { data: existingActivity, error: fetchError } = await client
      .from('activities')
      .select('owner_id')
      .eq('id', activityId)
      .single()

    if (fetchError || !existingActivity) {
      return createErrorResponse('Activity not found', 404, 'ACTIVITY_NOT_FOUND')
    }

    // Non-admins can only edit their own activities
    if (!checkPermission(permissions, 'admin') && existingActivity.owner_id !== userId) {
      return createErrorResponse('Not authorized to edit this activity', 403, 'NOT_AUTHORIZED')
    }

    const updateData = {
      ...body,
      updated_at: new Date().toISOString()
    }

    const { data: activity, error } = await client
      .from('activities')
      .update(updateData)
      .eq('id', activityId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // Process activity to add computed fields
    const processedActivity = {
      ...activity,
      owner_name: activity.owner 
        ? `${activity.owner.first_name || ''} ${activity.owner.last_name || ''}`.trim()
        : null,
      formatted_amount: activity.amount ? `$${activity.amount.toLocaleString()}` : null
    }

    return createSuccessResponse(processedActivity)

  } catch (error) {
    throw new Error(error.message || 'Failed to update activity')
  }
}

// Delete activity
async function handleDeleteActivity(client: any, activityId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(activityId)) {
      return createErrorResponse('Invalid activity ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Check if activity exists and get ownership info
    const { data: existingActivity, error: fetchError } = await client
      .from('activities')
      .select('owner_id')
      .eq('id', activityId)
      .single()

    if (fetchError || !existingActivity) {
      return createErrorResponse('Activity not found', 404, 'ACTIVITY_NOT_FOUND')
    }

    // Non-admins can only delete their own activities
    if (!checkPermission(permissions, 'admin') && existingActivity.owner_id !== userId) {
      return createErrorResponse('Not authorized to delete this activity', 403, 'NOT_AUTHORIZED')
    }

    const { error } = await client
      .from('activities')
      .delete()
      .eq('id', activityId)

    if (error) {
      throw error
    }

    return createSuccessResponse({ id: activityId, deleted: true })

  } catch (error) {
    throw new Error(error.message || 'Failed to delete activity')
  }
}