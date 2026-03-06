/**
 * heygen-video-generate
 *
 * POST /heygen-video-generate
 * Body: { avatar_id, script, variables?, prospects?, callback_url? }
 *
 * Generates personalized HeyGen videos using the user's avatar.
 *
 * Single mode: one video for one prospect
 * Batch mode: array of prospects (max 50), generates one video per prospect
 *
 * Variables in script are replaced per-prospect: {{first_name}}, {{company}}, {{pain_point}}
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { createHeyGenClient } from '../_shared/heygen.ts';

interface ProspectVariables {
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  pain_point?: string;
  [key: string]: string | undefined;
}

interface VideoGenerateRequest {
  avatar_id: string; // our DB id (heygen_avatars.id)
  script: string;
  variables?: ProspectVariables;
  // Batch mode
  prospects?: ProspectVariables[];
  // Optional
  campaign_link_id?: string;
  dynamic_table_row_id?: string;
  dimension?: { width: number; height: number };
}

const MAX_BATCH = 50;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

function interpolateScript(script: string, vars: ProspectVariables): string {
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

    const body: VideoGenerateRequest = await req.json();

    if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);
    if (!body.script?.trim()) return errorResponse('script required', req, 400);

    // Fetch avatar
    const { data: avatar, error: avatarError } = await svc
      .from('heygen_avatars')
      .select('id, heygen_avatar_id, voice_id, status, looks')
      .eq('id', body.avatar_id)
      .single();

    if (avatarError || !avatar) return errorResponse('Avatar not found', req, 404);
    if (avatar.status !== 'ready') return errorResponse('Avatar not ready — complete setup first', req, 400);
    if (!avatar.heygen_avatar_id) return errorResponse('Avatar has no HeyGen ID — finalize setup', req, 400);

    // Build prospect list
    const prospects: ProspectVariables[] = body.prospects
      ? body.prospects.slice(0, MAX_BATCH)
      : [body.variables || {}];

    // Webhook URL for status callbacks
    const webhookUrl = `${SUPABASE_URL}/functions/v1/heygen-video-webhook`;

    // Generate videos
    const results: Array<{
      prospect: ProspectVariables;
      video_id?: string;
      heygen_video_id?: string;
      error?: string;
    }> = [];

    for (const prospect of prospects) {
      try {
        const personalizedScript = interpolateScript(body.script, prospect);
        const callbackId = crypto.randomUUID();

        const videoResult = await heygen.generateVideo({
          video_inputs: [{
            character: {
              type: 'talking_photo',
              talking_photo_id: avatar.heygen_avatar_id,
              scale: 1,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              voice_id: avatar.voice_id || undefined,
              input_text: personalizedScript,
              speed: 1,
            },
          }],
          dimension: body.dimension || { width: 1920, height: 1080 },
          callback_id: callbackId,
          callback_url: webhookUrl,
          title: prospect.first_name
            ? `Outreach - ${prospect.first_name} ${prospect.last_name || ''} @ ${prospect.company || ''}`
            : 'Outreach Video',
        });

        // Store in DB
        const { data: videoRecord, error: insertError } = await svc
          .from('heygen_videos')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_id: avatar.id,
            heygen_video_id: videoResult.video_id,
            callback_id: callbackId,
            status: 'pending',
            prospect_data: prospect,
            campaign_link_id: body.campaign_link_id || null,
            dynamic_table_row_id: body.dynamic_table_row_id || null,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[heygen-video-generate] DB insert error:', insertError);
        }

        results.push({
          prospect,
          video_id: videoRecord?.id,
          heygen_video_id: videoResult.video_id,
        });
      } catch (err) {
        console.error('[heygen-video-generate] Video generation error:', err);
        results.push({
          prospect,
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
