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
    const meetingId = extractIdFromPath(url, 'api-v1-meetings')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!meetingId) {
        // GET /api-v1-meetings - List meetings
        response = await handleMeetingsList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-meetings/:id - Single meeting
        response = await handleSingleMeeting(client, meetingId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-meetings - Create meeting
      if (!checkPermission(permissions, 'meetings:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateMeeting(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-meetings/:id - Update meeting
      if (!meetingId) {
        return createErrorResponse('Meeting ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'meetings:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateMeeting(client, meetingId, body, user_id, permissions)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-meetings/:id - Delete meeting
      if (!meetingId) {
        return createErrorResponse('Meeting ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'meetings:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteMeeting(client, meetingId, user_id, permissions)
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
        function: 'api-v1-meetings',
        integration: 'supabase',
      },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List meetings
async function handleMeetingsList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('meetings')
      .select(`
        id,
        fathom_recording_id,
        title,
        share_url,
        calls_url,
        meeting_start,
        meeting_end,
        duration_minutes,
        owner_user_id,
        owner_email,
        team_name,
        company_id,
        primary_contact_id,
        summary,
        transcript_doc_url,
        sentiment_score,
        coach_rating,
        coach_summary,
        talk_time_rep_pct,
        talk_time_customer_pct,
        talk_time_judgement,
        created_at,
        updated_at,
        created_by,
        contact_id,
        start_time
      `, { count: 'exact' })

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('created_by', userId)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`title.ilike."%${search}%",description.ilike."%${search}%",notes.ilike."%${search}%"`)
    }
    
    if (params.meeting_type) {
      query = query.eq('meeting_type', params.meeting_type)
    }
    
    // status filter removed - meetings table doesn't have status column
    
    if (params.deal_id && isValidUUID(params.deal_id)) {
      query = query.eq('deal_id', params.deal_id)
    }
    
    if (params.company_id && isValidUUID(params.company_id)) {
      query = query.eq('company_id', params.company_id)
    }
    
    if (params.contact_id && isValidUUID(params.contact_id)) {
      query = query.eq('contact_id', params.contact_id)
    }

    // Date filters
    if (params.start_after) {
      query = query.gte('start_time', params.start_after)
    }
    
    if (params.start_before) {
      query = query.lte('start_time', params.start_before)
    }

    // Today's meetings
    if (params.today === 'true') {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
      query = query.gte('start_time', startOfDay).lt('start_time', endOfDay)
    }

    // Upcoming meetings
    if (params.upcoming === 'true') {
      const now = new Date().toISOString()
      query = query.gte('start_time', now).in('status', ['scheduled', 'in_progress'])
    }

    // Past meetings
    if (params.past === 'true') {
      const now = new Date().toISOString()
      query = query.lt('end_time', now)
    }

    // Apply standard filters (pagination, sorting)
    if (params.sort === 'start_time' || !params.sort) {
      query = query.order('start_time', { ascending: params.order !== 'desc' })
    } else {
      query = applyStandardFilters(query, params)
    }

    // Apply pagination
    query = query.range(params.offset, params.offset + params.limit - 1)

    const { data: meetings, error, count } = await query

    if (error) {
      throw error
    }

    // Process meetings to add computed fields
    const processedMeetings = meetings?.map((meeting: any) => ({
      ...meeting,
      computed_duration_minutes: meeting.meeting_start && meeting.meeting_end 
        ? Math.round((new Date(meeting.meeting_end).getTime() - new Date(meeting.meeting_start).getTime()) / (1000 * 60))
        : meeting.duration_minutes,
      is_upcoming: meeting.start_time ? new Date(meeting.start_time) > new Date() : meeting.meeting_start ? new Date(meeting.meeting_start) > new Date() : false,
      is_past: meeting.meeting_end ? new Date(meeting.meeting_end) < new Date() : false,
      attendee_count: 0
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedMeetings, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch meetings')
  }
}

// Get single meeting
async function handleSingleMeeting(client: any, meetingId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(meetingId)) {
      return createErrorResponse('Invalid meeting ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('meetings')
      .select(`
        *
      `)
      .eq('id', meetingId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('created_by', userId)
    }

    const { data: meeting, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Meeting not found', 404, 'MEETING_NOT_FOUND')
      }
      throw error
    }

    // Process meeting to add computed fields
    const processedMeeting = {
      ...meeting,
      computed_duration_minutes: meeting.meeting_start && meeting.meeting_end 
        ? Math.round((new Date(meeting.meeting_end).getTime() - new Date(meeting.meeting_start).getTime()) / (1000 * 60))
        : meeting.duration_minutes,
      is_upcoming: meeting.start_time ? new Date(meeting.start_time) > new Date() : meeting.meeting_start ? new Date(meeting.meeting_start) > new Date() : false,
      is_past: meeting.meeting_end ? new Date(meeting.meeting_end) < new Date() : false,
      attendee_count: 0
    }

    return createSuccessResponse(processedMeeting)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch meeting')
  }
}

// Create meeting
async function handleCreateMeeting(client: any, body: any, userId: string) {
  try {
    // Validate required fields
    const requiredFields = ['title']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate meeting_type if provided
    const validMeetingTypes = ['discovery', 'demo', 'proposal', 'negotiation', 'onboarding', 'check_in', 'other']
    if (body.meeting_type && !validMeetingTypes.includes(body.meeting_type)) {
      return createErrorResponse(
        'Invalid meeting_type. Must be one of: discovery, demo, proposal, negotiation, onboarding, check_in, other', 
        400, 
        'INVALID_MEETING_TYPE'
      )
    }

    // status validation removed - meetings table doesn't have status column

    // Validate UUID fields if provided
    const uuidFields = ['deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate date formats
    const dateFields = ['start_time', 'end_time']
    for (const field of dateFields) {
      if (body[field]) {
        const date = new Date(body[field])
        if (isNaN(date.getTime())) {
          return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_DATE')
        }
      }
    }

    // Validate that end_time is after start_time if both provided
    if (body.start_time && body.end_time) {
      const startTime = new Date(body.start_time)
      const endTime = new Date(body.end_time)
      if (endTime <= startTime) {
        return createErrorResponse('End time must be after start time', 400, 'INVALID_TIME_RANGE')
      }
    }

    // Validate attendees format if provided
    if (body.attendees && !Array.isArray(body.attendees)) {
      return createErrorResponse('Attendees must be an array', 400, 'INVALID_ATTENDEES')
    }

    // Map API fields to database fields
    const meetingData = {
      title: body.title,
      fathom_recording_id: body.fathom_recording_id,
      share_url: body.share_url,
      calls_url: body.calls_url,
      meeting_start: body.start_time,
      meeting_end: body.end_time,
      duration_minutes: body.duration_minutes,
      owner_email: body.owner_email,
      team_name: body.team_name,
      summary: body.summary,
      owner_user_id: userId,
      created_by: userId
    }

    const { data: meeting, error } = await client
      .from('meetings')
      .insert(meetingData)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // Process meeting to add computed fields
    const processedMeeting = {
      ...meeting
    }

    return createSuccessResponse(processedMeeting, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create meeting')
  }
}

// Update meeting
async function handleUpdateMeeting(client: any, meetingId: string, body: any, userId: string, permissions: any) {
  try {
    if (!isValidUUID(meetingId)) {
      return createErrorResponse('Invalid meeting ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate meeting_type if provided
    const validMeetingTypes = ['discovery', 'demo', 'proposal', 'negotiation', 'onboarding', 'check_in', 'other']
    if (body.meeting_type && !validMeetingTypes.includes(body.meeting_type)) {
      return createErrorResponse(
        'Invalid meeting_type. Must be one of: discovery, demo, proposal, negotiation, onboarding, check_in, other', 
        400, 
        'INVALID_MEETING_TYPE'
      )
    }

    // status validation removed - meetings table doesn't have status column

    // Validate UUID fields if provided
    const uuidFields = ['deal_id', 'company_id', 'contact_id']
    for (const field of uuidFields) {
      if (body[field] && !isValidUUID(body[field])) {
        return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_UUID')
      }
    }

    // Validate date formats
    const dateFields = ['start_time', 'end_time']
    for (const field of dateFields) {
      if (body[field]) {
        const date = new Date(body[field])
        if (isNaN(date.getTime())) {
          return createErrorResponse(`Invalid ${field} format`, 400, 'INVALID_DATE')
        }
      }
    }

    // Validate attendees format if provided
    if (body.attendees && !Array.isArray(body.attendees)) {
      return createErrorResponse('Attendees must be an array', 400, 'INVALID_ATTENDEES')
    }

    // Check if user can edit this meeting
    const { data: existingMeeting, error: fetchError } = await client
      .from('meetings')
      .select('owner_user_id, meeting_start, meeting_end')
      .eq('id', meetingId)
      .single()

    if (fetchError || !existingMeeting) {
      return createErrorResponse('Meeting not found', 404, 'MEETING_NOT_FOUND')
    }

    // Non-admins can only edit their own meetings
    if (!checkPermission(permissions, 'admin') && existingMeeting.owner_user_id !== userId) {
      return createErrorResponse('Not authorized to edit this meeting', 403, 'NOT_AUTHORIZED')
    }

    // Validate that end_time is after start_time
    const startTime = body.start_time ? new Date(body.start_time) : new Date(existingMeeting.meeting_start)
    const endTime = body.end_time ? new Date(body.end_time) : (existingMeeting.meeting_end ? new Date(existingMeeting.meeting_end) : null)
    
    if (endTime && endTime <= startTime) {
      return createErrorResponse('End time must be after start time', 400, 'INVALID_TIME_RANGE')
    }

    const updateData = {
      ...body,
      updated_at: new Date().toISOString()
    }

    const { data: meeting, error } = await client
      .from('meetings')
      .update(updateData)
      .eq('id', meetingId)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    // Process meeting to add computed fields
    const processedMeeting = {
      ...meeting
    }

    return createSuccessResponse(processedMeeting)

  } catch (error) {
    throw new Error(error.message || 'Failed to update meeting')
  }
}

// Delete meeting
async function handleDeleteMeeting(client: any, meetingId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(meetingId)) {
      return createErrorResponse('Invalid meeting ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Check if meeting exists and get ownership info
    const { data: existingMeeting, error: fetchError } = await client
      .from('meetings')
      .select('owner_user_id')
      .eq('id', meetingId)
      .single()

    if (fetchError || !existingMeeting) {
      return createErrorResponse('Meeting not found', 404, 'MEETING_NOT_FOUND')
    }

    // Non-admins can only delete their own meetings
    if (!checkPermission(permissions, 'admin') && existingMeeting.owner_user_id !== userId) {
      return createErrorResponse('Not authorized to delete this meeting', 403, 'NOT_AUTHORIZED')
    }

    const { error } = await client
      .from('meetings')
      .delete()
      .eq('id', meetingId)

    if (error) {
      throw error
    }

    return createSuccessResponse({ id: meetingId, deleted: true })

  } catch (error) {
    throw new Error(error.message || 'Failed to delete meeting')
  }
}