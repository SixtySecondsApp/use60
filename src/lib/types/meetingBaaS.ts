/**
 * MeetingBaaS Integration Types
 *
 * Types for white-labelled meeting recording integration with MeetingBaaS:
 * - Recording rules engine
 * - Bot deployments
 * - Transcript processing
 * - CRM integration
 */

// ============================================================================
// Recording Status Types
// ============================================================================

export type RecordingStatus =
  | 'pending'
  | 'bot_joining'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'failed';

export type BotDeploymentStatus =
  | 'scheduled'
  | 'joining'
  | 'in_meeting'
  | 'leaving'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MeetingPlatform = 'zoom' | 'google_meet' | 'microsoft_teams';

export type DomainMode = 'external_only' | 'internal_only' | 'specific_domains' | 'all';

export type SpeakerIdentificationMethod = 'email_match' | 'ai_inference' | 'manual' | 'unknown';

export type HITLType = 'speaker_confirmation' | 'deal_selection';

// ============================================================================
// Recording Rules
// ============================================================================

export interface RecordingRule {
  id: string;
  org_id: string;
  user_id?: string | null; // NULL = org-wide rule

  // Rule metadata
  name: string;
  is_active: boolean;
  priority: number; // Higher = evaluated first

  // Domain rules
  domain_mode: DomainMode;
  specific_domains?: string[] | null;
  internal_domain?: string | null;

  // Attendee rules
  min_attendee_count: number;
  max_attendee_count?: number | null;

  // Title keyword rules
  title_keywords?: string[] | null;
  title_keywords_exclude?: string[] | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface RecordingRuleInsert {
  org_id: string;
  user_id?: string | null;
  name: string;
  is_active?: boolean;
  priority?: number;
  domain_mode?: DomainMode;
  specific_domains?: string[] | null;
  internal_domain?: string | null;
  min_attendee_count?: number;
  max_attendee_count?: number | null;
  title_keywords?: string[] | null;
  title_keywords_exclude?: string[] | null;
}

export interface RuleEvaluationResult {
  shouldRecord: boolean;
  matchedRule: RecordingRule | null;
  reasons: string[];
}

// ============================================================================
// Recordings
// ============================================================================

export interface TranscriptUtterance {
  speaker_id: number;
  speaker_name?: string;
  speaker_email?: string;
  start: number; // seconds
  end: number;
  text: string;
  confidence?: number;
}

export interface TranscriptData {
  text: string;
  utterances: TranscriptUtterance[];
  speakers?: {
    id: number;
    name?: string;
    email?: string;
    is_internal?: boolean;
  }[];
}

export interface RecordingHighlight {
  timestamp: number; // seconds
  text: string;
  type: 'key_point' | 'decision' | 'action_item' | 'question' | 'objection';
}

export interface RecordingSpeaker {
  speaker_id: number;
  email?: string;
  name?: string;
  is_internal: boolean;
  identification_method: SpeakerIdentificationMethod;
  confidence?: number;
  talk_time_seconds?: number;
  talk_time_percent?: number;
}

export interface CRMContactLink {
  contact_id: string;
  email: string;
  name?: string;
  crm_type: 'hubspot' | 'bullhorn' | 'internal';
}

export interface Recording {
  id: string;
  org_id: string;
  user_id: string;

  // Meeting info
  meeting_platform: MeetingPlatform;
  meeting_url: string;
  meeting_title?: string | null;
  meeting_start_time?: string | null;
  meeting_end_time?: string | null;
  meeting_duration_seconds?: number | null;

  // Calendar link
  calendar_event_id?: string | null;

  // MeetingBaaS references
  bot_id?: string | null;
  meetingbaas_recording_id?: string | null;

  // Storage
  recording_s3_key?: string | null;
  recording_s3_url?: string | null;
  transcript_s3_key?: string | null;

  // Transcript data
  transcript_json?: TranscriptData | null;
  transcript_text?: string | null;

  // AI Analysis
  summary?: string | null;
  highlights?: RecordingHighlight[] | null;
  action_items?: { text: string; assignee?: string; due_date?: string }[] | null;

  // Enhanced AI Analysis (sentiment, talk time, coaching)
  sentiment_score?: number | null; // -1.0 to 1.0
  coach_rating?: number | null; // 0-100 scale
  coach_summary?: string | null;
  talk_time_rep_pct?: number | null;
  talk_time_customer_pct?: number | null;
  talk_time_judgement?: 'good' | 'high' | 'low' | null;

  // Thumbnail
  thumbnail_s3_key?: string | null;
  thumbnail_url?: string | null;

  // Speaker identification
  speakers?: RecordingSpeaker[] | null;
  speaker_identification_method?: SpeakerIdentificationMethod | null;

