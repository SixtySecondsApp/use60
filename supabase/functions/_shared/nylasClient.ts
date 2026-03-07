// supabase/functions/_shared/nylasClient.ts
// Shared Nylas API v3 client for email read/draft operations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const NYLAS_API_URI = 'https://api.us.nylas.com';

interface NylasError {
  type: string;
  message: string;
  statusCode: number;
}

interface NylasIntegration {
  grantId: string;
  accessToken: string;
  email: string;
  isActive: boolean;
}

/**
 * Get Nylas API key from environment
 */
function getNylasApiKey(): string {
  const key = Deno.env.get('NYLAS_API_KEY');
  if (!key) {
    throw new Error('NYLAS_API_KEY not configured');
  }
  return key;
}

/**
 * Get Nylas client ID from environment
 */
export function getNylasClientId(): string {
  const id = Deno.env.get('NYLAS_CLIENT_ID');
  if (!id) {
    throw new Error('NYLAS_CLIENT_ID not configured');
  }
  return id;
}

/**
 * Make an authenticated request to the Nylas API v3
 */
export async function nylasRequest(
  grantId: string,
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {}
): Promise<Response> {
  const apiKey = getNylasApiKey();
  const { method = 'GET', body, params } = options;

  const url = new URL(`/v3/grants/${encodeURIComponent(grantId)}${path}`, NYLAS_API_URI);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const nylasError: NylasError = {
      type: errorBody.type || 'api_error',
      message: errorBody.message || `Nylas API error: ${response.status}`,
      statusCode: response.status,
    };

    if (response.status === 401) {
      nylasError.type = 'authentication_error';
      nylasError.message = 'Nylas authentication failed — grant may be revoked';
    }

    throw nylasError;
  }

  return response;
}

/**
 * Get the active Nylas integration for a user
 */
export async function getNylasIntegration(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<NylasIntegration | null> {
  const { data, error } = await supabase
    .from('nylas_integrations')
    .select('id, grant_id, email, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    grantId: data.grant_id,
    accessToken: '', // Nylas v3 uses API key auth, not per-user tokens
    email: data.email,
    isActive: data.is_active,
  };
}
