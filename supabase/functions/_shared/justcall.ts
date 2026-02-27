import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export type JustCallAuthType = 'api_key';

export type JustCallIntegration = {
  id: string;
  org_id: string;
  auth_type: JustCallAuthType;
  is_active: boolean;
  webhook_token: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
};

export type JustCallIntegrationSecrets = {
  integration_id: string;
  org_id: string;
  api_key: string | null;
  api_secret: string | null;
};

export async function getOrgJustCallIntegration(
  supabaseService: ReturnType<typeof createClient>,
  orgId: string
): Promise<{ integration: JustCallIntegration | null; secrets: JustCallIntegrationSecrets | null }> {
  const { data: integration } = await supabaseService
    .from('justcall_integrations')
    .select('id, org_id, auth_type, is_active, webhook_token, token_expires_at, last_sync_at')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .maybeSingle();

  if (!integration) return { integration: null, secrets: null };

  const { data: secrets } = await supabaseService
    .from('justcall_integration_secrets')
    .select('integration_id, org_id, api_key, api_secret')
    .eq('integration_id', integration.id)
    .maybeSingle();

  return { integration: integration as any, secrets: (secrets as any) ?? null };
}

/**
 * Return headers for JustCall API requests.
 * JustCall does NOT support OAuth for API access (per JustCall support).
 * Use API Key + API Secret from JustCall → "APIs and Webhooks".
 */
export async function getJustCallAuthHeaders(
  supabaseService: ReturnType<typeof createClient>,
  orgId: string
): Promise<Record<string, string>> {
  const { integration, secrets } = await getOrgJustCallIntegration(supabaseService, orgId);
  if (!integration || !secrets) {
    throw new Error('No active JustCall integration for this organization');
  }

  // API key/secret mode
  const apiKey = secrets.api_key;
  const apiSecret = secrets.api_secret;

  if (apiKey && apiSecret) {
    return {
      Authorization: `${apiKey}:${apiSecret}`,
      Accept: 'application/json',
    };
  }

  if (apiKey) {
    // Some endpoints accept Bearer api_key
    return {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };
  }

  throw new Error('JustCall API credentials missing');
}













