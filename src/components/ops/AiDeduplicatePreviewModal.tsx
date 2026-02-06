import React, { useState } from 'react';
import { Copy, Loader2, ChevronDown, ChevronRight, Check, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// =============================================================================
// Types
// =============================================================================

export interface DeduplicatePreviewData {
  groupByColumn: string;
  groupByLabel: string;
  keepStrategy: string;
  groups: { value: string; keepRowId: string; deleteRowIds: string[] }[];
  totalDuplicates: number;
}

interface AiDeduplicatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  data: DeduplicatePreviewData | null;
  isLoading: boolean;
  isExecuting: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function AiDeduplicatePreviewModal({
  isOpen,
  onClose,
  onConfirm,
  data,
  isLoading,
  isExecuting,
}: AiDeduplicatePreviewModalProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (!data) return null;

  const toggleGroup = (value: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const strategyLabel = data.keepStrategy.replace(/_/g, ' ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Copy className="h-5 w-5 text-amber-400" />
            Deduplication Preview
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Deduplicate by "{data.groupByLabel}" — keeping {strategyLabel} per group
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            <p className="mt-3 text-sm text-gray-400">Finding duplicates...</p>
          </div>
        ) : data.totalDuplicates === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Check className="h-8 w-8 text-green-400" />
            <p className="mt-3 text-sm text-gray-400">No duplicates found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center gap-4">
              <div className="flex-1 rounded-lg bg-gray-800/50 px-4 py-3 text-center">
                <div className="text-lg font-semibold text-amber-400">
                  {data.groups.length}
                </div>
                <div className="text-xs text-gray-500">duplicate groups</div>
              </div>
              <div className="flex-1 rounded-lg bg-gray-800/50 px-4 py-3 text-center">
                <div className="text-lg font-semibold text-red-400">
                  {data.totalDuplicates}
                </div>
                <div className="text-xs text-gray-500">rows to remove</div>
              </div>
            </div>

            {/* Group list */}
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-700">
              {data.groups.slice(0, 50).map((group) => {
                const isExpanded = expandedGroups.has(group.value);
                return (
                  <div key={group.value} className="border-b border-gray-700/50 last:border-0">
                    <button
                      onClick={() => toggleGroup(group.value)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-800/50"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      <span className="flex-1 truncate text-gray-300">
                        {group.value}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {group.deleteRowIds.length + 1} rows ({group.deleteRowIds.length} to remove)
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-700/30 bg-gray-800/30 px-3 py-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3 w-3 text-green-400" />
                          <span className="text-green-400">Keep</span>
                          <span className="text-gray-500 truncate">
                            Row ID: {group.keepRowId.slice(0, 8)}...
                          </span>
                        </div>
                        {group.deleteRowIds.map((rowId) => (
                          <div key={rowId} className="flex items-center gap-2 text-xs">
                            <Trash2 className="h-3 w-3 text-red-400" />
                            <span className="text-red-400">Delete</span>
                            <span className="text-gray-500 truncate">
                              Row ID: {rowId.slice(0, 8)}...
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {data.groups.length > 50 && (
                <div className="px-3 py-2 text-center text-xs text-gray-500">
                  +{data.groups.length - 50} more groups
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isExecuting}
            className="border-gray-600 bg-transparent text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || data.totalDuplicates === 0 || isExecuting}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {isExecuting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              `Remove ${data.totalDuplicates} duplicate${data.totalDuplicates !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
