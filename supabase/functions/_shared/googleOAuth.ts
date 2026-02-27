// supabase/functions/_shared/googleOAuth.ts
// Shared Google OAuth token refresh and management utilities

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

export interface GoogleIntegration {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

/**
 * Error thrown when a Google refresh token is invalid/revoked
 * This indicates the user needs to reconnect their Google account
 */
export class GoogleTokenRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleTokenRevokedError';
  }
}

/**
 * Refresh a Google OAuth access token using the refresh token
 * Updates the token in the database and returns the new access token
 *
 * @throws {GoogleTokenRevokedError} If the refresh token is invalid/revoked
 * @throws {Error} For other refresh failures
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  supabase: any,
  userId: string
): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

  const response = await fetch('https://oauth2.googleapis.com/token', {
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
      console.error(`[googleOAuth] Token revoked for user ${userId}: ${errorMessage}`);

      // Mark integration as needing reconnection
      await supabase
        .from('google_integrations')
        .update({
          token_status: 'revoked',
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      throw new GoogleTokenRevokedError(
        `Google access has been revoked. Please reconnect your Google account. (${errorMessage})`
      );
    }

    throw new Error(`Failed to refresh token: ${errorMessage}`);
  }

  const data = await response.json();

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

  const { error: updateError } = await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
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
 * Get user's Google integration with valid access token
 * Automatically refreshes token if expired
 */
export async function getGoogleIntegration(
  supabase: any,
  userId: string
): Promise<{ accessToken: string; integration: GoogleIntegration }> {
  const { data: integration, error: integrationError } = await supabase
    .from('google_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (integrationError || !integration) {
    throw new Error('Google integration not found. Please connect your Google account first.');
  }

  // Check if token needs refresh
  const expiresAt = new Date(integration.expires_at);
  let accessToken = integration.access_token;

  if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    accessToken = await refreshGoogleAccessToken(integration.refresh_token, supabase, userId);
  }

  return {
    accessToken,
    integration: {
      access_token: accessToken,
      refresh_token: integration.refresh_token,
      expires_at: expiresAt.toISOString(),
    },
  };
}







































