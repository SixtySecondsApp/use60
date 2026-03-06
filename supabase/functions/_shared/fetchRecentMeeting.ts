/**
 * Shared helper: fetch the most recent meeting from a notetaker integration.
 *
 * Supported sources: fathom, fireflies
 * JustCall: TODO — deferred to phase 2
 *
 * Usage:
 *   import { fetchRecentMeeting } from '../_shared/fetchRecentMeeting.ts'
 *   const meeting = await fetchRecentMeeting({ notetaker_source: 'fathom', api_key, org_id })
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecentMeeting {
  transcript: string
  title: string
  date: string       // ISO 8601
  duration: number   // minutes
  participants: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const FATHOM_API_BASE = 'https://api.fathom.ai/external/v1'
const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql'

/** Minimum word count for a transcript to be considered valid */
const MIN_TRANSCRIPT_WORDS = 200

/** Maximum meetings to try before giving up */
const MAX_CANDIDATES = 3

// ── Fireflies GraphQL ──────────────────────────────────────────────────────

const FIREFLIES_RECENT_QUERY = `
query GetRecentTranscripts($fromDate: DateTime!, $toDate: DateTime!, $limit: Int!) {
  transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, mine: false) {
    id
    title
    date
    duration
    sentences {
      index
      speaker_name
      raw_text
      start_time
    }
    meeting_attendees {
      displayName
      email
    }
  }
}
`

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Count words in a string (rough but sufficient for the 200-word threshold).
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Call the Fireflies GraphQL API.
 */
async function callFirefliesAPI(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(FIREFLIES_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Fireflies API error: ${response.status} — ${text.substring(0, 200)}`)
  }

  const json = await response.json()

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`)
  }

  return json.data
}

/**
 * Convert Fireflies sentence array to a plain-text transcript string.
 * Format mirrors the Fathom transcript convention: "[HH:MM:SS] Speaker: text"
 */
function firefliesSentencesToText(sentences: Array<{
  speaker_name?: string
  raw_text?: string
  start_time?: number
}>): string {
  return sentences
    .map((s) => {
      const text = s.raw_text ?? ''
      const speaker = s.speaker_name ? `${s.speaker_name}: ` : ''
      if (s.start_time != null) {
        const h = Math.floor(s.start_time / 3600)
        const m = Math.floor((s.start_time % 3600) / 60)
        const sec = Math.floor(s.start_time % 60)
        const ts = [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
        return `[${ts}] ${speaker}${text}`
      }
      return `${speaker}${text}`.trim()
    })
    .join('\n')
}

/**
 * Fetch transcript text from Fathom for a given recording ID.
 * Tries Bearer auth first, then X-Api-Key fallback.
 */
async function fathomFetchTranscript(apiKey: string, recordingId: string | number): Promise<string | null> {
  const url = `${FATHOM_API_BASE}/recordings/${recordingId}/transcript`

  // Try Bearer (OAuth tokens) first, fall back to X-Api-Key
  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  })

  if (response.status === 401) {
    response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    })
  }

  if (response.status === 404) return null
  if (!response.ok) return null

  const data = await response.json()

  if (Array.isArray(data?.transcript)) {
    return data.transcript
      .map((seg: { speaker?: { display_name?: string }; text?: string; timestamp?: string }) => {
        const speaker = seg?.speaker?.display_name ? `${seg.speaker.display_name}: ` : ''
        const prefix = seg?.timestamp ? `[${seg.timestamp}] ` : ''
        return `${prefix}${speaker}${seg?.text ?? ''}`.trim()
      })
      .join('\n')
  }

  if (typeof data?.transcript === 'string') return data.transcript
  if (typeof data === 'string') return data

  return null
}

/**
 * Fetch the most recent meetings list from Fathom (up to `limit` items).
 */
