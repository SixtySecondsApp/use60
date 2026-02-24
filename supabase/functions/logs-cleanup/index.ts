// supabase/functions/logs-cleanup/index.ts
// Nightly cron job that purges old system_logs entries by level:
//   debug  → older than 30 days
//   info   → older than 90 days
//   warn   → older than 90 days
//   error  → older than 365 days
//
// Self-dogfoods by logging its own execution via logger.ts.
// Deploy: npx supabase functions deploy logs-cleanup --project-ref <ref> --no-verify-jwt

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/corsHelper.ts';
import { createLogger } from '../_shared/logger.ts';

// ---------------------------------------------------------------------------
// Retention configuration (days)
// ---------------------------------------------------------------------------

const RETENTION: Record<string, number> = {
  debug: 30,
  info: 90,
  warn: 90,
  error: 365,
};

// ---------------------------------------------------------------------------
// Helper: delete rows for a single level older than `cutoffDate`
// Returns the number of rows deleted.
// ---------------------------------------------------------------------------

async function deleteLevel(
  supabase: ReturnType<typeof createClient>,
  level: string,
  cutoffDate: Date,
): Promise<number> {
  const cutoffIso = cutoffDate.toISOString();

  // `.select()` with `{ count: 'exact', head: true }` before delete would require
  // an extra round-trip. Instead, we fetch the count of rows that will be deleted
  // in a single DELETE … RETURNING * query via an RPC, or use the Supabase client
  // pattern of chaining `.select('id', { count: 'exact' })` on the delete.
  //
  // The Supabase PostgREST client returns Prefer: count=exact when you call
  // `.select(..., { count: 'exact' })`, but `.delete()` does not support `.select()`
  // in older PostgREST versions. We work around this by first counting then deleting,
  // which is acceptable for a nightly maintenance job where atomicity is not critical.

  // Step 1: count rows to be deleted
  const { count, error: countErr } = await supabase
    .from('system_logs')
    .select('id', { count: 'exact', head: true })
    .eq('level', level)
    .lt('timestamp', cutoffIso);

  if (countErr) {
    throw new Error(`Count failed for level=${level}: ${countErr.message}`);
  }

  const rowsToDelete = count ?? 0;
  if (rowsToDelete === 0) {
    return 0;
  }

  // Step 2: delete the rows
  const { error: delErr } = await supabase
    .from('system_logs')
    .delete()
    .eq('level', level)
    .lt('timestamp', cutoffIso);

  if (delErr) {
    throw new Error(`Delete failed for level=${level}: ${delErr.message}`);
  }

  return rowsToDelete;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  const corsHeaders = getCorsHeaders(req);

  // This function is invoked either by the Supabase cron scheduler or manually
  // (e.g. for testing). Both POST and GET are acceptable.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const logger = createLogger({ service: 'logs-cleanup' });
  const runSpan = logger.createSpan('cleanup_run');

  try {
    // Service role client — needed to delete rows across all users/orgs
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    logger.info('cleanup_start', {
      retention_days: RETENTION,
      initiated_at: new Date().toISOString(),
    });

    const now = new Date();
    const deletedCounts: Record<string, number> = {};
    const errors: Record<string, string> = {};

    // Process each level independently so a failure in one doesn't abort others
    for (const [level, retentionDays] of Object.entries(RETENTION)) {
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

      const levelSpan = logger.createSpan(`delete_${level}`, 'info', runSpan.spanId);
      try {
        const deleted = await deleteLevel(supabase, level, cutoff);
        deletedCounts[level] = deleted;

        await levelSpan.stop({
          level,
          retention_days: retentionDays,
          cutoff_date: cutoff.toISOString(),
          rows_deleted: deleted,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors[level] = msg;
        deletedCounts[level] = 0;

        // Log at warn so the span still records even on partial failure
        logger.warn(`delete_${level}_failed`, {
          level,
          error: msg,
        }, runSpan.spanId);

        await levelSpan.stop({ level, error: msg, rows_deleted: 0 });
      }
    }

    const totalDeleted = Object.values(deletedCounts).reduce((sum, n) => sum + n, 0);
    const hasErrors = Object.keys(errors).length > 0;

    // Final summary span
    await runSpan.stop({
      deleted_counts: deletedCounts,
      total_deleted: totalDeleted,
      partial_errors: hasErrors ? errors : undefined,
      status: hasErrors ? 'partial' : 'ok',
    });

    // Flush all buffered log entries before responding
    await logger.flush();

    const responseBody = {
      ok: !hasErrors,
      status: hasErrors ? 'partial' : 'ok',
      deleted_counts: deletedCounts,
      total_deleted: totalDeleted,
      ...(hasErrors && { errors }),
    };

    return new Response(JSON.stringify(responseBody), {
      status: hasErrors ? 207 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Best-effort error log — may fail if supabase env vars are missing
    logger.error('cleanup_fatal', errorMessage, {
      stack: err instanceof Error ? err.stack : undefined,
    });

    try {
      await runSpan.stop({ status: 'fatal', error: errorMessage });
      await logger.flush();
    } catch {
      // Swallow flush errors so we always return a response
    }

    console.error('[logs-cleanup] Fatal error:', errorMessage);

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
