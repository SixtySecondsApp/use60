// supabase/functions/admin-credit-menu/index.ts
// Platform admin CRUD for the credit_menu pricing table.
// Routes by method + URL path suffix:
//   GET  /                     → list all entries (including drafts, excluding deleted)
//   POST /                     → create new draft action
//   PUT  /:action_id           → update action pricing/metadata
//   PATCH /:action_id/activate → activate draft
//   PATCH /:action_id/deactivate → deactivate
//   GET  /history              → get pricing audit trail

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreditMenuEntry {
  action_id: string;
  display_name: string;
  description: string;
  category: string;
  unit: string;
  cost_low: number;
  cost_medium: number;
  cost_high: number;
  is_active: boolean;
  free_with_sub: boolean;
  is_flat_rate: boolean;
  menu_version: number;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
}

interface CreateBody {
  action_id: string;
  display_name: string;
  description?: string;
  category?: string;
  unit?: string;
  cost_low: number;
  cost_medium: number;
  cost_high: number;
  free_with_sub?: boolean;
  is_flat_rate?: boolean;
}

interface UpdateBody {
  display_name?: string;
  description?: string;
  category?: string;
  unit?: string;
  cost_low?: number;
  cost_medium?: number;
  cost_high?: number;
  free_with_sub?: boolean;
  is_flat_rate?: boolean;
}

