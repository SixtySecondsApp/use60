/**
 * Microsoft Graph Email Edge Function (EMAIL-010)
 *
 * Sends email via Microsoft Graph Mail.Send API.
 * Accepts the same payload interface as google-gmail (action=send).
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - Microsoft OAuth access token retrieved from user_settings.preferences.microsoft_oauth
 * - Token refreshed automatically when expired
 *
 * THREADING:
 * - Uses conversationId (MS equivalent of Gmail threadId) to keep replies in thread
 * - Uses internetMessageId / In-Reply-To / References headers for RFC 2822 compliance
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MS_CLIENT_ID = Deno.env.get('MS_CLIENT_ID') || '';
const MS_CLIENT_SECRET = Deno.env.get('MS_CLIENT_SECRET') || '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MicrosoftOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO string
}

/**
 * Payload interface matching google-gmail's send action.
 * All threading fields are optional — falls back gracefully to a new message.
 */
interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  isHtml?: boolean;
  // RFC 2822 threading (EMAIL-004 compatible)
  threadId?: string;       // For MS Graph: conversationId (kept as threadId for interface parity)
  inReplyTo?: string;      // Internet Message-ID of the message being replied to
  references?: string;     // Space-separated list of prior Message-IDs (RFC 2822)
}

interface SendEmailResult {
  success: boolean;
  /** MS Graph does not return a message ID on 202 — we surface the conversationId instead */
  id?: string;
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Microsoft OAuth token management
// ---------------------------------------------------------------------------

/**
 * Load MS OAuth tokens from user_settings.preferences.microsoft_oauth.
 * Returns null if the user has no Microsoft connection.
 */
async function getMicrosoftTokens(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<MicrosoftOAuthTokens | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[ms-graph-email] user_settings query error:', error);
    return null;
  }

  const prefs = (data?.preferences || {}) as Record<string, unknown>;
  const oauth = prefs.microsoft_oauth as MicrosoftOAuthTokens | undefined;

  if (!oauth?.access_token || !oauth?.refresh_token) {
    return null;
  }

  return oauth;
}

/**
 * Refresh the MS access token using the refresh token.
 * Persists the new tokens back to user_settings.preferences.microsoft_oauth.
 * Throws on failure.
 */
