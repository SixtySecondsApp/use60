/**
 * fal-video-webhook — Receive async completion callbacks from fal.ai
 *
 * fal.ai POSTs here when a queued job finishes (success or failure).
 * This is faster than polling — instant completion detection.
 *
 * Payload shape (fal.ai webhook):
 *   { request_id, status: "OK" | "ERROR", payload: { video: { url, ... }, seed? }, error?: string }
 *
 * Deploy with --no-verify-jwt (no user auth — called by fal.ai servers).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { logFlatRateCostEvent } from '../_shared/costTracking.ts';

// ---------------------------------------------------------------------------
// Model credit cost per second of generated video
// ---------------------------------------------------------------------------

const MODEL_COST_PER_SECOND: Record<string, number> = {
  'fal-ai/kling-video/v3/pro/text-to-video': 2.5,
  'fal-ai/kling-video/v3/pro/image-to-video': 2.5,
  'fal-ai/kling-video/v2/master/text-to-video': 2.0,
  'fal-ai/veo3': 5.0,
  'fal-ai/wan-ai/wan2.1-i2v-720p': 1.5,
};

const DEFAULT_COST_PER_SECOND = 2.5;

// ---------------------------------------------------------------------------
// Cell update helper
// ---------------------------------------------------------------------------

async function updateDynamicTableCell(
  svc: ReturnType<typeof createClient>,
  job: { id: string; dynamic_table_row_id: string | null; dynamic_table_id: string | null; model_id: string },
  cellValue: Record<string, unknown>,
): Promise<void> {
  if (!job.dynamic_table_row_id) return;

  let tableId = job.dynamic_table_id;
  if (!tableId) {
    const { data: row } = await svc
      .from('dynamic_table_rows')
      .select('table_id')
      .eq('id', job.dynamic_table_row_id)
      .maybeSingle();
    tableId = row?.table_id ?? null;
  }

  if (!tableId) return;

  const { data: videoCol } = await svc
    .from('dynamic_table_columns')
    .select('id')
    .eq('table_id', tableId)
    .eq('column_type', 'fal_video')
    .maybeSingle();

  if (!videoCol?.id) return;

  await svc.from('dynamic_table_cells').upsert(
    {
      row_id: job.dynamic_table_row_id,
      column_id: videoCol.id,
      value: JSON.stringify(cellValue),
    },
    { onConflict: 'row_id,column_id' },
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json();
    const requestId: string | undefined = body.request_id;
    const webhookStatus: string | undefined = body.status; // "OK" or "ERROR"

    if (!requestId) {
      console.warn('[fal-video-webhook] Missing request_id in payload');
      return errorResponse('Missing request_id', req, 400);
    }

    console.log(`[fal-video-webhook] Received callback for request_id=${requestId}, status=${webhookStatus}`);

    // Look up the job by fal_request_id
    const { data: job, error: jobError } = await svc
      .from('fal_video_jobs')
      .select('id, org_id, user_id, model_id, fal_request_id, status, input_config, dynamic_table_row_id, dynamic_table_id, created_at, credit_cost')
      .eq('fal_request_id', requestId)
      .maybeSingle();

    if (jobError) {
      console.error('[fal-video-webhook] DB lookup error:', jobError.message);
      return errorResponse(jobError.message, req, 500);
    }

    if (!job) {
      console.warn(`[fal-video-webhook] No job found for request_id=${requestId}`);
      return jsonResponse({ ignored: true, reason: 'no matching job' }, req);
    }

    // Skip if job is already in a terminal state
    if (job.status === 'completed' || job.status === 'failed') {
      console.log(`[fal-video-webhook] Job ${job.id} already ${job.status} — ignoring webhook`);
      return jsonResponse({ ignored: true, reason: `already ${job.status}` }, req);
    }

    // -----------------------------------------------------------------------
    // ERROR from fal.ai
    // -----------------------------------------------------------------------
    if (webhookStatus === 'ERROR' || body.error) {
      const falErrMsg = body.error
        ?? body.payload?.detail?.[0]?.msg
        ?? 'Generation failed on fal.ai';
      console.error(`[fal-video-webhook] fal.ai reported error for job ${job.id}:`, falErrMsg);

      await svc.from('fal_video_jobs').update({
        status: 'failed',
        error_message: falErrMsg,
        credit_cost: 0,
      }).eq('id', job.id);

      await updateDynamicTableCell(svc, job, {
        status: 'failed',
        error_message: falErrMsg,
        fal_job_id: job.id,
        model_id: job.model_id,
      });

      return jsonResponse({ job_id: job.id, status: 'failed' }, req);
    }

    // -----------------------------------------------------------------------
    // SUCCESS — extract video URL from payload
    // -----------------------------------------------------------------------
    const payload = body.payload;
    const payloadError = body.payload_error;
    const videoUrl = payload?.video?.url;

    if (!videoUrl) {
      const errMsg = payloadError
        ? `Payload serialization error: ${payloadError}`
        : 'Webhook received OK status but no video URL in payload';
      console.error(`[fal-video-webhook] ${errMsg} — job ${job.id}`, JSON.stringify(payload ?? payloadError).slice(0, 500));

      await svc.from('fal_video_jobs').update({
        status: 'failed',
        error_message: errMsg,
        credit_cost: 0,
      }).eq('id', job.id);

      await updateDynamicTableCell(svc, job, {
        status: 'failed',
        error_message: errMsg,
        fal_job_id: job.id,
        model_id: job.model_id,
      });

      return jsonResponse({ job_id: job.id, status: 'failed', error: errMsg }, req);
    }

    // Download and upload to Supabase Storage
    let storageUrl: string | null = null;
    try {
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video from fal.ai CDN (${videoResponse.status})`);
      }
      const videoBuffer = await videoResponse.arrayBuffer();

      const storagePath = `${job.org_id}/${job.id}.mp4`;
      const { error: uploadError } = await svc.storage
        .from('fal-videos')
        .upload(storagePath, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (uploadError) {
        console.warn(`[fal-video-webhook] Storage upload failed for job ${job.id}:`, uploadError.message);
      } else {
        const { data: urlData } = svc.storage.from('fal-videos').getPublicUrl(storagePath);
        storageUrl = urlData?.publicUrl ?? null;
      }
    } catch (storageErr) {
      console.warn(`[fal-video-webhook] Storage download/upload failed for job ${job.id}:`, storageErr);
    }

    // Compute credit cost
    const costPerSecond = MODEL_COST_PER_SECOND[job.model_id] ?? DEFAULT_COST_PER_SECOND;
    const duration = parseInt(String(job.input_config?.duration ?? '5'), 10) || 5;
    const actualCost = costPerSecond * duration;

    // Update fal_video_jobs record
    await svc.from('fal_video_jobs').update({
      status: 'completed',
      video_url: videoUrl,
      storage_url: storageUrl,
      duration_seconds: duration,
      credit_cost: actualCost,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id);

    // Charge credits
    await logFlatRateCostEvent(
      svc,
      job.user_id,
      job.org_id,
      'fal.ai',
      job.model_id,
      actualCost,
      'fal_video_generation',
      { job_id: job.id, duration, model: job.model_id },
    );

    // Update ops table cell
    await updateDynamicTableCell(svc, job, {
      status: 'completed',
      video_url: videoUrl,
      storage_url: storageUrl,
      thumbnail_url: null,
      model_id: job.model_id,
      duration_seconds: duration,
      fal_job_id: job.id,
      credit_cost: actualCost,
    });

    console.log(`[fal-video-webhook] Job ${job.id} completed via webhook — ${duration}s, ${actualCost} credits`);
    return jsonResponse({ job_id: job.id, status: 'completed', credit_cost: actualCost }, req);

  } catch (err) {
    console.error('[fal-video-webhook] Error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500);
  }
});
