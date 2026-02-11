/**
 * ICPAccuracyCheck — Panel that compares ICP criteria against a linked fact
 * profile's research data and displays alignment per dimension.
 *
 * Computes alignment on render via useMemo and displays:
 *   - Overall score with status badge (Verified / Needs Review / Misaligned)
 *   - Per-dimension score bars with expandable detail rows
 *   - Suggestions for partial/mismatch dimensions
 */

import { useMemo, useState } from 'react'
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  checkICPFactProfileAlignment,
  type AlignmentDimension,
  type AlignmentResult,
  type AlignmentStatus,
} from '@/lib/utils/icpFactProfileAlignment'
import type { ICPCriteria } from '@/lib/types/prospecting'
import type { FactProfile } from '@/lib/types/factProfile'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ICPAccuracyCheckProps {
  criteria: ICPCriteria
  factProfile: FactProfile
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

function getOverallConfig(score: number) {
  if (score >= 80) {
    return {
      label: 'Verified',
      variant: 'success' as const,
      icon: CheckCircle2,
      ringColor: 'text-brand-teal',
      bgColor: 'bg-brand-teal/10',
    }
  }
  if (score >= 50) {
    return {
      label: 'Needs Review',
      variant: 'warning' as const,
      icon: AlertTriangle,
      ringColor: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-500/10',
    }
  }
  return {
    label: 'Misaligned',
    variant: 'destructive' as const,
    icon: XCircle,
    ringColor: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-500/10',
  }
}

function getStatusConfig(status: AlignmentStatus) {
  switch (status) {
    case 'match':
      return {
        label: 'Match',
        barColor: 'bg-brand-teal',
        textColor: 'text-brand-teal dark:text-emerald-400',
        badgeCn:
          'bg-brand-teal/10 text-brand-teal border-brand-teal/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
      }
    case 'partial':
      return {
        label: 'Partial',
        barColor: 'bg-amber-400',
        textColor: 'text-amber-600 dark:text-amber-400',
        badgeCn:
          'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
      }
    case 'mismatch':
      return {
        label: 'Mismatch',
        barColor: 'bg-red-400',
        textColor: 'text-red-600 dark:text-red-400',
        badgeCn:
          'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
      }
    case 'no_data':
      return {
        label: 'No Data',
        barColor: 'bg-gray-300 dark:bg-gray-600',
        textColor: 'text-[#94A3B8] dark:text-gray-500',
        badgeCn:
          'bg-gray-100 text-[#94A3B8] border-gray-200 dark:bg-gray-700/50 dark:text-gray-500 dark:border-gray-600',
      }
  }
}

// ---------------------------------------------------------------------------
// Dimension row
// ---------------------------------------------------------------------------

function DimensionRow({ dimension }: { dimension: AlignmentDimension }) {
  const [expanded, setExpanded] = useState(false)
  const config = getStatusConfig(dimension.status)
  const isNoData = dimension.status === 'no_data'

  return (
    <div className="border-b border-[#E2E8F0] dark:border-gray-700/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#F8FAFC] dark:hover:bg-gray-800/50 transition-colors"
      >
        {/* Dimension name */}
        <span className="flex-1 text-sm font-medium text-[#1E293B] dark:text-gray-100">
          {dimension.label}
        </span>

        {/* Score bar */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {!isNoData && (
              <div
                className={cn('h-full rounded-full transition-all', config.barColor)}
                style={{ width: `${dimension.score}%` }}
              />
            )}
          </div>
          <span className={cn('text-xs font-medium tabular-nums w-8 text-right', config.textColor)}>
            {isNoData ? '--' : `${dimension.score}%`}
          </span>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight',
            config.badgeCn
          )}
        >
          {config.label}
        </span>

        {/* Expand toggle */}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-[#94A3B8] dark:text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8] dark:text-gray-500 flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0.5 space-y-2">
          {/* ICP values */}
          <div>
            <span className="text-[11px] font-medium text-[#94A3B8] dark:text-gray-500 uppercase tracking-wider">
              ICP Criteria
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {dimension.icpValues.length > 0 ? (
                dimension.icpValues.map((val) => (
                  <span
                    key={val}
                    className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20"
                  >
                    {val}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[#94A3B8] dark:text-gray-500 italic">
                  Not specified
                </span>
              )}
            </div>
          </div>

          {/* Fact profile values */}
          <div>
            <span className="text-[11px] font-medium text-[#94A3B8] dark:text-gray-500 uppercase tracking-wider">
              Fact Profile Data
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {dimension.factValues.length > 0 ? (
                dimension.factValues.map((val) => (
                  <span
                    key={val}
                    className="inline-flex items-center rounded-md bg-[#F8FAFC] dark:bg-gray-800/50 px-1.5 py-0.5 text-[11px] font-medium text-[#64748B] dark:text-gray-400 border border-[#E2E8F0] dark:border-gray-700/50"
                  >
                    {val}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-[#94A3B8] dark:text-gray-500 italic">
                  No data available
                </span>
              )}
            </div>
          </div>

          {/* Suggestion */}
          {dimension.suggestion && (
            <div className="flex items-start gap-1.5 rounded-lg bg-[#F8FAFC] dark:bg-gray-800/50 border border-[#E2E8F0] dark:border-gray-700/50 px-2.5 py-2 mt-1">
              <Info className="h-3.5 w-3.5 text-[#64748B] dark:text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-[#64748B] dark:text-gray-400 leading-relaxed">
                {dimension.suggestion}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ICPAccuracyCheck({ criteria, factProfile }: ICPAccuracyCheckProps) {
  const alignment: AlignmentResult = useMemo(
    () => checkICPFactProfileAlignment(criteria, factProfile.research_data),
    [criteria, factProfile.research_data]
  )

  const overallConfig = getOverallConfig(alignment.overallScore)
  const OverallIcon = overallConfig.icon

  // Separate scored dimensions from no_data dimensions
  const scoredDimensions = alignment.dimensions.filter((d) => d.status !== 'no_data')
  const noDataDimensions = alignment.dimensions.filter((d) => d.status === 'no_data')

  // Collect suggestions from non-match dimensions
  const suggestions = alignment.dimensions
    .filter((d) => d.status === 'partial' || d.status === 'mismatch')
    .map((d) => d.suggestion)
    .filter((s): s is string => !!s)

  const [showSuggestions, setShowSuggestions] = useState(false)

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#E2E8F0] dark:border-gray-700/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#F8FAFC] dark:bg-gray-800/50 border border-[#E2E8F0] dark:border-gray-700/50 flex-shrink-0">
            <Shield className="h-4 w-4 text-[#64748B] dark:text-gray-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100 truncate">
              Accuracy Check
            </h3>
            <p className="text-[11px] text-[#94A3B8] dark:text-gray-500 truncate">
              vs {factProfile.company_name}
            </p>
          </div>
        </div>

        {/* Overall score + badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={cn(
              'flex items-center justify-center h-9 w-9 rounded-full border-2',
              overallConfig.ringColor,
              'border-current'
            )}
          >
            <span className="text-sm font-bold text-[#1E293B] dark:text-gray-100 tabular-nums">
              {alignment.overallScore}
            </span>
          </div>
          <Badge variant={overallConfig.variant} className="gap-1">
            <OverallIcon className="h-3 w-3" />
            {overallConfig.label}
          </Badge>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div className="divide-y divide-[#E2E8F0] dark:divide-gray-700/50">
        {scoredDimensions.map((dim) => (
          <DimensionRow key={dim.dimension} dimension={dim} />
        ))}
        {noDataDimensions.map((dim) => (
          <DimensionRow key={dim.dimension} dimension={dim} />
        ))}
      </div>

      {/* No dimensions at all */}
      {alignment.dimensions.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-[#94A3B8] dark:text-gray-500">
            No comparable dimensions found. Ensure both the ICP criteria and fact
            profile have data to compare.
          </p>
        </div>
      )}

      {/* Collapsible suggestions */}
      {suggestions.length > 0 && (
        <div className="border-t border-[#E2E8F0] dark:border-gray-700/50">
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-[#F8FAFC] dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-[#64748B] dark:text-gray-400">
                {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
              </span>
            </div>
            {showSuggestions ? (
              <ChevronUp className="h-3.5 w-3.5 text-[#94A3B8] dark:text-gray-500" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8] dark:text-gray-500" />
            )}
          </button>
          {showSuggestions && (
            <div className="px-4 pb-3 space-y-2">
              {suggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 px-3 py-2"
                >
                  <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    {suggestion}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
