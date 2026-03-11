/**
 * Handler: voices
 * Migrated from heygen-voices edge function.
 *
 * Lists available HeyGen voices with filtering, or saves voice selection to an avatar.
 *
 * Sub-actions:
 *   list   — List voices with optional language/gender filters
 *   select — Save voice selection to an avatar
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { createHeyGenClient, HeyGenVoice } from '../../_shared/heygen.ts';

// In-memory cache per isolate (voices rarely change)
let voiceCache: { voices: HeyGenVoice[]; cachedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface VoiceRequest {
  action: string; // router-level action
  sub_action?: 'list' | 'select';
  avatar_id?: string;
  voice_id?: string;
  voice_name?: string;
  language?: string;
  gender?: string;
}

export async function handleVoices(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', req, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
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

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: VoiceRequest = await req.json();
    // Support both sub_action (router pattern) and legacy action field
    const subAction = body.sub_action || body.action;

    switch (subAction) {
      case 'list': {
        // Check cache
        if (voiceCache && Date.now() - voiceCache.cachedAt < CACHE_TTL_MS) {
          let voices = voiceCache.voices;
          if (body.language) {
            voices = voices.filter(v => v.language?.toLowerCase().includes(body.language!.toLowerCase()));
          }
          if (body.gender) {
            voices = voices.filter(v => v.gender?.toLowerCase() === body.gender!.toLowerCase());
          }
          return jsonResponse({ voices, cached: true }, req);
        }

        const heygen = await createHeyGenClient(svc, membership.org_id);
        const result = await heygen.listVoices();

        // Cache full list
        voiceCache = { voices: result.voices || [], cachedAt: Date.now() };

        let voices = voiceCache.voices;
        if (body.language) {
          voices = voices.filter(v => v.language?.toLowerCase().includes(body.language!.toLowerCase()));
        }
        if (body.gender) {
          voices = voices.filter(v => v.gender?.toLowerCase() === body.gender!.toLowerCase());
        }

        return jsonResponse({ voices, cached: false }, req);
      }

      case 'select': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);
        if (!body.voice_id) return errorResponse('voice_id required', req, 400);

        // Verify ownership
        const { data: avatar } = await svc
          .from('heygen_avatars')
          .select('id, user_id')
          .eq('id', body.avatar_id)
          .single();

        if (!avatar || avatar.user_id !== user.id) {
          return errorResponse('Avatar not found or not yours', req, 403);
        }

        const { error: updateError } = await svc
          .from('heygen_avatars')
          .update({
            voice_id: body.voice_id,
            voice_name: body.voice_name || null,
          })
          .eq('id', body.avatar_id);

        if (updateError) {
          return errorResponse('Failed to save voice selection', req, 500);
        }

        return jsonResponse({ success: true, avatar_id: body.avatar_id, voice_id: body.voice_id }, req);
      }

      default:
        return errorResponse(`Unknown voices sub-action: ${subAction}`, req, 400);
    }
  } catch (err) {
    console.error('[heygen-router/voices] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
}
