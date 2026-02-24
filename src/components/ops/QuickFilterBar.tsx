import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ListFilter, X, ChevronDown } from 'lucide-react';
import type { FilterCondition, OpsTableColumn, OpsTableRow } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickFilterBarProps {
  columns: OpsTableColumn[];
  rows: OpsTableRow[];
  activeFilters: FilterCondition[];
  onAddFilter: (condition: FilterCondition) => void;
  onRemoveFilter: (index: number) => void;
}

// Column types that work well as quick filters
const QUICK_FILTER_TYPES = new Set(['dropdown', 'status', 'tags', 'boolean', 'checkbox']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_VISIBLE_FILTERS = 3;

export function QuickFilterBar({
  columns,
  rows,
  activeFilters,
  onAddFilter,
  onRemoveFilter,
}: QuickFilterBarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Identify filterable columns: explicit types or low cardinality text
  const filterableColumns = useMemo(() => {
    return columns.filter((col) => {
      if (QUICK_FILTER_TYPES.has(col.column_type)) return true;
      // Text columns with < 15 unique values
      if (col.column_type === 'text') {
        const uniqueVals = new Set(
          rows
            .map((r) => r.cells[col.key]?.value)
            .filter((v): v is string => v != null && v !== '')
        );
        return uniqueVals.size > 0 && uniqueVals.size <= 15;
      }
      return false;
    });
  }, [columns, rows]);

  // Get unique values for a column
  const getUniqueValues = (colKey: string): string[] => {
    const vals = new Set<string>();
    for (const row of rows) {
      const v = row.cells[colKey]?.value;
      if (v != null && v !== '') vals.add(v);
    }
    return [...vals].sort((a, b) => a.localeCompare(b));
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  // Check if a quick-filter value is active
  const isValueActive = (colKey: string, value: string) => {
    return activeFilters.some(
      (f) => f.column_key === colKey && f.operator === 'equals' && f.value === value
    );
  };

  const handleSelectValue = (colKey: string, value: string) => {
    const existingIndex = activeFilters.findIndex(
      (f) => f.column_key === colKey && f.operator === 'equals' && f.value === value
    );
    if (existingIndex >= 0) {
      onRemoveFilter(existingIndex);
    } else {
      onAddFilter({ column_key: colKey, operator: 'equals', value });
    }
  };

  // Active quick-filter conditions (equals on filterable columns)
  const activeQuickFilters = activeFilters
    .map((f, idx) => ({ ...f, idx }))
    .filter(
      (f) =>
        f.operator === 'equals' &&
        filterableColumns.some((c) => c.key === f.column_key)
    );

  if (filterableColumns.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <ListFilter className="w-3.5 h-3.5 text-gray-500 shrink-0" />

      {/* Active filter chips */}
      {activeQuickFilters.map((f) => {
        const col = columns.find((c) => c.key === f.column_key);
        return (
          <button
            key={`${f.column_key}-${f.value}`}
            onClick={() => onRemoveFilter(f.idx)}
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/30 transition-colors"
          >
            <span className="text-violet-400/70">{col?.label}:</span>
            <span>{f.value}</span>
            <X className="w-3 h-3 ml-0.5" />
          </button>
        );
      })}

      {/* Column filter dropdowns — show limited set unless expanded */}
      {filterableColumns
        .filter((col) => !activeQuickFilters.some((f) => f.column_key === col.key))
        .slice(0, showAllFilters ? undefined : MAX_VISIBLE_FILTERS)
        .map((col) => {
          const isOpen = openDropdown === col.key;
          return (
            <div key={col.key} className="relative" ref={isOpen ? dropdownRef : undefined}>
              <button
                onClick={() => setOpenDropdown(isOpen ? null : col.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isOpen
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                    : 'border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {col.label}
                <ChevronDown className="w-3 h-3" />
              </button>

              {isOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 w-48 max-h-60 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl">
                  {getUniqueValues(col.key).map((val) => {
                    const active = isValueActive(col.key, val);
                    return (
                      <button
                        key={val}
                        onClick={() => {
                          handleSelectValue(col.key, val);
                          setOpenDropdown(null);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'text-gray-300 hover:bg-gray-700/60'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                  {getUniqueValues(col.key).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-500">No values</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      {/* Show more / less toggle */}
      {(() => {
        const hiddenCount = filterableColumns.filter(
          (col) => !activeQuickFilters.some((f) => f.column_key === col.key)
        ).length - MAX_VISIBLE_FILTERS;
        if (hiddenCount <= 0) return null;
        return (
          <button
            onClick={() => setShowAllFilters((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-700/50 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:border-gray-600 hover:text-gray-300"
          >
            {showAllFilters ? 'Less' : `+${hiddenCount} more`}
          </button>
        );
      })()}
    </div>
  );
}
