/**
 * useAutonomyAuditTrail — React Query hook for the unified autonomy audit trail (AE2-009)
 *
 * Fetches events from two sources:
 *   - `autonomy_audit_log` (System A): org-level tier promotions/demotions
 *   - `autopilot_events` (System B): per-user autonomy signals
 *
 * Merges both into a single sorted timeline with pagination ("load more").
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export type AuditEventType =
  | 'promotion'
  | 'demotion'
  | 'manual_change'
  | 'context_escalation'
  | 'cooldown_start'
  | 'cooldown_end';

export type AuditSource = 'system_a' | 'system_b';

export interface AuditTrailEvent {
  /** Unique key for React rendering */
  id: string;
  /** Which table the event originated from */
  source: AuditSource;
  /** Normalized event type */
  event_type: AuditEventType;
  /** Action type key (e.g. 'send_email', 'crm_stage_change') */
  action_type: string;
  /** Previous tier/policy value */
  old_tier: string | null;
  /** New tier/policy value */
  new_tier: string | null;
  /** Human-readable reason for the change */
  trigger_reason: string | null;
  /** Additional evidence / metadata */
  evidence: Record<string, unknown> | null;
  /** Who or what initiated the event */
  initiated_by: string | null;
  /** ISO timestamp */
  created_at: string;
}

// ============================================================================
// Mapping helpers
// ============================================================================

/** Map System A `change_type` to our unified event types. */
function mapSystemAChangeType(changeType: string): AuditEventType {
  switch (changeType) {
    case 'promotion':
      return 'promotion';
    case 'demotion':
      return 'demotion';
    case 'manual_change':
      return 'manual_change';
    case 'cooldown_start':
      return 'cooldown_start';
    case 'cooldown_end':
      return 'cooldown_end';
    case 'ceiling_set':
      return 'manual_change';
    default:
      return 'manual_change';
  }
}

/** Map System B `event_type` to our unified event types. */
function mapSystemBEventType(eventType: string): AuditEventType {
  switch (eventType) {
    case 'promotion_accepted':
    case 'promotion_auto':
      return 'promotion';
    case 'demotion_auto':
    case 'demotion_emergency':
      return 'demotion';
    case 'context_escalation':
      return 'context_escalation';
    case 'cooldown_start':
      return 'cooldown_start';
    case 'cooldown_end':
      return 'cooldown_end';
    case 'manual_override':
      return 'manual_change';
    default:
      return 'manual_change';
  }
}

// ============================================================================
// Fetch function
// ============================================================================

async function fetchAuditTrail(
  orgId: string,
  limit: number,
  filters: AuditTrailFilters,
): Promise<AuditTrailEvent[]> {
  // Fetch from both tables in parallel
  const [systemAResult, systemBResult] = await Promise.all([
    fetchSystemA(orgId, limit, filters),
    fetchSystemB(orgId, limit, filters),
  ]);

  // Merge and sort by created_at descending
  const merged = [...systemAResult, ...systemBResult].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Apply the overall limit after merge
  return merged.slice(0, limit);
}

async function fetchSystemA(
  orgId: string,
  limit: number,
  filters: AuditTrailFilters,
): Promise<AuditTrailEvent[]> {
  let query = supabase
    .from('autonomy_audit_log')
    .select('id, action_type, change_type, previous_policy, new_policy, trigger_reason, evidence, initiated_by, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Action type filter
  if (filters.actionType && filters.actionType !== 'all') {
    query = query.eq('action_type', filters.actionType);
  }

  // Date range filters
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  // Change type filter — map our event types back to System A change_types
  if (filters.eventType && filters.eventType !== 'all') {
    const changeTypes = mapEventTypeToSystemAChangeTypes(filters.eventType);
    if (changeTypes.length > 0) {
      query = query.in('change_type', changeTypes);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: `a-${row.id}`,
    source: 'system_a' as AuditSource,
    event_type: mapSystemAChangeType(row.change_type),
    action_type: row.action_type,
    old_tier: row.previous_policy,
    new_tier: row.new_policy,
    trigger_reason: row.trigger_reason,
    evidence: row.evidence as Record<string, unknown> | null,
    initiated_by: row.initiated_by,
    created_at: row.created_at,
  }));
}

