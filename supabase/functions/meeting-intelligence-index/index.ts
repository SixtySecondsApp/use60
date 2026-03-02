/**
 * Meeting Intelligence Index Edge Function
 *
 * Indexes meeting content to Google File Search for semantic RAG queries.
 * Creates/manages per-user File Search stores and uploads meeting documents.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'
import { captureException } from '../_shared/sentryEdge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'

interface RequestBody {
  meetingId?: string
  meetingIds?: string[]
  forceReindex?: boolean
}

interface MeetingDocument {
  meeting_id: string
  title: string
  date: string
  company_name: string | null
  company_id: string | null
  contact_name: string | null
  contact_id: string | null
  attendees: string[]
  duration_minutes: number | null
  sentiment_score: number | null
  sentiment_label: string
  sentiment_reasoning: string | null
  transcript: string
  summary: string | null
  action_items: string[]
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
}

/**
 * Get user's organization ID
 */
async function getUserOrgId(userId: string, supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return data?.org_id || null
}

/**
 * Get or create a File Search store for the organization
 */
async function getOrCreateOrgStore(
  orgId: string,
  supabase: any,
  geminiApiKey: string
): Promise<{ storeName: string; isNew: boolean }> {
  // Check if org already has a store
  const { data: existingStore } = await supabase
    .from('org_file_search_stores')
    .select('store_name')
    .eq('org_id', orgId)
    .single()

  if (existingStore?.store_name) {
    return { storeName: existingStore.store_name, isNew: false }
  }

  // Create new File Search store for the organization
  const displayName = `org-${orgId.substring(0, 8)}-meetings-${Date.now()}`

  console.log(`Creating new File Search store: ${displayName}`)

  const response = await fetch(
    `${GEMINI_API_BASE}/fileSearchStores?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create File Search store: ${errorText}`)
  }

  const storeData = await response.json()
  const storeName = storeData.name // e.g., "fileSearchStores/abc123"

  console.log(`Store created: ${storeName}`)

  // Save store reference to database
  await supabase
    .from('org_file_search_stores')
    .insert({
      org_id: orgId,
      store_name: storeName,
      display_name: displayName,
      status: 'active'
    })

  return { storeName, isNew: true }
}

/**
 * Build a document from meeting data for indexing
 */
function buildMeetingDocument(meeting: any): MeetingDocument {
  // Extract attendee names
  const attendees: string[] = []
  if (meeting.meeting_attendees) {
    meeting.meeting_attendees.forEach((a: any) => {
      if (a.name) attendees.push(a.name)
      else if (a.email) attendees.push(a.email)
    })
  }

  // Extract action items
  const actionItems: string[] = []
  if (meeting.meeting_action_items) {
    meeting.meeting_action_items.forEach((item: any) => {
      if (item.title) actionItems.push(item.title)
    })
  }

  // Determine sentiment label
  let sentimentLabel = 'neutral'
  if (meeting.sentiment_score !== null) {
    if (meeting.sentiment_score > 0.25) sentimentLabel = 'positive'
    else if (meeting.sentiment_score < -0.25) sentimentLabel = 'negative'
  }

  return {
    meeting_id: meeting.id,
    title: meeting.title || 'Untitled Meeting',
    date: meeting.meeting_start ? new Date(meeting.meeting_start).toISOString().split('T')[0] : '',
    company_name: meeting.company?.name || null,
    company_id: meeting.company_id || null,
    contact_name: meeting.primary_contact?.name || meeting.primary_contact?.email || null,
    contact_id: meeting.primary_contact_id || null,
    attendees,
    duration_minutes: meeting.duration_minutes,
    sentiment_score: meeting.sentiment_score,
    sentiment_label: sentimentLabel,
    sentiment_reasoning: meeting.sentiment_reasoning,
    transcript: meeting.transcript_text || '',
    summary: meeting.summary,
    action_items: actionItems,
    talk_time_rep_pct: meeting.talk_time_rep_pct,
    talk_time_customer_pct: meeting.talk_time_customer_pct
  }
}

/**
 * Calculate MD5 hash of content for change detection
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Upload document to File Search store using two-step process:
 * 1. Upload file to Files API
 * 2. Import file to File Search Store
 */
