/**
 * Agent Scheduler Edge Function
 *
 * Called by pg_cron (or external cron) to run scheduled agent tasks.
 * Queries active schedules, runs matching specialist agents, and stores results.
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

interface ScheduleRow {
  id: string;
  organization_id: string;
  cron_expression: string;
  agent_name: string;
  prompt_template: string;
  delivery_channel: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    // Verify cron secret for automated invocations
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');

    if (cronSecret && providedSecret !== cronSecret) {
      return errorResponse('Unauthorized', req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Missing Supabase configuration', req, 500);
    }

    if (!anthropicKey) {
      return errorResponse('Missing ANTHROPIC_API_KEY', req, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Fetch all active schedules
    const { data: schedules, error: schedError } = await supabase
      .from('agent_schedules')
      .select('id, organization_id, cron_expression, agent_name, prompt_template, delivery_channel')
      .eq('is_active', true);

    if (schedError) {
      console.error('[agent-scheduler] Failed to fetch schedules:', schedError);
      return errorResponse('Failed to fetch schedules', req, 500);
    }

    if (!schedules || schedules.length === 0) {
      return jsonResponse({ success: true, message: 'No active schedules', executed: 0 }, req);
    }

    // Filter schedules whose cron matches the current time window
    const now = new Date();
    const matchingSchedules = (schedules as ScheduleRow[]).filter((s) =>
      cronMatchesNow(s.cron_expression, now)
    );

    if (matchingSchedules.length === 0) {
      return jsonResponse({ success: true, message: 'No schedules due', executed: 0 }, req);
    }

    const results: Array<{ scheduleId: string; agentName: string; success: boolean; error?: string }> = [];

    for (const schedule of matchingSchedules) {
      try {
        // Load org config for model selection
        const teamConfig = await loadAgentTeamConfig(supabase, schedule.organization_id);
        const model = teamConfig?.worker_model || 'claude-haiku-4-5-20251001';

        // Validate agent name
        const validAgents: AgentName[] = ['pipeline', 'outreach', 'research'];
        if (!validAgents.includes(schedule.agent_name as AgentName)) {
          results.push({
            scheduleId: schedule.id,
            agentName: schedule.agent_name,
            success: false,
            error: `Unknown agent: ${schedule.agent_name}`,
          });
          continue;
        }

        const agentName = schedule.agent_name as AgentName;

        // Check if agent is enabled for this org
        if (teamConfig && !teamConfig.enabled_agents.includes(agentName)) {
          results.push({
            scheduleId: schedule.id,
            agentName,
            success: false,
            error: `Agent '${agentName}' is not enabled for this organization`,
          });
          continue;
        }

        const specialistConfig = getSpecialistConfig(agentName, model);

        // Get an admin user for the org to run as (first admin member)
        const { data: adminMember } = await supabase
          .from('organization_memberships')
          .select('user_id')
          .eq('org_id', schedule.organization_id)
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();

        if (!adminMember) {
          results.push({
            scheduleId: schedule.id,
            agentName,
            success: false,
            error: 'No admin user found for organization',
          });
          continue;
        }

        const context = `Scheduled run at ${now.toISOString()}. Delivery channel: ${schedule.delivery_channel}.`;

        const result = await runSpecialist(
          specialistConfig,
          schedule.prompt_template,
          context,
          {
            anthropic,
            supabase,
            userId: adminMember.user_id,
            orgId: schedule.organization_id,
          }
        );

        // Update last_run_at
        await supabase
          .from('agent_schedules')
          .update({ last_run_at: now.toISOString() })
          .eq('id', schedule.id);

        results.push({
          scheduleId: schedule.id,
          agentName,
          success: true,
        });

        console.log(
          `[agent-scheduler] Ran ${agentName} for org ${schedule.organization_id}: ` +
          `${result.iterations} iterations, ${result.durationMs}ms`
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[agent-scheduler] Error for schedule ${schedule.id}:`, errorMsg);
        results.push({
          scheduleId: schedule.id,
          agentName: schedule.agent_name,
          success: false,
          error: errorMsg,
        });
      }
    }

    return jsonResponse(
      {
        success: true,
        executed: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
        timestamp: now.toISOString(),
      },
      req
    );
  } catch (error) {
    console.error('[agent-scheduler] Error:', error);
    return errorResponse((error as Error).message, req, 500);
  }
});

// =============================================================================
// Cron Matching Helper
// =============================================================================

/**
 * Check if a cron expression matches the current time (minute-level granularity).
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */
function cronMatchesNow(cronExpr: string, now: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteField, hourField, dayField, monthField, dowField] = parts;
  const minute = now.getUTCMinutes();
  const hour = now.getUTCHours();
  const day = now.getUTCDate();
  const month = now.getUTCMonth() + 1; // 1-based
  const dow = now.getUTCDay(); // 0=Sunday

  return (
    fieldMatches(minuteField, minute) &&
    fieldMatches(hourField, hour) &&
    fieldMatches(dayField, day) &&
    fieldMatches(monthField, month) &&
    fieldMatches(dowField, dow)
  );
}

/**
 * Check if a single cron field matches a value.
 * Supports: * (any), exact number, comma-separated, ranges (1-5), steps (star/N).
 */
function fieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;

  // Handle step (*/N)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Handle comma-separated values and ranges
  const parts = field.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) {
        return true;
      }
    } else {
      const exact = parseInt(part, 10);
      if (!isNaN(exact) && exact === value) {
        return true;
      }
    }
  }

  return false;
}
