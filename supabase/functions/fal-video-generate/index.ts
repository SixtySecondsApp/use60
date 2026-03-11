/**
 * fal-video-generate
 *
 * POST /fal-video-generate
 *
 * Modes:
 *   1. Ops table mode: { model_id, prompt_template, table_id, row_ids[], image_column_key?, duration?, aspect_ratio?, generate_audio? }
 *      - Reads row data from ops table, interpolates prompt per row
 *      - For image-to-video: reads image URL from specified column
 *      - Writes status + job info back to the fal_video column cell
 *
 *   2. Direct mode: { model_id, prompt, image_url?, duration?, aspect_ratio?, generate_audio? }
 *      - Uses provided prompt/image directly
 *
 * Variables in prompt_template: {{column_key}} replaced per row
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { createFalClient } from '../_shared/fal.ts';
import { checkCreditBalance } from '../_shared/costTracking.ts';

interface FalVideoGenerateRequest {
  model_id: string;            // e.g. 'fal-ai/kling-video/v3/pro/text-to-video'
  prompt_template?: string;    // with {{column_key}} variables (ops table mode)
  prompt?: string;             // direct mode
  // Ops table mode
  table_id?: string;
  row_ids?: string[];
  image_column_key?: string;   // column containing image URLs (for I2V)
  // Video settings
  duration?: string;           // "3" | "5" | "10" | "15"
  aspect_ratio?: string;       // "16:9" | "9:16" | "1:1"
  negative_prompt?: string;
  generate_audio?: boolean;
}

const MAX_BATCH = 50;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

function interpolateScript(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{([\w\s]+?)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    const snakeKey = key.replace(/\s+/g, '_');
    return vars[key] ?? vars[snakeKey] ?? match;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', req, 401);

    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return errorResponse('Unauthorized', req, 401);

    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return errorResponse('No organization found', req, 403);

    const orgId = membership.org_id;
    const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const fal = await createFalClient(svc, orgId);

    // Pre-flight credit check
    const creditCheck = await checkCreditBalance(svc, orgId);
    if (!creditCheck.allowed) {
      return errorResponse('Insufficient credits — please top up to generate videos', req, 402);
    }

    const body: FalVideoGenerateRequest = await req.json();

    if (!body.model_id) return errorResponse('model_id required', req, 400);
    if (!body.prompt_template && !body.prompt?.trim()) {
      return errorResponse('prompt or prompt_template required', req, 400);
    }
    if (body.row_ids && body.row_ids.length > MAX_BATCH) {
      return errorResponse(`Maximum ${MAX_BATCH} rows per batch`, req, 400);
    }

    // ── Look up model pricing ──────────────────────────────────────
    const { data: modelInfo } = await svc
      .from('fal_video_models')
      .select('credit_cost_per_second')
      .eq('id', body.model_id)
      .maybeSingle();

    const costPerSecond = modelInfo?.credit_cost_per_second ?? 2.5;
    const durationSeconds = parseInt(body.duration || '5');
    const estimatedCost = costPerSecond * durationSeconds;

    // ── Build entry list ───────────────────────────────────────────
    type RowEntry = {
      rowId: string | null;
      vars: Record<string, string | undefined>;
      label: string;
      image_url?: string; // Resolved from image_column_key per row
    };

    const entries: RowEntry[] = [];
    let videoColumnId: string | null = null;

    if (body.table_id && body.row_ids?.length) {
      // Ops table mode — read row data
      const rowIds = body.row_ids.slice(0, MAX_BATCH);

      // Get all columns for this table (to map column_id ↔ key)
      const { data: columns } = await svc
        .from('dynamic_table_columns')
        .select('id, key, column_type')
        .eq('table_id', body.table_id);

      const colIdToKey: Record<string, string> = {};
      const colKeyToId: Record<string, string> = {};
      for (const col of columns || []) {
        colIdToKey[col.id] = col.key;
        colKeyToId[col.key] = col.id;
        if (col.column_type === 'fal_video') {
          videoColumnId = col.id;
        }
      }

      // Resolve image column ID if using image_column_key
      const imageColumnId = body.image_column_key ? colKeyToId[body.image_column_key] : null;

      // Get rows + cells
      const { data: rows } = await svc
        .from('dynamic_table_rows')
        .select('id, dynamic_table_cells(column_id, value)')
        .in('id', rowIds);

      for (const row of rows || []) {
        const vars: Record<string, string | undefined> = {};
        let rowImageUrl: string | undefined;

        for (const cell of (row as any).dynamic_table_cells || []) {
          const key = colIdToKey[cell.column_id];
          if (key && cell.value) vars[key] = cell.value;

          // Extract image URL from referenced column (may be raw URL or JSON with url field)
          if (imageColumnId && cell.column_id === imageColumnId && cell.value) {
            try {
              const parsed = JSON.parse(cell.value);
              rowImageUrl = parsed.url || parsed.image_url || parsed.src || undefined;
            } catch {
              // Not JSON — treat as raw URL
              rowImageUrl = cell.value;
            }
          }
        }

        entries.push({
          rowId: row.id,
          vars,
          label: vars.first_name
            ? `${vars.first_name} ${vars.last_name || ''} @ ${vars.company_name || vars.company || ''}`
            : `Row ${row.id.slice(0, 8)}`,
          image_url: rowImageUrl,
        });
      }

      // Write "pending" status to video cells immediately
      if (videoColumnId) {
        const pendingCells = entries.map(e => ({
          row_id: e.rowId!,
          column_id: videoColumnId!,
          value: JSON.stringify({ status: 'pending' }),
        }));
        await svc
          .from('dynamic_table_cells')
          .upsert(pendingCells, { onConflict: 'row_id,column_id' });
      }
    } else {
      // Direct mode — single entry with provided prompt/image
      entries.push({
        rowId: null,
        vars: {},
        label: 'Direct Video',
        image_url: body.image_url,
      });
    }

    // ── Generate videos ────────────────────────────────────────────
    const webhookUrl = `${SUPABASE_URL}/functions/v1/fal-video-webhook`;

    const results: Array<{
      row_id: string | null;
      job_id?: string;
      fal_request_id?: string;
      error?: string;
    }> = [];

    for (const entry of entries) {
      // Hoist jobRecord so the catch block can reference it for precise updates
      let jobRecord: { id: string } | null = null;

      try {
        // Resolve prompt: interpolate template (ops mode) or use direct prompt
        const resolvedPrompt = body.prompt_template
          ? interpolateScript(body.prompt_template, entry.vars)
          : body.prompt!;

        // Resolve image URL: per-row (ops mode) or direct
        const resolvedImageUrl = entry.image_url;

        // Build fal.ai input
        const falInput: Record<string, unknown> = {
          prompt: resolvedPrompt,
          ...(resolvedImageUrl && { image_url: resolvedImageUrl }),
          ...(body.duration && { duration: body.duration }),
          ...(body.aspect_ratio && { aspect_ratio: body.aspect_ratio }),
          ...(body.negative_prompt && { negative_prompt: body.negative_prompt }),
          ...(body.generate_audio !== undefined && { generate_audio: body.generate_audio }),
        };

        // Insert fal_video_jobs record BEFORE calling fal.ai to avoid race condition
        const { data: jobData, error: insertError } = await svc
          .from('fal_video_jobs')
          .insert({
            org_id: orgId,
            user_id: user.id,
            fal_request_id: 'pending',
            model_id: body.model_id,
            status: 'pending',
            prompt: resolvedPrompt,
            input_config: {
              duration: body.duration,
              aspect_ratio: body.aspect_ratio,
              negative_prompt: body.negative_prompt,
              generate_audio: body.generate_audio,
              image_url: resolvedImageUrl,
            },
            estimated_cost: estimatedCost,
            dynamic_table_row_id: entry.rowId || null,
            dynamic_table_id: body.table_id || null,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[fal-video-generate] DB insert error:', insertError);
        }
        jobRecord = jobData;

        // Submit to fal.ai queue
        const queueResult = await fal.submitJob(body.model_id, falInput as any, webhookUrl);

        // Update job record with real fal_request_id
        if (jobRecord) {
          await svc
            .from('fal_video_jobs')
            .update({ fal_request_id: queueResult.request_id })
            .eq('id', jobRecord.id);
        }

        // Update cell to processing with job info
        if (videoColumnId && entry.rowId && jobRecord) {
          await svc
            .from('dynamic_table_cells')
            .upsert({
              row_id: entry.rowId,
              column_id: videoColumnId,
              value: JSON.stringify({
                status: 'processing',
                fal_job_id: jobRecord.id,
                model_id: body.model_id,
              }),
            }, { onConflict: 'row_id,column_id' });
        }

        results.push({
          row_id: entry.rowId,
          job_id: jobRecord?.id,
          fal_request_id: queueResult.request_id,
        });
      } catch (err) {
        // ── Classify the error ──────────────────────────────────────
        const isFalError = err && typeof err === 'object' && 'status' in err;

        const isRateLimit = isFalError && (
          (err as any).status === 429 ||
          (err as any).code === 'RATE_LIMITED'
        );

        const isContentRejection = !isRateLimit && isFalError && (
          (err as any).status === 422 ||
          (err as any).message?.toLowerCase().includes('content') ||
          (err as any).message?.toLowerCase().includes('moderation') ||
          (err as any).message?.toLowerCase().includes('policy') ||
          (err as any).message?.toLowerCase().includes('nsfw')
        );

        if (isRateLimit) {
          console.warn('[fal-video-generate] Rate limited by fal.ai — stopping batch early');

          // Mark remaining unprocessed entries (this one + all subsequent) as pending for retry
          const remainingEntries = entries.slice(entries.indexOf(entry));
          if (videoColumnId) {
            const pendingCells = remainingEntries
              .filter(e => e.rowId)
              .map(e => ({
                row_id: e.rowId!,
                column_id: videoColumnId!,
                value: JSON.stringify({ status: 'pending' }),
              }));
            if (pendingCells.length > 0) {
              await svc
                .from('dynamic_table_cells')
                .upsert(pendingCells, { onConflict: 'row_id,column_id' });
            }
          }

          results.push({
            row_id: entry.rowId,
            error: 'Rate limited — will retry',
          });

          // Stop processing remaining entries
          break;
        }

        const errorMessage = isContentRejection
          ? 'Content rejected by AI model — try a different prompt'
          : (err instanceof Error ? err.message : 'Generation failed');

        if (isContentRejection) {
          console.warn('[fal-video-generate] Content rejected by fal.ai for entry:', entry.label, err);
        } else {
          console.error('[fal-video-generate] Error for entry:', entry.label, err);
        }

        // Write failure to cell
        if (videoColumnId && entry.rowId) {
          await svc
            .from('dynamic_table_cells')
            .upsert({
              row_id: entry.rowId,
              column_id: videoColumnId,
              value: JSON.stringify({
                status: 'failed',
                error_message: errorMessage,
              }),
            }, { onConflict: 'row_id,column_id' });
        }

        // Update job record to failed if it was already created
        // jobRecord is hoisted from the try block — it's set after the DB insert,
        // before fal.submitJob, so it will be available for content rejections.
        // Credits are never charged for failed jobs — set credit_cost: 0.
        if (jobRecord) {
          await svc
            .from('fal_video_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage,
              credit_cost: 0,
            })
            .eq('id', jobRecord.id);
        } else if (entry.rowId) {
          // Fallback: insert happened but jobRecord wasn't captured — find by row + pending state
          await svc
            .from('fal_video_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage,
              credit_cost: 0,
            })
            .eq('dynamic_table_row_id', entry.rowId)
            .eq('fal_request_id', 'pending')
            .eq('status', 'pending');
        }

        results.push({
          row_id: entry.rowId,
          error: errorMessage,
        });
      }
    }

    const succeeded = results.filter(r => r.job_id);
    const failed = results.filter(r => r.error);
    const rateLimitHit = results.some(r => r.error === 'Rate limited — will retry');

    return jsonResponse({
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      rate_limit_hit: rateLimitHit,
      jobs: results,
    }, req);

  } catch (err) {
    console.error('[fal-video-generate] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
