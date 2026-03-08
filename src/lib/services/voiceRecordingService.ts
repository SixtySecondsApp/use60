import { supabase } from '@/lib/supabase/clientV2';

export type RecordingType = 'meeting' | 'voice_note';

export interface VoiceRecording {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  audio_url: string;
  file_name: string;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  status: 'uploaded' | 'transcribing' | 'analyzing' | 'completed' | 'failed';
  recording_type: RecordingType;
  error_message: string | null;
  transcript_text: string | null;
  transcript_segments: TranscriptSegment[] | null;
  speakers: Speaker[] | null;
  language: string | null;
  summary: string | null;
  action_items: ActionItem[] | null;
  key_topics: string[] | null;
  sentiment_score: number | null;
  meeting_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  recorded_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  speaker: string;
  speaker_id: number;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

export interface Speaker {
  id: number;
  name: string;
  initials: string;
  color?: string;
}

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  deadline: string;
  done: boolean;
  priority?: 'high' | 'medium' | 'low';
}

export interface UploadResult {
  success: boolean;
  recording_id?: string;
  audio_url?: string;
  error?: string;
}

export interface TranscribeResult {
  success: boolean;
  recording_id?: string;
  transcript?: string;
  speakers?: Speaker[];
  error?: string;
}

export interface ShareResult {
  success: boolean;
  share_url?: string;
  share_token?: string;
  error?: string;
}

export interface PublicRecording {
  id: string;
  title: string;
  duration_seconds: number | null;
  summary: string | null;
  transcript_segments: TranscriptSegment[] | null;
  speakers: Speaker[] | null;
  action_items: ActionItem[] | null;
  recording_type: RecordingType;
  recorded_at: string;
}

/**
 * Voice Recording Service
 * Handles uploading, transcribing, and managing voice recordings
 */
