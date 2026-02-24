// supabase/functions/fleet-health/index.ts
// Cron-invoked fleet health monitor (every 5 minutes).
//
// For each known agent, this function:
//   1. Queries agent_executions to compute health metrics over the last 24h
//   2. Determines status: healthy / warning / critical / stale
//   3. Writes a fleet_health_snapshots row
//   4. Fires Slack alerts (warning → #platform-ops, critical → @here)
//   5. Cleans up snapshots older than 30 days
//
// Deploy: npx supabase functions deploy fleet-health --project-ref <ref> --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createLogger } from '../_shared/logger.ts';

// ---------------------------------------------------------------------------
// Agent cadence configuration
// ---------------------------------------------------------------------------

interface AgentCadence {
  intervalMinutes: number;
  description: string;
}

const AGENT_CADENCES: Record<string, AgentCadence> = {
  'morning-briefing':  { intervalMinutes: 1440, description: 'Daily morning briefing' },
  'deal-risk-batch':   { intervalMinutes: 60,   description: 'Hourly deal risk scoring' },
  'pipeline-snapshot': { intervalMinutes: 1440, description: 'Daily pipeline snapshot' },
  'cc-enrich':         { intervalMinutes: 15,   description: '15-minute CC enrichment pipeline' },
  'eod-synthesis':     { intervalMinutes: 1440, description: 'End-of-day synthesis' },
  'reengagement-check':{ intervalMinutes: 360,  description: '6-hourly re-engagement check' },
};

// ---------------------------------------------------------------------------
// Health status thresholds
// ---------------------------------------------------------------------------

/** Failure rate above this triggers a warning. */
const WARNING_FAILURE_RATE = 10;
/** Failure rate above this triggers a critical alert. */
const CRITICAL_FAILURE_RATE = 30;
/** A 'running' row older than this many minutes is considered stuck. */
const STUCK_RUNNING_MINUTES = 10;
/** Multiplier on the cadence interval before an agent is considered stale. */
const STALE_CADENCE_MULTIPLIER = 2;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type HealthStatus = 'healthy' | 'warning' | 'critical' | 'stale';

interface AgentMetrics {
  lastSuccessAt: string | null;
  lastCompletedAt: string | null;
  failureRate24h: number | null;
  avgDurationMs: number | null;
  creditsConsumed24h: number | null;
  totalRuns24h: number;
  stuckRunningCount: number;
  dlqCount: number;
}

interface AgentHealthResult {
  agentName: string;
  status: HealthStatus;
  metrics: AgentMetrics;
  reasons: string[];
  alertsFired: number;
}

// ---------------------------------------------------------------------------
// Metric queries
// ---------------------------------------------------------------------------

