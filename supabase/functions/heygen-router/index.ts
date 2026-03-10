/**
 * heygen-router
 *
 * Consolidated router for all HeyGen edge functions (except heygen-video-webhook
 * and heygen-poll-pending which remain standalone).
 *
 * POST /heygen-router
 * Body: { action: string, ...params }
 *
 * Actions:
 *   admin              — Admin operations (has sub-actions: save_credentials, test_credentials, list_voices, get_account_info)
 *   avatar_create      — Avatar creation pipeline (has sub-actions via sub_action field)
 *   avatar_status      — Check avatar training/generation status
 *   check_video        — Check video IDs on HeyGen
 *   debug              — Debug HeyGen API
 *   video_generate     — Generate personalized videos
 *   voices             — List/select voices (has sub-actions: list, select)
 *
 *   // heygen-admin sub-action aliases (direct routing)
 *   save_credentials   — alias for admin + sub_action=save_credentials
 *   test_credentials   — alias for admin + sub_action=test_credentials
 *   get_account_info   — alias for admin + sub_action=get_account_info
 */

import { getCorsHeaders } from '../_shared/corsHelper.ts';
import { handleAdmin } from './handlers/admin.ts';
import { handleAvatarCreate } from './handlers/avatar-create.ts';
import { handleAvatarStatus } from './handlers/avatar-status.ts';
import { handleCheckVideo } from './handlers/check-video.ts';
import { handleDebug } from './handlers/debug.ts';
import { handleVideoGenerate } from './handlers/video-generate.ts';
import { handleVoices } from './handlers/voices.ts';

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  // Primary actions
  admin: handleAdmin,
  avatar_create: handleAvatarCreate,
  avatar_status: handleAvatarStatus,
  check_video: handleCheckVideo,
  debug: handleDebug,
  video_generate: handleVideoGenerate,
  voices: handleVoices,

  // heygen-admin sub-action aliases — route directly to admin handler
  save_credentials: handleAdmin,
  test_credentials: handleAdmin,
  list_voices: handleAdmin,
  get_account_info: handleAdmin,
};

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const bodyText = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const action = body.action as string;
    if (!action || !HANDLERS[action]) {
      return new Response(
        JSON.stringify({
          error: `Invalid or missing action. Must be one of: ${Object.keys(HANDLERS).join(', ')}`,
          received: action ?? null,
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Re-create request with the body text so handlers can read it
    const handlerReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: bodyText,
    });

    return await HANDLERS[action](handlerReq);
  } catch (error: unknown) {
    console.error('[heygen-router] Router error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? 'Internal error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
