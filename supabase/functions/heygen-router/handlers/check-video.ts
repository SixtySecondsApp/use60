/**
 * Handler: check_video
 * Check status of video IDs on HeyGen.
 *
 * POST { action: "check_video", video_ids: string[] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { createHeyGenClient } from '../../_shared/heygen.ts';

export async function handleCheckVideo(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', req, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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

    const svc = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const heygen = await createHeyGenClient(svc, membership.org_id);

    const body = await req.json();
    const videoIds: string[] = body.video_ids || [];

    if (videoIds.length === 0) return errorResponse('video_ids required', req, 400);

    const results = [];
    for (const vid of videoIds.slice(0, 20)) {
      try {
        const status = await heygen.getVideoStatus(vid);
        results.push({ video_id: vid, ...status });
      } catch (err) {
        results.push({ video_id: vid, error: (err as Error).message });
      }
    }

    return jsonResponse({ results }, req);
  } catch (err) {
    console.error('[heygen-router/check-video] Error:', err);
    return errorResponse((err as Error).message || 'Internal error', req, 500);
  }
}
