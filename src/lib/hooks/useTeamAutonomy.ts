/**
 * useTeamAutonomy — React Query hook for the Autonomy Matrix widget (CTRL-003).
 *
 * Fetches per-user × per-action-type confidence rows for the whole org, along
 * with recent promotion/demotion events so the matrix can show tier badges and
 * "promoted N days ago" callouts.
 *
 * Data sources:
 *   - autopilot_confidence  (current tier per user × action_type)
 *   - autopilot_events      (last 5 events per user × action_type + recent promotions)
 *   - profiles              (display names)
 *
 * Refreshes every 5 minutes (refetchInterval: 300 000 ms).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Constants — the canonical action types shown in the matrix columns
// ============================================================================

export const MATRIX_ACTION_TYPES = [
  'email.send',
  'task.create',
  'slack.post',
  'crm.update',
  'proposal.send',
] as const;

export type MatrixActionType = (typeof MATRIX_ACTION_TYPES)[number];

// Human-readable labels for each column header
export const ACTION_TYPE_LABELS: Record<MatrixActionType, string> = {
  'email.send': 'Email',
  'task.create': 'Task',
  'slack.post': 'Slack',
  'crm.update': 'CRM',
  'proposal.send': 'Proposal',
};

// ============================================================================
// Types
// ============================================================================

/** Autonomy tiers in ascending trust order */
export type AutonomyTier = 'disabled' | 'suggest' | 'approve' | 'auto';

/** A single cell in the matrix: one rep × one action type */
export interface MatrixCell {
  user_id: string;
  action_type: MatrixActionType;
  /** Current tier ('disabled' | 'suggest' | 'approve' | 'auto') */
  tier: AutonomyTier;
  /** Composite confidence score 0.0–1.0, null if no data */
  score: number | null;
  /**
   * Days since the most recent promotion event, null if no promotion has
   * happened or none in the last 30 days.
   */
  days_since_promotion: number | null;
  /** Last 5 autopilot_events for this rep × action type (newest first) */
  recent_events: MatrixEvent[];
}

/** Minimal event shape needed by the matrix popover */
export interface MatrixEvent {
  id: string;
  event_type: string;
  from_tier: string;
  to_tier: string;
  confidence_score: number | null;
  trigger_reason: string | null;
  created_at: string;
}

/** One row in the matrix (one team member) */
export interface MatrixRow {
  user_id: string;
  display_name: string;
  cells: Record<MatrixActionType, MatrixCell>;
}

/** Full payload returned by the hook */
export interface TeamAutonomyData {
  rows: MatrixRow[];
  /** ISO timestamp of last fetch */
  fetched_at: string;
}

// ============================================================================
// Raw DB row types
// ============================================================================

interface RawConfidenceRow {
  user_id: string;
  action_type: string;
  current_tier: string;
  score: number;
}

interface RawEventRow {
  id: string;
  user_id: string;
  action_type: string;
  event_type: string;
  from_tier: string;
  to_tier: string;
  confidence_score: number | null;
  trigger_reason: string | null;
  created_at: string;
}

interface RawProfile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function getDisplayName(profile: RawProfile | undefined, userId: string): string {
  if (!profile) return userId.slice(0, 8);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  return fullName || profile.email || userId.slice(0, 8);
}

function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 86_400_000;
  return Math.floor((new Date(isoB).getTime() - new Date(isoA).getTime()) / msPerDay);
}

/** Build a default (disabled, no data) cell for a rep × action_type pair */
function buildDefaultCell(userId: string, actionType: MatrixActionType): MatrixCell {
  return {
    user_id: userId,
    action_type: actionType,
    tier: 'disabled',
    score: null,
    days_since_promotion: null,
    recent_events: [],
  };
}

// ============================================================================
// Fetch function
// ============================================================================