async function uploadToFileSearchStore(
  storeName: string,
  meetingId: string,
  document: MeetingDocument,
  orgId: string,
  geminiApiKey: string
): Promise<string> {
  const content = JSON.stringify(document, null, 2)
  const displayName = `meeting-${meetingId}.json`

  console.log(`Uploading file: ${displayName}, content length: ${content.length}`)

  // Step 1: Start resumable upload to get upload URI
  const startResponse = await fetch(
    `${GEMINI_UPLOAD_BASE}/files?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(new TextEncoder().encode(content).length),
        'X-Goog-Upload-Header-Content-Type': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file: {
          displayName: displayName
        }
      })
    }
  )

  if (!startResponse.ok) {
    const errorText = await startResponse.text()
    console.error(`Start upload failed - Status: ${startResponse.status}, Body: ${errorText}`)
    throw new Error(`Failed to start upload (${startResponse.status}): ${errorText}`)
  }

  const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) {
    throw new Error('No upload URL returned from start request')
  }

  console.log(`Got upload URL, uploading content...`)

  // Step 2: Upload the actual file content
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': 'application/json'
    },
    body: content
  })

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    console.error(`Files API upload failed - Status: ${uploadResponse.status}, Body: ${errorText}`)
    throw new Error(`Failed to upload file (${uploadResponse.status}): ${errorText || 'No error details'}`)
  }

  const fileData = await uploadResponse.json()
  const fileName = fileData.file?.name || fileData.name

  if (!fileName) {
    throw new Error('No file name returned from Files API')
  }

  console.log(`File uploaded successfully: ${fileName}`)

  // Step 2: Import file to File Search Store with metadata
  const customMetadata: Array<{ key: string; string_value?: string; numeric_value?: number }> = []

  if (document.company_id) {
    customMetadata.push({ key: 'company_id', string_value: document.company_id })
  }
  if (document.sentiment_label) {
    customMetadata.push({ key: 'sentiment_label', string_value: document.sentiment_label })
  }
  if (document.date) {
    customMetadata.push({ key: 'meeting_date', string_value: document.date })
  }
  customMetadata.push({
    key: 'has_action_items',
    string_value: document.action_items.length > 0 ? 'true' : 'false'
  })
  customMetadata.push({
    key: 'meeting_id',
    string_value: meetingId
  })
  customMetadata.push({
    key: 'org_id',
    string_value: orgId
  })

  const importResponse = await fetch(
    `${GEMINI_API_BASE}/${storeName}:importFile?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: fileName,
        customMetadata: customMetadata
      })
    }
  )

  if (!importResponse.ok) {
    const errorText = await importResponse.text()
    console.error(`File Search import failed - Status: ${importResponse.status}, Body: ${errorText}`)
    throw new Error(`Failed to import to File Search (${importResponse.status}): ${errorText || 'No error details'}`)
  }

  const importData = await importResponse.json()
  console.log(`File imported to store successfully: ${JSON.stringify(importData)}`)

  return fileName
}

/**
 * Index a single meeting
 */
