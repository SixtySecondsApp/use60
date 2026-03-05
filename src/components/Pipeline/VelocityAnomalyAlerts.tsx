/**
 * VelocityAnomalyAlerts — PIP-003
 *
 * Flags deals that are 2-sigma outliers in time-in-stage, with dismiss support.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, X, TrendingDown, DollarSign } from 'lucide-react';
import { getVelocityAnomalies, type VelocityAnomaly } from '@/lib/services/pipelineInsightsService';
import { useOrgStore } from '@/lib/stores/orgStore';
import { formatCurrencyCompact } from '@/lib/utils/formatters';

const DISMISSED_KEY = 'pipeline:dismissed-velocity-anomalies';

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function AnomalyRow({ anomaly, onDismiss }: { anomaly: VelocityAnomaly; onDismiss: (id: string) => void }) {
  const sigmaColor =
    anomaly.sigma_deviation >= 3
      ? 'text-red-500'
      : anomaly.sigma_deviation >= 2.5
      ? 'text-orange-500'
      : 'text-amber-500';

  return (
    <div className="flex items-center gap-3 p-3 bg-white dark:bg-white/[0.025] border border-gray-200/80 dark:border-white/[0.05] rounded-lg group hover:border-gray-300 dark:hover:border-white/[0.08] transition-colors">
      {/* Sigma badge */}
      <div className="shrink-0 flex flex-col items-center justify-center w-10 h-10 bg-amber-50 dark:bg-amber-500/[0.08] border border-amber-200/80 dark:border-amber-500/20 rounded-lg">
        <span className={`text-xs font-bold tabular-nums leading-none ${sigmaColor}`}>
          {anomaly.sigma_deviation}σ
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{anomaly.deal_name}</span>
          {anomaly.company && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">· {anomaly.company}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{anomaly.stage_name}</span>
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <TrendingDown className="h-3 w-3 text-amber-400" />
            {anomaly.days_in_stage}d <span className="text-gray-400 dark:text-gray-500">(avg {anomaly.expected_days}d)</span>
          </span>
          {anomaly.value && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <DollarSign className="h-3 w-3" />
              {formatCurrencyCompact(anomaly.value)}
            </span>
          )}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(anomaly.deal_id)}
        className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-all"
        aria-label="Dismiss alert"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function VelocityAnomalyAlerts() {
  const orgId = useOrgStore((state) => state.activeOrgId);
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed);

  const { data: anomalies, isLoading } = useQuery({
    queryKey: ['velocity-anomalies', orgId],
    queryFn: () => getVelocityAnomalies(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const handleDismiss = (dealId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(dealId);
      saveDismissed(next);
      return next;
    });
  };

  const visible = (anomalies ?? []).filter((a) => !dismissed.has(a.deal_id));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-44 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-white/[0.025] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="bg-white dark:bg-white/[0.03] border border-gray-200/80 dark:border-white/[0.06] rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-500/10 rounded-full mb-3">
          <Zap className="h-5 w-5 text-blue-500" />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No velocity anomalies</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">All deals are progressing within normal ranges</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Velocity Anomalies</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Deals 2+ standard deviations above stage average</p>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.04] px-2 py-1 rounded-full">
          {visible.length} {visible.length === 1 ? 'deal' : 'deals'}
        </span>
      </div>
      <div className="space-y-2">
        {visible.map((anomaly) => (
          <AnomalyRow key={anomaly.deal_id} anomaly={anomaly} onDismiss={handleDismiss} />
        ))}
      </div>
    </div>
  );
}
