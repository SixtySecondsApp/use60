/**
 * SearchHistoryPanel — Sheet panel showing search history for an ICP profile.
 *
 * CRITICAL: Uses `!top-16 !h-[calc(100vh-4rem)]` per CLAUDE.md rules for top bar offset.
 */

import React, { useState } from 'react';
import { History, Trash2, Clock, Coins, Hash, RotateCcw, GitCompareArrows, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useICPSearchHistory, useDeleteSearchHistory } from '@/lib/hooks/useICPProfilesCRUD';
import { SearchComparisonView } from '@/components/prospecting/SearchComparisonView';
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SearchHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string | undefined;
  profileName?: string;
  onLoadParams?: (searchParams: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchHistoryPanel({
  isOpen,
  onClose,
  profileId,
  profileName,
  onLoadParams,
}: SearchHistoryPanelProps) {
  const { data: history, isLoading } = useICPSearchHistory(isOpen ? profileId : undefined);
  const deleteMutation = useDeleteSearchHistory();

  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ICPSearchHistoryEntry | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = () => {
    if (!deleteTarget || !profileId) return;
    deleteMutation.mutate(
      { id: deleteTarget.id, profileId },
      { onSuccess: () => setDeleteTarget(null) }
    );
  };

  const clearComparison = () => {
    setCompareMode(false);
    setSelectedIds(new Set());
  };

  // Get selected entries for comparison
  const selectedEntries = history?.filter((e) => selectedIds.has(e.id)) ?? [];
  const canCompare = selectedEntries.length === 2;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); clearComparison(); } }}>
        <SheetContent side="right" className="!top-16 !h-[calc(100vh-4rem)] w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#64748B]" />
              Search History
            </SheetTitle>
            <SheetDescription>
              {profileName ? `History for "${profileName}"` : 'Search history entries'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Compare toggle */}
            <div className="flex items-center justify-between">
              <Button
                variant={compareMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (compareMode) {
                    clearComparison();
                  } else {
                    setCompareMode(true);
                  }
                }}
              >
                <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />
                {compareMode ? 'Cancel Compare' : 'Compare'}
              </Button>

              {compareMode && (
                <span className="text-xs text-[#64748B] dark:text-gray-400">
                  Select {2 - selectedIds.size} more
                </span>
              )}
            </div>

            {/* Comparison view */}
            {canCompare && (
              <SearchComparisonView
                entryA={selectedEntries[0]}
                entryB={selectedEntries[1]}
                onClose={clearComparison}
              />
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && (!history || history.length === 0) && (
              <div className="text-center py-12 text-[#94A3B8] dark:text-gray-500">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No search history yet</p>
                <p className="text-xs mt-1">Run a search to start tracking history.</p>
              </div>
            )}

            {/* History entries */}
            {history && history.length > 0 && (
              <div className="space-y-2">
                {history.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? 'border-blue-300 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5'
                          : 'border-[#E2E8F0] dark:border-gray-700/50 hover:border-[#CBD5E1] dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Top row: provider + date */}
                          <div className="flex items-center gap-2 mb-1.5">
                            {compareMode && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(entry.id)}
                                disabled={!isSelected && selectedIds.size >= 2}
                                className="h-3.5 w-3.5 rounded border-[#CBD5E1] text-blue-600 focus:ring-blue-500"
                              />
                            )}
                            <Badge
                              variant={entry.provider === 'apollo' ? 'default' : 'secondary'}
                              className="text-xs capitalize"
                            >
                              {entry.provider.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-[#64748B] dark:text-gray-400">
                              {formatRelativeDate(entry.created_at)}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-3 text-xs text-[#64748B] dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              {entry.result_count ?? 0} results
                            </span>
                            <span className="flex items-center gap-1">
                              <Coins className="h-3 w-3" />
                              {entry.credits_consumed ?? 0} credits
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(entry.duration_ms)}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {onLoadParams && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              title="Load search params"
                              onClick={() => onLoadParams(entry.search_params)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            title="Delete entry"
                            onClick={() => setDeleteTarget(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Search Entry</DialogTitle>
            <DialogDescription>
              This will permanently remove this search history entry. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
