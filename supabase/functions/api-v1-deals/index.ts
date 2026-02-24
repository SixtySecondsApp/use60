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
    const dealId = extractIdFromPath(url, 'api-v1-deals')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!dealId) {
        // GET /api-v1-deals - List deals
        response = await handleDealsList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-deals/:id - Single deal
        response = await handleSingleDeal(client, dealId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-deals - Create deal
      if (!checkPermission(permissions, 'deals:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateDeal(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-deals/:id - Update deal
      if (!dealId) {
        return createErrorResponse('Deal ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'deals:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateDeal(client, dealId, body, user_id, permissions)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-deals/:id - Delete deal
      if (!dealId) {
        return createErrorResponse('Deal ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'deals:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteDeal(client, dealId, user_id, permissions)
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
        function: 'api-v1-deals',
        integration: 'supabase',
      },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List deals
async function handleDealsList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('deals')
      .select(`
        id,
        name,
        company,
        contact_name,
        contact_email,
        contact_phone,
        value,
        one_off_revenue,
        monthly_mrr,
        annual_value,
        description,
        stage_id,
        owner_id,
        expected_close_date,
        probability,
        status,
        priority,
        deal_size,
        lead_source_type,
        lead_source_channel,
        next_steps,
        created_at,
        updated_at,
        stage_changed_at,
        deal_stages:stage_id(
          id,
          name,
          color,
          order_position
        ),
        owner_id
      `, { count: 'exact' })

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`name.ilike."%${search}%",company.ilike."%${search}%",contact_name.ilike."%${search}%"`)
    }
    
    if (params.stage_id && isValidUUID(params.stage_id)) {
      query = query.eq('stage_id', params.stage_id)
    }
    
    if (params.owner_id && isValidUUID(params.owner_id)) {
      query = query.eq('owner_id', params.owner_id)
    }
    
    if (params.status) {
      query = query.eq('status', params.status)
    }
    
    if (params.priority) {
      query = query.eq('priority', params.priority)
    }

    if (params.min_value) {
      const minValue = parseFloat(params.min_value)
      if (!isNaN(minValue)) {
        query = query.gte('value', minValue)
      }
    }

    if (params.max_value) {
      const maxValue = parseFloat(params.max_value)
      if (!isNaN(maxValue)) {
        query = query.lte('value', maxValue)
      }
    }

    // Apply standard filters (pagination, sorting)
    query = applyStandardFilters(query, params)

    const { data: deals, error, count } = await query

    if (error) {
      throw error
    }

    // Process deals to add computed fields
    const processedDeals = deals?.map((deal: any) => ({
      ...deal,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      stage_order: deal.deal_stages?.order_position || null,
      owner_name: null,
      owner_email: null,
      days_in_stage: deal.stage_changed_at 
        ? Math.floor((new Date().getTime() - new Date(deal.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      is_overdue: deal.expected_close_date && new Date(deal.expected_close_date) < new Date(),
      ltv: calculateLTV(deal.one_off_revenue, deal.monthly_mrr)
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedDeals, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch deals')
  }
}

// Get single deal
async function handleSingleDeal(client: any, dealId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(dealId)) {
      return createErrorResponse('Invalid deal ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('deals')
      .select(`
        *,
        deal_stages:stage_id(
          id,
          name,
          color,
          order_position,
          description
        ),
        owner_id,
        deal_splits:deal_splits!deal_id(
          id,
          user_id,
          percentage,
          amount,
          notes,
          profiles:user_id(
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq('id', dealId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    const { data: deal, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Deal not found', 404, 'DEAL_NOT_FOUND')
      }
      throw error
    }

    // Process deal to add computed fields
    const processedDeal = {
      ...deal,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      stage_order: deal.deal_stages?.order_position || null,
      stage_description: deal.deal_stages?.description || null,
      owner_name: null,
      owner_email: null,
      owner_avatar: deal.profiles?.avatar_url || null,
      days_in_stage: deal.stage_changed_at 
        ? Math.floor((new Date().getTime() - new Date(deal.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      is_overdue: deal.expected_close_date && new Date(deal.expected_close_date) < new Date(),
      ltv: calculateLTV(deal.one_off_revenue, deal.monthly_mrr),
      has_splits: deal.deal_splits && deal.deal_splits.length > 0,
      split_count: deal.deal_splits?.length || 0
    }

    return createSuccessResponse(processedDeal)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch deal')
  }
}

// Create deal
async function handleCreateDeal(client: any, body: any, userId: string) {
  try {
    // Validate required fields (stage_id is optional - will use default)
    const requiredFields = ['name', 'value']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate numeric fields
    if (typeof body.value !== 'number' || body.value < 0) {
      return createErrorResponse('Value must be a positive number', 400, 'INVALID_VALUE')
    }

    if (body.one_off_revenue !== undefined && (typeof body.one_off_revenue !== 'number' || body.one_off_revenue < 0)) {
      return createErrorResponse('One-off revenue must be a positive number', 400, 'INVALID_ONE_OFF_REVENUE')
    }

    if (body.monthly_mrr !== undefined && (typeof body.monthly_mrr !== 'number' || body.monthly_mrr < 0)) {
      return createErrorResponse('Monthly MRR must be a positive number', 400, 'INVALID_MONTHLY_MRR')
    }

    // Handle stage_id - use provided or default to first available stage
    let stageId = body.stage_id
    if (!stageId) {
      // Get the first available stage (by order_position) as default
      const { data: defaultStage, error: stageError } = await client
        .from('deal_stages')
        .select('id, name')
        .order('order_position', { ascending: true })
        .limit(1)
        .single()
      
      if (stageError || !defaultStage) {
        return createErrorResponse('No deal stages found. Please create deal stages first.', 400, 'MISSING_STAGES')
      }
      stageId = defaultStage.id
    } else {
      // Validate provided stage_id exists
      const { data: stage, error: stageError } = await client
        .from('deal_stages')
        .select('id')
        .eq('id', stageId)
        .single()

      if (stageError || !stage) {
        return createErrorResponse('Invalid stage ID', 400, 'INVALID_STAGE_ID')
      }
    }

    // Calculate annual value if not provided
    const annualValue = body.annual_value || calculateAnnualValue(body.one_off_revenue, body.monthly_mrr)

    const dealData = {
      ...body,
      stage_id: stageId, // Use the calculated stage_id
      owner_id: userId,
      annual_value: annualValue,
      stage_changed_at: new Date().toISOString()
    }

    const { data: deal, error } = await client
      .from('deals')
      .insert(dealData)
      .select(`
        *,
        deal_stages:stage_id(
          id,
          name,
          color,
          order_position
        )
      `)
      .single()

    if (error) {
      throw error
    }

    // Process deal to add computed fields
    const processedDeal = {
      ...deal,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      ltv: calculateLTV(deal.one_off_revenue, deal.monthly_mrr)
    }

    return createSuccessResponse(processedDeal, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create deal')
  }
}

// Update deal
async function handleUpdateDeal(client: any, dealId: string, body: any, userId: string, permissions: any) {
  try {
    if (!isValidUUID(dealId)) {
      return createErrorResponse('Invalid deal ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate numeric fields if provided
    if (body.value !== undefined && (typeof body.value !== 'number' || body.value < 0)) {
      return createErrorResponse('Value must be a positive number', 400, 'INVALID_VALUE')
    }

    if (body.one_off_revenue !== undefined && (typeof body.one_off_revenue !== 'number' || body.one_off_revenue < 0)) {
      return createErrorResponse('One-off revenue must be a positive number', 400, 'INVALID_ONE_OFF_REVENUE')
    }

    if (body.monthly_mrr !== undefined && (typeof body.monthly_mrr !== 'number' || body.monthly_mrr < 0)) {
      return createErrorResponse('Monthly MRR must be a positive number', 400, 'INVALID_MONTHLY_MRR')
    }

    // Check if user can edit this deal
    const { data: existingDeal, error: fetchError } = await client
      .from('deals')
      .select('owner_id, one_off_revenue, monthly_mrr')
      .eq('id', dealId)
      .single()

    if (fetchError || !existingDeal) {
      return createErrorResponse('Deal not found', 404, 'DEAL_NOT_FOUND')
    }

    // Non-admins can only edit their own deals, and not deals with splits (financial data)
    if (!checkPermission(permissions, 'admin') && existingDeal.owner_id !== userId) {
      return createErrorResponse('Not authorized to edit this deal', 403, 'NOT_AUTHORIZED')
    }

    // Check if deal has splits and user is trying to modify financial data
    const hasSplits = existingDeal.one_off_revenue || existingDeal.monthly_mrr
    if (hasSplits && !checkPermission(permissions, 'admin')) {
      const isModifyingFinancials = ['value', 'one_off_revenue', 'monthly_mrr', 'annual_value'].some(field => body[field] !== undefined)
      if (isModifyingFinancials) {
        return createErrorResponse('Cannot modify financial data on deals with revenue splits', 403, 'SPLIT_DEAL_PROTECTED')
      }
    }

    // Validate stage_id if provided
    if (body.stage_id) {
      const { data: stage, error: stageError } = await client
        .from('deal_stages')
        .select('id')
        .eq('id', body.stage_id)
        .single()

      if (stageError || !stage) {
        return createErrorResponse('Invalid stage ID', 400, 'INVALID_STAGE_ID')
      }
    }

    // Check if stage is being updated to set stage_changed_at
    const updateData = { ...body }
    if (body.stage_id) {
      const { data: currentDeal } = await client
        .from('deals')
        .select('stage_id')
        .eq('id', dealId)
        .single()

      if (currentDeal && currentDeal.stage_id !== body.stage_id) {
        updateData.stage_changed_at = new Date().toISOString()
      }
    }

    // Calculate annual value if financials are being updated
    if (body.one_off_revenue !== undefined || body.monthly_mrr !== undefined) {
      const oneOff = body.one_off_revenue !== undefined ? body.one_off_revenue : existingDeal.one_off_revenue
      const mrr = body.monthly_mrr !== undefined ? body.monthly_mrr : existingDeal.monthly_mrr
      updateData.annual_value = calculateAnnualValue(oneOff, mrr)
    }

    updateData.updated_at = new Date().toISOString()

    const { data: deal, error } = await client
      .from('deals')
      .update(updateData)
      .eq('id', dealId)
      .select(`
        *,
        deal_stages:stage_id(
          id,
          name,
          color,
          order_position
        )
      `)
      .single()

    if (error) {
      throw error
    }

    // Process deal to add computed fields
    const processedDeal = {
      ...deal,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      ltv: calculateLTV(deal.one_off_revenue, deal.monthly_mrr)
    }

    return createSuccessResponse(processedDeal)

  } catch (error) {
    throw new Error(error.message || 'Failed to update deal')
  }
}

// Delete deal
async function handleDeleteDeal(client: any, dealId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(dealId)) {
      return createErrorResponse('Invalid deal ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Check if deal exists and get ownership info
    const { data: existingDeal, error: fetchError } = await client
      .from('deals')
      .select('owner_id, one_off_revenue, monthly_mrr')
      .eq('id', dealId)
      .single()

    if (fetchError || !existingDeal) {
      return createErrorResponse('Deal not found', 404, 'DEAL_NOT_FOUND')
    }

    // Non-admins can only delete their own deals, and not deals with splits
    if (!checkPermission(permissions, 'admin')) {
      if (existingDeal.owner_id !== userId) {
        return createErrorResponse('Not authorized to delete this deal', 403, 'NOT_AUTHORIZED')
      }

      const hasSplits = existingDeal.one_off_revenue || existingDeal.monthly_mrr
      if (hasSplits) {
        return createErrorResponse('Cannot delete deals with revenue splits', 403, 'SPLIT_DEAL_PROTECTED')
      }
    }

    // Use a transaction to ensure data consistency
    const { data: deletedDeal, error: deleteError } = await client
      .from('deals')
      .delete()
      .eq('id', dealId)
      .select('id')
      .single()

    if (deleteError) {
      // Check if it's a foreign key constraint error
      if (deleteError.code === '23503') {
        // Try to provide more specific error message for foreign key constraints
        return createErrorResponse(
          'Cannot delete deal due to related records. Please remove associated activities, splits, or contacts first.',
          409,
          'FOREIGN_KEY_CONSTRAINT'
        )
      }
      
      throw deleteError
    }

    if (!deletedDeal) {
      return createErrorResponse('Deal not found or could not be deleted', 404, 'DEAL_NOT_FOUND')
    }
    return createSuccessResponse({ id: dealId, deleted: true })

  } catch (error) {
    // Return more specific error messages based on error type
    if (error.code === '23503') {
      return createErrorResponse(
        'Cannot delete deal due to foreign key constraints',
        409,
        'FOREIGN_KEY_CONSTRAINT'
      )
    }
    
    if (error.code === 'PGRST116') {
      return createErrorResponse('Deal not found', 404, 'DEAL_NOT_FOUND')
    }
    
    throw new Error(error.message || 'Failed to delete deal')
  }
}

// Helper functions
function calculateLTV(oneOffRevenue: number | null, monthlyMrr: number | null): number {
  const oneOff = oneOffRevenue || 0
  const mrr = monthlyMrr || 0
  return (mrr * 3) + oneOff
}

function calculateAnnualValue(oneOffRevenue: number | null, monthlyMrr: number | null): number {
  const oneOff = oneOffRevenue || 0
  const mrr = monthlyMrr || 0
  return (mrr * 12) + oneOff
}