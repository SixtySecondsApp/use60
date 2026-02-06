/**
 * Google Token Refresh Edge Function
 *
 * Proactively refreshes Google OAuth tokens before they expire.
 * Detects revoked tokens and marks integrations as needing reconnection.
 *
 * This function should be called by a cron job every few hours.
 *
 * Similar to fathom-token-refresh and hubspot-token-refresh.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { legacyCorsHeaders as corsHeaders } from '../_shared/corsHelper.ts';

// =============================================================================
// Types
// =============================================================================

interface RefreshResult {
  user_id: string;
  email: string;
  status: 'refreshed' | 'skipped' | 'failed' | 'needs_reconnect';
  message: string;
  expires_at?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  refresh_token?: string; // Only returned if access_type=offline and prompt=consent
}

interface GoogleTokenError {
  error: string;
  error_description?: string;
}

// =============================================================================
// Constants
// =============================================================================

// Refresh tokens that expire within this window (60 minutes)
// Increased from 15 minutes to prevent tokens expiring between cron runs
const REFRESH_WINDOW_MS = 60 * 60 * 1000;

// Test connection endpoint
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// App URL for reconnection links
const APP_URL = Deno.env.get('APP_URL') || 'https://app.use60.com';

// =============================================================================
// Notification Helper
// =============================================================================

/**
 * Send reconnection notification to user via Slack DM and create integration alert
 */