interface ActivateBody {
  reason?: string;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

/**
 * Verify JWT and confirm the user is a platform admin (profiles.is_admin = true).
 * Returns { userId, userEmail } on success; throws on failure.
 */
async function requirePlatformAdmin(
  req: Request,
  adminClient: ReturnType<typeof createClient>
): Promise<{ userId: string; userEmail: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw Object.assign(new Error('Missing authorization header'), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

  if (authError || !user) {
    throw Object.assign(new Error('Invalid authentication'), { status: 401 });
  }

  // Check platform admin status via profiles table
  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    throw Object.assign(new Error('Forbidden: platform admin access required'), { status: 403 });
  }

  return { userId: user.id, userEmail: user.email ?? user.id };
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** GET / — list all non-deleted credit menu entries */
async function handleList(
  req: Request,
  adminClient: ReturnType<typeof createClient>
): Promise<Response> {
  const { data, error } = await adminClient
    .from('credit_menu')
    .select(
      'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, menu_version, updated_at, updated_by, deleted_at'
    )
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[admin-credit-menu] list error:', error);
    return errorResponse('Failed to fetch credit menu', req, 500);
  }

  return jsonResponse({ data, error: null }, req);
}

/** GET /history — full pricing audit trail */
async function handleHistory(
  req: Request,
  adminClient: ReturnType<typeof createClient>
): Promise<Response> {
  const url = new URL(req.url);
  const actionId = url.searchParams.get('action_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  let query = adminClient
    .from('credit_menu_history')
    .select(
      'id, action_id, event_type, prev_cost_low, prev_cost_medium, prev_cost_high, prev_is_active, new_cost_low, new_cost_medium, new_cost_high, new_is_active, menu_version, reason, changed_by, changed_at'
    )
    .order('changed_at', { ascending: false })
    .limit(limit);

  if (actionId) {
    query = query.eq('action_id', actionId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin-credit-menu] history error:', error);
    return errorResponse('Failed to fetch credit menu history', req, 500);
  }

  return jsonResponse({ data, error: null }, req);
}

/** POST / — create a new draft action (is_active = false) */
async function handleCreate(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  adminIdentifier: string
): Promise<Response> {
  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  // Validate required fields
  const { action_id, display_name, cost_low, cost_medium, cost_high } = body;

  if (!action_id || typeof action_id !== 'string' || action_id.trim() === '') {
    return errorResponse('Missing required field: action_id', req, 400);
  }
  if (!display_name || typeof display_name !== 'string' || display_name.trim() === '') {
    return errorResponse('Missing required field: display_name', req, 400);
  }
  if (cost_low === undefined || cost_medium === undefined || cost_high === undefined) {
    return errorResponse('Missing required fields: cost_low, cost_medium, cost_high', req, 400);
  }
  if (typeof cost_low !== 'number' || typeof cost_medium !== 'number' || typeof cost_high !== 'number') {
    return errorResponse('cost_low, cost_medium, cost_high must be numbers', req, 400);
  }
  if (cost_low < 0 || cost_medium < 0 || cost_high < 0) {
    return errorResponse('Prices must be >= 0', req, 400);
  }

  const now = new Date().toISOString();

  const { data, error } = await adminClient
    .from('credit_menu')
    .insert({
      action_id: action_id.trim(),
      display_name: display_name.trim(),
      description: body.description ?? '',
      category: body.category ?? 'general',
      unit: body.unit ?? 'credits',
      cost_low,
      cost_medium,
      cost_high,
      is_active: false,
      free_with_sub: body.free_with_sub ?? false,
      is_flat_rate: body.is_flat_rate ?? false,
      menu_version: 1,
      updated_at: now,
      updated_by: adminIdentifier,
      deleted_at: null,
    })
    .select(
      'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, menu_version, updated_at, updated_by'
    )
    .single();

  if (error) {
    console.error('[admin-credit-menu] create error:', error);
    if (error.code === '23505') {
      return errorResponse(`Action ID '${action_id}' already exists`, req, 409);
    }
    return errorResponse('Failed to create credit menu entry', req, 500);
  }

  // Insert history record (non-fatal — audit trail failure must not block the response)
  try {
    await adminClient.from('credit_menu_history').insert({
      action_id: action_id.trim(),
      event_type: 'created',
      prev_cost_low: null,
      prev_cost_medium: null,
      prev_cost_high: null,
      prev_is_active: null,
      new_cost_low: cost_low,
      new_cost_medium: cost_medium,
      new_cost_high: cost_high,
      new_is_active: false,
      menu_version: 1,
      reason: 'Draft created',
      changed_by: adminIdentifier,
      changed_at: now,
    });
  } catch (histErr) {
    console.warn('[admin-credit-menu] history insert failed (non-fatal):', histErr);
  }

  return jsonResponse({ data, error: null }, req, 201);
}

/** PUT /:action_id — update pricing / metadata */
async function handleUpdate(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  actionId: string,
  adminIdentifier: string
): Promise<Response> {
  if (!actionId) {
    return errorResponse('Missing action_id in path', req, 400);
  }

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', req, 400);
  }

  // Validate prices if provided
  for (const field of ['cost_low', 'cost_medium', 'cost_high'] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'number') {
        return errorResponse(`${field} must be a number`, req, 400);
      }
      if ((body[field] as number) < 0) {
        return errorResponse(`${field} must be >= 0`, req, 400);
      }
    }
  }

  // Fetch current entry for history
  const { data: current, error: fetchError } = await adminClient
    .from('credit_menu')
    .select(
      'action_id, cost_low, cost_medium, cost_high, is_active, menu_version, deleted_at'
    )
    .eq('action_id', actionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[admin-credit-menu] update fetch error:', fetchError);
    return errorResponse('Failed to fetch existing entry', req, 500);
  }
  if (!current) {
    return errorResponse(`Action '${actionId}' not found`, req, 404);
  }
  if (current.deleted_at !== null) {
    return errorResponse(`Action '${actionId}' has been deleted`, req, 410);
  }

  const now = new Date().toISOString();
  const newVersion = (current.menu_version ?? 1) + 1;

  const updates: Record<string, unknown> = {
    updated_at: now,
    updated_by: adminIdentifier,
    menu_version: newVersion,
  };

  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) updates.category = body.category;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.cost_low !== undefined) updates.cost_low = body.cost_low;
  if (body.cost_medium !== undefined) updates.cost_medium = body.cost_medium;
  if (body.cost_high !== undefined) updates.cost_high = body.cost_high;
  if (body.free_with_sub !== undefined) updates.free_with_sub = body.free_with_sub;
  if (body.is_flat_rate !== undefined) updates.is_flat_rate = body.is_flat_rate;

  const { data, error } = await adminClient
    .from('credit_menu')
    .update(updates)
    .eq('action_id', actionId)
    .select(
      'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, menu_version, updated_at, updated_by'
    )
    .single();

  if (error) {
    console.error('[admin-credit-menu] update error:', error);
    return errorResponse('Failed to update credit menu entry', req, 500);
  }

  // History record for pricing change (non-fatal)
  try {
    await adminClient.from('credit_menu_history').insert({
      action_id: actionId,
      event_type: 'updated',
      prev_cost_low: current.cost_low,
      prev_cost_medium: current.cost_medium,
      prev_cost_high: current.cost_high,
      prev_is_active: current.is_active,
      new_cost_low: (updates.cost_low ?? current.cost_low) as number,
      new_cost_medium: (updates.cost_medium ?? current.cost_medium) as number,
      new_cost_high: (updates.cost_high ?? current.cost_high) as number,
      new_is_active: current.is_active,
      menu_version: newVersion,
      reason: 'Pricing/metadata updated',
      changed_by: adminIdentifier,
      changed_at: now,
    });
  } catch (histErr) {
    console.warn('[admin-credit-menu] history insert failed (non-fatal):', histErr);
  }

  return jsonResponse({ data, error: null }, req);
}

