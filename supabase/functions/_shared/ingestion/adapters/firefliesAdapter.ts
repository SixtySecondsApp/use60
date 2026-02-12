/**
 * Fireflies Ingestion Adapter
 *
 * Transforms Fireflies GraphQL transcript objects into NormalizedMeetingData.
 */

import type {
  NormalizedMeetingData,
  NormalizedParticipant,
  NormalizedActionItem,
  NormalizedAIAnalysis,
} from '../types.ts'
import type { TranscriptAnalysis } from '../../aiAnalysis.ts'

// ── Input Types ──────────────────────────────────────────────────────

export interface FirefliesAdapterInput {
  transcript: FirefliesTranscript
  userId: string
  orgId: string | null
  ownerEmail?: string | null
  aiAnalysis?: TranscriptAnalysis | null
  nativeActionItemTexts?: string[]     // Raw action items from Fireflies summary
}

export interface FirefliesTranscript {
  id: string
  title: string
  date: number                           // Unix timestamp (ms or s)
  duration?: number                      // minutes
  video_url?: string
  audio_url?: string
  transcript_url?: string
  organizer_email?: string
  host_email?: string
  sentences?: FirefliesSentence[]
  summary?: {
    overview?: string
    short_summary?: string
    action_items?: string[]
    keywords?: string[]
  }
  meeting_attendees?: { email?: string; displayName?: string }[]
  fireflies_users?: string[]            // email array
  speakers?: { name?: string; email?: string }[]
}

interface FirefliesSentence {
  speaker_name?: string
  speaker_id?: number
  text: string
  raw_text?: string
  start_time?: number
  end_time?: number
}

// ── Adapter Function ─────────────────────────────────────────────────

export function adaptFirefliesMeeting(input: FirefliesAdapterInput): NormalizedMeetingData {
  const { transcript, userId, orgId } = input

  const transcriptText = sentencesToText(transcript.sentences)
  const summary = transcript.summary?.overview || transcript.summary?.short_summary || null
  const ownerEmail = input.ownerEmail || transcript.organizer_email || transcript.host_email || null

  const data: NormalizedMeetingData = {
    // Identity
    provider: 'fireflies',
    owner_user_id: userId,
    org_id: orgId,

    // Dedup key
    external_id: transcript.id,

    // Core
    title: transcript.title,
    meeting_start: normalizeFirefliesDate(transcript.date),
    duration_minutes: transcript.duration || undefined,
    share_url: transcript.video_url || transcript.audio_url || transcript.transcript_url || undefined,
    transcript_text: transcriptText || undefined,
    owner_email: ownerEmail || undefined,
    summary: summary || undefined,

    // Status
    transcript_status: 'complete',
    summary_status: summary ? 'complete' : 'pending',
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
  }

  // Participants: from meeting_attendees + fireflies_users + speakers
  const participants = extractParticipants(transcript)
  if (participants.length > 0) {
    data.participants = participants
  }

  // Action items
  const actionItems: NormalizedActionItem[] = []

  // Native Fireflies action items (from summary.action_items)
  const nativeItems = input.nativeActionItemTexts || transcript.summary?.action_items || []
  if (nativeItems.length > 0) {
    for (const text of nativeItems) {
      if (!text || typeof text !== 'string') continue
      const trimmed = text.trim()
      if (!trimmed) continue

      actionItems.push({
        title: trimmed,
        ai_generated: false,
        needs_review: false,
        completed: false,
        synced_to_task: false,
        priority: classifyActionItemPriority(trimmed),
        category: classifyActionItemCategory(trimmed),
      })
    }
  }

  // AI-generated action items (from Claude analysis)
  if (input.aiAnalysis?.actionItems) {
    for (const item of input.aiAnalysis.actionItems) {
      actionItems.push({
        title: item.title,
        assignee_name: item.assignedTo || undefined,
        assignee_email: item.assignedToEmail || undefined,
        deadline_at: item.deadline || undefined,
        category: item.category || 'general',
        priority: item.priority || 'medium',
        ai_generated: true,
        ai_confidence: item.confidence,
        needs_review: item.confidence < 0.8,
        completed: false,
        synced_to_task: false,
        timestamp_seconds: item.timestampSeconds ?? undefined,
      })
    }
  }

  if (actionItems.length > 0) {
    data.action_items = actionItems
  }

  // AI Analysis
  if (input.aiAnalysis) {
    data.ai = adaptAIAnalysis(input.aiAnalysis)
  }

  return data
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractParticipants(transcript: FirefliesTranscript): NormalizedParticipant[] {
  const participantMap = new Map<string, NormalizedParticipant>()

  // Source 1: meeting_attendees (most structured)
  if (transcript.meeting_attendees) {
    for (const att of transcript.meeting_attendees) {
      if (att.email) {
        const key = att.email.toLowerCase()
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: att.displayName || att.email.split('@')[0],
            email: key,
            role: 'attendee',
          })
        }
      }
    }
  }

  // Source 2: fireflies_users (email array)
  if (transcript.fireflies_users) {
    for (const user of transcript.fireflies_users) {
      if (user && user.includes('@')) {
        const key = user.toLowerCase()
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: user.split('@')[0],
            email: key,
            role: 'attendee',
          })
        }
      }
    }
  }

  // Source 3: speakers
  if (transcript.speakers) {
    for (const speaker of transcript.speakers) {
      if (speaker.email) {
        const key = speaker.email.toLowerCase()
        if (!participantMap.has(key)) {
          participantMap.set(key, {
            name: speaker.name || speaker.email.split('@')[0],
            email: key,
            role: 'speaker',
          })
        }
      }
    }
  }

  return Array.from(participantMap.values())
}

