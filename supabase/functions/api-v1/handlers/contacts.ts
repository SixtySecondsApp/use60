import {
  parseQueryParams,
  applyStandardFilters,
  createSuccessResponse,
  createErrorResponse,
  isValidUUID,
  validateRequiredFields,
  checkPermission,
  createPaginationMeta
} from '../../_shared/api-utils.ts'

// List contacts
export async function handleContactsList(client: any, url: URL, userId: string, permissions: any) {
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
export async function handleSingleContact(client: any, contactId: string, userId: string, permissions: any) {
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
export async function handleCreateContact(client: any, body: any, userId: string) {
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
export async function handleUpdateContact(client: any, contactId: string, body: any, userId: string) {
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
export async function handleDeleteContact(client: any, contactId: string, userId: string) {
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