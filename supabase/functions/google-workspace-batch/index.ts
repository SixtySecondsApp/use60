/**
 * Google Workspace Batch Edge Function
 *
 * Consolidates all Google API calls (Calendar, Gmail, Drive, Tasks, Docs)
 * into a single batch request. Reduces 12+ separate edge function calls
 * to a single request per page load.
 *
 * Supported services:
 * - calendar: list-calendars, list-events, create-event, availability
 * - gmail: list-labels, list-emails, get-message, profile
 * - drive: list-files, check-permissions
 * - tasks: list-tasklists, list-tasks
 * - docs: get-document
 * - connection: test (validates all service connections)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { authenticateRequest } from '../_shared/edgeAuth.ts';
// WS-027: Legacy refreshAccessToken removed — now uses centralized tokenManager
import { getValidToken } from '../_shared/tokenManager.ts';

// ============================================================================
// Types
// ============================================================================

interface BatchOperation {
  id: string;
  service: 'calendar' | 'gmail' | 'drive' | 'tasks' | 'docs' | 'connection';
  action: string;
  params?: Record<string, unknown>;
}

interface BatchRequest {
  operations: BatchOperation[];
  userId?: string;
}

interface BatchResult {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  timing?: number;
}

interface BatchResponse {
  results: Record<string, BatchResult>;
  totalTime: number;
  operationCount: number;
  tokenRefreshed?: boolean;
}

// ============================================================================
// Token Management
// ============================================================================

async function refreshAccessToken(
  _refreshToken: string,
  _supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const { createClient: cc } = await import('https://esm.sh/@supabase/supabase-js@2.43.4');
  const supa = cc(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
  const { accessToken } = await getValidToken('google', userId, supa);
  return accessToken;
}

// ============================================================================
// Service Handlers
// ============================================================================

type ServiceHandler = (
  accessToken: string,
  action: string,
  params: Record<string, unknown>
) => Promise<unknown>;

// Calendar Service
const calendarHandler: ServiceHandler = async (accessToken, action, params) => {
  switch (action) {
    case 'list-calendars': {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
      const data = await response.json();
      return { calendars: data.items || [] };
    }

    case 'list-events': {
      const calendarId = (params.calendarId as string) || 'primary';
      const queryParams = new URLSearchParams();

      if (params.timeMin) queryParams.set('timeMin', params.timeMin as string);
      if (params.timeMax) queryParams.set('timeMax', params.timeMax as string);
      if (params.maxResults)
        queryParams.set('maxResults', String(params.maxResults));
      queryParams.set('singleEvents', 'true');
      queryParams.set('orderBy', 'startTime');

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
      const data = await response.json();
      return { events: data.items || [], nextSyncToken: data.nextSyncToken };
    }

    case 'availability': {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            items: [{ id: (params.calendarId as string) || 'primary' }],
          }),
        }
      );
      if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
      return await response.json();
    }

    default:
      throw new Error(`Unknown calendar action: ${action}`);
  }
};

// Gmail Service
const gmailHandler: ServiceHandler = async (accessToken, action, params) => {
  switch (action) {
    case 'profile': {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);
      return await response.json();
    }

    case 'list-labels': {
      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/labels',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);
      const data = await response.json();
      return { labels: data.labels || [] };
    }

    case 'list-emails': {
      const queryParams = new URLSearchParams();
      if (params.q) queryParams.set('q', params.q as string);
      if (params.maxResults) queryParams.set('maxResults', String(params.maxResults));
      if (params.pageToken) queryParams.set('pageToken', params.pageToken as string);

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);
      const data = await response.json();
      return {
        messages: data.messages || [],
        nextPageToken: data.nextPageToken,
        resultSizeEstimate: data.resultSizeEstimate,
      };
    }

    case 'get-message': {
      if (!params.messageId) throw new Error('messageId required');
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.messageId}?format=full`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);
      return await response.json();
    }

    case 'unread-count': {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=1`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);
      const data = await response.json();
      return { unreadCount: data.resultSizeEstimate || 0 };
    }

    default:
      throw new Error(`Unknown gmail action: ${action}`);
  }
};

// Drive Service
const driveHandler: ServiceHandler = async (accessToken, action, params) => {
  switch (action) {
    case 'list-files': {
      const queryParams = new URLSearchParams();
      queryParams.set('pageSize', String(params.pageSize || 10));
      if (params.q) queryParams.set('q', params.q as string);
      if (params.pageToken)
        queryParams.set('pageToken', params.pageToken as string);
      queryParams.set('fields', 'files(id,name,mimeType,modifiedTime,size)');

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Drive API error: ${response.status}`);
      const data = await response.json();
      return { files: data.files || [], nextPageToken: data.nextPageToken };
    }

    case 'check-permissions': {
      // Check if we have drive access by listing 1 file
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?pageSize=1',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      return {
        hasAccess: response.ok,
        status: response.status,
      };
    }

    default:
      throw new Error(`Unknown drive action: ${action}`);
  }
};

// Tasks Service
const tasksHandler: ServiceHandler = async (accessToken, action, params) => {
  switch (action) {
    case 'list-tasklists': {
      const response = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Tasks API error: ${response.status}`);
      const data = await response.json();
      return { taskLists: data.items || [] };
    }

    case 'list-tasks': {
      const taskListId = (params.taskListId as string) || '@default';
      const queryParams = new URLSearchParams();
      if (params.maxResults)
        queryParams.set('maxResults', String(params.maxResults));
      if (params.showCompleted !== undefined)
        queryParams.set('showCompleted', String(params.showCompleted));

      const response = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Tasks API error: ${response.status}`);
      const data = await response.json();
      return { tasks: data.items || [] };
    }

    default:
      throw new Error(`Unknown tasks action: ${action}`);
  }
};

// Docs Service
const docsHandler: ServiceHandler = async (accessToken, action, params) => {
  switch (action) {
    case 'get-document': {
      if (!params.documentId) throw new Error('documentId required');
      const response = await fetch(
        `https://docs.googleapis.com/v1/documents/${params.documentId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!response.ok) throw new Error(`Docs API error: ${response.status}`);
      return await response.json();
    }

    default:
      throw new Error(`Unknown docs action: ${action}`);
  }
};

// Connection Test Service
const connectionHandler: ServiceHandler = async (accessToken, action) => {
  if (action !== 'test') {
    throw new Error(`Unknown connection action: ${action}`);
  }

  const results: Record<string, { ok: boolean; message?: string }> = {};

  // Test userinfo
  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    results.userinfo = {
      ok: response.ok,
      message: response.ok ? 'Connected' : `HTTP ${response.status}`,
    };
  } catch (error) {
    results.userinfo = {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed',
    };
  }

  // Test Gmail
  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    results.gmail = {
      ok: response.ok,
      message: response.ok ? 'Connected' : `HTTP ${response.status}`,
    };
  } catch (error) {
    results.gmail = {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed',
    };
  }

  // Test Calendar
  try {
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    results.calendar = {
      ok: response.ok,
      message: response.ok ? 'Connected' : `HTTP ${response.status}`,
    };
  } catch (error) {
    results.calendar = {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed',
    };
  }

  // Test Tasks
  try {
    const response = await fetch(
      'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    results.tasks = {
      ok: response.ok,
      message: response.ok ? 'Connected' : `HTTP ${response.status}`,
    };
  } catch (error) {
    results.tasks = {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed',
    };
  }

  return {
    services: results,
    allOk: Object.values(results).every((r) => r.ok),
  };
};

const serviceHandlers: Record<string, ServiceHandler> = {
  calendar: calendarHandler,
  gmail: gmailHandler,
  drive: driveHandler,
  tasks: tasksHandler,
  docs: docsHandler,
  connection: connectionHandler,
};

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // POST only
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  const startTime = Date.now();

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Parse request
    const body: BatchRequest = await req.json();
    const { operations, userId: requestUserId } = body;

    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      throw new Error('operations array is required and must not be empty');
    }

    if (operations.length > 15) {
      throw new Error('Maximum 15 operations per batch request');
    }

    // Authenticate
    const { userId } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      requestUserId
    );

    // Get user's Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error(
        'Google integration not found. Please connect your Google account first.'
      );
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    let tokenRefreshed = false;
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      accessToken = await refreshAccessToken(
        integration.refresh_token,
        supabase,
        userId
      );
      tokenRefreshed = true;
    }

    // Process all operations in parallel
    const results: Record<string, BatchResult> = {};

    await Promise.all(
      operations.map(async (op) => {
        const opStartTime = Date.now();

        try {
          // Validate operation
          if (!op.id || !op.service || !op.action) {
            results[op.id || 'unknown'] = {
              id: op.id || 'unknown',
              success: false,
              error: 'Operation must have id, service, and action',
            };
            return;
          }

          // Get handler for service
          const handler = serviceHandlers[op.service];
          if (!handler) {
            results[op.id] = {
              id: op.id,
              success: false,
              error: `Unknown service: ${op.service}`,
            };
            return;
          }

          // Execute handler
          const data = await handler(accessToken, op.action, op.params || {});

          results[op.id] = {
            id: op.id,
            success: true,
            data,
            timing: Date.now() - opStartTime,
          };
        } catch (err) {
          results[op.id] = {
            id: op.id,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
            timing: Date.now() - opStartTime,
          };
        }
      })
    );

    // Log the batch operation
    await supabase
      .from('google_service_logs')
      .insert({
        integration_id: integration.id,
        service: 'workspace-batch',
        action: 'batch',
        status: 'success',
        request_data: {
          operationCount: operations.length,
          services: [...new Set(operations.map((o) => o.service))],
        },
        response_data: {
          successCount: Object.values(results).filter((r) => r.success).length,
          totalTime: Date.now() - startTime,
        },
      })
      .catch(() => {
        // Non-critical
      });

    const response: BatchResponse = {
      results,
      totalTime: Date.now() - startTime,
      operationCount: operations.length,
      tokenRefreshed,
    };

    return jsonResponse(response, req);
  } catch (error) {
    console.error('[google-workspace-batch] Error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Batch request failed',
      req,
      error instanceof Error && error.message.includes('not found') ? 404 : 400
    );
  }
});