  // Attendees (stored at deploy time for speaker identification)
  attendees?: Array<{ email: string; name?: string }> | null;

  // CRM links
  crm_contacts?: CRMContactLink[] | null;
  crm_deal_id?: string | null;
  crm_activity_id?: string | null;

  // HITL tracking
  hitl_required: boolean;
  hitl_type?: HITLType | null;
  hitl_data?: Record<string, unknown> | null;
  hitl_resolved_at?: string | null;
  hitl_resolved_by?: string | null;

  // Status
  status: RecordingStatus;
  error_message?: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface RecordingInsert {
  org_id: string;
  user_id: string;
  meeting_platform: MeetingPlatform;
  meeting_url: string;
  meeting_title?: string | null;
  calendar_event_id?: string | null;
  attendees?: Array<{ email: string; name?: string }> | null;
  status?: RecordingStatus;
}

export interface RecordingWithOrg extends Recording {
  organizations?: {
    id: string;
    name: string;
    company_domain?: string;
    recording_settings?: RecordingSettings;
    notification_settings?: NotificationSettings;
  };
}

// ============================================================================
// Bot Deployments
// ============================================================================

export interface BotStatusHistoryEntry {
  status: BotDeploymentStatus;
  timestamp: string;
  details?: string;
}

export interface BotDeployment {
  id: string;
  org_id: string;
  recording_id?: string | null;

  // MeetingBaaS reference
  bot_id: string;

  // Status tracking
  status: BotDeploymentStatus;
  status_history: BotStatusHistoryEntry[];

  // Meeting details
  meeting_url: string;
  scheduled_join_time?: string | null;
  actual_join_time?: string | null;
  leave_time?: string | null;

  // Bot config used
  bot_name?: string | null;
  bot_image_url?: string | null;
  entry_message?: string | null;

  // Errors
  error_code?: string | null;
  error_message?: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Recording Usage
// ============================================================================

export interface RecordingUsage {
  id: string;
  org_id: string;
  period_start: string;
  period_end: string;
  recordings_count: number;
  recordings_limit: number;
  total_duration_seconds: number;
  storage_used_bytes: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Organization Settings
// ============================================================================

export interface RecordingSettings {
  bot_name: string;
  bot_image_url?: string | null;
  entry_message_enabled: boolean;
  entry_message: string;
  default_transcription_provider: 'gladia' | 'meetingbaas';
  recordings_enabled: boolean;
  auto_record_enabled: boolean;
  join_all_meetings: boolean; // When true, record ALL meetings. When false, use custom rules.
  // Auto-join scheduler settings
  auto_record_lead_time_minutes?: number; // Minutes before meeting to join (default: 2)
  auto_record_external_only?: boolean; // Only record meetings with external attendees (default: true)
}

export interface NotificationChannelSettings {
  slack: boolean;
  email: boolean;
  in_app: boolean;
}

export interface NotificationSettings {
  recording_started: NotificationChannelSettings;
  recording_failed: NotificationChannelSettings;
  recording_ready: NotificationChannelSettings;
  hitl_required: NotificationChannelSettings;
}

// ============================================================================
// MeetingBaaS API Types
// ============================================================================

export interface MeetingBaaSBotConfig {
  meeting_url: string;
  bot_name?: string;
  bot_image?: string;
  entry_message?: string;
  recording_mode?: 'speaker_view' | 'gallery_view' | 'audio_only';
  webhook_url: string;
  reserved?: boolean; // Join immediately vs scheduled
  deduplication_key?: string;
}

export interface MeetingBaaSBotResponse {
  id: string;
  status: string;
  meeting_url: string;
  created_at: string;
}

export interface MeetingBaaSRecordingResponse {
  url: string;
  expires_at: string;
}

export interface MeetingBaaSTranscriptResponse {
  text: string;
  utterances: {
    speaker: number;
    start: number;
    end: number;
    text: string;
    confidence?: number;
  }[];
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export type MeetingBaaSWebhookEventType =
  | 'bot.joining'
  | 'bot.in_meeting'
  | 'bot.left'
  | 'bot.failed'
  | 'recording.ready'
  | 'transcript.ready';

export interface MeetingBaaSWebhookEvent {
  id: string;
  type: MeetingBaaSWebhookEventType;
  bot_id: string;
  meeting_url?: string;
  timestamp: string;

