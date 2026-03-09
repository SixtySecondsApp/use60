/**
 * Handler: avatar_create
 * Migrated from heygen-avatar-create edge function.
 *
 * Sub-actions:
 *   list, delete, generate_photo, upload_photo, create_group, train,
 *   create_group_and_train, generate_look, add_motion, finalize,
 *   create_digital_twin, digital_twin_status, import_digital_twin
 *
 * Auth: JWT + org membership. Stores progress in heygen_avatars table.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { createHeyGenClient } from '../../_shared/heygen.ts';
import { logFlatRateCostEvent, checkCreditBalance } from '../../_shared/costTracking.ts';
import { INTEGRATION_CREDIT_COSTS } from '../../_shared/creditPacks.ts';

type Action =
  | 'list'
  | 'delete'
  | 'generate_photo'
  | 'upload_photo'
  | 'create_group'
  | 'train'
  | 'create_group_and_train'
  | 'generate_look'
  | 'add_motion'
  | 'finalize'
  | 'create_digital_twin'
  | 'digital_twin_status'
  | 'import_digital_twin';

interface AvatarRequest {
  action: string; // router-level action
  sub_action?: Action;
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
  image_url?: string;
  generation_id?: string;
  avatar_name?: string;

  // create_digital_twin
  training_footage_url?: string;
  video_consent_url?: string;

  // import_digital_twin
  heygen_group_id?: string;

  // generate_look
  prompt?: string;

  // add_motion
  photo_avatar_id?: string; // HeyGen's photo avatar ID

  // finalize
  look_id?: string;
  voice_id?: string;
  voice_name?: string;
}

export async function handleAvatarCreate(req: Request): Promise<Response> {
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
    // Support both sub_action (router pattern) and legacy action field
    const action = (body.sub_action || body.action) as Action;

    // Pre-flight credit check for billable actions
    const BILLABLE_ACTIONS = new Set([
      'generate_photo', 'upload_photo', 'create_group_and_train',
      'train', 'generate_look', 'add_motion',
    ]);
    if (BILLABLE_ACTIONS.has(action)) {
      const creditCheck = await checkCreditBalance(svc, orgId);
      if (!creditCheck.allowed) {
        return errorResponse('Insufficient credits — please top up to use Video Avatar', req, 402);
      }
    }

    switch (action) {
      // ---------------------------------------------------------------
      // List all avatars for this org
      // ---------------------------------------------------------------
      case 'list': {
        const { data: avatars, error: listError } = await svc
          .from('heygen_avatars')
          .select('id, avatar_name, avatar_type, status, thumbnail_url, voice_id, voice_name, looks, created_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });

        if (listError) {
          console.error('[heygen-router/avatar-create] list error:', listError);
          return errorResponse('Failed to list avatars', req, 500);
        }

        return jsonResponse({ avatars: avatars || [] }, req);
      }

      // ---------------------------------------------------------------
      // Delete an avatar
      // ---------------------------------------------------------------
      case 'delete': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        // Verify ownership via org
        const { data: toDelete } = await svc
          .from('heygen_avatars')
          .select('id, org_id')
          .eq('id', body.avatar_id)
          .eq('org_id', orgId)
          .maybeSingle();

        if (!toDelete) return errorResponse('Avatar not found or not yours', req, 404);

        const { error: delError } = await svc
          .from('heygen_avatars')
          .delete()
          .eq('id', body.avatar_id);

        if (delError) {
          console.error('[heygen-router/avatar-create] delete error:', delError);
          return errorResponse('Failed to delete avatar', req, 500);
        }

        return jsonResponse({ deleted: true, avatar_id: body.avatar_id }, req);
      }

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
          console.error('[heygen-router/avatar-create] insert error:', insertError);
          return errorResponse('Failed to create avatar record', req, 500);
        }

        // Charge for photo generation
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_photo_generate, 'heygen_photo_generate',
          { avatar_id: avatar.id, generation_id: result.generation_id });

        return jsonResponse({
          avatar_id: avatar.id,
          generation_id: result.generation_id,
          status: 'creating',
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 1b: Upload user photo -> asset upload -> group -> train
      // ---------------------------------------------------------------
      case 'upload_photo': {
        if (!body.image_url) return errorResponse('image_url required', req, 400);

        // Step 1: Fetch image from URL
        let imgRes: Response;
        try {
          imgRes = await fetch(body.image_url);
          if (!imgRes.ok) {
            return errorResponse(`Failed to fetch image: HTTP ${imgRes.status}`, req, 400);
          }
        } catch (fetchErr) {
          return errorResponse(`Failed to fetch image: ${(fetchErr as Error).message}`, req, 500);
        }

        const imageBlob = await imgRes.blob();
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        // Step 2: Upload to HeyGen as an asset
        let assetJson: Record<string, unknown>;
        try {
          const assetRes = await fetch('https://upload.heygen.com/v1/asset', {
            method: 'POST',
            headers: {
              'x-api-key': heygen.getApiKey(),
              'Content-Type': contentType,
            },
            body: imageBlob,
          });
          assetJson = await assetRes.json();
          if (assetJson.code !== 100) {
            return errorResponse(`HeyGen asset upload failed: ${JSON.stringify(assetJson)}`, req, 500);
          }
        } catch (assetErr) {
          return errorResponse(`HeyGen asset upload error: ${(assetErr as Error).message}`, req, 500);
        }

        const assetData = assetJson.data as { image_key: string; url: string };

        // Step 3: Create avatar record
        const { data: uploadAvatar, error: uploadInsertError } = await svc
          .from('heygen_avatars')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_name: body.avatar_name || 'My Avatar',
            avatar_type: 'photo',
            status: 'creating',
            thumbnail_url: body.image_url,
            looks: [{ look_id: assetData.image_key, name: 'Uploaded', thumbnail_url: body.image_url }],
          })
          .select('id')
          .single();

        if (uploadInsertError) {
          return errorResponse(`DB insert failed: ${uploadInsertError.message}`, req, 500);
        }

        // Step 4: Create group
        let groupResult: { group_id: string };
        try {
          groupResult = await heygen.createGroup({
            name: body.avatar_name || 'avatar_group',
            image_key: assetData.image_key,
            generation_id: assetData.image_key,
          });
        } catch (groupErr) {
          return errorResponse(`createGroup failed: ${JSON.stringify(groupErr)}`, req, 500);
        }

        await svc
          .from('heygen_avatars')
          .update({ heygen_group_id: groupResult.group_id })
          .eq('id', uploadAvatar.id);

        // Step 5: Add to group
        try {
          await heygen.addToGroup(groupResult.group_id, body.avatar_name || 'look_1', [assetData.image_key], assetData.image_key);
        } catch (addErr) {
          return errorResponse(`addToGroup failed: ${JSON.stringify(addErr)}`, req, 500);
        }

        // Step 6: Train (retry with backoff — HeyGen needs time to process uploaded images)
        let trained = false;
        for (const delay of [6000, 5000, 5000]) {
          await new Promise((r) => setTimeout(r, delay));
          try {
            await heygen.trainAvatar(groupResult.group_id);
            trained = true;
            break;
          } catch (trainErr) {
            const te = trainErr as { code?: string };
            if (te.code !== 'invalid_parameter') {
              return errorResponse(`trainAvatar failed: ${JSON.stringify(trainErr)}`, req, 500);
            }
            // invalid_parameter = image not ready yet, retry
          }
        }
        if (!trained) {
          return errorResponse('Image processing timed out — please try training again in a moment', req, 408);
        }

        await svc
          .from('heygen_avatars')
          .update({ status: 'training' })
          .eq('id', uploadAvatar.id);

        // Charge for avatar training (upload is free, training is the billable step)
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_avatar_train, 'heygen_avatar_train',
          { avatar_id: uploadAvatar.id, group_id: groupResult.group_id });

        return jsonResponse({
          avatar_id: uploadAvatar.id,
          status: 'training',
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

        // Charge for avatar training
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_avatar_train, 'heygen_avatar_train',
          { avatar_id: body.avatar_id, group_id: avatar.heygen_group_id });

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

        // Charge for look generation
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_look_generate, 'heygen_look_generate',
          { avatar_id: body.avatar_id, generation_id: result.generation_id });

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

        // Charge for adding motion
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_add_motion, 'heygen_add_motion',
          { photo_avatar_id: body.photo_avatar_id, motion_avatar_id: result.id });

        return jsonResponse({
          motion_avatar_id: result.id,
        }, req);
      }

      // ---------------------------------------------------------------
      // Step 2+3 combined: Create group + train in one call
      // ---------------------------------------------------------------
      case 'create_group_and_train': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        // Fetch avatar to get generation_id and looks
        const { data: avatarRec } = await svc
          .from('heygen_avatars')
          .select('heygen_generation_id, looks')
          .eq('id', body.avatar_id)
          .single();

        if (!avatarRec) return errorResponse('Avatar not found', req, 404);

        const genId = body.generation_id || avatarRec.heygen_generation_id;
        // Use provided image_key or first look from DB
        const imageKey = body.image_key
          || (avatarRec.looks as Array<{ look_id?: string }>)?.[0]?.look_id;

        if (!genId || !imageKey) {
          return errorResponse('generation_id and image_key required (or must exist in DB)', req, 400);
        }

        // Step 1: Create group
        const groupResult = await heygen.createGroup({
          name: body.avatar_name || 'avatar_group',
          image_key: imageKey,
          generation_id: genId,
        });

        await svc
          .from('heygen_avatars')
          .update({ heygen_group_id: groupResult.group_id })
          .eq('id', body.avatar_id);

        // Step 2: Add image to group (required before training)
        await heygen.addToGroup(groupResult.group_id, body.avatar_name || 'look_1', [imageKey], genId);

        // Step 3: Train (retry with backoff — HeyGen needs time to process)
        let cgTrained = false;
        for (const delay of [6000, 5000, 5000]) {
          await new Promise((r) => setTimeout(r, delay));
          try {
            await heygen.trainAvatar(groupResult.group_id);
            cgTrained = true;
            break;
          } catch (trainErr) {
            const te = trainErr as { code?: string };
            if (te.code !== 'invalid_parameter') throw trainErr;
          }
        }
        if (!cgTrained) {
          throw { status: 408, message: 'Image processing timed out — please try training again', code: 'timeout' };
        }

        await svc
          .from('heygen_avatars')
          .update({ status: 'training' })
          .eq('id', body.avatar_id);

        // Charge for avatar training
        await logFlatRateCostEvent(svc, user.id, orgId, 'heygen', 'photo_avatar',
          INTEGRATION_CREDIT_COSTS.heygen_avatar_train, 'heygen_avatar_train',
          { avatar_id: body.avatar_id, group_id: groupResult.group_id });

        return jsonResponse({
          avatar_id: body.avatar_id,
          group_id: groupResult.group_id,
          status: 'training',
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

      // ---------------------------------------------------------------
      // Create a Digital Twin from training video + consent video
      // ---------------------------------------------------------------
      case 'create_digital_twin': {
        if (!body.training_footage_url) return errorResponse('training_footage_url required', req, 400);
        if (!body.video_consent_url) return errorResponse('video_consent_url required', req, 400);
        const twinName = body.avatar_name || body.name || 'Digital Twin';

        const result = await heygen.createDigitalTwin({
          training_footage_url: body.training_footage_url,
          video_consent_url: body.video_consent_url,
          avatar_name: twinName,
        });

        // Save to DB
        const { data: newAvatar, error: insertError } = await svc
          .from('heygen_avatars')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_name: twinName,
            avatar_type: 'digital_twin',
            heygen_avatar_id: result.avatar_id,
            status: 'training',
            thumbnail_url: null,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[heygen-router/avatar-create] digital twin insert error:', insertError);
          return errorResponse('Failed to save digital twin record', req, 500);
        }

        return jsonResponse({
          avatar_id: newAvatar.id,
          heygen_avatar_id: result.avatar_id,
          status: 'training',
        }, req);
      }

      // ---------------------------------------------------------------
      // Check Digital Twin training status
      // ---------------------------------------------------------------
      case 'digital_twin_status': {
        if (!body.avatar_id) return errorResponse('avatar_id required', req, 400);

        const { data: avatar } = await svc
          .from('heygen_avatars')
          .select('id, heygen_avatar_id, status')
          .eq('id', body.avatar_id)
          .single();

        if (!avatar?.heygen_avatar_id) return errorResponse('Avatar not found', req, 404);

        const status = await heygen.getDigitalTwinStatus(avatar.heygen_avatar_id);

        if (status.status === 'completed' && avatar.status !== 'ready') {
          // Fetch looks from the avatar group
          await svc
            .from('heygen_avatars')
            .update({ status: 'ready' })
            .eq('id', body.avatar_id);
        }

        return jsonResponse({
          avatar_id: body.avatar_id,
          heygen_status: status.status,
          db_status: avatar.status,
        }, req);
      }

      // ---------------------------------------------------------------
      // Import an existing Digital Twin from HeyGen (by group ID)
      // ---------------------------------------------------------------
      case 'import_digital_twin': {
        if (!body.heygen_group_id) return errorResponse('heygen_group_id required', req, 400);
        const importName = body.avatar_name || 'Digital Twin';

        // Fetch looks from the group
        const groupData = await heygen.listGroupAvatars(body.heygen_group_id);
        const looks = (groupData.avatar_list || []).map((a: any) => ({
          look_id: a.avatar_id,
          name: a.avatar_name,
          thumbnail_url: a.preview_image_url,
          preview_video_url: a.preview_video_url || null,
        }));

        // Get group info for default voice
        const groupInfo = await heygen.listAvatarGroups();
        const group = (groupInfo.avatar_group_list || []).find(
          (g) => g.id === body.heygen_group_id,
        );

        const firstLook = looks[0];

        const { data: newAvatar, error: insertError } = await svc
          .from('heygen_avatars')
          .insert({
            org_id: orgId,
            user_id: user.id,
            avatar_name: importName,
            avatar_type: 'digital_twin',
            heygen_avatar_id: firstLook?.look_id || null,
            heygen_group_id: body.heygen_group_id,
            status: 'ready',
            looks,
            voice_id: group?.default_voice_id || body.voice_id || null,
            voice_name: body.voice_name || null,
            thumbnail_url: firstLook?.thumbnail_url || group?.preview_image || null,
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[heygen-router/avatar-create] import error:', insertError);
          return errorResponse('Failed to import digital twin', req, 500);
        }

        return jsonResponse({
          avatar_id: newAvatar.id,
          looks,
          voice_id: group?.default_voice_id || null,
          status: 'ready',
        }, req);
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400);
    }
  } catch (err) {
    const heygenErr = err as { code?: string; message?: string; status?: number };
    const msg = err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? heygenErr.message || JSON.stringify(err)
        : 'Internal error';
    console.error('[heygen-router/avatar-create] Error:', msg, err);

    // Surface HeyGen-specific errors with appropriate status codes
    if (heygenErr.code === 'insufficient_credit') {
      return errorResponse('HeyGen credits exhausted — please top up your account', req, 402);
    }
    if (heygenErr.code === 'RATE_LIMITED') {
      return errorResponse('HeyGen rate limited — please try again shortly', req, 429);
    }

    return errorResponse(msg, req, 500);
  }
}
