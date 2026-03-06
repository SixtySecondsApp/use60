/**
 * heygen-avatar-create
 *
 * POST /heygen-avatar-create
 * Body: { action, ...params }
 *
 * Actions:
 *   generate_photo    — Generate AI photo from description
 *   upload_photo      — Register uploaded photo (image_key from HeyGen asset upload)
 *   create_group      — Create avatar group from generated/uploaded photos
 *   train             — Start LORA training on avatar group
 *   generate_look     — Generate a new look for trained avatar
 *   add_motion        — Add motion to a photo avatar look
 *   finalize          — Mark avatar as ready with selected look
 *
 * Auth: JWT + org membership. Stores progress in heygen_avatars table.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { createHeyGenClient } from '../_shared/heygen.ts';

type Action =
  | 'generate_photo'
  | 'upload_photo'
  | 'create_group'
  | 'train'
  | 'generate_look'
  | 'add_motion'
  | 'finalize';

interface AvatarRequest {
  action: Action;
  avatar_id?: string; // our DB id (heygen_avatars.id)

  // generate_photo
  name?: string;
  age?: string;
  gender?: string;
  ethnicity?: string;
  orientation?: string;
  pose?: string;
  style?: string;
  appearance?: string;

  // upload_photo / create_group
  image_key?: string;
  generation_id?: string;
  avatar_name?: string;

  // generate_look
  prompt?: string;

  // add_motion
  photo_avatar_id?: string; // HeyGen's photo avatar ID

  // finalize
  look_id?: string;
  voice_id?: string;
  voice_name?: string;
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

    const orgId = membership.org_id;

    // Service client for DB writes
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // HeyGen client
    const heygen = await createHeyGenClient(svc, orgId);

    const body: AvatarRequest = await req.json();
    const { action } = body;

    switch (action) {
      // ---------------------------------------------------------------
      // Step 1: Generate AI photo
      // ---------------------------------------------------------------
      case 'generate_photo': {
        // HeyGen enum values (exact casing required):
        // age: 'Young Adult' | 'Early Middle Age' | 'Late Middle Age' | 'Senior' | 'Unspecified'
        // gender: 'Man' | 'Woman' | 'Unspecified'
        // orientation: 'square' | 'horizontal' | 'vertical'
        // pose: 'half_body' | 'close_up' | 'full_body'
        // style: 'Realistic' | 'Pixar' | 'Cinematic' | 'Vintage' | 'Noir' | 'Cyberpunk' | 'Unspecified'
        const AGE_MAP: Record<string, string> = { young_adult: 'Young Adult', middle_aged: 'Early Middle Age', senior: 'Senior' };
        const GENDER_MAP: Record<string, string> = { female: 'Woman', male: 'Man' };

        const result = await heygen.generatePhoto({
          name: body.name || 'avatar',
          age: AGE_MAP[body.age || ''] || body.age || 'Young Adult',
          gender: GENDER_MAP[body.gender || ''] || body.gender || 'Woman',
          ethnicity: body.ethnicity || 'White',
          orientation: body.orientation || 'square',
          pose: body.pose || 'half_body',
          style: body.style || 'Realistic',
          appearance: body.appearance || 'Professional business attire, friendly smile',
        });

        // Create avatar record
        const { data: avatar, error: insertError } = await svc
          .from('heygen_avatars')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_name: body.avatar_name || 'My Avatar',
            avatar_type: 'photo',
            status: 'creating',
            heygen_generation_id: result.generation_id,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[heygen-avatar-create] insert error:', insertError);
          return errorResponse('Failed to create avatar record', req, 500);
        }

        return jsonResponse({
          avatar_id: avatar.id,
          generation_id: result.generation_id,
          status: 'creating',
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 1b: Upload user photo as talking photo (no training needed)
      // ---------------------------------------------------------------
      case 'upload_photo': {
        if (!body.image_url) return errorResponse('image_url required', req, 400);

        // Upload to HeyGen as a talking photo
        const talkingPhoto = await heygen.uploadTalkingPhoto(body.image_url);

        // Create avatar record — status 'ready' (no training needed)
        const { data: uploadAvatar, error: uploadInsertError } = await svc
          .from('heygen_avatars')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_name: body.avatar_name || 'My Avatar',
            avatar_type: 'talking_photo',
            status: 'ready',
            heygen_avatar_id: talkingPhoto.talking_photo_id,
            thumbnail_url: body.image_url,
          })
          .select('id')
          .single();

        if (uploadInsertError) {
          console.error('[heygen-avatar-create] upload insert error:', uploadInsertError);
          return errorResponse('Failed to create avatar record', req, 500);
        }

        return jsonResponse({
          avatar_id: uploadAvatar.id,
          talking_photo_id: talkingPhoto.talking_photo_id,
          status: 'ready',
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 2: Create group + start training
      // ---------------------------------------------------------------
      case 'create_group': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);
        if (!body.image_key || !body.generation_id) {
          return errorResponse('image_key and generation_id required', req, 400);
        }

        const groupResult = await heygen.createGroup({
          name: body.avatar_name || 'avatar_group',
          image_key: body.image_key,
          generation_id: body.generation_id,
        });

        await svc
          .from('heygen_avatars')
          .update({ heygen_group_id: groupResult.group_id })
          .eq('id', body.avatar_id);

        return jsonResponse({
          avatar_id: body.avatar_id,
          group_id: groupResult.group_id,
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 3: Train LORA
      // ---------------------------------------------------------------
      case 'train': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        const { data: avatar } = await svc
          .from('heygen_avatars')
          .select('heygen_group_id')
          .eq('id', body.avatar_id)
          .single();

        if (!avatar?.heygen_group_id) {
          return errorResponse('Avatar group not created yet', req, 400);
        }

        await heygen.trainAvatar(avatar.heygen_group_id);

        await svc
          .from('heygen_avatars')
          .update({ status: 'training' })
          .eq('id', body.avatar_id);

        return jsonResponse({ avatar_id: body.avatar_id, status: 'training' }, req);
      }

      // ---------------------------------------------------------------
      // Step 4: Generate look (after training)
      // ---------------------------------------------------------------
      case 'generate_look': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        const { data: avatar } = await svc
          .from('heygen_avatars')
          .select('heygen_group_id')
          .eq('id', body.avatar_id)
          .single();

        if (!avatar?.heygen_group_id) {
          return errorResponse('Avatar group not found', req, 400);
        }

        const result = await heygen.generateLook({
          group_id: avatar.heygen_group_id,
          prompt: body.prompt || 'avatar in professional business attire, office background',
          orientation: body.orientation || 'front',
          pose: body.pose || 'half_body',
          style: body.style || 'photorealistic',
        });

        await svc
          .from('heygen_avatars')
          .update({ status: 'generating_looks' })
          .eq('id', body.avatar_id);

        return jsonResponse({
          avatar_id: body.avatar_id,
          generation_id: result.generation_id,
          status: 'generating_looks',
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 5: Add motion to a look
      // ---------------------------------------------------------------
      case 'add_motion': {
        if (!body.photo_avatar_id) return errorResponse('photo_avatar_id required', req, 400);

        const result = await heygen.addMotion(body.photo_avatar_id);

        return jsonResponse({
          motion_avatar_id: result.id,
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 6: Finalize — mark avatar ready with selected look + voice
      // ---------------------------------------------------------------
      case 'finalize': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        const updates: Record<string, unknown> = { status: 'ready' };
        if (body.look_id) updates.heygen_avatar_id = body.look_id;
        if (body.voice_id) updates.voice_id = body.voice_id;
        if (body.voice_name) updates.voice_name = body.voice_name;

        const { error: updateError } = await svc
          .from('heygen_avatars')
          .update(updates)
          .eq('id', body.avatar_id);

        if (updateError) {
          return errorResponse('Failed to finalize avatar', req, 500);
        }

        return jsonResponse({ avatar_id: body.avatar_id, status: 'ready' }, req);
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : 'Internal error';
    console.error('[heygen-avatar-create] Error:', msg, err);
    return errorResponse(msg, req, 500);
  }
});
