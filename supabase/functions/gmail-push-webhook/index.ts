/**
 * Gmail Push Webhook Handler
 *
 * Handles two types of requests:
 * 1. Pub/Sub push notifications for incoming Gmail messages (fires email_received events)
 * 2. Watch management endpoints (setup/renew Gmail API watches)
 *
 * Endpoints:
 * - POST / (no action param) - Handle Pub/Sub push notification
 * - POST /?action=setup - Setup Gmail watch for a user
 * - POST /?action=renew - Renew expiring watches
 *
 * Google Pub/Sub POST payload:
 * {
 *   "message": {
 *     "data": "<base64-encoded JSON>",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/{project}/subscriptions/{subscription}"
 * }
 *
 * Decoded message.data contains:
 * {
 *   "emailAddress": "user@example.com",
 *   "historyId": "12345"
 * }
 *
 * Watch setup/renew payload:
 * {
 *   "user_id": "uuid" (required for setup, optional for renew)
 * }
 *
 * SECURITY: Public webhook (verify_jwt = false) - always returns 200 to prevent retries
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, errorResponse, jsonResponse } from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC') || '';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime?: string;
  };
  subscription: string;
}

interface GmailPushData {
  emailAddress: string;
  historyId: string;
}

interface WatchSetupRequest {
  user_id: string;
}

interface GmailWatchResponse {
  historyId: string;
  expiration: string;
}

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  if (req.method !== 'POST') {
    // Always return 200 to prevent Pub/Sub retries
    return jsonResponse({ success: true, message: 'Method not allowed' }, req, 200);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check for action parameter (watch management)
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'setup') {
      return await handleWatchSetup(req, supabase);
    }

    if (action === 'renew') {
      return await handleWatchRenewal(req, supabase);
    }

    // Default: Handle Pub/Sub push notification
    const body = await req.json() as PubSubMessage;

    if (!body.message?.data) {
      console.warn('[gmail-push-webhook] No message data in request');
      return jsonResponse({ success: true, message: 'No message data' }, req, 200);
    }

    // Decode base64 data
    let pushData: GmailPushData;
    try {
      const decodedData = atob(body.message.data);
      pushData = JSON.parse(decodedData);
    } catch (decodeErr) {
      console.error('[gmail-push-webhook] Failed to decode message data:', decodeErr);
      return jsonResponse({ success: true, message: 'Invalid message data' }, req, 200);
    }

    const { emailAddress, historyId } = pushData;

    if (!emailAddress || !historyId) {
      console.warn('[gmail-push-webhook] Missing emailAddress or historyId:', pushData);
      return jsonResponse({ success: true, message: 'Missing required fields' }, req, 200);
    }

    console.log(`[gmail-push-webhook] Received push for ${emailAddress}, historyId: ${historyId}`);

    // Look up user by email in google_integrations
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('user_id, email')
      .eq('email', emailAddress)
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError) {
      console.error('[gmail-push-webhook] Error looking up integration:', integrationError);
      return jsonResponse({ success: true, message: 'Database error' }, req, 200);
    }

    if (!integration) {
      console.log(`[gmail-push-webhook] No active integration found for ${emailAddress}`);
      return jsonResponse({ success: true, message: 'No integration found' }, req, 200);
    }

    const userId = integration.user_id;

    // Get org_id from organization_memberships
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.error('[gmail-push-webhook] Error looking up org membership:', membershipError);
      return jsonResponse({ success: true, message: 'Database error' }, req, 200);
    }

    if (!membership) {
      console.warn(`[gmail-push-webhook] No org membership found for user ${userId}`);
      return jsonResponse({ success: true, message: 'No org membership' }, req, 200);
    }

    const orgId = membership.org_id;

    console.log(`[gmail-push-webhook] Firing email_received event for user ${userId}, org ${orgId}`);

    // Fire email_received event to orchestrator (fire-and-forget)
    fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'email_received',
        source: 'webhook:gmail-push',
        org_id: orgId,
        user_id: userId,
        payload: {
          email_address: emailAddress,
          history_id: historyId,
        },
        idempotency_key: `email_received:${historyId}:${emailAddress}`,
      }),
    }).catch(err => console.warn('[gmail-push-webhook] Orchestrator fire-and-forget failed:', err));

    // Always return 200 to acknowledge receipt
    return jsonResponse({
      success: true,
      message: 'Event fired',
      email: emailAddress,
      historyId,
    }, req, 200);

  } catch (err) {
    console.error('[gmail-push-webhook] Unexpected error:', err);
    // Always return 200 to prevent Pub/Sub retries on errors
    return jsonResponse({
      success: true,
      message: 'Error processed',
      error: err instanceof Error ? err.message : 'Unknown error'
    }, req, 200);
  }
});

// ============================================================================
// WATCH MANAGEMENT HANDLERS
// ============================================================================

/**
 * Setup Gmail watch for a user
 */
