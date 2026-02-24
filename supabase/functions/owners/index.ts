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

    if (req.method === 'GET') {
      // GET /owners - List all owners (users from profiles table)
      return await handleOwnersList(supabaseClient)
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

// List owners (from profiles table)
async function handleOwnersList(supabaseClient: any) {
  try {
    const { data: owners, error } = await supabaseClient
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        email,
        avatar_url,
        created_at,
        updated_at
      `)
      .order('first_name', { ascending: true })

    if (error) {
      throw error
    }

    // Process owners to add full_name
    const processedOwners = owners?.map((owner: any) => ({
      ...owner,
      full_name: owner.first_name && owner.last_name 
        ? `${owner.first_name} ${owner.last_name}`
        : owner.first_name || owner.last_name || owner.email || 'Unknown User'
    })) || []

    return new Response(JSON.stringify({
      data: processedOwners,
      count: processedOwners.length,
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