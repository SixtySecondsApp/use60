/**
 * Phase 4: Normalized Meeting Data Types
 *
 * Union of all fields any meeting provider can supply.
 * Adapters transform provider-specific data into this shape;
 * meetingWriter.ts consumes it for database writes.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Provider Enum ────────────────────────────────────────────────────
export type MeetingProvider = 'fathom' | 'fireflies' | '60_notetaker'

// ── Participant ──────────────────────────────────────────────────────
export interface NormalizedParticipant {
  name: string
  email?: string              // null for speakers identified by name only
  isExternal?: boolean        // null = let writer determine via domain comparison
  isHost?: boolean
  role?: string               // 'attendee' | 'organizer' | 'speaker' | 'host'
}

// ── Action Item ──────────────────────────────────────────────────────
// Canonical shape — maps 1:1 to meeting_action_items table columns.
// All adapters MUST normalize to these column names.
export interface NormalizedActionItem {
  title: string               // REQUIRED (no 'description' column exists)
  assignee_name?: string      // NOT 'assignee'
  assignee_email?: string
  deadline_at?: string        // ISO timestamp, NOT 'due_date'
  priority?: 'high' | 'medium' | 'low'
  category?: string           // 'follow_up'|'email'|'meeting'|'proposal'|'demo'|'call'|'general'
  ai_generated?: boolean
  ai_confidence?: number      // 0.0-1.0, NOT 'confidence'
  needs_review?: boolean
  completed?: boolean
  synced_to_task?: boolean    // always false on creation
  timestamp_seconds?: number
  playback_url?: string
}

// ── AI Analysis ──────────────────────────────────────────────────────
export interface NormalizedAIAnalysis {
  sentiment_score?: number            // -1.0 to 1.0
  sentiment_reasoning?: string
  talk_time_rep_pct?: number          // 0-100
  talk_time_customer_pct?: number     // 0-100
  talk_time_judgement?: string
  coach_rating?: number               // ALWAYS 1-10 scale
  coach_summary?: string              // JSON string or plain text
  call_type_id?: string
  call_type_confidence?: number
  call_type_reasoning?: string
}

// ── Main Normalized Shape ────────────────────────────────────────────
export interface NormalizedMeetingData {
  // === Identity (required) ===
  provider: MeetingProvider
  owner_user_id: string
  org_id: string | null

  // === Dedup key ===
  external_id?: string                // Fireflies transcript ID / generic
  fathom_recording_id?: string        // Fathom-specific recording ID

  // === Core meeting fields ===
  title?: string
  meeting_start?: string              // ISO timestamp
  meeting_end?: string                // ISO timestamp
  duration_minutes?: number
  owner_email?: string
  summary?: string
  transcript_text?: string
  transcript_json?: unknown           // structured transcript (60 Notetaker)

  // === Status fields ===
  source_type?: string                // 'fathom' | 'voice' | '60_notetaker'
  sync_status?: string                // 'synced' | 'pending' | 'error'
  transcript_status?: string          // 'pending' | 'processing' | 'complete'
  summary_status?: string             // 'pending' | 'processing' | 'complete'
  processing_status?: string          // 60 Notetaker specific
  last_synced_at?: string

  // === Fathom-specific ===
  fathom_user_id?: string
  team_name?: string
  share_url?: string
  calls_url?: string
  transcript_doc_url?: string
  fathom_embed_url?: string
  thumbnail_url?: string
  thumbnail_status?: string
  fathom_created_at?: string
  transcript_language?: string
  calendar_invitees_type?: string
  is_historical_import?: boolean

  // === 60 Notetaker-specific ===
  recording_id?: string               // UUID ref to recordings table
  bot_id?: string
  meeting_platform?: string
  meeting_url?: string
  speakers?: unknown                  // JSONB speaker data
  recording_s3_key?: string
  recording_s3_url?: string

  // === Fireflies-specific ===
  summary_oneliner?: string
  next_steps_oneliner?: string
  next_actions_count?: number
  next_actions_generated_at?: string

  // === AI Analysis ===
  ai?: NormalizedAIAnalysis

  // === CRM / Participants ===
  participants?: NormalizedParticipant[]
  action_items?: NormalizedActionItem[]
}

// ── Write Options ────────────────────────────────────────────────────
export interface WriteMeetingOptions {
  /** If true, skip participant/CRM processing */
  skipParticipants?: boolean
  /** If true, skip action item storage */
  skipActionItems?: boolean
  /** If true, skip queueing for AI search indexing */
  skipIndexing?: boolean
  /** Source tag for company creation (e.g., 'fathom_meeting', 'fireflies_sync') */
  companySource?: string
  /** If true, don't overwrite existing non-null values with null */
  isUpdate?: boolean
}

// ── Write Result ─────────────────────────────────────────────────────
export interface WriteMeetingResult {
  meetingId: string
  isNew: boolean
  primaryContactId?: string
  companyId?: string
  actionItemsStored?: number
  errors: string[]   // non-fatal errors collected
}
