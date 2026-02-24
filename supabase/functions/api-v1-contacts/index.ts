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
    const contactId = extractIdFromPath(url, 'api-v1-contacts')
    
    let response: Response
    
    if (req.method === 'GET') {
      if (!contactId) {
        // GET /api-v1-contacts - List contacts
        response = await handleContactsList(client, url, user_id, permissions)
      } else {
        // GET /api-v1-contacts/:id - Single contact
        response = await handleSingleContact(client, contactId, user_id, permissions)
      }
    } else if (req.method === 'POST') {
      // POST /api-v1-contacts - Create contact
      if (!checkPermission(permissions, 'contacts:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleCreateContact(client, body, user_id)
    } else if (req.method === 'PUT') {
      // PUT /api-v1-contacts/:id - Update contact
      if (!contactId) {
        return createErrorResponse('Contact ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'contacts:write')) {
        return createErrorResponse('Write permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      const body = await req.json()
      response = await handleUpdateContact(client, contactId, body, user_id)
    } else if (req.method === 'DELETE') {
      // DELETE /api-v1-contacts/:id - Delete contact
      if (!contactId) {
        return createErrorResponse('Contact ID required', 400, 'MISSING_ID')
      }
      if (!checkPermission(permissions, 'contacts:delete')) {
        return createErrorResponse('Delete permission required', 403, 'INSUFFICIENT_PERMISSIONS')
      }
      response = await handleDeleteContact(client, contactId, user_id)
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
        function: 'api-v1-contacts',
        integration: 'supabase',
      },
    });
    // Log failed request
    const apiKey = req.headers.get('X-API-Key')
    if (apiKey) {
      try {
        const { client } = await authenticateRequest(req)
        logApiUsage(
          client,
          apiKey,
          new URL(req.url).pathname,
          req.method,
          statusCode,
          Date.now() - startTime,
          req
        ).catch(console.error)
      } catch {}
    }

    return createErrorResponse(error.message || 'Internal server error', statusCode)
  }
})

// List contacts
async function handleContactsList(client: any, url: URL, userId: string, permissions: any) {
  try {
    const params = parseQueryParams(url)
    
    let query = client
      .from('contacts')
      .select(`
        id,
        first_name,
        last_name,
        full_name,
        email,
        phone,
        title,
        linkedin_url,
        is_primary,
        company_id,
        owner_id,
        created_at,
        updated_at,
        companies:company_id(
          id,
          name,
          website
        )
      `, { count: 'exact' })

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    // Apply filters
    if (params.search) {
      const search = params.search.trim()
      query = query.or(`first_name.ilike."%${search}%",last_name.ilike."%${search}%",email.ilike."%${search}%",full_name.ilike."%${search}%"`)
    }
    
    if (params.company_id && isValidUUID(params.company_id)) {
      query = query.eq('company_id', params.company_id)
    }
    
    if (params.is_primary !== undefined) {
      query = query.eq('is_primary', params.is_primary === 'true')
    }

    // Apply standard filters (pagination, sorting)
    query = applyStandardFilters(query, params)

    const { data: contacts, error, count } = await query

    if (error) {
      throw error
    }

    // Process contacts to add computed fields
    const processedContacts = contacts?.map((contact: any) => ({
      ...contact,
      company_name: contact.companies?.name || null,
      company_website: contact.companies?.website || null
    })) || []

    const pagination = createPaginationMeta(params.offset, params.limit, count || 0)

    return createSuccessResponse(processedContacts, 200, count, pagination)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch contacts')
  }
}

// Get single contact
async function handleSingleContact(client: any, contactId: string, userId: string, permissions: any) {
  try {
    if (!isValidUUID(contactId)) {
      return createErrorResponse('Invalid contact ID format', 400, 'INVALID_ID_FORMAT')
    }

    let query = client
      .from('contacts')
      .select(`
        *,
        companies:company_id(
          id,
          name,
          website,
          industry,
          size
        )
      `)
      .eq('id', contactId)

    // Apply ownership filter if not admin
    if (!checkPermission(permissions, 'admin')) {
      query = query.eq('owner_id', userId)
    }

    const { data: contact, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Contact not found', 404, 'CONTACT_NOT_FOUND')
      }
      throw error
    }

    // Process contact to add computed fields
    const processedContact = {
      ...contact,
      company_name: contact.companies?.name || null,
      company_website: contact.companies?.website || null
    }

    return createSuccessResponse(processedContact)

  } catch (error) {
    throw new Error(error.message || 'Failed to fetch contact')
  }
}

