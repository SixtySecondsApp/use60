/**
 * Agent Dead Letter Retry — Daily Cron
 *
 * Re-runs unresolved entries from agent_dead_letters (created in the last 24 hours,
 * resolved_at IS NULL). On success, sets resolved_at = NOW(). On repeated failure,
 * keeps the entry in the queue for manual investigation.
 *
 * Triggered by pg_cron (recommended: daily at 06:00 UTC).
 *
 * RETRY-003
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createLogger } from '../_shared/logger.ts';
import { runAgent } from '../_shared/agentRunner.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeadLetterRow {
  id: string;
  trace_id: string;
  agent_name: string;
  trigger_type: string;
  trigger_payload: Record<string, unknown>;
  failure_reason: string;
  error_detail: string | null;
  retry_count: number;
  created_at: string;
}

interface RetryStats {
  fetched: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retries per DLQ entry before it is left for manual investigation. */
const MAX_RETRY_ATTEMPTS = 3;

/** Look-back window: only process entries from the last 24 hours. */
const LOOK_BACK_HOURS = 24;

/** Batch size per cron invocation. */
const BATCH_LIMIT = 20;

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------

serve(async (req) => {
  const cors = getCorsHeaders(req);

  const preflight = handleCorsPreflightRequest(req);
  if (preflight) return preflight;

  const logger = createLogger('agent-dead-letter-retry');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    logger.error('config.missing', new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'), {});
    await logger.flush();
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  logger.info('cron.start', { batchLimit: BATCH_LIMIT, lookBackHours: LOOK_BACK_HOURS });

  const result = await runAgent(
    { agentName: 'agent-dead-letter-retry', userId: 'system', orgId: 'system' },
    async (ctx) => {
      const cutoff = new Date(Date.now() - LOOK_BACK_HOURS * 60 * 60 * 1000).toISOString();

      const { data: entries, error: fetchError } = await ctx.supabase
        .from('agent_dead_letters')
        .select('id, trace_id, agent_name, trigger_type, trigger_payload, failure_reason, error_detail, retry_count, created_at')
        .is('resolved_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(BATCH_LIMIT);

      if (fetchError) {
        throw new Error(`Failed to fetch dead letters: ${fetchError.message}`);
      }

      const rows = (entries ?? []) as DeadLetterRow[];
      ctx.logger.info('dlq.fetched', { count: rows.length });

      const stats: RetryStats = { fetched: rows.length, succeeded: 0, failed: 0, skipped: 0 };

      for (const row of rows) {
        // Skip entries that have already hit the retry ceiling — leave for manual review.
        if (row.retry_count >= MAX_RETRY_ATTEMPTS) {
          ctx.logger.warn('dlq.skip_max_retries', {
            id: row.id,
            agentName: row.agent_name,
            retryCount: row.retry_count,
          });
          stats.skipped++;
          continue;
        }

        ctx.logger.info('dlq.retry_attempt', {
          id: row.id,
          agentName: row.agent_name,
          triggerType: row.trigger_type,
          retryCount: row.retry_count,
        });

        try {
          // Re-fire through agent-orchestrator with an idempotency key so
          // duplicate deliveries are safe.
          const response = await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: row.trigger_type,
              source: 'cron:agent-dead-letter-retry',
              org_id: (row.trigger_payload as Record<string, unknown>).org_id ?? 'system',
              user_id: (row.trigger_payload as Record<string, unknown>).user_id ?? 'system',
              payload: row.trigger_payload,
              idempotency_key: `dlq:${row.id}:retry${row.retry_count + 1}`,
            }),
          });

          if (response.ok) {
            // Mark resolved
            await ctx.supabase
              .from('agent_dead_letters')
              .update({ resolved_at: new Date().toISOString() })
              .eq('id', row.id);

            ctx.logger.info('dlq.resolved', { id: row.id, agentName: row.agent_name });
            stats.succeeded++;
          } else {
            const body = await response.text().catch(() => '');
            // Increment retry_count; leave resolved_at NULL for next cron run.
            await ctx.supabase
              .from('agent_dead_letters')
              .update({ retry_count: row.retry_count + 1 })
              .eq('id', row.id);

            ctx.logger.warn('dlq.retry_failed', {
              id: row.id,
              agentName: row.agent_name,
              httpStatus: response.status,
              body: body.slice(0, 200),
            });
            stats.failed++;
          }
        } catch (retryErr) {
          // Network or unexpected error — increment count, leave in queue.
          await ctx.supabase
            .from('agent_dead_letters')
            .update({ retry_count: row.retry_count + 1 })
            .eq('id', row.id);

          ctx.logger.warn('dlq.retry_error', {
            id: row.id,
            agentName: row.agent_name,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
          stats.failed++;
        }
      }

      ctx.logger.info('dlq.complete', stats);
      return stats;
    },
  );

  await logger.flush();

  const status = result.success ? 200 : 500;
  return new Response(
    JSON.stringify({
      success: result.success,
      traceId: result.traceId,
      durationMs: result.durationMs,
      ...(result.data ?? {}),
      ...(result.error ? { error: result.error } : {}),
    }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
