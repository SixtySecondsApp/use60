/**
 * elevenlabs-admin
 *
 * POST /elevenlabs-admin
 * Body: { action, ...params }
 *
 * Actions:
 *   save_credentials  — Store ElevenLabs API key for org (admin only)
 *   test_credentials  — Verify API key works
 *   delete_credentials — Remove stored API key
 *
 * Auth: JWT validated, org membership + admin role checked.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

interface AdminRequest {
  action: 'save_credentials' | 'test_credentials' | 'delete_credentials';
  api_key?: string;
}

async function testElevenLabsKey(apiKey: string): Promise<{ valid: boolean; subscription?: any; error?: string }> {
  try {
    // Try subscription endpoint first (requires user_read scope)
    const res = await fetch(`${ELEVENLABS_BASE}/v1/user/subscription`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (res.ok) {
      const data = await res.json();
      return { valid: true, subscription: data };
    }

    // Scoped keys may lack user_read — fall back to /v1/voices to verify key is valid
    if (res.status === 401 || res.status === 403) {
      const voicesRes = await fetch(`${ELEVENLABS_BASE}/v1/voices`, {
        headers: { 'xi-api-key': apiKey },
      });
      if (voicesRes.ok) {
        return { valid: true, subscription: { tier: 'unknown (scoped key)' } };
      }
    }

    const errText = await res.text().catch(() => '');
    console.error(`[elevenlabs-admin] API key test failed: ${res.status} ${errText}`);
    return { valid: false, error: `ElevenLabs returned ${res.status}` };
  } catch (err) {
    console.error('[elevenlabs-admin] API key test error:', err);
    return { valid: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

Deno.serve(async (req: Request) => {
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
      .select('org_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) return errorResponse('No organization membership found', req, 403);
    if (membership.role !== 'admin' && membership.role !== 'owner') {
      return errorResponse('Admin role required', req, 403);
    }

    const orgId = membership.org_id;
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: AdminRequest = await req.json();

    switch (body.action) {
      case 'save_credentials': {
        if (!body.api_key?.trim()) {
          return errorResponse('api_key is required', req, 400);
        }

        const { valid, subscription, error: testError } = await testElevenLabsKey(body.api_key.trim());
        if (!valid) {
          return errorResponse(`Invalid ElevenLabs API key — ${testError || 'connection test failed'}`, req, 400);
        }

        const { error: upsertError } = await svc
          .from('elevenlabs_org_credentials')
          .upsert(
            {
              org_id: orgId,
              api_key: body.api_key.trim(),
              plan_tier: subscription?.tier || 'free',
            },
            { onConflict: 'org_id' },
          );

        if (upsertError) {
          console.error('[elevenlabs-admin] save_credentials error:', upsertError);
          return errorResponse('Failed to save credentials', req, 500);
        }

        return jsonResponse({
          success: true,
          message: 'ElevenLabs API key saved and verified',
          plan_tier: subscription?.tier,
          character_limit: subscription?.character_limit,
          character_count: subscription?.character_count,
        }, req);
      }

      case 'test_credentials': {
        const { data: creds } = await svc
          .from('elevenlabs_org_credentials')
          .select('api_key, plan_tier')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return jsonResponse({ connected: false, message: 'No ElevenLabs API key configured' }, req);
        }

        const { valid, subscription } = await testElevenLabsKey(creds.api_key);

        return jsonResponse({
          connected: valid,
          message: valid ? 'Connected to ElevenLabs' : 'Connection failed',
          plan_tier: subscription?.tier || creds.plan_tier,
          character_limit: subscription?.character_limit,
          character_count: subscription?.character_count,
        }, req);
      }

      case 'delete_credentials': {
        const { error: deleteError } = await svc
          .from('elevenlabs_org_credentials')
          .delete()
          .eq('org_id', orgId);

        if (deleteError) {
          console.error('[elevenlabs-admin] delete_credentials error:', deleteError);
          return errorResponse('Failed to remove credentials', req, 500);
        }

        return jsonResponse({ success: true, message: 'ElevenLabs disconnected' }, req);
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, req, 400);
    }
  } catch (err) {
    console.error('[elevenlabs-admin] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
