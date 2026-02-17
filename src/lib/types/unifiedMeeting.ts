/**
 * Unified Meeting Types
 *
 * Normalizes data from both the `meetings` table (Fathom/Fireflies/Voice)
 * and the `recordings` table (60 Notetaker) into a single type for
 * display in the unified meetings list.
 */

import type { RecordingStatus, MeetingPlatform, RecordingSpeaker } from './meetingBaaS'

// ============================================================================
// Types
// ============================================================================

export type UnifiedSource = 'fathom' | 'fireflies' | 'voice' | '60_notetaker'

export interface UnifiedMeeting {
  // Identity
  id: string
  source: UnifiedSource
  sourceTable: 'meetings' | 'recordings'

  // Core fields (normalized)
  title: string
  date: string // ISO string
  durationMinutes: number | null

  // Display
  companyName: string | null
  ownerEmail: string | null
  thumbnailUrl: string | null
  summary: string | null

  // AI Metrics
  sentimentScore: number | null
  coachRating: number | null // Normalized 0-10
  talkTimeRepPct: number | null
  talkTimeJudgement: 'good' | 'high' | 'low' | null

  // Meeting type (Fathom/Fireflies only)
  meetingType: string | null

  // Recording status (60 Notetaker only)
  status: RecordingStatus | null
  platform: MeetingPlatform | null
  provider: string | null

  // Processing status (meetings only)
  thumbnailStatus: string | null
  transcriptStatus: string | null
  summaryStatus: string | null

  // Tasks
  openTaskCount: number

  // Recording-specific
  recordingS3Key: string | null
  hitlRequired: boolean
  speakers: RecordingSpeaker[] | null

  // Navigation
  detailPath: string

  // External links (Fathom)
  shareUrl: string | null
  fathomRecordingId: string | null
}

// ============================================================================
// Meeting interface (matches the shape from MeetingsList query)
// ============================================================================

export interface MeetingRow {
  id: string
  fathom_recording_id: string
  title: string
  share_url: string
  calls_url: string
  meeting_start: string
  meeting_end: string
  duration_minutes: number
  owner_user_id: string
  owner_email: string
  team_name: string
  company_id: string | null
  primary_contact_id: string | null
  summary: string
  transcript_doc_url: string | null
  thumbnail_url: string | null
  sentiment_score: number | null
  coach_rating: number | null
  talk_time_rep_pct: number | null
  talk_time_customer_pct: number | null
  talk_time_judgement: string | null
  next_actions_count: number | null
  meeting_type?: string | null
  classification_confidence?: number | null
  source_type?: 'fathom' | 'voice' | '60_notetaker'
  voice_recording_id?: string | null
  provider?: string
  thumbnail_status?: string
  transcript_status?: string
  summary_status?: string
  company?: {
    name: string
    domain: string
  }
  action_items?: {
    completed: boolean
  }[]
  tasks?: {
    status: string
  }[]
}

// ============================================================================
// Adapter Functions
// ============================================================================

export function meetingToUnified(m: MeetingRow): UnifiedMeeting {
  const source: UnifiedSource =
    m.source_type === 'voice'
      ? 'voice'
      : m.provider === 'fireflies'
        ? 'fireflies'
        : 'fathom'

  return {
    id: m.id,
    source,
    sourceTable: 'meetings',
    title: m.title || 'Untitled Meeting',
    date: m.meeting_start,
    durationMinutes: m.duration_minutes,
    companyName: m.company?.name || null,
    ownerEmail: m.owner_email || null,
    thumbnailUrl: m.thumbnail_url,
    summary: m.summary,
    sentimentScore: m.sentiment_score,
    coachRating: m.coach_rating, // already 0-10
    talkTimeRepPct: m.talk_time_rep_pct,
    talkTimeJudgement: (m.talk_time_judgement as 'good' | 'high' | 'low' | null) || null,
    meetingType: m.meeting_type || null,
    status: null,
    platform: null,
    provider: m.provider || null,
    thumbnailStatus: m.thumbnail_status || null,
    transcriptStatus: m.transcript_status || null,
    summaryStatus: m.summary_status || null,
    openTaskCount: m.tasks?.filter(t => t.status !== 'completed').length || 0,
    recordingS3Key: null,
    hitlRequired: false,
    speakers: null,
    detailPath: `/meetings/${m.id}`,
    shareUrl: m.share_url,
    fathomRecordingId: m.fathom_recording_id,
  }
}

export function recordingToUnified(r: any): UnifiedMeeting {
  return {
    id: r.id,
    source: '60_notetaker',
    sourceTable: 'recordings',
    title: r.meeting_title || 'Untitled Recording',
    date: r.meeting_start_time || r.created_at,
    durationMinutes: r.meeting_duration_seconds ? Math.round(r.meeting_duration_seconds / 60) : null,
    companyName: null,
    ownerEmail: null,
    thumbnailUrl: r.thumbnail_url || null,
    summary: r.summary || null,
    sentimentScore: r.sentiment_score ?? null,
    coachRating: r.coach_rating != null ? Math.round(r.coach_rating / 10) : null, // normalize 0-100 to 0-10
    talkTimeRepPct: r.talk_time_rep_pct ?? null,
    talkTimeJudgement: r.talk_time_judgement || null,
    meetingType: null,
    status: r.status || null,
    platform: r.meeting_platform || null,
    provider: null,
    thumbnailStatus: null,
    transcriptStatus: null,
    summaryStatus: null,
    openTaskCount: 0,
    recordingS3Key: r.recording_s3_key || null,
    hitlRequired: r.hitl_required || false,
    speakers: r.speakers || null,
    detailPath: `/meetings/recordings/${r.id}`,
    shareUrl: null,
    fathomRecordingId: null,
  }
}
