/**
 * Action Centre API Edge Function
 *
 * AC-006: API endpoints for Action Centre CRUD operations.
 *
 * Endpoints:
 * - GET  /items          - List action centre items (with filters)
 * - GET  /items/:id      - Get single item
 * - POST /items/:id/approve - Approve an action
 * - POST /items/:id/dismiss - Dismiss an action
 * - POST /items/:id/edit   - Edit and approve (for high-risk items)
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  createSuccessResponse,
  createErrorResponse,
  extractIdFromPath,
} from '../_shared/api-utils.ts';

// ============================================================================
// Types
// ============================================================================

interface ActionCentreItem {
  id: string;
  user_id: string;
  organization_id: string;
  action_type: string;
  risk_level: string;
  status: string;
  title: string;
  description: string | null;
  preview_data: Record<string, unknown>;
  source_type: string;
  source_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  meeting_id: string | null;
  slack_channel_id: string | null;
  slack_message_ts: string | null;
  approved_at: string | null;
  dismissed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface ListParams {
  status?: string;
  action_type?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  const corsPreflightResponse = handleCorsPreflightRequest(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('Authorization required', 401, 'UNAUTHORIZED');
    }

    const jwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Auth client to validate JWT
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) {
      return createErrorResponse('Invalid token', 401, 'UNAUTHORIZED');
    }

    // Service client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const userId = user.id;

    // Parse URL path
    const url = new URL(req.url);
    const pathParts = url.pathname
      .split('/')
      .filter(s => s && s !== 'functions' && s !== 'v1' && s !== 'api-action-centre');

    const endpoint = pathParts[0] || ''; // 'items'
    const itemId = pathParts[1] || '';   // item UUID
    const action = pathParts[2] || '';   // 'approve', 'dismiss', 'edit'

    console.log('[api-action-centre] Request:', {
      method: req.method,
      endpoint,
      itemId,
      action,
      userId,
    });

    // Route handling
    if (endpoint === 'items' || endpoint === '') {
      if (req.method === 'GET' && !itemId) {
        return await handleListItems(supabase, userId, url.searchParams);
      }

      if (req.method === 'GET' && itemId && !action) {
        return await handleGetItem(supabase, userId, itemId);
      }

      if (req.method === 'POST' && itemId && action === 'approve') {
        return await handleApproveItem(supabase, userId, itemId);
      }

      if (req.method === 'POST' && itemId && action === 'dismiss') {
        const body = await req.json().catch(() => ({}));
        return await handleDismissItem(supabase, userId, itemId, body.reason);
      }

      if (req.method === 'POST' && itemId && action === 'edit') {
        const body = await req.json();
        return await handleEditAndApprove(supabase, userId, itemId, body);
      }
    }

    return createErrorResponse('Not found', 404, 'NOT_FOUND');

  } catch (error) {
    console.error('[api-action-centre] Error:', error);
    return createErrorResponse(String(error), 500, 'INTERNAL_ERROR');
  }
});

// ============================================================================
// List Items
// ============================================================================

async function handleListItems(
  supabase: any,
  userId: string,
  params: URLSearchParams
): Promise<Response> {
  const status = params.get('status') || undefined;
  const actionType = params.get('action_type') || undefined;
  const limit = parseInt(params.get('limit') || '50', 10);
  const offset = parseInt(params.get('offset') || '0', 10);

  let query = supabase
    .from('action_centre_items')
    .select('*, contacts(first_name, last_name, email), deals(name, value)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by status
  if (status) {
    query = query.eq('status', status);
  } else {
    // Default: exclude expired
    query = query.gt('expires_at', new Date().toISOString());
  }

  // Filter by action type
  if (actionType) {
    query = query.eq('action_type', actionType);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[api-action-centre] List error:', error);
    return createErrorResponse('Failed to fetch items', 500, 'DB_ERROR');
  }

  return createSuccessResponse({
    items: data || [],
    total: count || data?.length || 0,
    limit,
    offset,
  });
}

// ============================================================================
// Get Single Item
// ============================================================================

async function handleGetItem(
  supabase: any,
  userId: string,
  itemId: string
): Promise<Response> {
  const { data, error } = await supabase
    .from('action_centre_items')
    .select('*, contacts(first_name, last_name, email), deals(name, value)')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return createErrorResponse('Failed to fetch item', 500, 'DB_ERROR');
  }

  if (!data) {
    return createErrorResponse('Item not found', 404, 'NOT_FOUND');
  }

  return createSuccessResponse({ item: data });
}

// ============================================================================
// Approve Item
// ============================================================================

async function handleApproveItem(
  supabase: any,
  userId: string,
  itemId: string
): Promise<Response> {
  // First, verify item belongs to user and is pending
  const { data: item, error: fetchError } = await supabase
    .from('action_centre_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError) {
    return createErrorResponse('Failed to fetch item', 500, 'DB_ERROR');
  }

  if (!item) {
    return createErrorResponse('Item not found or already processed', 404, 'NOT_FOUND');
  }

  // Update status to approved
  const { data, error } = await supabase
    .from('action_centre_items')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    return createErrorResponse('Failed to approve item', 500, 'DB_ERROR');
  }

  // Log engagement event
  await supabase.rpc('log_copilot_engagement', {
    p_org_id: item.organization_id,
    p_user_id: userId,
    p_event_type: 'action_approved',
    p_trigger_type: item.source_type === 'proactive' ? 'proactive' : 'reactive',
    p_channel: 'action_centre',
    p_action_id: itemId,
    p_metadata: {
      action_type: item.action_type,
      risk_level: item.risk_level,
    },
  }).catch((err: any) => console.error('Failed to log engagement:', err));

  // TODO: Execute the actual action based on action_type
  // For now, just return success. The actual execution would be:
  // - email: Send via Gmail API
  // - task: Create in CRM
  // - slack_message: Post to Slack
  // - field_update: Update CRM field

  return createSuccessResponse({
    item: data,
    message: 'Item approved successfully',
  });
}

// ============================================================================
// Dismiss Item
// ============================================================================

async function handleDismissItem(
  supabase: any,
  userId: string,
  itemId: string,
  reason?: string
): Promise<Response> {
  // Verify item belongs to user
  const { data: item, error: fetchError } = await supabase
    .from('action_centre_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError) {
    return createErrorResponse('Failed to fetch item', 500, 'DB_ERROR');
  }

  if (!item) {
    return createErrorResponse('Item not found or already processed', 404, 'NOT_FOUND');
  }

  // Update status to dismissed
  const { data, error } = await supabase
    .from('action_centre_items')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString(),
      preview_data: {
        ...item.preview_data,
        dismiss_reason: reason,
      },
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    return createErrorResponse('Failed to dismiss item', 500, 'DB_ERROR');
  }

  // Log engagement event
  await supabase.rpc('log_copilot_engagement', {
    p_org_id: item.organization_id,
    p_user_id: userId,
    p_event_type: 'action_dismissed',
    p_trigger_type: item.source_type === 'proactive' ? 'proactive' : 'reactive',
    p_channel: 'action_centre',
    p_action_id: itemId,
    p_metadata: {
      action_type: item.action_type,
      risk_level: item.risk_level,
      reason,
    },
  }).catch((err: any) => console.error('Failed to log engagement:', err));

  return createSuccessResponse({
    item: data,
    message: 'Item dismissed',
  });
}

// ============================================================================
// Edit and Approve (High-Risk Items)
// ============================================================================

async function handleEditAndApprove(
  supabase: any,
  userId: string,
  itemId: string,
  edits: Record<string, unknown>
): Promise<Response> {
  // Verify item belongs to user
  const { data: item, error: fetchError } = await supabase
    .from('action_centre_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchError) {
    return createErrorResponse('Failed to fetch item', 500, 'DB_ERROR');
  }

  if (!item) {
    return createErrorResponse('Item not found or already processed', 404, 'NOT_FOUND');
  }

  // Merge edits into preview_data
  const updatedPreviewData = {
    ...item.preview_data,
    edited: true,
    edits,
    original: item.preview_data,
  };

  // Update with edits and approve
  const { data, error } = await supabase
    .from('action_centre_items')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      preview_data: updatedPreviewData,
      title: edits.title || item.title,
      description: edits.description || item.description,
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    return createErrorResponse('Failed to update item', 500, 'DB_ERROR');
  }

  // Log engagement event
  await supabase.rpc('log_copilot_engagement', {
    p_org_id: item.organization_id,
    p_user_id: userId,
    p_event_type: 'action_edited_approved',
    p_trigger_type: item.source_type === 'proactive' ? 'proactive' : 'reactive',
    p_channel: 'action_centre',
    p_action_id: itemId,
    p_metadata: {
      action_type: item.action_type,
      risk_level: item.risk_level,
      edited_fields: Object.keys(edits),
    },
  }).catch((err: any) => console.error('Failed to log engagement:', err));

  return createSuccessResponse({
    item: data,
    message: 'Item edited and approved',
  });
}
