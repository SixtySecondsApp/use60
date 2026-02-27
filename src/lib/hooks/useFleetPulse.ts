/**
 * useFleetPulse — React Query hook for Fleet Pulse widget data
 *
 * Queries sequence_jobs table to produce per-agent status rows for the
 * Control Room Fleet Pulse widget (CTRL-002).
 *
 * For each of the 8 known fleet agents it calculates:
 * - Latest status (running / idle / throttled / errored)
 * - Last execution timestamp
 * - Count of completions today
 * - 7-day error rate (failed / total)
 * - Last error message (for errored agents)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

// ============================================================================
// Constants
// ============================================================================

/** The 8 fleet agents tracked in the Control Room, keyed by event_source prefix
 *  stored in sequence_jobs.event_source (e.g. "cron:morning_brief" or just
 *  "meeting_ended" for webhook-triggered jobs).
 *  We match on the agent_type identifier which appears as the event_source value
 *  or as a substring.
 */
export const FLEET_AGENTS = [
  {
    id: 'meeting_ended',
    label: 'Meeting Ended',
    description: 'Post-meeting synthesis, CRM update, follow-up draft',
  },
  {
    id: 'deal_risk',
    label: 'Deal Risk',
    description: 'Scans active deals for risk signals',
  },
  {
    id: 'reengagement',
    label: 'Re-engagement',
    description: 'Revives stale deals and cold prospects',
  },
  {
    id: 'pre_meeting',
    label: 'Pre-Meeting',
    description: '90-min briefing before scheduled meetings',
  },
  {
    id: 'health_recalculate',
    label: 'Health Recalculate',
    description: 'Relationship health score recalculation',
  },
  {
    id: 'eod_synthesis',
    label: 'EOD Synthesis',
    description: 'End-of-day pipeline summary',
  },
  {
    id: 'pipeline_monitor',
    label: 'Pipeline Monitor',
    description: 'Continuous pipeline health monitoring',
  },
  {
    id: 'morning_brief',
    label: 'Morning Brief',
    description: 'Daily morning briefing and priorities',
  },
] as const;

export type FleetAgentId = (typeof FLEET_AGENTS)[number]['id'];

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = 'running' | 'idle' | 'throttled' | 'errored';

export interface FleetAgentRow {
  id: FleetAgentId;
  label: string;
  description: string;
  status: AgentStatus;
  lastRunAt: string | null;
  itemsToday: number;
  errorRate7d: number; // 0–100 percentage
  lastErrorMessage: string | null;
  totalJobs7d: number;
  failedJobs7d: number;
}

export interface FleetPulseData {
  agents: FleetAgentRow[];
  /** True when at least one agent has data in the DB */
  hasAnyData: boolean;
}

// ============================================================================
// Raw DB row type
// ============================================================================