/** PATCH /:action_id/activate — activate a draft */
async function handleActivate(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  actionId: string,
  adminIdentifier: string
): Promise<Response> {
  let body: ActivateBody = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional for activate
  }

  const { data: current, error: fetchError } = await adminClient
    .from('credit_menu')
    .select(
      'action_id, cost_low, cost_medium, cost_high, is_active, free_with_sub, menu_version, deleted_at'
    )
    .eq('action_id', actionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[admin-credit-menu] activate fetch error:', fetchError);
    return errorResponse('Failed to fetch entry', req, 500);
  }
  if (!current) {
    return errorResponse(`Action '${actionId}' not found`, req, 404);
  }
  if (current.deleted_at !== null) {
    return errorResponse(`Action '${actionId}' has been deleted`, req, 410);
  }
  if (current.is_active) {
    return errorResponse(`Action '${actionId}' is already active`, req, 409);
  }

  // Validate prices: must be > 0 unless free_with_sub is true (intentionally free)
  const isFreeBySubscription = current.free_with_sub === true;
  if (!isFreeBySubscription) {
    if (current.cost_low <= 0 || current.cost_medium <= 0 || current.cost_high <= 0) {
      return errorResponse(
        'Cannot activate: all tier prices (cost_low, cost_medium, cost_high) must be > 0. ' +
        'Set free_with_sub=true if this action is intentionally free for subscribers.',
        req,
        400
      );
    }
  }

  const now = new Date().toISOString();
  const newVersion = (current.menu_version ?? 1) + 1;

  const { data, error } = await adminClient
    .from('credit_menu')
    .update({
      is_active: true,
      updated_at: now,
      updated_by: adminIdentifier,
      menu_version: newVersion,
    })
    .eq('action_id', actionId)
    .select(
      'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, menu_version, updated_at, updated_by'
    )
    .single();

  if (error) {
    console.error('[admin-credit-menu] activate error:', error);
    return errorResponse('Failed to activate entry', req, 500);
  }

  // History record for activation (non-fatal)
  try {
    await adminClient.from('credit_menu_history').insert({
      action_id: actionId,
      event_type: 'activated',
      prev_cost_low: current.cost_low,
      prev_cost_medium: current.cost_medium,
      prev_cost_high: current.cost_high,
      prev_is_active: false,
      new_cost_low: current.cost_low,
      new_cost_medium: current.cost_medium,
      new_cost_high: current.cost_high,
      new_is_active: true,
      menu_version: newVersion,
      reason: body.reason ?? 'Activated by admin',
      changed_by: adminIdentifier,
      changed_at: now,
    });
  } catch (histErr) {
    console.warn('[admin-credit-menu] history insert failed (non-fatal):', histErr);
  }

  return jsonResponse({ data, error: null }, req);
}

