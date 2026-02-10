/**
 * Shared Fathom Transcript Fetching Utilities
 *
 * Purpose: Reusable functions for fetching transcripts from Fathom API
 * Used by: fathom-sync, fathom-transcript-retry, fetch-transcript, backfill-transcripts
 */

// ── Types ──────────────────────────────────────────────────────────

export interface TranscriptSegment {
  speaker_name: string | null
  speaker_email: string | null  // from Fathom's matched_calendar_invitee_email
  text: string
  timestamp: string | null       // raw "HH:MM:SS" from Fathom
  timestamp_seconds: number | null
}

export interface StructuredTranscript {
  text: string                    // formatted "[HH:MM:SS] Speaker: text\n..."
  segments: TranscriptSegment[]
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Parse "HH:MM:SS" or "MM:SS" timestamp string to total seconds
 */
export function parseTimestampToSeconds(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null
  const parts = timestamp.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

/**
 * Format a single transcript segment as text with optional timestamp prefix
 */
function formatSegmentLine(segment: TranscriptSegment): string {
  const prefix = segment.timestamp ? `[${segment.timestamp}] ` : ''
  const speaker = segment.speaker_name ? `${segment.speaker_name}: ` : ''
  return `${prefix}${speaker}${segment.text}`.trim()
}

/**
 * Parse raw Fathom API transcript array into structured segments
 */
function parseTranscriptSegments(rawSegments: any[]): TranscriptSegment[] {
  return rawSegments.map((segment: any) => ({
    speaker_name: segment?.speaker?.display_name || null,
    speaker_email: segment?.speaker?.matched_calendar_invitee_email || null,
    text: segment?.text || '',
    timestamp: segment?.timestamp || null,
    timestamp_seconds: parseTimestampToSeconds(segment?.timestamp),
  }))
}

// ── Raw data fetcher (shared HTTP logic) ───────────────────────────

/**
 * Fetch raw transcript JSON from Fathom API
 * Uses dual authentication: Bearer first, then X-Api-Key fallback
 * Returns the raw parsed JSON or null if not available
 */
async function fetchRawTranscriptData(
  accessToken: string,
  recordingId: string
): Promise<any | null> {
  const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}/transcript`

  console.log(`[fetchTranscript] Fetching transcript for recording ${recordingId}`)
  console.log(`[fetchTranscript] Token preview: ${accessToken.substring(0, 15)}...${accessToken.substring(accessToken.length - 10)}`)

  // Try Bearer token first (for OAuth tokens - most common in our setup)
  let response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  console.log(`[fetchTranscript] Bearer auth response: ${response.status}`)

  // If Bearer fails with 401, log the error and try X-Api-Key
  if (response.status === 401) {
    const errorBody = await response.text()
    console.log(`[fetchTranscript] 401 error body: ${errorBody.substring(0, 200)}`)
    console.log(`[fetchTranscript] Trying X-Api-Key instead...`)

    response = await fetch(url, {
      headers: {
        'X-Api-Key': accessToken,
        'Content-Type': 'application/json',
      },
    })
    console.log(`[fetchTranscript] X-Api-Key auth response: ${response.status}`)
  }

  if (response.status === 404) {
    console.log(`ℹ️  Transcript not yet available for recording ${recordingId} (404)`)
    return null
  }

  if (!response.ok) {
    const errorText = await response.text()
    const errorMsg = `HTTP ${response.status}: ${errorText.substring(0, 200)}`
    console.error(`❌ Failed to fetch transcript for recording ${recordingId}: ${errorMsg}`)
    throw new Error(errorMsg)
  }

  const data = await response.json()

  if (!data) {
    console.log(`⚠️  Empty response for transcript of recording ${recordingId}`)
    return null
  }

  return data
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Fetch transcript from Fathom API as formatted text
 * Now includes timestamps: "[HH:MM:SS] Speaker: text"
 *
 * Return type unchanged (string | null) for backward compatibility.
 */
export async function fetchTranscriptFromFathom(
  accessToken: string,
  recordingId: string
): Promise<string | null> {
  try {
    const data = await fetchRawTranscriptData(accessToken, recordingId)
    if (!data) return null

    // Handle array format (most common)
    if (Array.isArray(data.transcript)) {
      const segments = parseTranscriptSegments(data.transcript)
      return segments.map(formatSegmentLine).join('\n')
    }

    // Handle string format (fallback)
    if (typeof data.transcript === 'string') {
      return data.transcript
    }

    // If data itself is a string
    if (typeof data === 'string') {
      return data
    }

    console.log(`⚠️  Unexpected transcript format for recording ${recordingId}:`, JSON.stringify(data).substring(0, 200))
    return null
  } catch (error) {
    console.error(`❌ Error fetching transcript for recording ${recordingId}:`, error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * Fetch transcript from Fathom API with full structured data
 * Returns both formatted text and individual segments with timestamps + speaker emails.
 * Used by transcriptService for CRM email extraction (Task 2).
 */
export async function fetchTranscriptStructuredFromFathom(
  accessToken: string,
  recordingId: string
): Promise<StructuredTranscript | null> {
  try {
    const data = await fetchRawTranscriptData(accessToken, recordingId)
    if (!data) return null

    // Handle array format (most common)
    if (Array.isArray(data.transcript)) {
      const segments = parseTranscriptSegments(data.transcript)
      return {
        text: segments.map(formatSegmentLine).join('\n'),
        segments,
      }
    }

    // Handle string format (fallback) — no structured data available
    if (typeof data.transcript === 'string') {
      return { text: data.transcript, segments: [] }
    }

    if (typeof data === 'string') {
      return { text: data, segments: [] }
    }

    console.log(`⚠️  Unexpected transcript format for recording ${recordingId}:`, JSON.stringify(data).substring(0, 200))
    return null
  } catch (error) {
    console.error(`❌ Error fetching structured transcript for recording ${recordingId}:`, error instanceof Error ? error.message : String(error))
    return null
  }
}

/**
 * Fetch enhanced summary from Fathom API
 * Uses dual authentication: X-Api-Key first, then Bearer fallback
 */
export async function fetchSummaryFromFathom(
  accessToken: string,
  recordingId: string
): Promise<any | null> {
  try {
    const url = `https://api.fathom.ai/external/v1/recordings/${recordingId}/summary`

    // Try X-Api-Key first (preferred for Fathom API)
    let response = await fetch(url, {
      headers: {
        'X-Api-Key': accessToken,
        'Content-Type': 'application/json',
      },
    })
    // If X-Api-Key fails with 401, try Bearer (for OAuth tokens)
    if (response.status === 401) {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
    }

    if (response.status === 404) {
      console.log(`ℹ️  Fathom summary not yet available for recording ${recordingId} (404)`)
      return null
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`⚠️  Fathom summary API error for recording ${recordingId}: HTTP ${response.status} - ${errorText.substring(0, 200)}`)
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`)
    }

    const data = await response.json()
    console.log(`ℹ️  Fathom summary response keys for recording ${recordingId}:`, Object.keys(data || {}))
    return data
  } catch (error) {
    console.error(`⚠️  fetchSummaryFromFathom error for recording ${recordingId}:`, error instanceof Error ? error.message : String(error))
    return null
  }
}