async function fathomListMeetings(apiKey: string, limit: number): Promise<Array<{
  id: string
  recording_id?: string | number
  title: string
  start_time: string
  end_time?: string
  duration?: number
  participants?: Array<{ name?: string; email?: string }>
  recording_status?: string
}>> {
  const params = new URLSearchParams({ limit: String(limit) })
  const url = `${FATHOM_API_BASE}/meetings?${params}`

  // Try Bearer first, then X-Api-Key
  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  })

  if (response.status === 401) {
    response = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    })
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Fathom API error: ${response.status} — ${text.substring(0, 200)}`)
  }

  const data = await response.json()

  // Normalise the various response shapes Fathom has used
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.meetings)) return data.meetings
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.calls)) return data.calls

  return []
}

// ── Source implementations ─────────────────────────────────────────────────

/**
 * Fetch the most recent qualifying meeting from Fathom.
 */
async function fetchFromFathom(apiKey: string): Promise<RecentMeeting | null> {
  const candidates = await fathomListMeetings(apiKey, MAX_CANDIDATES)

  for (const meeting of candidates) {
    try {
      const recordingId = meeting.recording_id ?? meeting.id
      const transcript = await fathomFetchTranscript(apiKey, recordingId)

      if (!transcript || wordCount(transcript) < MIN_TRANSCRIPT_WORDS) {
        console.log(
          `[fetchRecentMeeting:fathom] Skipping meeting "${meeting.title}" — transcript too short or missing`
        )
        continue
      }

      const participants: string[] = (meeting.participants ?? [])
        .map((p) => p.name || p.email || '')
        .filter(Boolean)

      // Calculate duration in minutes from start/end if not provided directly
      let duration = meeting.duration ?? 0
      if (!duration && meeting.start_time && meeting.end_time) {
        const startMs = new Date(meeting.start_time).getTime()
        const endMs = new Date(meeting.end_time).getTime()
        if (!isNaN(startMs) && !isNaN(endMs)) {
          duration = Math.round((endMs - startMs) / 60_000)
        }
      }

      return {
        transcript,
        title: meeting.title ?? 'Untitled meeting',
        date: meeting.start_time,
        duration,
        participants,
      }
    } catch (err) {
      console.error(
        `[fetchRecentMeeting:fathom] Error processing meeting "${meeting.title}":`,
        err instanceof Error ? err.message : String(err)
      )
      // Try next candidate
    }
  }

  return null
}

/**
 * Fetch the most recent qualifying meeting from Fireflies.
 */
async function fetchFromFireflies(apiKey: string): Promise<RecentMeeting | null> {
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const variables = {
    fromDate: ninetyDaysAgo.toISOString(),
    toDate: now.toISOString(),
    limit: MAX_CANDIDATES,
  }

  const data = await callFirefliesAPI(apiKey, FIREFLIES_RECENT_QUERY, variables) as {
    transcripts?: Array<{
      id: string
      title?: string
      date?: number
      duration?: number
      sentences?: Array<{ speaker_name?: string; raw_text?: string; start_time?: number }>
      meeting_attendees?: Array<{ displayName?: string; email?: string }>
    }>
  }

  const transcripts = data?.transcripts ?? []

  for (const t of transcripts) {
    try {
      const sentences = t.sentences ?? []
      const transcript = firefliesSentencesToText(sentences)

      if (!transcript || wordCount(transcript) < MIN_TRANSCRIPT_WORDS) {
        console.log(
          `[fetchRecentMeeting:fireflies] Skipping transcript "${t.title}" — transcript too short or missing`
        )
        continue
      }

      const participants: string[] = (t.meeting_attendees ?? [])
        .map((a) => a.displayName || a.email || '')
        .filter(Boolean)

      // Fireflies date is epoch milliseconds
      const date = t.date ? new Date(t.date).toISOString() : new Date().toISOString()

      return {
        transcript,
        title: t.title ?? 'Untitled meeting',
        date,
        duration: t.duration ?? 0,
        participants,
      }
    } catch (err) {
      console.error(
        `[fetchRecentMeeting:fireflies] Error processing transcript "${t.title}":`,
        err instanceof Error ? err.message : String(err)
      )
      // Try next candidate
    }
  }

  return null
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the most recent meeting from the specified notetaker integration.
 *
 * Tries up to 3 meetings from the integration to find one with a valid
 * transcript (>= 200 words). Returns null on any error or when no qualifying
 * meeting is found.
 *
 * @param params.notetaker_source - 'fathom' | 'fireflies'
 * @param params.api_key          - OAuth access token or API key for the integration
 * @param params.org_id           - Organisation ID (for logging; not sent to external APIs)
 */
export async function fetchRecentMeeting(params: {
  notetaker_source: 'fathom' | 'fireflies'
  api_key: string
  org_id: string
}): Promise<RecentMeeting | null> {
  const { notetaker_source, api_key, org_id } = params

  console.log(`[fetchRecentMeeting] source=${notetaker_source} org=${org_id}`)

  try {
    switch (notetaker_source) {
      case 'fathom':
        return await fetchFromFathom(api_key)

      case 'fireflies':
        return await fetchFromFireflies(api_key)

      // TODO: JustCall — deferred to phase 2
      default: {
        const _exhaustive: never = notetaker_source
        console.warn(`[fetchRecentMeeting] Unknown notetaker source: ${_exhaustive}`)
        return null
      }
    }
  } catch (err) {
    console.error(
      `[fetchRecentMeeting] Unhandled error for source=${notetaker_source} org=${org_id}:`,
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}
