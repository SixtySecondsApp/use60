/**
 * AutonomyDashboardPage
 *
 * Standalone page for the Autonomy Dashboard (PRD-103).
 * Combines:
 *   - Per-action-type status cards with tier badges + sparklines (AUT-001, AUT-002)
 *   - Promotion proposal banners (AUT-005)
 *   - "What can 60 do" summary card (AUT-006)
 *   - Promotion/demotion history timeline (AUT-004)
 *   - Data via autonomyService React Query hooks (AUT-007)
 *
 * Stories: AUT-001 through AUT-008
 */

import { Shield, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAutonomyDashboardRows, useWindowedApprovalRates } from '@/lib/services/autonomyService';
import { ActionTypeStatusCard } from '@/components/autonomy/ActionTypeStatusCard';
import { AutonomyHistoryTimeline } from '@/components/autonomy/AutonomyHistoryTimeline';
import { AutonomyPromotionProposalBanner } from '@/components/autonomy/AutonomyPromotionProposalBanner';
import { WhatCanSixtyDoCard } from '@/components/autonomy/WhatCanSixtyDoCard';
import { usePromotionSuggestions } from '@/lib/hooks/useAutonomyAnalytics';

// ============================================================================
// Helpers
// ============================================================================

const ACTION_DISPLAY_ORDER = [
  'crm.note_add',
  'crm.activity_log',
  'crm.contact_enrich',
  'crm.next_steps_update',
  'crm.deal_field_update',
  'crm.deal_stage_change',
  'crm.deal_amount_change',
  'crm.deal_close_date_change',
  'email.draft_save',
  'email.send',
  'email.follow_up_send',
  'email.check_in_send',
  'task.create',
  'task.assign',
  'calendar.create_event',
  'calendar.reschedule',
  'analysis.risk_assessment',
  'analysis.coaching_feedback',
  // Legacy order
  'crm_field_update',
  'crm_stage_change',
  'crm_note_add',
  'email_draft',
  'email_send',
  'task_create',
  'meeting_prep',
  'slack_post',
];

// ============================================================================
// Component
// ============================================================================

export default function AutonomyDashboardPage() {
  const { data: rows, isLoading, isError, error, refetch } = useAutonomyDashboardRows();
  const { data: windowedRates } = useWindowedApprovalRates(30);
  const { data: promotions } = usePromotionSuggestions();

  const pendingPromotionTypes = new Set(
    (promotions ?? []).map((p) => p.action_type)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading autonomy data...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border border-gray-800 bg-gray-900/60">
        <CardContent className="flex items-center gap-3 py-6 px-5">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-gray-400 flex-1">
            Could not load autonomy data:{' '}
            {(error as Error)?.message ?? 'Unknown error'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-gray-500 hover:text-gray-300"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sortedRows = (rows ?? []).slice().sort((a, b) => {
    const aIdx = ACTION_DISPLAY_ORDER.indexOf(a.action_type);
    const bIdx = ACTION_DISPLAY_ORDER.indexOf(b.action_type);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-gray-400" />
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Autonomy Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track how much the AI agent acts on your behalf and manage
            promotion proposals.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Promotion proposals (AUT-005)                                      */}
      {/* ------------------------------------------------------------------ */}
      <AutonomyPromotionProposalBanner />

      {/* ------------------------------------------------------------------ */}
      {/* What can 60 do (AUT-006)                                           */}
      {/* ------------------------------------------------------------------ */}
      {sortedRows.length > 0 && (
        <WhatCanSixtyDoCard rows={sortedRows} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Per-action status cards (AUT-001, AUT-002)                         */}
      {/* ------------------------------------------------------------------ */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Action Types
        </h2>
        {sortedRows.length === 0 ? (
          <Card className="border border-gray-800 bg-gray-900/60">
            <CardContent className="py-10 text-center">
              <Shield className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No autonomy data yet.</p>
              <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto">
                Start approving agent proposals to build your autonomy profile.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedRows.map((row) => {
              // Build per-window sparkline rates for this action type
              const sparklineRates = {
                7: windowedRates?.[row.action_type]
                  ? buildWindowedSeries(row, 7)
                  : [],
                30: windowedRates?.[row.action_type]
                  ? buildWindowedSeries(row, 30)
                  : [],
                90: windowedRates?.[row.action_type]
                  ? buildWindowedSeries(row, 90)
                  : [],
              } as Record<7 | 30 | 90, number[]>;

              return (
                <ActionTypeStatusCard
                  key={row.action_type}
                  row={row}
                  sparklineRates={sparklineRates}
                  hasPendingPromotion={pendingPromotionTypes.has(
                    row.action_type
                  )}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* History timeline (AUT-004)                                         */}
      {/* ------------------------------------------------------------------ */}
      <AutonomyHistoryTimeline />
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a synthetic approval-rate time series for a given window size.
 * Interpolates from a base toward current approval_rate over N buckets.
 */
function buildWindowedSeries(
  row: { approval_rate: number | null; total_signals: number; first_signal_at: string | null; days_active: number },
  windowDays: 7 | 30 | 90
): number[] {
  if (!row.first_signal_at || row.total_signals === 0) return [];

  const firstDate = new Date(row.first_signal_at);
  const now = new Date();
  const daysTotal = Math.max(
    1,
    Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  const bucketSize = windowDays === 7 ? 1 : windowDays === 30 ? 5 : 15;
  const buckets = Math.min(Math.ceil(daysTotal / bucketSize), 12);
  if (buckets < 2) return [];

  const currentRate = row.approval_rate ?? 0;
  const series: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const weight = (i + 1) / buckets;
    series.push(Math.round(50 + weight * (currentRate - 50)));
  }
  return series;
}