interface RawSequenceJob {
  id: string;
  event_source: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine which fleet agent a sequence_jobs row belongs to.
 * event_source examples: "cron:morning_brief", "webhook:meetingbaas",
 * "meeting_ended", "cron:deal_risk_scan", etc.
 * We also look at the raw string for any matching agent id substring.
 */
function resolveAgentId(eventSource: string | null): FleetAgentId | null {
  if (!eventSource) return null;

  const src = eventSource.toLowerCase();

  // Exact / substring match order matters — check more specific first
  if (src.includes('morning_brief') || src.includes('morning_briefing')) return 'morning_brief';
  if (src.includes('pre_meeting') || src.includes('pre_meeting_90min') || src.includes('pre_meeting_nudge')) return 'pre_meeting';
  if (src.includes('deal_risk') || src.includes('deal_risk_scan')) return 'deal_risk';
  if (src.includes('eod_synthesis') || src.includes('eod')) return 'eod_synthesis';
  if (src.includes('pipeline_monitor') || src.includes('pipeline_health')) return 'pipeline_monitor';
  if (src.includes('health_recalculate') || src.includes('health_recalc')) return 'health_recalculate';
  if (src.includes('reengagement') || src.includes('stale_deal_revival')) return 'reengagement';
  if (src.includes('meeting_ended')) return 'meeting_ended';

  return null;
}

/**
 * Derive a display status from the raw sequence_job status value.
 * 'running' / 'waiting_approval' → running
 * 'failed' / 'timeout' → errored
 * 'cancelled' → throttled (best approximation without a real throttle status)
 * 'completed' / 'pending' (no recent activity) → idle
 */
function deriveStatus(rawStatus: string): AgentStatus {
  switch (rawStatus) {
    case 'running':
    case 'waiting_approval':
      return 'running';
    case 'failed':
    case 'timeout':
      return 'errored';
    case 'cancelled':
      return 'throttled';
    default:
      return 'idle';
  }
}

// ============================================================================
// Query function
// ============================================================================

async function fetchFleetPulse(): Promise<FleetPulseData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  // Fetch all jobs from the last 7 days in one query.
  // We pull only the columns we need (no select('*')).
  const { data, error } = await supabase
    .from('sequence_jobs')
    .select('id, event_source, status, created_at, completed_at, error_message')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch fleet pulse data: ${error.message}`);
  }

  const jobs: RawSequenceJob[] = data || [];

  // Group jobs by agent id
  const grouped: Record<FleetAgentId, RawSequenceJob[]> = {
    meeting_ended: [],
    deal_risk: [],
    reengagement: [],
    pre_meeting: [],
    health_recalculate: [],
    eod_synthesis: [],
    pipeline_monitor: [],
    morning_brief: [],
  };

  for (const job of jobs) {
    const agentId = resolveAgentId(job.event_source);
    if (agentId) {
      grouped[agentId].push(job);
    }
  }

  let hasAnyData = false;

  const agents: FleetAgentRow[] = FLEET_AGENTS.map((agent) => {
    const agentJobs = grouped[agent.id];

    if (agentJobs.length > 0) hasAnyData = true;

    // Latest job for status + timestamp
    const latestJob = agentJobs[0] ?? null; // already ordered by created_at desc

    // Status: if any job is currently running, show running; else latest job status
    const runningJob = agentJobs.find((j) => j.status === 'running' || j.status === 'waiting_approval');
    const status: AgentStatus = latestJob
      ? deriveStatus(runningJob ? runningJob.status : latestJob.status)
      : 'idle';

    // Last run timestamp
    const lastRunAt = latestJob?.created_at ?? null;

    // Items today = jobs that completed today
    const itemsToday = agentJobs.filter(
      (j) => j.status === 'completed' && j.created_at >= todayStartIso
    ).length;

    // 7-day error rate
    const totalJobs7d = agentJobs.length;
    const failedJobs7d = agentJobs.filter(
      (j) => j.status === 'failed' || j.status === 'timeout'
    ).length;
    const errorRate7d = totalJobs7d > 0
      ? Math.round((failedJobs7d / totalJobs7d) * 100)
      : 0;

    // Last error message (most recent failed job)
    const lastFailedJob = agentJobs.find(
      (j) => j.status === 'failed' || j.status === 'timeout'
    );
    const lastErrorMessage = lastFailedJob?.error_message ?? null;

    return {
      id: agent.id,
      label: agent.label,
      description: agent.description,
      status,
      lastRunAt,
      itemsToday,
      errorRate7d,
      lastErrorMessage,
      totalJobs7d,
      failedJobs7d,
    };
  });

  return { agents, hasAnyData };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useFleetPulse
 *
 * Returns per-agent status rows for the Control Room Fleet Pulse widget.
 * Auto-refetches every 60 seconds.
 */
export function useFleetPulse() {
  return useQuery<FleetPulseData>({
    queryKey: ['fleet-pulse'],
    queryFn: fetchFleetPulse,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
