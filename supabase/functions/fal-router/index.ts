/**
 * fal-router — Credential management and model listing for fal.ai
 *
 * POST body must include: { action: string, ...params }
 *
 * Actions:
 *   test_credentials  — Validate a fal.ai API key (no auth required)
 *   save_credentials  — Store org's BYOK key (admin only)
 *   delete_credentials — Remove org's BYOK key (admin only)
 *   get_status        — Check if fal.ai is configured for this org
 *   list_models       — Get available video models with pricing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { FalClient } from '../_shared/fal.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

interface AuthContext {
  orgId: string;
  role: string;
}

async function getAuthContext(req: Request): Promise<AuthContext | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', req, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return errorResponse('Unauthorized', req, 401);

  const { data: membership } = await userClient
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return errorResponse('No organization found', req, 403);

  return { orgId: membership.org_id, role: membership.role };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleTestCredentials(
  body: Record<string, unknown>,
  req: Request,
): Promise<Response> {
  const apiKey = body.api_key as string | undefined;
  if (!apiKey) return errorResponse('api_key is required', req, 400);

  const fal = new FalClient(apiKey);
  const valid = await fal.testConnection();
  return jsonResponse({ valid }, req);
}

async function handleSaveCredentials(
  auth: AuthContext,
  body: Record<string, unknown>,
  req: Request,
): Promise<Response> {
  if (auth.role !== 'admin' && auth.role !== 'owner') {
    return errorResponse('Admin access required', req, 403);
  }

  const apiKey = body.api_key as string | undefined;
  if (!apiKey) return errorResponse('api_key is required', req, 400);

  // Test the key before saving
  const fal = new FalClient(apiKey);
  const valid = await fal.testConnection();
  if (!valid) {
    return jsonResponse({ success: false, error: 'Invalid fal.ai API key' }, req);
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await serviceClient
    .from('fal_org_credentials')
    .upsert(
      { org_id: auth.orgId, api_key: apiKey, is_byok: true },
      { onConflict: 'org_id' },
    );

  if (error) {
    console.error('[fal-router] save_credentials upsert error:', error);
    return jsonResponse({ success: false, error: 'Failed to save credentials' }, req);
  }

  return jsonResponse({ success: true }, req);
}

async function handleDeleteCredentials(
  auth: AuthContext,
  req: Request,
): Promise<Response> {
  if (auth.role !== 'admin' && auth.role !== 'owner') {
    return errorResponse('Admin access required', req, 403);
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await serviceClient
    .from('fal_org_credentials')
    .delete()
    .eq('org_id', auth.orgId);

  if (error) {
    console.error('[fal-router] delete_credentials error:', error);
    return jsonResponse({ success: false, error: 'Failed to delete credentials' }, req);
  }

  return jsonResponse({ success: true }, req);
}

async function handleGetStatus(
  auth: AuthContext,
  req: Request,
): Promise<Response> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await serviceClient
    .from('fal_org_credentials')
    .select('api_key, is_byok')
    .eq('org_id', auth.orgId)
    .maybeSingle();

  const hasPlatformKey = Boolean(Deno.env.get('FAL_KEY'));

  if (data?.api_key) {
    return jsonResponse({ configured: true, mode: 'byok' }, req);
  }
  if (hasPlatformKey) {
    return jsonResponse({ configured: true, mode: 'platform' }, req);
  }
  return jsonResponse({ configured: false, mode: 'none' }, req);
}

async function handleListModels(
  _auth: AuthContext,
  req: Request,
): Promise<Response> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: models, error } = await serviceClient
    .from('fal_video_models')
    .select('id, display_name, provider, mode, cost_per_second, credit_cost_per_second, max_duration_seconds, supported_aspect_ratios, supports_audio, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    console.error('[fal-router] list_models error:', error);
    return jsonResponse({ models: [] }, req);
  }

  return jsonResponse({ models: models ?? [] }, req);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', req, 400);
    }

    const { action } = body;
    if (!action) return errorResponse('action is required', req, 400);

    // test_credentials is the only action that doesn't require auth
    if (action === 'test_credentials') {
      return handleTestCredentials(body, req);
    }

    // All other actions require auth
    const authResult = await getAuthContext(req);
    if (authResult instanceof Response) return authResult;
    const auth = authResult;

    switch (action) {
      case 'save_credentials':
        return handleSaveCredentials(auth, body, req);
      case 'delete_credentials':
        return handleDeleteCredentials(auth, req);
      case 'get_status':
        return handleGetStatus(auth, req);
      case 'list_models':
        return handleListModels(auth, req);
      default:
        return errorResponse(
          `Unknown action: ${action}. Must be one of: test_credentials, save_credentials, delete_credentials, get_status, list_models`,
          req,
          400,
        );
    }
  } catch (error: unknown) {
    console.error('[fal-router] Unhandled error:', error);
    return errorResponse('Internal server error', req, 500);
  }
});
