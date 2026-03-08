/**
 * PipelineTable Component (PIPE-012)
 *
 * Premium glass-morphism table view with health columns and inline indicators.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Square, CheckSquare, Ghost } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import type { PipelineDeal } from './hooks/usePipelineData';
import type { PipelineColumn } from './hooks/usePipelineColumns';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface PipelineTableProps {
  deals: PipelineDeal[];
  onDealClick: (dealId: string) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  /** Multi-select support (PIPE-ADV-002) */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Column visibility (PIPE-ADV-004) */
  visibleColumns?: PipelineColumn[];
}

// =============================================================================
// Helper Functions
// =============================================================================


/**
 * Deterministic avatar gradient from a name string
 */
function getAvatarGradient(name: string | null): string {
  const gradients = [
    'from-violet-600 to-violet-400',
    'from-blue-600 to-blue-400',
    'from-emerald-600 to-emerald-400',
    'from-amber-600 to-amber-400',
    'from-pink-600 to-pink-400',
    'from-cyan-600 to-cyan-400',
    'from-red-600 to-red-400',
    'from-indigo-600 to-indigo-400',
  ];
  if (!name) return gradients[0];
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

/**
 * Get initials from a name (up to 2 characters)
 */
function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Get health dot color + glow classes
 */
function getHealthDotClasses(status: string | null): { dot: string; glow: string; text: string } {
  switch (status) {
    case 'healthy':
      return {
        dot: 'bg-emerald-500',
        glow: 'shadow-[0_0_6px_rgba(52,217,154,0.4)]',
        text: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'warning':
    case 'at_risk':
      return {
        dot: 'bg-amber-500',
        glow: 'shadow-[0_0_6px_rgba(251,191,36,0.4)]',
        text: 'text-amber-600 dark:text-amber-400',
      };
    case 'critical':
      return {
        dot: 'bg-red-500',
        glow: 'shadow-[0_0_6px_rgba(248,113,113,0.4)]',
        text: 'text-red-600 dark:text-red-400',
      };
    case 'stalled':
    case 'ghost':
      return {
        dot: 'bg-gray-400',
        glow: 'shadow-[0_0_6px_rgba(156,163,175,0.3)]',
        text: 'text-gray-500 dark:text-gray-400',
      };
    default:
      return {
        dot: 'bg-gray-300 dark:bg-gray-600',
        glow: '',
        text: 'text-gray-500 dark:text-gray-400',
      };
  }
}

/**
 * Get probability bar + text color classes
 */
function getProbabilityColors(probability: number | null): { bar: string; text: string } {
  const p = probability ?? 0;
  if (p > 60) return { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
  if (p >= 30) return { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
}

/**
 * Get risk badge label
 */
function getRiskLabel(level: string | null): string {
  switch (level) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return '--';
  }
}

/**
 * Get risk dot/text colors
 */
function getRiskColors(level: string | null): { dot: string; glow: string; text: string } {
  switch (level) {
    case 'critical':
      return {
        dot: 'bg-red-500',
        glow: 'shadow-[0_0_6px_rgba(248,113,113,0.4)]',
        text: 'text-red-600 dark:text-red-400',
      };
    case 'high':
      return {
        dot: 'bg-orange-500',
        glow: 'shadow-[0_0_6px_rgba(249,115,22,0.4)]',
        text: 'text-orange-600 dark:text-orange-400',
      };
    case 'medium':
      return {
        dot: 'bg-amber-500',
        glow: 'shadow-[0_0_6px_rgba(251,191,36,0.4)]',
        text: 'text-amber-600 dark:text-amber-400',
      };
    case 'low':
      return {
        dot: 'bg-emerald-500',
        glow: 'shadow-[0_0_6px_rgba(52,217,154,0.4)]',
        text: 'text-emerald-600 dark:text-emerald-400',
      };
    default:
      return {
        dot: 'bg-gray-300 dark:bg-gray-600',
        glow: '',
        text: 'text-gray-500 dark:text-gray-400',
      };
  }
}

/**
 * Format health status label
 */
function formatHealthLabel(status: string | null): string {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'warning':
      return 'Warning';
    case 'at_risk':
      return 'At Risk';
    case 'critical':
      return 'Critical';
    case 'stalled':
      return 'Stalled';
    case 'ghost':
      return 'Ghost';
    default:
      return '--';
  }
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Column header with sort indicator
 */
function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (column: string) => void;
}) {
  const isSorted = sortBy === column;

  return (
    <th
      className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors select-none"
      onClick={() => onSort?.(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isSorted && (
          sortDir === 'asc'
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />
        )}
      </div>
    </th>
  );
}

/**
 * Stage pill with colored dot
 */
function StagePill({ name, color }: { name: string | null; color: string | null }) {
  const label = name || 'Unknown';
  const bgColor = color ? `${color}18` : undefined;
  const textColor = color || undefined;
  const dotColor = color || '#9ca3af';

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        backgroundColor: bgColor,
        color: textColor,
      }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  );
}

