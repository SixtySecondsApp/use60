/**
 * heygen-video-webhook
 *
 * POST /heygen-video-webhook
 * Receives callbacks from HeyGen when video generation completes/fails.
 *
 * Also supports manual polling:
 *   POST { action: 'poll', video_id: 'our-db-id' }
 *
 * Public endpoint — deployed with --no-verify-jwt.
 * Webhook requests validated via callback_id matching.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';

interface WebhookPayload {
  event_type?: string;
  event_data?: {
    video_id?: string;
    status?: string;
    url?: string;
    thumbnail_url?: string;
    duration?: number;
    callback_id?: string;
    error?: string;
  };
  // Manual poll mode
  action?: 'poll';
  video_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body: WebhookPayload = await req.json();

    // ---------------------------------------------------------------
    // Manual poll mode (authenticated)
    // ---------------------------------------------------------------
    if (body.action === 'poll' && body.video_id) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return errorResponse('Missing authorization for poll', req, 401);

      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return errorResponse('Unauthorized', req, 401);

      // Fetch our video record
      const { data: video } = await svc
        .from('heygen_videos')
        .select('id, heygen_video_id, org_id, status, video_url')
        .eq('id', body.video_id)
        .single();

      if (!video) return errorResponse('Video not found', req, 404);

      // If already completed, return cached URL
      if (video.status === 'completed' && video.video_url) {
        return jsonResponse({
          video_id: video.id,
          status: 'completed',
          video_url: video.video_url,
        }, req);
      }

      // Poll HeyGen
      const { data: creds } = await svc
        .from('heygen_org_credentials')
        .select('api_key')
        .eq('org_id', video.org_id)
        .maybeSingle();

      if (!creds?.api_key) return errorResponse('HeyGen not configured', req, 400);

      const heygen = new HeyGenClient(creds.api_key);
      const status = await heygen.getVideoStatus(video.heygen_video_id);

      if (status.status === 'completed' && status.video_url) {
        // Update DB
        await svc
          .from('heygen_videos')
          .update({
            status: 'completed',
            video_url: status.video_url,
            thumbnail_url: status.thumbnail_url || null,
            duration_seconds: status.duration || null,
            video_url_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', video.id);

        return jsonResponse({
          video_id: video.id,
          status: 'completed',
          video_url: status.video_url,
          thumbnail_url: status.thumbnail_url,
          duration: status.duration,
        }, req);
      }

      if (status.status === 'failed') {
        const errMsg = status.error?.message || status.error?.detail || 'Video generation failed';
        await svc
          .from('heygen_videos')
          .update({ status: 'failed', error_message: errMsg })
          .eq('id', video.id);

        return jsonResponse({
          video_id: video.id,
          status: 'failed',
          error: errMsg,
        }, req);
      }

      // Still processing
      return jsonResponse({
        video_id: video.id,
        status: status.status || 'processing',
      }, req);
    }

    // ---------------------------------------------------------------
    // Webhook callback from HeyGen
    // ---------------------------------------------------------------
    const eventData = body.event_data;
    if (!eventData?.callback_id && !eventData?.video_id) {
      return jsonResponse({ received: true, skipped: 'no callback_id or video_id' }, req);
    }

    // Find our video record by callback_id or heygen_video_id
    let videoRecord;
    if (eventData.callback_id) {
      const { data } = await svc
        .from('heygen_videos')
        .select('id, heygen_video_id, status')
        .eq('callback_id', eventData.callback_id)
        .maybeSingle();
      videoRecord = data;
    }

    if (!videoRecord && eventData.video_id) {
      const { data } = await svc
        .from('heygen_videos')
        .select('id, heygen_video_id, status')
        .eq('heygen_video_id', eventData.video_id)
        .maybeSingle();
      videoRecord = data;
    }

    if (!videoRecord) {
      console.warn('[heygen-video-webhook] No matching video record for callback:', eventData);
      return jsonResponse({ received: true, matched: false }, req);
    }

    // Update based on status
    const heygenStatus = eventData.status?.toLowerCase();

    if (heygenStatus === 'completed' && eventData.url) {
      await svc
        .from('heygen_videos')
        .update({
          status: 'completed',
          video_url: eventData.url,
          thumbnail_url: eventData.thumbnail_url || null,
          duration_seconds: eventData.duration || null,
          video_url_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', videoRecord.id);

      console.log(`[heygen-video-webhook] Video ${videoRecord.id} completed`);
    } else if (heygenStatus === 'failed' || heygenStatus === 'error') {
      await svc
        .from('heygen_videos')
        .update({
          status: 'failed',
          error_message: eventData.error || 'Video generation failed',
        })
        .eq('id', videoRecord.id);

      console.warn(`[heygen-video-webhook] Video ${videoRecord.id} failed:`, eventData.error);
    } else if (heygenStatus === 'processing') {
      await svc
        .from('heygen_videos')
        .update({ status: 'processing' })
        .eq('id', videoRecord.id);
    }

    return jsonResponse({ received: true, matched: true, video_id: videoRecord.id }, req);

  } catch (err) {
    console.error('[heygen-video-webhook] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
