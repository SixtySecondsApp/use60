/**
 * Handler extracted from cc-auto-execute/index.ts
 * CC11-003: Command Centre Autonomous Execution
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import {
  jsonResponse,
  errorResponse,
} from '../../_shared/corsHelper.ts';
import { verifyCronSecret } from '../../_shared/edgeAuth.ts';
import {
  resolveTrustThreshold,
  mapDraftedActionToActionType,
  recordOutcome,
  classifyExecutionTier,
} from '../../_shared/commandCentre/trustScorer.ts';
import type { CommandCentreItem, DraftedAction } from '../../_shared/commandCentre/types.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadyItem {
  id: string;
  org_id: string;
  user_id: string;
  item_type: string;
  title: string;
  confidence_score: number;
  priority_score: number | null;
  status: string;
  resolution_channel: string | null;
  context: Record<string, unknown>;
  drafted_action: DraftedAction | null;
  deal_id: string | null;
  contact_id: string | null;
  context_risk_score: number | null;
}

type ItemOutcome = 'auto_exec' | 'skipped' | 'rate_limited';

interface ItemResult {
  id: string;
  action: ItemOutcome;
  reason?: string;
}

// External-facing action types that count toward the stricter sub-limit
const EXTERNAL_ACTION_TYPES = new Set(['send_email', 'schedule_meeting', 'send_proposal']);

// ---------------------------------------------------------------------------
// Rate limit helpers
// ---------------------------------------------------------------------------

interface RateLimitState {
  totalToday: number;
  externalToday: number;
}

async function getRateLimitState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<RateLimitState> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('command_centre_items')
    .select('id, drafted_action')
    .eq('user_id', userId)
    .eq('resolution_channel', 'auto_exec')
    .gte('resolved_at', startOfDay.toISOString());

  if (error) {
    console.error('[cc-auto-execute] getRateLimitState error', { userId, error: error.message });
    // Fail safe: assume limits are hit to avoid over-executing
    return { totalToday: 10, externalToday: 3 };
  }

  const rows = data ?? [];
  const totalToday = rows.length;
  const externalToday = rows.filter((row) => {
    const actionType = (row.drafted_action as DraftedAction | null)?.type;
    return actionType ? EXTERNAL_ACTION_TYPES.has(actionType) : false;
  }).length;

  return { totalToday, externalToday };
}

// ---------------------------------------------------------------------------
// Pause condition check
// ---------------------------------------------------------------------------

async function isUserPaused(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('command_centre_items')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .eq('resolution_channel', 'auto_exec')
    .gte('resolved_at', oneHourAgo)
    .limit(1);

  if (error) {
    console.error('[cc-auto-execute] isUserPaused query error', { userId, error: error.message });
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Execute a single item
// ---------------------------------------------------------------------------

async function executeItem(
  supabase: ReturnType<typeof createClient>,
  item: ReadyItem,
): Promise<void> {
  const preExecState = {
    status: item.status,
    resolution_channel: item.resolution_channel,
    context_snapshot: item.context,
    auto_executed_at: new Date().toISOString(),
  };

  const updatedContext = {
    ...item.context,
    pre_exec_state: preExecState,
  };

  const { error } = await supabase
    .from('command_centre_items')
    .update({
      status: 'completed',
      resolution_channel: 'auto_exec',
      resolved_at: new Date().toISOString(),
      context: updatedContext,
    })
    .eq('id', item.id);

  if (error) {
    throw new Error(`DB update failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAutoExecute(req: Request): Promise<Response> {
  // Auth: require cron secret
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!verifyCronSecret(req, cronSecret)) {
    return errorResponse('Unauthorized', req, 401);
  }

  try {
    // Service role client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Fetch all ready items with a confidence score, ordered by priority
    const { data: items, error: fetchError } = await supabase
      .from('command_centre_items')
      .select(
        'id, org_id, user_id, item_type, title, confidence_score, priority_score, status, resolution_channel, context, drafted_action, deal_id, contact_id, context_risk_score',
      )
      .eq('status', 'ready')
      .not('confidence_score', 'is', null)
      .order('priority_score', { ascending: false, nullsFirst: false })
      .limit(100);

    if (fetchError) {
      console.error('[cc-auto-execute] Failed to fetch ready items:', fetchError.message);
      return errorResponse('Failed to fetch ready items', req, 500);
    }

    if (!items || items.length === 0) {
      console.log('[cc-auto-execute] No ready items with confidence scores found');
      return jsonResponse(
        { processed: 0, auto_executed: 0, skipped_rate_limit: 0, skipped_threshold: 0, users_paused: 0, items: [] },
        req,
      );
    }

    console.log(`[cc-auto-execute] Processing ${items.length} ready items`);

    // 2. Group items by user_id
    const byUser = new Map<string, ReadyItem[]>();
    for (const item of items as ReadyItem[]) {
      if (!byUser.has(item.user_id)) byUser.set(item.user_id, []);
      byUser.get(item.user_id)!.push(item);
    }

    // 3. Process each user's items
    const allResults: ItemResult[] = [];
    let totalAutoExecuted = 0;
    let totalSkippedRateLimit = 0;
    let totalSkippedThreshold = 0;
    let totalUsersPaused = 0;

    for (const [userId, userItems] of byUser) {
      // Check pause condition first
      const paused = await isUserPaused(supabase, userId);
      if (paused) {
        console.log(`[cc-auto-execute] user=${userId} is paused (recent undo detected)`);
        totalUsersPaused++;
        for (const item of userItems) {
          allResults.push({ id: item.id, action: 'skipped', reason: 'user_paused' });
        }
        continue;
      }

      // Fetch auto_send_types for this user (once per user, not per item)
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('auto_send_types')
        .eq('user_id', userId)
        .maybeSingle();
      const autoSendTypes = (userSettings?.auto_send_types as Record<string, boolean>) ?? {};

      // Load rate limit state for this user
      const rateLimits = await getRateLimitState(supabase, userId);

      for (const item of userItems) {
        // Guard: item must have a drafted_action to execute
        if (!item.drafted_action) {
          allResults.push({ id: item.id, action: 'skipped', reason: 'no_drafted_action' });
          continue;
        }

        // Map action type
        const actionType = mapDraftedActionToActionType(item.drafted_action.type, item.item_type);
        const isExternal = EXTERNAL_ACTION_TYPES.has(item.drafted_action.type);

        // Check rate limits before threshold evaluation
        if (rateLimits.totalToday >= 10) {
          allResults.push({ id: item.id, action: 'rate_limited', reason: 'daily_total_limit' });
          totalSkippedRateLimit++;
          continue;
        }
        if (isExternal && rateLimits.externalToday >= 3) {
          allResults.push({ id: item.id, action: 'rate_limited', reason: 'daily_external_limit' });
          totalSkippedRateLimit++;
          continue;
        }

        // Check if this action type is enabled for auto-send
        const draftedActionType = item.drafted_action?.type;
        if (draftedActionType && !autoSendTypes[draftedActionType]) {
          allResults.push({ id: item.id, action: 'skipped', reason: 'auto_send_disabled' });
          continue;
        }

        // Resolve trust threshold for this (user, action_type) pair
        const { threshold } = await resolveTrustThreshold(supabase, userId, actionType);

        // AE2-006: Use classifyExecutionTier with context_risk to decide autonomy
        const contextRisk = item.context_risk_score ?? 0.0;
        const tier = classifyExecutionTier(item.confidence_score, threshold, contextRisk);

        // Only autonomous tier qualifies for auto-execution
        if (tier !== 'autonomous') {
          console.log(
            `[cc-auto-execute] item=${item.id} confidence=${item.confidence_score} threshold=${threshold} context_risk=${contextRisk} tier=${tier} for action=${actionType} — leaving for HITL`,
          );
          allResults.push({ id: item.id, action: 'skipped', reason: 'below_threshold' });
          totalSkippedThreshold++;
          continue;
        }

        // Execute the item
        try {
          await executeItem(supabase, item);

          // Record outcome as approved in trust scoring
          await recordOutcome(supabase, userId, actionType, 'approved');

          // Increment in-memory counters so subsequent items in this batch respect limits
          rateLimits.totalToday++;
          if (isExternal) rateLimits.externalToday++;

          console.log(
            `[cc-auto-execute] auto_exec item=${item.id} action=${actionType} confidence=${item.confidence_score} threshold=${threshold}`,
          );
          allResults.push({ id: item.id, action: 'auto_exec' });
          totalAutoExecuted++;
        } catch (execErr) {
          const message = execErr instanceof Error ? execErr.message : String(execErr);
          console.error(`[cc-auto-execute] executeItem failed for item=${item.id}:`, message);
          allResults.push({ id: item.id, action: 'skipped', reason: `exec_error: ${message}` });
        }
      }
    }

    const processed = allResults.length;

    console.log(
      `[cc-auto-execute] Done — processed=${processed} auto_executed=${totalAutoExecuted} skipped_rate_limit=${totalSkippedRateLimit} skipped_threshold=${totalSkippedThreshold} users_paused=${totalUsersPaused}`,
    );

    return jsonResponse(
      {
        processed,
        auto_executed: totalAutoExecuted,
        skipped_rate_limit: totalSkippedRateLimit,
        skipped_threshold: totalSkippedThreshold,
        users_paused: totalUsersPaused,
        items: allResults,
      },
      req,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cc-auto-execute] Unhandled error:', message);
    return errorResponse(message, req, 500);
  }
}
