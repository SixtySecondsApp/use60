/**
 * Fleet Admin Edge Function
 *
 * CRUD for fleet event routes, sequence definitions, handoff routes,
 * and dead-letter queue management.
 *
 * Story: FLT-013
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';
import { getCircuitBreakerStats } from '../_shared/orchestrator/circuitBreaker.ts';

serve(async (req) => {
  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  try {
    const body = await req.json();
    const { action, org_id } = body;

    if (!action || !org_id) {
      return errorResponse('Missing required fields: action, org_id', req, 400);
    }

    // Auth context
    const auth = await getAuthContext(req);
    if (!auth.userId) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Service client for writes (bypasses RLS)
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // User client for reads (respects RLS)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    // =========================================================================
    // Routes CRUD
    // =========================================================================

    if (action === 'list_routes') {
      await requireOrgRole(req, org_id, ['admin', 'owner', 'member']);
      const { data, error } = await userClient
        .from('fleet_event_routes')
        .select('id, org_id, event_type, sequence_key, is_active, priority, conditions, created_at, updated_at')
        .or(`org_id.eq.${org_id},org_id.is.null`)
        .order('event_type')
        .order('priority', { ascending: false });
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ routes: data }, req);
    }

    if (action === 'get_route') {
      await requireOrgRole(req, org_id, ['admin', 'owner', 'member']);
      const { route_id } = body;
      if (!route_id) return errorResponse('Missing route_id', req, 400);
      const { data, error } = await userClient
        .from('fleet_event_routes')
        .select('*')
        .eq('id', route_id)
        .maybeSingle();
      if (error) return errorResponse(error.message, req, 500);
      if (!data) return errorResponse('Route not found', req, 404);
      return jsonResponse({ route: data }, req);
    }

    if (action === 'create_route') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { event_type, sequence_key, priority, conditions } = body;
      if (!event_type || !sequence_key) return errorResponse('Missing event_type or sequence_key', req, 400);
      const { data, error } = await serviceClient
        .from('fleet_event_routes')
        .insert({
          org_id,
          event_type,
          sequence_key,
          priority: priority ?? 0,
          conditions: conditions ?? null,
        })
        .select('id')
        .single();
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ id: data.id, created: true }, req);
    }

    if (action === 'update_route') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { route_id, ...updates } = body;
      if (!route_id) return errorResponse('Missing route_id', req, 400);
      // Only allow updating org-owned routes
      const { data: existing } = await serviceClient
        .from('fleet_event_routes')
        .select('org_id')
        .eq('id', route_id)
        .maybeSingle();
      if (!existing || existing.org_id !== org_id) return errorResponse('Cannot modify platform defaults or other org routes', req, 403);
      const allowed = ['event_type', 'sequence_key', 'is_active', 'priority', 'conditions'];
      const update: Record<string, unknown> = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) update[key] = updates[key];
      }
      const { error } = await serviceClient.from('fleet_event_routes').update(update).eq('id', route_id);
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ updated: true }, req);
    }

    if (action === 'delete_route') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { route_id } = body;
      if (!route_id) return errorResponse('Missing route_id', req, 400);
      const { data: existing } = await serviceClient
        .from('fleet_event_routes')
        .select('org_id')
        .eq('id', route_id)
        .maybeSingle();
      if (!existing || existing.org_id !== org_id) return errorResponse('Cannot delete platform defaults or other org routes', req, 403);
      const { error } = await serviceClient.from('fleet_event_routes').delete().eq('id', route_id);
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ deleted: true }, req);
    }

    // =========================================================================
    // Sequences CRUD
    // =========================================================================

    if (action === 'list_sequences') {
      await requireOrgRole(req, org_id, ['admin', 'owner', 'member']);
      const { data, error } = await userClient
        .from('fleet_sequence_definitions')
        .select('id, sequence_key, org_id, version, is_active, context_requirements, created_at, updated_at')
        .or(`org_id.eq.${org_id},org_id.is.null`)
        .order('sequence_key');
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ sequences: data }, req);
    }

    if (action === 'get_sequence') {
      await requireOrgRole(req, org_id, ['admin', 'owner', 'member']);
      const { sequence_id } = body;
      if (!sequence_id) return errorResponse('Missing sequence_id', req, 400);
      const { data, error } = await userClient
        .from('fleet_sequence_definitions')
        .select('*')
        .eq('id', sequence_id)
        .maybeSingle();
      if (error) return errorResponse(error.message, req, 500);
      if (!data) return errorResponse('Sequence not found', req, 404);
      return jsonResponse({ sequence: data }, req);
    }

    if (action === 'create_sequence') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { sequence_key, steps, context_requirements } = body;
      if (!sequence_key || !steps) return errorResponse('Missing sequence_key or steps', req, 400);
      if (!Array.isArray(steps) || steps.length === 0) return errorResponse('Steps must be a non-empty array', req, 400);
      // Get next version for this org+key
      const { data: existing } = await serviceClient
        .from('fleet_sequence_definitions')
        .select('version')
        .eq('sequence_key', sequence_key)
        .eq('org_id', org_id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (existing?.version ?? 0) + 1;
      const { data, error } = await serviceClient
        .from('fleet_sequence_definitions')
        .insert({
          org_id,
          sequence_key,
          version: nextVersion,
          steps,
          context_requirements: context_requirements ?? null,
        })
        .select('id, version')
        .single();
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ id: data.id, version: data.version, created: true }, req);
    }

    if (action === 'update_sequence') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { sequence_id, ...updates } = body;
      if (!sequence_id) return errorResponse('Missing sequence_id', req, 400);
      const { data: existing } = await serviceClient
        .from('fleet_sequence_definitions')
        .select('org_id')
        .eq('id', sequence_id)
        .maybeSingle();
      if (!existing || existing.org_id !== org_id) return errorResponse('Cannot modify platform defaults or other org sequences', req, 403);
      const allowed = ['steps', 'context_requirements', 'is_active'];
      const update: Record<string, unknown> = {};
      for (const key of allowed) {
        if (updates[key] !== undefined) update[key] = updates[key];
      }
      const { error } = await serviceClient.from('fleet_sequence_definitions').update(update).eq('id', sequence_id);
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ updated: true }, req);
    }

    // =========================================================================
    // Handoff Routes
    // =========================================================================

    if (action === 'list_handoffs') {
      await requireOrgRole(req, org_id, ['admin', 'owner', 'member']);
      const { data, error } = await userClient
        .from('fleet_handoff_routes')
        .select('id, org_id, source_sequence_key, source_step_skill, target_event_type, context_mapping, conditions, delay_minutes, is_active, created_at')
        .or(`org_id.eq.${org_id},org_id.is.null`)
        .order('source_sequence_key');
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ handoffs: data }, req);
    }

    // =========================================================================
    // Dead-Letter Queue Management
    // =========================================================================

    if (action === 'list_dead_letters') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const status = body.status; // optional filter
      let query = userClient
        .from('fleet_dead_letter_queue')
        .select('id, org_id, user_id, event_type, error_message, error_step, retry_count, max_retries, status, next_retry_at, created_at, resolved_at')
        .eq('org_id', org_id)
        .order('created_at', { ascending: false })
        .limit(body.limit || 50);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ dead_letters: data }, req);
    }

    if (action === 'retry_dead_letter') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { dead_letter_id } = body;
      if (!dead_letter_id) return errorResponse('Missing dead_letter_id', req, 400);
      const { error } = await serviceClient
        .from('fleet_dead_letter_queue')
        .update({
          status: 'pending',
          next_retry_at: new Date().toISOString(),
          retry_count: 0,
        })
        .eq('id', dead_letter_id)
        .eq('org_id', org_id);
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ queued_for_retry: true }, req);
    }

    if (action === 'abandon_dead_letter') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const { dead_letter_id } = body;
      if (!dead_letter_id) return errorResponse('Missing dead_letter_id', req, 400);
      const { error } = await serviceClient
        .from('fleet_dead_letter_queue')
        .update({
          status: 'abandoned',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', dead_letter_id)
        .eq('org_id', org_id);
      if (error) return errorResponse(error.message, req, 500);
      return jsonResponse({ abandoned: true }, req);
    }

    // =========================================================================
    // Circuit Breaker Stats
    // =========================================================================

    if (action === 'get_circuit_breaker_stats') {
      await requireOrgRole(req, org_id, ['admin', 'owner']);
      const stats = getCircuitBreakerStats();
      return jsonResponse({ circuits: stats }, req);
    }

    return errorResponse(`Unknown action: ${action}`, req, 400);

  } catch (error) {
    console.error('[fleet-admin] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});
