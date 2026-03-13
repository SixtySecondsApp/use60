import React, { useState } from 'react';
import { Sparkles, Send, Trash2, X, Upload, RotateCcw, Loader2, Download, Wand2 } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onEnrich: () => void;
  onPushToInstantly: () => void;
  onDelete: () => void;
  onDeselectAll: () => void;
  onPushToHubSpot?: () => void;
  onPushToAttio?: () => void;
  onExportCSV?: () => void;
  onReEnrich?: () => void;
  onRetryFailed?: () => void;
  onRemixAll?: () => void;
  aiColumnCount?: number;
  isEnriching?: boolean;
  isPushingToInstantly?: boolean;
  isRemixingAll?: boolean;
  enrichProgress?: number;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  onEnrich,
  onPushToInstantly,
  onDelete,
  onDeselectAll,
  onPushToHubSpot,
  onPushToAttio,
  onExportCSV,
  onReEnrich,
  onRetryFailed,
  onRemixAll,
  aiColumnCount = 0,
  isEnriching = false,
  isPushingToInstantly = false,
  isRemixingAll = false,
  enrichProgress = 0,
}: BulkActionsBarProps) {
  const isVisible = selectedCount > 0;
  const [showRemixConfirm, setShowRemixConfirm] = useState(false);

  return (
    <>
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/90 shadow-2xl backdrop-blur-xl">
        {/* Progress bar overlay */}
        {isEnriching && (
          <div className="absolute inset-x-0 top-0 h-1 bg-gray-800">
            <div
              className="h-full bg-violet-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(enrichProgress, 100)}%` }}
            />
          </div>
        )}

        <div className="flex items-center gap-1 px-4 py-3">
          {/* Selected count */}
          <span className="mr-2 whitespace-nowrap text-sm font-medium text-gray-300">
            {selectedCount} selected
            <span className="ml-1 text-gray-500">of {totalCount}</span>
          </span>

          {/* Divider */}
          <div className="mx-2 h-5 w-px bg-gray-700" />

          {/* Enrich Button */}
          <button
            onClick={onEnrich}
            disabled={isEnriching}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" />
            {isEnriching ? 'Enriching...' : 'Enrich'}
          </button>

          {/* Push to Instantly Button */}
          <button
            onClick={onPushToInstantly}
            disabled={isEnriching || isPushingToInstantly}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPushingToInstantly ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isPushingToInstantly ? 'Pushing...' : 'Push to Instantly'}
          </button>

          {/* Push to HubSpot Button */}
          {onPushToHubSpot && (
            <button
              onClick={onPushToHubSpot}
              disabled={isEnriching}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              HubSpot
            </button>
          )}

          {/* Push to Attio Button */}
          {onPushToAttio && (
            <button
              onClick={onPushToAttio}
              disabled={isEnriching}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Upload className="h-4 w-4" />
              Attio
            </button>
          )}

          {/* Export CSV Button */}
          {onExportCSV && (
            <button
              onClick={onExportCSV}
              className="flex items-center gap-2 rounded-lg bg-gray-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-600"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}

          {/* Re-enrich Button */}
          {onReEnrich && (
            <button
              onClick={onReEnrich}
              disabled={isEnriching}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-violet-400 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" />
              Re-enrich
            </button>
          )}

          {/* Remix All Button */}
          {onRemixAll && (
            <button
              onClick={() => setShowRemixConfirm(true)}
              disabled={isEnriching || isRemixingAll}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRemixingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {isRemixingAll ? 'Generating...' : 'Remix All'}
            </button>
          )}

          {/* Delete Button */}
          <button
            onClick={onDelete}
            disabled={isEnriching}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>

          {/* Divider */}
          <div className="mx-2 h-5 w-px bg-gray-700" />

          {/* Deselect All */}
          <button
            onClick={onDeselectAll}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            title="Deselect all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    {/* Remix All confirmation dialog */}

    {showRemixConfirm && onRemixAll && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        onClick={() => setShowRemixConfirm(false)}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-800">
            <Wand2 className="h-5 w-5 text-violet-400 shrink-0" />
            <h2 className="text-sm font-semibold text-white">Remix All AI Columns</h2>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm text-gray-300">
              This will regenerate all AI content for{' '}
              <span className="font-semibold text-white">{selectedCount} row{selectedCount !== 1 ? 's' : ''}</span>
              {aiColumnCount > 0 && (
                <>
                  {' '}across{' '}
                  <span className="font-semibold text-white">{aiColumnCount} AI column{aiColumnCount !== 1 ? 's' : ''}</span>
                </>
              )}.
            </p>
            <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Each generation consumes AI credits. Existing results will be overwritten.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800">
            <button
              onClick={() => setShowRemixConfirm(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowRemixConfirm(false);
                onRemixAll();
              }}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              <Wand2 className="h-4 w-4" />
              Remix All
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default BulkActionsBar;