async function handleWatchSetup(req: Request, supabase: any): Promise<Response> {
  try {
    const body = await req.json() as WatchSetupRequest;

    if (!body.user_id) {
      return jsonResponse({ success: false, error: 'user_id is required' }, req, 400);
    }

    const userId = body.user_id;

    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, email, scopes')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error('[gmail-push-webhook] Integration lookup error:', integrationError);
      return jsonResponse({
        success: false,
        error: 'Google integration not found for user'
      }, req, 404);
    }

    // Check if user has required Gmail scopes
    const scopeCheck = hasRequiredGmailScopes(integration.scopes || '');
    if (!scopeCheck.hasReadonly) {
      return jsonResponse({
        success: false,
        error: 'Missing required Gmail scopes',
        missing_scopes: scopeCheck.missing
      }, req, 403);
    }

    // Refresh token if needed
    const accessToken = await ensureValidAccessToken(
      integration.access_token,
      integration.refresh_token,
      integration.expires_at,
      supabase,
      userId
    );

    // Setup Gmail watch
    const watchResult = await setupGmailWatch(accessToken, integration.email);

    if (!watchResult.success) {
      // Update error in database
      await supabase
        .from('google_integrations')
        .update({ gmail_watch_error: watchResult.error })
        .eq('user_id', userId);

      return jsonResponse({
        success: false,
        error: watchResult.error
      }, req, 500);
    }

    // Store watch details in database
    const expirationMs = parseInt(watchResult.data!.expiration);
    const expirationDate = new Date(expirationMs);

    const { error: updateError } = await supabase
      .from('google_integrations')
      .update({
        gmail_watch_expiration: expirationDate.toISOString(),
        gmail_watch_history_id: watchResult.data!.historyId,
        gmail_watch_error: null,
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('[gmail-push-webhook] Failed to update watch state:', updateError);
      return jsonResponse({
        success: false,
        error: 'Failed to store watch state'
      }, req, 500);
    }

    console.log(`[gmail-push-webhook] Watch setup successful for ${integration.email}, expires at ${expirationDate.toISOString()}`);

    return jsonResponse({
      success: true,
      email: integration.email,
      expiration: expirationDate.toISOString(),
      history_id: watchResult.data!.historyId,
    }, req, 200);

  } catch (err) {
    console.error('[gmail-push-webhook] Watch setup error:', err);
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }, req, 500);
  }
}

/**
 * Renew expiring Gmail watches (called by cron)
 */
