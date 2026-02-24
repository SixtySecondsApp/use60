/**
 * savvycal-config Edge Function
 *
 * Manages org-scoped SavvyCal integration:
 * - status: Get current integration status
 * - connect_api_token: Validate and store SavvyCal Personal Access Token
 * - check_webhook: Verify webhook is configured in SavvyCal
 * - disconnect: Deactivate integration and clear secrets
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getUserOrgId, requireOrgRole } from '../_shared/edgeAuth.ts';

type Action = 'status' | 'connect_api_token' | 'check_webhook' | 'disconnect' | 'trigger_sync' | 'update_webhook_secret';

const SAVVYCAL_API_BASE = 'https://api.savvycal.com/v1';

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ||
      'authorization, x-client-info, apikey, content-type',
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
  return `scwh_${crypto.randomUUID()}-${suffix}`;
}

/**
 * Validate a SavvyCal API token by calling the API
 * SavvyCal uses Bearer token authentication with Personal Access Tokens
 */
async function validateSavvyCalToken(apiToken: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // Try to get current user as a validation check
    const response = await fetch(`${SAVVYCAL_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid API token. Please check your Personal Access Token.' };
    }

    const text = await response.text();
    return { valid: false, error: `SavvyCal API error: ${response.status} - ${text}` };
  } catch (error) {
    return { valid: false, error: `Failed to connect to SavvyCal: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

/**
 * Check if our webhook URL is configured in SavvyCal
 */
async function checkWebhookConfigured(
  apiToken: string,
  expectedUrlPattern: string
): Promise<{ configured: boolean; webhooks: Array<{ id: string; url: string; events: string[] }> }> {
  try {
    const response = await fetch(`${SAVVYCAL_API_BASE}/webhooks`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { configured: false, webhooks: [] };
    }

    const data = await response.json();
    const webhooks = data.entries || data.webhooks || data || [];

    // Check if any webhook URL contains our expected pattern
    const configured = webhooks.some((webhook: any) => {
      const url = webhook.url || webhook.endpoint || '';
      return url.includes(expectedUrlPattern);
    });

    return {
      configured,
      webhooks: webhooks.map((w: any) => ({
        id: w.id,
        url: w.url || w.endpoint,
        events: w.events || [],
      })),
    };
  } catch (error) {
    console.error('[savvycal-config] Error checking webhooks:', error);
    return { configured: false, webhooks: [] };
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    try {
      return new Response('ok', { status: 200, headers: getCorsHeaders(req) });
    } catch {
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

    // =====================================================================
    // ACTION: status
    // =====================================================================
    if (action === 'status') {
      const { data: integration } = await service
        .from('savvycal_integrations')
        .select('id, org_id, is_active, webhook_token, webhook_configured_at, webhook_last_received_at, webhook_last_event_id, last_sync_at, connected_by_user_id, created_at, updated_at')
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
        .from('savvycal_integration_secrets')
        .select('api_token, webhook_secret')
        .eq('integration_id', integration.id)
        .maybeSingle();

      // Compute webhook URL
      const publicUrl = Deno.env.get('PUBLIC_URL') || Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.use60.com') || '';
      const webhookUrl = integration.webhook_token
        ? `${publicUrl}/api/webhooks/savvycal?token=${encodeURIComponent(integration.webhook_token)}`
        : null;

      return jsonResponse(
        {
          connected: integration.is_active === true && Boolean(secrets?.api_token),
          integration: {
            ...integration,
            webhook_url: webhookUrl,
          },
          secrets_summary: {
            has_api_token: Boolean(secrets?.api_token),
            has_webhook_secret: Boolean(secrets?.webhook_secret),
          },
        },
        req,
        200
      );
    }

    // All mutation actions require admin
    await requireOrgRole(service, orgId, user.id, ['owner', 'admin']);

    // =====================================================================
    // ACTION: connect_api_token
    // =====================================================================
    if (action === 'connect_api_token') {
      const apiToken = typeof body.api_token === 'string' ? body.api_token.trim() : '';
      const webhookSecret = typeof body.webhook_secret === 'string' ? body.webhook_secret.trim() : '';

      if (!apiToken) {
        return jsonResponse({ error: 'api_token is required' }, req, 400);
      }

      // Validate the token with SavvyCal API
      const validation = await validateSavvyCalToken(apiToken);
      if (!validation.valid) {
        return jsonResponse({ error: validation.error || 'Invalid SavvyCal API token' }, req, 400);
      }

      // Keep existing webhook token if present
      const { data: existing } = await service
        .from('savvycal_integrations')
        .select('id, webhook_token')
        .eq('org_id', orgId)
        .maybeSingle();

      const webhookToken = existing?.webhook_token || generateWebhookToken();

      const { data: integration, error: upsertErr } = await service
        .from('savvycal_integrations')
        .upsert(
          {
            org_id: orgId,
            is_active: true,
            webhook_token: webhookToken,
            connected_by_user_id: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id' }
        )
        .select('id, org_id, is_active, webhook_token, webhook_configured_at, webhook_last_received_at, last_sync_at')
        .single();

      if (upsertErr || !integration) {
        return jsonResponse({ error: `Failed to upsert integration: ${upsertErr?.message || 'unknown'}` }, req, 500);
      }

      const { error: secretsErr } = await service
        .from('savvycal_integration_secrets')
        .upsert(
          {
            integration_id: integration.id,
            org_id: orgId,
            api_token: apiToken,
            webhook_secret: webhookSecret || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integration_id' }
        );

      if (secretsErr) {
        return jsonResponse({ error: `Failed to store secrets: ${secretsErr.message}` }, req, 500);
      }

      // Compute webhook URL
      const publicUrl = Deno.env.get('PUBLIC_URL') || 'https://use60.com';
      const webhookUrl = `${publicUrl}/api/webhooks/savvycal?token=${encodeURIComponent(webhookToken)}`;

      return jsonResponse(
        {
          success: true,
          integration: {
            ...integration,
            webhook_url: webhookUrl,
          },
        },
        req,
        200
      );
    }

    // =====================================================================
    // ACTION: check_webhook
    // =====================================================================
    if (action === 'check_webhook') {
      const { data: integration } = await service
        .from('savvycal_integrations')
        .select('id, webhook_token')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!integration) {
        return jsonResponse({ error: 'No SavvyCal integration configured' }, req, 400);
      }

      const { data: secrets } = await service
        .from('savvycal_integration_secrets')
        .select('api_token')
        .eq('integration_id', integration.id)
        .maybeSingle();

      if (!secrets?.api_token) {
        return jsonResponse({ error: 'No API token configured' }, req, 400);
      }

      // Check if webhook is configured - look for our token in any webhook URL
      const result = await checkWebhookConfigured(
        secrets.api_token,
        integration.webhook_token
      );

      if (result.configured) {
        // Update webhook_configured_at
        await service
          .from('savvycal_integrations')
          .update({ webhook_configured_at: new Date().toISOString() })
          .eq('id', integration.id);
      }

      return jsonResponse(
        {
          webhook_configured: result.configured,
          webhooks: result.webhooks,
        },
        req,
        200
      );
    }

    // =====================================================================
    // ACTION: trigger_sync
    // =====================================================================
    if (action === 'trigger_sync') {
      const sinceHours = typeof body.since_hours === 'number' ? body.since_hours : 24;

      // Invoke sync-savvycal-events
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      const cronSecret = Deno.env.get('CRON_SECRET') ?? '';

      const syncHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      };
      if (cronSecret) {
        syncHeaders['x-cron-secret'] = cronSecret;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-savvycal-events`, {
        method: 'POST',
        headers: syncHeaders,
        body: JSON.stringify({
          org_id: orgId,
          since_hours: sinceHours,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return jsonResponse(
          { error: data.error || 'Sync failed', details: data },
          req,
          response.status
        );
      }

      return jsonResponse(data, req, 200);
    }

    // =====================================================================
    // ACTION: update_webhook_secret
    // =====================================================================
    if (action === 'update_webhook_secret') {
      const webhookSecret = typeof body.webhook_secret === 'string' ? body.webhook_secret.trim() : '';

      const { data: integration } = await service
        .from('savvycal_integrations')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!integration) {
        return jsonResponse({ error: 'No SavvyCal integration configured' }, req, 400);
      }

      const { error: updateErr } = await service
        .from('savvycal_integration_secrets')
        .update({
          webhook_secret: webhookSecret || null,
          updated_at: new Date().toISOString(),
        })
        .eq('integration_id', integration.id);

      if (updateErr) {
        return jsonResponse({ error: `Failed to update webhook secret: ${updateErr.message}` }, req, 500);
      }

      return jsonResponse(
        {
          success: true,
          has_webhook_secret: Boolean(webhookSecret),
        },
        req,
        200
      );
    }

    // =====================================================================
    // ACTION: disconnect
    // =====================================================================
    if (action === 'disconnect') {
      const { data: integration } = await service
        .from('savvycal_integrations')
        .select('id')
        .eq('org_id', orgId)
        .maybeSingle();

      if (!integration) {
        return jsonResponse({ success: true, disconnected: true }, req, 200);
      }

      // Delete secrets
      await service.from('savvycal_integration_secrets').delete().eq('integration_id', integration.id);

      // Deactivate integration
      await service
        .from('savvycal_integrations')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      return jsonResponse({ success: true, disconnected: true }, req, 200);
    }

    return jsonResponse({ error: 'Unknown action' }, req, 400);
  } catch (e: any) {
    console.error('[savvycal-config] Error:', e);
    return jsonResponse({ error: e?.message || 'Unexpected error' }, req, 500);
  }
});













