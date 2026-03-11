import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * DEPRECATED: Manual Task Creation from Action Item
 *
 * This function is deprecated and now redirects to create-task-unified.
 * Use create-task-unified directly for all new implementations.
 */
export async function handleTaskFromActionItem(req: Request): Promise<Response> {
  try {
    console.warn('[create-task-from-action-item] DEPRECATED: This function redirects to create-task-unified. Use create-task-unified directly.')

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Parse request body
    const { action_item_id } = await req.json()

    if (!action_item_id) {
      throw new Error('action_item_id is required')
    }

    // Call unified function in manual mode
    console.log(`[create-task-from-action-item] Redirecting to create-task-unified for action item ${action_item_id}`)

    const { data: result, error: invokeError } = await supabase.functions.invoke(
      'create-router',
      {
        body: {
          action: 'task_unified',
          mode: 'manual',
          action_item_ids: [action_item_id],
          source: 'action_item'
        },
        headers: {
          Authorization: authHeader
        }
      }
    )

    if (invokeError) {
      throw new Error(`Unified function error: ${invokeError.message}`)
    }

    // Check if task was created
    if (result?.success && result.tasks_created > 0 && result.tasks?.length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          task: result.tasks[0],
          message: 'Task created successfully',
          note: 'This endpoint is deprecated. Use create-task-unified directly.'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    } else if (result?.errors?.length > 0) {
      // Return the first error
      const error = result.errors[0]
      return new Response(
        JSON.stringify({
          success: false,
          error: error.error,
          action_item_id: error.action_item_id
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    } else {
      throw new Error('Unexpected response from unified function')
    }

  } catch (error) {
    console.error('[create-task-from-action-item] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}
