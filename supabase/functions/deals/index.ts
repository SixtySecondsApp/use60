import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { rateLimitMiddleware, RATE_LIMIT_CONFIGS } from '../_shared/rateLimiter.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Apply rate limiting based on audit recommendations
    const rateLimitResponse = await rateLimitMiddleware(
      supabaseClient,
      req,
      'deals',
      RATE_LIMIT_CONFIGS.standard
    );
    
    if (rateLimitResponse) {
      return rateLimitResponse; // Rate limit exceeded
    }

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== 'deals')
    const dealId = pathSegments[0]
    
    if (req.method === 'GET') {
      if (!dealId) {
        // GET /deals - List deals
        return await handleDealsList(supabaseClient, url)
      } else {
        // GET /deals/:id - Single deal
        return await handleSingleDeal(supabaseClient, dealId, url)
      }
    } else if (req.method === 'POST') {
      // POST /deals - Create deal
      const body = await req.json()
      return await handleCreateDeal(supabaseClient, body)
    } else if (req.method === 'PUT') {
      // PUT /deals/:id - Update deal
      if (!dealId) {
        return new Response(JSON.stringify({ error: 'Deal ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const body = await req.json()
      return await handleUpdateDeal(supabaseClient, dealId, body)
    } else if (req.method === 'DELETE') {
      // DELETE /deals/:id - Delete deal
      if (!dealId) {
        return new Response(JSON.stringify({ error: 'Deal ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return await handleDeleteDeal(supabaseClient, dealId)
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// List deals
async function handleDealsList(supabaseClient: any, url: URL) {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const search = url.searchParams.get('search') || ''
    const stageId = url.searchParams.get('stage_id') || ''
    const ownerId = url.searchParams.get('owner_id') || ''
    const companyId = url.searchParams.get('company_id') || ''

    let query = supabaseClient
      .from('deals')
      .select(`
        id,
        name,
        value,
        stage_id,
        owner_id,
        company,
        contact_name,
        contact_email,
        probability,
        expected_close_date,
        notes,
        created_at,
        updated_at,
        stage_changed_at,
        deal_stages:deal_stages(
          id,
          name,
          color,
          order_position
        )
      `)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    // Apply filters
    if (search) {
      // Validate and sanitize search term
      const sanitized = search.trim();
      if (!/^[a-zA-Z0-9\s\-_@.'"\(\)&\[\]]+$/.test(sanitized) || sanitized.length > 500) {
        return new Response(
          JSON.stringify({ error: 'Invalid search term' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      query = query.or(`name.ilike."%${sanitized}%"`)
    }
    if (stageId) {
      query = query.eq('stage_id', stageId)
    }
    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }
    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    const { data: deals, error, count } = await query

    if (error) {
      throw error
    }

    // Process deals to add computed fields
    const processedDeals = deals?.map((deal: any) => ({
      ...deal,
      company_name: deal.company || null,
      contact_full_name: deal.contact_name || null,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      daysInStage: deal.stage_changed_at 
        ? Math.floor((new Date().getTime() - new Date(deal.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
        : null
    })) || []

    return new Response(JSON.stringify({
      data: processedDeals,
      count: count || 0,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: [],
      error: error.message,
      count: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Get single deal
async function handleSingleDeal(supabaseClient: any, dealId: string, url: URL) {
  try {
    const includeRelationships = url.searchParams.get('includeRelationships') === 'true'

    const { data: deal, error } = await supabaseClient
      .from('deals')
      .select(`
        *,
        ${includeRelationships ? `
        deal_stages:deal_stages(
          id,
          name,
          color,
          order_position
        )
        ` : ''}
      `)
      .eq('id', dealId)
      .single()

    if (error) {
      throw error
    }

    if (!deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Process deal to add computed fields
    const processedDeal = {
      ...deal,
      company_name: deal.company || null,
      contact_full_name: deal.contact_name || null,
      stage_name: deal.deal_stages?.name || null,
      stage_color: deal.deal_stages?.color || null,
      daysInStage: deal.stage_changed_at 
        ? Math.floor((new Date().getTime() - new Date(deal.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24))
        : null
    }

    return new Response(JSON.stringify({
      data: processedDeal,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Create deal
async function handleCreateDeal(supabaseClient: any, body: any) {
  try {
    const { data: deal, error } = await supabaseClient
      .from('deals')
      .insert({
        ...body,
        stage_changed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: deal,
      error: null
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Update deal
async function handleUpdateDeal(supabaseClient: any, dealId: string, body: any) {
  try {
    // Check if stage is being updated to set stage_changed_at
    const updateData = { ...body }
    if (body.stage_id) {
      // Get current deal to check if stage is actually changing
      const { data: currentDeal } = await supabaseClient
        .from('deals')
        .select('stage_id')
        .eq('id', dealId)
        .single()

      if (currentDeal && currentDeal.stage_id !== body.stage_id) {
        updateData.stage_changed_at = new Date().toISOString()
      }
    }

    const { data: deal, error } = await supabaseClient
      .from('deals')
      .update(updateData)
      .eq('id', dealId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: deal,
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Delete deal
async function handleDeleteDeal(supabaseClient: any, dealId: string) {
  try {
    const { error } = await supabaseClient
      .from('deals')
      .delete()
      .eq('id', dealId)

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: { id: dealId },
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: null,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
} 