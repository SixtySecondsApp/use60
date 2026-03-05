import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { rateLimitMiddleware, RATE_LIMIT_CONFIGS } from '../_shared/rateLimiter.ts'
import { authenticateRequest, getUserOrgId } from '../_shared/edgeAuth.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase client with service role for admin operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Authenticate user via JWT
    const { userId } = await authenticateRequest(
      req,
      supabaseClient,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user's org for scoping queries
    const orgId = await getUserOrgId(supabaseClient, userId);
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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
        return await handleDealsList(supabaseClient, url, orgId)
      } else {
        return await handleSingleDeal(supabaseClient, dealId, url, orgId)
      }
    } else if (req.method === 'POST') {
      const body = await req.json()
      return await handleCreateDeal(supabaseClient, body, orgId)
    } else if (req.method === 'PUT') {
      if (!dealId) {
        return new Response(JSON.stringify({ error: 'Deal ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const body = await req.json()
      return await handleUpdateDeal(supabaseClient, dealId, body, orgId)
    } else if (req.method === 'DELETE') {
      if (!dealId) {
        return new Response(JSON.stringify({ error: 'Deal ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return await handleDeleteDeal(supabaseClient, dealId, orgId)
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
async function handleDealsList(supabaseClient: any, url: URL, orgId: string) {
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
      .eq('clerk_org_id', orgId)
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
async function handleSingleDeal(supabaseClient: any, dealId: string, url: URL, orgId: string) {
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
      .eq('clerk_org_id', orgId)
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
async function handleCreateDeal(supabaseClient: any, body: any, orgId: string) {
  try {
    const { data: deal, error } = await supabaseClient
      .from('deals')
      .insert({
        ...body,
        clerk_org_id: orgId,
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
async function handleUpdateDeal(supabaseClient: any, dealId: string, body: any, orgId: string) {
  try {
    // Check if stage is being updated to set stage_changed_at
    const updateData = { ...body }
    if (body.stage_id) {
      // Get current deal to check if stage is actually changing
      const { data: currentDeal } = await supabaseClient
        .from('deals')
        .select('stage_id')
        .eq('id', dealId)
        .eq('clerk_org_id', orgId)
        .single()

      if (currentDeal && currentDeal.stage_id !== body.stage_id) {
        updateData.stage_changed_at = new Date().toISOString()
      }
    }

    const { data: deal, error } = await supabaseClient
      .from('deals')
      .update(updateData)
      .eq('id', dealId)
      .eq('clerk_org_id', orgId)
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
async function handleDeleteDeal(supabaseClient: any, dealId: string, orgId: string) {
  try {
    const { error } = await supabaseClient
      .from('deals')
      .delete()
      .eq('id', dealId)
      .eq('clerk_org_id', orgId)

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