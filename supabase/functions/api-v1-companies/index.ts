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
    const companyId = extractIdFromPath(url, 'api-v1-companies')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!companyId) {
        // GET /api-v1-companies - List companies
        response = await handleCompaniesList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-companies/:id - Single company
        response = await handleSingleCompany(client, companyId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-companies - Create company
      if (!checkPermission(permissions, 'companies:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateCompany(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-companies/:id - Update company
      if (!companyId) {
        return createErrorResponse('Company ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'companies:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateCompany(client, companyId, body, user_id)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-companies/:id - Delete company
      if (!companyId) {
        return createErrorResponse('Company ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'companies:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteCompany(client, companyId, user_id)
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
        function: 'api-v1-companies',
        integration: 'supabase',
      },
    });
    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List companies
async function handleCompaniesList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('companies')
      .select(`
        id,
        name,
        website,
        industry,
        size,
        description,
        linkedin_url,
        owner_id,
        created_at,
        updated_at,
        contacts:contacts!company_id(count),
        deals:deals!company_id(count)
      `, { count: 'exact' })

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`name.ilike."%${search}%",website.ilike."%${search}%",industry.ilike."%${search}%"`)
    }
    
    if (params.industry) {
      query = query.eq('industry', params.industry)
    }
    
    if (params.size) {
      query = query.eq('size', params.size)
    }

    // Apply standard filters (pagination, sorting)
    query = applyStandardFilters(query, params)

    const { data: companies, error, count } = await query

    if (error) {
      throw error
    }

    // Process companies to add computed fields
    const processedCompanies = companies?.map((company: any) => ({
      ...company,
      contact_count: company.contacts?.[0]?.count || 0,
      deal_count: company.deals?.[0]?.count || 0
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedCompanies, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch companies')
  }
}

// Get single company
async function handleSingleCompany(client: any, companyId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(companyId)) {
      return createErrorResponse('Invalid company ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('companies')
      .select(`
        *,
        contacts:contacts!company_id(
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          title,
          is_primary
        ),
        deals:deals!company_id(count)
      `)
      .eq('id', companyId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    const { data: company, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Company not found', 404, 'COMPANY_NOT_FOUND')
      }
      throw error
    }

    // Process company to add computed fields
    const processedCompany = {
      ...company,
      contact_count: company.contacts?.length || 0,
      deal_count: company.deals?.[0]?.count || 0,
      primary_contact: company.contacts?.find((c: any) => c.is_primary) || null,
      total_deal_value: 0
    }

    return createSuccessResponse(processedCompany)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch company')
  }
}

// Create company
async function handleCreateCompany(client: any, body: any, userId: string) {
  try {
    // Validate required fields
    const requiredFields = ['name']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate website format if provided
    if (body.website) {
      try {
        new URL(body.website)
      } catch {
        // If URL constructor fails, check if it's a domain without protocol
        if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(body.website)) {
          return createErrorResponse('Invalid website format', 400, 'INVALID_WEBSITE')
        }
        // Add protocol if missing
        body.website = `https://${body.website}`
      }
    }

    // Check for duplicate company name
    const { data: existingCompany } = await client
      .from('companies')
      .select('id')
      .eq('name', body.name)
      .eq('owner_id', userId)
      .single()

    if (existingCompany) {
      return createErrorResponse('Company with this name already exists', 409, 'DUPLICATE_NAME')
    }

    const companyData = {
      ...body,
      owner_id: userId
    }

    const { data: company, error } = await client
      .from('companies')
      .insert(companyData)
      .select()
      .single()

    if (error) {
      throw error
    }

    return createSuccessResponse(company, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create company')
  }
}

// Update company
async function handleUpdateCompany(client: any, companyId: string, body: any, userId: string) {
  try {
    if (!isValidUUID(companyId)) {
      return createErrorResponse('Invalid company ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate website format if provided
    if (body.website) {
      try {
        new URL(body.website)
      } catch {
        // If URL constructor fails, check if it's a domain without protocol
        if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(body.website)) {
          return createErrorResponse('Invalid website format', 400, 'INVALID_WEBSITE')
        }
        // Add protocol if missing
        body.website = `https://${body.website}`
      }
    }

    // Check for duplicate company name (excluding current company)
    if (body.name) {
      const { data: existingCompany } = await client
        .from('companies')
        .select('id')
        .eq('name', body.name)
        .eq('owner_id', userId)
        .neq('id', companyId)
        .single()

      if (existingCompany) {
        return createErrorResponse('Company with this name already exists', 409, 'DUPLICATE_NAME')
      }
    }

    const updateData = {
      ...body,
      updated_at: new Date().toISOString()
    }

    let query = client
      .from('companies')
      .update(updateData)
      .eq('id', companyId)
      .eq('owner_id', userId) // Ensure user can only update their own companies
      .select()

    const { data: company, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Company not found or not accessible', 404, 'COMPANY_NOT_FOUND')
      }
      throw error
    }

    return createSuccessResponse(company)

  } catch (error) {
    throw new Error(error.message || 'Failed to update company')
  }
}

// Delete company
async function handleDeleteCompany(client: any, companyId: string, userId: string) {
  try {
    if (!isValidUUID(companyId)) {
      return createErrorResponse('Invalid company ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Check if company has associated contacts or deals
    const { data: associations } = await client
      .from('companies')
      .select(`
        contacts:contacts!company_id(count),
        deals:deals!company_id(count)
      `)
      .eq('id', companyId)
      .eq('owner_id', userId)
      .single()

    if (associations) {
      const contactCount = associations.contacts?.[0]?.count || 0
      const dealCount = associations.deals?.[0]?.count || 0
      
      if (contactCount > 0 || dealCount > 0) {
        return createErrorResponse(
          `Cannot delete company with ${contactCount} contacts and ${dealCount} deals. Remove associations first.`,
          409,
          'HAS_ASSOCIATIONS',
          { contacts: contactCount, deals: dealCount }
        )
      }
    }

    const { error } = await client
      .from('companies')
      .delete()
      .eq('id', companyId)
      .eq('owner_id', userId) // Ensure user can only delete their own companies

    if (error) {
      throw error
    }

    return createSuccessResponse({ id: companyId, deleted: true })

  } catch (error) {
    throw new Error(error.message || 'Failed to delete company')
  }
}