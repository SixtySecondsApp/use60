// supabase/functions/_shared/microsoftOAuth.ts
// Shared Microsoft OAuth token refresh and management utilities

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface MicrosoftIntegration {
  id: string;
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string;
  is_active: boolean;
  token_status: string;
  last_token_refresh: string;
  service_preferences: Record<string, boolean>;
  mail_subscription_id: string | null;
  mail_subscription_expiry: string | null;
  calendar_subscription_id: string | null;
  calendar_subscription_expiry: string | null;
}

/**
 * Error thrown when a Microsoft refresh token is invalid/revoked
 * This indicates the user needs to reconnect their Microsoft account
 */
export class MicrosoftTokenRevokedError extends Error {
  constructor(message = 'Microsoft token has been revoked') {
    super(message);
    this.name = 'MicrosoftTokenRevokedError';
  }
}

/**
 * Refresh a Microsoft OAuth access token using the refresh token
 * Updates the token in the database and returns the new access token
 *
 * @throws {MicrosoftTokenRevokedError} If the refresh token is invalid/revoked
 * @throws {Error} For other refresh failures
 */
export async function refreshMicrosoftAccessToken(
  refreshToken: string,
  supabase: any,
  userId: string
): Promise<string> {
  const clientId = Deno.env.get('MS_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET') || '';

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    const errorMessage = errorData.error_description || errorData.error || 'Unknown error';

    // Check for permanent failures that require reconnection
    const isTokenRevoked =
      errorData.error === 'invalid_grant' ||
      errorMessage.toLowerCase().includes('token has been expired or revoked') ||
      errorMessage.toLowerCase().includes('token has been revoked') ||
      response.status === 400;

    if (isTokenRevoked) {
      console.error(`[microsoftOAuth] Token revoked for user ${userId}: ${errorMessage}`);

      // Mark integration as needing reconnection
      await supabase
        .from('microsoft_integrations')
        .update({
          token_status: 'revoked',
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      throw new MicrosoftTokenRevokedError(
        `Microsoft access has been revoked. Please reconnect your Microsoft account. (${errorMessage})`
      );
    }

    throw new Error(`Failed to refresh token: ${errorMessage}`);
  }

  const data = await response.json();

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

  // Microsoft may not return a new refresh_token — preserve existing one as fallback
  const { error: updateError } = await supabase
    .from('microsoft_integrations')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt.toISOString(),
      token_status: 'valid',
      last_token_refresh: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    throw new Error('Failed to update access token in database');
  }

  return data.access_token;
}

/**
 * Get user's Microsoft integration with valid access token
 * Automatically refreshes token if expired
 */
export async function getMicrosoftIntegration(
  supabase: any,
  userId: string
): Promise<{ accessToken: string; integration: MicrosoftIntegration } | null> {
  const { data: integration, error: integrationError } = await supabase
    .from('microsoft_integrations')
    .select('id, user_id, email, access_token, refresh_token, expires_at, scopes, is_active, token_status, last_token_refresh, service_preferences, mail_subscription_id, mail_subscription_expiry, calendar_subscription_id, calendar_subscription_expiry')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (integrationError || !integration) {
    return null;
  }

  // Check if token needs refresh
  const expiresAt = new Date(integration.expires_at);
  let accessToken = integration.access_token;

  if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    accessToken = await refreshMicrosoftAccessToken(integration.refresh_token, supabase, userId);
  }

  return {
    accessToken,
    integration: integration as MicrosoftIntegration,
  };
}
