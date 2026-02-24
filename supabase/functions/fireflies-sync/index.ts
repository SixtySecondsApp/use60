import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enrichFirefliesMeeting } from './enrichment.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql'

// Max meetings to fully enrich per sync (avoid edge function timeout)
const MAX_ENRICHMENT_BATCH = 5

/**
 * Fireflies.ai Sync Edge Function
 *
 * Syncs meeting transcripts from Fireflies.ai to the meetings table.
 * Uses GraphQL API with API key authentication.
 *
 * Phase 2: Enriches meetings with AI analysis (sentiment, coaching, talk time),
 * participant extraction (contacts/companies), and action items.
 *
 * Actions:
 *   - test_connection: Test API key validity
 *   - sync: Full sync of meetings with enrichment
 */

export interface FirefliesSentence {
  index: number
  speaker_name: string
  raw_text: string
  start_time?: number  // seconds from start
  end_time?: number    // seconds from start
}

export interface FirefliesSummary {
  action_items?: string[]
  overview?: string
  short_summary?: string
  keywords?: string[]
  meeting_type?: string
}

export interface FirefliesAttendee {
  displayName?: string
  email?: string
  phoneNumber?: string
}

export interface FirefliesSpeaker {
  id?: string
  name?: string
}

export interface FirefliesTranscript {
  id: string
  title: string
  date: number // epoch ms
  transcript_url: string
  audio_url?: string   // 24h expiring download URL
  video_url?: string   // requires Business/Enterprise plan
  duration?: number // minutes
  sentences: FirefliesSentence[]
  fireflies_users: string[]
  organizer_email: string
  host_email: string
  summary?: FirefliesSummary
  meeting_attendees?: FirefliesAttendee[]
  speakers?: FirefliesSpeaker[]
}

// GraphQL query for fetching transcripts with enrichment data
const GET_TRANSCRIPTS_QUERY = `
query GetRecent($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!) {
  transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, mine: false) {
    id
    title
    date
    transcript_url
    audio_url
    video_url
    duration
    sentences {
      index
      speaker_name
      raw_text
      start_time
      end_time
    }
    fireflies_users
    organizer_email
    host_email
    summary {
      action_items
      overview
      short_summary
      keywords
      meeting_type
    }
    meeting_attendees {
      displayName
      email
      phoneNumber
    }
    speakers {
      id
      name
    }
  }
}
`

