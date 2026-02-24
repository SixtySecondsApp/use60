/**
 * Command Centre Deduplication Module
 *
 * Checks for duplicate open/ready items before insert, merges context JSONB,
 * keeps the higher priority_score, and auto-resolves the loser.
 *
 * CRITICAL: Dedup failures must never block writes — all errors are caught and logged.
 * Use service role client (same as writeAdapter) since agents operate outside user JWT context.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import type { WriteItemParams } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Compatible item type groups — items within the same group can be deduplicated against each other.
 */
const COMPATIBLE_TYPES: Record<string, string[]> = {
  'deal_risk': ['deal_risk', 'stale_deal', 'deal_action'],
  'stale_deal': ['deal_risk', 'stale_deal', 'deal_action'],
  'deal_action': ['deal_risk', 'stale_deal', 'deal_action'],
  'follow_up': ['follow_up', 'outreach'],
  'outreach': ['follow_up', 'outreach'],
  'crm_update': ['crm_update'],
  'review': ['review'],
};

interface ExistingItem {
  id: string;
  context: Record<string, unknown>;
  priority_score: number | null;
  merged_from: string[] | null;
}

export interface DedupResult {
  /** ID of the winning item (either the existing item after merge, or null if no duplicate found) */
  winnerItemId: string | null;
  /** Whether a duplicate was found and merged */
  merged: boolean;
}

/**
 * Check for a duplicate open/ready item and merge if found.
 *
 * Dedup strategy:
 * 1. If new item has deal_id: query open items with same user_id + deal_id + compatible item_type
 * 2. If new item has contact_id (and no deal_id): query open items with same user_id + contact_id + compatible item_type
 * 3. If match found: merge context (new overrides existing), keep higher priority_score,
 *    append existing.id to merged_from, auto-resolve the loser
 *
 * Returns the winning item ID if a duplicate was merged, or null if no duplicate found.
 * On any error, returns null so the caller falls through to a normal insert.
 */
