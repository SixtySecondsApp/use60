/**
 * Google Tasks Handler (routed via google-services-router)
 *
 * Provides Tasks API access for listing, creating, updating, and deleting tasks.
 *
 * SECURITY:
 * - POST only (no GET for API actions)
 * - User JWT authentication OR service-role with userId in body
 * - Allowlist-based CORS
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../../_shared/corsHelper.ts';
import { authenticateRequest } from '../../_shared/edgeAuth.ts';

// Helper for logging sync operations to integration_sync_logs table
async function logSyncOperation(
  supabase: any,
  args: {
    orgId?: string | null
    userId?: string | null
    operation: 'sync' | 'create' | 'update' | 'delete' | 'push' | 'pull' | 'webhook' | 'error'
    direction: 'inbound' | 'outbound'
    entityType: string
    entityId?: string | null
    entityName?: string | null
    status?: 'success' | 'failed' | 'skipped'
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    batchId?: string | null
  }
): Promise<void> {
  try {
    await supabase.rpc('log_integration_sync', {
      p_org_id: args.orgId ?? null,
      p_user_id: args.userId ?? null,
      p_integration_name: 'google_tasks',
      p_operation: args.operation,
      p_direction: args.direction,
      p_entity_type: args.entityType,
      p_entity_id: args.entityId ?? null,
      p_entity_name: args.entityName ?? null,
      p_status: args.status ?? 'success',
      p_error_message: args.errorMessage ?? null,
      p_metadata: args.metadata ?? {},
      p_batch_id: args.batchId ?? null,
    })
  } catch (e) {
    console.error('[google-tasks] Failed to log sync operation:', e)
  }
}

async function refreshAccessToken(refreshToken: string, supabase: any, userId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to refresh token: ${errorData.error_description || 'Unknown error'}`);
  }

  const data = await response.json();

  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + (data.expires_in || 3600));

  const { error: updateError } = await supabase
    .from('google_integrations')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    throw new Error('Failed to update access token in database');
  }
  return data.access_token;
}

interface ListTaskListsRequest {
  maxResults?: number;
}

interface ListTasksRequest {
  taskListId?: string;
  maxResults?: number;
  showCompleted?: boolean;
  showDeleted?: boolean;
  showHidden?: boolean;
  updatedMin?: string;
}

interface CreateTaskRequest {
  taskListId?: string;
  title: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  position?: string;
}

interface UpdateTaskRequest {
  taskListId: string;
  taskId: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  position?: string;
}

interface DeleteTaskRequest {
  taskListId: string;
  taskId: string;
}

interface SyncTasksRequest {
  lastSyncTime?: string;
  taskListId?: string;
}

export async function handleTasks(req: Request): Promise<Response> {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // POST only
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed. Use POST.', req, 405);
  }

  try {
    // Extract action from URL or body
    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    // Clone request to read body twice if needed
    const bodyText = await req.text();
    let requestBody: any = {};

    if (bodyText) {
      try {
        requestBody = JSON.parse(bodyText);
      } catch {
        throw new Error('Invalid JSON in request body');
      }
    }

    // Get action from body if not in URL
    if (!action && requestBody.action) {
      action = requestBody.action;
    }

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

    // Authenticate - supports both user JWT and service role with userId
    const { userId, mode } = await authenticateRequest(
      req,
      supabase,
      supabaseServiceKey,
      requestBody.userId
    );

    console.log(`[google-tasks] Authenticated as ${mode}, userId: ${userId}, action: ${action}`);

    // Get Google integration
    const { data: integration, error: integrationError } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google integration not found. Please connect your Google account first.');
    }

    // Check if token needs refresh
    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.expires_at);
    const now = new Date();

    if (now >= expiresAt) {
      accessToken = await refreshAccessToken(integration.refresh_token, supabase, userId);
    }

    let result;

    switch (action) {
      case 'list-tasklists': {
        const params = requestBody as ListTaskListsRequest;

        const queryParams = new URLSearchParams();
        if (params.maxResults) queryParams.set('maxResults', params.maxResults.toString());

        const response = await fetch(
          `https://tasks.googleapis.com/tasks/v1/users/@me/lists?${queryParams}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to list task lists');
        }

        result = await response.json();
        break;
      }

      case 'list-tasks': {
        const params = requestBody as ListTasksRequest;
        const taskListId = params.taskListId || '@default';

        const queryParams = new URLSearchParams();
        if (params.maxResults) queryParams.set('maxResults', params.maxResults.toString());
        if (params.showCompleted !== undefined) queryParams.set('showCompleted', params.showCompleted.toString());
        if (params.showDeleted !== undefined) queryParams.set('showDeleted', params.showDeleted.toString());
        if (params.showHidden !== undefined) queryParams.set('showHidden', params.showHidden.toString());
        if (params.updatedMin) queryParams.set('updatedMin', params.updatedMin);

        const response = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?${queryParams}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to list tasks');
        }

        result = await response.json();
        break;
      }

      case 'create-task': {
        const params = requestBody as CreateTaskRequest;
        const taskListId = params.taskListId || '@default';

        const taskData: any = {
          title: params.title,
        };

        if (params.notes) taskData.notes = params.notes;
        if (params.due) taskData.due = params.due;
        if (params.status) taskData.status = params.status;

        const queryParams = new URLSearchParams();
        if (params.position) queryParams.set('position', params.position);

        const taskUrl = `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?${queryParams}`;
        const response = await fetch(taskUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to create task');
        }

        result = await response.json();

        // Log task creation
        await logSyncOperation(supabase, {
          userId,
          operation: 'create',
          direction: 'outbound',
          entityType: 'task',
          entityId: result.id,
          entityName: result.title || params.title,
          metadata: {
            task_list_id: taskListId,
            due: params.due,
            status: params.status,
          },
        })
        break;
      }

      case 'update-task': {
        const params = requestBody as UpdateTaskRequest;
        const { taskListId, taskId, ...updateData } = params;

        const taskData: any = {};
        if (updateData.title !== undefined) taskData.title = updateData.title;
        if (updateData.notes !== undefined) taskData.notes = updateData.notes;
        if (updateData.due !== undefined) taskData.due = updateData.due;
        if (updateData.status !== undefined) taskData.status = updateData.status;

        const response = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to update task');
        }

        result = await response.json();

        // Log task update
        await logSyncOperation(supabase, {
          userId,
          operation: 'update',
          direction: 'outbound',
          entityType: 'task',
          entityId: taskId,
          entityName: result.title || updateData.title,
          metadata: {
            task_list_id: taskListId,
            fields_updated: Object.keys(updateData),
          },
        })
        break;
      }

      case 'delete-task': {
        const params = requestBody as DeleteTaskRequest;
        const { taskListId, taskId } = params;

        const response = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${taskId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok && response.status !== 204) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error?.message || 'Failed to delete task');
        }

        result = { success: true };

        // Log task deletion
        await logSyncOperation(supabase, {
          userId,
          operation: 'delete',
          direction: 'outbound',
          entityType: 'task',
          entityId: taskId,
          entityName: `Task ${taskId}`,
          metadata: {
            task_list_id: taskListId,
          },
        })
        break;
      }

      case 'create-tasklist': {
        const { title } = requestBody;

        if (!title) {
          throw new Error('Task list title is required');
        }

        const response = await fetch(
          'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to create task list');
        }

        result = await response.json();
        break;
      }

      case 'sync-tasks': {
        const params = requestBody as SyncTasksRequest;
        const taskListId = params.taskListId || '@default';

        const queryParams = new URLSearchParams();
        queryParams.set('showCompleted', 'true');
        queryParams.set('showHidden', 'false');
        queryParams.set('maxResults', '100');

        if (params.lastSyncTime) {
          const lastSync = new Date(params.lastSyncTime);
          queryParams.set('updatedMin', lastSync.toISOString());
        }

        const response = await fetch(
          `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks?${queryParams}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to sync tasks');
        }

        const tasks = await response.json();

        const listsResponse = await fetch(
          'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!listsResponse.ok) {
          const error = await listsResponse.json();
          throw new Error(error.error?.message || 'Failed to get task lists');
        }

        const lists = await listsResponse.json();

        result = {
          tasks: tasks.items || [],
          lists: lists.items || [],
          syncTime: new Date().toISOString(),
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log successful operation
    await supabase
      .from('google_service_logs')
      .insert({
        integration_id: integration.id,
        service: 'tasks',
        action: action || 'unknown',
        status: 'success',
        request_data: { action, userId },
        response_data: { success: true },
      }).catch(() => {
        // Non-critical
      });

    return jsonResponse(result, req);

  } catch (error: any) {
    console.error('[google-tasks] Error:', error.message);
    return errorResponse(error.message || 'Tasks service error', req, 400);
  }
}
