/**
 * Handler extracted from cc-auto-report/index.ts
 * CC12-003: Command Centre Auto-Execution Slack Report
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts';
import { verifyCronSecret } from '../../_shared/edgeAuth.ts';
import {
  buildAutoExecutionReport,
  type AutoExecReportItem,
} from '../../_shared/slackBlocks.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutoExecRow {
  id: string;
  user_id: string;
  org_id: string;
  item_type: string;
  title: string;
  confidence_score: number | null;
  resolved_at: string;
  drafted_action: {
    type?: string;
    display_text?: string;
  } | null;
}

interface ProfileRow {
  id: string;
  slack_user_id: string | null;
}

interface SlackConnectionRow {
  org_id: string;
  bot_token: string;
}

interface DeliveryResult {
  user_id: string;
  items_count: number;
  delivered: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toReportItem(row: AutoExecRow): AutoExecReportItem {
  return {
    id: row.id,
    title: row.title,
    item_type: row.item_type,
    drafted_action_type: row.drafted_action?.type ?? '',
    drafted_action_display_text: row.drafted_action?.display_text ?? '',
    confidence_score: row.confidence_score ?? 0,
    resolved_at: row.resolved_at,
  };
}

async function postToSlack(
  botToken: string,
  slackUserId: string,
  blocks: any[],
  fallbackText: string,
): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: slackUserId,
      blocks,
      text: fallbackText,
    }),
  });

  const body = await resp.json().catch(() => ({ ok: false, error: 'parse_error' }));
  return body;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAutoReport(req: Request): Promise<Response> {
  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return errorResponse('Unauthorized', req, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return errorResponse('Missing Supabase environment variables', req, 500);
  }

  // Service role client — intentional, documented
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // ---- 1. Fetch auto-completed items from today ----
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const { data: rows, error: rowsError } = await supabase
      .from('command_centre_items')
      .select(
        'id, user_id, org_id, item_type, title, confidence_score, resolved_at, drafted_action',
      )
      .eq('status', 'completed')
      .eq('resolution_channel', 'auto_exec')
      .gte('resolved_at', startOfDay.toISOString())
      .order('resolved_at', { ascending: true });

    if (rowsError) {
      console.error('[cc-auto-report] Error fetching auto-exec items:', rowsError.message);
      return errorResponse(`DB error: ${rowsError.message}`, req, 500);
    }

    const items = (rows ?? []) as AutoExecRow[];

    if (items.length === 0) {
      console.log('[cc-auto-report] No auto-executed items today — nothing to report.');
      return jsonResponse({ users_notified: 0, total_items_reported: 0 }, req);
    }

    // ---- 2. Group by user_id ----
    const byUser = new Map<string, AutoExecRow[]>();
    for (const item of items) {
      const existing = byUser.get(item.user_id) ?? [];
      existing.push(item);
      byUser.set(item.user_id, existing);
    }

    const userIds = Array.from(byUser.keys());
    const orgIds = [...new Set(items.map((i) => i.org_id))];

    // ---- 3. Fetch profiles (slack_user_id) ----
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, slack_user_id')
      .in('id', userIds);

    const profileMap = new Map<string, ProfileRow>();
    for (const p of (profiles ?? []) as ProfileRow[]) {
      profileMap.set(p.id, p);
    }

    // ---- 4. Fetch Slack bot tokens (one per org) ----
    const { data: slackConns } = await supabase
      .from('slack_connections')
      .select('org_id, bot_token')
      .in('org_id', orgIds);

    const botTokenMap = new Map<string, string>();
    for (const conn of (slackConns ?? []) as SlackConnectionRow[]) {
      botTokenMap.set(conn.org_id, conn.bot_token);
    }

    // ---- 5. Deliver to each user ----
    const results: DeliveryResult[] = [];

    for (const [userId, userItems] of byUser) {
      const firstItem = userItems[0];
      const profile = profileMap.get(userId);
      const botToken = botTokenMap.get(firstItem.org_id);

      if (!profile?.slack_user_id || !botToken) {
        console.log(
          `[cc-auto-report] Skipping user ${userId} — no Slack connection (slack_user_id=${profile?.slack_user_id ?? 'null'}, bot_token=${botToken ? 'ok' : 'missing'})`,
        );
        results.push({
          user_id: userId,
          items_count: userItems.length,
          delivered: false,
          error: 'no_slack_connection',
        });
        continue;
      }

      const reportItems = userItems.map(toReportItem);
      const blocks = buildAutoExecutionReport(reportItems);
      const n = reportItems.length;
      const fallbackText = `use60 auto-completed ${n} item${n !== 1 ? 's' : ''} overnight. All changes reversible for 24hrs.`;

      const slackResult = await postToSlack(botToken, profile.slack_user_id, blocks, fallbackText);

      if (!slackResult.ok) {
        console.error(
          `[cc-auto-report] Slack send failed for user ${userId}: ${slackResult.error}`,
        );
        results.push({
          user_id: userId,
          items_count: userItems.length,
          delivered: false,
          error: `slack_error:${slackResult.error}`,
        });
      } else {
        console.log(
          `[cc-auto-report] Delivered to user ${userId} — ${userItems.length} item${userItems.length !== 1 ? 's' : ''}`,
        );
        results.push({
          user_id: userId,
          items_count: userItems.length,
          delivered: true,
        });
      }
    }

    const usersNotified = results.filter((r) => r.delivered).length;
    const totalItemsReported = results
      .filter((r) => r.delivered)
      .reduce((sum, r) => sum + r.items_count, 0);

    console.log(
      `[cc-auto-report] Done — users_notified=${usersNotified} total_items_reported=${totalItemsReported}`,
    );

    return jsonResponse(
      {
        users_notified: usersNotified,
        total_items_reported: totalItemsReported,
        results,
      },
      req,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-auto-report] Unhandled error:', message);
    return errorResponse(`Report failed: ${message}`, req, 500);
  }
}
