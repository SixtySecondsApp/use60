import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { getAuthContext, requireOrgRole } from '../_shared/edgeAuth.ts';
import { getAgentConfig, invalidateConfigCache } from '../_shared/config/agentConfigEngine.ts';
import type { AgentType } from '../_shared/config/types.ts';

serve(async (req) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const authContext = await getAuthContext(req, supabase, serviceRoleKey);
    if (!authContext.userId) {
      return errorResponse('Unauthorized', req, 401);
    }

    const body = await req.json();
    const { action, ...params } = body;

    // -------------------------------------------------------------------------
    // get_config — any org member
    // -------------------------------------------------------------------------
    if (action === 'get_config') {
      const { org_id, agent_type, user_id } = params;
      if (!org_id || !agent_type) {
        return errorResponse('org_id and agent_type are required', req, 400);
      }

      // Verify caller is an org member (any role)
      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin', 'member', 'readonly']);

      const config = await getAgentConfig(
        serviceClient,
        org_id,
        user_id ?? null,
        agent_type as AgentType,
      );

      return jsonResponse({ config }, req);
    }

    // -------------------------------------------------------------------------
    // list_agent_types — any authenticated user
    // -------------------------------------------------------------------------
    if (action === 'list_agent_types') {
      const { data, error } = await serviceClient
        .from('agent_config_defaults')
        .select('agent_type')
        .order('agent_type');

      if (error) {
        console.error('[agent-config-admin] list_agent_types error:', error);
        return errorResponse('Failed to list agent types', req, 500);
      }

      const agent_types = [...new Set((data ?? []).map((r: { agent_type: string }) => r.agent_type))];
      return jsonResponse({ agent_types }, req);
    }

    // -------------------------------------------------------------------------
    // set_org_override — admin/owner
    // -------------------------------------------------------------------------
    if (action === 'set_org_override') {
      const { org_id, agent_type, config_key, config_value } = params;
      if (!org_id || !agent_type || !config_key || config_value === undefined) {
        return errorResponse('org_id, agent_type, config_key, and config_value are required', req, 400);
      }

      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin']);

      // Validate config_key exists in defaults for this agent_type
      const { data: defaultRow } = await serviceClient
        .from('agent_config_defaults')
        .select('config_key')
        .eq('agent_type', agent_type)
        .eq('config_key', config_key)
        .maybeSingle();

      if (!defaultRow) {
        return errorResponse(`Config key '${config_key}' not found for agent_type '${agent_type}'`, req, 400);
      }

      const { error } = await serviceClient
        .from('agent_config_org_overrides')
        .upsert(
          { org_id, agent_type, config_key, config_value, updated_at: new Date().toISOString() },
          { onConflict: 'org_id,agent_type,config_key' },
        );

      if (error) {
        console.error('[agent-config-admin] set_org_override error:', error);
        return errorResponse('Failed to set org override', req, 500);
      }

      invalidateConfigCache(org_id);
      return jsonResponse({ success: true, config_key, agent_type }, req);
    }

    // -------------------------------------------------------------------------
    // remove_org_override — admin/owner
    // -------------------------------------------------------------------------
    if (action === 'remove_org_override') {
      const { org_id, agent_type, config_key } = params;
      if (!org_id || !agent_type || !config_key) {
        return errorResponse('org_id, agent_type, and config_key are required', req, 400);
      }

      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin']);

      const { data, error } = await serviceClient
        .from('agent_config_org_overrides')
        .delete()
        .eq('org_id', org_id)
        .eq('agent_type', agent_type)
        .eq('config_key', config_key)
        .select('config_key');

      if (error) {
        console.error('[agent-config-admin] remove_org_override error:', error);
        return errorResponse('Failed to remove org override', req, 500);
      }

      invalidateConfigCache(org_id);
      return jsonResponse({ success: true, removed: (data ?? []).length > 0 }, req);
    }

    // -------------------------------------------------------------------------
    // set_user_override — self only
    // -------------------------------------------------------------------------
    if (action === 'set_user_override') {
      const { org_id, agent_type, config_key, config_value } = params;
      if (!org_id || !agent_type || !config_key || config_value === undefined) {
        return errorResponse('org_id, agent_type, config_key, and config_value are required', req, 400);
      }

      // Check key is user-overridable for this org + agent_type
      const { data: overridableRow } = await serviceClient
        .from('agent_config_user_overridable')
        .select('is_overridable')
        .eq('org_id', org_id)
        .eq('agent_type', agent_type)
        .eq('config_key', config_key)
        .maybeSingle();

      if (!overridableRow || !overridableRow.is_overridable) {
        return errorResponse('Config key is not user-overridable', req, 403);
      }

      const { error } = await serviceClient
        .from('agent_config_user_overrides')
        .upsert(
          {
            org_id,
            agent_type,
            config_key,
            config_value,
            user_id: authContext.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'org_id,agent_type,config_key,user_id' },
        );

      if (error) {
        console.error('[agent-config-admin] set_user_override error:', error);
        return errorResponse('Failed to set user override', req, 500);
      }

      invalidateConfigCache(org_id, authContext.userId);
      return jsonResponse({ success: true, config_key, agent_type }, req);
    }

    // -------------------------------------------------------------------------
    // remove_user_override — self only
    // -------------------------------------------------------------------------
    if (action === 'remove_user_override') {
      const { org_id, agent_type, config_key } = params;
      if (!org_id || !agent_type || !config_key) {
        return errorResponse('org_id, agent_type, and config_key are required', req, 400);
      }

      const { data, error } = await serviceClient
        .from('agent_config_user_overrides')
        .delete()
        .eq('org_id', org_id)
        .eq('agent_type', agent_type)
        .eq('config_key', config_key)
        .eq('user_id', authContext.userId)
        .select('config_key');

      if (error) {
        console.error('[agent-config-admin] remove_user_override error:', error);
        return errorResponse('Failed to remove user override', req, 500);
      }

      invalidateConfigCache(org_id, authContext.userId);
      return jsonResponse({ success: true, removed: (data ?? []).length > 0 }, req);
    }

    // -------------------------------------------------------------------------
    // set_overridable — admin/owner
    // -------------------------------------------------------------------------
    if (action === 'set_overridable') {
      const { org_id, agent_type, config_key, is_overridable } = params;
      if (!org_id || !agent_type || !config_key || typeof is_overridable !== 'boolean') {
        return errorResponse('org_id, agent_type, config_key, and is_overridable (boolean) are required', req, 400);
      }

      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin']);

      const { error } = await serviceClient
        .from('agent_config_user_overridable')
        .upsert(
          { org_id, agent_type, config_key, is_overridable, updated_at: new Date().toISOString() },
          { onConflict: 'org_id,agent_type,config_key' },
        );

      if (error) {
        console.error('[agent-config-admin] set_overridable error:', error);
        return errorResponse('Failed to set overridable flag', req, 500);
      }

      return jsonResponse({ success: true, config_key, is_overridable }, req);
    }

    // -------------------------------------------------------------------------
    // get_overridable_keys — any org member
    // -------------------------------------------------------------------------
    if (action === 'get_overridable_keys') {
      const { org_id, agent_type } = params;
      if (!org_id) {
        return errorResponse('org_id is required', req, 400);
      }

      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin', 'member', 'readonly']);

      let query = serviceClient
        .from('agent_config_user_overridable')
        .select('agent_type, config_key, is_overridable')
        .eq('org_id', org_id);

      if (agent_type) {
        query = query.eq('agent_type', agent_type);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[agent-config-admin] get_overridable_keys error:', error);
        return errorResponse('Failed to get overridable keys', req, 500);
      }

      return jsonResponse({ keys: data ?? [] }, req);
    }

    // -------------------------------------------------------------------------
    // get_methodologies — any authenticated user
    // -------------------------------------------------------------------------
    if (action === 'get_methodologies') {
      const { data, error } = await serviceClient
        .from('agent_methodology_templates')
        .select('id, methodology_key, name, description, qualification_criteria, stage_rules, coaching_focus')
        .eq('is_active', true);

      if (error) {
        console.error('[agent-config-admin] get_methodologies error:', error);
        return errorResponse('Failed to get methodologies', req, 500);
      }

      return jsonResponse({ methodologies: data ?? [] }, req);
    }

    // -------------------------------------------------------------------------
    // apply_methodology — admin/owner
    // -------------------------------------------------------------------------
    if (action === 'apply_methodology') {
      const { org_id, methodology_key } = params;
      if (!org_id || !methodology_key) {
        return errorResponse('org_id and methodology_key are required', req, 400);
      }

      await requireOrgRole(supabase, org_id, authContext.userId, ['owner', 'admin']);

      const { data, error } = await serviceClient.rpc('apply_methodology', {
        p_org_id: org_id,
        p_methodology_key: methodology_key,
        p_applied_by: authContext.userId,
      });

      if (error) {
        console.error('[agent-config-admin] apply_methodology RPC error:', error);
        return errorResponse('Failed to apply methodology', req, 500);
      }

      invalidateConfigCache(org_id);
      return jsonResponse({ success: true, methodology_key, keys_written: data ?? 0 }, req);
    }

    return errorResponse(`Unknown action: ${action}`, req, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return errorResponse(message, req, status);
  }
});
