/**
 * useActionFeed — React Query hook for the Action Feed Control Room widget (CTRL-005)
 *
 * Primary source: agent_daily_logs (org-scoped, ordered by created_at DESC, limit 50)
 * Fallback source: command_centre_items (when daily_logs returns 0 rows)
 *
 * Supports filter params:
 *  - repIds[]      — filter by user_id (the rep who "owns" the action)
 *  - agentTypes[]  — filter by agent_type column
 *  - actionTypes[] — filter by action_type column
 *  - outcomes[]    — filter by outcome column (success | failed | pending | cancelled | skipped)
 *  - chainId       — filter to a single orchestrator chain (shows all steps in that chain)
 *
 * Auto-refetches every 60 seconds.
 * Also subscribes to Supabase Realtime for INSERT events on agent_daily_logs (CTRL-007).
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface ActionFeedFilters {
  repIds?: string[];
  agentTypes?: string[];
  actionTypes?: string[];
  outcomes?: string[];
  /** When set, shows all steps in this orchestrator chain */
  chainId?: string | null;
}

export type ActionFeedOutcome = 'success' | 'failed' | 'pending' | 'cancelled' | 'skipped';

export interface ActionFeedEntry {
  id: string;
  source: 'agent_daily_logs' | 'command_centre_items';
  createdAt: string;
  /** User id of the rep this action was taken for / by */
  userId: string | null;
  /** Display name derived from action_detail or null when not available */
  repName: string | null;
  agentType: string;
  actionType: string;
  /** Short human-readable summary (e.g. "draft_email sent to sarah@acme.com") */
  summary: string;
  outcome: ActionFeedOutcome;
  errorMessage: string | null;
  /** Flexible JSONB payload — shown when the row is expanded */
  actionDetail: Record<string, unknown>;
  /** AI reasoning — shown when the row is expanded */
  decisionReasoning: string | null;
  chainId: string | null;
  waveNumber: number | null;
  creditCost: number | null;
  executionMs: number | null;
}

export interface ActionFeedData {
  entries: ActionFeedEntry[];
  /** True when rows came from agent_daily_logs; false when falling back to CC items */
  isPrimarySource: boolean;
  hasAnyData: boolean;
}

// ============================================================================
// Raw DB row shapes
// ============================================================================

interface RawDailyLogRow {
  id: string;
  user_id: string | null;
  agent_type: string;
  action_type: string;
  action_detail: Record<string, unknown>;
  decision_reasoning: string | null;
  outcome: string;
  error_message: string | null;
  credit_cost: number | null;
  execution_ms: number | null;
  chain_id: string | null;
  wave_number: number | null;
  created_at: string;
}

