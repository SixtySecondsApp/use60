/**
 * PipelineColumnCustomizer (PIPE-ADV-004)
 *
 * Dropdown to show/hide columns in the pipeline table.
 */

import React, { useState } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PipelineColumn } from './hooks/usePipelineColumns';

interface PipelineColumnCustomizerProps {
  allColumns: PipelineColumn[];
  visibleColumnIds: string[];
  onToggle: (columnId: string) => void;
  onReset: () => void;
}

export function PipelineColumnCustomizer({
  allColumns,
  visibleColumnIds,
  onToggle,
  onReset,
}: PipelineColumnCustomizerProps) {
  const [open, setOpen] = useState(false);

  const hiddenCount = allColumns.filter(
    (c) => !c.alwaysVisible && !visibleColumnIds.includes(c.id)
  ).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-xl transition-all
          ${hiddenCount > 0
            ? 'bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
            : 'bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04]'
          }
        `}>
          <Columns3 className="w-3.5 h-3.5" />
          Columns
          {hiddenCount > 0 && (
            <span className="text-[10px] font-bold">−{hiddenCount}</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[220px] p-0" align="end">
        <div className="p-3 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
          <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Columns
          </span>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        <div className="p-1.5 space-y-0.5">
          {allColumns.map((col) => {
            const isChecked = visibleColumnIds.includes(col.id);
            return (
              <label
                key={col.id}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                  col.alwaysVisible
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={col.alwaysVisible}
                  onChange={() => onToggle(col.id)}
                  className="rounded"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">{col.label}</span>
                {col.alwaysVisible && (
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">Always</span>
                )}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
