
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export async function handleSplits(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    
    if (req.method === 'GET') {
      // GET /deal-splits?deal_id=... or /deal-splits?user_id=...
      const dealId = url.searchParams.get('deal_id')
      const userId = url.searchParams.get('user_id')
      
      let query = supabase
        .from('deal_splits_with_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (dealId) {
        query = query.eq('deal_id', dealId)
      }
      
      if (userId) {
        query = query.eq('user_id', userId)
      }

      const { data, error } = await query

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'POST') {
      // POST /deal-splits - Create new split
      const body = await req.json()
      const { deal_id, user_id, percentage, notes } = body

      // Validate required fields
      if (!deal_id || !user_id || percentage === undefined) {
        throw new Error('Missing required fields: deal_id, user_id, percentage')
      }

      // Validate percentage
      if (percentage <= 0 || percentage > 100) {
        throw new Error('Percentage must be between 0 and 100')
      }

      // Verify user owns the deal
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('owner_id')
        .eq('id', deal_id)
        .single()

      if (dealError) throw dealError
      if (deal.owner_id !== user.id) {
        throw new Error('You can only create splits for your own deals')
      }

      // Insert the split (amount will be calculated by trigger)
      const { data, error } = await supabase
        .from('deal_splits')
        .insert({
          deal_id,
          user_id,
          percentage,
          notes
        })
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201,
      })
    }

    if (req.method === 'PUT') {
      // PUT /deal-splits/{id} - Update split
      const splitId = pathParts[pathParts.length - 1]
      const body = await req.json()
      const { percentage, notes } = body

      // Verify user owns the deal
      const { data: split, error: splitError } = await supabase
        .from('deal_splits')
        .select(`
          *,
          deals!inner(owner_id)
        `)
        .eq('id', splitId)
        .single()

      if (splitError) throw splitError
      if (split.deals.owner_id !== user.id) {
        throw new Error('You can only update splits for your own deals')
      }

      // Update the split (amount will be recalculated by trigger)
      const updateData: any = {}
      if (percentage !== undefined) {
        if (percentage <= 0 || percentage > 100) {
          throw new Error('Percentage must be between 0 and 100')
        }
        updateData.percentage = percentage
      }
      if (notes !== undefined) {
        updateData.notes = notes
      }

      const { data, error } = await supabase
        .from('deal_splits')
        .update(updateData)
        .eq('id', splitId)
        .select()
        .single()

      if (error) throw error

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (req.method === 'DELETE') {
      // DELETE /deal-splits/{id} - Delete split
      const splitId = pathParts[pathParts.length - 1]

      // Verify user owns the deal
      const { data: split, error: splitError } = await supabase
        .from('deal_splits')
        .select(`
          *,
          deals!inner(owner_id)
        `)
        .eq('id', splitId)
        .single()

      if (splitError) throw splitError
      if (split.deals.owner_id !== user.id) {
        throw new Error('You can only delete splits for your own deals')
      }

      const { error } = await supabase
        .from('deal_splits')
        .delete()
        .eq('id', splitId)

      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Method ${req.method} not allowed`)

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
}