  // Event-specific data
  error_code?: string;
  error_message?: string;
  recording_url?: string;
  transcript?: MeetingBaaSTranscriptResponse;
}

export interface WebhookEvent {
  id: string;
  source: string;
  event_type: string;
  event_id?: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  processed_at?: string;
  error_message?: string;
  retry_count: number;
  next_retry_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Calendar Event Integration
// ============================================================================

export interface CalendarEventForRecording {
  id: string;
  external_id: string;
  title: string;
  meeting_url: string | null;
  start_time: string;
  end_time: string;
  attendees: CalendarAttendee[];
  organizer_email?: string;
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface DeployBotRequest {
  meeting_url: string;
  meeting_title?: string;
  calendar_event_id?: string;
  attendees?: CalendarAttendee[];
}

export interface DeployBotResponse {
  success: boolean;
  recording?: Recording;
  bot?: MeetingBaaSBotResponse;
  error?: string;
}

export interface ManualRecordingRequest {
  meeting_url: string;
  meeting_title?: string;
}

export interface ListRecordingsRequest {
  status?: RecordingStatus;
  limit?: number;
  offset?: number;
  start_date?: string;
  end_date?: string;
}

export interface ListRecordingsResponse {
  recordings: Recording[];
  total: number;
  limit: number;
  offset: number;
}

export interface RecordingSearchRequest {
  query: string;
  limit?: number;
  offset?: number;
}

export interface RecordingSearchResult {
  recording: Recording;
  matches: {
    field: string;
    snippet: string;
    timestamp?: number;
  }[];
}

export interface RecordingSearchResponse {
  results: RecordingSearchResult[];
  total: number;
  query: string;
}

// ============================================================================
// Slack Notification Types
// ============================================================================

export interface RecordingStartedNotification {
  meeting_title: string;
  attendees: string[];
  platform: MeetingPlatform;
  recording_id: string;
}

export interface RecordingReadyNotification {
  meeting_title: string;
  duration: string;
  summary: string;
  highlights: RecordingHighlight[];
  action_item_count: number;
  recording_url: string;
  recording_id: string;
}

export interface RecordingFailedNotification {
  meeting_title: string;
  error_message: string;
  recording_id: string;
}

export interface DealSelectionHITLNotification {
  meeting_title: string;
  recording_id: string;
  deals: {
    id: string;
    name: string;
    stage: string;
  }[];
}

export interface SpeakerConfirmationHITLNotification {
  meeting_title: string;
  recording_id: string;
  speakers: {
    speaker_id: number;
    detected_name?: string;
    possible_matches: {
      email: string;
      name: string;
      confidence: number;
    }[];
  }[];
}

// ============================================================================
// Processing Pipeline Types
// ============================================================================

export interface ProcessingPipelineStage {
  stage: 'download' | 'upload_s3' | 'transcribe' | 'identify_speakers' | 'generate_summary' | 'crm_sync' | 'notify';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface ProcessingPipelineState {
  recording_id: string;
  stages: ProcessingPipelineStage[];
  current_stage?: string;
  overall_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  bot_name: '60 Notetaker',
  bot_image_url: null,
  entry_message_enabled: true,
  entry_message: "Hi! I'm here to take notes so {rep_name} can focus on our conversation. 📝",
  default_transcription_provider: 'gladia',
  recordings_enabled: false,
  auto_record_enabled: false,
  join_all_meetings: true, // Default: record all meetings when enabled
  auto_record_lead_time_minutes: 2, // Join 2 minutes before meeting starts
  auto_record_external_only: true, // Only record external meetings by default
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  recording_started: { slack: true, email: false, in_app: true },
  recording_failed: { slack: true, email: true, in_app: true },
  recording_ready: { slack: true, email: false, in_app: true },
  hitl_required: { slack: true, email: false, in_app: true },
};

export const DEFAULT_RECORDINGS_LIMIT = 20;

// ============================================================================
// Error Codes
// ============================================================================

export const RECORDING_ERROR_CODES = {
  LIMIT_REACHED: 'LIMIT_REACHED',
  INVALID_MEETING_URL: 'INVALID_MEETING_URL',
  BOT_JOIN_FAILED: 'BOT_JOIN_FAILED',
  BOT_KICKED: 'BOT_KICKED',
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
  CRM_SYNC_FAILED: 'CRM_SYNC_FAILED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
} as const;

export const RECORDING_ERROR_MESSAGES: Record<keyof typeof RECORDING_ERROR_CODES, string> = {
  LIMIT_REACHED: "You've reached your recording limit for this month",
  INVALID_MEETING_URL: "This meeting URL isn't supported",
  BOT_JOIN_FAILED: "Recording bot couldn't join - the host may need to admit it",
  BOT_KICKED: 'Recording stopped - the bot was removed from the meeting',
  TRANSCRIPTION_FAILED: "We couldn't process the audio - please try again",
  CRM_SYNC_FAILED: "Recording saved but CRM sync failed - we'll retry",
  PROCESSING_FAILED: 'An error occurred while processing the recording',
};
