import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

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

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== 'stages')
    const stageId = pathSegments[0]
    
    if (req.method === 'GET') {
      if (!stageId) {
        // GET /stages - List all stages
        return await handleStagesList(supabaseClient, url)
      } else {
        // GET /stages/:id - Single stage
        return await handleSingleStage(supabaseClient, stageId)
      }
    } else if (req.method === 'POST') {
      // POST /stages - Create stage
      const body = await req.json()
      return await handleCreateStage(supabaseClient, body)
    } else if (req.method === 'PUT') {
      // PUT /stages/:id - Update stage
      if (!stageId) {
        return new Response(JSON.stringify({ error: 'Stage ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const body = await req.json()
      return await handleUpdateStage(supabaseClient, stageId, body)
    } else if (req.method === 'DELETE') {
      // DELETE /stages/:id - Delete stage
      if (!stageId) {
        return new Response(JSON.stringify({ error: 'Stage ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return await handleDeleteStage(supabaseClient, stageId)
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

// List all stages
async function handleStagesList(supabaseClient: any, url: URL) {
  try {
    const includeDeals = url.searchParams.get('includeDeals') === 'true'

    let query = supabaseClient
      .from('deal_stages')
      .select(`
        id,
        name,
        color,
        order_position,
        default_probability,
        created_at,
        updated_at
        ${includeDeals ? `,
        deals:deals(count)
        ` : ''}
      `)
      .order('order_position', { ascending: true })

    const { data: stages, error } = await query

    if (error) {
      throw error
    }

    // Process stages to add deal counts if requested
    let processedStages = stages
    if (includeDeals && stages) {
      processedStages = stages.map((stage: any) => ({
        ...stage,
        dealCount: stage.deals?.[0]?.count || 0
      }))
    }

    return new Response(JSON.stringify({
      data: processedStages || [],
      error: null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({
      data: [],
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

// Get single stage
async function handleSingleStage(supabaseClient: any, stageId: string) {
  try {
    const { data: stage, error } = await supabaseClient
      .from('deal_stages')
      .select(`
        *,
        deals:deals(count)
      `)
      .eq('id', stageId)
      .single()

    if (error) {
      throw error
    }

    if (!stage) {
      return new Response(JSON.stringify({ error: 'Stage not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Process stage to add deal count
    const processedStage = {
      ...stage,
      dealCount: stage.deals?.[0]?.count || 0
    }

    return new Response(JSON.stringify({
      data: processedStage,
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

// Create stage
async function handleCreateStage(supabaseClient: any, body: any) {
  try {
    // Get the next position
    const { data: maxStage } = await supabaseClient
      .from('deal_stages')
      .select('order_position')
      .order('order_position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (maxStage?.order_position || 0) + 1

    const { data: stage, error } = await supabaseClient
      .from('deal_stages')
      .insert({
        ...body,
        order_position: nextPosition
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: stage,
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

// Update stage
async function handleUpdateStage(supabaseClient: any, stageId: string, body: any) {
  try {
    const { data: stage, error } = await supabaseClient
      .from('deal_stages')
      .update(body)
      .eq('id', stageId)
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: stage,
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

// Delete stage
async function handleDeleteStage(supabaseClient: any, stageId: string) {
  try {
    // Check if stage has deals
    const { data: deals } = await supabaseClient
      .from('deals')
      .select('id')
      .eq('stage_id', stageId)
      .limit(1)

    if (deals && deals.length > 0) {
      return new Response(JSON.stringify({
        error: 'Cannot delete stage with existing deals'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error } = await supabaseClient
      .from('deal_stages')
      .delete()
      .eq('id', stageId)

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: { id: stageId },
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