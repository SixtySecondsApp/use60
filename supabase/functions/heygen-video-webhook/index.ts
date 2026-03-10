/**
 * heygen-video-webhook
 *
 * POST /heygen-video-webhook
 * Receives callbacks from HeyGen when video generation completes/fails.
 *
 * Also supports manual polling:
 *   POST { action: 'poll', video_id: 'our-db-id' }
 *
 * On completion: writes the MP4 URL back into the ops table cell.
 *
 * Public endpoint — deployed with --no-verify-jwt.
 * Webhook requests validated via callback_id matching.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';
import { logFlatRateCostEvent } from '../_shared/costTracking.ts';
import { INTEGRATION_CREDIT_COSTS } from '../_shared/creditPacks.ts';

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

/**
 * Write video result back to the ops table cell (heygen_video column).
 * Finds the video column in the same table as the row, then upserts the cell value.
 */
async function writeVideoToCell(
  svc: ReturnType<typeof createClient>,
  rowId: string,
  videoData: Record<string, unknown>,
): Promise<void> {
  try {
    // Find the table for this row
    const { data: row } = await svc
      .from('dynamic_table_rows')
      .select('table_id')
      .eq('id', rowId)
      .maybeSingle();

    if (!row?.table_id) return;

    // Find the heygen_video column in this table
    const { data: videoCol } = await svc
      .from('dynamic_table_columns')
      .select('id')
      .eq('table_id', row.table_id)
      .eq('column_type', 'heygen_video')
      .maybeSingle();

    if (!videoCol?.id) return;

    // Upsert the cell
    await svc
      .from('dynamic_table_cells')
      .upsert({
        row_id: rowId,
        column_id: videoCol.id,
        value: JSON.stringify(videoData),
      }, { onConflict: 'row_id,column_id' });
  } catch (err) {
    console.warn('[heygen-video-webhook] writeVideoToCell error (non-fatal):', err);
  }
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
        .select('id, heygen_video_id, org_id, user_id, status, video_url, dynamic_table_row_id')
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

      // Poll HeyGen for current status
      const { data: creds } = await svc
        .from('heygen_org_credentials')
        .select('api_key')
        .eq('org_id', video.org_id)
        .maybeSingle();

      const apiKey = creds?.api_key || Deno.env.get('HEYGEN_API_KEY');
      if (!apiKey) return errorResponse('HeyGen not configured', req, 400);

      const heygen = new HeyGenClient(apiKey);
      const status = await heygen.getVideoStatus(video.heygen_video_id);

      if (status.status === 'completed' && status.video_url) {
        // Update heygen_videos
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

        // Write video URL back to ops table cell
        if (video.dynamic_table_row_id) {
          await writeVideoToCell(svc, video.dynamic_table_row_id, {
            status: 'completed',
            video_url: status.video_url,
            thumbnail_url: status.thumbnail_url || null,
            duration_seconds: status.duration || null,
            video_record_id: video.id,
          });
        }

        // Charge credits based on actual duration
        const pollDuration = status.duration || 30;
        const pollCreditCost = pollDuration * INTEGRATION_CREDIT_COSTS.heygen_video_per_second;
        await logFlatRateCostEvent(svc, video.user_id, video.org_id, 'heygen', 'video_generate',
          pollCreditCost, 'heygen_video_generate',
          { video_id: video.id, heygen_video_id: video.heygen_video_id, duration_seconds: pollDuration });

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

        // Write failure to ops table cell
        if (video.dynamic_table_row_id) {
          await writeVideoToCell(svc, video.dynamic_table_row_id, {
            status: 'failed',
            error_message: errMsg,
            video_record_id: video.id,
          });
        }

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
    let videoRecord: {
      id: string;
      heygen_video_id: string;
      status: string;
      org_id: string;
      user_id: string;
      dynamic_table_row_id: string | null;
    } | null = null;

    if (eventData.callback_id) {
      const { data } = await svc
        .from('heygen_videos')
        .select('id, heygen_video_id, status, org_id, user_id, dynamic_table_row_id')
        .eq('callback_id', eventData.callback_id)
        .maybeSingle();
      videoRecord = data;
    }

    if (!videoRecord && eventData.video_id) {
      const { data } = await svc
        .from('heygen_videos')
        .select('id, heygen_video_id, status, org_id, user_id, dynamic_table_row_id')
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

      // Write MP4 URL back to ops table cell
      if (videoRecord.dynamic_table_row_id) {
        await writeVideoToCell(svc, videoRecord.dynamic_table_row_id, {
          status: 'completed',
          video_url: eventData.url,
          thumbnail_url: eventData.thumbnail_url || null,
          duration_seconds: eventData.duration || null,
          video_record_id: videoRecord.id,
        });
      }

      // Charge credits based on actual video duration
      const durationSec = eventData.duration || 30;
      const creditCost = durationSec * INTEGRATION_CREDIT_COSTS.heygen_video_per_second;
      await logFlatRateCostEvent(svc, videoRecord.user_id, videoRecord.org_id, 'heygen', 'video_generate',
        creditCost, 'heygen_video_generate',
        { video_id: videoRecord.id, heygen_video_id: videoRecord.heygen_video_id, duration_seconds: durationSec });

      console.log(`[heygen-video-webhook] Video ${videoRecord.id} completed — charged ${creditCost.toFixed(2)} credits (${durationSec}s)`);
    } else if (heygenStatus === 'failed' || heygenStatus === 'error') {
      const errMsg = eventData.error || 'Video generation failed';

      await svc
        .from('heygen_videos')
        .update({
          status: 'failed',
          error_message: errMsg,
        })
        .eq('id', videoRecord.id);

      // Write failure to ops table cell
      if (videoRecord.dynamic_table_row_id) {
        await writeVideoToCell(svc, videoRecord.dynamic_table_row_id, {
          status: 'failed',
          error_message: errMsg,
          video_record_id: videoRecord.id,
        });
      }

      console.warn(`[heygen-video-webhook] Video ${videoRecord.id} failed:`, errMsg);
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
