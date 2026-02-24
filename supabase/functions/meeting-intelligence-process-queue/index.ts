/**
 * Meeting Intelligence Process Queue Edge Function
 *
 * Background job processor for indexing meetings to Google File Search.
 * Processes items from the meeting_index_queue table with retry logic.
 *
 * Can be triggered by:
 * - Cron job (pg_cron or external)
 * - Manual invocation
 * - Webhook from other functions
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { captureException } from '../_shared/sentryEdge.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta'
const BATCH_SIZE = 10
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 5000 // 5 seconds

interface MeetingQueueItem {
  id: string
  meeting_id: string
  user_id: string
  priority: number
  attempts: number
  max_attempts: number
  last_attempt_at: string | null
  created_at: string
}

interface CallQueueItem {
  id: string
  call_id: string
  org_id: string
  owner_user_id: string | null
  priority: number
  attempts: number
  max_attempts: number
  last_attempt_at: string | null
  created_at: string
}

type QueueItem =
  | (MeetingQueueItem & { kind: 'meeting' })
  | (CallQueueItem & { kind: 'call' })

interface ProcessResult {
  success: boolean
  source_type: 'meeting' | 'call'
  source_id: string
  message: string
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

interface CallDocument {
  call_id: string
  title: string
  date: string
  direction: string
  status: string | null
  from_number: string | null
  to_number: string | null
  owner_email: string | null
  company_name: string | null
  company_id: string | null
  contact_name: string | null
  contact_id: string | null
  duration_seconds: number | null
  transcript: string
  summary: string | null
}

/**
 * Check if enough time has passed for retry (exponential backoff)
 */
