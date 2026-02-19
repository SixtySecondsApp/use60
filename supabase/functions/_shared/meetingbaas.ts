/**
 * MeetingBaaS Shared Utilities
 *
 * Common utilities for MeetingBaaS integration across edge functions.
 * Includes API client, URL parsing, and helper functions.
 */

// =============================================================================
// Types
// =============================================================================

export type MeetingPlatform = 'zoom' | 'google_meet' | 'microsoft_teams';

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

export interface MeetingBaaSBotConfig {
  meeting_url: string;
  bot_name?: string;
  bot_image?: string;
  entry_message?: string;
  recording_mode?: 'speaker_view' | 'gallery_view' | 'audio_only';
  webhook_url: string;
  reserved?: boolean;
  deduplication_key?: string;
  // Speech-to-text configuration for MeetingBaaS transcription
  speech_to_text?: {
    provider: 'Default' | 'Gladia' | 'AssemblyAI';
  };
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
  utterances: Array<{
    speaker: number;
    start: number;
    end: number;
    text: string;
    confidence?: number;
  }>;
}

export interface MeetingBaaSError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RecordingSettings {
  bot_name: string;
  bot_image_url?: string | null;
  entry_message_enabled: boolean;
  entry_message: string;
  default_transcription_provider: 'gladia' | 'meetingbaas';
  recordings_enabled: boolean;
  auto_record_enabled: boolean;
  // Auto-join scheduler settings
  auto_record_lead_time_minutes?: number; // Minutes before meeting to join (default: 2)
  auto_record_external_only?: boolean; // Only record meetings with external attendees (default: true)
  minimum_wait_minutes?: number; // Minimum time bot stays in empty meeting (default: 15)
  webhook_token?: string;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_BOT_NAME = '60 Notetaker';
// Bot avatar image shown when joining meetings
export const DEFAULT_BOT_IMAGE =
  'https://user-upload.s3.eu-west-2.amazonaws.com/erg%20logos/darkLogo/darkLogo-global-1764288016391.png';
export const DEFAULT_ENTRY_MESSAGE =
  "Hi! I'm here to take notes so {rep_name} can focus on our conversation. 📝";

export const MEETINGBAAS_API_BASE = 'https://api.meetingbaas.com';

export const MEETING_URL_PATTERNS: Record<MeetingPlatform, RegExp[]> = {
  zoom: [
    /^https?:\/\/[\w-]*\.?zoom\.us\/j\/(\d+)/i,
    /^https?:\/\/[\w-]*\.?zoom\.us\/my\/[\w-]+/i,
  ],
  google_meet: [
    /^https?:\/\/meet\.google\.com\/[\w-]+/i,
  ],
  microsoft_teams: [
    /^https?:\/\/teams\.microsoft\.com\/l\/meetup-join\//i,
    /^https?:\/\/teams\.live\.com\/meet\//i,
  ],
};

export const ERROR_CODES = {
  LIMIT_REACHED: 'LIMIT_REACHED',
  INVALID_MEETING_URL: 'INVALID_MEETING_URL',
  BOT_JOIN_FAILED: 'BOT_JOIN_FAILED',
  BOT_KICKED: 'BOT_KICKED',
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
  CRM_SYNC_FAILED: 'CRM_SYNC_FAILED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  API_ERROR: 'API_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
} as const;

export const ERROR_MESSAGES: Record<keyof typeof ERROR_CODES, string> = {
  LIMIT_REACHED: "You've reached your recording limit for this month",
  INVALID_MEETING_URL: "This meeting URL isn't supported",
  BOT_JOIN_FAILED: "Recording bot couldn't join - the host may need to admit it",
  BOT_KICKED: 'Recording stopped - the bot was removed from the meeting',
  TRANSCRIPTION_FAILED: "We couldn't process the audio - please try again",
  CRM_SYNC_FAILED: "Recording saved but CRM sync failed - we'll retry",
  PROCESSING_FAILED: 'An error occurred while processing the recording',
  API_ERROR: 'MeetingBaaS API error',
  QUOTA_EXCEEDED: 'API quota exceeded',
};

// =============================================================================
// URL Parsing
// =============================================================================

/**
 * Detect meeting platform from URL
 */
export function detectMeetingPlatform(url: string): MeetingPlatform | null {
  for (const [platform, patterns] of Object.entries(MEETING_URL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return platform as MeetingPlatform;
      }
    }
  }
  return null;
}

/**
 * Validate if URL is a supported meeting URL
 */
export function isValidMeetingUrl(url: string): boolean {
  return detectMeetingPlatform(url) !== null;
}

/**
 * Extract meeting ID from URL (where applicable)
 */
export function extractMeetingId(url: string): string | null {
  // Zoom meeting ID
  const zoomMatch = url.match(/zoom\.us\/j\/(\d+)/i);
  if (zoomMatch) {
    return zoomMatch[1];
  }

  // Google Meet code
  const meetMatch = url.match(/meet\.google\.com\/([\w-]+)/i);
  if (meetMatch) {
    return meetMatch[1];
  }

  return null;
}

// =============================================================================
// MeetingBaaS API Client
// =============================================================================

export interface MeetingBaaSClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export class MeetingBaaSClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: MeetingBaaSClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || MEETINGBAAS_API_BASE;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<{ data?: T; error?: MeetingBaaSError }> {
    const url = `${this.baseUrl}${endpoint}`;

