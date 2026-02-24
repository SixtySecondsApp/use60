/**
 * SearchComparisonView — Side-by-side comparison of two search history entries.
 *
 * Shows provider, date, result count, credits consumed, and a visual overlap bar.
 */

import React from 'react';
import { GitCompareArrows, Calendar, Hash, Coins, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ICPSearchHistoryEntry } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function providerBadge(provider: string) {
  const variant = provider === 'apollo' ? 'default' : 'secondary';
  return <Badge variant={variant} className="text-xs capitalize">{provider.replace('_', ' ')}</Badge>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchComparisonViewProps {
  entryA: ICPSearchHistoryEntry;
  entryB: ICPSearchHistoryEntry;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchComparisonView({ entryA, entryB, onClose }: SearchComparisonViewProps) {
  const countA = entryA.result_count ?? 0;
  const countB = entryB.result_count ?? 0;
  const maxCount = Math.max(countA, countB, 1);

  // Estimate overlap as the minimum of the two counts (rough heuristic)
  const estimatedOverlap = Math.min(countA, countB);
  const overlapPct = maxCount > 0 ? Math.round((estimatedOverlap / maxCount) * 100) : 0;
  const newInB = Math.max(0, countB - estimatedOverlap);
  const droppedFromA = Math.max(0, countA - estimatedOverlap);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
          <span className="text-sm font-medium text-[#1E293B] dark:text-gray-100">Comparison</span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-brand-blue dark:text-blue-400 hover:underline"
        >
          Clear comparison
        </button>
      </div>

      {/* Side-by-side stats */}
      <div className="grid grid-cols-2 gap-3">
        {[entryA, entryB].map((entry, idx) => (
          <div key={entry.id} className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                Search {idx === 0 ? 'A' : 'B'}
              </span>
              {providerBadge(entry.provider)}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                {formatRelativeDate(entry.created_at)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#1E293B] dark:text-gray-100">
                <Hash className="h-3 w-3 text-[#64748B] dark:text-gray-400" />
                {entry.result_count ?? 0} results
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
                <Coins className="h-3 w-3" />
                {entry.credits_consumed ?? 0} credits
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400">
                <Clock className="h-3 w-3" />
                {formatDuration(entry.duration_ms)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Diff stats */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 p-3 space-y-3">
        <div className="text-xs font-medium text-[#64748B] dark:text-gray-400">Estimated Difference</div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold text-brand-teal dark:text-emerald-400">{newInB}</div>
            <div className="text-xs text-[#64748B] dark:text-gray-400">New in B</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-brand-blue dark:text-blue-400">{estimatedOverlap}</div>
            <div className="text-xs text-[#64748B] dark:text-gray-400">Overlap</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-red-600 dark:text-red-400">{droppedFromA}</div>
            <div className="text-xs text-[#64748B] dark:text-gray-400">Dropped from A</div>
          </div>
        </div>

        {/* Overlap bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[#64748B] dark:text-gray-400">
            <span>Overlap</span>
            <span>{overlapPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#F8FAFC] dark:bg-gray-700/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-blue dark:bg-blue-400 transition-all duration-300"
              style={{ width: `${overlapPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
