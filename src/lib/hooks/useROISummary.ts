/**
 * useROISummary — React Query hook for the Control Room ROI Summary widget (CTRL-006)
 *
 * Calls the `get_roi_summary` Supabase RPC which returns three org-level KPIs:
 *   - hours_saved:                   Automated email sends this week × avg minutes saved
 *   - median_followup_speed_minutes: Median meeting-end → follow-up email time
 *   - pipeline_coverage_pct:         % of active deals with agent activity in last 7 days
 *
 * Refetches every 5 minutes. Returns 0 / null for metrics with no data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useActiveOrgId } from '@/lib/stores/orgStore';

// ============================================================================
// Types
// ============================================================================

export interface ROISummaryData {
  /** Hours saved this calendar week through automated email sends */
  hoursSaved: number;
  /**
   * Median elapsed minutes from meeting end to follow-up email send.
   * null when no matched pairs exist yet.
   */
  medianFollowupSpeed: number | null;
  /** Percentage (0–100) of active deals with agent activity in the last 7 days */
  pipelineCoverage: number;
}

/** Raw shape returned by the get_roi_summary RPC */
interface RawROIRow {
  hours_saved: string | number | null;
  median_followup_speed_minutes: string | number | null;
  pipeline_coverage_pct: string | number | null;
}

// ============================================================================
// Query key factory
// ============================================================================

export const ROI_SUMMARY_KEYS = {
  all: ['roi-summary'] as const,
  org: (orgId: string) => ['roi-summary', orgId] as const,
};

// ============================================================================
// Query function
// ============================================================================

async function fetchROISummary(orgId: string): Promise<ROISummaryData> {
  const { data, error } = await supabase.rpc('get_roi_summary', {
    p_org_id: orgId,
  });

  if (error) {
    throw new Error(`ROI summary RPC failed: ${error.message}`);
  }

  // RPC returns an array with one row (or zero rows for non-members)
  const rows = data as RawROIRow[] | null;
  const row: RawROIRow | null = Array.isArray(rows) ? (rows[0] ?? null) : null;

  if (!row) {
    return {
      hoursSaved: 0,
      medianFollowupSpeed: null,
      pipelineCoverage: 0,
    };
  }

  const medianRaw = row.median_followup_speed_minutes;

  return {
    hoursSaved: parseFloat(String(row.hours_saved ?? '0')) || 0,
    medianFollowupSpeed: medianRaw != null ? parseFloat(String(medianRaw)) : null,
    pipelineCoverage: parseFloat(String(row.pipeline_coverage_pct ?? '0')) || 0,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useROISummary
 *
 * Returns ROI KPI data for the Control Room ROI Summary widget.
 * Auto-refetches every 5 minutes.
 */
export function useROISummary(): {
  hoursSaved: number;
  medianFollowupSpeed: number | null;
  pipelineCoverage: number;
  isLoading: boolean;
  error: Error | null;
} {
  const orgId = useActiveOrgId();

  const query = useQuery<ROISummaryData, Error>({
    queryKey: ROI_SUMMARY_KEYS.org(orgId ?? '__no_org__'),
    enabled: !!orgId,
    refetchInterval: 300_000, // 5 minutes
    staleTime: 60_000,        // 1 minute
    queryFn: (): Promise<ROISummaryData> => {
      if (!orgId) {
        return Promise.resolve({
          hoursSaved: 0,
          medianFollowupSpeed: null,
          pipelineCoverage: 0,
        });
      }
      return fetchROISummary(orgId);
    },
  });

  return {
    hoursSaved: query.data?.hoursSaved ?? 0,
    medianFollowupSpeed: query.data?.medianFollowupSpeed ?? null,
    pipelineCoverage: query.data?.pipelineCoverage ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  };
}
