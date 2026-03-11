/**
 * ai-image-generate
 *
 * POST /ai-image-generate
 *
 * Actions:
 *   1. generate — Submit Nano Banana 2 image generation jobs for ops table rows.
 *      Reads row data, interpolates prompt template, queues fal.ai jobs.
 *
 *   2. poll — Check pending/processing jobs, download completed images to storage,
 *      deduct credits, update cells.
 *
 *   3. edit — Same as generate but uses the /edit endpoint with a source image.
 *
 * Variables in prompt: {{column_key}} replaced per row context.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { createFalClient, FalImageInput, FalImageOutput, FAL_MODELS } from '../_shared/fal.ts';
import { INTEGRATION_CREDIT_COSTS, deductCreditsOrdered } from '../_shared/creditPacks.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateRequest {
  action: 'generate';
  org_id: string;
  user_id: string;
  table_id: string;
  column_id: string;
  row_ids: string[];
  model_id?: string;
  resolution?: string;
  aspect_ratio?: string;
}

interface PollRequest {
  action: 'poll';
  org_id: string;
  user_id: string;
  job_ids?: string[];
}

interface EditRequest {
  action: 'edit';
  org_id: string;
  user_id: string;
  table_id: string;
  column_id: string;
  row_ids: string[];
  model_id?: string;
  resolution?: string;
  aspect_ratio?: string;
}

type RequestBody = GenerateRequest | PollRequest | EditRequest;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH = 50;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Map resolution to credit cost key */
const RESOLUTION_COST_MAP: Record<string, keyof typeof INTEGRATION_CREDIT_COSTS> = {
  '0.5K': 'nano_banana_2_05k',
  '1K': 'nano_banana_2_1k',
  '2K': 'nano_banana_2_2k',
  '4K': 'nano_banana_2_4k',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolatePrompt(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{([\w\s]+?)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    const snakeKey = key.replace(/\s+/g, '_');
    return vars[key] ?? vars[snakeKey] ?? match;
  });
}

function getCreditCost(resolution: string): number {
  const costKey = RESOLUTION_COST_MAP[resolution];
  if (costKey) return INTEGRATION_CREDIT_COSTS[costKey];
  // Default to 1K cost
  return INTEGRATION_CREDIT_COSTS.nano_banana_2_1k;
}

function jsonResponse(data: unknown, req: Request, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, req: Request, status = 400): Response {
  return jsonResponse({ error: message }, req, status);
}

// ---------------------------------------------------------------------------
// Action: generate / edit
// ---------------------------------------------------------------------------

