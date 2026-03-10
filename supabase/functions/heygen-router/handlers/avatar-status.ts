/**
 * Handler: avatar_status
 * Migrated from heygen-avatar-status edge function.
 *
 * Checks training/generation status for an avatar and updates the DB.
 * Returns current status + thumbnail URLs for completed looks.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { createHeyGenClient } from '../../_shared/heygen.ts';

interface StatusRequest {
  action: string;
  avatar_id: string;
  check_type?: 'training' | 'generation' | 'auto';
  generation_id?: string;
}

export async function handleAvatarStatus(req: Request): Promise<Response> {
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

    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: StatusRequest = await req.json();
    if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

    // Fetch avatar record
    const { data: avatar, error: fetchError } = await svc
      .from('heygen_avatars')
      .select('id, org_id, user_id, heygen_group_id, heygen_generation_id, status, looks')
      .eq('id', body.avatar_id)
      .single();

    if (fetchError || !avatar) {
      return errorResponse('Avatar not found', req, 404);
    }

    // Verify ownership
    if (avatar.user_id !== user.id) {
      return errorResponse('Not your avatar', req, 403);
    }

    const heygen = await createHeyGenClient(svc, avatar.org_id);

    const checkType = body.check_type || 'auto';

    // Auto-detect what to check based on current status
    if (checkType === 'auto' || checkType === 'training') {
      if (avatar.status === 'training' && avatar.heygen_group_id) {
        let training: { status?: string; error?: string } = {};
        try {
          training = await heygen.getTrainingStatus(avatar.heygen_group_id);
        } catch (trainErr) {
          console.warn('[heygen-router/avatar-status] Training status API failed, checking group avatars as fallback:', trainErr);
        }

        if (training.status === 'completed') {
          // Training done — check if group has a ready avatar we can use
          let heygenAvatarId: string | null = null;
          try {
            const groupAvatars = await heygen.listGroupAvatars(avatar.heygen_group_id);
            const completedAvatar = (groupAvatars.avatar_list || []).find(
              (a: any) => a.status === 'completed'
            );
            if (completedAvatar) heygenAvatarId = completedAvatar.id;
          } catch { /* non-blocking */ }

          const updateData: Record<string, unknown> = { status: heygenAvatarId ? 'ready' : 'generating_looks' };
          if (heygenAvatarId) updateData.heygen_avatar_id = heygenAvatarId;

          await svc
            .from('heygen_avatars')
            .update(updateData)
            .eq('id', avatar.id);

          return jsonResponse({
            avatar_id: avatar.id,
            status: updateData.status,
            training_status: 'completed',
            heygen_avatar_id: heygenAvatarId,
            message: heygenAvatarId ? 'Training complete — avatar ready' : 'Training complete — ready to generate looks',
          }, req);
        }

        if (training.status === 'failed') {
          await svc
            .from('heygen_avatars')
            .update({ status: 'failed', error_message: training.error || 'Training failed' })
            .eq('id', avatar.id);

          return jsonResponse({
            avatar_id: avatar.id,
            status: 'failed',
            error: training.error,
          }, req);
        }

        // Training status API returned no clear status — fallback: check group avatars directly
        if (!training.status) {
          try {
            const groupAvatars = await heygen.listGroupAvatars(avatar.heygen_group_id);
            const completedAvatar = (groupAvatars.avatar_list || []).find(
              (a: any) => a.status === 'completed'
            );
            if (completedAvatar) {
              await svc
                .from('heygen_avatars')
                .update({ status: 'ready', heygen_avatar_id: completedAvatar.id })
                .eq('id', avatar.id);

              return jsonResponse({
                avatar_id: avatar.id,
                status: 'ready',
                training_status: 'completed',
                heygen_avatar_id: completedAvatar.id,
                message: 'Avatar ready (detected from group)',
              }, req);
            }
          } catch (groupErr) {
            console.warn('[heygen-router/avatar-status] Group avatars fallback failed:', groupErr);
          }
        }

        return jsonResponse({
          avatar_id: avatar.id,
          status: 'training',
          training_status: training.status || 'unknown',
        }, req);
      }
    }

    if (checkType === 'auto' || checkType === 'generation') {
      const generationId = body.generation_id || avatar.heygen_generation_id;

      if (generationId && (avatar.status === 'creating' || avatar.status === 'generating_looks')) {
        const generation = await heygen.getGenerationStatus(generationId);

        if (generation.status === 'completed' || generation.status === 'success') {
          // Update looks array with new images
          const existingLooks = (avatar.looks as Array<Record<string, unknown>>) || [];
          const newLooks = (generation.image_url_list || []).map((url, i) => ({
            look_id: (generation.image_key_list || [])[i] || `look_${i}`,
            name: `Look ${existingLooks.length + i + 1}`,
            thumbnail_url: url,
            heygen_avatar_id: null,
          }));

          const allLooks = [...existingLooks, ...newLooks];

          const newStatus = avatar.status === 'creating' ? 'creating' : 'generating_looks';
          await svc
            .from('heygen_avatars')
            .update({
              looks: allLooks,
              thumbnail_url: newLooks[0]?.thumbnail_url || avatar.looks?.[0]?.thumbnail_url,
            })
            .eq('id', avatar.id);

          return jsonResponse({
            avatar_id: avatar.id,
            status: newStatus,
            generation_status: 'completed',
            looks: allLooks,
          }, req);
        }

        if (generation.status === 'failed') {
          return jsonResponse({
            avatar_id: avatar.id,
            status: avatar.status,
            generation_status: 'failed',
            error: generation.error,
          }, req);
        }

        return jsonResponse({
          avatar_id: avatar.id,
          status: avatar.status,
          generation_status: generation.status,
        }, req);
      }
    }

    // No async operation to check — return current state
    return jsonResponse({
      avatar_id: avatar.id,
      status: avatar.status,
      looks: avatar.looks,
    }, req);

  } catch (err) {
    console.error('[heygen-router/avatar-status] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
}