function shouldRetry(item: QueueItem): boolean {
  if (item.attempts >= item.max_attempts) return false
  if (!item.last_attempt_at) return true

  const lastAttempt = new Date(item.last_attempt_at).getTime()
  const backoffMs = BACKOFF_BASE_MS * Math.pow(2, item.attempts)
  const now = Date.now()

  return now - lastAttempt >= backoffMs
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
 * Get or create File Search store for an organization
 */
async function getOrCreateOrgStore(
  orgId: string,
  supabase: any,
  geminiApiKey: string
): Promise<string> {
  // Check existing store for this org
  const { data: existingStore } = await supabase
    .from('org_file_search_stores')
    .select('store_name')
    .eq('org_id', orgId)
    .single()

  if (existingStore?.store_name) {
    console.log(`Using existing store for org ${orgId}: ${existingStore.store_name}`)
    return existingStore.store_name
  }

  // Create new store for organization
  const displayName = `org-${orgId.substring(0, 8)}-meetings-${Date.now()}`

  console.log(`Creating new File Search store: ${displayName}`)

  const response = await fetch(
    `${GEMINI_API_BASE}/fileSearchStores?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`File Search store creation failed - Status: ${response.status}, Body: ${errorText}`)
    throw new Error(`Failed to create File Search store (${response.status}): ${errorText || 'No error details'}`)
  }

  const storeData = await response.json()
  const storeName = storeData.name

  console.log(`Store created: ${storeName}`)

  // Save to database
  await supabase
    .from('org_file_search_stores')
    .insert({
      org_id: orgId,
      store_name: storeName,
      display_name: displayName,
      status: 'active'
    })

  return storeName
}

/**
 * Build meeting document from database record
 */
function buildMeetingDocument(meeting: any): MeetingDocument {
  const attendees: string[] = []
  if (meeting.meeting_attendees) {
    meeting.meeting_attendees.forEach((a: any) => {
      if (a.name) attendees.push(a.name)
      else if (a.email) attendees.push(a.email)
    })
  }

  const actionItems: string[] = []
  if (meeting.meeting_action_items) {
    meeting.meeting_action_items.forEach((item: any) => {
      if (item.title) actionItems.push(item.title)
    })
  }

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

function buildCallDocument(call: any): CallDocument {
  const startedAt = call.started_at ? new Date(call.started_at) : null
  const titleBase = call.direction === 'inbound'
    ? `Inbound call`
    : call.direction === 'outbound'
      ? `Outbound call`
      : 'Call'

  const contactLabel = call.contact?.name || call.contact?.email || null
  const companyLabel = call.company?.name || null

  return {
    call_id: call.id,
    title: companyLabel ? `${titleBase} · ${companyLabel}` : titleBase,
    date: startedAt ? startedAt.toISOString().split('T')[0] : '',
    direction: call.direction || 'unknown',
    status: call.status || null,
    from_number: call.from_number || null,
    to_number: call.to_number || null,
    owner_email: call.owner_email || null,
    company_name: companyLabel,
    company_id: call.company_id || null,
    contact_name: contactLabel,
    contact_id: call.contact_id || null,
    duration_seconds: call.duration_seconds ?? null,
    transcript: call.transcript_text || '',
    summary: call.summary || null
  }
}

async function uploadCallToFileSearch(
  storeName: string,
  callId: string,
  document: CallDocument,
  orgId: string,
  geminiApiKey: string
): Promise<string> {
  const content = JSON.stringify(document, null, 2)
  const displayName = `call-${callId}.json`

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

  // Import file to File Search Store with metadata (reuse meeting filter keys where possible)
  const customMetadata: Array<{ key: string; string_value?: string; numeric_value?: number }> = []

  if (document.company_id) {
    customMetadata.push({ key: 'company_id', string_value: document.company_id })
  }
  if (document.date) {
    customMetadata.push({ key: 'meeting_date', string_value: document.date })
  }

  customMetadata.push({ key: 'has_action_items', string_value: 'false' })
  customMetadata.push({ key: 'source_type', string_value: 'call' })
  customMetadata.push({ key: 'call_id', string_value: callId })
  customMetadata.push({ key: 'org_id', string_value: orgId })

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
 * Upload document to File Search store using two-step process:
 * 1. Upload file to Files API (resumable upload)
 * 2. Import file to File Search Store
 */
async function uploadToFileSearch(
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
 * Process a single queue item
 */
async function processQueueItem(
  item: QueueItem,
  supabase: any,
  geminiApiKey: string
): Promise<ProcessResult> {
  try {
    // Update attempt count
    await supabase
      .from(item.kind === 'call' ? 'call_index_queue' : 'meeting_index_queue')
      .update({
        attempts: item.attempts + 1,
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', item.id)

    // Resolve orgId
    const orgId = item.kind === 'call'
      ? item.org_id
      : await getUserOrgId(item.user_id, supabase)

    if (!orgId) {
      throw new Error(`Unable to resolve organization for queue item`)
    }

    // Get or create store for organization
    const storeName = await getOrCreateOrgStore(orgId, supabase, geminiApiKey)

    // -------------------------------
    // CALLS
    // -------------------------------
    if (item.kind === 'call') {
      // Fetch call data
      const { data: call, error: callError } = await supabase
        .from('calls')
        .select(`
          id,
          org_id,
          direction,
          status,
          started_at,
          duration_seconds,
          from_number,
          to_number,
          owner_user_id,
          owner_email,
          company_id,
          contact_id,
          transcript_text,
          summary
        `)
        .eq('id', item.call_id)
        .single()

      if (callError || !call) {
        throw new Error(`Call not found: ${callError?.message || 'Unknown error'}`)
      }

      // Fetch company separately
      let company: { id: string; name: string } | null = null
      if (call.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('id, name')
          .eq('id', call.company_id)
          .single()
        company = companyData
      }

      // Fetch contact separately
      let contact: { id: string; name: string; email: string } | null = null
      if (call.contact_id) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('id, name, email')
          .eq('id', call.contact_id)
          .single()
        contact = contactData
      }

      const callWithRelations = { ...call, company, contact }

      if (!call.transcript_text || call.transcript_text.length < 100) {
        await supabase
          .from('call_index_queue')
          .delete()
          .eq('id', item.id)

        return {
          success: false,
          source_type: 'call',
          source_id: item.call_id,
          message: 'Call has no transcript or transcript too short - removed from queue'
        }
      }

      const document = buildCallDocument(callWithRelations)

      // content hash
      const contentStr = JSON.stringify(document)
      const encoder = new TextEncoder()
      const data = encoder.encode(contentStr)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const effectiveOwnerId = item.owner_user_id || call.owner_user_id || null

      const { data: existingIndex } = await supabase
        .from('call_file_search_index')
        .select('content_hash')
        .eq('call_id', item.call_id)
        .eq('owner_user_id', effectiveOwnerId)
        .single()

      if (existingIndex?.content_hash === contentHash) {
        await supabase.from('call_index_queue').delete().eq('id', item.id)
        return {
          success: true,
          source_type: 'call',
          source_id: item.call_id,
          message: 'Already indexed with same content'
        }
      }

      await supabase
        .from('call_file_search_index')
        .upsert({
          call_id: item.call_id,
          owner_user_id: effectiveOwnerId,
          org_id: orgId,
          store_name: storeName,
          status: 'indexing',
          content_hash: contentHash
        }, { onConflict: 'call_id,owner_user_id' })

      const fileName = await uploadCallToFileSearch(storeName, item.call_id, document, orgId, geminiApiKey)

      await supabase
        .from('call_file_search_index')
        .update({
          file_name: fileName,
          status: 'indexed',
          indexed_at: new Date().toISOString(),
          error_message: null
        })
        .eq('call_id', item.call_id)
        .eq('owner_user_id', effectiveOwnerId)

      // Update org store file count (meetings + calls)
      const { count: meetingIndexCount } = await supabase
        .from('meeting_file_search_index')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'indexed')

      const { count: callIndexCount } = await supabase
        .from('call_file_search_index')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'indexed')

      await supabase
        .from('org_file_search_stores')
        .update({
          total_files: (meetingIndexCount || 0) + (callIndexCount || 0),
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('org_id', orgId)

      await supabase.from('call_index_queue').delete().eq('id', item.id)

      return {
        success: true,
        source_type: 'call',
        source_id: item.call_id,
        message: 'Successfully indexed'
      }
    }

    // Fetch meeting data (without ambiguous FK joins)
    const { data: meeting, error: meetingError } = await supabase
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
      .eq('id', item.meeting_id)
      .single()

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message || 'Unknown error'}`)
    }

    // Fetch company separately to avoid FK ambiguity
    let company: { id: string; name: string } | null = null
    if (meeting.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', meeting.company_id)
        .single()
      company = companyData
    }

    // Fetch contact separately
    let primaryContact: { id: string; name: string; email: string } | null = null
    if (meeting.primary_contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, name, email')
        .eq('id', meeting.primary_contact_id)
        .single()
      primaryContact = contactData
    }

    // Attach to meeting object for buildMeetingDocument
    const meetingWithRelations = {
      ...meeting,
      company,
      primary_contact: primaryContact,
    }

    // Validate transcript
    if (!meeting.transcript_text || meeting.transcript_text.length < 100) {
      // Remove from queue - no transcript to index
      await supabase
        .from('meeting_index_queue')
        .delete()
        .eq('id', item.id)

      return {
        success: false,
        source_type: 'meeting',
        source_id: item.meeting_id,
        message: 'Meeting has no transcript or transcript too short - removed from queue'
      }
    }

    // Build document
    const document = buildMeetingDocument(meetingWithRelations)

    // Calculate content hash
    const contentStr = JSON.stringify(document)
    const encoder = new TextEncoder()
    const data = encoder.encode(contentStr)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Check if already indexed with same content
    const { data: existingIndex } = await supabase
      .from('meeting_file_search_index')
      .select('content_hash')
      .eq('meeting_id', item.meeting_id)
      .eq('user_id', item.user_id)
      .single()

    if (existingIndex?.content_hash === contentHash) {
      // Already indexed with same content - remove from queue
      await supabase
        .from('meeting_index_queue')
        .delete()
        .eq('id', item.id)

      return {
        success: true,
        source_type: 'meeting',
        source_id: item.meeting_id,
        message: 'Already indexed with same content'
      }
    }

    // Update index status to indexing
    await supabase
      .from('meeting_file_search_index')
      .upsert({
        meeting_id: item.meeting_id,
        user_id: item.user_id,
        org_id: orgId,
        store_name: storeName,
        status: 'indexing',
        content_hash: contentHash
      }, { onConflict: 'meeting_id,user_id' })

    // Upload to File Search
    const fileName = await uploadToFileSearch(storeName, item.meeting_id, document, orgId, geminiApiKey)

    // Update index status to indexed
    await supabase
      .from('meeting_file_search_index')
      .update({
        file_name: fileName,
        status: 'indexed',
        indexed_at: new Date().toISOString(),
        error_message: null
      })
      .eq('meeting_id', item.meeting_id)
      .eq('user_id', item.user_id)

    // Update org store file count (meetings + calls)
    const { count: meetingIndexCount } = await supabase
      .from('meeting_file_search_index')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'indexed')

    const { count: callIndexCount } = await supabase
      .from('call_file_search_index')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'indexed')

    await supabase
      .from('org_file_search_stores')
      .update({
        total_files: (meetingIndexCount || 0) + (callIndexCount || 0),
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId)

    // Remove from queue
    await supabase
      .from('meeting_index_queue')
      .delete()
      .eq('id', item.id)

    return {
      success: true,
      source_type: 'meeting',
      source_id: item.meeting_id,
      message: 'Successfully indexed'
    }

  } catch (error) {
    if (item.kind === 'call') {
      const effectiveOwnerId = item.owner_user_id || null
      await supabase
        .from('call_file_search_index')
        .upsert({
          call_id: item.call_id,
          owner_user_id: effectiveOwnerId,
          store_name: '',
          status: 'failed',
          error_message: error.message
        }, { onConflict: 'call_id,owner_user_id' })

      if (item.attempts + 1 >= item.max_attempts) {
        await supabase
          .from('call_index_queue')
          .update({ error_message: `Max attempts reached: ${error.message}` })
          .eq('id', item.id)
      }

      return {
        success: false,
        source_type: 'call',
        source_id: item.call_id,
        message: error.message
      }
    }

    // Meeting failure
    await supabase
      .from('meeting_file_search_index')
      .upsert({
        meeting_id: item.meeting_id,
        user_id: item.user_id,
        store_name: '',
        status: 'failed',
        error_message: error.message
      }, { onConflict: 'meeting_id,user_id' })

    if (item.attempts + 1 >= item.max_attempts) {
      await supabase
        .from('meeting_index_queue')
        .update({ error_message: `Max attempts reached: ${error.message}` })
        .eq('id', item.id)
    }

    return {
      success: false,
      source_type: 'meeting',
      source_id: item.meeting_id,
      message: error.message
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse optional parameters
    let userId: string | null = null
    let limit = BATCH_SIZE

    try {
      const body = await req.json()
      userId = body.userId || null
      limit = Math.min(body.limit || BATCH_SIZE, 50)
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Create service role client for queue processing
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch queue items (meetings + calls)
    let meetingQuery = supabaseClient
      .from('meeting_index_queue')
      .select('*')
      .lt('attempts', MAX_ATTEMPTS)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit)

    if (userId) {
      meetingQuery = meetingQuery.eq('user_id', userId)
    }

    let callQuery = supabaseClient
      .from('call_index_queue')
      .select('*')
      .lt('attempts', MAX_ATTEMPTS)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit)

    if (userId) {
      callQuery = callQuery.eq('owner_user_id', userId)
    }

    const [{ data: meetingItems, error: meetingErr }, { data: callItems, error: callErr }] = await Promise.all([
      meetingQuery,
      callQuery
    ])

    if (meetingErr || callErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch queue', details: meetingErr?.message || callErr?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const queueItems: QueueItem[] = [
      ...((meetingItems || []).map((i: any) => ({ ...i, kind: 'meeting' }))),
      ...((callItems || []).map((i: any) => ({ ...i, kind: 'call' })))
    ]
      .sort((a: any, b: any) => {
        // Higher priority first, then oldest first
        const p = (b.priority || 0) - (a.priority || 0)
        if (p !== 0) return p
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
      .slice(0, limit)

    if (queueItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items in queue',
          processed: 0,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter items eligible for retry
    const eligibleItems = queueItems.filter(shouldRetry)

    if (eligibleItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items eligible for processing (all in backoff)',
          queued: queueItems.length,
          processed: 0,
          results: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process items
    const results: ProcessResult[] = []

    for (const item of eligibleItems) {
      const result = await processQueueItem(item, supabaseClient, geminiApiKey)
      results.push(result)

      // Small delay between items to avoid rate limiting
      if (results.length < eligibleItems.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} items`,
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in meeting-intelligence-process-queue:', error)
    await captureException(error, {
      tags: {
        function: 'meeting-intelligence-process-queue',
        integration: 'gemini',
      },
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