    console.log(`[MeetingBaaS] ${method} ${url}`);
    if (body) {
      console.log(`[MeetingBaaS] Request body:`, JSON.stringify(body, null, 2));
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'x-meeting-baas-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await response.json();

      if (!response.ok) {
        return {
          error: {
            code: responseData.code || 'API_ERROR',
            message: responseData.message || `HTTP ${response.status}`,
            details: responseData,
          },
        };
      }

      // v2 API wraps responses in {success, data}
      // Unwrap the data field if present
      const data = responseData.data !== undefined ? responseData.data : responseData;

      // v2 uses bot_id instead of id - normalize to id
      if (data && data.bot_id && !data.id) {
        data.id = data.bot_id;
      }

      return { data };
    } catch (error) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network request failed',
        },
      };
    }
  }

  /**
   * Deploy a bot to join a meeting
   */
  async deployBot(config: MeetingBaaSBotConfig): Promise<{
    data?: MeetingBaaSBotResponse;
    error?: MeetingBaaSError;
  }> {
    return this.request<MeetingBaaSBotResponse>('POST', '/v2/bots', config);
  }

  /**
   * Get bot status
   */
  async getBotStatus(botId: string): Promise<{
    data?: { id: string; status: string; meeting_url: string };
    error?: MeetingBaaSError;
  }> {
    return this.request('GET', `/v2/bots/${botId}`);
  }

  /**
   * Remove bot from meeting
   */
  async removeBot(botId: string): Promise<{
    data?: { success: boolean };
    error?: MeetingBaaSError;
  }> {
    return this.request('DELETE', `/v2/bots/${botId}`);
  }

  /**
   * Get recording download URL
   */
  async getRecording(botId: string): Promise<{
    data?: MeetingBaaSRecordingResponse;
    error?: MeetingBaaSError;
  }> {
    return this.request<MeetingBaaSRecordingResponse>('GET', `/v2/bots/${botId}/recording`);
  }

  /**
   * Get transcript
   */
  async getTranscript(botId: string): Promise<{
    data?: MeetingBaaSTranscriptResponse;
    error?: MeetingBaaSError;
  }> {
    return this.request<MeetingBaaSTranscriptResponse>('GET', `/v2/bots/${botId}/transcript`);
  }
}

/**
 * Create MeetingBaaS client from environment
 */
export function createMeetingBaaSClient(): MeetingBaaSClient {
  const apiKey = Deno.env.get('MEETINGBAAS_API_KEY');
  if (!apiKey) {
    throw new Error('MEETINGBAAS_API_KEY environment variable not set');
  }

  return new MeetingBaaSClient({ apiKey });
}

// =============================================================================
// Entry Message Formatting
// =============================================================================

/**
 * Format entry message with user-specific placeholders
 */
export function formatEntryMessage(
  template: string,
  context: {
    rep_name?: string;
    company_name?: string;
    meeting_title?: string;
  }
): string {
  let message = template;

  if (context.rep_name) {
    message = message.replace(/{rep_name}/g, context.rep_name);
  }
  if (context.company_name) {
    message = message.replace(/{company_name}/g, context.company_name);
  }
  if (context.meeting_title) {
    message = message.replace(/{meeting_title}/g, context.meeting_title);
  }

  // Remove any remaining placeholders
  message = message.replace(/{[^}]+}/g, '');

  return message.trim();
}

// =============================================================================
// Webhook Token Generation
// =============================================================================

/**
 * Generate a secure webhook token for an organization
 */
export function generateWebhookToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// Domain Detection for External Attendees
// =============================================================================

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string | null {
  if (!email) return null;
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if an email is from an internal domain
 */
export function isInternalEmail(email: string, internalDomain: string | null): boolean {
  if (!internalDomain) return false;

  const domain = extractDomain(email);
  if (!domain) return false;

  // Match exact domain or subdomains
  return domain === internalDomain.toLowerCase() || domain.endsWith(`.${internalDomain.toLowerCase()}`);
}

/**
 * Check if attendees include external participants
 */
export function hasExternalAttendees(
  attendeeEmails: string[],
  internalDomain: string | null
): boolean {
  if (!internalDomain) return true; // Can't determine without internal domain

  return attendeeEmails.some((email) => !isInternalEmail(email, internalDomain));
}

// =============================================================================
// Duration Formatting
// =============================================================================

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format duration for display (e.g., "1:23:45")
 */
export function formatDurationTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

// =============================================================================
// Quota Checking
// =============================================================================

/**
 * Check if an organization has available recording quota
 * Returns { allowed: boolean, remaining: number, limit: number }
 */
export async function checkRecordingQuota(
  supabase: any,
  orgId: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabase
    .from('recording_usage')
    .select('recordings_count, recordings_limit')
    .eq('org_id', orgId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .maybeSingle();

  if (!usage) {
    // No usage record = under limit, use platform default
    const defaultLimit = await getPlatformDefaultRecordingLimit(supabase);
    return { allowed: true, remaining: defaultLimit, limit: defaultLimit };
  }

  const remaining = Math.max(0, usage.recordings_limit - usage.recordings_count);
  return {
    allowed: remaining > 0,
    remaining,
    limit: usage.recordings_limit,
  };
}

// =============================================================================
// App Settings Helpers
// =============================================================================

/**
 * Get platform default bot image URL from app_settings
 * Returns the platform default or null if not set
 */
export async function getPlatformDefaultBotImage(
  supabase: any
): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'notetaker_default_bot_image_url')
    .maybeSingle();

  return data?.value || null;
}

/**
 * Get platform default monthly recording limit from app_settings
 * Returns the configured limit or 20 as fallback
 */
export async function getPlatformDefaultRecordingLimit(supabase: any): Promise<number> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'notetaker_default_recording_limit')
    .maybeSingle();

  const parsed = parseInt(data?.value ?? '');
  return isNaN(parsed) ? 20 : parsed;
}
