/**
 * elevenlabs-tts-generate
 *
 * POST /elevenlabs-tts-generate
 *
 * Batch TTS generation for ops table rows.
 * For each row: interpolate script, call ElevenLabs TTS, upload MP3, write URL to cell.
 *
 * Body: {
 *   voice_clone_id: string,
 *   script_template: string,
 *   table_id: string,
 *   row_ids: string[],
 *   audio_column_key: string
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { checkCreditBalance } from '../_shared/costTracking.ts';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const MAX_BATCH = 50;
const MAX_CONCURRENT = 3;

interface TTSRequest {
  voice_clone_id: string;
  script_template: string;
  table_id: string;
  row_ids: string[];
  audio_column_key: string;
}

function interpolateScript(script: string, vars: Record<string, string | undefined>): string {
  return script.replace(/\{\{([\w\s]+?)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    const snakeKey = key.replace(/\s+/g, '_');
    return vars[key] ?? vars[snakeKey] ?? match;
  });
}

/**
 * Get the ElevenLabs API key for this org (BYOK or platform).
 */
async function getApiKey(svc: any, orgId: string): Promise<string> {
  const { data } = await svc
    .from('elevenlabs_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  if (data?.api_key) return data.api_key;

  const platformKey = Deno.env.get('ELEVENLABS_PLATFORM_KEY');
  if (!platformKey) throw new Error('TTS not available — contact support');
  return platformKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // Auth
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

    // Credit check
    const creditCheck = await checkCreditBalance(svc, orgId);
    if (!creditCheck.allowed) {
      return errorResponse('Insufficient credits — please top up to generate audio', req, 402);
    }

    const body: TTSRequest = await req.json();

    if (!body.voice_clone_id) return errorResponse('voice_clone_id required', req, 400);
    if (!body.script_template?.trim()) return errorResponse('script_template required', req, 400);
    if (!body.table_id) return errorResponse('table_id required', req, 400);
    if (!body.row_ids?.length) return errorResponse('row_ids required', req, 400);
    if (!body.audio_column_key) return errorResponse('audio_column_key required', req, 400);

    const rowIds = body.row_ids.slice(0, MAX_BATCH);

    // Get voice clone
    const { data: voice, error: voiceError } = await svc
      .from('voice_clones')
      .select('id, elevenlabs_voice_id, status')
      .eq('id', body.voice_clone_id)
      .eq('org_id', orgId)
      .single();

    if (voiceError || !voice) return errorResponse('Voice not found', req, 404);
    if (voice.status !== 'ready') return errorResponse('Voice is not ready', req, 400);
    if (!voice.elevenlabs_voice_id) return errorResponse('Voice has no ElevenLabs ID', req, 400);

    const apiKey = await getApiKey(svc, orgId);

    // Get columns for this table
    const { data: columns } = await svc
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', body.table_id);

    const colIdToKey: Record<string, string> = {};
    const colKeyToId: Record<string, string> = {};
    for (const col of columns || []) {
      colIdToKey[col.id] = col.key;
      colKeyToId[col.key] = col.id;
    }

    const audioColumnId = colKeyToId[body.audio_column_key];
    if (!audioColumnId) return errorResponse(`Column "${body.audio_column_key}" not found`, req, 404);

    // Create TTS job record
    const { data: job } = await svc
      .from('elevenlabs_tts_jobs')
      .insert({
        org_id: orgId,
        user_id: user.id,
        voice_clone_id: body.voice_clone_id,
        table_id: body.table_id,
        audio_column_id: audioColumnId,
        script_template: body.script_template,
        total_rows: rowIds.length,
        status: 'processing',
      })
      .select('id')
      .single();

    // Get row data
    const { data: rows } = await svc
      .from('dynamic_table_rows')
      .select('id, dynamic_table_cells(column_id, value)')
      .in('id', rowIds);

    // Set all cells to pending
    const pendingCells = rowIds.map((rowId) => ({
      row_id: rowId,
      column_id: audioColumnId,
      value: JSON.stringify({ status: 'pending' }),
    }));
    await svc.from('dynamic_table_cells').upsert(pendingCells, { onConflict: 'row_id,column_id' });

    // Process rows with concurrency limit
    const results: Array<{ row_id: string; audio_url?: string; error?: string }> = [];
    let completedRows = 0;
    let failedRows = 0;

    // Process in chunks of MAX_CONCURRENT
    for (let i = 0; i < (rows || []).length; i += MAX_CONCURRENT) {
      const chunk = (rows || []).slice(i, i + MAX_CONCURRENT);

      const chunkResults = await Promise.allSettled(
        chunk.map(async (row: any) => {
          // Build variables from row cells
          const vars: Record<string, string | undefined> = {};
          for (const cell of row.dynamic_table_cells || []) {
            const key = colIdToKey[cell.column_id];
            if (key && cell.value) vars[key] = cell.value;
          }

          const text = interpolateScript(body.script_template, vars);

          // Skip rows where template variables are still unresolved
          const unresolvedMatch = text.match(/\{\{[\w\s]+?\}\}/g);
          if (unresolvedMatch) {
            const missing = unresolvedMatch.map((m: string) => m.replace(/[{}]/g, '').trim());
            console.warn(`[elevenlabs-tts-generate] Skipping row ${row.id} — missing: ${missing.join(', ')}`);
            await svc.from('dynamic_table_cells').upsert({
              row_id: row.id,
              column_id: audioColumnId,
              value: JSON.stringify({ status: 'failed', error_message: `Missing data: ${missing.join(', ')}` }),
            }, { onConflict: 'row_id,column_id' });
            return { row_id: row.id, error: `Missing data: ${missing.join(', ')}` };
          }

          // Update cell to processing
          await svc.from('dynamic_table_cells').upsert({
            row_id: row.id,
            column_id: audioColumnId,
            value: JSON.stringify({ status: 'processing' }),
          }, { onConflict: 'row_id,column_id' });

          // Call ElevenLabs TTS
          const ttsRes = await fetch(
            `${ELEVENLABS_BASE}/v1/text-to-speech/${voice.elevenlabs_voice_id}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                  style: 0.5,
                  speed: 1.0,
                },
              }),
            },
          );

          if (!ttsRes.ok) {
            const errText = await ttsRes.text();
            throw new Error(`TTS API error ${ttsRes.status}: ${errText.slice(0, 200)}`);
          }

          const audioBuffer = await ttsRes.arrayBuffer();

          // Upload to storage
          const storagePath = `audio/${orgId}/${row.id}.mp3`;
          const { error: uploadError } = await svc.storage
            .from('voice-clones')
            .upload(storagePath, audioBuffer, {
              contentType: 'audio/mpeg',
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`);
          }

          const { data: urlData } = svc.storage
            .from('voice-clones')
            .getPublicUrl(storagePath);

          // Write URL to cell
          await svc.from('dynamic_table_cells').upsert({
            row_id: row.id,
            column_id: audioColumnId,
            value: JSON.stringify({
              status: 'completed',
              audio_url: urlData.publicUrl,
            }),
          }, { onConflict: 'row_id,column_id' });

          return { row_id: row.id, audio_url: urlData.publicUrl };
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          completedRows++;
        } else {
          const rowId = chunk[chunkResults.indexOf(result)]?.id;
          const errMsg = result.reason?.message || 'Generation failed';
          results.push({ row_id: rowId, error: errMsg });
          failedRows++;

          // Update cell to failed
          if (rowId) {
            await svc.from('dynamic_table_cells').upsert({
              row_id: rowId,
              column_id: audioColumnId,
              value: JSON.stringify({ status: 'failed', error_message: errMsg }),
            }, { onConflict: 'row_id,column_id' });
          }
        }
      }

      // Update job progress
      if (job) {
        await svc.from('elevenlabs_tts_jobs').update({
          completed_rows: completedRows,
          failed_rows: failedRows,
        }).eq('id', job.id);
      }
    }

    // Mark job complete
    if (job) {
      await svc.from('elevenlabs_tts_jobs').update({
        status: failedRows === rowIds.length ? 'failed' : 'completed',
        completed_rows: completedRows,
        failed_rows: failedRows,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);
    }

    return jsonResponse({
      total: results.length,
      succeeded: completedRows,
      failed: failedRows,
      job_id: job?.id,
      results,
    }, req);

  } catch (err) {
    console.error('[elevenlabs-tts-generate] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
