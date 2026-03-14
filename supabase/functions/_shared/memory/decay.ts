import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A contact whose relationship_strength crossed below the alert threshold during decay. */
export interface CrossedContact {
  contact_id: string;
  org_id: string;
  previous_strength: number;
  new_strength: number;
  last_interaction_at: string | null;
}

export interface DecayResult {
  updated: number;
  skipped: number;
  crossedBelow: CrossedContact[];
}

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

/** Threshold below which a contact is considered "decaying" and triggers an alert. */
const DECAY_ALERT_THRESHOLD = 0.4;

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
 *
 * Returns contacts whose relationship_strength crossed below the 0.4
 * threshold during this run (for downstream alerting).
 */
export async function runRelationshipDecay(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<DecayResult> {
  // ---- Preferred path: single SQL via RPC ----
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'run_contact_relationship_decay',
    { p_org_id: orgId },
  );

  if (!rpcError) {
    const updated = typeof rpcData === 'number' ? rpcData : 0;

    // The RPC updates rows in bulk and doesn't return per-row deltas.
    // Do a follow-up query for contacts that recently crossed below the
    // threshold. We look for strength in (FLOOR, THRESHOLD) — contacts
    // that just dipped below 0.4 but haven't bottomed out yet.
    const crossedBelow = await queryCrossedContacts(orgId, supabase);

    return { updated, skipped: 0, crossedBelow };
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
): Promise<DecayResult> {
  // Fetch all rows that have a recorded interaction (no point decaying nulls)
  const { data: rows, error: fetchError } = await supabase
    .from('contact_memory')
    .select('id, contact_id, org_id, relationship_strength, last_interaction_at')
    .eq('org_id', orgId)
    .not('last_interaction_at', 'is', null);

  if (fetchError) {
    throw new Error(`[memory/decay] Failed to fetch contact_memory rows: ${fetchError.message}`);
  }

  if (!rows || rows.length === 0) {
    return { updated: 0, skipped: 0, crossedBelow: [] };
  }

  let updated = 0;
  let skipped = 0;
  const crossedBelow: CrossedContact[] = [];

  // Build update payloads, skipping contacts with no-decay multiplier (< 7 days)
  type UpdatePayload = { id: string; relationship_strength: number };
  const pendingUpdates: UpdatePayload[] = [];

  for (const row of rows) {
    const multiplier = decayMultiplier(row.last_interaction_at as string);

    if (multiplier === 1.0) {
      skipped++;
      continue;
    }

    const previousStrength = row.relationship_strength as number;
    const newStrength = Math.max(
      RELATIONSHIP_STRENGTH_FLOOR,
      previousStrength * multiplier,
    );

    pendingUpdates.push({ id: row.id as string, relationship_strength: newStrength });

    // Track contacts crossing below the alert threshold
    if (previousStrength >= DECAY_ALERT_THRESHOLD && newStrength < DECAY_ALERT_THRESHOLD) {
      crossedBelow.push({
        contact_id: row.contact_id as string,
        org_id: row.org_id as string,
        previous_strength: previousStrength,
        new_strength: newStrength,
        last_interaction_at: (row.last_interaction_at as string) ?? null,
      });
    }
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

  return { updated, skipped, crossedBelow };
}

// ---------------------------------------------------------------------------
// RPC follow-up: query contacts that recently crossed below the threshold
// ---------------------------------------------------------------------------

/**
 * After the RPC runs (which updates rows in bulk without returning per-row
 * deltas), query for contacts whose strength is now in the "recently crossed"
 * band: above the floor (0.1) and below the alert threshold (0.4).
 *
 * We narrow to strength > 0.3 to approximate "just crossed" — contacts that
 * have been below 0.4 for many cycles will have decayed further down.
 */
async function queryCrossedContacts(
  orgId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<CrossedContact[]> {
  const { data: rows, error } = await supabase
    .from('contact_memory')
    .select('contact_id, org_id, relationship_strength, last_interaction_at')
    .eq('org_id', orgId)
    .lt('relationship_strength', DECAY_ALERT_THRESHOLD)
    .gt('relationship_strength', 0.3)
    .not('last_interaction_at', 'is', null);

  if (error) {
    console.warn(
      '[memory/decay] Failed to query crossed contacts after RPC:',
      error.message,
    );
    return [];
  }

  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({
    contact_id: row.contact_id as string,
    org_id: row.org_id as string,
    // We don't have the previous value from the RPC path — estimate it
    // by reverse-applying the most conservative multiplier (0.85).
    // The exact previous value is unknown, but it was >= 0.4.
    previous_strength: (row.relationship_strength as number) / 0.85,
    new_strength: row.relationship_strength as number,
    last_interaction_at: (row.last_interaction_at as string) ?? null,
  }));
}