async function fetchSystemB(
  orgId: string,
  limit: number,
  filters: AuditTrailFilters,
): Promise<AuditTrailEvent[]> {
  let query = supabase
    .from('autopilot_events')
    .select('id, action_type, event_type, metadata, created_at, user_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Only fetch tier-change-related events from System B
  const tierEventTypes = [
    'promotion_accepted',
    'promotion_auto',
    'demotion_auto',
    'demotion_emergency',
    'context_escalation',
    'cooldown_start',
    'cooldown_end',
    'manual_override',
  ];

  // Action type filter
  if (filters.actionType && filters.actionType !== 'all') {
    query = query.eq('action_type', filters.actionType);
  }

  // Date range filters
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  // Event type filter — map to System B event_types
  if (filters.eventType && filters.eventType !== 'all') {
    const eventTypes = mapEventTypeToSystemBEventTypes(filters.eventType);
    if (eventTypes.length > 0) {
      query = query.in('event_type', eventTypes);
    } else {
      // If no matching event types, return empty
      return [];
    }
  } else {
    // Default: only fetch tier-relevant events
    query = query.in('event_type', tierEventTypes);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: `b-${row.id}`,
      source: 'system_b' as AuditSource,
      event_type: mapSystemBEventType(row.event_type),
      action_type: row.action_type,
      old_tier: (metadata.from_tier as string) ?? null,
      new_tier: (metadata.to_tier as string) ?? null,
      trigger_reason: (metadata.reason as string) ?? null,
      evidence: metadata,
      initiated_by: row.user_id ?? null,
      created_at: row.created_at,
    };
  });
}

// ============================================================================
// Filter mapping helpers
// ============================================================================

function mapEventTypeToSystemAChangeTypes(eventType: AuditEventType): string[] {
  switch (eventType) {
    case 'promotion':
      return ['promotion'];
    case 'demotion':
      return ['demotion'];
    case 'manual_change':
      return ['manual_change', 'ceiling_set'];
    case 'cooldown_start':
      return ['cooldown_start'];
    case 'cooldown_end':
      return ['cooldown_end'];
    case 'context_escalation':
      return []; // System A doesn't track context escalation
    default:
      return [];
  }
}

function mapEventTypeToSystemBEventTypes(eventType: AuditEventType): string[] {
  switch (eventType) {
    case 'promotion':
      return ['promotion_accepted', 'promotion_auto'];
    case 'demotion':
      return ['demotion_auto', 'demotion_emergency'];
    case 'manual_change':
      return ['manual_override'];
    case 'context_escalation':
      return ['context_escalation'];
    case 'cooldown_start':
      return ['cooldown_start'];
    case 'cooldown_end':
      return ['cooldown_end'];
    default:
      return [];
  }
}

// ============================================================================
// Filter types
// ============================================================================

export interface AuditTrailFilters {
  /** Filter by action type key, or 'all' */
  actionType?: string;
  /** Filter by unified event type, or 'all' */
  eventType?: AuditEventType | 'all';
  /** ISO string — inclusive start */
  dateFrom?: string;
  /** ISO string — inclusive end */
  dateTo?: string;
}

// ============================================================================
// Query keys
// ============================================================================

export const AUDIT_TRAIL_KEYS = {
  all: ['autonomy-audit-trail'] as const,
  list: (orgId: string | null, limit: number, filters: AuditTrailFilters) =>
    ['autonomy-audit-trail', orgId, limit, filters] as const,
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Returns a merged, sorted timeline of autonomy tier change events from
 * both System A (autonomy_audit_log) and System B (autopilot_events).
 *
 * @param limit - Max events to return (default 50)
 * @param filters - Optional filters for action type, event type, date range
 *
 * @example
 * const { data, isLoading } = useAutonomyAuditTrail(50, { eventType: 'promotion' });
 */
export function useAutonomyAuditTrail(
  limit: number = 50,
  filters: AuditTrailFilters = {},
) {
  const orgId = useActiveOrgId();

  return useQuery<AuditTrailEvent[]>({
    queryKey: AUDIT_TRAIL_KEYS.list(orgId, limit, filters),
    queryFn: () => fetchAuditTrail(orgId!, limit, filters),
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  });
}

export default useAutonomyAuditTrail;
