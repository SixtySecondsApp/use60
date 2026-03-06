/**
 * heygen-admin
 *
 * POST /heygen-admin
 * Body: { action, ...params }
 *
 * Actions:
 *   save_credentials  — Store HeyGen API key for org (admin only)
 *   test_credentials  — Verify API key works
 *   list_voices       — List available TTS voices
 *   get_account_info  — Get account status / avatar list
 *
 * Auth: JWT validated, org membership + admin role checked.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { HeyGenClient } from '../_shared/heygen.ts';

interface AdminRequest {
  action: 'save_credentials' | 'test_credentials' | 'list_voices' | 'get_account_info';
  api_key?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization', req, 401);
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return errorResponse('Unauthorized', req, 401);
    }

    // 2. Get org membership + verify admin
    const { data: membership } = await userClient
      .from('organization_memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return errorResponse('No organization membership found', req, 403);
    }

    if (membership.role !== 'admin' && membership.role !== 'owner') {
      return errorResponse('Admin role required', req, 403);
    }

    const orgId = membership.org_id;

    // 3. Service client for credential operations
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 4. Parse request
    const body: AdminRequest = await req.json();
    const { action } = body;

    // 5. Handle actions
    switch (action) {
      case 'save_credentials': {
        if (!body.api_key?.trim()) {
          return errorResponse('api_key is required', req, 400);
        }

        // Test the key first
        const testClient = new HeyGenClient(body.api_key.trim());
        const isValid = await testClient.testConnection();
        if (!isValid) {
          return errorResponse('Invalid HeyGen API key — connection test failed', req, 400);
        }

        // Upsert credentials
        const { error: upsertError } = await svc
          .from('heygen_org_credentials')
          .upsert(
            { org_id: orgId, api_key: body.api_key.trim() },
            { onConflict: 'org_id' },
          );

        if (upsertError) {
          console.error('[heygen-admin] save_credentials error:', upsertError);
          return errorResponse('Failed to save credentials', req, 500);
        }

        return jsonResponse({ success: true, message: 'HeyGen API key saved and verified' }, req);
      }

      case 'test_credentials': {
        // Only check org-specific key (integration page = BYOK)
        const { data: creds } = await svc
          .from('heygen_org_credentials')
          .select('api_key')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return jsonResponse({ connected: false, message: 'No HeyGen API key configured' }, req);
        }

        const client = new HeyGenClient(creds.api_key);
        const connected = await client.testConnection();

        return jsonResponse({
          connected,
          message: connected ? 'Connected to HeyGen' : 'Connection failed',
        }, req);
      }

      case 'list_voices': {
        const { data: creds } = await svc
          .from('heygen_org_credentials')
          .select('api_key')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return errorResponse('HeyGen not configured — add API key first', req, 400);
        }

        const client = new HeyGenClient(creds.api_key);
        const result = await client.listVoices();

        return jsonResponse({ voices: result.voices }, req);
      }

      case 'get_account_info': {
        const { data: creds } = await svc
          .from('heygen_org_credentials')
          .select('api_key, plan_tier')
          .eq('org_id', orgId)
          .maybeSingle();

        if (!creds?.api_key) {
          return jsonResponse({ configured: false }, req);
        }

        const client = new HeyGenClient(creds.api_key);

        try {
          const avatars = await client.listAvatars();
          return jsonResponse({
            configured: true,
            plan_tier: creds.plan_tier,
            avatar_count: avatars.avatars?.length ?? 0,
          }, req);
        } catch (err) {
          return jsonResponse({
            configured: true,
            plan_tier: creds.plan_tier,
            error: err instanceof Error ? err.message : 'Failed to fetch account info',
          }, req);
        }
      }

      default:
        return errorResponse(`Unknown action: ${action}`, req, 400);
    }
  } catch (err) {
    console.error('[heygen-admin] Error:', err);
    return errorResponse(
      err instanceof Error ? err.message : 'Internal error',
      req,
      500,
    );
  }
});