interface RawCCItemRow {
  id: string;
  user_id: string;
  source_agent: string;
  item_type: string;
  title: string;
  summary: string | null;
  context: Record<string, unknown>;
  status: string;
  created_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a human-readable action summary from a daily_log row.
 * Tries to extract email/contact info from action_detail for richer summaries.
 */
function buildActionSummary(row: RawDailyLogRow): string {
  const detail = row.action_detail || {};

  // email-related actions — show recipient
  const recipient =
    (detail.recipient_email as string | undefined) ||
    (detail.to as string | undefined) ||
    (detail.email as string | undefined);

  if (recipient) {
    return `${row.action_type} → ${recipient}`;
  }

  // CRM update — show field + values
  const field = detail.field as string | undefined;
  const newValue = detail.new_value as string | undefined;
  if (field && newValue !== undefined) {
    return `${row.action_type}: ${field} → ${String(newValue)}`;
  }

  // subject line for drafts
  const subject = detail.subject as string | undefined;
  if (subject) {
    return `${row.action_type}: "${String(subject).slice(0, 60)}"`;
  }

  // fallback: agent_type → action_type
  return `${row.agent_type} → ${row.action_type}`;
}

/**
 * Derive a rep name from action_detail when the users table join is not available.
 * Looks for common name fields in the JSONB payload.
 */
function extractRepName(detail: Record<string, unknown>): string | null {
  const name =
    (detail.rep_name as string | undefined) ||
    (detail.user_name as string | undefined) ||
    (detail.contact_name as string | undefined);
  return name ?? null;
}

function toOutcome(raw: string): ActionFeedOutcome {
  const valid: ActionFeedOutcome[] = ['success', 'failed', 'pending', 'cancelled', 'skipped'];
  return valid.includes(raw as ActionFeedOutcome) ? (raw as ActionFeedOutcome) : 'pending';
}

// ============================================================================
// Fetch functions
// ============================================================================

async function fetchFromDailyLogs(
  orgId: string,
  filters: ActionFeedFilters,
): Promise<ActionFeedEntry[]> {
  let query = supabase
    .from('agent_daily_logs')
    .select(
      'id, user_id, agent_type, action_type, action_detail, decision_reasoning, outcome, error_message, credit_cost, execution_ms, chain_id, wave_number, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  // chain_id filter overrides all other filters (shows the full chain)
  if (filters.chainId) {
    query = query.eq('chain_id', filters.chainId).eq('org_id', orgId);
  } else {
    query = query.eq('org_id', orgId);

    if (filters.repIds && filters.repIds.length > 0) {
      query = query.in('user_id', filters.repIds);
    }
    if (filters.agentTypes && filters.agentTypes.length > 0) {
      query = query.in('agent_type', filters.agentTypes);
    }
    if (filters.actionTypes && filters.actionTypes.length > 0) {
      query = query.in('action_type', filters.actionTypes);
    }
    if (filters.outcomes && filters.outcomes.length > 0) {
      query = query.in('outcome', filters.outcomes);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`agent_daily_logs query failed: ${error.message}`);
  }

  const rows = (data ?? []) as RawDailyLogRow[];

  return rows.map((row) => ({
    id: row.id,
    source: 'agent_daily_logs' as const,
    createdAt: row.created_at,
    userId: row.user_id,
    repName: extractRepName(row.action_detail),
    agentType: row.agent_type,
    actionType: row.action_type,
    summary: buildActionSummary(row),
    outcome: toOutcome(row.outcome),
    errorMessage: row.error_message,
    actionDetail: row.action_detail || {},
    decisionReasoning: row.decision_reasoning,
    chainId: row.chain_id,
    waveNumber: row.wave_number,
    creditCost: row.credit_cost,
    executionMs: row.execution_ms,
  }));
}

async function fetchFromCommandCentreItems(orgId: string): Promise<ActionFeedEntry[]> {
  const { data, error } = await supabase
    .from('command_centre_items')
    .select('id, user_id, source_agent, item_type, title, summary, context, status, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // CC items fallback — swallow error and return empty rather than crashing
    console.warn('command_centre_items fallback failed:', error.message);
    return [];
  }

  const rows = (data ?? []) as RawCCItemRow[];

  return rows.map((row) => ({
    id: row.id,
    source: 'command_centre_items' as const,
    createdAt: row.created_at,
    userId: row.user_id,
    repName: null,
    agentType: row.source_agent,
    actionType: row.item_type,
    summary: row.title,
    outcome: toOutcome(mapCCStatusToOutcome(row.status)),
    errorMessage: null,
    actionDetail: row.context || {},
    decisionReasoning: row.summary ?? null,
    chainId: null,
    waveNumber: null,
    creditCost: null,
    executionMs: null,
  }));
}

/** Map CC item lifecycle status to a rough outcome value */
function mapCCStatusToOutcome(status: string): string {
  switch (status) {
    case 'completed':
    case 'approved':
    case 'auto_resolved':
      return 'success';
    case 'dismissed':
      return 'cancelled';
    case 'open':
    case 'enriching':
    case 'ready':
    case 'executing':
      return 'pending';
    default:
      return 'pending';
  }
}

// ============================================================================
// Main query function
// ============================================================================

async function fetchActionFeed(
  orgId: string,
  filters: ActionFeedFilters,
): Promise<ActionFeedData> {
  const primary = await fetchFromDailyLogs(orgId, filters);

  if (primary.length > 0) {
    return { entries: primary, isPrimarySource: true, hasAnyData: true };
  }

  // Fallback: no daily log rows yet — try command_centre_items
  const fallback = await fetchFromCommandCentreItems(orgId);
  return {
    entries: fallback,
    isPrimarySource: false,
    hasAnyData: fallback.length > 0,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useActionFeed
 *
 * Returns paginated action feed entries for the Control Room Action Feed widget.
 * Primary source: agent_daily_logs. Fallback: command_centre_items.
 * Auto-refetches every 60 seconds.
 * Also subscribes to Supabase Realtime INSERT events on agent_daily_logs (CTRL-007).
 *
 * @param filters - Optional filters for rep, agent type, action type, outcome, or chain_id
 */
export function useActionFeed(filters: ActionFeedFilters = {}) {
  const orgId = useActiveOrgId();
  const queryClient = useQueryClient();

  const queryKey = [
    'action-feed',
    orgId ?? '__no_org__',
    filters.repIds,
    filters.agentTypes,
    filters.actionTypes,
    filters.outcomes,
    filters.chainId ?? null,
  ] as const;

  // ---- Supabase Realtime subscription for live INSERT events (CTRL-007) ----
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`control-room-feed-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_daily_logs',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const raw = payload.new as RawDailyLogRow;
          if (!raw) return;

          const newEntry: ActionFeedEntry = {
            id: raw.id,
            source: 'agent_daily_logs',
            createdAt: raw.created_at,
            userId: raw.user_id,
            repName: extractRepName(raw.action_detail ?? {}),
            agentType: raw.agent_type,
            actionType: raw.action_type,
            summary: buildActionSummary(raw),
            outcome: toOutcome(raw.outcome),
            errorMessage: raw.error_message,
            actionDetail: raw.action_detail || {},
            decisionReasoning: raw.decision_reasoning,
            chainId: raw.chain_id,
            waveNumber: raw.wave_number,
            creditCost: raw.credit_cost,
            executionMs: raw.execution_ms,
          };

          queryClient.setQueryData<ActionFeedData>(queryKey, (old) => {
            if (!old) return old;
            // Only prepend to the primary source feed; skip if showing fallback CC items
            if (!old.isPrimarySource) return old;
            return {
              ...old,
              entries: [newEntry, ...old.entries].slice(0, 100),
              hasAnyData: true,
            };
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[ActionFeed] Realtime channel error, falling back to polling');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, queryClient]);

  return useQuery<ActionFeedData>({
    queryKey,
    enabled: !!orgId,
    queryFn: () => fetchActionFeed(orgId!, filters),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