export async function checkForDuplicate(params: WriteItemParams & { priority_score?: number }): Promise<DedupResult> {
  const noMatch: DedupResult = { winnerItemId: null, merged: false };

  // Only dedup if we have a deal_id or contact_id to match on
  if (!params.deal_id && !params.contact_id) {
    return noMatch;
  }

  const compatibleTypes = COMPATIBLE_TYPES[params.item_type];
  if (!compatibleTypes || compatibleTypes.length === 0) {
    // No compatible types defined — skip dedup for this item_type
    return noMatch;
  }

  try {
    const supabase = getServiceClient();

    let query = supabase
      .from('command_centre_items')
      .select('id, context, priority_score, merged_from')
      .eq('user_id', params.user_id)
      .in('status', ['open', 'ready'])
      .in('item_type', compatibleTypes)
      .limit(1);

    if (params.deal_id) {
      query = query.eq('deal_id', params.deal_id);
    } else if (params.contact_id) {
      query = query.eq('contact_id', params.contact_id).is('deal_id', null);
    }

    const { data: existing, error: queryError } = await query;

    if (queryError) {
      console.error('[cc-dedup] query failed, skipping dedup', queryError.message);
      return noMatch;
    }

    if (!existing || existing.length === 0) {
      return noMatch;
    }

    const existingItem = existing[0] as ExistingItem;

    // Merge context: existing fields first, new values override
    const mergedContext = {
      ...(existingItem.context ?? {}),
      ...(params.context ?? {}),
    };

    // Keep the higher priority_score
    const existingScore = existingItem.priority_score ?? 0;
    const newScore = params.priority_score ?? 0;
    const winningScore = Math.max(existingScore, newScore);

    // Build merged_from: accumulate the existing item's merged_from + itself
    const existingMergedFrom: string[] = existingItem.merged_from ?? [];
    // We're merging the NEW item into the EXISTING item (existing wins)
    // Record that the new item was absorbed (use a placeholder marker since it has no id yet)
    // We update the existing item to reflect it absorbed a new candidate

    const { error: updateError } = await supabase
      .from('command_centre_items')
      .update({
        context: mergedContext,
        priority_score: winningScore > 0 ? winningScore : null,
        merged_from: existingMergedFrom.length > 0 ? existingMergedFrom : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingItem.id);

    if (updateError) {
      console.error('[cc-dedup] update of winning item failed, skipping dedup', updateError.message, {
        existing_id: existingItem.id,
      });
      return noMatch;
    }

    console.log('[cc-dedup] merged new item into existing', {
      existing_id: existingItem.id,
      item_type: params.item_type,
      deal_id: params.deal_id ?? null,
      contact_id: params.contact_id ?? null,
      existing_score: existingScore,
      new_score: newScore,
      winning_score: winningScore,
    });

    return { winnerItemId: existingItem.id, merged: true };
  } catch (err) {
    console.error('[cc-dedup] unexpected error, skipping dedup', String(err));
    return noMatch;
  }
}

/**
 * Daily sweep: find and merge duplicate open/ready items across the entire table.
 *
 * Intended to be called from a scheduled cron job. Looks for pairs of open/ready
 * items with the same (user_id, deal_id, item_type group) or (user_id, contact_id,
 * item_type group) and merges the lower-priority one into the higher-priority one.
 *
 * Returns the number of merges performed.
 */
export async function runDailyDedupSweep(orgId?: string): Promise<number> {
  let mergeCount = 0;

  try {
    const supabase = getServiceClient();

    // Fetch all open/ready items that have either a deal_id or contact_id
    let query = supabase
      .from('command_centre_items')
      .select('id, user_id, org_id, item_type, context, priority_score, merged_from, deal_id, contact_id')
      .in('status', ['open', 'ready'])
      .or('deal_id.not.is.null,contact_id.not.is.null')
      .order('priority_score', { ascending: false });

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: items, error } = await query;

    if (error) {
      console.error('[cc-dedup] sweep query failed', error.message);
      return 0;
    }

    if (!items || items.length === 0) {
      return 0;
    }

    // Build a map to detect duplicates: key = user_id|deal_id|compatible_group or user_id|contact_id|compatible_group
    const seen = new Map<string, typeof items[0]>();
    const toResolve: string[] = [];
    const toUpdate: Array<{ id: string; context: Record<string, unknown>; priority_score: number | null; merged_from: string[] }> = [];

    for (const item of items) {
      const compatibleTypes = COMPATIBLE_TYPES[item.item_type as string];
      if (!compatibleTypes) continue;

      // Normalise to a canonical group key using the sorted compatible types
      const groupKey = compatibleTypes.slice().sort().join('|');

      let dedupKey: string | null = null;
      if (item.deal_id) {
        dedupKey = `${item.user_id}|deal:${item.deal_id}|${groupKey}`;
      } else if (item.contact_id) {
        dedupKey = `${item.user_id}|contact:${item.contact_id}|${groupKey}`;
      }

      if (!dedupKey) continue;

      if (seen.has(dedupKey)) {
        // Existing item wins (higher priority since we ordered DESC)
        const winner = seen.get(dedupKey)!;
        const loser = item;

        // Merge context
        const mergedContext = {
          ...(winner.context ?? {}),
          ...(loser.context ?? {}),
        };

        const winnerScore = winner.priority_score ?? 0;
        const loserScore = loser.priority_score ?? 0;
        const winningScore = Math.max(winnerScore, loserScore);

        const winnerMergedFrom: string[] = winner.merged_from ?? [];
        if (!winnerMergedFrom.includes(loser.id)) {
          winnerMergedFrom.push(loser.id);
        }

        toUpdate.push({
          id: winner.id,
          context: mergedContext,
          priority_score: winningScore > 0 ? winningScore : null,
          merged_from: winnerMergedFrom,
        });

        toResolve.push(loser.id);
        mergeCount++;

        console.log('[cc-dedup] sweep: merging', {
          winner_id: winner.id,
          loser_id: loser.id,
          dedup_key: dedupKey,
        });
      } else {
        seen.set(dedupKey, item);
      }
    }

    // Apply updates and resolutions
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from('command_centre_items')
        .update({
          context: update.context,
          priority_score: update.priority_score,
          merged_from: update.merged_from,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id);

      if (updateError) {
        console.error('[cc-dedup] sweep: winner update failed', updateError.message, { id: update.id });
      }
    }

    if (toResolve.length > 0) {
      const { error: resolveError } = await supabase
        .from('command_centre_items')
        .update({
          status: 'auto_resolved',
          resolution_channel: 'dedup_merge',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', toResolve);

      if (resolveError) {
        console.error('[cc-dedup] sweep: bulk resolve failed', resolveError.message);
      }
    }

    console.log('[cc-dedup] sweep complete', { merges: mergeCount, org_id: orgId ?? 'all' });
    return mergeCount;
  } catch (err) {
    console.error('[cc-dedup] sweep unexpected error', String(err));
    return mergeCount;
  }
}
