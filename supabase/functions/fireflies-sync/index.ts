import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql'

/**
 * Fireflies.ai Sync Edge Function
 * 
 * Syncs meeting transcripts from Fireflies.ai to the meetings table.
 * Uses GraphQL API with API key authentication.
 * 
 * Pattern: Following fathom-sync edge function (per-user integration)
 * 
 * Actions:
 *   - test_connection: Test API key validity
 *   - sync: Full sync of meetings
 */

interface FirefliesSentence {
  index: number
  speaker_name: string
  raw_text: string
}

interface FirefliesTranscript {
  id: string
  title: string
  date: number // epoch ms
  transcript_url: string
  sentences: FirefliesSentence[]
  fireflies_users: string[]
  organizer_email: string
  host_email: string
}

// GraphQL query for fetching transcripts
const GET_TRANSCRIPTS_QUERY = `
query GetRecent($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!) {
  transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, mine: false) {
    id
    title
    date
    transcript_url
    sentences {
      index
      speaker_name
      raw_text
    }
    fireflies_users
    organizer_email
    host_email
  }
}
`

// Helper to call Fireflies GraphQL API
async function callFirefliesAPI(apiKey: string, query: string, variables: Record<string, any>) {
  const response = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Fireflies API error: ${response.status} - ${text}`)
  }

  const json = await response.json()
  
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`)
  }

  return json.data
}

// Convert sentences to plain text transcript
function sentencesToText(sentences: FirefliesSentence[]): string {
  return sentences.map(s => `${s.speaker_name}: ${s.raw_text}`).join('\n')
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse body first (before checking auth) to handle errors gracefully
    let body: any
    try {
      body = await req.json()
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, api_key, sync_type, start_date, end_date, limit } = body

    // Get authorization header - Supabase automatically includes it from client session
    // Check multiple possible header names (case-insensitive)
    const authHeader = req.headers.get('Authorization') || 
                      req.headers.get('authorization') ||
                      req.headers.get('x-authorization') ||
                      req.headers.get('X-Authorization')
    
    // Debug logging
    const allHeaders = Object.fromEntries(req.headers.entries())
    console.log('[fireflies-sync] Request received:', {
      method: req.method,
      url: req.url,
      headers_received: Object.keys(allHeaders),
      auth_header_present: !!authHeader,
      auth_header_preview: authHeader ? authHeader.substring(0, 30) + '...' : null
    })

    if (!authHeader) {
      // Return detailed error for debugging
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing Authorization header',
          debug: {
            headers_received: Object.keys(allHeaders),
            method: req.method,
            url: req.url,
            all_header_names: Array.from(req.headers.keys())
          }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Supabase URL and keys (automatically available in edge functions)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    // Service role key can be set as SERVICE_ROLE_KEY secret (without SUPABASE_ prefix)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing service role key configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with user's JWT
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    )

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service role client for database operations
    const serviceClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Handle test_connection action
    if (action === 'test_connection') {
      const testApiKey = api_key
      if (!testApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: 'API key is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      try {
        // Test by fetching a small sample
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        
        const data = await callFirefliesAPI(testApiKey, GET_TRANSCRIPTS_QUERY, {
          fromDate: thirtyDaysAgo.toISOString(),
          toDate: now.toISOString(),
          limit: 5,
        })

        return new Response(
          JSON.stringify({
            success: true,
            message: 'API key is valid',
            sample_count: data.transcripts?.length || 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Invalid API key' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Handle sync action
    if (action === 'sync') {
      // Get user's Fireflies integration
      const { data: integration, error: integrationError } = await serviceClient
        .from('fireflies_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (integrationError || !integration) {
        return new Response(
          JSON.stringify({ success: false, error: 'No active Fireflies integration found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Update sync state to 'syncing'
      await serviceClient
        .from('fireflies_sync_state')
        .upsert({
          user_id: user.id,
          integration_id: integration.id,
          sync_status: 'syncing',
          error_message: null,
        }, { onConflict: 'user_id' })

      try {
        // Calculate date range
        const now = new Date()
        let fromDate: Date
        let toDate = now

        if (start_date) {
          fromDate = new Date(start_date)
        } else if (sync_type === 'incremental' && integration.last_sync_at) {
          fromDate = new Date(integration.last_sync_at)
        } else {
          // Default: last 30 days
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }

        if (end_date) {
          toDate = new Date(end_date)
        }

        // Fetch transcripts from Fireflies
        const data = await callFirefliesAPI(integration.api_key, GET_TRANSCRIPTS_QUERY, {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          limit: limit || 50,
        })

        const transcripts: FirefliesTranscript[] = data.transcripts || []
        let syncedCount = 0
        let skippedCount = 0

        // Get user's org_id for the meetings
        const { data: orgMember } = await serviceClient
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle()

        const orgId = orgMember?.org_id

        // Process each transcript
        for (const transcript of transcripts) {
          // Check if already synced
          const { data: existing } = await serviceClient
            .from('meetings')
            .select('id')
            .eq('external_id', transcript.id)
            .eq('provider', 'fireflies')
            .maybeSingle()

          if (existing) {
            skippedCount++
            continue
          }

          // Convert sentences to transcript text
          const transcriptText = sentencesToText(transcript.sentences)

          // Insert meeting
          const { error: insertError } = await serviceClient
            .from('meetings')
            .insert({
              owner_user_id: user.id,
              org_id: orgId,
              external_id: transcript.id,
              provider: 'fireflies',
              title: transcript.title,
              meeting_start: new Date(transcript.date).toISOString(),
              share_url: transcript.transcript_url,
              transcript_text: transcriptText,
              transcript_json: transcript.sentences,
              source_users: transcript.fireflies_users || [],
              organizer_email: transcript.organizer_email,
              host_email: transcript.host_email,
              sync_status: 'synced',
              last_synced_at: new Date().toISOString(),
            })

          if (insertError) {
            console.error(`Error inserting meeting ${transcript.id}:`, insertError)
          } else {
            syncedCount++
          }
        }

        // Update integration last_sync_at
        await serviceClient
          .from('fireflies_integrations')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', integration.id)

        // Update sync state to 'idle'
        await serviceClient
          .from('fireflies_sync_state')
          .upsert({
            user_id: user.id,
            integration_id: integration.id,
            sync_status: 'idle',
            last_successful_sync: new Date().toISOString(),
            last_synced_date: toDate.toISOString(),
            meetings_synced: syncedCount,
            total_meetings_found: transcripts.length,
            error_message: null,
            error_count: 0,
          }, { onConflict: 'user_id' })

        return new Response(
          JSON.stringify({
            success: true,
            sync_type: sync_type || 'manual',
            meetings_synced: syncedCount,
            total_found: transcripts.length,
            skipped: skippedCount,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      } catch (syncError) {
        // Update sync state to 'error'
        await serviceClient
          .from('fireflies_sync_state')
          .upsert({
            user_id: user.id,
            integration_id: integration.id,
            sync_status: 'error',
            error_message: syncError instanceof Error ? syncError.message : 'Unknown sync error',
            error_count: (await serviceClient
              .from('fireflies_sync_state')
              .select('error_count')
              .eq('user_id', user.id)
              .maybeSingle()
            ).data?.error_count + 1 || 1,
            last_error_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })

        return new Response(
          JSON.stringify({ success: false, error: syncError instanceof Error ? syncError.message : 'Sync failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Fireflies sync error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
