/**
 * elevenlabs-voice-manage
 *
 * POST /elevenlabs-voice-manage
 * Body: { action, ...params }
 *
 * Actions (Phase 1):
 *   list           — List org's voice clones from DB
 *   create_clone   — Upload audio, call ElevenLabs IVC, save to DB
 *   list_remote    — List voices from user's ElevenLabs account (BYOK)
 *   import_voice   — Import existing ElevenLabs voice by ID (BYOK)
 *   preview        — Generate short TTS sample for a voice
 *   delete         — Delete voice clone from DB + ElevenLabs API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

interface VoiceManageRequest {
  action: 'list' | 'create_clone' | 'list_remote' | 'import_voice' | 'preview' | 'delete';
  // create_clone
  name?: string;
  description?: string;
  audio_url?: string;
  language?: string;
  // import_voice
  elevenlabs_voice_id?: string;
  // preview
  voice_clone_id?: string;
  preview_text?: string;
  // delete
  id?: string;
}

/**
 * Get the ElevenLabs API key for this org.
 * Uses BYOK if available, falls back to platform key.
 * Returns { apiKey, source } where source is 'byok' | 'platform'.
 */
async function getElevenLabsKey(
  svc: any,
  orgId: string,
): Promise<{ apiKey: string; source: 'byok' | 'platform' }> {
  const { data } = await svc
    .from('elevenlabs_org_credentials')
    .select('api_key')
    .eq('org_id', orgId)
    .maybeSingle();

  if (data?.api_key) {
    return { apiKey: data.api_key, source: 'byok' };
  }

  const platformKey = Deno.env.get('ELEVENLABS_PLATFORM_KEY');
  if (!platformKey) {
    throw new Error('Voice cloning not available — contact support');
  }

  return { apiKey: platformKey, source: 'platform' };
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

    const body: VoiceManageRequest = await req.json();

    switch (body.action) {
      // ─── LIST ────────────────────────────────────────────────
      case 'list': {
        const { data: voices, error } = await svc
          .from('voice_clones')
          .select('id, name, description, source, status, preview_audio_url, language, api_key_source, created_at, elevenlabs_voice_id, heygen_voice_id')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[elevenlabs-voice-manage] list error:', error);
          return errorResponse('Failed to list voices', req, 500);
        }

        return jsonResponse({ voices: voices || [] }, req);
      }

      // ─── CREATE CLONE ────────────────────────────────────────
      case 'create_clone': {
        if (!body.name?.trim()) return errorResponse('name is required', req, 400);
        if (!body.audio_url?.trim()) return errorResponse('audio_url is required', req, 400);

        const { apiKey, source } = await getElevenLabsKey(svc, orgId);

        // Platform key: enforce 1 clone per org limit
        if (source === 'platform') {
          const { count } = await svc
            .from('voice_clones')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId)
            .eq('api_key_source', 'platform')
            .in('source', ['instant_clone', 'professional_clone']);

          if ((count ?? 0) >= 1) {
            return errorResponse(
              'Free tier limited to 1 voice clone. Connect your ElevenLabs API key for unlimited clones.',
              req,
              402,
            );
          }
        }

        // Insert clone record as 'cloning'
        const { data: cloneRecord, error: insertError } = await svc
          .from('voice_clones')
          .insert({
            org_id: orgId,
            user_id: user.id,
            name: body.name.trim(),
            description: body.description || null,
            source: 'instant_clone',
            api_key_source: source,
            status: 'cloning',
            clone_audio_url: body.audio_url,
            language: body.language || 'en',
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[elevenlabs-voice-manage] insert error:', insertError);
          return errorResponse('Failed to create voice record', req, 500);
        }

        // Fetch the audio file
        const audioRes = await fetch(body.audio_url);
        if (!audioRes.ok) {
          await svc.from('voice_clones').update({ status: 'failed', error_message: 'Failed to fetch audio file' }).eq('id', cloneRecord.id);
          return errorResponse('Failed to fetch audio file', req, 400);
        }

        const audioBlob = await audioRes.blob();

        // Call ElevenLabs IVC API
        const formData = new FormData();
        formData.append('name', body.name.trim());
        formData.append('files', audioBlob, 'voice_sample.mp3');
        if (body.description) formData.append('description', body.description);

        const cloneRes = await fetch(`${ELEVENLABS_BASE}/v1/voices/add`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey },
          body: formData,
        });

        if (!cloneRes.ok) {
          const errorBody = await cloneRes.text();
          console.error('[elevenlabs-voice-manage] clone API error:', cloneRes.status, errorBody);
          await svc.from('voice_clones').update({
            status: 'failed',
            error_message: `ElevenLabs API error: ${cloneRes.status}`,
          }).eq('id', cloneRecord.id);
          return errorResponse(`Voice cloning failed: ${cloneRes.status}`, req, 500);
        }

        const cloneData = await cloneRes.json();
        const voiceId = cloneData.voice_id;

        // Update record with voice ID + ready status
        await svc.from('voice_clones').update({
          elevenlabs_voice_id: voiceId,
          status: 'ready',
        }).eq('id', cloneRecord.id);

        return jsonResponse({
          id: cloneRecord.id,
          elevenlabs_voice_id: voiceId,
          status: 'ready',
        }, req);
      }

      // ─── LIST REMOTE (BYOK only) ─────────────────────────────
      case 'list_remote': {
        const { data: creds } = await svc
          .from('elevenlabs_org_credentials')
          .select('api_key')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return errorResponse('Connect your ElevenLabs API key first to browse remote voices', req, 400);
        }

        const res = await fetch(`${ELEVENLABS_BASE}/v1/voices`, {
          headers: { 'xi-api-key': creds.api_key },
        });

        if (!res.ok) {
          return errorResponse(`ElevenLabs API error: ${res.status}`, req, 500);
        }

        const data = await res.json();
        const voices = (data.voices || []).map((v: any) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category,
          preview_url: v.preview_url,
          labels: v.labels,
        }));

        return jsonResponse({ voices }, req);
      }

      // ─── IMPORT VOICE (BYOK only) ────────────────────────────
      case 'import_voice': {
        if (!body.elevenlabs_voice_id?.trim()) return errorResponse('elevenlabs_voice_id required', req, 400);
        if (!body.name?.trim()) return errorResponse('name required', req, 400);

        const { data: creds } = await svc
          .from('elevenlabs_org_credentials')
          .select('api_key')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return errorResponse('Connect your ElevenLabs API key first', req, 400);
        }

        // Verify the voice exists
        const res = await fetch(`${ELEVENLABS_BASE}/v1/voices/${body.elevenlabs_voice_id}`, {
          headers: { 'xi-api-key': creds.api_key },
        });

        if (!res.ok) {
          return errorResponse('Voice not found in your ElevenLabs account', req, 404);
        }

        const voiceData = await res.json();

        const { data: imported, error: importError } = await svc
          .from('voice_clones')
          .insert({
            org_id: orgId,
            user_id: user.id,
            name: body.name.trim(),
            description: body.description || voiceData.description || null,
            elevenlabs_voice_id: body.elevenlabs_voice_id,
            source: 'imported',
            api_key_source: 'byok',
            status: 'ready',
            preview_audio_url: voiceData.preview_url || null,
            language: body.language || 'en',
          })
          .select('id, name, elevenlabs_voice_id, status')
          .single();

        if (importError) {
          console.error('[elevenlabs-voice-manage] import error:', importError);
          return errorResponse('Failed to import voice', req, 500);
        }

        return jsonResponse(imported, req);
      }

      // ─── PREVIEW ──────────────────────────────────────────────
      case 'preview': {
        if (!body.voice_clone_id) return errorResponse('voice_clone_id required', req, 400);

        const { data: voice } = await svc
          .from('voice_clones')
          .select('id, elevenlabs_voice_id, api_key_source, org_id')
          .eq('id', body.voice_clone_id)
          .eq('org_id', orgId)
          .maybeSingle();

        if (!voice) return errorResponse('Voice not found', req, 404);
        if (!voice.elevenlabs_voice_id) return errorResponse('Voice has no ElevenLabs ID', req, 400);

        const { apiKey } = await getElevenLabsKey(svc, orgId);
        const text = body.preview_text || 'Hi there, this is a preview of my cloned voice. How does it sound?';

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
          console.error('[elevenlabs-voice-manage] TTS preview error:', ttsRes.status, errText);
          return errorResponse('Failed to generate preview', req, 500);
        }

        const audioBuffer = await ttsRes.arrayBuffer();

        // Upload to storage
        const storagePath = `previews/${orgId}/${voice.id}.mp3`;
        const { error: uploadError } = await svc.storage
          .from('voice-clones')
          .upload(storagePath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error('[elevenlabs-voice-manage] storage upload error:', uploadError);
          return errorResponse('Failed to store preview audio', req, 500);
        }

        const { data: urlData } = svc.storage
          .from('voice-clones')
          .getPublicUrl(storagePath);

        // Update voice record with preview URL
        await svc.from('voice_clones').update({
          preview_audio_url: urlData.publicUrl,
        }).eq('id', voice.id);

        return jsonResponse({ preview_url: urlData.publicUrl }, req);
      }

      // ─── DELETE ───────────────────────────────────────────────
      case 'delete': {
        if (!body.id) return errorResponse('id required', req, 400);

        const { data: voice } = await svc
          .from('voice_clones')
          .select('id, elevenlabs_voice_id, api_key_source, org_id')
          .eq('id', body.id)
          .eq('org_id', orgId)
          .maybeSingle();

        if (!voice) return errorResponse('Voice not found', req, 404);

        // Delete from ElevenLabs API if it has a voice ID
        if (voice.elevenlabs_voice_id) {
          try {
            const { apiKey } = await getElevenLabsKey(svc, orgId);
            await fetch(`${ELEVENLABS_BASE}/v1/voices/${voice.elevenlabs_voice_id}`, {
              method: 'DELETE',
              headers: { 'xi-api-key': apiKey },
            });
          } catch (err) {
            console.warn('[elevenlabs-voice-manage] delete from API failed (continuing):', err);
          }
        }

        // Delete from DB
        const { error: deleteError } = await svc
          .from('voice_clones')
          .delete()
          .eq('id', body.id);

        if (deleteError) {
          console.error('[elevenlabs-voice-manage] delete error:', deleteError);
          return errorResponse('Failed to delete voice', req, 500);
        }

        // Clean up storage
        try {
          await svc.storage.from('voice-clones').remove([`previews/${orgId}/${body.id}.mp3`]);
        } catch {
          // Non-critical
        }

        return jsonResponse({ success: true }, req);
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, req, 400);
    }
  } catch (err) {
    console.error('[elevenlabs-voice-manage] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
