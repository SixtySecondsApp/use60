import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { FilterCondition, FilterOperator } from '@/lib/services/dynamicTableService';
import { FILTER_OPERATORS, getOperatorsForColumnType } from '@/lib/utils/dynamicTableFilters';

interface ColumnFilterPopoverProps {
  column: { id: string; key: string; label: string; column_type: string };
  onApply: (condition: FilterCondition) => void;
  onClose: () => void;
  anchorRect?: DOMRect;
  existingCondition?: FilterCondition; // pre-populate if editing an existing filter
}

export function ColumnFilterPopover({
  column,
  onApply,
  onClose,
  anchorRect,
  existingCondition,
}: ColumnFilterPopoverProps) {
  const availableOperators = getOperatorsForColumnType(column.column_type as any);
  const [operator, setOperator] = useState<FilterOperator>(
    existingCondition?.operator ?? availableOperators[0],
  );
  const [value, setValue] = useState(existingCondition?.value ?? '');
  const popoverRef = useRef<HTMLDivElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);

  const needsValue = operator !== 'is_empty' && operator !== 'is_not_empty';

  // Focus value input on mount
  useEffect(() => {
    if (needsValue) {
      setTimeout(() => valueInputRef.current?.focus(), 50);
    }
  }, [needsValue]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleApply = useCallback(() => {
    // For operators that need a value, require non-empty input
    if (needsValue && !value.trim()) return;

    onApply({
      column_key: column.key,
      operator,
      value: needsValue ? value.trim() : '',
    });
  }, [column.key, operator, value, needsValue, onApply]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  // Calculate position from anchor
  const style: React.CSSProperties = {};
  if (anchorRect) {
    style.position = 'fixed';
    style.top = anchorRect.bottom + 4;
    style.left = anchorRect.left;
    // Ensure popover doesn't overflow viewport right edge
    const popoverWidth = 280;
    if (anchorRect.left + popoverWidth > window.innerWidth) {
      style.left = window.innerWidth - popoverWidth - 8;
    }
  }

  return (
    <div
      ref={popoverRef}
      style={style}
      className="z-50 w-72 rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-2xl"
    >
      {/* Title */}
      <h3 className="mb-3 text-sm font-medium text-gray-200">
        Filter: {column.label}
      </h3>

      {/* Operator dropdown */}
      <label className="mb-1 block text-xs text-gray-500">Operator</label>
      <select
        value={operator}
        onChange={(e) => setOperator(e.target.value as FilterOperator)}
        className="mb-3 w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-violet-500"
      >
        {availableOperators.map((op) => {
          const meta = FILTER_OPERATORS.find((fo) => fo.value === op);
          return (
            <option key={op} value={op}>
              {meta?.label ?? op}
            </option>
          );
        })}
      </select>

      {/* Value input (hidden for is_empty / is_not_empty) */}
      {needsValue && (
        <>
          <label className="mb-1 block text-xs text-gray-500">Value</label>
          <input
            ref={valueInputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter value..."
            className="mb-4 w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-violet-500"
          />
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={needsValue && !value.trim()}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export default ColumnFilterPopover;