export const voiceRecordingService = {
  /**
   * Upload a voice recording to S3 and create database record
   */
  async uploadRecording(
    audioBlob: Blob,
    orgId: string,
    title?: string
  ): Promise<UploadResult> {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );

      // Determine file extension from blob type
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.split('/')[1]?.split(';')[0] || 'webm';
      const fileName = `recording-${Date.now()}.${extension}`;

      // Get duration (approximate from file size if not available)
      const durationSeconds = Math.round(audioBlob.size / 16000); // Rough estimate for webm

      const { data, error } = await supabase.functions.invoke('voice-router', {
        body: {
          action: 'upload',
          audio_data: `data:${mimeType};base64,${base64}`,
          file_name: fileName,
          duration_seconds: durationSeconds,
          org_id: orgId,
          title: title || `Recording ${new Date().toLocaleString()}`,
        },
      });

      if (error) {
        console.error('Upload error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        recording_id: data.recording_id,
        audio_url: data.audio_url,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload error:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Start transcription for a recording
   */
  async transcribeRecording(recordingId: string): Promise<TranscribeResult> {
    try {
      const { data, error } = await supabase.functions.invoke('voice-router', {
        body: { action: 'transcribe', recording_id: recordingId },
      });

      if (error) {
        console.error('Transcribe error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        recording_id: data.recording_id,
        transcript: data.transcript,
        speakers: data.speakers,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed';
      console.error('Transcribe error:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Get all recordings for an organization
   */
  async getRecordings(orgId: string): Promise<VoiceRecording[]> {
    const { data, error } = await supabase
      .from('voice_recordings')
      .select('*')
      .eq('org_id', orgId)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('Error fetching recordings:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get a single recording by ID
   */
  async getRecording(recordingId: string): Promise<VoiceRecording | null> {
    const { data, error } = await supabase
      .from('voice_recordings')
      .select('*')
      .eq('id', recordingId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching recording:', error);
      return null;
    }

    return data;
  },

  /**
   * Update recording title
   */
  async updateTitle(recordingId: string, title: string): Promise<boolean> {
    const { error } = await supabase
      .from('voice_recordings')
      .update({ title })
      .eq('id', recordingId);

    if (error) {
      console.error('Error updating title:', error);
      return false;
    }

    return true;
  },

  /**
   * Update action item status
   */
  async toggleActionItem(
    recordingId: string,
    actionItemId: string
  ): Promise<boolean> {
    // Get current recording
    const recording = await this.getRecording(recordingId);
    if (!recording || !recording.action_items) return false;

    // Toggle the action item
    const updatedItems = recording.action_items.map((item: ActionItem) =>
      item.id === actionItemId ? { ...item, done: !item.done } : item
    );

    const { error } = await supabase
      .from('voice_recordings')
      .update({ action_items: updatedItems })
      .eq('id', recordingId);

    if (error) {
      console.error('Error toggling action item:', error);
      return false;
    }

    return true;
  },

  /**
   * Delete a recording
   */
  async deleteRecording(recordingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('voice_recordings')
      .delete()
      .eq('id', recordingId);

    if (error) {
      console.error('Error deleting recording:', error);
      return false;
    }

    return true;
  },

  /**
   * Link recording to a meeting
   */
  async linkToMeeting(recordingId: string, meetingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('voice_recordings')
      .update({ meeting_id: meetingId })
      .eq('id', recordingId);

    if (error) {
      console.error('Error linking to meeting:', error);
      return false;
    }

    return true;
  },

  /**
   * Link recording to a contact
   */
  async linkToContact(recordingId: string, contactId: string): Promise<boolean> {
    const { error } = await supabase
      .from('voice_recordings')
      .update({ contact_id: contactId })
      .eq('id', recordingId);

    if (error) {
      console.error('Error linking to contact:', error);
      return false;
    }

    return true;
  },

  /**
   * Get a presigned URL for audio playback
   */
  async getAudioPlaybackUrl(
    recordingId: string,
    shareToken?: string
  ): Promise<{ url: string; expiresAt: Date } | null> {
    try {
      // If using share token, use the public share endpoint
      if (shareToken) {
        const { data, error } = await supabase.functions.invoke('voice-router', {
          body: { action: 'share_playback', share_token: shareToken },
        });

        if (error || !data?.url) {
          console.error('Error getting shared playback URL:', error);
          return null;
        }

        return {
          url: data.url,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        };
      }

      // Use edge function to get presigned S3 URL
      const { data, error } = await supabase.functions.invoke('voice-router', {
        body: { action: 'presigned_url', recording_id: recordingId },
      });

      if (error || !data?.url) {
        console.error('Error getting presigned URL:', error);
        return null;
      }

      return {
        url: data.url,
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      };
    } catch (err) {
      console.error('Error getting audio playback URL:', err);
      return null;
    }
  },

  /**
   * Enable public sharing for a recording
   */
  async enableSharing(recordingId: string): Promise<ShareResult> {
    try {
      const { data, error } = await supabase.functions.invoke('voice-router', {
        body: { action: 'share', recording_id: recordingId, enable: true },
      });

      if (error) {
        console.error('Error enabling sharing:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        share_url: data.share_url,
        share_token: data.share_token,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable sharing';
      console.error('Enable sharing error:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Disable public sharing for a recording
   */
  async disableSharing(recordingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('voice-router', {
        body: { action: 'share', recording_id: recordingId, enable: false },
      });

      if (error) {
        console.error('Error disabling sharing:', error);
        return { success: false, error: error.message };
      }

      return { success: data.success };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable sharing';
      console.error('Disable sharing error:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Get sharing status for a recording
   */
  async getSharingStatus(recordingId: string): Promise<{
    isPublic: boolean;
    shareToken: string | null;
    shareViews: number;
  } | null> {
    const { data, error } = await supabase
      .from('voice_recordings')
      .select('is_public, share_token, share_views')
      .eq('id', recordingId)
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching sharing status:', error);
      return null;
    }

    return {
      isPublic: data.is_public || false,
      shareToken: data.share_token,
      shareViews: data.share_views || 0,
    };
  },

  /**
   * Get a public recording by share token (no auth required)
   */
  async getPublicRecording(shareToken: string): Promise<PublicRecording | null> {
    const { data, error } = await supabase
      .from('voice_recordings')
      .select(`
        id,
        title,
        duration_seconds,
        summary,
        transcript_segments,
        speakers,
        action_items,
        recording_type,
        recorded_at
      `)
      .eq('share_token', shareToken)
      .eq('is_public', true)
      .maybeSingle();

    if (error || !data) {
      console.error('Error fetching public recording:', error);
      return null;
    }

    return data as PublicRecording;
  },
};

export default voiceRecordingService;
