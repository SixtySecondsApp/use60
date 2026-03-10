
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SalePayload {
  clientName: string
  amount: number
  details?: string
  saleType: 'one-off' | 'subscription' | 'lifetime'
  salesRep: string
}

export async function handleSale(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the JWT and API key from headers
    const authHeader = req.headers.get('Authorization')
    const apiKey = req.headers.get('apikey')

    if (!authHeader || !apiKey) {
      throw new Error('Missing authorization headers')
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the JWT token
    const token = authHeader.replace('Bearer ', '')

    // Verify the JWT and get the user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    // Parse request body
    const { clientName, amount, details, saleType, salesRep } = await req.json() as SalePayload

    // Validate required fields
    if (!clientName || !amount || amount <= 0 || !salesRep) {
      throw new Error('Missing or invalid required fields')
    }

    // Validate sale type
    if (!['one-off', 'subscription', 'lifetime'].includes(saleType)) {
      throw new Error('Invalid sale type')
    }

    // Create sale activity
    const { data, error } = await supabaseAdmin
      .from('activities')
      .insert({
        user_id: user.id,
        type: 'sale',
        client_name: clientName,
        details: details || `${saleType} Sale`,
        amount,
        priority: 'high',
        sales_rep: salesRep,
        date: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      throw new Error('Failed to create sale')
    }

    // Add sale to database
    const { error: insertError } = await supabaseAdmin
      .from('sales')
      .insert([{
        user_id: user.id,
        type: saleType,
        client_name: clientName,
        details: details || `${saleType} Sale`,
        amount,
        sales_rep: salesRep,
        date: new Date().toISOString()
      }])
      .single()

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
}