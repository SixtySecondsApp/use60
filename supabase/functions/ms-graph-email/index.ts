/**
 * Microsoft Graph Email Edge Function (EMAIL-010)
 *
 * Full email operations via Microsoft Graph API.
 * Supports send, list, get, mark-as-read, star/flag, archive, trash,
 * draft, reply, forward, list-folders, list-categories, categorize.
 *
 * SECURITY:
 * - POST only
 * - User JWT authentication OR service-role with userId in body
 * - Microsoft OAuth access token from microsoft_integrations table (shared module)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
import { getMicrosoftIntegration } from '../_shared/microsoftOAuth.ts';
import {
  listMessages,
  getMessage,
  markAsRead,
  flagMessage,
  archiveMessage,
  trashMessage,
  createDraft,
  replyToMessage,
  forwardMessage,
  listFolders,
  listCategories,
  categorizeMessage,
} from './outlook-actions.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Microsoft Graph Mail.Send
// ---------------------------------------------------------------------------

/**
 * Send an email via Microsoft Graph Mail.Send.
 *
 * Threading strategy:
 * - When inReplyTo / references are provided the function adds
 *   Internet Message headers for RFC 2822 compliance.
 * - conversationId (MS thread identifier) is attached when threadId is provided.
 *
 * Note: MS Graph sendMail returns HTTP 202 (Accepted) with an empty body,
 * so there is no message ID in the response.
 */
async function sendEmailViaGraph(
  accessToken: string,
  request: SendEmailRequest
): Promise<SendEmailResult> {
  const contentType = request.isHtml !== false ? 'HTML' : 'Text';

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
    internetMessageHeaders.push({ name: 'References', value: request.inReplyTo });
  }
  if (internetMessageHeaders.length > 0) {
    message.internetMessageHeaders = internetMessageHeaders;
  }

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
    const errData = await response.json().catch(() => ({})) as Record<string, unknown>;
    const graphError = errData.error as Record<string, string> | undefined;
    const errMsg = graphError?.message || graphError?.code || `HTTP ${response.status}`;
    throw new Error(`Microsoft Graph API error: ${errMsg}`);
  }

  return {
    success: true,
    threadId: request.threadId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Helper: resolve access token via shared module
// ---------------------------------------------------------------------------

async function resolveAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const result = await getMicrosoftIntegration(supabase, userId);
  if (!result) {
    throw new Error(
      'Microsoft account not connected. Please connect your Microsoft / Outlook account in Settings.'
    );
  }
  return result.accessToken;
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

    const accessToken = await resolveAccessToken(supabase, userId);

    switch (action) {
      case 'send': {
        const { to, subject, body, isHtml, threadId, inReplyTo, references } =
          requestBody as Record<string, string | boolean | undefined>;

        if (!to || !subject || !body) {
          return errorResponse('Missing required fields: to, subject, body', req, 400);
        }

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

      case 'list': {
        const result = await listMessages(accessToken, {
          folder: requestBody.folder as string | undefined,
          filter: requestBody.filter as string | undefined,
          top: requestBody.top as number | undefined,
          skip: requestBody.skip as number | undefined,
          select: requestBody.select as string | undefined,
          orderby: requestBody.orderby as string | undefined,
          search: requestBody.search as string | undefined,
        });
        return jsonResponse(result, req);
      }

      case 'get':
      case 'get-message': {
        const id = requestBody.id as string;
        if (!id) return errorResponse('Missing required field: id', req, 400);
        const result = await getMessage(accessToken, {
          id,
          select: requestBody.select as string | undefined,
        });
        return jsonResponse(result, req);
      }

      case 'mark-as-read': {
        const id = requestBody.id as string;
        if (!id) return errorResponse('Missing required field: id', req, 400);
        const isRead = requestBody.isRead !== undefined ? requestBody.isRead as boolean : true;
        const result = await markAsRead(accessToken, { id, isRead });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'star':
      case 'flag': {
        const id = requestBody.id as string;
        if (!id) return errorResponse('Missing required field: id', req, 400);
        const flagged = requestBody.flagged !== undefined ? requestBody.flagged as boolean : true;
        const result = await flagMessage(accessToken, { id, flagged });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'archive': {
        const id = requestBody.id as string;
        if (!id) return errorResponse('Missing required field: id', req, 400);
        const result = await archiveMessage(accessToken, { id });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'trash':
      case 'delete': {
        const id = requestBody.id as string;
        if (!id) return errorResponse('Missing required field: id', req, 400);
        const result = await trashMessage(accessToken, { id });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'draft': {
        const to = requestBody.to as string[] | undefined;
        const subject = requestBody.subject as string | undefined;
        const body = requestBody.body as string | undefined;
        if (!to?.length || !subject || !body) {
          return errorResponse('Missing required fields: to (array), subject, body', req, 400);
        }
        const result = await createDraft(accessToken, {
          subject,
          body,
          isHtml: requestBody.isHtml as boolean | undefined,
          to,
          cc: requestBody.cc as string[] | undefined,
          bcc: requestBody.bcc as string[] | undefined,
        });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'reply': {
        const id = requestBody.id as string;
        const comment = requestBody.comment as string;
        if (!id || !comment) {
          return errorResponse('Missing required fields: id, comment', req, 400);
        }
        const result = await replyToMessage(accessToken, {
          id,
          comment,
          isHtml: requestBody.isHtml as boolean | undefined,
        });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'forward': {
        const id = requestBody.id as string;
        const to = requestBody.to as string[] | undefined;
        if (!id || !to?.length) {
          return errorResponse('Missing required fields: id, to (array)', req, 400);
        }
        const result = await forwardMessage(accessToken, {
          id,
          to,
          comment: requestBody.comment as string | undefined,
          isHtml: requestBody.isHtml as boolean | undefined,
        });
        return jsonResponse({ success: true, data: result }, req);
      }

      case 'list-folders': {
        const result = await listFolders(accessToken);
        return jsonResponse(result, req);
      }

      case 'list-categories': {
        const result = await listCategories(accessToken);
        return jsonResponse(result, req);
      }

      case 'categorize': {
        const id = requestBody.id as string;
        const categories = requestBody.categories as string[] | undefined;
        if (!id || !categories) {
          return errorResponse('Missing required fields: id, categories (array)', req, 400);
        }
        const result = await categorizeMessage(accessToken, { id, categories });
        return jsonResponse({ success: true, data: result }, req);
      }

      default:
        return errorResponse(
          `Unknown action: "${action}". Supported actions: send, list, get, get-message, mark-as-read, star, flag, archive, trash, delete, draft, reply, forward, list-folders, list-categories, categorize`,
          req,
          400
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ms-graph-email] Error:', message);
    const statusCode = message.includes('not connected') ? 404 : 500;
    return errorResponse(message, req, statusCode);
  }
});
