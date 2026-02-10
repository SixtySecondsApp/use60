/**
 * Agent Scheduler Edge Function
 *
 * Called by pg_cron (or external cron) to run scheduled agent tasks.
 * Queries active schedules, matches cron expressions to the current time,
 * runs specialist agents, and delivers results via configured channels.
 *
 * Delivery channels:
 *   - in_app: stores result as a copilot_notification
 *   - slack: sends result via send_notification action
 *   - email: placeholder (logs for now)
 *
 * Pre-built schedule templates:
 *   - Morning pipeline brief (pipeline agent, 9am daily)
 *   - Follow-up check (outreach agent, 2pm daily)
 *   - Weekly pipeline review (pipeline agent, Monday 9am)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  handleCorsPreflightRequest,
  jsonResponse,
  errorResponse,
} from '../_shared/corsHelper.ts';
import { runSpecialist } from '../_shared/agentSpecialist.ts';
import { getSpecialistConfig } from '../_shared/agentDefinitions.ts';
import { loadAgentTeamConfig } from '../_shared/agentConfig.ts';
import type { AgentName } from '../_shared/agentConfig.ts';
import { checkAgentBudget } from '../_shared/costTracking.ts';
import { verifyCronSecret } from '../_shared/edgeAuth.ts';

// =============================================================================
// Types
// =============================================================================

interface ScheduleRow {
  id: string;
  organization_id: string;
  cron_expression: string;
  agent_name: string;
  prompt_template: string;
  delivery_channel: string;
  last_run_at: string | null;
}

interface RunResult {
  scheduleId: string;
  agentName: string;
  success: boolean;
  delivered: boolean;
  error?: string;
  durationMs?: number;
  responseText?: string;
}

// =============================================================================
// All valid agent names (must match agentDefinitions registry)
// =============================================================================

const VALID_AGENTS: AgentName[] = [
  'pipeline', 'outreach', 'research', 'crm_ops', 'meetings', 'prospecting',
];

// =============================================================================
// Pre-Built Schedule Templates
// =============================================================================

export const SCHEDULE_TEMPLATES = [
  {
    key: 'morning_pipeline_brief',
    label: 'Morning Pipeline Brief',
    agent_name: 'pipeline' as AgentName,
    cron_expression: '0 14 * * 1-5', // 9am EST (14:00 UTC), weekdays
    prompt_template:
      'Give me a concise morning pipeline brief: top deals closing this week, any at-risk deals needing attention, and key follow-ups due today. Format as a quick-scan summary I can read in 2 minutes.',
    delivery_channel: 'in_app',
  },
  {
    key: 'afternoon_followup_check',
    label: 'Afternoon Follow-up Check',
    agent_name: 'outreach' as AgentName,
    cron_expression: '0 19 * * 1-5', // 2pm EST (19:00 UTC), weekdays
    prompt_template:
      'Check for contacts needing follow-up (no contact in 7+ days with active deals). Draft brief follow-up suggestions for the top 3 most urgent.',
    delivery_channel: 'in_app',
  },
  {
    key: 'weekly_pipeline_review',
    label: 'Weekly Pipeline Review',
    agent_name: 'pipeline' as AgentName,
    cron_expression: '0 14 * * 1', // Monday 9am EST (14:00 UTC)
    prompt_template:
      'Prepare a weekly pipeline review: pipeline summary with week-over-week changes, forecast update, deals that moved stages, stale deals (14+ days no activity), and recommended actions for the week ahead.',
    delivery_channel: 'in_app',
  },
] as const;

// =============================================================================
// Result Delivery
// =============================================================================

type SupabaseClient = ReturnType<typeof createClient>;

async function deliverResult(
  supabase: SupabaseClient,
  schedule: ScheduleRow,
  userId: string,
  responseText: string,
  agentName: string
): Promise<boolean> {
  const channel = schedule.delivery_channel || 'in_app';

  try {
    if (channel === 'in_app') {
      // Store as an in-app notification
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        organization_id: schedule.organization_id,
        type: 'agent_scheduled_run',
        title: `Scheduled ${agentName} report`,
        body: responseText.slice(0, 2000),
        metadata: {
          schedule_id: schedule.id,
          agent_name: agentName,
          full_response: responseText,
        },
      });

      if (error) {
        // Table may not exist yet — log and continue
        if (error.message.includes('relation') || error.message.includes('does not exist')) {
          console.warn('[agent-scheduler] notifications table not found, storing in agent_schedule_runs only');
          return false;
        }
        console.error('[agent-scheduler] Notification insert error:', error);
        return false;
      }
      return true;
    }

    if (channel === 'slack') {
      // Send via Slack using the internal function
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

      const slackResponse = await fetch(`${supabaseUrl}/functions/v1/slack-send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          'x-internal-call': 'true',
        },
        body: JSON.stringify({
          organization_id: schedule.organization_id,
          message: `*Scheduled ${agentName} Report*\n\n${responseText.slice(0, 3000)}`,
        }),
      });

      if (!slackResponse.ok) {
        console.error('[agent-scheduler] Slack delivery failed:', slackResponse.status);
        return false;
      }
      return true;
    }

    if (channel === 'email') {
      // Email delivery is a placeholder — log for now
      console.log(`[agent-scheduler] Email delivery not yet implemented for schedule ${schedule.id}`);
      return false;
    }

    console.warn(`[agent-scheduler] Unknown delivery channel: ${channel}`);
    return false;
  } catch (err) {
    console.error('[agent-scheduler] Delivery error:', err);
    return false;
  }
}

// =============================================================================
// Run Logging
// =============================================================================

async function logScheduleRun(
  supabase: SupabaseClient,
  schedule: ScheduleRow,
  userId: string,
  success: boolean,
  responseText: string,
  delivered: boolean,
  durationMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    await supabase.from('agent_schedule_runs').insert({
      schedule_id: schedule.id,
      organization_id: schedule.organization_id,
      agent_name: schedule.agent_name,
      user_id: userId,
      success,
      response_text: responseText.slice(0, 5000),
      delivery_channel: schedule.delivery_channel,
      delivered,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    });
  } catch {
    // Non-fatal — table may not exist
    console.warn('[agent-scheduler] Failed to log schedule run (table may not exist)');
  }
}

// =============================================================================
// Main Handler
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse('Missing Supabase configuration', req, 500);
    }

    if (!anthropicKey) {
      return errorResponse('Missing ANTHROPIC_API_KEY', req, 500);
    }

    // Determine auth mode: cron secret (constant-time, fail-closed) or JWT (manual "Run Now")
    const isCronAuth = verifyCronSecret(req, Deno.env.get('CRON_SECRET'));

    // Parse body for manual mode
    let body: { schedule_id?: string } = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // Empty body is fine for cron mode
      }
    }

    const isManualRun = !!body.schedule_id;

    // For manual runs, validate JWT and check org admin
    let callerUserId: string | null = null;
    if (!isCronAuth) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return errorResponse('Unauthorized', req, 401);
      }

      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return errorResponse('Unauthorized', req, 401);
      }
      callerUserId = user.id;
    }

    if (!isCronAuth && !isManualRun) {
      return errorResponse('Unauthorized: cron secret or schedule_id required', req, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const now = new Date();

    let schedulesToRun: ScheduleRow[];

    if (isManualRun) {
      // Manual mode: fetch the specific schedule by ID
      const { data: schedule, error: schedError } = await supabase
        .from('agent_schedules')
        .select('id, organization_id, cron_expression, agent_name, prompt_template, delivery_channel, last_run_at')
        .eq('id', body.schedule_id!)
        .maybeSingle();

      if (schedError || !schedule) {
        return errorResponse('Schedule not found', req, 404);
      }

      // Verify the caller has admin access to this org
      if (callerUserId) {
        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('role')
          .eq('org_id', (schedule as ScheduleRow).organization_id)
          .eq('user_id', callerUserId)
          .eq('role', 'admin')
          .maybeSingle();

        if (!membership) {
          return errorResponse('Unauthorized: admin access required', req, 403);
        }
      }

      schedulesToRun = [schedule as ScheduleRow];
    } else {
      // Cron mode: fetch all active schedules matching current time
      const { data: schedules, error: schedError } = await supabase
        .from('agent_schedules')
        .select('id, organization_id, cron_expression, agent_name, prompt_template, delivery_channel, last_run_at')
        .eq('is_active', true);

      if (schedError) {
        if (schedError.message.includes('relation') || schedError.message.includes('does not exist')) {
          return jsonResponse({ success: true, message: 'agent_schedules table not found', executed: 0 }, req);
        }
        console.error('[agent-scheduler] Failed to fetch schedules:', schedError);
        return errorResponse('Failed to fetch schedules', req, 500);
      }

      if (!schedules || schedules.length === 0) {
        return jsonResponse({ success: true, message: 'No active schedules', executed: 0 }, req);
      }

      schedulesToRun = (schedules as ScheduleRow[]).filter((s) =>
        cronMatchesNow(s.cron_expression, now)
      );

      if (schedulesToRun.length === 0) {
        return jsonResponse({ success: true, message: 'No schedules due', executed: 0 }, req);
      }
    }

    console.log(`[agent-scheduler] ${schedulesToRun.length} schedule(s) to run (mode=${isManualRun ? 'manual' : 'cron'})`);

    const results: RunResult[] = [];

    for (const schedule of schedulesToRun) {
      const runStart = Date.now();

      try {
        // Validate agent name
        if (!VALID_AGENTS.includes(schedule.agent_name as AgentName)) {
          results.push({
            scheduleId: schedule.id,
            agentName: schedule.agent_name,
            success: false,
            delivered: false,
            error: `Unknown agent: ${schedule.agent_name}`,
          });
          continue;
        }

        const agentName = schedule.agent_name as AgentName;

        // Load org config for model selection (always returns a config per INT-001)
        const teamConfig = await loadAgentTeamConfig(supabase, schedule.organization_id);

        // Check if agent is enabled for this org
        if (!teamConfig.enabled_agents.includes(agentName)) {
          results.push({
            scheduleId: schedule.id,
            agentName,
            success: false,
            delivered: false,
            error: `Agent '${agentName}' is not enabled for this organization`,
          });
          continue;
        }

        // Check daily budget before running
        const budgetCheck = await checkAgentBudget(
          supabase,
          schedule.organization_id,
          teamConfig.budget_limit_daily_usd
        );

        if (!budgetCheck.allowed) {
          console.log(`[agent-scheduler] Budget exceeded for org ${schedule.organization_id}, skipping schedule ${schedule.id}`);
          results.push({
            scheduleId: schedule.id,
            agentName,
            success: false,
            delivered: false,
            error: budgetCheck.message || 'Daily budget exceeded',
          });
          continue;
        }

        const specialistConfig = getSpecialistConfig(agentName, teamConfig.worker_model);

        // For manual runs use the caller; for cron, find an org admin
        let runAsUserId = callerUserId;
        if (!runAsUserId) {
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
              delivered: false,
              error: 'No admin user found for organization',
            });
            continue;
          }
          runAsUserId = adminMember.user_id;
        }

        const runType = isManualRun ? 'Manual run' : 'Scheduled run';
        const context = `${runType} at ${now.toISOString()}. This is an automated ${isManualRun ? 'on-demand' : 'scheduled'} report — be comprehensive but concise.`;

        const result = await runSpecialist(
          specialistConfig,
          schedule.prompt_template,
          context,
          {
            anthropic,
            supabase,
            userId: runAsUserId,
            orgId: schedule.organization_id,
          }
        );

        const durationMs = Date.now() - runStart;

        // Deliver result via configured channel
        const delivered = await deliverResult(
          supabase,
          schedule,
          runAsUserId,
          result.responseText,
          agentName
        );

        // Update last_run_at
        await supabase
          .from('agent_schedules')
          .update({ last_run_at: now.toISOString() })
          .eq('id', schedule.id);

        // Log the run
        await logScheduleRun(
          supabase,
          schedule,
          runAsUserId,
          true,
          result.responseText,
          delivered,
          durationMs
        );

        results.push({
          scheduleId: schedule.id,
          agentName,
          success: true,
          delivered,
          durationMs,
          responseText: isManualRun ? result.responseText?.slice(0, 2000) : undefined,
        });

        console.log(
          `[agent-scheduler] Ran ${agentName} for org ${schedule.organization_id}: ` +
          `${result.iterations} iterations, ${durationMs}ms, delivered=${delivered}`
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - runStart;
        console.error(`[agent-scheduler] Error for schedule ${schedule.id}:`, errorMsg);

        // Log failed run
        await logScheduleRun(
          supabase,
          schedule,
          callerUserId || '',
          false,
          '',
          false,
          durationMs,
          errorMsg
        );

        results.push({
          scheduleId: schedule.id,
          agentName: schedule.agent_name,
          success: false,
          delivered: false,
          error: errorMsg,
        });
      }
    }

    return jsonResponse(
      {
        success: true,
        mode: isManualRun ? 'manual' : 'cron',
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
 * Uses a +-5 minute window to account for cron invocation drift.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */
function cronMatchesNow(cronExpr: string, now: Date): boolean {
  // Check current minute and the surrounding 5-minute window
  for (let offset = -5; offset <= 5; offset++) {
    const checkTime = new Date(now.getTime() + offset * 60 * 1000);
    if (cronMatchesExact(cronExpr, checkTime)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a cron expression matches exactly at the given time.
 */
function cronMatchesExact(cronExpr: string, time: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteField, hourField, dayField, monthField, dowField] = parts;
  const minute = time.getUTCMinutes();
  const hour = time.getUTCHours();
  const day = time.getUTCDate();
  const month = time.getUTCMonth() + 1; // 1-based
  const dow = time.getUTCDay(); // 0=Sunday

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
 * Supports: * (any), exact number, comma-separated, ranges (1-5), steps (N).
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
