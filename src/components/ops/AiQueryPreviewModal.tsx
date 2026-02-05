import React from 'react';
import { X, Trash2, Pencil, Filter, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { OpsTableRow, OpsTableColumn, FilterCondition } from '@/lib/services/opsTableService';

// =============================================================================
// Types
// =============================================================================

export interface AiQueryOperation {
  action: 'filter' | 'delete' | 'update';
  conditions: FilterCondition[];
  targetColumn?: string;
  newValue?: string;
  summary: string;
}

interface AiQueryPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  operation: AiQueryOperation | null;
  previewRows: OpsTableRow[];
  totalCount: number;
  columns: OpsTableColumn[];
  isLoading: boolean;
  isExecuting: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getActionIcon(action: string) {
  switch (action) {
    case 'delete':
      return <Trash2 className="h-5 w-5" />;
    case 'update':
      return <Pencil className="h-5 w-5" />;
    case 'filter':
      return <Filter className="h-5 w-5" />;
    default:
      return null;
  }
}

function getActionColor(action: string) {
  switch (action) {
    case 'delete':
      return 'text-red-400';
    case 'update':
      return 'text-blue-400';
    case 'filter':
      return 'text-violet-400';
    default:
      return 'text-gray-400';
  }
}

function getConfirmButtonStyles(action: string) {
  switch (action) {
    case 'delete':
      return 'bg-red-600 hover:bg-red-500 text-white';
    case 'update':
      return 'bg-blue-600 hover:bg-blue-500 text-white';
    default:
      return 'bg-violet-600 hover:bg-violet-500 text-white';
  }
}

function getConfirmButtonText(action: string, count: number) {
  switch (action) {
    case 'delete':
      return `Delete ${count} row${count !== 1 ? 's' : ''}`;
    case 'update':
      return `Update ${count} row${count !== 1 ? 's' : ''}`;
    default:
      return 'Apply Filter';
  }
}

// =============================================================================
// Component
// =============================================================================

export function AiQueryPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  operation,
  previewRows,
  totalCount,
  columns,
  isLoading,
  isExecuting,
}: AiQueryPreviewModalProps) {
  if (!operation) return null;

  // Get the first few columns to display in the preview table
  const visibleColumns = columns.filter((c) => c.is_visible).slice(0, 5);

  const getCellValue = (row: OpsTableRow, columnKey: string): string => {
    const cell = row.cells[columnKey];
    return cell?.value ?? '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <span className={getActionColor(operation.action)}>
              {getActionIcon(operation.action)}
            </span>
            <span className="capitalize">{operation.action} Preview</span>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {operation.summary}
          </DialogDescription>
        </DialogHeader>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="mt-3 text-sm text-gray-400">Finding matching rows...</p>
          </div>
        ) : totalCount === 0 ? (
          /* No matches */
          <div className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="mt-3 text-sm text-gray-400">No rows match these conditions</p>
          </div>
        ) : (
          /* Preview Content */
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
              <span className="text-sm text-gray-300">
                {operation.action === 'filter' ? 'Rows to show' : 'Rows affected'}
              </span>
              <span className={`text-lg font-semibold ${getActionColor(operation.action)}`}>
                {totalCount.toLocaleString()}
              </span>
            </div>

            {/* Update target info */}
            {operation.action === 'update' && operation.targetColumn && (
              <div className="rounded-lg bg-blue-900/20 border border-blue-700/30 px-4 py-3">
                <p className="text-sm text-blue-300">
                  Will set <span className="font-medium">{operation.targetColumn}</span> to{' '}
                  <span className="font-medium">"{operation.newValue}"</span>
                </p>
              </div>
            )}

            {/* Preview Table */}
            <div className="overflow-hidden rounded-lg border border-gray-700">
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        #
                      </th>
                      {visibleColumns.map((col) => (
                        <th
                          key={col.id}
                          className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {previewRows.slice(0, 10).map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-800/50">
                        <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                          {idx + 1}
                        </td>
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-gray-300"
                          >
                            {getCellValue(row, col.key) || (
                              <span className="text-gray-600 italic">empty</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* More rows indicator */}
              {totalCount > 10 && (
                <div className="border-t border-gray-700 bg-gray-800/50 px-4 py-2 text-center text-xs text-gray-500">
                  Showing 10 of {totalCount.toLocaleString()} matching rows
                </div>
              )}
            </div>

            {/* Warning for destructive actions */}
            {operation.action === 'delete' && (
              <div className="flex items-start gap-2 rounded-lg bg-red-900/20 border border-red-700/30 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300">
                  This action cannot be undone. The selected rows will be permanently deleted.
                </p>
              </div>
            )}
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
            disabled={isLoading || totalCount === 0 || isExecuting}
            className={getConfirmButtonStyles(operation.action)}
          >
            {isExecuting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              getConfirmButtonText(operation.action, totalCount)
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