/**
 * Health pill with glowing dot
 */
function HealthPill({ status, score }: { status: string | null; score: number | null }) {
  const { dot, glow, text } = getHealthDotClasses(status);
  const label = score !== null ? score : formatHealthLabel(status);

  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${dot} ${glow}`} />
      {label}
    </span>
  );
}

/**
 * Probability bar with numeric value
 */
function ProbabilityBar({ probability }: { probability: number | null }) {
  const value = probability ?? 0;
  const { bar, text } = getProbabilityColors(probability);

  return (
    <div className="flex items-center gap-2">
      <div className="w-[50px] h-[5px] bg-gray-100 dark:bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-300`}
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
        />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums ${text}`}>
        {value}%
      </span>
    </div>
  );
}

/**
 * Owner avatar with gradient and initials
 */
function OwnerAvatar({ name }: { name: string | null }) {
  const gradient = getAvatarGradient(name);
  const initials = getInitials(name);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}
      >
        <span className="text-[9px] font-bold text-white leading-none">
          {initials}
        </span>
      </div>
      {name && (
        <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
          {name}
        </span>
      )}
    </div>
  );
}

/**
 * Company column with gradient avatar, company name, and deal name
 */
function CompanyCell({ company, dealName }: { company: string | null; dealName: string }) {
  const gradient = getAvatarGradient(company);
  const initials = getInitials(company);

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}
      >
        <span className="text-[10px] font-bold text-white leading-none">
          {initials}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {company || 'No Company'}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
          {dealName}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

// Default columns for when visibleColumns is not provided
const DEFAULT_COLUMN_IDS = ['company', 'value', 'stage', 'health', 'rel_health', 'risk', 'probability', 'days', 'close_date', 'overdue', 'owner'];

/** Inline editable number cell */
function InlineNumberEdit({ value, onSave, min = 0, max = 100, suffix = '%' }: {
  value: number | null;
  onSave: (val: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value ?? ''));
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const save = () => {
    const num = parseInt(draft, 10);
    if (!isNaN(num) && num >= min && num <= max && num !== value) {
      onSave(num);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        onClick={(e) => e.stopPropagation()}
        className="w-16 px-1.5 py-0.5 text-xs rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
      />
    );
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-500/10 px-1.5 py-0.5 rounded transition-colors"
      title="Click to edit"
    >
      {value != null ? `${value}${suffix}` : '--'}
    </span>
  );
}

/** Inline editable date cell */
function InlineDateEdit({ value, onSave }: { value: string | null; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.showPicker?.(), 50);
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        defaultValue={value ? format(new Date(value), 'yyyy-MM-dd') : ''}
        onChange={(e) => {
          if (e.target.value) {
            onSave(e.target.value);
            setEditing(false);
          }
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        onClick={(e) => e.stopPropagation()}
        className="w-32 px-1.5 py-0.5 text-xs rounded border border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
      />
    );
  }

  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-500/10 px-1.5 py-0.5 rounded transition-colors"
      title="Click to edit"
    >
      {value ? format(new Date(value), 'MMM d, yyyy') : '--'}
    </span>
  );
}

export function PipelineTable({
  deals,
  onDealClick,
  sortBy,
  sortDir,
  onSort,
  selectedIds,
  onSelectionChange,
  visibleColumns,
}: PipelineTableProps) {
  const { formatMoney: fmtMoney } = useOrgMoney();
  const formatCurrency = (value: number | null) => fmtMoney(value ?? 0);

  const isMultiSelect = !!onSelectionChange;
  const selection = selectedIds || new Set<string>();

  // Determine which column IDs are visible
  const visibleIds = visibleColumns
    ? visibleColumns.map((c) => c.id)
    : DEFAULT_COLUMN_IDS;

  const isVisible = (id: string) => visibleIds.includes(id);

  const queryClient = useQueryClient();

  const updateDeal = useCallback(async (dealId: string, updates: Record<string, any>) => {
    const { error } = await supabase.from('deals').update(updates).eq('id', dealId);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
    } else {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    }
  }, [queryClient]);

  if (deals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No deals found
      </div>
    );
  }

  // Build owner name from split_users if available
  const getOwnerName = (deal: PipelineDeal): string | null => {
    if (deal.split_users && deal.split_users.length > 0) {
      return deal.split_users[0].full_name || null;
    }
    return null;
  };

  const handleCheckbox = (e: React.MouseEvent, dealId: string) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    const next = new Set(selection);
    if (next.has(dealId)) {
      next.delete(dealId);
    } else {
      next.add(dealId);
    }
    onSelectionChange(next);
  };

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selection.size === deals.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(deals.map((d) => d.id)));
    }
  };

  const allSelected = deals.length > 0 && selection.size === deals.length;

  return (
    <div className="rounded-2xl overflow-hidden bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.06]">
      <div className="overflow-x-auto">
        <table
          className="min-w-full"
          style={{ borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead className="bg-gray-50/80 dark:bg-white/[0.02] backdrop-blur-xl">
            <tr>
              {/* Checkbox column for multi-select */}
              {isMultiSelect && (
                <th className="pl-4 pr-2 py-3 w-10">
                  <button onClick={handleSelectAll} className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    {allSelected
                      ? <CheckSquare className="w-4 h-4 text-blue-500" />
                      : <Square className="w-4 h-4" />
                    }
                  </button>
                </th>
              )}
              {isVisible('company') && <SortableHeader label="Company" column="company" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              {isVisible('value') && <SortableHeader label="Value" column="value" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              {isVisible('stage') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Stage
                </th>
              )}
              {isVisible('health') && <SortableHeader label="Health" column="health_score" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              {isVisible('rel_health') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Rel. Health
                </th>
              )}
              {isVisible('risk') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Risk
                </th>
              )}
              {isVisible('probability') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Probability
                </th>
              )}
              {isVisible('days') && <SortableHeader label="Days" column="days_in_stage" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              {isVisible('close_date') && <SortableHeader label="Close Date" column="close_date" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />}
              {isVisible('overdue') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Overdue
                </th>
              )}
              {isVisible('owner') && (
                <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {deals.map((deal, index) => {
              const ownerName = getOwnerName(deal);
              const riskColors = getRiskColors(deal.risk_level);
              const isLast = index === deals.length - 1;
              const isSelected = selection.has(deal.id);

              return (
                <tr
                  key={deal.id}
                  onClick={() => onDealClick(deal.id)}
                  className={`transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-500/[0.06]'
                      : 'hover:bg-gray-50/50 dark:hover:bg-white/[0.02]'
                  } ${!isLast ? 'border-b border-gray-100 dark:border-white/[0.06]' : ''}`}
                >
                  {/* Checkbox cell */}
                  {isMultiSelect && (
                    <td className="pl-4 pr-2 py-3 whitespace-nowrap w-10">
                      <button
                        onClick={(e) => handleCheckbox(e, deal.id)}
                        className="flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-blue-500 transition-colors"
                      >
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-500" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>
                    </td>
                  )}

                  {/* Company + Deal Name */}
                  {isVisible('company') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <CompanyCell company={deal.company} dealName={deal.name} />
                    </td>
                  )}

                  {/* Value */}
                  {isVisible('value') && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(deal.value)}
                    </td>
                  )}

                  {/* Stage */}
                  {isVisible('stage') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StagePill name={deal.stage_name} color={deal.stage_color} />
                    </td>
                  )}

                  {/* Health Score */}
                  {isVisible('health') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <HealthPill status={deal.health_status} score={deal.health_score} />
                    </td>
                  )}

                  {/* Relationship Health */}
                  {isVisible('rel_health') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <HealthPill status={deal.relationship_health_status} score={deal.relationship_health_score} />
                    </td>
                  )}

                  {/* Risk */}
                  {isVisible('risk') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`flex items-center gap-1.5 text-xs font-semibold ${riskColors.text}`}>
                        <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${riskColors.dot} ${riskColors.glow}`} />
                        {getRiskLabel(deal.risk_level)}
                      </span>
                    </td>
                  )}

                  {/* Probability (inline editable) */}
                  {isVisible('probability') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <InlineNumberEdit
                        value={deal.probability}
                        onSave={(val) => updateDeal(deal.id, { probability: val })}
                      />
                    </td>
                  )}

                  {/* Days in Stage */}
                  {isVisible('days') && (
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                      {deal.days_in_current_stage || 0}d
                    </td>
                  )}

                  {/* Close Date (inline editable) */}
                  {isVisible('close_date') && (
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                      <InlineDateEdit
                        value={deal.close_date}
                        onSave={(val) => updateDeal(deal.id, { close_date: val })}
                      />
                    </td>
                  )}

                  {/* Overdue */}
                  {isVisible('overdue') && (() => {
                    const closeDate = deal.close_date || deal.expected_close_date;
                    const isTerminal = deal.probability === 0 || deal.probability === 100;
                    const daysOverdue = !isTerminal && closeDate
                      ? differenceInDays(new Date(), new Date(closeDate))
                      : 0;
                    return (
                      <td className="px-4 py-3 whitespace-nowrap text-xs tabular-nums">
                        {daysOverdue > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-semibold">{daysOverdue}d</span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                    );
                  })()}

                  {/* Owner */}
                  {isVisible('owner') && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <OwnerAvatar name={ownerName} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
