/**
 * WinLossInsightsPanel — WL-006
 * AI-generated pattern insights from win/loss data.
 * Refresh triggers re-fetch with cache invalidation.
 */

import React from 'react';
import { Sparkles, RefreshCw, TrendingUp, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWinLossInsights } from '@/lib/services/winLossService';
import type { WinLossInsight, WinLossPeriod } from '@/lib/types/winLoss';

const TYPE_CONFIG: Record<WinLossInsight['type'], {
  icon: React.ElementType;
  bg: string;
  border: string;
  text: string;
}> = {
  positive: {
    icon: TrendingUp,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
  },
};

interface Props {
  orgId: string;
  period: WinLossPeriod;
}

export function WinLossInsightsPanel({ orgId, period }: Props) {
  const queryClient = useQueryClient();
  const { data: insights, isLoading, error } = useWinLossInsights(orgId, period);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['win-loss-insights', orgId, period] });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">AI Pattern Insights</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analysing patterns…
          </div>
        ) : error ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Could not generate insights. Try refreshing.
          </p>
        ) : !insights || insights.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Not enough data to generate insights yet.
          </p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => {
              const cfg = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div
                  key={insight.id}
                  className={`flex gap-3 rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.text}`} />
                  <p className="text-sm text-gray-200 leading-snug">{insight.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
