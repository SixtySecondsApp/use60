// supabase/functions/purge-credit-logs/index.ts
// Internal cron function: purges credit_logs older than 45 days,
// aggregating them into credit_log_summaries, and purges expired price_snapshots.
// Deploy with --no-verify-jwt. Auth is via X-Cron-Secret header.

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
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

interface CreditLogRow {
  user_id: string;
  org_id: string;
  action_id: string | null;
  credits_charged: number;
  created_at: string;
  status: string;
}

interface MenuRow {
  action_id: string;
  category: string;
}

interface SummaryKey {
  user_id: string;
  org_id: string;
  month: string; // YYYY-MM-DD (first of month)
  category: string;
}

interface SummaryAccumulator {
  total_credits: number;
  action_count: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) return preflightResponse;

  // Validate cron secret — no JWT expected from scheduler
  const cronSecret = req.headers.get('X-Cron-Secret');
  if (!CRON_SECRET || cronSecret !== CRON_SECRET) {
    return errorResponse('Unauthorized', req, 401);
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', req, 405);
  }

  const ranAt = new Date().toISOString();

  // Service role client — reads/writes/deletes across all users
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Cutoff: 45 days ago
  const cutoffDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  let purgedLogs = 0;
  let purgedSnapshots = 0;
  let summariesWritten = 0;
  const errors: string[] = [];

  // ---------------------------------------------------------------------------
  // STEP 1: Fetch completed logs older than 45 days
  // ---------------------------------------------------------------------------
  let toPurge: CreditLogRow[] = [];
  try {
    const { data, error } = await adminClient
      .from('credit_logs')
      .select('user_id, org_id, action_id, credits_charged, created_at, status')
      .lt('created_at', cutoffDate.toISOString())
      .eq('status', 'completed');

    if (error) {
      console.error('[purge-credit-logs] Step 1 fetch error:', error);
      errors.push(`fetch_logs: ${error.message}`);
    } else {
      toPurge = data ?? [];
      console.log(`[purge-credit-logs] Found ${toPurge.length} logs to purge`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[purge-credit-logs] Step 1 exception:', msg);
    errors.push(`fetch_logs: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Fetch credit_menu for category mapping
  // ---------------------------------------------------------------------------
  let categoryMap: Record<string, string> = {};
  try {
    const { data: menuItems, error } = await adminClient
      .from('credit_menu')
      .select('action_id, category');

    if (error) {
      console.error('[purge-credit-logs] Step 2 menu fetch error:', error);
      errors.push(`fetch_menu: ${error.message}`);
    } else {
      categoryMap = Object.fromEntries(
        (menuItems ?? []).map((m: MenuRow) => [m.action_id, m.category])
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[purge-credit-logs] Step 2 exception:', msg);
    errors.push(`fetch_menu: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Aggregate in TypeScript by (user_id, org_id, month, category)
  //         then upsert into credit_log_summaries
  // ---------------------------------------------------------------------------
  if (toPurge.length > 0) {
    try {
      // Aggregate
      const summaryMap = new Map<string, SummaryAccumulator & SummaryKey>();

      for (const log of toPurge) {
        const date = new Date(log.created_at);
        // First day of the month in YYYY-MM-DD
        const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
        const category = (log.action_id && categoryMap[log.action_id]) || 'unknown';
        const mapKey = `${log.user_id}|${log.org_id}|${month}|${category}`;

        const existing = summaryMap.get(mapKey);
        if (existing) {
          existing.total_credits += log.credits_charged ?? 0;
          existing.action_count += 1;
        } else {
          summaryMap.set(mapKey, {
            user_id: log.user_id,
            org_id: log.org_id,
            month,
            category,
            total_credits: log.credits_charged ?? 0,
            action_count: 1,
          });
        }
      }

      // For each aggregated group, read-modify-write to avoid overwriting
      // previous summaries that may already exist for the same (org, user, month, category)
      const summaryEntries = Array.from(summaryMap.values());

      for (const entry of summaryEntries) {
        try {
          // Check if a summary row already exists
          const { data: existing, error: fetchErr } = await adminClient
            .from('credit_log_summaries')
            .select('id, total_credits, action_count')
            .eq('org_id', entry.org_id)
            .eq('user_id', entry.user_id)
            .eq('month', entry.month)
            .eq('category', entry.category)
            .maybeSingle();

          if (fetchErr) {
            console.error('[purge-credit-logs] Summary fetch error:', fetchErr);
            errors.push(`summary_fetch: ${fetchErr.message}`);
            continue;
          }

          if (existing) {
            // Increment existing summary
            const { error: updateErr } = await adminClient
              .from('credit_log_summaries')
              .update({
                total_credits: (existing.total_credits ?? 0) + entry.total_credits,
                action_count: (existing.action_count ?? 0) + entry.action_count,
              })
              .eq('id', existing.id);

            if (updateErr) {
              console.error('[purge-credit-logs] Summary update error:', updateErr);
              errors.push(`summary_update: ${updateErr.message}`);
              continue;
            }
          } else {
            // Insert new summary row
            const { error: insertErr } = await adminClient
              .from('credit_log_summaries')
              .insert({
                user_id: entry.user_id,
                org_id: entry.org_id,
                month: entry.month,
                category: entry.category,
                total_credits: entry.total_credits,
                action_count: entry.action_count,
              });

            if (insertErr) {
              console.error('[purge-credit-logs] Summary insert error:', insertErr);
              errors.push(`summary_insert: ${insertErr.message}`);
              continue;
            }
          }

          summariesWritten += 1;
        } catch (entryErr) {
          const msg = entryErr instanceof Error ? entryErr.message : String(entryErr);
          console.error('[purge-credit-logs] Summary entry exception:', msg);
          errors.push(`summary_entry: ${msg}`);
        }
      }

      console.log(`[purge-credit-logs] Wrote ${summariesWritten} summary rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[purge-credit-logs] Step 3 exception:', msg);
      errors.push(`aggregate_summaries: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Delete purged logs
  // ---------------------------------------------------------------------------
  try {
    const { count, error } = await adminClient
      .from('credit_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString())
      .eq('status', 'completed');

    if (error) {
      console.error('[purge-credit-logs] Step 4 delete error:', error);
      errors.push(`delete_logs: ${error.message}`);
    } else {
      purgedLogs = count ?? 0;
      console.log(`[purge-credit-logs] Deleted ${purgedLogs} credit log rows`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[purge-credit-logs] Step 4 exception:', msg);
    errors.push(`delete_logs: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Purge expired price_snapshots
  // ---------------------------------------------------------------------------
  try {
    const { count, error } = await adminClient
      .from('price_snapshots')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('[purge-credit-logs] Step 5 snapshot delete error:', error);
      errors.push(`delete_snapshots: ${error.message}`);
    } else {
      purgedSnapshots = count ?? 0;
      console.log(`[purge-credit-logs] Deleted ${purgedSnapshots} expired price snapshot rows`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[purge-credit-logs] Step 5 exception:', msg);
    errors.push(`delete_snapshots: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Return result
  // ---------------------------------------------------------------------------
  const result = {
    purged_logs: purgedLogs,
    purged_snapshots: purgedSnapshots,
    summaries_written: summariesWritten,
    ran_at: ranAt,
    ...(errors.length > 0 ? { errors } : {}),
  };

  console.log('[purge-credit-logs] Complete:', result);

  return jsonResponse(result, req);
});
