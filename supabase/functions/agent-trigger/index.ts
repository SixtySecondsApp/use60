/**
 * Agent Trigger Edge Function
 *
 * Called when CRM events happen (deal_created, meeting_ended, etc.).
 * Queries active triggers for the event type and org, runs matching
 * specialist agents with event context, and stores results.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  getCorsHeaders,
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { runSpecialist } from '../_shared/agentSpecialist.ts';
import { getSpecialistConfig } from '../_shared/agentDefinitions.ts';
import { loadAgentTeamConfig } from '../_shared/agentConfig.ts';
import type { AgentName } from '../_shared/agentConfig.ts';

interface TriggerRequest {
  event: string;
  payload: Record<string, unknown>;
  organization_id: string;
  user_id: string;
}

interface TriggerRow {
  id: string;
  organization_id: string;
  trigger_event: string;
  agent_name: string;
  prompt_template: string;
}

const VALID_EVENTS = ['deal_created', 'meeting_ended', 'contact_imported', 'deal_stage_changed'];

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Auth: accept either cron secret (server-to-server) or JWT
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Missing Supabase configuration', req, 500);
    }

    if (!anthropicKey) {
      return errorResponse('Missing ANTHROPIC_API_KEY', req, 500);
    }

    // Verify auth: cron secret OR valid JWT
    const isCronAuth = cronSecret && providedSecret === cronSecret;
    if (!isCronAuth && !authHeader) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If JWT auth, validate the user
    if (!isCronAuth && authHeader) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
    }

    const body = (await req.json()) as TriggerRequest;
    const { event, payload, organization_id, user_id } = body;

    // Validate request
    if (!event || !organization_id || !user_id) {
      return errorResponse('Missing required fields: event, organization_id, user_id', req, 400);
    }

    if (!VALID_EVENTS.includes(event)) {
      return errorResponse(
        `Invalid event '${event}'. Valid events: ${VALID_EVENTS.join(', ')}`,
        req,
        400
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Fetch active triggers for this event and org
    const { data: triggers, error: triggerError } = await supabase
      .from('agent_triggers')
      .select('id, organization_id, trigger_event, agent_name, prompt_template')
      .eq('organization_id', organization_id)
      .eq('trigger_event', event)
      .eq('is_active', true);

    if (triggerError) {
      console.error('[agent-trigger] Failed to fetch triggers:', triggerError);
      return errorResponse('Failed to fetch triggers', req, 500);
    }

    if (!triggers || triggers.length === 0) {
      return jsonResponse(
        { success: true, message: `No active triggers for event '${event}'`, executed: 0 },
        req
      );
    }

    const results: Array<{ triggerId: string; agentName: string; success: boolean; error?: string }> = [];

    for (const trigger of triggers as TriggerRow[]) {
      try {
        // Load org config for model selection
        const teamConfig = await loadAgentTeamConfig(supabase, organization_id);
        const model = teamConfig?.worker_model || 'claude-haiku-4-5-20251001';

        // Validate agent name
        const validAgents: AgentName[] = ['pipeline', 'outreach', 'research'];
        if (!validAgents.includes(trigger.agent_name as AgentName)) {
          results.push({
            triggerId: trigger.id,
            agentName: trigger.agent_name,
            success: false,
            error: `Unknown agent: ${trigger.agent_name}`,
          });
          continue;
        }

        const agentName = trigger.agent_name as AgentName;

        // Check if agent is enabled for this org
        if (teamConfig && !teamConfig.enabled_agents.includes(agentName)) {
          results.push({
            triggerId: trigger.id,
            agentName,
            success: false,
            error: `Agent '${agentName}' is not enabled for this organization`,
          });
          continue;
        }

        const specialistConfig = getSpecialistConfig(agentName, model);

        // Build context from the event payload
        const context = [
          `Triggered by event: ${event}`,
          `Event payload: ${JSON.stringify(payload || {}, null, 2)}`,
          `Triggered at: ${new Date().toISOString()}`,
        ].join('\n');

        const result = await runSpecialist(
          specialistConfig,
          trigger.prompt_template,
          context,
          {
            anthropic,
            supabase,
            userId: user_id,
            orgId: organization_id,
          }
        );

        results.push({
          triggerId: trigger.id,
          agentName,
          success: true,
        });

        console.log(
          `[agent-trigger] Ran ${agentName} for event '${event}' in org ${organization_id}: ` +
          `${result.iterations} iterations, ${result.durationMs}ms`
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[agent-trigger] Error for trigger ${trigger.id}:`, errorMsg);
        results.push({
          triggerId: trigger.id,
          agentName: trigger.agent_name,
          success: false,
          error: errorMsg,
        });
      }
    }

    return jsonResponse(
      {
        success: true,
        event,
        executed: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
      req
    );
  } catch (error) {
    console.error('[agent-trigger] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});
