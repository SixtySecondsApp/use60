/**
 * PipelineTable Component (PIPE-012)
 *
 * Premium glass-morphism table view with health columns and inline indicators.
 */

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import type { PipelineDeal } from './hooks/usePipelineData';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

interface PipelineTableProps {
  deals: PipelineDeal[];
  onDealClick: (dealId: string) => void;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (column: string) => void;
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

export function PipelineTable({
  deals,
  onDealClick,
  sortBy,
  sortDir,
  onSort,
}: PipelineTableProps) {
  const { formatMoney: fmtMoney } = useOrgMoney();
  const formatCurrency = (value: number | null) => fmtMoney(value ?? 0);

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

  return (
    <div className="rounded-2xl overflow-hidden bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.06]">
      <div className="overflow-x-auto">
        <table
          className="min-w-full"
          style={{ borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead className="bg-gray-50/80 dark:bg-white/[0.02] backdrop-blur-xl">
            <tr>
              <SortableHeader label="Company" column="company" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Value" column="value" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Stage
              </th>
              <SortableHeader label="Health" column="health_score" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Rel. Health
              </th>
              <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Risk
              </th>
              <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Probability
              </th>
              <SortableHeader label="Days" column="days_in_stage" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortableHeader label="Close Date" column="close_date" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left text-[10.5px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                Owner
              </th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal, index) => {
              const ownerName = getOwnerName(deal);
              const riskColors = getRiskColors(deal.risk_level);
              const isLast = index === deals.length - 1;

              return (
                <tr
                  key={deal.id}
                  onClick={() => onDealClick(deal.id)}
                  className={`hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer ${
                    !isLast ? 'border-b border-gray-100 dark:border-white/[0.06]' : ''
                  }`}
                >
                  {/* Company + Deal Name */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <CompanyCell company={deal.company} dealName={deal.name} />
                  </td>

                  {/* Value */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(deal.value)}
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StagePill name={deal.stage_name} color={deal.stage_color} />
                  </td>

                  {/* Health Score */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <HealthPill status={deal.health_status} score={deal.health_score} />
                  </td>

                  {/* Relationship Health */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <HealthPill status={deal.relationship_health_status} score={deal.relationship_health_score} />
                  </td>

                  {/* Risk */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${riskColors.text}`}>
                      <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${riskColors.dot} ${riskColors.glow}`} />
                      {getRiskLabel(deal.risk_level)}
                    </span>
                  </td>

                  {/* Probability */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ProbabilityBar probability={deal.probability} />
                  </td>

                  {/* Days in Stage */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                    {deal.days_in_current_stage || 0}d
                  </td>

                  {/* Close Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                    {deal.close_date ? format(new Date(deal.close_date), 'MMM d, yyyy') : '--'}
                  </td>

                  {/* Owner */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <OwnerAvatar name={ownerName} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
