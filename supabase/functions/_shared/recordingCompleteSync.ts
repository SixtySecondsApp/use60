// Shared function to sync recording completion to meetings table
// Called by both Gladia and MeetingBaaS transcript processors
// Handles: S3 URL sync + thumbnail generation

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

interface SyncOptions {
  recording_id: string;
  bot_id: string;
  supabase: SupabaseClient;
  thumbnail_url?: string;
}

/**
 * Syncs completed recording data to meetings table
 * - Syncs S3 video/audio URLs (if upload complete)
 * - Generates thumbnail (if S3 video available)
 * - Works for all transcript providers (Gladia, MeetingBaaS, etc.)
 */
export async function syncRecordingToMeeting(options: SyncOptions): Promise<void> {
  const { recording_id, bot_id, supabase, thumbnail_url } = options;

  console.log('[RecordingSync] Syncing recording to meetings:', { recording_id, bot_id });

  // 1. Get recording with S3 URLs
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select('s3_upload_status, s3_video_url, s3_audio_url')
    .eq('id', recording_id)
    .single();

  if (recordingError) {
    console.error('[RecordingSync] Failed to fetch recording:', recordingError);
    return;
  }

  // 2. Sync S3 URLs to meetings table (if upload complete)
  if (recording?.s3_upload_status === 'complete') {
    console.log('[RecordingSync] S3 upload complete, syncing URLs to meetings');

    const meetingUpdate: Record<string, unknown> = {
      video_url: recording.s3_video_url,
      audio_url: recording.s3_audio_url,
      updated_at: new Date().toISOString(),
    };

    // Use Lambda-generated thumbnail if provided
    if (thumbnail_url) {
      meetingUpdate.thumbnail_url = thumbnail_url;
    }

    const { error: updateError } = await supabase
      .from('meetings')
      .update(meetingUpdate)
      .eq('bot_id', bot_id)
      .eq('source_type', '60_notetaker');

    if (updateError) {
      console.error('[RecordingSync] Failed to sync S3 URLs:', updateError);
    } else {
      console.log('[RecordingSync] S3 URLs synced successfully');
    }

    // 3. Generate thumbnail via edge function (fallback if Lambda didn't provide one)
    if (!thumbnail_url && recording.s3_video_url) {
      console.log('[RecordingSync] No Lambda thumbnail, trying edge function fallback');

      try {
        const { error: thumbnailError } = await supabase.functions.invoke(
          'generate-s3-video-thumbnail',
          {
            body: {
              recording_id: recording_id,
              video_url: recording.s3_video_url,
            },
          }
        );

        if (thumbnailError) {
          console.error('[RecordingSync] Thumbnail edge function failed:', thumbnailError);
        } else {
          console.log('[RecordingSync] Thumbnail edge function triggered');
        }
      } catch (error) {
        console.error('[RecordingSync] Failed to invoke thumbnail function:', error);
      }
    } else if (thumbnail_url) {
      console.log('[RecordingSync] Using Lambda-generated thumbnail:', thumbnail_url);
    }
  } else {
    console.log('[RecordingSync] S3 upload not complete yet, status:', recording?.s3_upload_status);
  }
}
