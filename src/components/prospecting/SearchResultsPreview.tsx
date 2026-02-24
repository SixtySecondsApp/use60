import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResultsTable } from '@/components/prospecting/ResultsTable'
import { Zap, Download, TableProperties } from 'lucide-react'
import type {
  ProspectingProvider,
  ProspectingAction,
  ProspectingSearchResult,
} from '@/lib/hooks/useProspectingSearch'
import type { ProviderOption } from '@/components/prospecting/ProviderSelector'
import type { ICPCriteria } from '@/lib/types/prospecting'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultsPreviewProps {
  result: ProspectingSearchResult | null
  /** For "both" mode, second provider result */
  secondResult?: ProspectingSearchResult | null
  provider: ProviderOption
  isLoading: boolean
  onImportToNew: (selectedIndices: number[]) => void
  onAddToExisting: (selectedIndices: number[]) => void
  onPageChange: (page: number) => void
  onSecondPageChange?: (page: number) => void
  /** When provided, enables ICP Fit scoring column in results */
  icpCriteria?: ICPCriteria | null
}

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

function providerLabel(provider: ProspectingProvider): string {
  return provider === 'apollo' ? 'Apollo' : 'AI Ark'
}

function actionLabel(action?: ProspectingAction): string {
  if (!action) return ''
  return action === 'company_search' ? 'Companies' : 'People'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchResultsPreview({
  result,
  secondResult,
  provider,
  isLoading,
  onImportToNew,
  onAddToExisting,
  onPageChange,
  onSecondPageChange,
  icpCriteria,
}: SearchResultsPreviewProps) {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [secondSelectedRows, setSecondSelectedRows] = useState<Set<number>>(new Set())

  const isBothMode = provider === 'both'

  // Selection helpers for primary result
  const handleSelectRow = useCallback(
    (index: number) => {
      setSelectedRows((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
    },
    []
  )

  const handleSelectAll = useCallback(() => {
    if (!result) return
    setSelectedRows((prev) =>
      prev.size === result.results.length ? new Set() : new Set(result.results.map((_, i) => i))
    )
  }, [result])

  // Selection helpers for second result
  const handleSecondSelectRow = useCallback(
    (index: number) => {
      setSecondSelectedRows((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
    },
    []
  )

  const handleSecondSelectAll = useCallback(() => {
    if (!secondResult) return
    setSecondSelectedRows((prev) =>
      prev.size === secondResult.results.length
        ? new Set()
        : new Set(secondResult.results.map((_, i) => i))
    )
  }, [secondResult])

  const totalSelected = selectedRows.size + secondSelectedRows.size

  // No results and not loading
  if (!result && !isLoading) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[#1E293B] dark:text-gray-100">
            Search Results
          </h3>

          {result && (
            <>
              <span className="text-sm text-[#64748B] dark:text-gray-400">
                Showing {result.results.length.toLocaleString()} of{' '}
                {result.total_results.toLocaleString()} results
              </span>

              <Badge variant="default">{providerLabel(result.provider)}</Badge>

              {result.action && (
                <Badge variant="secondary">{actionLabel(result.action)}</Badge>
              )}

              {result.credits_consumed > 0 && (
                <Badge variant="outline">
                  <Zap className="mr-1 h-3 w-3" />
                  {result.credits_consumed.toFixed(2)} credits
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {result && result.results.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddToExisting(Array.from(selectedRows))}
              disabled={totalSelected === 0}
            >
              <TableProperties className="mr-1.5 h-4 w-4" />
              Add to Existing Table
              {totalSelected > 0 && ` (${totalSelected})`}
            </Button>
            <Button
              size="sm"
              onClick={() => onImportToNew(Array.from(selectedRows))}
              disabled={totalSelected === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Import to New Ops Table
              {totalSelected > 0 && ` (${totalSelected})`}
            </Button>
          </div>
        )}
      </div>

      {/* Table(s) */}
      {isBothMode ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Primary result */}
          <div className="flex flex-col gap-2">
            {result && (
              <div className="flex items-center gap-2">
                <Badge variant="default">{providerLabel(result.provider)}</Badge>
                <span className="text-xs text-[#64748B] dark:text-gray-400">
                  {result.total_results.toLocaleString()} results
                </span>
              </div>
            )}
            <ResultsTable
              results={result?.results ?? []}
              provider={result?.provider ?? 'apollo'}
              action={result?.action}
              isLoading={isLoading}
              selectedRows={selectedRows}
              onSelectRow={handleSelectRow}
              onSelectAll={handleSelectAll}
              page={result?.page ?? 1}
              totalResults={result?.total_results ?? 0}
              perPage={result?.per_page ?? 25}
              hasMore={result?.has_more ?? false}
              onPageChange={onPageChange}
              icpCriteria={icpCriteria}
            />
          </div>

          {/* Second result */}
          <div className="flex flex-col gap-2">
            {secondResult && (
              <div className="flex items-center gap-2">
                <Badge variant="default">{providerLabel(secondResult.provider)}</Badge>
                <span className="text-xs text-[#64748B] dark:text-gray-400">
                  {secondResult.total_results.toLocaleString()} results
                </span>
              </div>
            )}
            <ResultsTable
              results={secondResult?.results ?? []}
              provider={secondResult?.provider ?? 'ai_ark'}
              action={secondResult?.action}
              isLoading={isLoading}
              selectedRows={secondSelectedRows}
              onSelectRow={handleSecondSelectRow}
              onSelectAll={handleSecondSelectAll}
              page={secondResult?.page ?? 1}
              totalResults={secondResult?.total_results ?? 0}
              perPage={secondResult?.per_page ?? 25}
              hasMore={secondResult?.has_more ?? false}
              onPageChange={onSecondPageChange ?? onPageChange}
              icpCriteria={icpCriteria}
            />
          </div>
        </div>
      ) : (
        <ResultsTable
          results={result?.results ?? []}
          provider={result?.provider ?? 'apollo'}
          action={result?.action}
          isLoading={isLoading}
          selectedRows={selectedRows}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          page={result?.page ?? 1}
          totalResults={result?.total_results ?? 0}
          perPage={result?.per_page ?? 25}
          hasMore={result?.has_more ?? false}
          onPageChange={onPageChange}
          icpCriteria={icpCriteria}
        />
      )}
    </div>
  )
}
