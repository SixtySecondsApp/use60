import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { corsHeaders } from './corsHelper.ts'

export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  count?: number;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface QueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  [key: string]: any;
}

export interface ApiKeyValidation {
  is_valid: boolean;
  user_id: string;
  permissions: string[];
  rate_limit: number;
  is_expired: boolean;
  is_active: boolean;
}

// Standard response wrapper
export function createApiResponse<T>(
  data: T | null, 
  error: string | null = null, 
  count?: number,
  pagination?: any
): ApiResponse<T> {
  return {
    data,
    error,
    ...(count !== undefined && { count }),
    ...(pagination && { pagination })
  }
}

// Standard error response
export function createErrorResponse(
  message: string, 
  status: number = 500, 
  code?: string, 
  details?: any
): Response {
  return new Response(JSON.stringify({
    data: null,
    error: message,
    code,
    details
  }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Standard success response
export function createSuccessResponse<T>(
  data: T, 
  status: number = 200, 
  count?: number,
  pagination?: any
): Response {
  return new Response(JSON.stringify(createApiResponse(data, null, count, pagination)), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Parse and validate query parameters
export function parseQueryParams(url: URL): QueryParams {
  const params: QueryParams = {}
  
  // Standard pagination
  params.limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 1000)
  params.offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0)
  
  // Search and sorting
  params.search = url.searchParams.get('search') || undefined
  params.sort = url.searchParams.get('sort') || undefined
  params.order = (url.searchParams.get('order') === 'desc') ? 'desc' : 'asc'
  
  // Add all other parameters
  url.searchParams.forEach((value, key) => {
    if (!['limit', 'offset', 'search', 'sort', 'order'].includes(key)) {
      params[key] = value
    }
  })
  
  return params
}

// Sanitize search input
export function sanitizeSearchTerm(search: string | undefined): string | null {
  if (!search) return null
  
  const sanitized = search.trim()
  
  // Validate search term (alphanumeric, spaces, common punctuation)
  if (!/^[a-zA-Z0-9\s\-_@.'"\(\)&\[\]]+$/.test(sanitized) || sanitized.length > 500) {
    throw new Error('Invalid search term')
  }
  
  return sanitized
}

// Apply standard filters to a query
export function applyStandardFilters(query: any, params: QueryParams) {
  // Pagination
  query = query.range(params.offset, params.offset + params.limit - 1)
  
  // Search
  if (params.search) {
    const sanitized = sanitizeSearchTerm(params.search)
    if (sanitized) {
      // This should be customized per entity
      query = query.or(`name.ilike."%${sanitized}%"`)
    }
  }
  
  // Sorting
  if (params.sort) {
    query = query.order(params.sort, { ascending: params.order === 'asc' })
  } else {
    // Default sort by created_at desc
    query = query.order('created_at', { ascending: false })
  }
  
  return query
}

// Validate API key and return authenticated client
export async function authenticateRequest(req: Request): Promise<{
  client: any;
  user_id: string;
  permissions: any;
}> {
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) {
    throw new Error('API key required in X-API-Key header')
  }

  // Create service role client
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Validate the API key
  const { data, error } = await serviceClient
    .rpc('validate_api_key', { key_text: apiKey })

  if (error) {
    throw new Error('API key validation failed')
  }

  if (!data || data.length === 0) {
    throw new Error('Invalid API key')
  }

  const validation = data[0]
  if (!validation.is_valid) {
    if (validation.is_expired) {
      throw new Error('API key has expired')
    }
    throw new Error('Invalid API key')
  }

  // Convert JSONB permissions to string array for checkPermission function
  const permissionsArray = Array.isArray(validation.permissions) 
    ? validation.permissions as string[]
    : []

  return {
    client: serviceClient,
    user_id: validation.user_id,
    permissions: permissionsArray
  }
}

// Check if user has required permission
export function checkPermission(permissions: string[], required: string): boolean {
  if (!permissions || !Array.isArray(permissions)) return false
  return permissions.includes(required)
}

// Log API usage using the database function
export async function logApiUsage(
  client: any,
  apiKey: string,
  endpoint: string,
  method: string,
  statusCode: number,
  userId: string,
  req: Request
): Promise<void> {
  try {
    // Hash API key to get key info
    const { data: hashData } = await client
      .rpc('hash_api_key', { key_text: apiKey })

    if (!hashData) return

    const { data: keyData } = await client
      .from('api_keys')
      .select('id, user_id')
      .eq('key_hash', hashData)
      .single()

    if (!keyData) return

    // Get request metadata
    const userAgent = req.headers.get('user-agent') || 'Unknown'
    const contentType = req.headers.get('content-type') || 'unknown'
    const forwarded = req.headers.get('x-forwarded-for')
    const realIp = req.headers.get('x-real-ip')
    const ipAddress = forwarded?.split(',')[0] || realIp || null

    // Prepare headers for logging (sanitized)
    const requestHeaders = {
      'user-agent': userAgent,
      'content-type': contentType,
      'ip-address': ipAddress
    }

    // Use the database function to log the request
    await client.rpc('log_api_request', {
      p_api_key_id: keyData.id,
      p_user_id: userId,
      p_method: method,
      p_endpoint: endpoint,
      p_headers: requestHeaders,
      p_body: null, // Don't log body for privacy
      p_status_code: statusCode,
      p_response_body: null // Don't log response for privacy
    })

  } catch (error) {
    // Don't fail the request if logging fails
  }
}

// Rate limit check
export async function checkRateLimit(client: any, apiKey: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  resetTime: number;
}> {
  try {
    const { data: hashData } = await client
      .rpc('hash_api_key', { key_text: apiKey })

    if (!hashData) {
      return { allowed: false, current: 0, limit: 0, resetTime: Date.now() + 3600000 }
    }

    const { data, error } = await client
      .rpc('check_rate_limit', { key_hash_val: hashData })

    if (error || !data || data.length === 0) {
      return { allowed: false, current: 0, limit: 0, resetTime: Date.now() + 3600000 }
    }

    const result = data[0]
    return {
      allowed: result.allowed,
      current: result.current_usage,
      limit: result.limit_value,
      resetTime: Date.now() + 3600000 // Next hour
    }
  } catch (error) {
    return { allowed: false, current: 0, limit: 0, resetTime: Date.now() + 3600000 }
  }
}

// Middleware to handle rate limiting
export async function handleRateLimit(req: Request, client: any): Promise<Response | null> {
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) return null

  const rateLimit = await checkRateLimit(client, apiKey)
  
  if (!rateLimit.allowed) {
    return createErrorResponse(
      'Rate limit exceeded',
      429,
      'RATE_LIMIT_EXCEEDED',
      {
        current_usage: rateLimit.current,
        limit: rateLimit.limit,
        reset_time: new Date(rateLimit.resetTime).toISOString()
      }
    )
  }

  return null
}

// Extract ID from URL path
export function extractIdFromPath(url: URL, functionName: string): string | null {
  const pathSegments = url.pathname
    .split('/')
    .filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== functionName)
  
  return pathSegments[0] || null
}

// Validate UUID format
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// Standard validation for required fields
export function validateRequiredFields(data: any, requiredFields: string[]): string | null {
  for (const field of requiredFields) {
    if (!data[field] && data[field] !== 0 && data[field] !== false) {
      return `Field '${field}' is required`
    }
  }
  return null
}

// Create pagination metadata
export function createPaginationMeta(
  offset: number,
  limit: number,
  totalCount: number
): any {
  return {
    limit,
    offset,
    total: totalCount,
    hasMore: offset + limit < totalCount,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(totalCount / limit)
  }
}