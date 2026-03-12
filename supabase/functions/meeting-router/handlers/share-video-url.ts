import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'
import { getCorsHeaders } from '../../_shared/corsHelper.ts'
import { createMeetingBaaSClient } from '../../_shared/meetingbaas.ts'

const URL_EXPIRY_SECONDS = 60 * 60 * 4 // 4 hours

/**
 * Share Video URL Handler
 *
 * Fetches a playable video URL for public share pages.
 * Looks up the recording via meetings.recording_id, then:
 *   Path 1: S3 key → fresh presigned URL from our S3
 *   Path 2: MeetingBaaS bot_id → fresh URL from MeetingBaaS API
 *   Path 3: Stored recording_s3_url as fallback (may be expired)
 *
 * No user authentication required — uses share_token for access control.
 */
export async function handleShareVideoUrl(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { share_token } = await req.json()

    if (!share_token) {
      return json({ error: 'share_token is required' }, 400)
    }

    // Fetch meeting by share token — must be public
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('id, recording_id, video_url, share_token, is_public, source_type')
      .eq('share_token', share_token)
      .eq('is_public', true)
      .maybeSingle()

    if (meetingError || !meeting) {
      return json({ error: 'Meeting not found or not shared' }, 404)
    }

    // If meetings.video_url is set and is an external URL, return directly
    if (meeting.video_url) {
      const isExternalUrl = !meeting.video_url.includes('s3.') &&
        !meeting.video_url.includes('amazonaws.com') &&
        !meeting.video_url.includes('scw.cloud')
      if (isExternalUrl) {
        return json({ success: true, url: meeting.video_url, expires_in: null })
      }
    }

    // Look up the recording via recording_id
    if (!meeting.recording_id) {
      // No recording linked — check if video_url exists on meeting directly
      if (meeting.video_url) {
        return json({ success: true, url: meeting.video_url, expires_in: null })
      }
      return json({ error: 'No recording found for this meeting' }, 404)
    }

    const { data: recording, error: recError } = await supabase
      .from('recordings')
      .select('id, recording_s3_key, recording_s3_url, bot_id, status')
      .eq('id', meeting.recording_id)
      .maybeSingle()

    if (recError || !recording) {
      console.error('[share-video-url] Recording lookup error:', recError)
      return json({ error: 'Recording not found' }, 404)
    }

    // ── Path 1: Recording in our S3 → generate fresh presigned URL ──────
    if (recording.recording_s3_key) {
      try {
        const s3Client = new S3Client({
          region: Deno.env.get('AWS_REGION') || 'eu-west-2',
          credentials: {
            accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
            secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
          },
        })

        const bucketName = Deno.env.get('AWS_S3_BUCKET') || 'use60-application'
        const signedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: bucketName, Key: recording.recording_s3_key }),
          { expiresIn: URL_EXPIRY_SECONDS }
        )

        console.log('[share-video-url] Generated S3 signed URL for recording:', recording.id)
        return json({ success: true, url: signedUrl, expires_in: URL_EXPIRY_SECONDS })
      } catch (s3Error) {
        console.error('[share-video-url] S3 presign failed:', s3Error)
        // Fall through to other paths
      }
    }

    // ── Path 2: MeetingBaaS bot → fetch fresh URL from API ──────────────
    if (recording.bot_id) {
      const extractVideoUrl = (data: Record<string, unknown>): string | null => {
        const direct = (data.url || data.mp4 || data.video_url || data.video || data.recording_url) as string | undefined
        if (direct) return direct
        const output = data.output as Record<string, unknown> | undefined
        if (output) {
          const nested = (output.video_url || output.video || output.mp4) as string | undefined
          if (nested) return nested
        }
        return null
      }

      try {
        const mbClient = createMeetingBaaSClient()
        let freshUrl: string | null = null

        // Try getRecording first
        try {
          const { data: recData } = await mbClient.getRecording(recording.bot_id)
          if (recData) freshUrl = extractVideoUrl(recData as unknown as Record<string, unknown>)
        } catch { /* continue */ }

        // Try getBotStatus as fallback
        if (!freshUrl) {
          try {
            const { data: botData } = await mbClient.getBotStatus(recording.bot_id)
            if (botData) freshUrl = extractVideoUrl(botData as unknown as Record<string, unknown>)
          } catch { /* continue */ }
        }

        if (freshUrl) {
          // Update the stored URL for future requests
          await supabase
            .from('recordings')
            .update({ recording_s3_url: freshUrl, updated_at: new Date().toISOString() })
            .eq('id', recording.id)

          console.log('[share-video-url] Got fresh MeetingBaaS URL for recording:', recording.id)
          return json({ success: true, url: freshUrl, expires_in: URL_EXPIRY_SECONDS })
        }
      } catch (mbError) {
        console.warn('[share-video-url] MeetingBaaS API error:', mbError)
      }
    }

    // ── Path 3: Return stored URL as last resort (may be expired) ───────
    if (recording.recording_s3_url) {
      console.log('[share-video-url] Returning stored URL (may be expired) for recording:', recording.id)
      return json({ success: true, url: recording.recording_s3_url, expires_in: null })
    }

    return json({ error: 'Recording file not available yet', success: false }, 404)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[share-video-url] Error:', error)
    return json({ error: message, success: false }, 500)
  }
}
