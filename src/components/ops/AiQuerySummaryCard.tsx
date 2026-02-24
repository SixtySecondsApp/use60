import React from 'react';
import { X, BarChart3 } from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface SummaryData {
  question: string;
  totalRows: number;
  groups?: { value: string; count: number; percentage: number }[];
  columnStats?: Record<string, { filled: number; empty: number; fillRate: number }>;
  summary: string;
}

interface AiQuerySummaryCardProps {
  data: SummaryData;
  onDismiss: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AiQuerySummaryCard({ data, onDismiss }: AiQuerySummaryCardProps) {
  const maxCount = data.groups?.[0]?.count ?? 1;

  return (
    <div className="relative rounded-xl border border-violet-500/30 bg-violet-950/20 px-5 py-4">
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-medium text-violet-300">{data.summary}</span>
        <span className="text-xs text-gray-500">({data.totalRows.toLocaleString()} rows)</span>
      </div>

      {/* Group breakdown */}
      {data.groups && data.groups.length > 0 && (
        <div className="space-y-1.5">
          {data.groups.slice(0, 15).map((group) => (
            <div key={group.value} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-gray-400" title={group.value}>
                {group.value}
              </span>
              <div className="flex-1">
                <div className="h-5 overflow-hidden rounded bg-gray-800/50">
                  <div
                    className="flex h-full items-center rounded bg-violet-500/30"
                    style={{ width: `${Math.max((group.count / maxCount) * 100, 2)}%` }}
                  >
                    <span className="px-2 text-[11px] font-medium text-violet-300">
                      {group.count}
                    </span>
                  </div>
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] text-gray-500">
                {group.percentage}%
              </span>
            </div>
          ))}
          {data.groups.length > 15 && (
            <p className="text-xs text-gray-500 pl-[7.75rem]">
              +{data.groups.length - 15} more values
            </p>
          )}
        </div>
      )}

      {/* Column fill rates */}
      {data.columnStats && !data.groups && (
        <div className="space-y-1.5">
          {Object.entries(data.columnStats).map(([key, stats]) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-gray-400">{key}</span>
              <div className="flex-1">
                <div className="h-5 overflow-hidden rounded bg-gray-800/50">
                  <div
                    className="flex h-full items-center rounded bg-emerald-500/30"
                    style={{ width: `${Math.max(stats.fillRate, 2)}%` }}
                  >
                    <span className="px-2 text-[11px] font-medium text-emerald-300">
                      {stats.filled}
                    </span>
                  </div>
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] text-gray-500">
                {stats.fillRate}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
