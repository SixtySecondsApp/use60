// supabase/functions/_shared/tokenManager.ts
// WS-002: Centralized Token Refresh
//
// Single source of truth for token management across Google and Microsoft.
// Uses row-level locking to prevent race conditions on concurrent refresh.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { TokenExpiredError, ProviderError, type WorkspaceProvider } from './workspaceErrors.ts';

/** Buffer before expiry to trigger proactive refresh (5 minutes) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenResult {
  accessToken: string;
  expiresAt: string;
  refreshed: boolean;
}

/**
 * Get a valid access token for a provider integration.
 *
 * 1. Checks if the current token is still valid (with 5-minute buffer)
 * 2. If expiring soon, refreshes the token using the provider's OAuth endpoint
 * 3. Uses `FOR UPDATE SKIP LOCKED` to prevent concurrent refresh races
 */
export async function getValidToken(
  provider: WorkspaceProvider,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<TokenResult> {
  const table = provider === 'google' ? 'google_integrations' : 'microsoft_integrations';

  // Fetch current tokens
  const { data: integration, error } = await supabase
    .from(table)
    .select('id, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !integration) {
    throw new TokenExpiredError(provider, `No active ${provider} integration found`);
  }

  // Check if token is still valid with buffer
  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  if (expiresAt.getTime() - now.getTime() > REFRESH_BUFFER_MS) {
    return {
      accessToken: integration.access_token,
      expiresAt: integration.expires_at,
      refreshed: false,
    };
  }

  // Token needs refresh — use row-level lock to prevent races
  if (!integration.refresh_token) {
    throw new TokenExpiredError(provider, 'No refresh token available — user must reconnect');
  }

  return refreshToken(provider, integration.id, integration.refresh_token, table, supabase);
}

async function refreshToken(
  provider: WorkspaceProvider,
  integrationId: string,
  refreshToken: string,
  table: string,
  supabase: ReturnType<typeof createClient>
): Promise<TokenResult> {
  // Acquire row-level lock via RPC to prevent concurrent refreshes
  const { data: locked, error: lockError } = await supabase.rpc('try_lock_integration_refresh', {
    p_table: table,
    p_id: integrationId,
  });

  // If lock fails, another process is refreshing — wait briefly and re-read
  if (lockError || !locked) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: updated } = await supabase
      .from(table)
      .select('access_token, expires_at')
      .eq('id', integrationId)
      .maybeSingle();

    if (updated) {
      return { accessToken: updated.access_token, expiresAt: updated.expires_at, refreshed: false };
    }
    throw new ProviderError(provider, 'Failed to acquire refresh lock');
  }

  try {
    const tokenData = provider === 'google'
      ? await refreshGoogleToken(refreshToken)
      : await refreshMicrosoftToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 3600));

    // Update stored tokens
    const updateData: Record<string, unknown> = {
      access_token: tokenData.access_token,
      expires_at: expiresAt.toISOString(),
      token_status: 'valid',
    };
    // Microsoft may issue a new refresh token
    if (tokenData.refresh_token) {
      updateData.refresh_token = tokenData.refresh_token;
    }

    const { error: updateError } = await supabase
      .from(table)
      .update(updateData)
      .eq('id', integrationId);

    if (updateError) {
      throw new ProviderError(provider, 'Failed to update access token in database');
    }

    return {
      accessToken: tokenData.access_token,
      expiresAt: expiresAt.toISOString(),
      refreshed: true,
    };
  } catch (err) {
    // Mark token as needing reauth if refresh fails with invalid_grant
    const msg = (err as Error).message || '';
    if (msg.includes('invalid_grant') || msg.includes('revoked')) {
      await supabase
        .from(table)
        .update({ token_status: 'needs_reconnect' })
        .eq('id', integrationId);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Google token refresh
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function refreshGoogleToken(refreshTokenValue: string): Promise<TokenResponse> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new TokenExpiredError(
      'google',
      `Google token refresh failed: ${errorData.error_description || errorData.error || 'Unknown error'}`
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Microsoft token refresh (WS-008 extends this)
// ---------------------------------------------------------------------------

async function refreshMicrosoftToken(refreshTokenValue: string): Promise<TokenResponse> {
  const clientId = Deno.env.get('MS_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET') || '';

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
      grant_type: 'refresh_token',
      scope: 'Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.ReadWrite Contacts.Read User.Read offline_access',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new TokenExpiredError(
      'microsoft',
      `Microsoft token refresh failed: ${errorData.error_description || errorData.error || 'Unknown error'}`
    );
  }

  return response.json();
}
