import React from 'react';
import { Wand2, Loader2, ArrowRight } from 'lucide-react';
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

export interface TransformPreviewData {
  columnKey: string;
  columnLabel: string;
  transformPrompt: string;
  totalEligible: number;
  samples: { rowId: string; before: string; after: string }[];
}

interface AiTransformPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  data: TransformPreviewData | null;
  isLoading: boolean;
  isExecuting: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function AiTransformPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  data,
  isLoading,
  isExecuting,
}: AiTransformPreviewModalProps) {
  if (!data) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wand2 className="h-5 w-5 text-violet-400" />
            Transform Preview
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {data.transformPrompt}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            <p className="mt-3 text-sm text-gray-400">
              Generating preview transformations...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-3">
              <span className="text-sm text-gray-300">
                Column: <span className="font-medium text-white">{data.columnLabel}</span>
              </span>
              <span className="text-sm text-gray-300">
                <span className="text-lg font-semibold text-violet-400">
                  {data.totalEligible.toLocaleString()}
                </span>{' '}
                cells to transform
              </span>
            </div>

            {/* Before/After table */}
            {data.samples.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Before
                      </th>
                      <th className="w-8 px-1 py-2" />
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {data.samples.map((sample, idx) => (
                      <tr key={idx}>
                        <td className="max-w-[240px] truncate whitespace-nowrap px-3 py-2.5 text-gray-400">
                          {sample.before || (
                            <span className="italic text-gray-600">empty</span>
                          )}
                        </td>
                        <td className="px-1 py-2.5 text-center">
                          <ArrowRight className="h-3.5 w-3.5 text-violet-400" />
                        </td>
                        <td className="max-w-[240px] truncate whitespace-nowrap px-3 py-2.5 font-medium text-violet-300">
                          {sample.after || (
                            <span className="italic text-gray-600">empty</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.samples.length === 0 && (
              <div className="rounded-lg bg-gray-800/50 px-4 py-8 text-center text-sm text-gray-500">
                No non-empty cells found to transform
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
            disabled={isLoading || data.samples.length === 0 || isExecuting}
            className="bg-violet-600 hover:bg-violet-500 text-white"
          >
            {isExecuting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transforming...
              </>
            ) : (
              `Transform ${data.totalEligible.toLocaleString()} cells`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