async function handleWatchRenewal(req: Request, supabase: any): Promise<Response> {
  try {
    // Get watches needing renewal
    const { data: watchesToRenew, error: rpcError } = await supabase
      .rpc('get_gmail_watches_needing_renewal');

    if (rpcError) {
      console.error('[gmail-push-webhook] RPC error:', rpcError);
      return jsonResponse({
        success: false,
        error: 'Failed to fetch watches needing renewal'
      }, req, 500);
    }

    if (!watchesToRenew || watchesToRenew.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No watches need renewal',
        renewed_count: 0
      }, req, 200);
    }

    console.log(`[gmail-push-webhook] Renewing ${watchesToRenew.length} watches`);

    let successCount = 0;
    let failureCount = 0;

    // Renew each watch
    for (const watch of watchesToRenew) {
      try {
        // Get user's integration
        const { data: integration, error: integrationError } = await supabase
          .from('google_integrations')
          .select('access_token, refresh_token, expires_at, email')
          .eq('user_id', watch.user_id)
          .eq('is_active', true)
          .maybeSingle();

        if (integrationError || !integration) {
          console.error(`[gmail-push-webhook] Integration not found for user ${watch.user_id}`);
          failureCount++;
          continue;
        }

        // Refresh token if needed
        const accessToken = await ensureValidAccessToken(
          integration.access_token,
          integration.refresh_token,
          integration.expires_at,
          supabase,
          watch.user_id
        );

        // Renew watch
        const watchResult = await setupGmailWatch(accessToken, integration.email);

        if (!watchResult.success) {
          // Store error
          await supabase
            .from('google_integrations')
            .update({ gmail_watch_error: watchResult.error })
            .eq('user_id', watch.user_id);

          console.error(`[gmail-push-webhook] Failed to renew watch for ${integration.email}: ${watchResult.error}`);
          failureCount++;
          continue;
        }

        // Update watch details
        const expirationMs = parseInt(watchResult.data!.expiration);
        const expirationDate = new Date(expirationMs);

        await supabase
          .from('google_integrations')
          .update({
            gmail_watch_expiration: expirationDate.toISOString(),
            gmail_watch_history_id: watchResult.data!.historyId,
            gmail_watch_error: null,
          })
          .eq('user_id', watch.user_id);

        console.log(`[gmail-push-webhook] Renewed watch for ${integration.email}`);
        successCount++;

      } catch (err) {
        console.error(`[gmail-push-webhook] Error renewing watch for user ${watch.user_id}:`, err);
        failureCount++;
      }
    }

    return jsonResponse({
      success: true,
      message: 'Watch renewal completed',
      total: watchesToRenew.length,
      renewed_count: successCount,
      failed_count: failureCount
    }, req, 200);

  } catch (err) {
    console.error('[gmail-push-webhook] Watch renewal error:', err);
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }, req, 500);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if scopes include required Gmail permissions
 */
function hasRequiredGmailScopes(scopes: string): {
  hasReadonly: boolean;
  hasSend: boolean;
  missing: string[];
} {
  const scopeArray = scopes.split(' ').filter(Boolean);
  const hasReadonly = scopeArray.some(s =>
    s.includes('gmail.readonly') || s.includes('mail.google.com')
  );
  const hasSend = scopeArray.some(s =>
    s.includes('gmail.send') || s.includes('mail.google.com')
  );

  const missing: string[] = [];
  if (!hasReadonly) missing.push('gmail.readonly');
  if (!hasSend) missing.push('gmail.send');

  return { hasReadonly, hasSend, missing };
}

/**
 * Refresh access token if expired
 */
async function ensureValidAccessToken(
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  supabase: any,
  userId: string
): Promise<string> {
  const expiresAtDate = new Date(expiresAt);
  const now = new Date();

  // Token still valid
  if (expiresAtDate > now) {
    return accessToken;
  }

  // Need to refresh
  console.log(`[gmail-push-webhook] Refreshing expired token for user ${userId}`);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh token: ${errorData.error_description || 'Unknown error'}`);
  }

  const data = await response.json();

  // Update stored access token
  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (data.expires_in || 3600));

  await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: newExpiresAt.toISOString(),
    })
    .eq('user_id', userId);

  return data.access_token;
}

/**
 * Setup Gmail watch using Gmail API
 */
async function setupGmailWatch(
  accessToken: string,
  email: string
): Promise<{ success: boolean; data?: GmailWatchResponse; error?: string }> {
  if (!GMAIL_PUBSUB_TOPIC) {
    return {
      success: false,
      error: 'GMAIL_PUBSUB_TOPIC not configured'
    };
  }

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName: GMAIL_PUBSUB_TOPIC,
        labelIds: ['INBOX'],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      console.error(`[gmail-push-webhook] Gmail watch API error for ${email}:`, errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }

    const data = await response.json() as GmailWatchResponse;

    console.log(`[gmail-push-webhook] Gmail watch setup successful for ${email}`);
    return {
      success: true,
      data
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[gmail-push-webhook] Exception setting up watch for ${email}:`, errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}
