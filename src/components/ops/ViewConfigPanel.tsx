import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Columns3,
  Paintbrush,
  GripVertical,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sparkles,
  Sigma,
  Group,
  Bot,
  Loader2,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConditionalFormattingEditor } from './ConditionalFormattingEditor';
import { ViewTemplateLibrary } from './ViewTemplateLibrary';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';
import { generateAutoFormatRules } from '@/lib/utils/autoFormatting';
import type { ViewTemplateResult } from '@/lib/utils/viewTemplates';
import type {
  OpsTableColumn,
  OpsTableRow,
  FilterCondition,
  FilterOperator,
  SortConfig,
  GroupConfig,
  AggregateType,
} from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not contains' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
];

const NO_VALUE_OPS: FilterOperator[] = ['is_empty', 'is_not_empty'];

const AGGREGATE_TYPES: { value: AggregateType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'filled_percent', label: 'Filled %' },
  { value: 'unique_count', label: 'Unique' },
];

/** Normalize sort_config from legacy single-object or new array format */
export function normalizeSortConfig(
  cfg: SortConfig | SortConfig[] | null | undefined
): SortConfig[] {
  if (!cfg) return [];
  if (Array.isArray(cfg)) return cfg;
  return [cfg];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewConfigState {
  name: string;
  filters: FilterCondition[];
  sorts: SortConfig[];
  columnOrder: string[] | null;
  formattingRules: FormattingRule[];
  groupConfig: GroupConfig | null;
  summaryConfig: Record<string, AggregateType> | null;
}

interface ViewConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ViewConfigState) => void;
  columns: OpsTableColumn[];
  rows?: OpsTableRow[];
  totalRows: number;
  filteredRows: number;
  /** If editing an existing view, pass its current config */
  existingConfig?: Partial<ViewConfigState> & { viewId?: string };
  /** Whether we're editing vs creating */
  mode?: 'create' | 'edit';
  /** Live preview callbacks */
  onFiltersChange?: (filters: FilterCondition[]) => void;
  onSortsChange?: (sorts: SortConfig[]) => void;
  onColumnOrderChange?: (order: string[] | null) => void;
  /** Natural language query callback — sends a describe-your-view prompt to the AI */
  onNlQuery?: (query: string) => void;
  /** Whether NL query is loading */
  nlQueryLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        )}
        <span className="text-gray-400">{icon}</span>
        <span className="text-sm font-medium text-gray-200 flex-1">{title}</span>
        {badge && (
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
            {badge}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ViewConfigPanel({
  isOpen,
  onClose,
  onSave,
  columns,
  totalRows,
  filteredRows,
  existingConfig,
  mode = 'create',
  rows = [],
  onFiltersChange,
  onSortsChange,
  onColumnOrderChange,
  onNlQuery,
  nlQueryLoading = false,
}: ViewConfigPanelProps) {
  // ---- state ----
  const [name, setName] = useState('');
  const [nlInput, setNlInput] = useState('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortConfig[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [formattingRules, setFormattingRules] = useState<FormattingRule[]>([]);
  const [groupConfig, setGroupConfig] = useState<GroupConfig | null>(null);
  const [summaryConfig, setSummaryConfig] = useState<Record<string, AggregateType> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ---- initialize from existing config on open ----
  useEffect(() => {
    if (!isOpen) return;
    if (existingConfig) {
      setName(existingConfig.name ?? '');
      setFilters(existingConfig.filters ?? []);
      setSorts(existingConfig.sorts ?? []);
      setVisibleColumns(
        existingConfig.columnOrder ?? columns.filter((c) => c.is_visible).map((c) => c.key)
      );
      setFormattingRules(existingConfig.formattingRules ?? []);
      setGroupConfig(existingConfig.groupConfig ?? null);
      setSummaryConfig(existingConfig.summaryConfig ?? null);
    } else {
      setName('');
      setFilters([]);
      setSorts([]);
      setVisibleColumns(columns.filter((c) => c.is_visible).map((c) => c.key));
      setFormattingRules([]);
      setGroupConfig(null);
      setSummaryConfig(null);
    }
    setTimeout(() => nameInputRef.current?.focus(), 200);
  }, [isOpen, existingConfig, columns]);

  // ---- live preview ----
  useEffect(() => {
    if (isOpen) onFiltersChange?.(filters);
  }, [filters, isOpen]);

  useEffect(() => {
    if (isOpen) onSortsChange?.(sorts);
  }, [sorts, isOpen]);

  useEffect(() => {
    if (isOpen) onColumnOrderChange?.(visibleColumns.length > 0 ? visibleColumns : null);
  }, [visibleColumns, isOpen]);

  // ---- filter helpers ----
  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      { column_key: columns[0]?.key ?? '', operator: 'is_not_empty' as FilterOperator, value: '' },
    ]);
  };

  const updateFilter = (i: number, updates: Partial<FilterCondition>) => {
    setFilters((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...updates } : f)));
  };

  const removeFilter = (i: number) => {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ---- sort helpers ----
  const addSort = () => {
    const usedKeys = new Set(sorts.map((s) => s.key));
    const nextCol = columns.find((c) => !usedKeys.has(c.key));
    if (!nextCol) return;
    setSorts((prev) => [...prev, { key: nextCol.key, dir: 'asc' }]);
  };

  const updateSort = (i: number, updates: Partial<SortConfig>) => {
    setSorts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...updates } : s)));
  };

  const removeSort = (i: number) => {
    setSorts((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ---- column helpers ----
  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const showAllColumns = () => setVisibleColumns(columns.map((c) => c.key));
  const hideAllColumns = () => setVisibleColumns([]);

  // Columns sorted: visible first in order, hidden after
  const orderedColumns = useMemo(() => {
    const visible = visibleColumns
      .map((key) => columns.find((c) => c.key === key))
      .filter(Boolean) as OpsTableColumn[];
    const hidden = columns.filter((c) => !visibleColumns.includes(c.key));
    return [...visible, ...hidden];
  }, [columns, visibleColumns]);

  // ---- save ----
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      filters,
      sorts,
      columnOrder: visibleColumns.length > 0 ? visibleColumns : null,
      formattingRules,
      groupConfig,
      summaryConfig,
    });
  };

  // ---- template apply ----
  const handleApplyTemplate = (result: ViewTemplateResult) => {
    setName(result.name);
    setFilters(result.filters);
    setSorts(result.sorts);
    if (result.columnOrder) setVisibleColumns(result.columnOrder);
    if (result.formattingRules.length > 0) setFormattingRules(result.formattingRules);
  };

  // ---- auto-format ----
  const handleAutoFormat = () => {
    const autoRules = generateAutoFormatRules(columns, rows as OpsTableRow[]);
    setFormattingRules(autoRules);
  };

  // ---- badges ----
  const filterBadge = filters.length > 0 ? `${filters.length}` : undefined;
  const sortBadge = sorts.length > 0 ? `${sorts.length}` : undefined;
  const columnBadge =
    visibleColumns.length < columns.length ? `${visibleColumns.length}/${columns.length}` : undefined;
  const fmtBadge = formattingRules.length > 0 ? `${formattingRules.length}` : undefined;
  const groupBadge = groupConfig ? '1' : undefined;
  const summaryBadge = summaryConfig
    ? `${Object.values(summaryConfig).filter((v) => v !== 'none').length}`
    : undefined;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ top: 'var(--app-top-offset, 64px)' }}
            className="fixed inset-x-0 bottom-0 z-40 bg-black/30"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{ top: 'var(--app-top-offset, 64px)', height: 'calc(100dvh - var(--app-top-offset, 64px))' }}
            className="fixed right-0 z-50 flex w-[420px] max-w-[90vw] flex-col border-l border-gray-800 bg-gray-900 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {mode === 'edit' ? `Edit View` : 'New View'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-[11px] text-violet-400 hover:bg-gray-700 transition-colors"
                >
                  <Sparkles className="w-3 h-3" /> Templates
                </button>
                <span className="rounded bg-gray-800 px-2 py-1 text-[11px] text-gray-400">
                  {filteredRows} of {totalRows} rows
                </span>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* Name */}
              <div className="border-b border-gray-800 px-4 py-3">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  View name
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. High-Value Pipeline"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20"
                />
              </div>

              {/* NL Describe View */}
              {onNlQuery && (
                <div className="border-b border-gray-800 px-4 py-3">
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    <Bot className="h-3 w-3 text-violet-400" />
                    Describe your view
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={nlInput}
                      onChange={(e) => setNlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && nlInput.trim()) {
                          onNlQuery(nlInput.trim());
                          setNlInput('');
                        }
                      }}
                      placeholder="e.g. California leads over $10k sorted by score"
                      disabled={nlQueryLoading}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 disabled:opacity-50"
                    />
                    <button
                      onClick={() => {
                        if (nlInput.trim()) {
                          onNlQuery(nlInput.trim());
                          setNlInput('');
                        }
                      }}
                      disabled={!nlInput.trim() || nlQueryLoading}
                      className="rounded-lg bg-violet-600 px-2 py-1.5 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                    >
                      {nlQueryLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <Section
                title="Filters"
                icon={<Filter className="w-4 h-4" />}
                badge={filterBadge}
                defaultOpen={filters.length > 0}
              >
                {filters.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={f.column_key}
                      onChange={(e) => updateFilter(i, { column_key: e.target.value })}
                      className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.operator}
                      onChange={(e) =>
                        updateFilter(i, { operator: e.target.value as FilterOperator })
                      }
                      className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {FILTER_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    {!NO_VALUE_OPS.includes(f.operator) && (
                      <input
                        type="text"
                        value={f.value}
                        onChange={(e) => updateFilter(i, { value: e.target.value })}
                        placeholder="Value"
                        className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white placeholder-gray-500 outline-none"
                      />
                    )}
                    <button onClick={() => removeFilter(i)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addFilter}
                  className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                >
                  <Plus className="w-3 h-3" /> Add filter
                </button>
              </Section>

              {/* Sort */}
              <Section
                title="Sort"
                icon={<ArrowUpDown className="w-4 h-4" />}
                badge={sortBadge}
                defaultOpen={sorts.length > 0}
              >
                {sorts.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-8">
                      {i === 0 ? 'By' : 'Then'}
                    </span>
                    <select
                      value={s.key}
                      onChange={(e) => updateSort(i, { key: e.target.value })}
                      className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                    >
                      {columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateSort(i, { dir: s.dir === 'asc' ? 'desc' : 'asc' })}
                      className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white hover:bg-gray-700"
                    >
                      {s.dir === 'asc' ? 'A → Z' : 'Z → A'}
                    </button>
                    <button onClick={() => removeSort(i)} className="text-gray-600 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {sorts.length < columns.length && (
                  <button
                    onClick={addSort}
                    className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-3 h-3" /> Add sort
                  </button>
                )}
              </Section>

              {/* Columns */}
              <Section
                title="Columns"
                icon={<Columns3 className="w-4 h-4" />}
                badge={columnBadge}
              >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={showAllColumns}
                    className="text-[11px] text-violet-400 hover:text-violet-300"
                  >
                    Show all
                  </button>
                  <span className="text-gray-700">|</span>
                  <button
                    onClick={hideAllColumns}
                    className="text-[11px] text-violet-400 hover:text-violet-300"
                  >
                    Hide all
                  </button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {orderedColumns.map((col) => {
                    const isVisible = visibleColumns.includes(col.key);
                    return (
                      <button
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                          isVisible
                            ? 'text-white hover:bg-gray-800'
                            : 'text-gray-500 hover:bg-gray-800/50'
                        }`}
                      >
                        {isVisible ? (
                          <Eye className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-gray-600" />
                        )}
                        <span className={isVisible ? '' : 'line-through'}>{col.label}</span>
                        <span className="ml-auto text-[10px] text-gray-600">{col.column_type}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Group By */}
              <Section
                title="Group by"
                icon={<Group className="w-4 h-4" />}
                badge={groupBadge}
              >
                <select
                  value={groupConfig?.column_key ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      setGroupConfig(null);
                    } else {
                      setGroupConfig({
                        column_key: e.target.value,
                        collapsed_by_default: groupConfig?.collapsed_by_default ?? false,
                        sort_groups_by: groupConfig?.sort_groups_by ?? 'alpha',
                      });
                    }
                  }}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white outline-none"
                >
                  <option value="">No grouping</option>
                  {columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {groupConfig && (
                  <div className="flex items-center gap-4 mt-1">
                    <label className="flex items-center gap-1.5 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={groupConfig.collapsed_by_default ?? false}
                        onChange={(e) =>
                          setGroupConfig((prev) =>
                            prev ? { ...prev, collapsed_by_default: e.target.checked } : prev
                          )
                        }
                        className="rounded border-gray-600"
                      />
                      Collapse by default
                    </label>
                    <select
                      value={groupConfig.sort_groups_by ?? 'alpha'}
                      onChange={(e) =>
                        setGroupConfig((prev) =>
                          prev
                            ? { ...prev, sort_groups_by: e.target.value as 'alpha' | 'count' }
                            : prev
                        )
                      }
                      className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
                    >
                      <option value="alpha">Sort A-Z</option>
                      <option value="count">Sort by count</option>
                    </select>
                  </div>
                )}
              </Section>

              {/* Formatting */}
              <Section
                title="Formatting"
                icon={<Paintbrush className="w-4 h-4" />}
                badge={fmtBadge}
              >
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={handleAutoFormat}
                    className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-400 hover:bg-violet-500/20 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    {formattingRules.length > 0 ? 'Re-format' : 'Auto-format'}
                  </button>
                  {formattingRules.length > 0 && (
                    <button
                      onClick={() => setFormattingRules([])}
                      className="text-[11px] text-gray-500 hover:text-gray-300"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <ConditionalFormattingEditor
                  columns={columns}
                  rules={formattingRules}
                  onChange={setFormattingRules}
                />
              </Section>

              {/* Summary */}
              <Section
                title="Summary row"
                icon={<Sigma className="w-4 h-4" />}
                badge={summaryBadge}
              >
                <p className="text-[11px] text-gray-500 mb-2">
                  Choose an aggregate function for each column. Values appear in a sticky bottom row.
                </p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {columns
                    .filter((c) => visibleColumns.includes(c.key))
                    .map((col) => {
                      const current = summaryConfig?.[col.key] ?? 'none';
                      return (
                        <div key={col.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-gray-300 truncate">{col.label}</span>
                          <select
                            value={current}
                            onChange={(e) => {
                              const val = e.target.value as AggregateType;
                              setSummaryConfig((prev) => {
                                const next = { ...(prev ?? {}) };
                                if (val === 'none') {
                                  delete next[col.key];
                                } else {
                                  next[col.key] = val;
                                }
                                return Object.keys(next).length > 0 ? next : null;
                              });
                            }}
                            className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
                          >
                            {AGGREGATE_TYPES.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                </div>
              </Section>
            </div>

            {/* Template library overlay */}
            {showTemplates && (
              <div className="absolute inset-0 z-20">
                <ViewTemplateLibrary
                  isOpen={showTemplates}
                  onClose={() => setShowTemplates(false)}
                  columns={columns}
                  onApply={handleApplyTemplate}
                />
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-800 px-4 py-3 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!name.trim()}
                className="bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
              >
                {mode === 'edit' ? 'Save changes' : 'Create view'}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
