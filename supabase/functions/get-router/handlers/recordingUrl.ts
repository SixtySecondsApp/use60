import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import {
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts';
import { createMeetingBaaSClient } from '../../_shared/meetingbaas.ts';

// =============================================================================
// Constants
// =============================================================================

// URL expiry time: 4 hours in seconds
const URL_EXPIRY_SECONDS = 60 * 60 * 4;

// =============================================================================
// Types
// =============================================================================

interface GetRecordingUrlResponse {
  success: boolean;
  url?: string;
  expires_at?: string;
  error?: string;
}

// =============================================================================
// Main Handler
// =============================================================================

export async function handleRecordingUrl(req: Request): Promise<Response> {
  try {
    // Get recording_id from query params (direct call) or body (via router)
    const url = new URL(req.url);
    let recordingId = url.searchParams.get('recording_id');

    if (!recordingId) {
      // Try to read from body (when called via router)
      try {
        const body = await req.json();
        recordingId = body.recording_id || null;
      } catch {
        // body already consumed or not JSON
      }
    }

    if (!recordingId) {
      return errorResponse('recording_id is required', req, 400);
    }

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    // Create Supabase client with user's JWT for RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // Fetch the recording (RLS will enforce access)
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('id, org_id, recording_s3_key, recording_s3_url, bot_id, status')
      .eq('id', recordingId)
      .maybeSingle();

    if (recordingError) {
      console.error('[GetRecordingUrl] Database error:', recordingError);
      return errorResponse('Failed to fetch recording', req, 500);
    }

    if (!recording) {
      return errorResponse('Recording not found', req, 404);
    }

    // Path 1: Recording is in S3 — generate a fresh signed URL
    if (recording.recording_s3_key) {
      const s3Client = new S3Client({
        region: Deno.env.get('AWS_REGION') || 'eu-west-2',
        credentials: {
          accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
          secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
        },
      });

      const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application';

      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: recording.recording_s3_key,
      });

      try {
        const signedUrl = await getSignedUrl(s3Client, getCommand, {
          expiresIn: URL_EXPIRY_SECONDS,
        });

        const expiresAt = new Date(Date.now() + URL_EXPIRY_SECONDS * 1000).toISOString();

        console.log('[GetRecordingUrl] Generated S3 signed URL for recording:', recordingId);

        return jsonResponse(
          {
            success: true,
            url: signedUrl,
            expires_at: expiresAt,
          } as GetRecordingUrlResponse,
          req,
          200
        );
      } catch (s3Error) {
        console.error('[GetRecordingUrl] S3 signed URL error:', s3Error);
        return errorResponse('Failed to generate download URL', req, 500);
      }
    }

    // Path 2: No S3 key — try MeetingBaaS API to get a fresh URL
    if (recording.bot_id) {
      // Helper: extract video URL from various MeetingBaaS response shapes
      const extractVideoUrl = (data: Record<string, unknown>): string | null => {
        // Direct fields
        const direct = (data.url || data.mp4 || data.video_url || data.video || data.recording_url || data.audio_url || data.audio) as string | undefined;
        if (direct) return direct;
        // Nested output object (some MeetingBaaS responses wrap in output)
        const output = data.output as Record<string, unknown> | undefined;
        if (output) {
          const nested = (output.video_url || output.video || output.mp4) as string | undefined;
          if (nested) return nested;
        }
        return null;
      };

      const mbClient = createMeetingBaaSClient();
      let freshUrl: string | null = null;

      // Try 1: GET /v2/bots/{botId}/recording
      try {
        console.log('[GetRecordingUrl] Trying getRecording for bot:', recording.bot_id);
        const { data: recData, error: recError } = await mbClient.getRecording(recording.bot_id);

        if (recError) {
          console.warn('[GetRecordingUrl] getRecording error:', JSON.stringify(recError));
        }
        if (recData) {
          console.log('[GetRecordingUrl] getRecording response keys:', Object.keys(recData));
          freshUrl = extractVideoUrl(recData as unknown as Record<string, unknown>);
        }
      } catch (err) {
        console.warn('[GetRecordingUrl] getRecording failed:', err);
      }

      // Try 2: GET /v2/bots/{botId} (bot status — includes video URLs)
      if (!freshUrl) {
        try {
          console.log('[GetRecordingUrl] Trying getBotStatus for bot:', recording.bot_id);
          const { data: botData, error: botError } = await mbClient.getBotStatus(recording.bot_id);

          if (botError) {
            console.warn('[GetRecordingUrl] getBotStatus error:', JSON.stringify(botError));
          }
          if (botData) {
            console.log('[GetRecordingUrl] getBotStatus response keys:', Object.keys(botData));
            freshUrl = extractVideoUrl(botData as unknown as Record<string, unknown>);
          }
        } catch (err) {
          console.warn('[GetRecordingUrl] getBotStatus failed:', err);
        }
      }

      if (freshUrl) {
        // Update stored URL in the DB using service role (bypasses RLS)
        const serviceClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        await serviceClient
          .from('recordings')
          .update({
            recording_s3_url: freshUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recordingId);

        console.log('[GetRecordingUrl] Got fresh MeetingBaaS URL for recording:', recordingId);

        return jsonResponse(
          {
            success: true,
            url: freshUrl,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          } as GetRecordingUrlResponse,
          req,
          200
        );
      }

      console.warn('[GetRecordingUrl] No URL found from MeetingBaaS API for bot:', recording.bot_id);
    }

    // Path 3: Return stored URL as last resort (may be expired)
    if (recording.recording_s3_url) {
      console.log('[GetRecordingUrl] Returning stored URL (may be expired) for recording:', recordingId);
      return jsonResponse(
        {
          success: true,
          url: recording.recording_s3_url,
        } as GetRecordingUrlResponse,
        req,
        200
      );
    }

    // No URL available at all
    return jsonResponse(
      {
        success: false,
        error: 'Recording file not available yet',
      } as GetRecordingUrlResponse,
      req,
      200
    );
  } catch (error) {
    console.error('[GetRecordingUrl] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      req,
      500
    );
  }
}