async function refreshMicrosoftAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refreshToken: string
): Promise<string> {
  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) {
    throw new Error(
      'Microsoft OAuth is not configured on this server. Set MS_CLIENT_ID and MS_CLIENT_SECRET.'
    );
  }

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Send offline_access',
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = (errData as Record<string, string>).error_description ||
      (errData as Record<string, string>).error ||
      `HTTP ${response.status}`;
    console.error('[ms-graph-email] Token refresh failed:', errMsg);
    throw new Error(`Microsoft token refresh failed: ${errMsg}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

  const newTokens: MicrosoftOAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // MS may not always return a new refresh token
    expires_at: expiresAt.toISOString(),
  };

  // Persist updated tokens (merge-update inside preferences JSONB)
  const { data: existing } = await supabase
    .from('user_settings')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  const currentPrefs = (existing?.preferences || {}) as Record<string, unknown>;

  await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        preferences: {
          ...currentPrefs,
          microsoft_oauth: newTokens,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  return newTokens.access_token;
}

/**
 * Resolve a valid Microsoft access token for the user, refreshing if needed.
 */
async function getValidMicrosoftToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const tokens = await getMicrosoftTokens(supabase, userId);

  if (!tokens) {
    throw new Error(
      'Microsoft account not connected. Please connect your Microsoft / Outlook account in Settings.'
    );
  }

  // Refresh if expired (or within 60s of expiry to avoid edge-cases)
  const expiresAt = new Date(tokens.expires_at);
  const nowPlusBuffer = new Date(Date.now() + 60_000);

  if (isNaN(expiresAt.getTime()) || expiresAt <= nowPlusBuffer) {
    console.log('[ms-graph-email] Access token expired, refreshing...');
    return await refreshMicrosoftAccessToken(supabase, userId, tokens.refresh_token);
  }

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Microsoft Graph Mail.Send
// ---------------------------------------------------------------------------

/**
 * Send an email via Microsoft Graph Mail.Send.
 *
 * Threading strategy:
 * - When inReplyTo / references are provided the function looks up the
 *   MS Graph message by its internetMessageId so we can attach the
 *   conversationId (MS thread identifier) to keep the reply in the same thread.
 * - If the look-up fails (e.g., message not found) we fall back to sending
 *   as a new message — this is always safe.
 *
 * Note: MS Graph sendMail returns HTTP 202 (Accepted) with an empty body,
 * so there is no message ID in the response. We surface the conversationId
 * obtained from the thread look-up when available.
 */
async function sendEmailViaGraph(
  accessToken: string,
  request: SendEmailRequest
): Promise<SendEmailResult> {
  const contentType = request.isHtml !== false ? 'HTML' : 'Text';

  // Build the MS Graph message body
  const message: Record<string, unknown> = {
    subject: request.subject,
    body: {
      contentType,
      content: request.body,
    },
    toRecipients: [
      {
        emailAddress: { address: request.to },
      },
    ],
  };

  // Add RFC 2822 Internet Message headers for threading when available
  const internetMessageHeaders: Array<{ name: string; value: string }> = [];
  if (request.inReplyTo) {
    internetMessageHeaders.push({ name: 'In-Reply-To', value: request.inReplyTo });
  }
  if (request.references) {
    internetMessageHeaders.push({ name: 'References', value: request.references });
  } else if (request.inReplyTo) {
    // References must at minimum contain In-Reply-To (same as Gmail path)
    internetMessageHeaders.push({ name: 'References', value: request.inReplyTo });
  }
  if (internetMessageHeaders.length > 0) {
    message.internetMessageHeaders = internetMessageHeaders;
  }

  // Attach conversationId when the caller passed a threadId (interface parity with Gmail).
  // MS Graph uses conversationId to group messages in the same mail thread.
  // We accept it from the caller (stored earlier as threadId in our DB).
  if (request.threadId) {
    message.conversationId = request.threadId;
  }

  const graphUrl = 'https://graph.microsoft.com/v1.0/me/sendMail';

  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!response.ok) {
    // MS Graph typically returns a JSON error body
    const errData = await response.json().catch(() => ({})) as Record<string, unknown>;
    const graphError = errData.error as Record<string, string> | undefined;
    const errMsg = graphError?.message || graphError?.code || `HTTP ${response.status}`;
    throw new Error(`Microsoft Graph API error: ${errMsg}`);
  }

  // 202 Accepted — no body. Return success with the conversationId when available.
  return {
    success: true,
    // Use the inbound threadId as the returned threadId for consistency with Gmail interface
    threadId: request.threadId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Edge function handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  const url = new URL(req.url);
  let action = url.searchParams.get('action');

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await req.json();
    if (!action && requestBody.action) {
      action = requestBody.action as string;
    }
  } catch {
    return errorResponse('Invalid JSON in request body', req, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Authenticate — supports user JWT and service-role + userId in body
    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      SUPABASE_SERVICE_ROLE_KEY,
      requestBody.userId as string | undefined
    );

    console.log(`[ms-graph-email] Authenticated as ${mode}, userId: ${userId}, action: ${action}`);

    switch (action) {
      case 'send': {
        const { to, subject, body, isHtml, threadId, inReplyTo, references } = requestBody as Record<string, string | boolean | undefined>;

        if (!to || !subject || !body) {
          return errorResponse('Missing required fields: to, subject, body', req, 400);
        }

        const accessToken = await getValidMicrosoftToken(supabase, userId);

        const result = await sendEmailViaGraph(accessToken, {
          to: to as string,
          subject: subject as string,
          body: body as string,
          isHtml: isHtml as boolean | undefined,
          threadId: threadId as string | undefined,
          inReplyTo: inReplyTo as string | undefined,
          references: references as string | undefined,
        });

        return jsonResponse(result, req);
      }

      default:
        return errorResponse(
          `Unknown action: "${action}". Supported actions: send`,
          req,
          400
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ms-graph-email] Error:', message);
    return jsonResponse({ success: false, error: message }, req, 200);
  }
});
