import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

serve(async (req) => {
  // Handle CORS preflight requests
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Try to create stages using INSERT
    const stagesToInsert = [
      { name: 'Lead', color: '#6366F1', order_position: 1, description: 'Initial lead qualification', is_final: false },
      { name: 'Qualified', color: '#3B82F6', order_position: 2, description: 'Qualified opportunity', is_final: false },
      { name: 'Proposal', color: '#F59E0B', order_position: 3, description: 'Proposal submitted', is_final: false },
      { name: 'Negotiation', color: '#EF4444', order_position: 4, description: 'Terms negotiation', is_final: false },
      { name: 'Closed Won', color: '#10B981', order_position: 5, description: 'Deal won', is_final: true },
      { name: 'Closed Lost', color: '#6B7280', order_position: 6, description: 'Deal lost', is_final: true }
    ]

    let result = { created: 0, existing: 0, errors: [] as string[] }

    // Try to insert each stage
    for (const stage of stagesToInsert) {
      try {
        const { data, error } = await supabase
          .from('deal_stages')
          .insert(stage)
          .select()

        if (error) {
          if (error.code === '23505') {
            // Unique constraint violation - stage already exists
            result.existing++
          } else {
            result.errors.push(`${stage.name}: ${error.message}`)
          }
        } else {
          result.created++
        }
      } catch (insertError: any) {
        result.errors.push(`${stage.name}: ${insertError.message}`)
      }
    }

    // Get all stages to show current state
    const { data: stages, error: fetchError } = await supabase
      .from('deal_stages')
      .select('*')
      .order('order_position')

    return new Response(
      JSON.stringify({ 
        message: 'Deal stages setup completed',
        result,
        stages: stages || [],
        fetchError: fetchError?.message || null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})