import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Get the JWT and API key from headers
    const authHeader = req.headers.get('Authorization')
    const apiKey = req.headers.get('apikey')

    if (!authHeader || !apiKey) {
      throw new Error('Missing authorization headers')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the JWT token
    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get the user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    const url = new URL(req.url)
    const pathSegments = url.pathname.split('/').filter(segment => segment && segment !== 'functions' && segment !== 'v1' && segment !== 'deal-activities')
    const activityId = pathSegments[0]
    
    if (req.method === 'GET') {
      if (!activityId) {
        // GET /deal-activities - List activities
        return await handleActivitiesList(supabaseClient, url)
      } else {
        // GET /deal-activities/:id - Single activity
        return await handleSingleActivity(supabaseClient, activityId)
      }
    } else if (req.method === 'POST') {
      const body = await req.json()
      
      if (!activityId && (body.deal_id !== undefined || body.is_matched !== undefined)) {
        // POST /deal-activities with query parameters in body - List activities
        return await handleActivitiesListFromBody(supabaseClient, body)
      } else {
        // POST /deal-activities - Create activity
        return await handleCreateActivity(supabaseClient, body, user.id)
      }
    } else if (req.method === 'PUT') {
      // PUT /deal-activities/:id - Update activity
      if (!activityId) {
        return new Response(JSON.stringify({ error: 'Activity ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const body = await req.json()
      return await handleUpdateActivity(supabaseClient, activityId, body, user.id)
    } else if (req.method === 'DELETE') {
      // DELETE /deal-activities/:id - Delete activity
      if (!activityId) {
        return new Response(JSON.stringify({ error: 'Activity ID required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return await handleDeleteActivity(supabaseClient, activityId, user.id)
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

// List activities
async function handleActivitiesList(supabaseClient: any, url: URL) {
  try {
    const dealId = url.searchParams.get('deal_id')
    const contactEmail = url.searchParams.get('contact_email')
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseClient
      .from('deal_activities_with_profile')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    // Apply filters
    if (dealId) {
      query = query.eq('deal_id', dealId)
    }
    if (contactEmail) {
      query = query.eq('contact_email', contactEmail)
    }

    const { data: activities, error } = await query

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: activities || [],
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

// List activities from POST body parameters
async function handleActivitiesListFromBody(supabaseClient: any, body: any) {
  try {
    const dealId = body.deal_id
    const contactEmail = body.contact_email
    const limit = parseInt(body.limit || '50')
    const offset = parseInt(body.offset || '0')

    let query = supabaseClient
      .from('deal_activities_with_profile')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false })

    // Apply filters
    if (dealId) {
      query = query.eq('deal_id', dealId)
    }
    if (contactEmail) {
      query = query.eq('contact_email', contactEmail)
    }

    const { data: activities, error } = await query

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: activities || [],
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

// Get single activity
async function handleSingleActivity(supabaseClient: any, activityId: string) {
  try {
    const { data: activity, error } = await supabaseClient
      .from('deal_activities_with_profile')
      .select('*')
      .eq('id', activityId)
      .single()

    if (error) {
      throw error
    }

    if (!activity) {
      return new Response(JSON.stringify({ error: 'Activity not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      data: activity,
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

// Create activity
async function handleCreateActivity(supabaseClient: any, body: any, userId: string) {
  try {
    const {
      deal_id,
      activity_type,
      notes,
      due_date,
      contact_email,
      completed = false
    } = body

    // Validate required fields
    if (!activity_type) {
      throw new Error('Activity type is required')
    }

    // Create activity
    const activityData = {
      deal_id: deal_id || null,
      user_id: userId,
      activity_type,
      notes: notes || null,
      due_date: due_date || null,
      contact_email: contact_email || null,
      completed,
      is_matched: false
    }

    const { data: activity, error } = await supabaseClient
      .from('deal_activities')
      .insert([activityData])
      .select()
      .single()

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: activity,
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

// Update activity
async function handleUpdateActivity(supabaseClient: any, activityId: string, body: any, userId: string) {
  try {
    const {
      activity_type,
      notes,
      due_date,
      contact_email,
      completed
    } = body

    // Build update object
    const updateData: any = {}
    if (activity_type !== undefined) updateData.activity_type = activity_type
    if (notes !== undefined) updateData.notes = notes
    if (due_date !== undefined) updateData.due_date = due_date
    if (contact_email !== undefined) updateData.contact_email = contact_email
    if (completed !== undefined) updateData.completed = completed
    updateData.updated_at = new Date().toISOString()

    const { data: activity, error } = await supabaseClient
      .from('deal_activities')
      .update(updateData)
      .eq('id', activityId)
      .eq('user_id', userId) // Ensure user can only update their own activities
      .select()
      .single()

    if (error) {
      throw error
    }

    if (!activity) {
      return new Response(JSON.stringify({ error: 'Activity not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      data: activity,
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

// Delete activity
async function handleDeleteActivity(supabaseClient: any, activityId: string, userId: string) {
  try {
    const { error } = await supabaseClient
      .from('deal_activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', userId) // Ensure user can only delete their own activities

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({
      data: { success: true },
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