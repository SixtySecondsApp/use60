/**
 * CC Emitter — Shared helper for all fleet agents
 *
 * CC-002: Wire all fleet agents to emit CC items via cc-enrich pipeline.
 *
 * This thin wrapper re-exports writeAdapter helpers with a more ergonomic
 * API name (`emitCCItem` / `emitCCItems`) and ensures every agent that calls
 * this module gets the same write semantics:
 *
 *  1. Required fields validated before insert
 *  2. Dedup check against existing open items (skip_dedup opt-out available)
 *  3. Errors logged but NOT thrown — CC failures never break the calling agent
 *  4. Returns item ID (or null on failure) for agents that need the reference
 *
 * Usage in an agent:
 *
 *   import { emitCCItem } from '../_shared/cc/emitter.ts';
 *
 *   const itemId = await emitCCItem({
 *     org_id,
 *     user_id,
 *     source_agent: 'deal_risk',
 *     item_type: 'alert',
 *     title: 'Deal health dropped below 40%',
 *     summary: 'Acme Corp deal has gone silent for 14 days.',
 *     urgency: 'high',
 *     deal_id: deal.id,
 *     context: { deal_name: deal.name, days_silent: 14 },
 *   });
 *
 * @see supabase/functions/_shared/commandCentre/writeAdapter.ts  — underlying impl
 * @see supabase/functions/_shared/commandCentre/types.ts         — WriteItemParams
 */

import {
  writeToCommandCentre,
  writeMultipleItems,
} from '../commandCentre/writeAdapter.ts';
import type { WriteItemParams } from '../commandCentre/types.ts';

// Re-export the canonical type so callers only need one import
export type { WriteItemParams };

/**
 * Emit a single item to the Command Centre.
 *
 * Returns the new item ID on success, or null on failure.
 * Errors are logged but never thrown.
 */
export async function emitCCItem(params: WriteItemParams): Promise<string | null> {
  return writeToCommandCentre(params);
}

/**
 * Emit multiple items to the Command Centre in a single batch insert.
 *
 * Returns an array of new item IDs (empty array on failure).
 * Items that fail validation are skipped and logged individually.
 * Errors are logged but never thrown.
 */
export async function emitCCItems(items: WriteItemParams[]): Promise<string[]> {
  return writeMultipleItems(items);
}
