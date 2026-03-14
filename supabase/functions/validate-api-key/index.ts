// supabase/functions/validate-api-key/index.ts
// Validates an AI provider API key by making a lightweight test call.
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

interface ValidateRequest {
  provider: Provider;
  key: string;
}

async function validateAnthropicKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    if (response.ok || response.status === 200) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Other errors (rate limit, server error, etc.)
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message || response.statusText || `HTTP ${response.status}`;
    return { valid: false, error: message };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Failed to reach Anthropic API' };
  }
}

async function validateOpenAIKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    if (response.ok || response.status === 200) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message || response.statusText || `HTTP ${response.status}`;
    return { valid: false, error: message };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Failed to reach OpenAI API' };
  }
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
    const body: ValidateRequest = await req.json();
    const { provider, key } = body;

    if (!provider || !key) {
      return errorResponse('Missing required fields: provider, key', req, 400);
    }

    if (!['anthropic', 'openai'].includes(provider)) {
      return errorResponse('Invalid provider. Must be "anthropic" or "openai"', req, 400);
    }

    // Validate the key based on provider
    let result: { valid: boolean; error?: string };

    if (provider === 'anthropic') {
      result = await validateAnthropicKey(key);
    } else {
      result = await validateOpenAIKey(key);
    }

    return jsonResponse(result, req);
  } catch (err: any) {
    console.error('[validate-api-key] Error:', err);
    return errorResponse(err.message || 'Internal server error', req, 500);
  }
});
