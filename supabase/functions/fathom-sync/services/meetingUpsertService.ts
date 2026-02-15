/**
 * Meeting Upsert Service
 *
 * Handles the complex meeting upsert logic with fallback strategies
 * for different database constraint configurations.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  buildEmbedUrl,
  normalizeInviteesType,
  generatePlaceholderThumbnail,
} from './helpers.ts'

/**
 * Check if an error is an HTML gateway error (e.g., Cloudflare 500)
 */
function isHtmlGatewayError(error: any): boolean {
  const message = String(error?.message || '')
  return (
    message.includes('<html>') ||
    message.includes('<!DOCTYPE') ||
    message.includes('Internal Server Error') ||
    message.includes('502 Bad Gateway') ||
    message.includes('503 Service Unavailable') ||
    message.includes('504 Gateway Timeout')
  )
}

/**
 * Parse error message for better user feedback
 */
function parseErrorMessage(error: any): string {
  const rawMessage = String(error?.message || error || 'Unknown error')

  // If it's an HTML error, return a user-friendly message
  if (isHtmlGatewayError(error)) {
    return 'Database temporarily unavailable. Please try again.'
  }

  // If message is too long (likely contains HTML), truncate
  if (rawMessage.length > 200) {
    return rawMessage.substring(0, 200) + '... (truncated)'
  }

  return rawMessage
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface MeetingUpsertInput {
  call: any
  orgId: string | null
  ownerUserId: string
  ownerEmail: string | null
  fathomUserId: string
  thumbnailUrl: string | null
  existingThumbnailStatus: string | null
  summaryText: string | null
  skipThumbnails: boolean
  skipTranscriptFetch: boolean
  markAsHistorical: boolean
}

export interface MeetingUpsertResult {
  meeting: any
  meetingData: Record<string, any>
  embedUrl: string | null
}

/**
 * Prepare meeting data for database upsert
 */
export function prepareMeetingData(input: MeetingUpsertInput): {
  meetingData: Record<string, any>
  embedUrl: string | null
  durationMinutes: number
} {
  const { call, orgId, ownerUserId, ownerEmail, fathomUserId, thumbnailUrl, existingThumbnailStatus, summaryText, skipThumbnails, skipTranscriptFetch, markAsHistorical } = input

  // Calculate duration — prefer Fathom's native duration field (seconds), fallback to time diff
  let durationMinutes = 0
  if (call.duration && typeof call.duration === 'number' && call.duration > 0) {
    durationMinutes = Math.round(call.duration / 60)
  } else {
    const startTime = new Date(call.start_time || call.recording_start_time || call.scheduled_start_time)
    const endTime = new Date(call.end_time || call.recording_end_time || call.scheduled_end_time)
    const diff = endTime.getTime() - startTime.getTime()
    if (!isNaN(diff) && diff > 0) {
      durationMinutes = Math.round(diff / (1000 * 60))
    }
  }

  // Compute derived fields
  const embedUrl = buildEmbedUrl(call.share_url, call.recording_id)

  // Resolve a stable recording identifier
  const recordingIdRaw = call?.recording_id ?? call?.id ?? call?.recordingId ?? null

  // Determine initial processing statuses
  const initialThumbnailStatus = existingThumbnailStatus === 'complete'
    ? 'complete'
    : skipThumbnails
      ? 'pending'
      : (thumbnailUrl && !thumbnailUrl.includes('dummyimage.com') ? 'complete' : 'pending')

  const initialTranscriptStatus = skipTranscriptFetch ? 'pending' : 'processing'
  const initialSummaryStatus = skipTranscriptFetch
    ? 'pending'
    : (summaryText ? 'complete' : 'processing')

  // Map to meetings table schema
  const meetingData: Record<string, any> = {
    org_id: orgId,
    owner_user_id: ownerUserId,
    fathom_recording_id: recordingIdRaw ? String(recordingIdRaw) : null,
    fathom_user_id: fathomUserId,
    title: call.title || call.meeting_title,
    meeting_start: call.start_time || call.recording_start_time || call.scheduled_start_time,
    meeting_end: call.end_time || call.recording_end_time || call.scheduled_end_time,
    duration_minutes: durationMinutes,
    owner_email: ownerEmail || call.recorded_by?.email || call.host_email || null,
    team_name: call.recorded_by?.team || null,
    share_url: call.share_url,
    calls_url: call.url,
    transcript_doc_url: call.transcript || null,
    sentiment_score: null,
    coach_summary: null,
    talk_time_rep_pct: null,
    talk_time_customer_pct: null,
    talk_time_judgement: null,
    fathom_embed_url: embedUrl,
    thumbnail_url: thumbnailUrl || generatePlaceholderThumbnail(call.title),
    thumbnail_status: initialThumbnailStatus,
    transcript_status: initialTranscriptStatus,
    summary_status: initialSummaryStatus,
    fathom_created_at: call.created_at || null,
    transcript_language: call.transcript_language || 'en',
    calendar_invitees_type: normalizeInviteesType(
      call.calendar_invitees_domains_type || call.calendar_invitees_type
    ),
    last_synced_at: new Date().toISOString(),
    sync_status: 'synced',
    is_historical_import: markAsHistorical,
  }

  if (summaryText) {
    meetingData.summary = summaryText
  }

  return { meetingData, embedUrl, durationMinutes }
}

/**
 * Check for existing meeting thumbnail to preserve during re-sync
 */
export async function getExistingThumbnail(
  supabase: SupabaseClient,
  orgId: string | null,
  recordingId: string | number | null
): Promise<{ thumbnailUrl: string | null; thumbnailStatus: string | null }> {
  if (!recordingId) {
    return { thumbnailUrl: null, thumbnailStatus: null }
  }

  try {
    const lookupQuery = orgId
      ? supabase.from('meetings').select('thumbnail_url, thumbnail_status').eq('org_id', orgId).eq('fathom_recording_id', String(recordingId)).maybeSingle()
      : supabase.from('meetings').select('thumbnail_url, thumbnail_status').eq('fathom_recording_id', String(recordingId)).maybeSingle()

    const { data: existingMeeting } = await lookupQuery

    if (existingMeeting?.thumbnail_url && !existingMeeting.thumbnail_url.includes('dummyimage.com')) {
      console.log(`🖼️  Preserving existing thumbnail for recording ${recordingId}: ${existingMeeting.thumbnail_url.substring(0, 60)}...`)
      return {
        thumbnailUrl: existingMeeting.thumbnail_url,
        thumbnailStatus: existingMeeting.thumbnail_status,
      }
    }
  } catch (lookupErr) {
    console.warn(`⚠️  Could not check for existing thumbnail: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`)
  }

  return { thumbnailUrl: null, thumbnailStatus: null }
}

/**
 * Upsert meeting with fallback strategies for different DB constraint configurations
 *
 * Strategy order:
 * 1. Try org-scoped constraint: (org_id, fathom_recording_id)
 * 2. Fallback to legacy constraint: (fathom_recording_id)
 * 3. Fallback to manual find-then-update/insert
 *
 * Includes retry logic for transient gateway errors (Cloudflare 500, etc.)
 */
export async function upsertMeeting(
  supabase: SupabaseClient,
  meetingData: Record<string, any>,
  orgId: string | null
): Promise<{ meeting: any; error: any }> {
  const MAX_RETRIES = 3
  const INITIAL_DELAY_MS = 1000

  const upsertWithConflict = async (onConflict: string) => {
    return await supabase
      .from('meetings')
      .upsert(meetingData, { onConflict })
      .select()
      .single()
  }

  // Retry wrapper for gateway errors
  const upsertWithRetry = async (onConflict: string): Promise<{ data: any; error: any }> => {
    let lastError: any = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data, error } = await upsertWithConflict(onConflict)

      // Success - return immediately
      if (!error) {
        return { data, error: null }
      }

      // Check if it's a retryable gateway error
      if (isHtmlGatewayError(error)) {
        lastError = error
        console.warn(
          `[meeting-upsert] Gateway error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${INITIAL_DELAY_MS * Math.pow(2, attempt)}ms...`
        )
        await sleep(INITIAL_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      // Non-retryable error - return immediately
      return { data, error }
    }

    // All retries exhausted
    console.error('[meeting-upsert] All retries exhausted for gateway error')
    return { data: null, error: lastError }
  }

  // Try org-scoped constraint first (with retries for gateway errors)
  let { data: meeting, error: meetingError } = await upsertWithRetry('org_id,fathom_recording_id')

  // Check if constraint doesn't exist - try legacy constraint
  if (meetingError && isConstraintMissingError(meetingError)) {
    console.warn(
      `[meeting-upsert] Org-scoped constraint not found; retrying with fathom_recording_id only (org_id=${orgId || 'null'})`
    )
    ;({ data: meeting, error: meetingError } = await upsertWithRetry('fathom_recording_id'))
  }

  // If still constraint error, do manual upsert
  if (meetingError && isConstraintMissingError(meetingError)) {
    const result = await manualUpsert(supabase, meetingData, orgId)
    meeting = result.meeting
    meetingError = result.error
  }

  // Parse error message for better user feedback
  if (meetingError) {
    meetingError = {
      ...meetingError,
      message: parseErrorMessage(meetingError),
      originalMessage: meetingError.message
    }
  }

  return { meeting, error: meetingError }
}

/**
 * Check if error is a missing constraint error
 */
function isConstraintMissingError(error: any): boolean {
  return (
    error.code === '42P10' ||
    String(error.message || '').toLowerCase().includes('on conflict specification') ||
    String(error.message || '').toLowerCase().includes('no unique')
  )
}

/**
 * Manual upsert fallback when no unique constraints exist
 * Includes retry logic for transient gateway errors
 */
async function manualUpsert(
  supabase: SupabaseClient,
  meetingData: Record<string, any>,
  orgId: string | null
): Promise<{ meeting: any; error: any }> {
  const MAX_RETRIES = 3
  const INITIAL_DELAY_MS = 1000

  const executeWithRetry = async <T>(
    operation: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> => {
    let lastError: any = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = await operation()

      if (!result.error) {
        return result
      }

      if (isHtmlGatewayError(result.error)) {
        lastError = result.error
        console.warn(
          `[meeting-upsert] Gateway error in manual upsert (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`
        )
        await sleep(INITIAL_DELAY_MS * Math.pow(2, attempt))
        continue
      }

      return result
    }

    return { data: null, error: lastError }
  }

  try {
    const recordingId = meetingData.fathom_recording_id as string | null
    if (!recordingId) {
      throw new Error('Missing recording_id in payload (cannot upsert meeting)')
    }

    console.log(`[meeting-upsert] Using manual find-then-upsert for recording ${recordingId}`)

    // Try to find existing meeting (with retry)
    let existing: any = null
    if (orgId) {
      const { data: ex, error: findErr } = await executeWithRetry(() =>
        supabase
          .from('meetings')
          .select('id')
          .eq('org_id', orgId)
          .eq('fathom_recording_id', recordingId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
      if (findErr) throw findErr
      existing = ex
    } else {
      const { data: ex, error: findErr } = await executeWithRetry(() =>
        supabase
          .from('meetings')
          .select('id')
          .eq('fathom_recording_id', recordingId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
      if (findErr) throw findErr
      existing = ex
    }

    if (existing?.id) {
      const { data: updated, error: updateErr } = await executeWithRetry(() =>
        supabase
          .from('meetings')
          .update(meetingData)
          .eq('id', existing.id)
          .select()
          .single()
      )
      if (updateErr) throw updateErr
      return { meeting: updated, error: null }
    } else {
      const { data: inserted, error: insertErr } = await executeWithRetry(() =>
        supabase
          .from('meetings')
          .insert(meetingData)
          .select()
          .single()
      )
      if (insertErr) throw insertErr
      return { meeting: inserted, error: null }
    }
  } catch (fallbackErr) {
    console.error('[meeting-upsert] Manual upsert fallback failed:', parseErrorMessage(fallbackErr))
    return { meeting: null, error: { message: parseErrorMessage(fallbackErr), originalError: fallbackErr } }
  }
}

/**
 * Seed default call types for an org on first sync
 */
export async function seedOrgCallTypesIfNeeded(
  supabase: SupabaseClient,
  orgId: string | null
): Promise<void> {
  if (!orgId) return

  try {
    const { data: existingCallTypes, error: checkError } = await supabase
      .from('org_call_types')
      .select('id')
      .eq('org_id', orgId)
      .limit(1)

    if (!checkError && (!existingCallTypes || existingCallTypes.length === 0)) {
      console.log(`🌱 Seeding default call types for org ${orgId}`)
      const { error: seedError } = await supabase.rpc('seed_default_call_types', {
        p_org_id: orgId,
      })

      if (seedError) {
        console.warn(`⚠️  Failed to seed default call types: ${seedError.message}`)
      } else {
        console.log(`✅ Default call types seeded for org ${orgId}`)
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error checking/seeding call types: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Enqueue meeting for background transcript processing
 */
export async function enqueueTranscriptRetry(
  supabase: SupabaseClient,
  meetingId: string,
  ownerUserId: string,
  recordingId: string,
  attemptCount: number = 0
): Promise<void> {
  try {
    const { error: enqueueError } = await supabase
      .rpc('enqueue_transcript_retry', {
        p_meeting_id: meetingId,
        p_user_id: ownerUserId,
        p_recording_id: String(recordingId),
        p_initial_attempt_count: attemptCount,
      })

    if (enqueueError) {
      console.warn(`⚠️  Failed to enqueue background job for meeting ${meetingId}: ${enqueueError.message}`)
    } else {
      console.log(`📋 Queued meeting ${meetingId} for background transcript processing`)
    }
  } catch (err) {
    console.warn(`⚠️  Error queueing meeting ${meetingId} for background:`, err instanceof Error ? err.message : String(err))
  }
}