// Create contact
async function handleCreateContact(client: any, body: any, userId: string) {
  try {
    // Validate required fields
    const requiredFields = ['first_name', 'email']
    const validation = validateRequiredFields(body, requiredFields)
    if (validation) {
      return createErrorResponse(validation, 400, 'VALIDATION_ERROR')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return createErrorResponse('Invalid email format', 400, 'INVALID_EMAIL')
    }

    // Check for duplicate email
    const { data: existingContact } = await client
      .from('contacts')
      .select('id')
      .eq('email', body.email)
      .eq('owner_id', userId)
      .single()

    if (existingContact) {
      return createErrorResponse('Contact with this email already exists', 409, 'DUPLICATE_EMAIL')
    }

    // Validate company_id if provided
    if (body.company_id && !isValidUUID(body.company_id)) {
      return createErrorResponse('Invalid company ID format', 400, 'INVALID_COMPANY_ID')
    }

    const contactData = {
      ...body,
      owner_id: userId
    }

    const { data: contact, error } = await client
      .from('contacts')
      .insert(contactData)
      .select(`
        *,
        companies:company_id(
          id,
          name,
          website
        )
      `)
      .single()

    if (error) {
      throw error
    }

    // Process contact to add computed fields
    const processedContact = {
      ...contact,
      company_name: contact.companies?.name || null,
      company_website: contact.companies?.website || null
    }

    return createSuccessResponse(processedContact, 201)

  } catch (error) {
    throw new Error(error.message || 'Failed to create contact')
  }
}

// Update contact
async function handleUpdateContact(client: any, contactId: string, body: any, userId: string) {
  try {
    if (!isValidUUID(contactId)) {
      return createErrorResponse('Invalid contact ID format', 400, 'INVALID_ID_FORMAT')
    }

    // Validate email format if provided
    if (body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return createErrorResponse('Invalid email format', 400, 'INVALID_EMAIL')
      }

      // Check for duplicate email (excluding current contact)
      const { data: existingContact } = await client
        .from('contacts')
        .select('id')
        .eq('email', body.email)
        .eq('owner_id', userId)
        .neq('id', contactId)
        .single()

      if (existingContact) {
        return createErrorResponse('Contact with this email already exists', 409, 'DUPLICATE_EMAIL')
      }
    }

    // Validate company_id if provided
    if (body.company_id && !isValidUUID(body.company_id)) {
      return createErrorResponse('Invalid company ID format', 400, 'INVALID_COMPANY_ID')
    }

    const updateData = {
      ...body,
      updated_at: new Date().toISOString()
    }

    let query = client
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .eq('owner_id', userId) // Ensure user can only update their own contacts
      .select(`
        *,
        companies:company_id(
          id,
          name,
          website
        )
      `)

    const { data: contact, error } = await query.single()

    if (error) {
      if (error.code === 'PGRST116') {
        return createErrorResponse('Contact not found or not accessible', 404, 'CONTACT_NOT_FOUND')
      }
      throw error
    }

    // Process contact to add computed fields
    const processedContact = {
      ...contact,
      company_name: contact.companies?.name || null,
      company_website: contact.companies?.website || null
    }

    return createSuccessResponse(processedContact)

  } catch (error) {
    throw new Error(error.message || 'Failed to update contact')
  }
}

// Delete contact
async function handleDeleteContact(client: any, contactId: string, userId: string) {
  try {
    if (!isValidUUID(contactId)) {
      return createErrorResponse('Invalid contact ID format', 400, 'INVALID_ID_FORMAT')
    }

    const { error } = await client
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('owner_id', userId) // Ensure user can only delete their own contacts

    if (error) {
      throw error
    }

    return createSuccessResponse({ id: contactId, deleted: true })

  } catch (error) {
    throw new Error(error.message || 'Failed to delete contact')
  }
}