function adaptAIAnalysis(analysis: TranscriptAnalysis): NormalizedAIAnalysis {
  const ai: NormalizedAIAnalysis = {
    sentiment_score: analysis.sentiment.score,
    sentiment_reasoning: analysis.sentiment.reasoning,
    talk_time_rep_pct: analysis.talkTime.repPct,
    talk_time_customer_pct: analysis.talkTime.customerPct,
    talk_time_judgement: analysis.talkTime.assessment,
    coach_rating: analysis.coaching.rating,  // already 1-10
    coach_summary: JSON.stringify({
      summary: analysis.coaching.summary,
      strengths: analysis.coaching.strengths,
      improvements: analysis.coaching.improvements,
      evaluationBreakdown: analysis.coaching.evaluationBreakdown,
    }),
  }

  if (analysis.callType) {
    ai.call_type_id = analysis.callType.callTypeId || undefined
    ai.call_type_confidence = analysis.callType.confidence
    ai.call_type_reasoning = analysis.callType.reasoning
  }

  return ai
}

function sentencesToText(sentences?: FirefliesSentence[]): string | null {
  if (!sentences || sentences.length === 0) return null
  return sentences
    .map(s => {
      const speaker = s.speaker_name || `Speaker ${s.speaker_id ?? '?'}`
      return `${speaker}: ${s.text}`
    })
    .join('\n')
}

function normalizeFirefliesDate(date: number): string {
  // Fireflies returns timestamps — could be seconds or milliseconds
  const ms = date > 1e12 ? date : date * 1000
  return new Date(ms).toISOString()
}

function classifyActionItemPriority(text: string): 'high' | 'medium' | 'low' {
  const lower = text.toLowerCase()
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('immediately')) return 'high'
  if (lower.includes('important') || lower.includes('critical')) return 'high'
  return 'medium'
}

function classifyActionItemCategory(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('email') || lower.includes('send')) return 'email'
  if (lower.includes('call') || lower.includes('phone')) return 'call'
  if (lower.includes('meeting') || lower.includes('schedule')) return 'meeting'
  if (lower.includes('proposal') || lower.includes('quote')) return 'proposal'
  if (lower.includes('demo')) return 'demo'
  if (lower.includes('follow up') || lower.includes('follow-up')) return 'follow_up'
  return 'general'
}
