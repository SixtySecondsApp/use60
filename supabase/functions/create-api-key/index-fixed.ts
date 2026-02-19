import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body = await req.json()
    const { name, permissions = [], rate_limit = 1000, expires_in_days } = body

    // Validate input
    if (!name || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'API key name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with the user's token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Use service role for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get the user from the JWT token using Supabase's built-in auth
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate API key
    const apiKey = `sk_${crypto.randomUUID().replace(/-/g, '')}`
    const keyPreview = `sk_...${apiKey.slice(-8)}`
    
    // Hash the API key for storage
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Calculate expiration
    let expiresAt = null
    if (expires_in_days && expires_in_days > 0) {
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + expires_in_days)
      expiresAt = expirationDate.toISOString()
    }

    // Insert the API key into the database
    const { data: apiKeyData, error: insertError } = await supabaseAdmin
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_hash: keyHash,
        key_preview: keyPreview,
        permissions: permissions,
        rate_limit: rate_limit,
        expires_at: expiresAt,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      // Check if it's a missing column error
      if (insertError.message?.includes('column') && insertError.message?.includes('does not exist')) {
        return new Response(
          JSON.stringify({ 
            error: 'Database schema issue',
            details: 'The api_keys table is missing required columns. Please run the database migration script.',
            hint: 'Run manual-production-fix-v3.sql in Supabase SQL Editor'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create API key',
          details: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return the API key (only time it's shown in full)
    return new Response(
      JSON.stringify({
        id: apiKeyData.id,
        api_key: apiKey, // Only returned once!
        key_preview: keyPreview,
        name: apiKeyData.name,
        permissions: apiKeyData.permissions,
        rate_limit: apiKeyData.rate_limit,
        expires_at: apiKeyData.expires_at,
        created_at: apiKeyData.created_at,
        message: 'Store this API key securely. It will not be shown again.'
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})