import React from 'react';
import { X } from 'lucide-react';
import type { FilterCondition } from '@/lib/services/opsTableService';
import { FILTER_OPERATORS } from '@/lib/utils/opsTableFilters';

interface ActiveFilterBarProps {
  conditions: FilterCondition[];
  columns: { key: string; label: string; column_type: string }[];
  onRemove: (index: number) => void;
  onClearAll: () => void;
  onEditFilter: (index: number) => void;
}

function getOperatorLabel(operator: string): string {
  const meta = FILTER_OPERATORS.find((fo) => fo.value === operator);
  return meta?.label ?? operator;
}

export function ActiveFilterBar({
  conditions,
  columns,
  onRemove,
  onClearAll,
  onEditFilter,
}: ActiveFilterBarProps) {
  if (conditions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {conditions.map((condition, index) => {
        const col = columns.find((c) => c.key === condition.column_key);
        const columnLabel = col?.label ?? condition.column_key;
        const operatorLabel = getOperatorLabel(condition.operator);
        const hideValue =
          condition.operator === 'is_empty' || condition.operator === 'is_not_empty';

        return (
          <div
            key={`${condition.column_key}-${condition.operator}-${index}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-300"
          >
            <button
              onClick={() => onEditFilter(index)}
              className="transition-colors hover:text-violet-100"
            >
              {columnLabel} {operatorLabel}
              {!hideValue && condition.value ? ` "${condition.value}"` : ''}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-violet-500/20 hover:text-violet-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      <button
        onClick={onClearAll}
        className="text-xs text-gray-500 transition-colors hover:text-gray-300"
      >
        Clear all
      </button>
    </div>
  );
}

export default ActiveFilterBar;
