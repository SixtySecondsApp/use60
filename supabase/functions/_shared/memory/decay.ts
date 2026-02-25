import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Decay multipliers (from PRD-DM-001)
// ---------------------------------------------------------------------------

const DECAY_RULES: Array<{ daysThreshold: number; multiplier: number }> = [
  { daysThreshold: 7, multiplier: 1.0 },
  { daysThreshold: 14, multiplier: 0.98 },
  { daysThreshold: 30, multiplier: 0.95 },
  { daysThreshold: 60, multiplier: 0.90 },
  { daysThreshold: Infinity, multiplier: 0.85 },
];

const RELATIONSHIP_STRENGTH_FLOOR = 0.1;
const BATCH_SIZE = 100;

function decayMultiplier(lastInteractionAt: string): number {
  const daysSince =
    (Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24);

  for (const rule of DECAY_RULES) {
    if (daysSince < rule.daysThreshold) return rule.multiplier;
  }
  // Fallback — should never reach here given Infinity sentinel above
  return 0.85;
}

// ---------------------------------------------------------------------------
// runRelationshipDecay
// ---------------------------------------------------------------------------

/**
 * Run relationship strength decay for all contacts in an org.
 * Designed to run weekly via cron.
 *
 * Decay rates (from PRD):
 * - Last interaction < 7 days: no decay (1.0)
 * - 7-14 days: 0.98 multiplier
 * - 14-30 days: 0.95 multiplier
 * - 30-60 days: 0.90 multiplier
 * - 60+ days: 0.85 multiplier
 * - Floor: 0.1 (never fully zero)
 *
 * Uses the `run_contact_relationship_decay` RPC for efficiency.
 * Falls back to application-code batch processing if the RPC is unavailable.
 */
export async function runRelationshipDecay(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ updated: number; skipped: number }> {
  // ---- Preferred path: single SQL via RPC ----
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'run_contact_relationship_decay',
    { p_org_id: orgId },
  );

  if (!rpcError) {
    const updated = typeof rpcData === 'number' ? rpcData : 0;
    return { updated, skipped: 0 };
  }

  // The RPC is not available yet (migration not applied) — fall back to
  // application-code batch processing.
  console.warn(
    '[memory/decay] RPC run_contact_relationship_decay unavailable, falling back to app-code batch:',
    rpcError.message,
  );

  return runDecayInAppCode(orgId, supabase);
}

// ---------------------------------------------------------------------------
// Fallback: application-code batch processing
// ---------------------------------------------------------------------------

async function runDecayInAppCode(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ updated: number; skipped: number }> {
  // Fetch all rows that have a recorded interaction (no point decaying nulls)
  const { data: rows, error: fetchError } = await supabase
    .from('contact_memory')
    .select('id, relationship_strength, last_interaction_at')
    .eq('org_id', orgId)
    .not('last_interaction_at', 'is', null);

  if (fetchError) {
    throw new Error(`[memory/decay] Failed to fetch contact_memory rows: ${fetchError.message}`);
  }

  if (!rows || rows.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  let updated = 0;
  let skipped = 0;

  // Build update payloads, skipping contacts with no-decay multiplier (< 7 days)
  type UpdatePayload = { id: string; relationship_strength: number };
  const pendingUpdates: UpdatePayload[] = [];

  for (const row of rows) {
    const multiplier = decayMultiplier(row.last_interaction_at as string);

    if (multiplier === 1.0) {
      skipped++;
      continue;
    }

    const newStrength = Math.max(
      RELATIONSHIP_STRENGTH_FLOOR,
      (row.relationship_strength as number) * multiplier,
    );

    pendingUpdates.push({ id: row.id as string, relationship_strength: newStrength });
  }

  // Batch update in chunks of BATCH_SIZE
  for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
    const chunk = pendingUpdates.slice(i, i + BATCH_SIZE);

    // Supabase client doesn't support bulk update via IN + different values,
    // so we fire individual updates in parallel within each chunk.
    await Promise.all(
      chunk.map((payload) =>
        supabase
          .from('contact_memory')
          .update({ relationship_strength: payload.relationship_strength })
          .eq('id', payload.id),
      ),
    );

    updated += chunk.length;
  }

  return { updated, skipped };
}