// Fallback query without video_url (for Free/Pro plan users)
const GET_TRANSCRIPTS_QUERY_NO_VIDEO = `
query GetRecent($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!) {
  transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, mine: false) {
    id
    title
    date
    transcript_url
    audio_url
    duration
    sentences {
      index
      speaker_name
      raw_text
      start_time
      end_time
    }
    fireflies_users
    organizer_email
    host_email
    summary {
      action_items
      overview
      short_summary
      keywords
      meeting_type
    }
    meeting_attendees {
      displayName
      email
      phoneNumber
    }
    speakers {
      id
      name
    }
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

// Convert sentences to plain text transcript with optional timestamps
// Outputs [HH:MM:SS] Speaker: text format (compatible with Fathom transcript rendering)
function sentencesToText(sentences: FirefliesSentence[] | null | undefined): string {
  if (!sentences || !Array.isArray(sentences)) return ''
  return sentences.map(s => {
    if (s.start_time != null) {
      const h = Math.floor(s.start_time / 3600)
      const m = Math.floor((s.start_time % 3600) / 60)
      const sec = Math.floor(s.start_time % 60)
      const ts = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      return `[${ts}] ${s.speaker_name}: ${s.raw_text}`
    }
    return `${s.speaker_name}: ${s.raw_text}`
  }).join('\n')
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

    const { action, api_key, sync_type, start_date, end_date, limit, org_id } = body

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
        // Test by fetching a small sample (with video_url fallback for Free/Pro plans)
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const testVariables = {
          fromDate: thirtyDaysAgo.toISOString(),
          toDate: now.toISOString(),
          limit: 5,
        }

        let data: any
        try {
          data = await callFirefliesAPI(testApiKey, GET_TRANSCRIPTS_QUERY, testVariables)
        } catch (apiError: any) {
          const errorMsg = apiError?.message?.toLowerCase() || ''
          if (errorMsg.includes('video_url') || errorMsg.includes('plan') || errorMsg.includes('permission') || errorMsg.includes('subscribed') || errorMsg.includes('business')) {
            console.warn('[fireflies-sync] video_url not available on this plan, retrying without it')
            data = await callFirefliesAPI(testApiKey, GET_TRANSCRIPTS_QUERY_NO_VIDEO, testVariables)
          } else {
            throw apiError
          }
        }

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

        // Fetch transcripts from Fireflies (with video_url fallback for Free/Pro plans)
        const queryVariables = {
          fromDate: fromDate.toISOString(),
          toDate: toDate.toISOString(),
          limit: limit || 50,
        }
        let data: any
        try {
          data = await callFirefliesAPI(integration.api_key, GET_TRANSCRIPTS_QUERY, queryVariables)
        } catch (apiError: any) {
          const errorMsg = apiError?.message?.toLowerCase() || ''
          if (errorMsg.includes('video_url') || errorMsg.includes('plan') || errorMsg.includes('permission') || errorMsg.includes('subscribed') || errorMsg.includes('business')) {
            console.warn('[fireflies-sync] video_url not available on this plan, retrying without it')
            data = await callFirefliesAPI(integration.api_key, GET_TRANSCRIPTS_QUERY_NO_VIDEO, queryVariables)
          } else {
            throw apiError
          }
        }

        const transcripts: FirefliesTranscript[] = data.transcripts || []
        let syncedCount = 0
        let skippedCount = 0

        // Get user's org_id for the meetings
        // Prefer org_id from frontend (user's active org), fallback to DB lookup
        let orgId = org_id || null
        if (!orgId) {
          const { data: orgMembers } = await serviceClient
            .from('organization_memberships')
            .select('org_id')
            .eq('user_id', user.id)
            .limit(1)

          orgId = orgMembers?.[0]?.org_id || null
        }

        // Batch dedup: fetch all existing external_ids in one query
        const transcriptIds = transcripts.map(t => t.id)
        const { data: existingMeetings } = await serviceClient
          .from('meetings')
          .select('external_id')
          .eq('provider', 'fireflies')
          .in('external_id', transcriptIds)

        const existingIds = new Set((existingMeetings || []).map(m => m.external_id))

        // Filter to only new transcripts
        const newTranscripts = transcripts.filter(t => {
          if (existingIds.has(t.id)) {
            skippedCount++
            return false
          }
          return true
        })

        // Batch insert all new meetings at once
        // Track inserted meeting IDs for enrichment
        const insertedMeetingIds: string[] = []

        if (newTranscripts.length > 0) {
          const meetingsToInsert = newTranscripts.map(transcript => ({
            owner_user_id: user.id,
            org_id: orgId,
            external_id: transcript.id,
            provider: 'fireflies',
            title: transcript.title,
            meeting_start: new Date(transcript.date).toISOString(),
            duration_minutes: transcript.duration || null,
            share_url: transcript.video_url || transcript.audio_url || transcript.transcript_url,
            transcript_text: sentencesToText(transcript.sentences),
            owner_email: transcript.organizer_email || transcript.host_email || null,
            summary: transcript.summary?.overview || transcript.summary?.short_summary || null,
            transcript_status: 'complete',
            summary_status: (transcript.summary?.overview || transcript.summary?.short_summary) ? 'complete' : 'pending',
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          }))

          const { data: insertedRows, error: insertError } = await serviceClient
            .from('meetings')
            .insert(meetingsToInsert)
            .select('id, external_id')

          if (insertError) {
            console.error('Error batch inserting meetings:', insertError)
            // Fallback: try inserting one by one to identify which ones fail
            for (const meeting of meetingsToInsert) {
              const { data: singleRow, error: singleError } = await serviceClient
                .from('meetings')
                .insert(meeting)
                .select('id, external_id')
              if (singleError) {
                console.error(`Error inserting meeting ${meeting.external_id}:`, singleError)
              } else {
                syncedCount++
                if (singleRow?.[0]?.id) insertedMeetingIds.push(singleRow[0].id)
              }
            }
          } else {
            syncedCount = newTranscripts.length
            if (insertedRows) {
              insertedMeetingIds.push(...insertedRows.map(r => r.id))
            }
          }
        }

        // --- Phase 2: Enrichment ---
        // Enrich newly inserted meetings (participants, AI analysis, action items)
        let enrichedCount = 0
        const enrichmentBatch = insertedMeetingIds.slice(0, MAX_ENRICHMENT_BATCH)

        if (enrichmentBatch.length > 0) {
          console.log(`[fireflies-sync] Starting enrichment for ${enrichmentBatch.length} meetings (${insertedMeetingIds.length} total inserted)`)

          // Build a map of external_id -> transcript for enrichment data
          const transcriptByExternalId = new Map<string, FirefliesTranscript>()
          for (const t of newTranscripts) {
            transcriptByExternalId.set(t.id, t)
          }

          // Fetch the inserted meetings to get their IDs and external_ids
          const { data: meetingsToEnrich } = await serviceClient
            .from('meetings')
            .select('id, external_id, title, meeting_start, transcript_text, owner_email, org_id, owner_user_id, summary')
            .in('id', enrichmentBatch)

          if (meetingsToEnrich) {
            for (const meeting of meetingsToEnrich) {
              const transcript = transcriptByExternalId.get(meeting.external_id)
              if (!transcript) continue

              try {
                await enrichFirefliesMeeting(serviceClient, meeting, transcript, user.id, orgId)
                enrichedCount++
                console.log(`[fireflies-sync] Enriched meeting ${meeting.id} (${meeting.title})`)
              } catch (enrichError) {
                // Non-fatal: meeting is already inserted
                console.warn(`[fireflies-sync] Enrichment failed for meeting ${meeting.id}:`,
                  enrichError instanceof Error ? enrichError.message : String(enrichError))
              }
            }
          }

          if (insertedMeetingIds.length > MAX_ENRICHMENT_BATCH) {
            console.log(`[fireflies-sync] ${insertedMeetingIds.length - MAX_ENRICHMENT_BATCH} meetings inserted without enrichment (will be enriched on next sync)`)
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
            meetings_enriched: enrichedCount,
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
