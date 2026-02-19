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
    const taskId = extractIdFromPath(url, 'api-v1-tasks')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!taskId) {
        // GET /api-v1-tasks - List tasks
        response = await handleTasksList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-tasks/:id - Single task
        response = await handleSingleTask(client, taskId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-tasks - Create task
      if (!checkPermission(permissions, 'tasks:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateTask(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-tasks/:id - Update task
      if (!taskId) {
        return createErrorResponse('Task ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'tasks:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateTask(client, taskId, body, user_id, permissions)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-tasks/:id - Delete task
      if (!taskId) {
        return createErrorResponse('Task ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'tasks:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteTask(client, taskId, user_id, permissions)
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
        function: 'api-v1-tasks',
        integration: 'supabase',
      },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List tasks
async function handleTasksList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('tasks')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        completed_at,
        assigned_to,
        created_by,
        deal_id,
        company_id,
        contact_id,
        created_at,
        updated_at,
        assigned_user:assigned_to(
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        creator:created_by(
          id,
          first_name,
          last_name,
          email
        ),
        deal:deal_id(
          id,
          name,
          company,
          value
        ),
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
      query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`title.ilike."%${search}%",description.ilike."%${search}%"`)
    }
    
    if (params.status) {
      query = query.eq('status', params.status)
    }
    
    if (params.priority) {
      query = query.eq('priority', params.priority)
    }
    
    if (params.assigned_to && isValidUUID(params.assigned_to)) {
      query = query.eq('assigned_to', params.assigned_to)
    }
    
    if (params.created_by && isValidUUID(params.created_by)) {
      query = query.eq('created_by', params.created_by)
    }
    
    if (params.deal_id && isValidUUID(params.deal_id)) {
      query = query.eq('deal_id', params.deal_id)
    }
    
    if (params.company_id && isValidUUID(params.company_id)) {
      query = query.eq('company_id', params.company_id)
    }

    // Date filters
    if (params.due_before) {
      query = query.lte('due_date', params.due_before)
    }
    
    if (params.due_after) {
      query = query.gte('due_date', params.due_after)
    }

    // Overdue tasks
    if (params.overdue === 'true') {
      const now = new Date().toISOString()
      query = query.lt('due_date', now).neq('status', 'completed')
    }

    // Apply standard filters (pagination, sorting)
    query = applyStandardFilters(query, params)

    const { data: tasks, error, count } = await query

    if (error) {
      throw error
    }

    // Process tasks to add computed fields
    const processedTasks = tasks?.map((task: any) => ({
      ...task,
      assigned_user_name: task.assigned_user 
        ? `${task.assigned_user.first_name || ''} ${task.assigned_user.last_name || ''}`.trim()
        : null,
      assigned_user_email: task.assigned_user?.email || null,
      assigned_user_avatar: task.assigned_user?.avatar_url || null,
      creator_name: task.creator 
        ? `${task.creator.first_name || ''} ${task.creator.last_name || ''}`.trim()
        : null,
      creator_email: task.creator?.email || null,
      deal_name: task.deal?.name || null,
      deal_company: task.deal?.company || null,
      deal_value: task.deal?.value || null,
      company_name: task.company?.name || null,
      contact_name: task.contact 
        ? `${task.contact.first_name || ''} ${task.contact.last_name || ''}`.trim()
        : null,
      contact_email: task.contact?.email || null,
      is_overdue: task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed',
      days_until_due: task.due_date 
        ? Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : null
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedTasks, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch tasks')
  }
}

// Get single task
async function handleSingleTask(client: any, taskId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(taskId)) {
      return createErrorResponse('Invalid task ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('tasks')
      .select(`
        *,
        assigned_user:assigned_to(
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        creator:created_by(
          id,
          first_name,
          last_name,
          email
        ),
        deal:deal_id(
          id,
          name,
          company,
          value,
          stage_id,
          deal_stages:stage_id(name, color)
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
      .eq('id', taskId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
    }

    const { data: task, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Task not found', 404, 'TASK_NOT_FOUND')
      }
      throw error
    }

    // Process task to add computed fields
    const processedTask = {
      ...task,
      assigned_user_name: task.assigned_user 
        ? `${task.assigned_user.first_name || ''} ${task.assigned_user.last_name || ''}`.trim()
        : null,
      assigned_user_email: task.assigned_user?.email || null,
      assigned_user_avatar: task.assigned_user?.avatar_url || null,
      creator_name: task.creator 
        ? `${task.creator.first_name || ''} ${task.creator.last_name || ''}`.trim()
        : null,
      creator_email: task.creator?.email || null,
      deal_name: task.deal?.name || null,
      deal_company: task.deal?.company || null,
      deal_value: task.deal?.value || null,
      deal_stage_name: task.deal?.deal_stages?.name || null,
      deal_stage_color: task.deal?.deal_stages?.color || null,
      company_name: task.company?.name || null,
      company_website: task.company?.website || null,
      company_industry: task.company?.industry || null,
      contact_name: task.contact 
        ? `${task.contact.first_name || ''} ${task.contact.last_name || ''}`.trim()
        : null,
      contact_email: task.contact?.email || null,
      contact_phone: task.contact?.phone || null,
      contact_title: task.contact?.title || null,
      is_overdue: task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed',
      days_until_due: task.due_date 
        ? Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : null
    }

    return createSuccessResponse(processedTask)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch task')
  }
}

// Create task
async function handleCreateTask(client: any, body: any, userId: string) {
  try {
    // Validate required fields
    const requiredFields = ['title']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled']
    if (body.status && !validStatuses.includes(body.status)) {
      return createErrorResponse('Invalid status. Must be one of: pending, in_progress, completed, cancelled', 400, 'INVALID_STATUS')
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'urgent']
    if (body.priority && !validPriorities.includes(body.priority)) {
      return createErrorResponse('Invalid priority. Must be one of: low, medium, high, urgent', 400, 'INVALID_PRIORITY')
    }

    // Validate UUID fields if provided
    const uuidFields = ['assigned_to', 'deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate due_date format if provided
    if (body.due_date) {
      const dueDate = new Date(body.due_date)
      if (isNaN(dueDate.getTime())) {
        return createErrorResponse('Invalid due_date format', 400, 'INVALID_DATE')
      }
    }

    const taskData = {
      ...body,
      created_by: userId,
      assigned_to: body.assigned_to || userId, // Default to creator if no assignment
      status: body.status || 'todo' // Default to todo
    }

    const { data: task, error } = await client
      .from('tasks')
      .insert(taskData)
      .select(`
        *,
        assigned_user:assigned_to(
          id,
          first_name,
          last_name,
          email
        ),
        creator:created_by(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .single()

    if (error) {
      throw error
    }

    // Process task to add computed fields
    const processedTask = {
      ...task,
      assigned_user_name: task.assigned_user 
        ? `${task.assigned_user.first_name || ''} ${task.assigned_user.last_name || ''}`.trim()
        : null,
      creator_name: task.creator 
        ? `${task.creator.first_name || ''} ${task.creator.last_name || ''}`.trim()
        : null
    }

    return createSuccessResponse(processedTask, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create task')
  }
}

// Update task
async function handleUpdateTask(client: any, taskId: string, body: any, userId: string, permissions: any) {
  try {
    if (!isValidUUID(taskId)) {
      return createErrorResponse('Invalid task ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled']
    if (body.status && !validStatuses.includes(body.status)) {
      return createErrorResponse('Invalid status. Must be one of: pending, in_progress, completed, cancelled', 400, 'INVALID_STATUS')
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high', 'urgent']
    if (body.priority && !validPriorities.includes(body.priority)) {
      return createErrorResponse('Invalid priority. Must be one of: low, medium, high, urgent', 400, 'INVALID_PRIORITY')
    }

    // Validate UUID fields if provided
    const uuidFields = ['assigned_to', 'deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate due_date format if provided
    if (body.due_date) {
      const dueDate = new Date(body.due_date)
      if (isNaN(dueDate.getTime())) {
        return createErrorResponse('Invalid due_date format', 400, 'INVALID_DATE')
      }
    }

    // Check if user can edit this task
    const { data: existingTask, error: fetchError } = await client
      .from('tasks')
      .select('assigned_to, created_by')
      .eq('id', taskId)
      .single()

    if (fetchError || !existingTask) {
      return createErrorResponse('Task not found', 404, 'TASK_NOT_FOUND')
    }

    // Non-admins can only edit tasks they created or are assigned to
    if (!checkPermission(permissions, 'admin')) {
      if (existingTask.assigned_to !== userId && existingTask.created_by !== userId) {
        return createErrorResponse('Not authorized to edit this task', 403, 'NOT_AUTHORIZED')
      }
    }

    const updateData = { 
      ...body,
      updated_at: new Date().toISOString()
    }

    // Set completed_at when status changes to completed
    if (body.status === 'completed' && (!existingTask.completed_at)) {
      updateData.completed_at = new Date().toISOString()
    } else if (body.status && body.status !== 'completed') {
      updateData.completed_at = null
    }

    const { data: task, error } = await client
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select(`
        *,
        assigned_user:assigned_to(
          id,
          first_name,
          last_name,
          email
        ),
        creator:created_by(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .single()

    if (error) {
      throw error
    }

    // Process task to add computed fields
    const processedTask = {
      ...task,
      assigned_user_name: task.assigned_user 
        ? `${task.assigned_user.first_name || ''} ${task.assigned_user.last_name || ''}`.trim()
        : null,
      creator_name: task.creator 
        ? `${task.creator.first_name || ''} ${task.creator.last_name || ''}`.trim()
        : null
    }

    return createSuccessResponse(processedTask)

  } catch (error) {
    throw new Error(error.message || 'Failed to update task')
  }
}

// Delete task
async function handleDeleteTask(client: any, taskId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(taskId)) {
      return createErrorResponse('Invalid task ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Check if task exists and get ownership info
    const { data: existingTask, error: fetchError } = await client
      .from('tasks')
      .select('assigned_to, created_by')
      .eq('id', taskId)
      .single()

    if (fetchError || !existingTask) {
      return createErrorResponse('Task not found', 404, 'TASK_NOT_FOUND')
    }

    // Non-admins can only delete tasks they created
    if (!checkPermission(permissions, 'admin') && existingTask.created_by !== userId) {
      return createErrorResponse('Not authorized to delete this task', 403, 'NOT_AUTHORIZED')
    }

    const { error } = await client
      .from('tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      throw error
    }

    return createSuccessResponse({ id: taskId, deleted: true })

  } catch (error) {
    throw new Error(error.message || 'Failed to delete task')
  }
}