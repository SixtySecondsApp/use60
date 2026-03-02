/**
 * MS Graph Webhook Edge Function
 *
 * Handles Microsoft Graph Change Notifications (push notifications)
 * for mail and calendar subscriptions.
 *
 * PUBLIC endpoint (verify_jwt = false) because Microsoft sends
 * notifications directly. Setup actions require auth.
 *
 * Actions (POST, require auth):
 *   ?action=setup-mail      - Subscribe to mail notifications
 *   ?action=setup-calendar   - Subscribe to calendar notifications
 *   ?action=renew            - Renew an expiring subscription
 *
 * Default POST (no action):
 *   Handles incoming Microsoft Graph notifications.
 *   Special case: ?validationToken= for subscription validation.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { handleCorsPreflightRequest, jsonResponse, errorResponse } from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getMicrosoftIntegration } from '../_shared/microsoftOAuth.ts';

const SUBSCRIPTION_EXPIRY_DAYS = 3;

function getExpirationDateTime(): string {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + SUBSCRIPTION_EXPIRY_DAYS);
  return expiry.toISOString();
}

function generateClientState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const url = new URL(req.url);

  // Microsoft validation: respond with the validation token as text/plain
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    console.log('[ms-graph-webhook] Responding to validation request');
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[ms-graph-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return errorResponse('Server configuration error', req, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = url.searchParams.get('action');

  try {
    // Setup actions require authentication
    if (action === 'setup-mail' || action === 'setup-calendar' || action === 'renew') {
      return await handleSetupAction(req, supabase, supabaseUrl, supabaseServiceKey, action);
    }

    // Default: handle incoming notification from Microsoft
    return await handleNotification(req, supabase, supabaseUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ms-graph-webhook] Error:', message);
    return errorResponse(message, req, 500);
  }
});

async function handleSetupAction(
  req: Request,
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  action: string
): Promise<Response> {
  // Authenticate: require user JWT or service role
  let userId: string;
  let body: Record<string, any> = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // empty body is ok for some actions
  }

  const auth = await authenticateRequest(req, supabase, supabaseServiceKey, body.userId);
  userId = auth.userId;

  const msResult = await getMicrosoftIntegration(supabase, userId);
  if (!msResult) {
    return errorResponse('No active Microsoft integration found', req, 404);
  }

  const { accessToken, integration } = msResult;
  const notificationUrl = `${supabaseUrl}/functions/v1/ms-graph-webhook`;

  if (action === 'setup-mail') {
    return await setupSubscription(req, supabase, userId, accessToken, integration, notificationUrl, 'mail');
  }

  if (action === 'setup-calendar') {
    return await setupSubscription(req, supabase, userId, accessToken, integration, notificationUrl, 'calendar');
  }

  if (action === 'renew') {
    return await renewSubscription(req, supabase, userId, accessToken, body);
  }

  return errorResponse('Unknown action', req, 400);
}

async function setupSubscription(
  req: Request,
  supabase: any,
  userId: string,
  accessToken: string,
  integration: any,
  notificationUrl: string,
  type: 'mail' | 'calendar'
): Promise<Response> {
  const resource = type === 'mail' ? 'me/messages' : 'me/events';
  const changeType = type === 'mail' ? 'created,updated' : 'created,updated,deleted';
  const clientState = generateClientState();
  const expirationDateTime = getExpirationDateTime();

  console.log(`[ms-graph-webhook] Creating ${type} subscription for user ${userId}`);

  const graphResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType,
      notificationUrl,
      resource,
      expirationDateTime,
      clientState,
    }),
  });

  if (!graphResponse.ok) {
    const errorData = await graphResponse.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `HTTP ${graphResponse.status}`;
    console.error(`[ms-graph-webhook] Failed to create ${type} subscription:`, errorMsg);
    return errorResponse(`Failed to create ${type} subscription: ${errorMsg}`, req, 502);
  }

  const subscription = await graphResponse.json();
  console.log(`[ms-graph-webhook] Created ${type} subscription: ${subscription.id}`);

  // Store subscription info in microsoft_integrations
  const updateFields: Record<string, string> =
    type === 'mail'
      ? {
          mail_subscription_id: subscription.id,
          mail_subscription_expiry: subscription.expirationDateTime,
        }
      : {
          calendar_subscription_id: subscription.id,
          calendar_subscription_expiry: subscription.expirationDateTime,
        };

  const { error: updateError } = await supabase
    .from('microsoft_integrations')
    .update({ ...updateFields, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (updateError) {
    console.error(`[ms-graph-webhook] Failed to store ${type} subscription:`, updateError.message);
    return errorResponse('Subscription created but failed to save to database', req, 500);
  }

  return jsonResponse(
    {
      success: true,
      subscriptionId: subscription.id,
      expirationDateTime: subscription.expirationDateTime,
      type,
    },
    req
  );
}

async function renewSubscription(
  req: Request,
  supabase: any,
  userId: string,
  accessToken: string,
  body: Record<string, any>
): Promise<Response> {
  const subscriptionId = body.subscriptionId;
  if (!subscriptionId) {
    return errorResponse('subscriptionId required in body', req, 400);
  }

  const expirationDateTime = getExpirationDateTime();

  console.log(`[ms-graph-webhook] Renewing subscription ${subscriptionId} for user ${userId}`);

  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expirationDateTime }),
    }
  );

  if (!graphResponse.ok) {
    const errorData = await graphResponse.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `HTTP ${graphResponse.status}`;
    console.error('[ms-graph-webhook] Failed to renew subscription:', errorMsg);
    return errorResponse(`Failed to renew subscription: ${errorMsg}`, req, 502);
  }

  const renewed = await graphResponse.json();

  // Update expiry in the database — figure out which column based on the subscription ID
  const { data: integration } = await supabase
    .from('microsoft_integrations')
    .select('mail_subscription_id, calendar_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (integration) {
    const updateFields: Record<string, string> = { updated_at: new Date().toISOString() };
    if (integration.mail_subscription_id === subscriptionId) {
      updateFields.mail_subscription_expiry = renewed.expirationDateTime;
    } else if (integration.calendar_subscription_id === subscriptionId) {
      updateFields.calendar_subscription_expiry = renewed.expirationDateTime;
    }

    await supabase
      .from('microsoft_integrations')
      .update(updateFields)
      .eq('user_id', userId);
  }

  return jsonResponse(
    {
      success: true,
      subscriptionId: renewed.id,
      expirationDateTime: renewed.expirationDateTime,
    },
    req
  );
}

async function handleNotification(
  req: Request,
  supabase: any,
  supabaseUrl: string
): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    console.error('[ms-graph-webhook] Failed to parse notification body');
    return new Response('Accepted', { status: 202 });
  }

  const notifications = body.value;
  if (!Array.isArray(notifications) || notifications.length === 0) {
    console.log('[ms-graph-webhook] No notifications in body');
    return new Response('Accepted', { status: 202 });
  }

  console.log(`[ms-graph-webhook] Processing ${notifications.length} notification(s)`);

  // Process each notification — look up user by subscriptionId
  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId;
    const resource = notification.resource || '';

    if (!subscriptionId) {
      console.warn('[ms-graph-webhook] Notification missing subscriptionId, skipping');
      continue;
    }

    // Find the user by matching subscription ID against mail or calendar columns
    const { data: mailMatch } = await supabase
      .from('microsoft_integrations')
      .select('user_id')
      .eq('mail_subscription_id', subscriptionId)
      .eq('is_active', true)
      .maybeSingle();

    const { data: calendarMatch } = !mailMatch
      ? await supabase
          .from('microsoft_integrations')
          .select('user_id')
          .eq('calendar_subscription_id', subscriptionId)
          .eq('is_active', true)
          .maybeSingle()
      : { data: null };

    const match = mailMatch || calendarMatch;
    if (!match) {
      console.warn(`[ms-graph-webhook] No integration found for subscription ${subscriptionId}`);
      continue;
    }

    const userId = match.user_id;
    const isMailNotification = !!mailMatch;

    console.log(
      `[ms-graph-webhook] Notification for user ${userId}, type: ${isMailNotification ? 'mail' : 'calendar'}, resource: ${resource}`
    );

    // Trigger the appropriate sync — fire and forget
    try {
      if (isMailNotification) {
        await supabase.functions.invoke('ms-graph-email', {
          body: { userId, action: 'list' },
        });
      } else {
        await supabase.functions.invoke('ms-graph-calendar-sync', {
          body: { userId },
        });
      }
    } catch (syncError: unknown) {
      const msg = syncError instanceof Error ? syncError.message : String(syncError);
      console.error(`[ms-graph-webhook] Failed to trigger sync for user ${userId}:`, msg);
      // Don't fail the webhook — Microsoft will retry
    }
  }

  // Return 202 quickly as Microsoft expects
  return new Response('Accepted', { status: 202 });
}