async function fetchTeamAutonomy(orgId: string): Promise<TeamAutonomyData> {
  // 1. Confidence rows for all org members × all matrix action types
  const { data: confidenceRows, error: confidenceError } = await supabase
    .from('autopilot_confidence')
    .select('user_id, action_type, current_tier, score')
    .eq('org_id', orgId)
    .in('action_type', MATRIX_ACTION_TYPES as unknown as string[]);

  if (confidenceError) throw confidenceError;

  const confidence = (confidenceRows ?? []) as RawConfidenceRow[];

  // 2. Collect unique user IDs from confidence rows
  const userIds = Array.from(new Set(confidence.map((r) => r.user_id)));

  if (userIds.length === 0) {
    return { rows: [], fetched_at: new Date().toISOString() };
  }

  // 3. Fetch autopilot_events for these users × matrix action types
  //    We need the most recent 5 per (user_id, action_type).
  //    Supabase PostgREST doesn't support LIMIT per group, so we pull recent
  //    events across the org and slice client-side.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: eventRows, error: eventError } = await supabase
    .from('autopilot_events')
    .select(
      'id, user_id, action_type, event_type, from_tier, to_tier, confidence_score, trigger_reason, created_at',
    )
    .eq('org_id', orgId)
    .in('user_id', userIds)
    .in('action_type', MATRIX_ACTION_TYPES as unknown as string[])
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false });

  if (eventError) throw eventError;

  const events = (eventRows ?? []) as RawEventRow[];

  // 4. Fetch display names
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('id', userIds);

  const profileById = new Map<string, RawProfile>();
  for (const p of profiles ?? []) {
    profileById.set(p.id, p as RawProfile);
  }

  // 5. Build lookup: (user_id, action_type) -> last 5 events + last promotion date
  type CellKey = `${string}::${string}`;
  const eventsByCell = new Map<CellKey, RawEventRow[]>();
  const lastPromotionByCell = new Map<CellKey, string>(); // ISO created_at

  const now = new Date().toISOString();

  for (const ev of events) {
    const key: CellKey = `${ev.user_id}::${ev.action_type}`;
    const cellEvents = eventsByCell.get(key) ?? [];
    if (cellEvents.length < 5) {
      cellEvents.push(ev);
      eventsByCell.set(key, cellEvents);
    }
    // Track most recent promotion (already sorted newest-first, so first hit wins)
    if (
      (ev.event_type === 'promotion_accepted' || ev.event_type === 'promotion_proposed') &&
      !lastPromotionByCell.has(key)
    ) {
      lastPromotionByCell.set(key, ev.created_at);
    }
  }

  // 6. Build confidence lookup: (user_id, action_type) -> row
  const confidenceByCell = new Map<CellKey, RawConfidenceRow>();
  for (const row of confidence) {
    confidenceByCell.set(`${row.user_id}::${row.action_type}`, row);
  }

  // 7. Assemble matrix rows
  const rows: MatrixRow[] = userIds.map((userId) => {
    const cells = {} as Record<MatrixActionType, MatrixCell>;

    for (const actionType of MATRIX_ACTION_TYPES) {
      const key: CellKey = `${userId}::${actionType}`;
      const confRow = confidenceByCell.get(key);
      const cellEvents = eventsByCell.get(key) ?? [];
      const lastPromoIso = lastPromotionByCell.get(key) ?? null;

      cells[actionType] = confRow
        ? {
            user_id: userId,
            action_type: actionType,
            tier: confRow.current_tier as AutonomyTier,
            score: confRow.score ?? null,
            days_since_promotion: lastPromoIso ? daysBetween(lastPromoIso, now) : null,
            recent_events: cellEvents.map((ev) => ({
              id: ev.id,
              event_type: ev.event_type,
              from_tier: ev.from_tier,
              to_tier: ev.to_tier,
              confidence_score: ev.confidence_score,
              trigger_reason: ev.trigger_reason,
              created_at: ev.created_at,
            })),
          }
        : buildDefaultCell(userId, actionType);
    }

    return {
      user_id: userId,
      display_name: getDisplayName(profileById.get(userId), userId),
      cells,
    };
  });

  // Sort by display name alphabetically
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return { rows, fetched_at: now };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetches the autonomy matrix data for all team members.
 *
 * Returns rows (one per rep) × cells (one per action type), each cell carrying
 * the current tier, confidence score, days since last promotion, and last 5
 * autopilot_events. Refreshes every 5 minutes.
 *
 * @param orgId - Active org ID. Hook is disabled when null.
 *
 * @example
 * const { data, isLoading } = useTeamAutonomy(orgId);
 * data?.rows.forEach(row => {
 *   console.log(row.display_name, row.cells['email.send'].tier);
 * });
 */
export function useTeamAutonomy(orgId: string | null) {
  return useQuery<TeamAutonomyData>({
    queryKey: ['team-autonomy-matrix', orgId],
    queryFn: () => fetchTeamAutonomy(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export default useTeamAutonomy;
