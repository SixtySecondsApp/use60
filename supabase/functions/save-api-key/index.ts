// supabase/functions/save-api-key/index.ts
// Saves an AI provider API key to user_settings.ai_provider_keys (JSONB merge).
// Supports: anthropic, openai

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Provider = 'anthropic' | 'openai';

interface SaveKeyRequest {
  provider: Provider;
  key: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Missing authorization header', req, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse('Invalid authentication', req, 401);
    }

    // Parse and validate request body
    const body: SaveKeyRequest = await req.json();
    const { provider, key } = body;

    if (!provider || !key) {
      return errorResponse('Missing required fields: provider, key', req, 400);
    }

    if (!['anthropic', 'openai'].includes(provider)) {
      return errorResponse('Invalid provider. Must be "anthropic" or "openai"', req, 400);
    }

    // Read existing keys, merge the new one, then upsert.
    // This preserves any other provider keys already stored.
    const { data: existing } = await supabase
      .from('user_settings')
      .select('ai_provider_keys')
      .eq('user_id', user.id)
      .maybeSingle();

    const existingKeys = (existing?.ai_provider_keys as Record<string, string>) || {};
    const mergedKeys = { ...existingKeys, [provider]: key };

    const { error: saveError } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          ai_provider_keys: mergedKeys,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (saveError) {
      console.error('[save-api-key] Upsert error:', saveError);
      return errorResponse(`Failed to save API key: ${saveError.message}`, req, 500);
    }

    return jsonResponse({ success: true }, req);
  } catch (err: any) {
    console.error('[save-api-key] Error:', err);
    return errorResponse(err.message || 'Internal server error', req, 500);
  }
});
