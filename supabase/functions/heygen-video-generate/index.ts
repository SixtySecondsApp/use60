/**
 * heygen-video-generate
 *
 * POST /heygen-video-generate
 *
 * Modes:
 *   1. Ops table mode: { avatar_id, script, table_id, row_ids[] }
 *      - Reads row data from ops table, interpolates script per row
 *      - Writes status + video URL back to the heygen_video column cell
 *
 *   2. Direct mode: { avatar_id, script, variables?, prospects? }
 *      - Uses provided variables directly
 *
 * Variables in script: {{column_key}} replaced per row/prospect
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { createHeyGenClient } from '../_shared/heygen.ts';
import { checkCreditBalance } from '../_shared/costTracking.ts';

interface VideoGenerateRequest {
  avatar_id: string;
  script: string;
  // Ops table mode
  table_id?: string;
  row_ids?: string[];
  // Direct mode
  variables?: Record<string, string | undefined>;
  prospects?: Record<string, string | undefined>[];
  // Optional overrides from column config
  voice_id?: string;
  audio_url?: string; // Use audio file as voice instead of TTS (direct mode)
  audio_column_key?: string; // Column key containing audio URLs per row (ops table mode)
  voice_clone_id?: string; // ElevenLabs cloned voice — generates TTS per row on-the-fly
  campaign_link_id?: string;
  dimension?: { width: number; height: number };
}

const MAX_BATCH = 50;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

function interpolateScript(script: string, vars: Record<string, string | undefined>): string {
  return script.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
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
    const heygen = await createHeyGenClient(svc, orgId);

    // Pre-flight credit check
    const creditCheck = await checkCreditBalance(svc, orgId);
    if (!creditCheck.allowed) {
      return errorResponse('Insufficient credits — please top up to generate videos', req, 402);
    }

    const body: VideoGenerateRequest = await req.json();

    if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);
    // Script is not required when using audio_column_key (audio file IS the voice)
    if (!body.audio_column_key && !body.script?.trim()) return errorResponse('script required', req, 400);

    // Fetch avatar
    const { data: avatar, error: avatarError } = await svc
      .from('heygen_avatars')
      .select('id, heygen_avatar_id, voice_id, status, looks')
      .eq('id', body.avatar_id)
      .single();

    if (avatarError || !avatar) return errorResponse('Avatar not found', req, 404);
    if (avatar.status !== 'ready') return errorResponse('Avatar not ready — complete setup first', req, 400);
    if (!avatar.heygen_avatar_id) return errorResponse('Avatar has no HeyGen ID — finalize setup', req, 400);

    // ── Build prospect list ────────────────────────────────────────
    type RowEntry = {
      rowId: string | null;
      vars: Record<string, string | undefined>;
      label: string;
      audio_url?: string; // Resolved from audio_column_key per row
    };

    const entries: RowEntry[] = [];
    let videoColumnId: string | null = null;

    if (body.table_id && body.row_ids?.length) {
      // Ops table mode — read row data
      const rowIds = body.row_ids.slice(0, MAX_BATCH);

      // Get all columns for this table (to map column_id → key)
      const { data: columns } = await svc
        .from('dynamic_table_columns')
        .select('id, key, column_type')
        .eq('table_id', body.table_id);

      const colIdToKey: Record<string, string> = {};
      const colKeyToId: Record<string, string> = {};
      for (const col of columns || []) {
        colIdToKey[col.id] = col.key;
        colKeyToId[col.key] = col.id;
        if (col.column_type === 'heygen_video') {
          videoColumnId = col.id;
        }
      }

      // Resolve audio column ID if using audio_column_key
      const audioColumnId = body.audio_column_key ? colKeyToId[body.audio_column_key] : null;

      // Get rows + cells
      const { data: rows } = await svc
        .from('dynamic_table_rows')
        .select('id, dynamic_table_cells(column_id, value)')
        .in('id', rowIds);

      for (const row of rows || []) {
        const vars: Record<string, string | undefined> = {};
        let rowAudioUrl: string | undefined;
        for (const cell of (row as any).dynamic_table_cells || []) {
          const key = colIdToKey[cell.column_id];
          if (key && cell.value) vars[key] = cell.value;
          // Extract audio URL from referenced column (may be raw URL or JSON with audio_url)
          if (audioColumnId && cell.column_id === audioColumnId && cell.value) {
            try {
              const parsed = JSON.parse(cell.value);
              if (parsed.audio_url && parsed.status === 'completed') {
                rowAudioUrl = parsed.audio_url;
              }
            } catch {
              // Not JSON — treat as raw URL
              rowAudioUrl = cell.value;
            }
          }
        }
        entries.push({
          rowId: row.id,
          vars,
          label: vars.first_name
            ? `${vars.first_name} ${vars.last_name || ''} @ ${vars.company_name || vars.company || ''}`
            : `Row ${row.id.slice(0, 8)}`,
          audio_url: rowAudioUrl,
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
      // Direct mode
      const prospects = body.prospects
        ? body.prospects.slice(0, MAX_BATCH)
        : [body.variables || {}];

      for (const p of prospects) {
        entries.push({
          rowId: null,
          vars: p,
          label: p.first_name
            ? `${p.first_name} ${p.last_name || ''} @ ${p.company || ''}`
            : 'Outreach Video',
        });
      }
    }

    // ── Resolve cloned voice for on-the-fly TTS ─────────────────────
    let clonedVoiceId: string | null = null;
    let elevenLabsApiKey: string | null = null;

    if (body.voice_clone_id && !body.audio_column_key) {
      const { data: vc } = await svc
        .from('voice_clones')
        .select('elevenlabs_voice_id, api_key_source')
        .eq('id', body.voice_clone_id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (vc?.elevenlabs_voice_id) {
        clonedVoiceId = vc.elevenlabs_voice_id;
        // Get ElevenLabs API key
        const { data: elCreds } = await svc
          .from('elevenlabs_org_credentials')
          .select('api_key')
          .eq('org_id', orgId)
          .maybeSingle();
        elevenLabsApiKey = elCreds?.api_key || Deno.env.get('ELEVENLABS_PLATFORM_KEY') || null;
      }
    }

    // ── Generate videos ────────────────────────────────────────────
    const webhookUrl = `${SUPABASE_URL}/functions/v1/heygen-video-webhook`;

    const results: Array<{
      row_id: string | null;
      video_id?: string;
      heygen_video_id?: string;
      error?: string;
    }> = [];

    for (const entry of entries) {
      try {
        const personalizedScript = interpolateScript(body.script, entry.vars);
        const callbackId = crypto.randomUUID();

        // Insert DB record BEFORE calling HeyGen to avoid race condition
        // (HeyGen can send webhook callback before we finish inserting)
        const { data: videoRecord, error: insertError } = await svc
          .from('heygen_videos')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_id: avatar.id,
            heygen_video_id: 'pending', // placeholder until HeyGen responds
            callback_id: callbackId,
            status: 'pending',
            prospect_data: entry.vars,
            campaign_link_id: body.campaign_link_id || null,
            dynamic_table_row_id: entry.rowId,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[heygen-video-generate] DB insert error:', insertError);
        }

        // Generate TTS on-the-fly if cloned voice is configured
        let resolvedAudioUrl = entry.audio_url || body.audio_url;

        if (!resolvedAudioUrl && clonedVoiceId && elevenLabsApiKey) {
          const ttsRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${clonedVoiceId}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': elevenLabsApiKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: personalizedScript,
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5, speed: 1.0 },
              }),
            },
          );

          if (ttsRes.ok) {
            const audioBuffer = await ttsRes.arrayBuffer();
            const storagePath = `tts/${orgId}/${entry.rowId || crypto.randomUUID()}.mp3`;
            await svc.storage.from('voice-clones').upload(storagePath, audioBuffer, {
              contentType: 'audio/mpeg',
              upsert: true,
            });
            const { data: urlData } = svc.storage.from('voice-clones').getPublicUrl(storagePath);
            resolvedAudioUrl = urlData.publicUrl;
          } else {
            console.error('[heygen-video-generate] TTS failed:', ttsRes.status);
          }
        }

        const videoResult = await heygen.generateVideo({
          video_inputs: [{
            character: {
              type: 'avatar',
              avatar_id: avatar.heygen_avatar_id,
              avatar_style: 'normal',
              avatar_version: 'v4',
            },
            voice: resolvedAudioUrl
              ? {
                  type: 'audio' as const,
                  audio_url: resolvedAudioUrl,
                }
              : {
                  type: 'text' as const,
                  voice_id: body.voice_id || avatar.voice_id || undefined,
                  input_text: personalizedScript,
                  speed: 1,
                },
          }],
          dimension: body.dimension || { width: 1920, height: 1080 },
          callback_id: callbackId,
          callback_url: webhookUrl,
          title: `Outreach - ${entry.label}`.slice(0, 100),
        });

        // Update record with actual HeyGen video ID
        if (videoRecord) {
          await svc
            .from('heygen_videos')
            .update({ heygen_video_id: videoResult.video_id })
            .eq('id', videoRecord.id);
        }

        // Update cell to processing with video record ID
        if (videoColumnId && entry.rowId && videoRecord) {
          await svc
            .from('dynamic_table_cells')
            .upsert({
              row_id: entry.rowId,
              column_id: videoColumnId,
              value: JSON.stringify({
                status: 'processing',
                video_record_id: videoRecord.id,
                heygen_video_id: videoResult.video_id,
              }),
            }, { onConflict: 'row_id,column_id' });
        }

        results.push({
          row_id: entry.rowId,
          video_id: videoRecord?.id,
          heygen_video_id: videoResult.video_id,
        });
      } catch (err) {
        console.error('[heygen-video-generate] Video generation error:', err);

        // Write failure to cell
        if (videoColumnId && entry.rowId) {
          await svc
            .from('dynamic_table_cells')
            .upsert({
              row_id: entry.rowId,
              column_id: videoColumnId,
              value: JSON.stringify({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Generation failed',
              }),
            }, { onConflict: 'row_id,column_id' });
        }

        results.push({
          row_id: entry.rowId,
          error: err instanceof Error ? err.message : 'Generation failed',
        });
      }
    }

    const succeeded = results.filter(r => r.video_id);
    const failed = results.filter(r => r.error);

    return jsonResponse({
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      videos: results,
    }, req);

  } catch (err) {
    console.error('[heygen-video-generate] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
