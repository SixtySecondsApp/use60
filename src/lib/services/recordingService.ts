/**
 * Recording Service
 *
 * Frontend service for managing MeetingBaaS recordings.
 * Handles:
 * - Manual recording start/stop
 * - Recording listing and search
 * - Recording rules management
 * - Recording settings
 *
 * @see supabase/migrations/20260104100000_meetingbaas_core_tables.sql
 */

import { supabase } from '../supabase/clientV2';
import logger from '@/lib/utils/logger';
import type {
  Recording,
  RecordingInsert,
  RecordingRule,
  RecordingRuleInsert,
  RecordingStatus,
  MeetingPlatform,
  RecordingUsage,
  RecordingSettings,
  ListRecordingsResponse,
  RecordingSearchResponse,
  RecordingSearchResult,
} from '@/lib/types/meetingBaaS';

// =============================================================================
// Types
// =============================================================================

export interface StartRecordingParams {
  meetingUrl: string;
  meetingTitle?: string;
  calendarEventId?: string;
}

export interface StartRecordingResult {
  success: boolean;
  recording?: Recording;
  error?: string;
}

export interface ListRecordingsParams {
  status?: RecordingStatus;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface SearchRecordingsParams {
  query: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Recording Service Class
// =============================================================================

class RecordingService {
  private static instance: RecordingService;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): RecordingService {
    if (!RecordingService.instance) {
      RecordingService.instance = new RecordingService();
    }
    return RecordingService.instance;
  }

  // ===========================================================================
  // Recording CRUD
  // ===========================================================================

  /**
   * Start a manual recording by deploying a bot to the meeting
   */
  async startRecording(
    orgId: string,
    userId: string,
    params: StartRecordingParams
  ): Promise<StartRecordingResult> {
    try {
      const platform = this.detectMeetingPlatform(params.meetingUrl);
      if (!platform) {
        return { success: false, error: "This meeting URL isn't supported" };
      }

      // Call the deploy-recording-bot edge function
      // This handles quota checking, recording creation, and bot deployment
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const response = await fetch(`${supabaseUrl}/functions/v1/deploy-recording-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          meeting_url: params.meetingUrl,
          meeting_title: params.meetingTitle,
          calendar_event_id: params.calendarEventId,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        logger.error('[RecordingService] Deploy bot failed:', result);
        return {
          success: false,
          error: result.error || 'Failed to start recording',
        };
      }

      // Fetch the created recording to return it
      const { data: recording } = await supabase
        .from('recordings')
        .select('*')
        .eq('id', result.recording_id)
        .single();

      return { success: true, recording: (recording as unknown as Recording) || undefined };
    } catch (error) {
      logger.error('[RecordingService] startRecording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop a recording (remove bot from meeting)
   */
  async stopRecording(recordingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: recording, error: fetchError } = await supabase
        .from('recordings')
        .select('id, bot_id, status')
        .eq('id', recordingId)
        .single();

      if (fetchError || !recording) {
        return { success: false, error: 'Recording not found' };
      }

      if (recording.status !== 'recording' && recording.status !== 'bot_joining') {
        return { success: false, error: 'Recording is not active' };
      }

      // TODO: Call edge function to stop the bot
      // For now, just update status
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status: 'processing',
          meeting_end_time: new Date().toISOString(),
        })
        .eq('id', recordingId);

      if (updateError) {
        return { success: false, error: 'Failed to stop recording' };
      }

      return { success: true };
    } catch (error) {
      logger.error('[RecordingService] stopRecording error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get a single recording by ID
   */
  async getRecording(recordingId: string): Promise<Recording | null> {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (error) {
      logger.error('[RecordingService] getRecording error:', error);
      return null;
    }

    return data as unknown as Recording;
  }

  /**
   * List recordings for an organization
   */
  async listRecordings(
    orgId: string,
    params: ListRecordingsParams = {}
  ): Promise<ListRecordingsResponse> {
    const { status, limit = 20, offset = 0, startDate, endDate } = params;

    let query = supabase
      .from('recordings')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('[RecordingService] listRecordings error:', error);
      return { recordings: [], total: 0, limit, offset };
    }

    return {
      recordings: (data || []) as unknown as Recording[],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Search recordings by transcript content
   */
  async searchRecordings(
    orgId: string,
    params: SearchRecordingsParams
  ): Promise<RecordingSearchResponse> {
    const { query, limit = 20, offset = 0 } = params;

    // Use PostgreSQL full-text search
    const { data, error, count } = await supabase
      .from('recordings')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .textSearch('transcript_text', query, { type: 'websearch' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('[RecordingService] searchRecordings error:', error);
      return { results: [], total: 0, query };
    }

    // Transform results to include match snippets
    const results: RecordingSearchResult[] = (data || []).map((recording) => ({
      recording: recording as unknown as Recording,
      matches: this.extractSearchMatches(recording.transcript_text || '', query),
    }));

    return {
      results,
      total: count || 0,
      query,
    };
  }

  /**
   * Delete a recording
   */
  async deleteRecording(recordingId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.from('recordings').delete().eq('id', recordingId);

    if (error) {
      logger.error('[RecordingService] deleteRecording error:', error);
      return { success: false, error: 'Failed to delete recording' };
    }

    return { success: true };
  }

  /**
   * Get a fresh signed URL for a recording's video file
   * Use this instead of the stored recording_s3_url which may have expired
   */
  async getRecordingUrl(
    recordingId: string
  ): Promise<{ success: boolean; url?: string; expires_at?: string; error?: string }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const response = await fetch(
        `${supabaseUrl}/functions/v1/get-recording-url?recording_id=${recordingId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        logger.error('[RecordingService] getRecordingUrl failed:', result);
        return {
          success: false,
          error: result.error || 'Failed to get recording URL',
        };
      }

      return {
        success: true,
        url: result.url,
        expires_at: result.expires_at,
      };
    } catch (error) {
      logger.error('[RecordingService] getRecordingUrl error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Recording Rules
  // ===========================================================================

  /**
   * Get all recording rules for an organization
   */
  async getRecordingRules(orgId: string): Promise<RecordingRule[]> {
    const { data, error } = await supabase
      .from('recording_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('priority', { ascending: false });

    if (error) {
      logger.error('[RecordingService] getRecordingRules error:', error);
      return [];
    }

    return (data || []) as unknown as RecordingRule[];
  }

  /**
   * Create a new recording rule
   */
  async createRecordingRule(rule: RecordingRuleInsert): Promise<RecordingRule | null> {
    const { data, error } = await supabase
      .from('recording_rules')
      .insert(rule)
      .select()
      .single();

    if (error) {
      logger.error('[RecordingService] createRecordingRule error:', error);
      return null;
    }

    return data as unknown as RecordingRule;
  }

  /**
   * Update a recording rule
   */
  async updateRecordingRule(
    ruleId: string,
    updates: Partial<RecordingRule>
  ): Promise<RecordingRule | null> {
    const { data, error } = await supabase
      .from('recording_rules')
      .update(updates)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      logger.error('[RecordingService] updateRecordingRule error:', error);
      return null;
    }

    return data as unknown as RecordingRule;
  }

  /**
   * Delete a recording rule
   */
  async deleteRecordingRule(ruleId: string): Promise<boolean> {
    const { error } = await supabase.from('recording_rules').delete().eq('id', ruleId);

    if (error) {
      logger.error('[RecordingService] deleteRecordingRule error:', error);
      return false;
    }

    return true;
  }

  // ===========================================================================
  // Recording Settings
  // ===========================================================================

  /**
   * Get recording settings for an organization
   */
  async getRecordingSettings(orgId: string): Promise<RecordingSettings | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select('recording_settings')
      .eq('id', orgId)
      .single();

    if (error) {
      logger.error('[RecordingService] getRecordingSettings error:', error);
      return null;
    }

    return (data?.recording_settings as unknown as RecordingSettings) || null;
  }

  /**
   * Update recording settings for an organization
   */
  async updateRecordingSettings(
    orgId: string,
    settings: Partial<RecordingSettings>
  ): Promise<RecordingSettings | null> {
    // Get current settings first
    const current = await this.getRecordingSettings(orgId);
    const updated = { ...current, ...settings };

    const { data, error } = await supabase
      .from('organizations')
      .update({ recording_settings: updated })
      .eq('id', orgId)
      .select('recording_settings')
      .single();

    if (error) {
      logger.error('[RecordingService] updateRecordingSettings error:', error);
      return null;
    }

    return (data?.recording_settings as unknown as RecordingSettings) || null;
  }

  // ===========================================================================
  // Usage & Quota
  // ===========================================================================

  /**
   * Get current month's recording usage
   */
  async getUsage(orgId: string): Promise<RecordingUsage | null> {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('recording_usage')
      .select('*')
      .eq('org_id', orgId)
      .eq('period_start', periodStart.toISOString().split('T')[0])
      .maybeSingle();

    if (error) {
      logger.error('[RecordingService] getUsage error:', error);
      return null;
    }

    // Return default usage if no record exists
    if (!data) {
      return {
        id: '',
        org_id: orgId,
        period_start: periodStart.toISOString(),
        period_end: new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).toISOString(),
        recordings_count: 0,
        recordings_limit: 20,
        total_duration_seconds: 0,
        storage_used_bytes: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return data;
  }

  /**
   * Check if organization has available recording quota
   */
  async checkQuota(orgId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const usage = await this.getUsage(orgId);

    if (!usage) {
      return { allowed: true, remaining: 20, limit: 20 };
    }

    const remaining = Math.max(0, usage.recordings_limit - usage.recordings_count);
    return {
      allowed: remaining > 0,
      remaining,
      limit: usage.recordings_limit,
    };
  }

  // ===========================================================================
  // HITL Resolution
  // ===========================================================================

  /**
   * Resolve a HITL (Human-in-the-loop) action for a recording
   */
  async resolveHITL(
    recordingId: string,
    userId: string,
    resolution: {
      type: 'speaker_confirmation' | 'deal_selection';
      data: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: Partial<Recording> = {
        hitl_required: false,
        hitl_resolved_at: new Date().toISOString(),
        hitl_resolved_by: userId,
      };

      // Handle different resolution types
      if (resolution.type === 'speaker_confirmation') {
        updateData.speakers = resolution.data.speakers as Recording['speakers'];
        updateData.speaker_identification_method = 'manual';
      } else if (resolution.type === 'deal_selection') {
        updateData.crm_deal_id = resolution.data.deal_id as string;
      }

      const { error } = await supabase
        .from('recordings')
        .update(updateData as any)
        .eq('id', recordingId);

      if (error) {
        return { success: false, error: 'Failed to resolve HITL' };
      }

      return { success: true };
    } catch (error) {
      logger.error('[RecordingService] resolveHITL error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Detect meeting platform from URL
   */
  private detectMeetingPlatform(url: string): MeetingPlatform | null {
    if (/zoom\.us\/j\/\d+/i.test(url) || /zoom\.us\/my\//i.test(url)) {
      return 'zoom';
    }
    if (/meet\.google\.com\//i.test(url)) {
      return 'google_meet';
    }
    if (/teams\.microsoft\.com\/l\/meetup-join\//i.test(url) || /teams\.live\.com\/meet\//i.test(url)) {
      return 'microsoft_teams';
    }
    return null;
  }

  /**
   * Extract search match snippets from transcript
   */
  private extractSearchMatches(
    transcript: string,
    query: string
  ): Array<{ field: string; snippet: string }> {
    const matches: Array<{ field: string; snippet: string }> = [];
    const queryTerms = query.toLowerCase().split(/\s+/);
    const transcriptLower = transcript.toLowerCase();

    for (const term of queryTerms) {
      const index = transcriptLower.indexOf(term);
      if (index !== -1) {
        // Extract snippet around the match (100 chars before and after)
        const start = Math.max(0, index - 100);
        const end = Math.min(transcript.length, index + term.length + 100);
        const snippet = (start > 0 ? '...' : '') + transcript.slice(start, end) + (end < transcript.length ? '...' : '');

        matches.push({
          field: 'transcript',
          snippet: snippet.trim(),
        });
        break; // Only include first match per query
      }
    }

    return matches;
  }

  /**
   * Retry processing for a recording stuck in "processing" status.
   * Directly invokes the process-recording edge function.
   */
  async retryProcessing(recordingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const response = await fetch(`${supabaseUrl}/functions/v1/process-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ recording_id: recordingId }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Processing failed' };
      }

      return { success: true };
    } catch (error) {
      logger.error('[RecordingService] retryProcessing error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Poll all stuck bots to check their status via MeetingBaaS API.
   * Triggers processing for any bots that have completed but whose webhooks were missed.
   */
  async pollAllStuckBots(): Promise<{ success: boolean; summary?: Record<string, number>; error?: string }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const response = await fetch(`${supabaseUrl}/functions/v1/poll-stuck-bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ stale_minutes: 0 }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Poll failed' };
      }

      return {
        success: true,
        summary: result.summary,
      };
    } catch (error) {
      logger.error('[RecordingService] pollAllStuckBots error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Poll a stuck bot to check its current status via MeetingBaaS API.
   * Triggers processing if the bot has completed but webhook was missed.
   */
  async pollStuckBot(botId: string): Promise<{ success: boolean; action?: string; error?: string }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL);
      const response = await fetch(`${supabaseUrl}/functions/v1/poll-stuck-bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bot_id: botId, stale_minutes: 0 }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Poll failed' };
      }

      const firstResult = result.results?.[0];
      return {
        success: true,
        action: firstResult?.action || 'no_change',
      };
    } catch (error) {
      logger.error('[RecordingService] pollStuckBot error:', error);
      return { success: false, error: 'Network error' };
    }
  }
}

// Export singleton instance
export const recordingService = RecordingService.getInstance();

// Export class for testing
export { RecordingService };