async function handleGenerate(
  body: GenerateRequest | EditRequest,
  userId: string,
  orgId: string,
  req: Request,
): Promise<Response> {
  const isEdit = body.action === 'edit';
  const { table_id, column_id, row_ids } = body;

  if (!table_id || !column_id || !row_ids?.length) {
    return errorResponse('table_id, column_id, and row_ids[] are required', req);
  }

  if (row_ids.length > MAX_BATCH) {
    return errorResponse(`Maximum ${MAX_BATCH} rows per batch`, req);
  }

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const falClient = await createFalClient(svc, orgId);

  // Fetch column config for prompt_template, resolution, aspect_ratio
  const { data: column, error: colError } = await svc
    .from('dynamic_table_columns')
    .select('id, key, integration_config')
    .eq('id', column_id)
    .maybeSingle();

  if (colError || !column) {
    return errorResponse('Column not found', req, 404);
  }

  const config = (column.integration_config as Record<string, unknown>) || {};
  const promptTemplate = (config.prompt_template as string) || '';
  const resolution = body.resolution || (config.resolution as string) || '1K';
  const aspectRatio = body.aspect_ratio || (config.aspect_ratio as string) || '1:1';
  const modelId = body.model_id || (config.model_id as string) || FAL_MODELS.NANO_BANANA_2;

  if (!promptTemplate) {
    return errorResponse('No prompt_template configured on column', req);
  }

  // Determine the fal.ai endpoint
  const falEndpoint = isEdit ? FAL_MODELS.NANO_BANANA_2_EDIT : (modelId || FAL_MODELS.NANO_BANANA_2);

  // Get all columns for this table (to map column_id -> key)
  const { data: columns } = await svc
    .from('dynamic_table_columns')
    .select('id, key')
    .eq('table_id', table_id);

  const colIdToKey: Record<string, string> = {};
  for (const col of columns || []) {
    colIdToKey[col.id] = col.key;
  }

  // Fetch all rows + cells
  const batchRowIds = row_ids.slice(0, MAX_BATCH);
  const { data: rows } = await svc
    .from('dynamic_table_rows')
    .select('id, dynamic_table_cells(column_id, value)')
    .in('id', batchRowIds);

  // Write "pending" status to all target cells immediately
  const pendingCells = batchRowIds.map(rowId => ({
    row_id: rowId,
    column_id,
    value: JSON.stringify({ status: 'pending', model_id: modelId }),
  }));
  await svc
    .from('dynamic_table_cells')
    .upsert(pendingCells, { onConflict: 'row_id,column_id' });

  // Process each row
  const results: Array<{
    row_id: string;
    ai_image_job_id?: string;
    error?: string;
  }> = [];

  for (const rowId of batchRowIds) {
    try {
      // Build row context map
      const row = (rows || []).find((r: any) => r.id === rowId);
      const rowContext: Record<string, string | undefined> = {};

      if (row) {
        for (const cell of (row as any).dynamic_table_cells || []) {
          const key = colIdToKey[cell.column_id];
          if (key && cell.value) {
            // Try to extract plain text from JSON cell values
            try {
              const parsed = JSON.parse(cell.value);
              if (typeof parsed === 'string') {
                rowContext[key] = parsed;
              } else if (parsed?.value) {
                rowContext[key] = String(parsed.value);
              } else if (parsed?.text) {
                rowContext[key] = String(parsed.text);
              } else {
                rowContext[key] = cell.value;
              }
            } catch {
              rowContext[key] = cell.value;
            }
          }
        }
      }

      // Interpolate prompt
      const prompt = interpolatePrompt(promptTemplate, rowContext);

      // Create ai_image_jobs record
      const { data: job, error: jobError } = await svc
        .from('ai_image_jobs')
        .insert({
          org_id: orgId,
          user_id: userId,
          model_id: modelId,
          status: 'pending',
          prompt,
          input_config: { aspect_ratio: aspectRatio, resolution, num_images: 1 },
          estimated_cost: getCreditCost(resolution),
          dynamic_table_row_id: rowId,
          dynamic_table_id: table_id,
          dynamic_table_column_id: column_id,
        })
        .select('id')
        .single();

      if (jobError || !job) {
        console.error('[ai-image-generate] Job insert error:', jobError);
        results.push({ row_id: rowId, error: 'Failed to create job record' });
        continue;
      }

      // Update cell with pending status + job ID
      await svc
        .from('dynamic_table_cells')
        .upsert({
          row_id: rowId,
          column_id,
          value: JSON.stringify({
            status: 'pending',
            model_id: modelId,
            ai_image_job_id: job.id,
          }),
        }, { onConflict: 'row_id,column_id' });

      // Build fal.ai input
      const falInput: FalImageInput = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution,
        num_images: 1,
      };

      // For edit mode, get source image from cell config or row context
      if (isEdit) {
        const imageColumnKey = config.image_column_key as string | undefined;
        let sourceImageUrl: string | undefined;

        if (imageColumnKey && rowContext[imageColumnKey]) {
          // Try to parse as JSON to extract image_url or storage_url
          try {
            const parsed = JSON.parse(rowContext[imageColumnKey]!);
            sourceImageUrl = parsed.storage_url || parsed.image_url || parsed.url || rowContext[imageColumnKey];
          } catch {
            sourceImageUrl = rowContext[imageColumnKey];
          }
        }

        if (!sourceImageUrl) {
          // Update job and cell as failed
          await svc.from('ai_image_jobs').update({ status: 'failed', error_message: 'No source image found for edit' }).eq('id', job.id);
          await svc.from('dynamic_table_cells').upsert({
            row_id: rowId,
            column_id,
            value: JSON.stringify({ status: 'failed', error_message: 'No source image', ai_image_job_id: job.id }),
          }, { onConflict: 'row_id,column_id' });
          results.push({ row_id: rowId, ai_image_job_id: job.id, error: 'No source image found' });
          continue;
        }

        falInput.image_url = sourceImageUrl;
      }

      // Submit to fal.ai queue
      const queueResponse = await falClient.submitJob(
        falEndpoint,
        falInput as any, // FalImageInput is structurally compatible
      );

      // Update job with fal_request_id and status
      await svc
        .from('ai_image_jobs')
        .update({
          fal_request_id: queueResponse.request_id,
          status: 'processing',
        })
        .eq('id', job.id);

      // Update cell to processing
      await svc
        .from('dynamic_table_cells')
        .upsert({
          row_id: rowId,
          column_id,
          value: JSON.stringify({
            status: 'processing',
            model_id: modelId,
            ai_image_job_id: job.id,
          }),
        }, { onConflict: 'row_id,column_id' });

      results.push({ row_id: rowId, ai_image_job_id: job.id });
    } catch (err) {
      console.error('[ai-image-generate] Row error:', rowId, err);

      // Write failure to cell
      await svc
        .from('dynamic_table_cells')
        .upsert({
          row_id: rowId,
          column_id,
          value: JSON.stringify({
            status: 'failed',
            error_message: err instanceof Error ? err.message : 'Generation failed',
          }),
        }, { onConflict: 'row_id,column_id' });

      results.push({
        row_id: rowId,
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  }

  const succeeded = results.filter(r => r.ai_image_job_id && !r.error);
  const failed = results.filter(r => r.error);

  return jsonResponse({
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    jobs: results,
  }, req);
}

// ---------------------------------------------------------------------------
// Action: poll
// ---------------------------------------------------------------------------

async function handlePoll(
  body: PollRequest,
  userId: string,
  orgId: string,
  req: Request,
): Promise<Response> {
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const falClient = await createFalClient(svc, orgId);

  // Find pending/processing jobs for this org
  let query = svc
    .from('ai_image_jobs')
    .select('id, fal_request_id, model_id, status, dynamic_table_row_id, dynamic_table_column_id, input_config')
    .eq('org_id', orgId)
    .in('status', ['pending', 'processing']);

  // If specific job_ids provided, filter to those
  if (body.job_ids?.length) {
    query = query.in('id', body.job_ids);
  }

  const { data: jobs, error: jobsError } = await query.limit(MAX_BATCH);

  if (jobsError) {
    console.error('[ai-image-generate] Poll query error:', jobsError);
    return errorResponse('Failed to query jobs', req, 500);
  }

  if (!jobs?.length) {
    return jsonResponse({ total: 0, completed: 0, failed: 0, still_processing: 0, results: [] }, req);
  }

  const results: Array<{
    job_id: string;
    status: string;
    image_url?: string;
    storage_url?: string;
    error?: string;
  }> = [];

  for (const job of jobs) {
    if (!job.fal_request_id) {
      // Job hasn't been submitted yet — skip
      results.push({ job_id: job.id, status: 'pending' });
      continue;
    }

    try {
      // Check fal.ai job status
      const falStatus = await falClient.getJobStatus(job.model_id, job.fal_request_id);

      if (falStatus.status === 'COMPLETED') {
        // Get the result
        const result = await falClient.getJobResult<FalImageOutput>(job.model_id, job.fal_request_id);

        if (!result.images?.length) {
          // No images returned — mark as failed
          await svc.from('ai_image_jobs').update({
            status: 'failed',
            error_message: 'No images returned from fal.ai',
          }).eq('id', job.id);

          if (job.dynamic_table_row_id && job.dynamic_table_column_id) {
            await svc.from('dynamic_table_cells').upsert({
              row_id: job.dynamic_table_row_id,
              column_id: job.dynamic_table_column_id,
              value: JSON.stringify({ status: 'failed', error_message: 'No images returned', ai_image_job_id: job.id }),
            }, { onConflict: 'row_id,column_id' });
          }

          results.push({ job_id: job.id, status: 'failed', error: 'No images returned' });
          continue;
        }

        const image = result.images[0];
        const seed = result.seed;

        // Download image from fal.ai CDN and upload to Supabase Storage
        let storageUrl: string | undefined;
        try {
          const imageRes = await fetch(image.url);
          if (imageRes.ok) {
            const imageBuffer = await imageRes.arrayBuffer();
            const ext = (image.content_type || 'image/png').includes('jpeg') ? 'jpg' : 'png';
            const storagePath = `${orgId}/${job.id}.${ext}`;

            const { error: uploadError } = await svc.storage
              .from('ai-images')
              .upload(storagePath, imageBuffer, {
                contentType: image.content_type || 'image/png',
                upsert: true,
              });

            if (!uploadError) {
              const { data: urlData } = svc.storage.from('ai-images').getPublicUrl(storagePath);
              storageUrl = urlData.publicUrl;
            } else {
              console.error('[ai-image-generate] Storage upload error:', uploadError);
            }
          }
        } catch (downloadErr) {
          console.error('[ai-image-generate] Image download error:', downloadErr);
          // Continue without storage URL — CDN URL is still available
        }

        // Determine credit cost from resolution
        const inputConfig = (job.input_config as Record<string, unknown>) || {};
        const resolution = (inputConfig.resolution as string) || '1K';
        const creditCost = getCreditCost(resolution);

        // Deduct credits
        const { success: creditSuccess } = await deductCreditsOrdered(
          svc,
          orgId,
          creditCost,
          'ai_image_generate',
          'medium',
          { job_id: job.id, model_id: job.model_id, resolution },
        );

        if (!creditSuccess) {
          console.warn('[ai-image-generate] Credit deduction failed for job:', job.id);
        }

        // Update job record
        await svc.from('ai_image_jobs').update({
          status: 'completed',
          image_url: image.url,
          storage_url: storageUrl || null,
          seed: seed || null,
          credit_cost: creditCost,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id);

        // Update cell
        if (job.dynamic_table_row_id && job.dynamic_table_column_id) {
          await svc.from('dynamic_table_cells').upsert({
            row_id: job.dynamic_table_row_id,
            column_id: job.dynamic_table_column_id,
            value: JSON.stringify({
              status: 'completed',
              image_url: image.url,
              storage_url: storageUrl || undefined,
              seed: seed || undefined,
              model_id: job.model_id,
              credit_cost: creditCost,
              ai_image_job_id: job.id,
            }),
          }, { onConflict: 'row_id,column_id' });
        }

        results.push({
          job_id: job.id,
          status: 'completed',
          image_url: image.url,
          storage_url: storageUrl,
        });

      } else if (falStatus.status === 'IN_QUEUE' || falStatus.status === 'IN_PROGRESS') {
        // Still processing
        results.push({ job_id: job.id, status: 'processing' });
      } else {
        // Unknown status — treat as still processing
        results.push({ job_id: job.id, status: 'processing' });
      }
    } catch (err) {
      console.error('[ai-image-generate] Poll error for job:', job.id, err);

      const errMsg = err instanceof Error ? err.message : 'Poll failed';

      // If it's a definitive error (not transient), mark as failed
      const isFalError = (err as any)?.status && (err as any)?.status >= 400 && (err as any)?.status < 500;
      if (isFalError) {
        await svc.from('ai_image_jobs').update({
          status: 'failed',
          error_message: errMsg,
        }).eq('id', job.id);

        if (job.dynamic_table_row_id && job.dynamic_table_column_id) {
          await svc.from('dynamic_table_cells').upsert({
            row_id: job.dynamic_table_row_id,
            column_id: job.dynamic_table_column_id,
            value: JSON.stringify({ status: 'failed', error_message: errMsg, ai_image_job_id: job.id }),
          }, { onConflict: 'row_id,column_id' });
        }

        results.push({ job_id: job.id, status: 'failed', error: errMsg });
      } else {
        // Transient error — leave as processing for next poll
        results.push({ job_id: job.id, status: 'processing', error: errMsg });
      }
    }
  }

  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const stillProcessing = results.filter(r => r.status === 'processing' || r.status === 'pending').length;

  return jsonResponse({
    total: results.length,
    completed,
    failed,
    still_processing: stillProcessing,
    results,
  }, req);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: getCorsHeaders(req) });
  }

  try {
    // Auth: validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', req, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return errorResponse('Unauthorized', req, 401);

    // Parse request body
    const body: RequestBody = await req.json();

    if (!body.action) return errorResponse('action is required (generate | poll | edit)', req);

    // Resolve org — use body.org_id if provided, otherwise look up membership
    let orgId = body.org_id;
    if (!orgId) {
      const { data: membership } = await userClient
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership) return errorResponse('No organization found', req, 403);
      orgId = membership.org_id;
    }

    const userId = body.user_id || user.id;

    // Route to action handler
    switch (body.action) {
      case 'generate':
        return await handleGenerate(body as GenerateRequest, userId, orgId, req);

      case 'edit':
        return await handleGenerate(body as EditRequest, userId, orgId, req);

      case 'poll':
        return await handlePoll(body as PollRequest, userId, orgId, req);

      default:
        return errorResponse(`Unknown action: ${(body as any).action}. Use generate, poll, or edit.`, req);
    }
  } catch (err) {
    console.error('[ai-image-generate] Unhandled error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
