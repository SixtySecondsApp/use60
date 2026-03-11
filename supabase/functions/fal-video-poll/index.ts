/**
 * fal-video-poll — Poll fal.ai for pending/processing video jobs and download to Supabase Storage
 *
 * Two modes:
 *   - poll_all  (cron/batch, no user auth): polls all pending/processing jobs created in the last hour
 *   - poll_single (authenticated user): polls one specific job by id
 *
 * Deploy with --no-verify-jwt on staging (ES256 JWT issue + cron callers have no user JWT).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { FalClient, FalVideoOutput, createFalClient } from '../_shared/fal.ts';
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
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FalVideoJob {
  id: string;
  org_id: string;
  user_id: string;
  model_id: string;
  fal_request_id: string;
  status: string;
  input_config: Record<string, unknown> | null;
  dynamic_table_row_id: string | null;
  dynamic_table_id: string | null;
  created_at: string;
  credit_cost: number | null;
}

type PollResult =
  | { id: string; status: 'completed'; storage_url: string; credit_cost: number }
  | { id: string; status: 'processing' }
  | { id: string; status: 'failed'; error: string }
  | { id: string; status: 'skipped'; reason: string }
  | { id: string; status: 'poll_error'; error: string };

// ---------------------------------------------------------------------------
// Cell update helper — upserts a fal_video column cell in dynamic_table_cells
// ---------------------------------------------------------------------------

async function updateDynamicTableCell(
  svc: ReturnType<typeof createClient>,
  job: FalVideoJob,
  cellValue: Record<string, unknown>,
): Promise<void> {
  if (!job.dynamic_table_row_id) return;

  // Resolve table_id: prefer the job's stored value, fall back to looking up the row
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
// Process a single job — shared between poll_all and poll_single
// ---------------------------------------------------------------------------

async function processJob(
  svc: ReturnType<typeof createClient>,
  job: FalVideoJob,
  fal: FalClient,
): Promise<PollResult> {
  if (!job.fal_request_id) {
    return { id: job.id, status: 'skipped', reason: 'no fal_request_id' };
  }

  // Jobs stuck with fal_request_id = 'pending' means the DB update after submitJob failed.
  // We can't recover without the real request ID — time them out if they're old enough.
  if (job.fal_request_id === 'pending') {
    const ageMs = Date.now() - new Date(job.created_at).getTime();
    if (ageMs > JOB_TIMEOUT_MS) {
      const stuckMsg = 'Job submission incomplete — no fal request ID recorded (timed out)';
      console.warn(`[fal-video-poll] Job ${job.id} stuck with fal_request_id='pending' for >10min — marking failed`);
      await svc.from('fal_video_jobs').update({
        status: 'failed',
        error_message: stuckMsg,
        credit_cost: 0,
      }).eq('id', job.id);

      await updateDynamicTableCell(svc, job, {
        status: 'failed',
        error_message: stuckMsg,
        fal_job_id: job.id,
        model_id: job.model_id,
      });

      return { id: job.id, status: 'failed', error: stuckMsg };
    }
    // Not old enough yet — leave it as pending, will be picked up next poll cycle
    return { id: job.id, status: 'skipped', reason: 'fal_request_id not yet assigned — waiting for submit to complete' };
  }

  try {
    const falStatus = await fal.getJobStatus(job.model_id, job.fal_request_id);

    // -----------------------------------------------------------------------
    // COMPLETED
    // -----------------------------------------------------------------------
    if (falStatus.status === 'COMPLETED') {
      const result = await fal.getJobResult<FalVideoOutput>(job.model_id, job.fal_request_id);

      if (!result?.video?.url) {
        // Mark failed — result has no usable URL
        const errMsg = 'Completed but video URL missing in fal.ai result';
        console.error(`[fal-video-poll] Job ${job.id} completed on fal.ai but result has no video URL`);
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

        return { id: job.id, status: 'failed', error: errMsg };
      }

      // 1. Download video from fal.ai CDN and upload to Supabase Storage
      //    Storage errors are non-fatal — the fal.ai CDN URL is used as fallback.
      let storageUrl: string | null = null;
      try {
        const videoResponse = await fetch(result.video.url);
        if (!videoResponse.ok) {
          throw new Error(`Failed to download video from fal.ai CDN (${videoResponse.status})`);
        }
        const videoBuffer = await videoResponse.arrayBuffer();

        // 2. Upload to Supabase Storage (fal-videos bucket)
        const storagePath = `${job.org_id}/${job.id}.mp4`;
        const { error: uploadError } = await svc.storage
          .from('fal-videos')
          .upload(storagePath, videoBuffer, {
            contentType: 'video/mp4',
            upsert: true,
          });

        if (uploadError) {
          console.warn(`[fal-video-poll] Storage upload failed for job ${job.id}:`, uploadError.message);
        } else {
          const { data: urlData } = svc.storage.from('fal-videos').getPublicUrl(storagePath);
          storageUrl = urlData?.publicUrl ?? null;
        }
      } catch (storageErr) {
        console.warn(`[fal-video-poll] Storage download/upload failed for job ${job.id}:`, storageErr);
        // storageUrl remains null — cell will fall back to video_url (fal.ai CDN)
      }

      // 3. Compute credit cost
      const costPerSecond = MODEL_COST_PER_SECOND[job.model_id] ?? DEFAULT_COST_PER_SECOND;
      const duration = parseInt(String(job.input_config?.duration ?? '5'), 10) || 5;
      const actualCost = costPerSecond * duration;

      // 4. Update fal_video_jobs record
      await svc.from('fal_video_jobs').update({
        status: 'completed',
        video_url: result.video.url,
        storage_url: storageUrl,
        duration_seconds: duration,
        credit_cost: actualCost,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      // 5. Charge credits (fire-and-forget style — logFlatRateCostEvent never throws)
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

      // 6. Update ops table cell if linked
      await updateDynamicTableCell(svc, job, {
        status: 'completed',
        video_url: result.video.url,
        storage_url: storageUrl,
        thumbnail_url: null,
        model_id: job.model_id,
        duration_seconds: duration,
        fal_job_id: job.id,
        credit_cost: actualCost,
      });

      console.log(`[fal-video-poll] Job ${job.id} completed — ${duration}s, ${actualCost} credits`);
      return { id: job.id, status: 'completed', storage_url: storageUrl ?? result.video.url, credit_cost: actualCost };
    }

    // -----------------------------------------------------------------------
    // ERROR — fal.ai explicitly signals failure
    // -----------------------------------------------------------------------
    if (falStatus.status === 'ERROR' || falStatus.status === 'FAILED') {
      const falErrMsg = (falStatus as any).error ?? (falStatus as any).message ?? 'Generation failed on fal.ai';
      console.error(`[fal-video-poll] fal.ai reported error for job ${job.id}:`, falErrMsg);

      await svc.from('fal_video_jobs').update({
        status: 'failed',
        error_message: falErrMsg,
        // Credits are charged on completion only — no deduction for failed jobs
        credit_cost: 0,
      }).eq('id', job.id);

      await updateDynamicTableCell(svc, job, {
        status: 'failed',
        error_message: falErrMsg,
        fal_job_id: job.id,
        model_id: job.model_id,
      });

      return { id: job.id, status: 'failed', error: falErrMsg };
    }

    // -----------------------------------------------------------------------
    // IN_PROGRESS / IN_QUEUE
    // -----------------------------------------------------------------------
    if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
      // Promote from pending → processing on first IN_PROGRESS/IN_QUEUE response
      if (job.status === 'pending') {
        await svc.from('fal_video_jobs').update({ status: 'processing' }).eq('id', job.id);

        // Reflect processing state in the cell too
        await updateDynamicTableCell(svc, job, {
          status: 'processing',
          model_id: job.model_id,
          fal_job_id: job.id,
        });
      }

      return { id: job.id, status: 'processing' };
    }

    // Unknown status — treat as still processing
    return { id: job.id, status: 'processing' };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[fal-video-poll] Status check failed for job ${job.id}:`, errMsg);

    // Only mark permanently failed if the job has been stuck for > 10 minutes
    const ageMs = Date.now() - new Date(job.created_at).getTime();
    if (ageMs > JOB_TIMEOUT_MS) {
      const timeoutMsg = 'Generation timed out after 10 minutes';
      await svc.from('fal_video_jobs').update({
        status: 'failed',
        error_message: timeoutMsg,
        // Credits are charged on completion only — no deduction for timed-out jobs
        credit_cost: 0,
      }).eq('id', job.id);

      await updateDynamicTableCell(svc, job, {
        status: 'failed',
        error_message: timeoutMsg,
        fal_job_id: job.id,
        model_id: job.model_id,
      });

      return { id: job.id, status: 'failed', error: timeoutMsg };
    }

    return { id: job.id, status: 'poll_error', error: errMsg };
  }
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
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? 'poll_all';

    // -------------------------------------------------------------------------
    // Mode 2: poll_single — authenticated user request
    // -------------------------------------------------------------------------
    if (action === 'poll_single') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return errorResponse('Missing Authorization header', req, 401);

      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return errorResponse('Unauthorized', req, 401);

      const jobId: string | undefined = body.job_id;
      if (!jobId) return errorResponse('job_id is required for poll_single', req, 400);

      const { data: job, error: jobError } = await svc
        .from('fal_video_jobs')
        .select('id, org_id, user_id, model_id, fal_request_id, status, input_config, dynamic_table_row_id, dynamic_table_id, created_at, credit_cost')
        .eq('id', jobId)
        .eq('user_id', user.id)   // Ensure user owns this job
        .maybeSingle();

      if (jobError) return errorResponse(jobError.message, req, 500);
      if (!job) return errorResponse('Job not found', req, 404);

      const fal = await createFalClient(svc, job.org_id);
      const result = await processJob(svc, job as FalVideoJob, fal);

      return jsonResponse({ job_id: jobId, result }, req);
    }

    // -------------------------------------------------------------------------
    // Mode 1: poll_all — cron/batch, no user auth required
    // -------------------------------------------------------------------------
    const { data: jobs, error: fetchError } = await svc
      .from('fal_video_jobs')
      .select('id, org_id, user_id, model_id, fal_request_id, status, input_config, dynamic_table_row_id, dynamic_table_id, created_at, credit_cost')
      .in('status', ['pending', 'processing'])
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // last 1 hour
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) return errorResponse(fetchError.message, req, 500);
    if (!jobs?.length) return jsonResponse({ polled: 0, completed: 0, failed: 0, still_processing: 0 }, req);

    console.log(`[fal-video-poll] Polling ${jobs.length} job(s)`);

    // Group jobs by org so we can reuse the same FalClient per org
    const orgClientCache = new Map<string, FalClient>();
    const getFalForOrg = async (orgId: string): Promise<FalClient> => {
      if (!orgClientCache.has(orgId)) {
        orgClientCache.set(orgId, await createFalClient(svc, orgId));
      }
      return orgClientCache.get(orgId)!;
    };

    let completedCount = 0;
    let failedCount = 0;
    let stillProcessingCount = 0;
    const results: PollResult[] = [];

    for (const job of jobs as FalVideoJob[]) {
      const fal = await getFalForOrg(job.org_id);
      const result = await processJob(svc, job, fal);
      results.push(result);

      if (result.status === 'completed') completedCount++;
      else if (result.status === 'failed') failedCount++;
      else if (result.status === 'processing') stillProcessingCount++;
    }

    return jsonResponse({
      polled: jobs.length,
      completed: completedCount,
      failed: failedCount,
      still_processing: stillProcessingCount,
      results,
    }, req);

  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Internal error', req, 500);
  }
});
