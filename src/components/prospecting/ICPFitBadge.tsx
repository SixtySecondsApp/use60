/**
 * ICPFitBadge — Visual badge showing ICP fit score with tooltip breakdown.
 *
 * Color-coded: green (80%+), yellow (50–79%), red (<50%), gray (no criteria).
 * Hover tooltip shows matched/unmatched criteria with check/X icons.
 */

import { Target, CheckCircle, XCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ICPScore } from '@/lib/utils/icpScoring'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ICPFitBadgeProps {
  score: ICPScore
  size?: 'sm' | 'md'
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): {
  bg: string
  text: string
  border: string
  icon: string
} {
  if (score < 0) {
    return {
      bg: 'bg-gray-100 dark:bg-gray-700/50',
      text: 'text-gray-500 dark:text-gray-400',
      border: 'border-gray-200 dark:border-gray-600',
      icon: 'text-gray-400 dark:text-gray-500',
    }
  }
  if (score >= 80) {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-500/20',
      icon: 'text-emerald-500 dark:text-emerald-400',
    }
  }
  if (score >= 50) {
    return {
      bg: 'bg-yellow-50 dark:bg-yellow-500/10',
      text: 'text-yellow-700 dark:text-yellow-400',
      border: 'border-yellow-200 dark:border-yellow-500/20',
      icon: 'text-yellow-500 dark:text-yellow-400',
    }
  }
  return {
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/20',
    icon: 'text-red-500 dark:text-red-400',
  }
}

function getScoreLabel(score: number): string {
  if (score < 0) return 'N/A'
  if (score >= 80) return 'High'
  if (score >= 50) return 'Medium'
  return 'Low'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ICPFitBadge({ score, size = 'sm' }: ICPFitBadgeProps) {
  const colors = getScoreColor(score.score)
  const label = getScoreLabel(score.score)

  const isSm = size === 'sm'
  const hasDetails = score.details.length > 0

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full border font-medium cursor-default',
            colors.bg,
            colors.text,
            colors.border,
            isSm ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          )}
        >
          <Target className={cn(colors.icon, isSm ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          {score.score >= 0 ? (
            <span>{score.score}%</span>
          ) : (
            <span>{label}</span>
          )}
        </div>
      </TooltipTrigger>
      {hasDetails && (
        <TooltipContent side="bottom" className="!whitespace-normal max-w-[260px] p-0">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <span className="font-semibold text-xs">
                ICP Fit: {score.score >= 0 ? `${score.score}%` : 'N/A'} ({label})
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {score.details.map((detail) => (
                <div key={detail.criterion} className="flex items-start gap-1.5 text-[11px]">
                  {detail.matched ? (
                    <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-red-400" />
                  )}
                  <span className={detail.matched ? 'text-white dark:text-gray-100' : 'text-gray-300 dark:text-gray-400'}>
                    {detail.matchReason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      )}
    </Tooltip>
  )
}