async function fetchAgentMetrics(
  supabase: ReturnType<typeof createClient>,
  agentName: string,
): Promise<AgentMetrics> {
  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const stuckCutoff = new Date(now.getTime() - STUCK_RUNNING_MINUTES * 60 * 1000).toISOString();

  // Fetch last 24h executions for this agent
  const { data: runs, error: runsError } = await supabase
    .from('agent_executions')
    .select('status, started_at, completed_at, credits_consumed')
    .eq('agent_name', agentName)
    .gte('started_at', cutoff24h);

  if (runsError) {
    throw new Error(`Failed to fetch runs for ${agentName}: ${runsError.message}`);
  }

  const allRuns = runs ?? [];

  // Compute failure rate
  const terminalRuns = allRuns.filter(r => r.status !== 'running');
  const failedRuns = terminalRuns.filter(r => r.status === 'failed');
  const failureRate24h = terminalRuns.length > 0
    ? Math.round((failedRuns.length / terminalRuns.length) * 100 * 100) / 100
    : null;

  // Compute average duration (completed runs only)
  const completedRuns = terminalRuns.filter(r => r.status === 'completed' && r.completed_at);
  let avgDurationMs: number | null = null;
  if (completedRuns.length > 0) {
    const durations = completedRuns.map(r =>
      new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
    );
    avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  // Sum credits
  const creditsConsumed24h = allRuns.length > 0
    ? allRuns.reduce((sum, r) => sum + (Number(r.credits_consumed) || 0), 0)
    : null;

  // Last success
  const successRuns = allRuns.filter(r => r.status === 'completed' && r.completed_at);
  successRuns.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  const lastSuccessAt = successRuns[0]?.completed_at ?? null;

  // Last completed (any terminal state)
  const sortedTerminal = [...terminalRuns].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
  const lastCompletedAt = sortedTerminal[0]?.completed_at ?? null;

  // Stuck 'running' rows — started before the stuck threshold and still running
  const { count: stuckCount } = await supabase
    .from('agent_executions')
    .select('id', { count: 'exact', head: true })
    .eq('agent_name', agentName)
    .eq('status', 'running')
    .lt('started_at', stuckCutoff);

  // DLQ count for this agent (unresolved only)
  const { count: dlqCount } = await supabase
    .from('agent_dead_letters')
    .select('id', { count: 'exact', head: true })
    .eq('agent_name', agentName)
    .is('resolved_at', null);

  return {
    lastSuccessAt,
    lastCompletedAt,
    failureRate24h,
    avgDurationMs,
    creditsConsumed24h,
    totalRuns24h: allRuns.length,
    stuckRunningCount: stuckCount ?? 0,
    dlqCount: dlqCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Circuit breaker check
// ---------------------------------------------------------------------------

async function fetchOpenCircuitBreakers(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('model_health')
    .select('model_id')
    .eq('is_circuit_open', true);

  if (error) {
    console.warn('[fleet-health] Could not check circuit breakers:', error.message);
    return [];
  }

  return (data ?? []).map(r => r.model_id);
}

// ---------------------------------------------------------------------------
// Status determination
// ---------------------------------------------------------------------------

function determineStatus(
  cadence: AgentCadence,
  metrics: AgentMetrics,
  openCircuitBreakers: string[],
): { status: HealthStatus; reasons: string[] } {
  const reasons: string[] = [];
  let status: HealthStatus = 'healthy';

  const now = Date.now();
  const cadenceMs = cadence.intervalMinutes * 60 * 1000;
  const staleThresholdMs = cadenceMs * STALE_CADENCE_MULTIPLIER;

  // Check: no runs ever / agent has never run
  if (metrics.totalRuns24h === 0 && metrics.lastSuccessAt === null) {
    // Check if stale (missed 2× cadence windows) — use a wide window
    reasons.push('No executions recorded in 24h — agent may never have run');
    return { status: 'stale', reasons };
  }

  // Check: last success too long ago (stale)
  if (metrics.lastSuccessAt !== null) {
    const msSinceSuccess = now - new Date(metrics.lastSuccessAt).getTime();
    if (msSinceSuccess > staleThresholdMs) {
      const hoursSince = Math.round(msSinceSuccess / (60 * 60 * 1000));
      reasons.push(`No successful run in ${hoursSince}h (expected every ${cadence.intervalMinutes}m)`);
      status = 'stale';
    }
  }

  // Check: failure rate
  if (metrics.failureRate24h !== null) {
    if (metrics.failureRate24h >= CRITICAL_FAILURE_RATE) {
      reasons.push(`Critical failure rate: ${metrics.failureRate24h}% in 24h`);
      status = 'critical';
    } else if (metrics.failureRate24h >= WARNING_FAILURE_RATE) {
      reasons.push(`Elevated failure rate: ${metrics.failureRate24h}% in 24h`);
      if (status === 'healthy') status = 'warning';
    }
  }

  // Check: stuck 'running' executions
  if (metrics.stuckRunningCount > 0) {
    reasons.push(`${metrics.stuckRunningCount} execution(s) stuck in 'running' for >${STUCK_RUNNING_MINUTES}m`);
    status = 'critical';
  }

  // Check: DLQ items
  if (metrics.dlqCount > 5) {
    reasons.push(`DLQ has ${metrics.dlqCount} unresolved items`);
    status = 'critical';
  } else if (metrics.dlqCount > 0) {
    reasons.push(`DLQ has ${metrics.dlqCount} unresolved item(s)`);
    if (status === 'healthy') status = 'warning';
  }

  // Check: open circuit breakers (global — affects all agents)
  if (openCircuitBreakers.length > 0) {
    reasons.push(`Circuit breaker open for: ${openCircuitBreakers.join(', ')}`);
    if (status === 'healthy') status = 'warning';
  }

  return { status, reasons };
}

// ---------------------------------------------------------------------------
// Slack alerting
// ---------------------------------------------------------------------------

async function sendSlackAlert(
  webhookUrl: string,
  agentName: string,
  status: HealthStatus,
  reasons: string[],
  cadence: AgentCadence,
  metrics: AgentMetrics,
): Promise<void> {
  const isAtHere = status === 'critical';
  const statusEmoji = status === 'critical' ? ':red_circle:' : ':warning:';
  const prefix = isAtHere ? '<!here> ' : '';

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Fleet Health ${status === 'critical' ? 'CRITICAL' : 'WARNING'}: ${agentName}`,
        emoji: false,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${prefix}${statusEmoji} *${agentName}* is *${status.toUpperCase()}*\n_${cadence.description}_`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Last success:*\n${metrics.lastSuccessAt
            ? new Date(metrics.lastSuccessAt).toUTCString()
            : 'Never'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Failure rate (24h):*\n${metrics.failureRate24h !== null
            ? `${metrics.failureRate24h}%`
            : 'N/A'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Runs (24h):*\n${metrics.totalRuns24h}`,
        },
        {
          type: 'mrkdwn',
          text: `*DLQ items:*\n${metrics.dlqCount}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Issues detected:*\n${reasons.map(r => `• ${r}`).join('\n')}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `fleet-health cron | ${new Date().toUTCString()}`,
        },
      ],
    },
  ];

  const payload = {
    text: `${statusEmoji} Fleet health ${status}: ${agentName} — ${reasons[0] ?? 'check dashboard'}`,
    blocks,
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook returned ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const logger = createLogger('fleet-health');
  const runSpan = logger.createSpan('health_check_run');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const slackWebhookUrl =
    Deno.env.get('SLACK_PLATFORM_OPS_WEBHOOK') ||
    Deno.env.get('PLATFORM_ALERTS_SLACK_WEBHOOK') ||
    Deno.env.get('SLACK_WEBHOOK_URL');

  const results: AgentHealthResult[] = [];
  const snapshotRows: Record<string, unknown>[] = [];
  let totalAlertsFired = 0;
  const errors: Record<string, string> = {};

  try {
    logger.info('fleet_health_start', {
      agents: Object.keys(AGENT_CADENCES),
      has_slack_webhook: Boolean(slackWebhookUrl),
    });

    // Fetch open circuit breakers once (affects all agents)
    const openCircuitBreakers = await fetchOpenCircuitBreakers(supabase);

    // Evaluate each agent independently so one failure doesn't abort others
    for (const [agentName, cadence] of Object.entries(AGENT_CADENCES)) {
      const agentSpan = logger.createSpan(`check_${agentName}`, {}, runSpan.spanId);
      let alertsFired = 0;

      try {
        const metrics = await fetchAgentMetrics(supabase, agentName);
        const { status, reasons } = determineStatus(cadence, metrics, openCircuitBreakers);

        // Fire Slack alerts for non-healthy agents
        if (slackWebhookUrl && (status === 'warning' || status === 'critical')) {
          try {
            await sendSlackAlert(slackWebhookUrl, agentName, status, reasons, cadence, metrics);
            alertsFired++;
            totalAlertsFired++;
          } catch (slackErr) {
            const msg = slackErr instanceof Error ? slackErr.message : String(slackErr);
            logger.warn('slack_alert_failed', { agent_name: agentName, error: msg });
            console.warn(`[fleet-health] Slack alert failed for ${agentName}:`, msg);
          }
        }

        results.push({ agentName, status, metrics, reasons, alertsFired });

        snapshotRows.push({
          snapshot_at: new Date().toISOString(),
          agent_name: agentName,
          status,
          last_success_at: metrics.lastSuccessAt,
          failure_rate_24h: metrics.failureRate24h,
          avg_duration_ms: metrics.avgDurationMs,
          credits_consumed_24h: metrics.creditsConsumed24h,
          alerts_fired: alertsFired,
          metadata: {
            reasons,
            cadence_minutes: cadence.intervalMinutes,
            total_runs_24h: metrics.totalRuns24h,
            stuck_running_count: metrics.stuckRunningCount,
            dlq_count: metrics.dlqCount,
            open_circuit_breakers: openCircuitBreakers,
          },
        });

        agentSpan.stop({
          agent_name: agentName,
          status,
          reasons_count: reasons.length,
          alerts_fired: alertsFired,
        });
      } catch (agentErr) {
        const msg = agentErr instanceof Error ? agentErr.message : String(agentErr);
        errors[agentName] = msg;
        logger.error(`check_${agentName}_failed`, agentErr, { agent_name: agentName });
        agentSpan.stop({ agent_name: agentName, error: msg });

        // Insert a critical snapshot so the gap is visible in dashboards
        snapshotRows.push({
          snapshot_at: new Date().toISOString(),
          agent_name: agentName,
          status: 'critical',
          last_success_at: null,
          failure_rate_24h: null,
          avg_duration_ms: null,
          credits_consumed_24h: null,
          alerts_fired: 0,
          metadata: { error: msg, check_failed: true },
        });
      }
    }

    // Batch-insert all snapshot rows
    if (snapshotRows.length > 0) {
      const { error: insertError } = await supabase
        .from('fleet_health_snapshots')
        .insert(snapshotRows);

      if (insertError) {
        logger.warn('snapshot_insert_failed', { error: insertError.message });
        console.warn('[fleet-health] Failed to insert snapshots:', insertError.message);
      }
    }

    // Cleanup old snapshots (best-effort)
    try {
      await supabase.rpc('cleanup_fleet_health_snapshots');
    } catch (cleanupErr) {
      console.warn('[fleet-health] Cleanup failed (non-fatal):', cleanupErr);
    }

    const summary = results.reduce<Record<HealthStatus, number>>(
      (acc, r) => { acc[r.status]++; return acc; },
      { healthy: 0, warning: 0, critical: 0, stale: 0 },
    );

    runSpan.stop({
      agents_checked: results.length,
      agents_healthy: summary.healthy,
      agents_warning: summary.warning,
      agents_critical: summary.critical,
      agents_stale: summary.stale,
      total_alerts_fired: totalAlertsFired,
      errors_count: Object.keys(errors).length,
    });

    await logger.flush();

    const responseBody = {
      ok: Object.keys(errors).length === 0,
      checked_at: new Date().toISOString(),
      summary,
      agents: results.map(r => ({
        name: r.agentName,
        status: r.status,
        reasons: r.reasons,
        last_success_at: r.metrics.lastSuccessAt,
        failure_rate_24h: r.metrics.failureRate24h,
        alerts_fired: r.alertsFired,
      })),
      total_alerts_fired: totalAlertsFired,
      ...(Object.keys(errors).length > 0 && { errors }),
    };

    return new Response(JSON.stringify(responseBody), {
      status: Object.keys(errors).length > 0 ? 207 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (fatalErr) {
    const errorMessage = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    logger.error('fleet_health_fatal', fatalErr);

    try {
      runSpan.stop({ status: 'fatal', error: errorMessage });
      await logger.flush();
    } catch {
      // swallow flush errors
    }

    console.error('[fleet-health] Fatal error:', errorMessage);

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
