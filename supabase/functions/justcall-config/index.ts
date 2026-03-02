import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getUserOrgId, requireOrgRole } from '../_shared/edgeAuth.ts';

type Action = 'status' | 'connect_api_key' | 'disconnect';

function getCorsHeaders(req: Request): Record<string, string> {
  // Echo the caller origin when present so credentials work.
  // For server-to-server requests, Origin is usually absent.
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ||
      'authorization, x-client-info, apikey, content-type, x-api-key, x-cron-secret, x-internal-call',
    'Access-Control-Allow-Methods':
      req.headers.get('Access-Control-Request-Method') || 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

function jsonResponse(data: unknown, req: Request, status: number = 200): Response {
  const corsHeaders = getCorsHeaders(req);
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateWebhookToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${crypto.randomUUID()}-${suffix}`;
}

serve(async (req) => {
  // CORS preflight must never throw or hard-fail; otherwise the browser aborts the real request.
  if (req.method === 'OPTIONS') {
    try {
      return new Response('ok', { status: 200, headers: getCorsHeaders(req) });
    } catch {
      // Last-resort: still respond OK with permissive headers
      return new Response('ok', {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    }
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, req, 405);
    }

    const anon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: authData, error: authErr } = await anon.auth.getUser();
    if (authErr || !authData?.user) {
      return jsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    const user = authData.user;

    const service = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const body = await req.json().catch(() => ({} as any));
    const action: Action = body.action;
    const orgIdFromBody = typeof body.org_id === 'string' ? body.org_id : null;

    let orgId = orgIdFromBody;
    if (!orgId) {
      orgId = await getUserOrgId(service, user.id);
    }
    if (!orgId) {
      return jsonResponse({ error: 'Missing org_id' }, req, 400);
    }

    if (action === 'status') {
      const { data: integration } = await service
        .from('justcall_integrations')
        .select('id, org_id, auth_type, is_active, webhook_token, token_expires_at, last_sync_at, connected_by_user_id, created_at, updated_at')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!integration) {
        return jsonResponse(
          {
            connected: false,
            org_id: orgId,
          },
          req,
          200
        );
      }

      const { data: secrets } = await service
        .from('justcall_integration_secrets')
        .select('api_key, api_secret')
        .eq('integration_id', integration.id)
        .maybeSingle();

      return jsonResponse(
        {
          connected: integration.is_active === true,
          integration,
          secrets_summary: {
            has_api_key: Boolean(secrets?.api_key),
            has_api_secret: Boolean(secrets?.api_secret),
          },
        },
        req,
        200
      );
    }

    // Mutations are admin-only
    await requireOrgRole(service, orgId, user.id, ['owner', 'admin']);

    if (action === 'disconnect') {
      const { data: integration } = await service
        .from('justcall_integrations')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!integration) {
        return jsonResponse({ success: true, disconnected: true }, req, 200);
      }

      await service.from('justcall_integration_secrets').delete().eq('integration_id', integration.id);
      await service
        .from('justcall_integrations')
        .update({ is_active: false, auth_type: 'api_key', token_expires_at: null })
        .eq('id', integration.id);

      return jsonResponse({ success: true, disconnected: true }, req, 200);
    }

    if (action === 'connect_api_key') {
      const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
      const apiSecret = typeof body.api_secret === 'string' ? body.api_secret.trim() : '';

      if (!apiKey) {
        return jsonResponse({ error: 'api_key is required' }, req, 400);
      }

      // Keep existing webhook token if present
      const { data: existing } = await service
        .from('justcall_integrations')
        .select('id, webhook_token')
        .eq('org_id', orgId)
        .maybeSingle();

      const webhookToken = existing?.webhook_token || generateWebhookToken();

      const { data: integration, error: upsertErr } = await service
        .from('justcall_integrations')
        .upsert(
          {
            org_id: orgId,
            auth_type: 'api_key',
            is_active: true,
            webhook_token: webhookToken,
            token_expires_at: null,
            connected_by_user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id' }
        )
        .select('id, org_id, auth_type, is_active, webhook_token, token_expires_at, last_sync_at')
        .single();

      if (upsertErr || !integration) {
        return jsonResponse({ error: `Failed to upsert integration: ${upsertErr?.message || 'unknown'}` }, req, 500);
      }

      const { error: secretsErr } = await service
        .from('justcall_integration_secrets')
        .upsert(
          {
            integration_id: integration.id,
            org_id: orgId,
            api_key: apiKey,
            api_secret: apiSecret || null,
            oauth_access_token: null,
            oauth_refresh_token: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integration_id' }
        );

      if (secretsErr) {
        return jsonResponse({ error: `Failed to store secrets: ${secretsErr.message}` }, req, 500);
      }

      return jsonResponse({ success: true, integration }, req, 200);
    }

    return jsonResponse({ error: 'Unknown action' }, req, 400);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'Unexpected error' }, req, 500);
  }
});