async function sendReconnectionNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  email: string,
  reason: string
): Promise<{ slackSent: boolean; alertCreated: boolean; error?: string }> {
  const result = { slackSent: false, alertCreated: false, error: undefined as string | undefined };

  try {
    // 1. Create integration alert with user_id for in-app banner
    const { error: alertError } = await supabase
      .from('integration_alerts')
      .insert({
        integration_type: 'google_workspace',
        alert_type: 'token_revoked',
        severity: 'high',
        title: 'Google Calendar Reconnection Required',
        message: `Your Google Calendar integration needs to be reconnected. ${reason}`,
        user_id: userId,
        metadata: { email, reason, detected_at: new Date().toISOString() },
      });

    if (alertError) {
      console.error(`[google-token-refresh] Failed to create alert for user ${userId}:`, alertError);
    } else {
      result.alertCreated = true;
      console.log(`[google-token-refresh] Created integration alert for user ${userId}`);
    }

    // 2. Look up user's Slack integration for DM delivery
    const { data: slackIntegration, error: slackError } = await supabase
      .from('slack_integrations')
      .select('access_token, authed_user')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (slackError) {
      console.error(`[google-token-refresh] Failed to fetch Slack integration for user ${userId}:`, slackError);
      result.error = 'Failed to fetch Slack integration';
      return result;
    }

    if (!slackIntegration?.access_token || !slackIntegration?.authed_user?.id) {
      console.log(`[google-token-refresh] No active Slack integration for user ${userId}, skipping DM`);
      return result;
    }

    const botToken = slackIntegration.access_token;
    const slackUserId = slackIntegration.authed_user.id;

    // 3. Send Slack DM with reconnection instructions
    const reconnectUrl = `${APP_URL}/settings/integrations/google-workspace`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: ':warning: *Google Calendar Reconnection Required*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your Google Calendar connection (${email}) has expired or been revoked. Calendar sync and meeting bot auto-join are paused until you reconnect.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Reason:* ${reason}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reconnect Google Calendar',
              emoji: true,
            },
            url: reconnectUrl,
            style: 'primary',
          },
        ],
      },
    ];

    // Open DM channel and send message
    const openDmResponse = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: slackUserId }),
    });

    const openDmData = await openDmResponse.json();

    if (!openDmData.ok || !openDmData.channel?.id) {
      console.error(`[google-token-refresh] Failed to open DM for user ${userId}:`, openDmData.error);
      result.error = `Failed to open DM: ${openDmData.error}`;
      return result;
    }

    const channelId = openDmData.channel.id;

    const postMessageResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: `Your Google Calendar connection (${email}) needs to be reconnected. Visit ${reconnectUrl} to reconnect.`,
        blocks,
      }),
    });

    const postMessageData = await postMessageResponse.json();

    if (!postMessageData.ok) {
      console.error(`[google-token-refresh] Failed to send DM for user ${userId}:`, postMessageData.error);
      result.error = `Failed to send DM: ${postMessageData.error}`;
      return result;
    }

    result.slackSent = true;
    console.log(`[google-token-refresh] Sent Slack DM to user ${userId} about reconnection`);

    // 4. Update the alert with notification timestamp
    if (result.alertCreated) {
      await supabase
        .from('integration_alerts')
        .update({ notified_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('integration_type', 'google_workspace')
        .eq('alert_type', 'token_revoked')
        .is('resolved_at', null);
    }

    return result;
  } catch (error) {
    console.error(`[google-token-refresh] Error sending notification for user ${userId}:`, error);
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: RefreshResult[] = [];

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';

    if (!googleClientId || !googleClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Google OAuth credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Get all active Google integrations
    const { data: integrations, error: fetchError } = await supabase
      .from('google_integrations')
      .select('id, user_id, email, access_token, refresh_token, expires_at, token_status')
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Failed to fetch integrations: ${fetchError.message}`);
    }

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No active integrations to process',
          summary: { total: 0, refreshed: 0, skipped: 0, failed: 0, needs_reconnect: 0 },
          results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[google-token-refresh] Processing ${integrations.length} integrations`);

    for (const integration of integrations) {
      const { id, user_id, email, refresh_token, expires_at, token_status } = integration;

      // Skip if already marked as needing reconnect
      if (token_status === 'revoked' || token_status === 'needs_reconnect') {
        results.push({
          user_id,
          email: email || 'unknown',
          status: 'skipped',
          message: 'Already marked as needing reconnection',
        });
        continue;
      }

      // Skip if no refresh token
      if (!refresh_token) {
        results.push({
          user_id,
          email: email || 'unknown',
          status: 'needs_reconnect',
          message: 'No refresh token available',
        });

        // Mark as needing reconnect
        await supabase
          .from('google_integrations')
          .update({
            token_status: 'needs_reconnect',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        // Send notification to user about reconnection needed
        await sendReconnectionNotification(supabase, user_id, email || 'unknown', 'No refresh token available');

        continue;
      }

      // Check if token needs refresh
      const expiresAtDate = new Date(expires_at);
      const now = new Date();
      const timeUntilExpiry = expiresAtDate.getTime() - now.getTime();

      // Detect already-expired tokens (negative time until expiry)
      const isExpired = timeUntilExpiry <= 0;
      const isExpiringSoon = timeUntilExpiry > 0 && timeUntilExpiry <= REFRESH_WINDOW_MS;

      if (isExpired) {
        // Token already expired - attempt refresh immediately
        console.log(`[google-token-refresh] Token EXPIRED for user ${user_id} (expired ${Math.abs(Math.round(timeUntilExpiry / 60000))} minutes ago), attempting refresh`);
      } else if (!isExpiringSoon) {
        // Token still valid with time to spare
        results.push({
          user_id,
          email: email || 'unknown',
          status: 'skipped',
          message: `Token valid for ${Math.round(timeUntilExpiry / 60000)} more minutes`,
          expires_at,
        });
        continue;
      } else {
        // Token expiring soon - refresh proactively
        console.log(`[google-token-refresh] Token expiring soon for user ${user_id} (${Math.round(timeUntilExpiry / 60000)} minutes), refreshing proactively`);
      }

      // Attempt token refresh
      try {
        console.log(`[google-token-refresh] Refreshing token for user ${user_id}`);

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          const errorData: GoogleTokenError = await tokenResponse.json();
          const errorMessage = errorData.error_description || errorData.error || 'Unknown error';

          console.error(`[google-token-refresh] Token refresh failed for user ${user_id}: ${errorMessage}`);

          // Check for permanent failures that require reconnection
          const isPermFailure =
            errorData.error === 'invalid_grant' ||
            errorMessage.toLowerCase().includes('token has been expired or revoked') ||
            errorMessage.toLowerCase().includes('token has been revoked') ||
            tokenResponse.status === 400;

          if (isPermFailure) {
            // Mark integration as needing reconnection
            await supabase
              .from('google_integrations')
              .update({
                token_status: 'revoked',
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id);

            results.push({
              user_id,
              email: email || 'unknown',
              status: 'needs_reconnect',
              message: `Token revoked or expired: ${errorMessage}`,
            });

            // Send notification to user about reconnection needed
            await sendReconnectionNotification(supabase, user_id, email || 'unknown', errorMessage);
          } else {
            results.push({
              user_id,
              email: email || 'unknown',
              status: 'failed',
              message: `Token refresh failed: ${errorMessage}`,
            });
          }

          continue;
        }

        // Parse successful response
        const tokenData: GoogleTokenResponse = await tokenResponse.json();

        // Calculate new expiry
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (tokenData.expires_in || 3600));

        // Update the integration
        await supabase
          .from('google_integrations')
          .update({
            access_token: tokenData.access_token,
            expires_at: newExpiresAt.toISOString(),
            token_status: 'valid',
            last_token_refresh: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        results.push({
          user_id,
          email: email || 'unknown',
          status: 'refreshed',
          message: 'Token refreshed successfully',
          expires_at: newExpiresAt.toISOString(),
        });

        console.log(`[google-token-refresh] Successfully refreshed token for user ${user_id}`);
      } catch (error) {
        console.error(`[google-token-refresh] Error for user ${user_id}:`, error);
        results.push({
          user_id,
          email: email || 'unknown',
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      refreshed: results.filter((r) => r.status === 'refreshed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      needs_reconnect: results.filter((r) => r.status === 'needs_reconnect').length,
    };

    const duration = Date.now() - startTime;
    console.log(
      `[google-token-refresh] Complete: ${summary.refreshed} refreshed, ${summary.skipped} skipped, ${summary.failed} failed, ${summary.needs_reconnect} need reconnect (${duration}ms)`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[google-token-refresh] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
