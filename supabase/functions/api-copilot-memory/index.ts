/**
 * Copilot Memory API Edge Function
 *
 * CM-005: API endpoints for conversation memory search and management.
 *
 * Endpoints:
 * - GET  /search   - Full-text search across memories
 * - GET  /recent   - Get recent memory entries
 * - POST /add      - Add a memory entry
 *
 * @see docs/project-requirements/PRD_ACTION_CENTRE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import {
  createSuccessResponse,
  createErrorResponse,
} from '../_shared/api-utils.ts';
import {
  addMemoryEntry,
  saveConversationMemory,
  saveActionMemory,
  type MemoryEntry,
  type ConversationContext,
} from '../_shared/conversationMemory.ts';

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

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    const organizationId = membership?.org_id;

    // Parse URL path
    const url = new URL(req.url);
    const pathParts = url.pathname
      .split('/')
      .filter(s => s && s !== 'functions' && s !== 'v1' && s !== 'api-copilot-memory');

    const endpoint = pathParts[0] || '';

    console.log('[api-copilot-memory] Request:', {
      method: req.method,
      endpoint,
      userId,
    });

    // Route handling
    if (endpoint === 'search' && req.method === 'GET') {
      const query = url.searchParams.get('q') || '';
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      return await handleSearch(supabase, userId, query, limit);
    }

    if (endpoint === 'recent' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      return await handleGetRecent(supabase, userId, limit);
    }

    if (endpoint === 'add' && req.method === 'POST') {
      const body = await req.json();
      return await handleAddMemory(supabaseUrl, supabaseServiceKey, userId, organizationId, body);
    }

    if (endpoint === 'conversation' && req.method === 'POST') {
      const body = await req.json();
      return await handleSaveConversation(supabaseUrl, supabaseServiceKey, userId, organizationId, body);
    }

    return createErrorResponse('Not found', 404, 'NOT_FOUND');

  } catch (error) {
    console.error('[api-copilot-memory] Error:', error);
    return createErrorResponse(String(error), 500, 'INTERNAL_ERROR');
  }
});

// ============================================================================
// Search Memories
// ============================================================================

async function handleSearch(
  supabase: any,
  userId: string,
  query: string,
  limit: number
): Promise<Response> {
  if (!query || query.trim().length < 2) {
    return createErrorResponse('Query must be at least 2 characters', 400, 'BAD_REQUEST');
  }

  const { data, error } = await supabase.rpc('search_copilot_memory', {
    p_user_id: userId,
    p_query: query.trim(),
    p_limit: Math.min(limit, 50),
  });

  if (error) {
    console.error('[api-copilot-memory] Search error:', error);
    return createErrorResponse('Search failed', 500, 'DB_ERROR');
  }

  return createSuccessResponse({
    results: data || [],
    query,
  });
}

// ============================================================================
// Get Recent Memories
// ============================================================================

async function handleGetRecent(
  supabase: any,
  userId: string,
  limit: number
): Promise<Response> {
  const { data, error } = await supabase.rpc('get_recent_copilot_memory', {
    p_user_id: userId,
    p_limit: Math.min(limit, 50),
  });

  if (error) {
    console.error('[api-copilot-memory] Get recent error:', error);
    return createErrorResponse('Failed to fetch memories', 500, 'DB_ERROR');
  }

  return createSuccessResponse({
    memories: data || [],
  });
}

// ============================================================================
// Add Memory Entry
// ============================================================================

async function handleAddMemory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  organizationId: string | null,
  body: any
): Promise<Response> {
  if (!organizationId) {
    return createErrorResponse('User must belong to an organization', 400, 'NO_ORG');
  }

  const { memory_type, summary, context_snippet, entities, metadata, conversation_id } = body;

  if (!memory_type || !summary) {
    return createErrorResponse('memory_type and summary are required', 400, 'BAD_REQUEST');
  }

  const validTypes = ['conversation', 'action_sent', 'action_created', 'insight_viewed', 'meeting_prep', 'sequence_run'];
  if (!validTypes.includes(memory_type)) {
    return createErrorResponse(`Invalid memory_type. Must be one of: ${validTypes.join(', ')}`, 400, 'BAD_REQUEST');
  }

  const entry: MemoryEntry = {
    user_id: userId,
    organization_id: organizationId,
    memory_type,
    summary,
    context_snippet,
    entities,
    metadata,
    conversation_id,
  };

  const memoryId = await addMemoryEntry(supabaseUrl, serviceRoleKey, entry);

  if (!memoryId) {
    return createErrorResponse('Failed to create memory', 500, 'DB_ERROR');
  }

  return createSuccessResponse({
    id: memoryId,
    message: 'Memory created',
  });
}

// ============================================================================
// Save Conversation Memory
// ============================================================================

async function handleSaveConversation(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  organizationId: string | null,
  body: any
): Promise<Response> {
  if (!organizationId) {
    return createErrorResponse('User must belong to an organization', 400, 'NO_ORG');
  }

  const { messages, entities, conversation_id } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return createErrorResponse('messages array is required', 400, 'BAD_REQUEST');
  }

  const context: ConversationContext = {
    messages,
    entities,
  };

  const memoryId = await saveConversationMemory(
    supabaseUrl,
    serviceRoleKey,
    userId,
    organizationId,
    context,
    conversation_id
  );

  if (!memoryId) {
    return createErrorResponse('Failed to save conversation', 500, 'DB_ERROR');
  }

  return createSuccessResponse({
    id: memoryId,
    message: 'Conversation saved to memory',
  });
}