async function indexMeeting(
  meeting: any,
  userId: string,
  orgId: string,
  storeName: string,
  supabase: any,
  geminiApiKey: string,
  forceReindex: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    // Build document
    const document = buildMeetingDocument(meeting)
    const contentHash = await hashContent(JSON.stringify(document))

    // Check if already indexed with same content
    if (!forceReindex) {
      const { data: existingIndex } = await supabase
        .from('meeting_file_search_index')
        .select('content_hash')
        .eq('meeting_id', meeting.id)
        .eq('user_id', userId)
        .single()

      if (existingIndex?.content_hash === contentHash) {
        return { success: true, message: 'Already indexed with same content' }
      }
    }

    // Update status to indexing
    await supabase
      .from('meeting_file_search_index')
      .upsert({
        meeting_id: meeting.id,
        user_id: userId,
        org_id: orgId,
        store_name: storeName,
        status: 'indexing',
        content_hash: contentHash
      }, { onConflict: 'meeting_id,user_id' })

    // Upload to File Search
    const fileName = await uploadToFileSearchStore(
      storeName,
      meeting.id,
      document,
      orgId,
      geminiApiKey
    )

    // Update status to indexed
    await supabase
      .from('meeting_file_search_index')
      .update({
        file_name: fileName,
        status: 'indexed',
        indexed_at: new Date().toISOString(),
        error_message: null
      })
      .eq('meeting_id', meeting.id)
      .eq('user_id', userId)

    // Update org store file count
    const { count: indexCount } = await supabase
      .from('meeting_file_search_index')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'indexed')

    await supabase
      .from('org_file_search_stores')
      .update({
        total_files: indexCount || 0,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId)

    // Remove from queue if present
    await supabase
      .from('meeting_index_queue')
      .delete()
      .eq('meeting_id', meeting.id)

    return { success: true, message: 'Successfully indexed' }

  } catch (error) {
    // Update status to failed
    await supabase
      .from('meeting_file_search_index')
      .upsert({
        meeting_id: meeting.id,
        user_id: userId,
        store_name: storeName,
        status: 'failed',
        error_message: error.message
      }, { onConflict: 'meeting_id,user_id' })

    return { success: false, message: error.message }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request
    const { meetingId, meetingIds, forceReindex = false }: RequestBody = await req.json()

    // Get authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine which meetings to index
    const idsToIndex: string[] = []
    if (meetingId) {
      idsToIndex.push(meetingId)
    } else if (meetingIds && meetingIds.length > 0) {
      idsToIndex.push(...meetingIds)
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing meetingId or meetingIds' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's organization
    const orgId = await getUserOrgId(user.id, supabaseClient)
    if (!orgId) {
      return new Response(
        JSON.stringify({ error: 'User is not a member of any organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get or create organization's File Search store
    const { storeName, isNew } = await getOrCreateOrgStore(orgId, supabaseClient, geminiApiKey)

    // Fetch meetings with related data (without ambiguous FK joins)
    const { data: meetings, error: meetingsError } = await supabaseClient
      .from('meetings')
      .select(`
        id,
        title,
        meeting_start,
        duration_minutes,
        transcript_text,
        summary,
        sentiment_score,
        sentiment_reasoning,
        talk_time_rep_pct,
        talk_time_customer_pct,
        company_id,
        primary_contact_id,
        meeting_attendees(name, email, is_external),
        meeting_action_items(id, title, completed)
      `)
      .in('id', idsToIndex)
      .eq('owner_user_id', user.id)

    if (meetingsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch meetings', details: meetingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!meetings || meetings.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No meetings found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch company data separately to avoid FK ambiguity
    const companyIds = [...new Set(meetings.map((m: any) => m.company_id).filter(Boolean))]
    const companyMap = new Map<string, { id: string; name: string }>()
    if (companyIds.length > 0) {
      const { data: companies } = await supabaseClient
        .from('companies')
        .select('id, name')
        .in('id', companyIds)
      if (companies) {
        companies.forEach((c: any) => companyMap.set(c.id, c))
      }
    }

    // Fetch contact data separately
    const contactIds = [...new Set(meetings.map((m: any) => m.primary_contact_id).filter(Boolean))]
    const contactMap = new Map<string, { id: string; name: string; email: string }>()
    if (contactIds.length > 0) {
      const { data: contacts } = await supabaseClient
        .from('contacts')
        .select('id, name, email')
        .in('id', contactIds)
      if (contacts) {
        contacts.forEach((c: any) => contactMap.set(c.id, c))
      }
    }

    // Index each meeting
    const results: Array<{ meetingId: string; success: boolean; message: string }> = []

    for (const meeting of meetings) {
      // Attach company and contact data for buildMeetingDocument
      const meetingWithRelations = {
        ...meeting,
        company: meeting.company_id ? companyMap.get(meeting.company_id) : null,
        primary_contact: meeting.primary_contact_id ? contactMap.get(meeting.primary_contact_id) : null,
      }
      if (!meeting.transcript_text || meeting.transcript_text.length < 100) {
        results.push({
          meetingId: meeting.id,
          success: false,
          message: 'Meeting has no transcript or transcript too short'
        })
        continue
      }

      const result = await indexMeeting(
        meetingWithRelations,
        user.id,
        orgId,
        storeName,
        supabaseClient,
        geminiApiKey,
        forceReindex
      )

      results.push({
        meetingId: meeting.id,
        ...result
      })
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        storeName,
        storeCreated: isNew,
        indexed: successCount,
        failed: failCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in meeting-intelligence-index:', error)
    await captureException(error, {
      tags: {
        function: 'meeting-intelligence-index',
        integration: 'gemini',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
