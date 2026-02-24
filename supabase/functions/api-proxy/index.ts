import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

interface ApiKeyData {
  id: string
  user_id: string
  name: string
  permissions: string[]
  rate_limit: number
  usage_count: number
  last_used: string | null
  expires_at: string | null
  is_active: boolean
}

const AVAILABLE_ENDPOINTS = {
  'GET /api/v1/deals': 'deals:read',
  'POST /api/v1/deals': 'deals:write',
  'PUT /api/v1/deals': 'deals:write',
  'DELETE /api/v1/deals': 'deals:write',
  'GET /api/v1/activities': 'activities:read',
  'POST /api/v1/activities': 'activities:write',
  'GET /api/v1/contacts': 'contacts:read',
  'POST /api/v1/contacts': 'contacts:write',
  'GET /api/v1/companies': 'contacts:read',
  'POST /api/v1/companies': 'contacts:write',
  'GET /api/v1/analytics': 'analytics:read'
}

async function validateApiKey(apiKey: string): Promise<ApiKeyData | null> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Hash the provided API key
  const hashedKey = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(apiKey)
  )
  const hashedKeyHex = Array.from(new Uint8Array(hashedKey))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Look up the key in the database
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', hashedKeyHex)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return null
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null
  }

  return data
}

async function checkRateLimit(keyData: ApiKeyData): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Check rate limit (simplified - in production, use Redis or similar)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  
  const { count, error } = await supabase
    .from('api_requests')
    .select('id', { count: 'exact' })
    .eq('api_key_id', keyData.id)
    .gte('created_at', oneHourAgo)

  if (error) {
    return false
  }

  return (count || 0) < keyData.rate_limit
}

async function logRequest(keyData: ApiKeyData, method: string, endpoint: string, statusCode: number, responseBody?: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Log the request
  await supabase
    .from('api_requests')
    .insert({
      api_key_id: keyData.id,
      user_id: keyData.user_id,
      method,
      endpoint,
      status_code: statusCode,
      response_body: responseBody,
      created_at: new Date().toISOString()
    })

  // Update usage count and last used
  await supabase
    .from('api_keys')
    .update({
      usage_count: keyData.usage_count + 1,
      last_used: new Date().toISOString()
    })
    .eq('id', keyData.id)
}

serve(async (req) => {
  // Handle CORS
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Extract API key from Authorization header
    const authorization = req.headers.get('Authorization')
    if (!authorization || !authorization.startsWith('Bearer sk_')) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = authorization.replace('Bearer ', '')

    // Validate API key
    const keyData = await validateApiKey(apiKey)
    if (!keyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the requested endpoint
    const url = new URL(req.url)
    const endpoint = url.pathname
    const methodEndpoint = `${req.method} ${endpoint}`

    // Check permissions
    const requiredPermission = AVAILABLE_ENDPOINTS[methodEndpoint as keyof typeof AVAILABLE_ENDPOINTS]
    if (!requiredPermission) {
      return new Response(
        JSON.stringify({ error: 'Endpoint not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!keyData.permissions.includes(requiredPermission)) {
      await logRequest(keyData, req.method, endpoint, 403)
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limit
    const rateLimitOk = await checkRateLimit(keyData)
    if (!rateLimitOk) {
      await logRequest(keyData, req.method, endpoint, 429)
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user context
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let responseData: any
    let statusCode = 200

    try {
      // Route the request to the appropriate handler
      switch (methodEndpoint) {
        case 'GET /api/v1/deals':
          const { data: deals, error: dealsError } = await supabase
            .from('deals')
            .select('*')
            .eq('user_id', keyData.user_id)
          
          if (dealsError) throw dealsError
          responseData = { deals }
          break

        case 'POST /api/v1/deals':
          const dealBody = await req.json()
          const { data: newDeal, error: newDealError } = await supabase
            .from('deals')
            .insert({ ...dealBody, user_id: keyData.user_id })
            .select()
            .single()
          
          if (newDealError) throw newDealError
          responseData = { deal: newDeal }
          statusCode = 201
          break

        case 'GET /api/v1/activities':
          const { data: activities, error: activitiesError } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', keyData.user_id)
          
          if (activitiesError) throw activitiesError
          responseData = { activities }
          break

        case 'POST /api/v1/activities':
          const activityBody = await req.json()
          const { data: newActivity, error: newActivityError } = await supabase
            .from('activities')
            .insert({ ...activityBody, user_id: keyData.user_id })
            .select()
            .single()
          
          if (newActivityError) throw newActivityError
          responseData = { activity: newActivity }
          statusCode = 201
          break

        case 'GET /api/v1/contacts':
          const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', keyData.user_id)
          
          if (contactsError) throw contactsError
          responseData = { contacts }
          break

        case 'GET /api/v1/companies':
          const { data: companies, error: companiesError } = await supabase
            .from('companies')
            .select('*')
            .eq('user_id', keyData.user_id)
          
          if (companiesError) throw companiesError
          responseData = { companies }
          break

        default:
          statusCode = 404
          responseData = { error: 'Endpoint not implemented' }
      }

    } catch (dbError: any) {
      statusCode = 500
      responseData = { error: 'Internal server error' }
    }

    const responseBodyString = JSON.stringify(responseData)

    // Log the request
    await logRequest(keyData, req.method, endpoint, statusCode, responseBodyString)

    return new Response(
      responseBodyString,
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})