/** PATCH /:action_id/deactivate — deactivate an active entry */
async function handleDeactivate(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  actionId: string,
  adminIdentifier: string
): Promise<Response> {
  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  const { data: current, error: fetchError } = await adminClient
    .from('credit_menu')
    .select('action_id, cost_low, cost_medium, cost_high, is_active, menu_version, deleted_at')
    .eq('action_id', actionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[admin-credit-menu] deactivate fetch error:', fetchError);
    return errorResponse('Failed to fetch entry', req, 500);
  }
  if (!current) {
    return errorResponse(`Action '${actionId}' not found`, req, 404);
  }
  if (current.deleted_at !== null) {
    return errorResponse(`Action '${actionId}' has been deleted`, req, 410);
  }
  if (!current.is_active) {
    return errorResponse(`Action '${actionId}' is already inactive`, req, 409);
  }

  const now = new Date().toISOString();
  const newVersion = (current.menu_version ?? 1) + 1;

  const { data, error } = await adminClient
    .from('credit_menu')
    .update({
      is_active: false,
      updated_at: now,
      updated_by: adminIdentifier,
      menu_version: newVersion,
    })
    .eq('action_id', actionId)
    .select(
      'action_id, display_name, description, category, unit, cost_low, cost_medium, cost_high, is_active, free_with_sub, is_flat_rate, menu_version, updated_at, updated_by'
    )
    .single();

  if (error) {
    console.error('[admin-credit-menu] deactivate error:', error);
    return errorResponse('Failed to deactivate entry', req, 500);
  }

  // History record for deactivation (non-fatal)
  try {
    await adminClient.from('credit_menu_history').insert({
      action_id: actionId,
      event_type: 'deactivated',
      prev_cost_low: current.cost_low,
      prev_cost_medium: current.cost_medium,
      prev_cost_high: current.cost_high,
      prev_is_active: true,
      new_cost_low: current.cost_low,
      new_cost_medium: current.cost_medium,
      new_cost_high: current.cost_high,
      new_is_active: false,
      menu_version: newVersion,
      reason: body.reason ?? 'Deactivated by admin',
      changed_by: adminIdentifier,
      changed_at: now,
    });
  } catch (histErr) {
    console.warn('[admin-credit-menu] history insert failed (non-fatal):', histErr);
  }

  return jsonResponse({ data, error: null }, req);
}

// ── Main entry point ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Authenticate + require platform admin
    const { userId, userEmail } = await requirePlatformAdmin(req, adminClient);
    const adminIdentifier = userEmail;

    // Parse path after /admin-credit-menu
    const url = new URL(req.url);
    // pathname looks like /admin-credit-menu, /admin-credit-menu/history, /admin-credit-menu/some_action_id/activate
    const pathParts = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(1); // drop the function name segment

    const method = req.method.toUpperCase();

    // Route: GET /
    if (method === 'GET' && pathParts.length === 0) {
      return await handleList(req, adminClient);
    }

    // Route: GET /history
    if (method === 'GET' && pathParts.length === 1 && pathParts[0] === 'history') {
      return await handleHistory(req, adminClient);
    }

    // Route: POST /
    if (method === 'POST' && pathParts.length === 0) {
      return await handleCreate(req, adminClient, adminIdentifier);
    }

    // Route: PUT /:action_id
    if (method === 'PUT' && pathParts.length === 1) {
      return await handleUpdate(req, adminClient, pathParts[0], adminIdentifier);
    }

    // Route: PATCH /:action_id/activate
    if (method === 'PATCH' && pathParts.length === 2 && pathParts[1] === 'activate') {
      return await handleActivate(req, adminClient, pathParts[0], adminIdentifier);
    }

    // Route: PATCH /:action_id/deactivate
    if (method === 'PATCH' && pathParts.length === 2 && pathParts[1] === 'deactivate') {
      return await handleDeactivate(req, adminClient, pathParts[0], adminIdentifier);
    }

    return errorResponse('Not found', req, 404);
  } catch (err) {
    const e = err as Error & { status?: number };
    const status = e.status ?? 500;
    console.error(`[admin-credit-menu] ${status} error:`, e.message);
    return jsonResponse(
      { data: null, error: { message: e.message, code: String(status) } },
      req,
      status
    );
  }
});
