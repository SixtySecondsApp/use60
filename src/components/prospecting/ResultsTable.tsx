import { useState, useMemo, useCallback } from 'react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Copy,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ICPFitBadge } from '@/components/prospecting/ICPFitBadge'
import { scoreResult, computeAggregateStats } from '@/lib/utils/icpScoring'
import type { ICPScore } from '@/lib/utils/icpScoring'
import type { ICPCriteria } from '@/lib/types/prospecting'
import type { ProspectingProvider, ProspectingAction } from '@/lib/hooks/useProspectingSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColumnDef {
  key: string
  label: string
  width?: string
  sortable?: boolean
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface ResultsTableProps {
  results: Record<string, unknown>[]
  provider: ProspectingProvider
  action?: ProspectingAction
  isLoading: boolean
  selectedRows: Set<number>
  onSelectRow: (index: number) => void
  onSelectAll: () => void
  page: number
  totalResults: number
  perPage: number
  hasMore: boolean
  onPageChange: (page: number) => void
  /** When provided, adds an "ICP Fit" column with scoring */
  icpCriteria?: ICPCriteria | null
}

type SortDirection = 'asc' | 'desc' | null

// ---------------------------------------------------------------------------
// Column definitions per provider/action
// ---------------------------------------------------------------------------

function getColumns(provider: ProspectingProvider, action?: ProspectingAction): ColumnDef[] {
  if (provider === 'ai_ark' && action === 'company_search') {
    return [
      { key: 'company_name', label: 'Company', sortable: true },
      { key: 'domain', label: 'Domain', sortable: true, render: renderDomain },
      { key: 'industry', label: 'Industry', sortable: true },
      { key: 'employee_count', label: 'Employees', sortable: true, render: renderNumber },
      { key: 'location', label: 'Location', sortable: true },
      { key: 'technologies', label: 'Technologies', render: renderTags },
    ]
  }

  if (provider === 'ai_ark') {
    return [
      { key: 'full_name', label: 'Name', sortable: true },
      { key: 'title', label: 'Title', sortable: true },
      { key: 'current_company', label: 'Company', sortable: true },
      { key: 'linkedin_url', label: 'LinkedIn', render: renderLinkedIn },
      { key: 'location', label: 'Location', sortable: true },
      { key: 'seniority', label: 'Seniority', sortable: true },
    ]
  }

  // Apollo people (default)
  return [
    { key: 'full_name', label: 'Name', sortable: true },
    { key: 'title', label: 'Title', sortable: true },
    { key: 'company', label: 'Company', sortable: true },
    { key: 'email', label: 'Email', render: renderEmail },
    { key: 'linkedin_url', label: 'LinkedIn', render: renderLinkedIn },
    { key: 'city', label: 'Location', sortable: true, render: renderApolloLocation },
    { key: 'title', label: 'Seniority', sortable: false, render: (_v, row) => renderText(row.seniority ?? row.person_seniority) },
  ]
}

// ---------------------------------------------------------------------------
// Cell renderers
// ---------------------------------------------------------------------------

function renderText(value: unknown): React.ReactNode {
  if (value == null || value === '') return <span className="text-gray-400 dark:text-gray-500">--</span>
  return <span className="truncate">{String(value)}</span>
}

function renderNumber(value: unknown): React.ReactNode {
  if (value == null) return <span className="text-gray-400 dark:text-gray-500">--</span>
  const num = typeof value === 'number' ? value : parseInt(String(value), 10)
  if (isNaN(num)) return <span className="text-gray-400 dark:text-gray-500">--</span>
  return <span>{num.toLocaleString()}</span>
}

function renderDomain(value: unknown): React.ReactNode {
  if (!value) return <span className="text-gray-400 dark:text-gray-500">--</span>
  const domain = String(value)
  return (
    <a
      href={`https://${domain}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-blue hover:text-brand-blue/80 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
    >
      {domain}
    </a>
  )
}

function renderLinkedIn(value: unknown): React.ReactNode {
  if (!value) return <span className="text-gray-400 dark:text-gray-500">--</span>
  return (
    <a
      href={String(value)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-brand-blue hover:text-brand-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
      title="Open LinkedIn profile"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}

function EmailCell({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false)

  if (!value) return <span className="text-gray-400 dark:text-gray-500">--</span>

  const email = String(value)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(email)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-1 max-w-[180px]">
      <span className="truncate text-sm" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        title="Copy email"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}

function renderEmail(value: unknown, _row: Record<string, unknown>): React.ReactNode {
  return <EmailCell value={value} />
}

function renderTags(value: unknown): React.ReactNode {
  if (!value || !Array.isArray(value) || value.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">--</span>
  }
  const tags = value.slice(0, 3)
  const remaining = value.length - 3
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag: string, i: number) => (
        <span
          key={i}
          className="inline-block rounded-md bg-[#F8FAFC] px-1.5 py-0.5 text-xs text-[#64748B] dark:bg-gray-800/50 dark:text-gray-300"
        >
          {tag}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">+{remaining}</span>
      )}
    </div>
  )
}

function renderApolloLocation(value: unknown, row: Record<string, unknown>): React.ReactNode {
  const parts = [value, row.state, row.country].filter(Boolean)
  if (parts.length === 0) return <span className="text-gray-400 dark:text-gray-500">--</span>
  return <span className="truncate">{parts.join(', ')}</span>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultsTable({
  results,
  provider,
  action,
  isLoading,
  selectedRows,
  onSelectRow,
  onSelectAll,
  page,
  totalResults,
  perPage,
  hasMore,
  onPageChange,
  icpCriteria,
}: ResultsTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  const columns = useMemo(() => getColumns(provider, action), [provider, action])
  const hasICP = !!icpCriteria

  // Score each result against ICP criteria when available
  const scoreMap = useMemo<Map<number, ICPScore>>(() => {
    if (!icpCriteria) return new Map()
    const map = new Map<number, ICPScore>()
    results.forEach((row, idx) => {
      map.set(idx, scoreResult(row, icpCriteria))
    })
    return map
  }, [results, icpCriteria])

  // Aggregate stats for ICP scoring
  const aggregateStats = useMemo(() => {
    if (!hasICP || scoreMap.size === 0) return null
    const scored = Array.from(scoreMap.values()).map((icpScore) => ({
      row: {} as Record<string, unknown>,
      icpScore,
    }))
    return computeAggregateStats(scored)
  }, [hasICP, scoreMap])

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'))
        if (sortDir === 'desc') setSortKey(null)
      } else {
        setSortKey(key)
        setSortDir('asc')
      }
    },
    [sortKey, sortDir]
  )

  // Build indexed array so we can sort while preserving original indices
  const sortedResults = useMemo(() => {
    const indexed = results.map((row, idx) => ({ row, idx }))

    if (sortKey === '__icp_score' && sortDir && hasICP) {
      indexed.sort((a, b) => {
        const aScore = scoreMap.get(a.idx)?.score ?? -1
        const bScore = scoreMap.get(b.idx)?.score ?? -1
        return sortDir === 'asc' ? aScore - bScore : bScore - aScore
      })
    } else if (sortKey && sortDir) {
      indexed.sort((a, b) => {
        const aVal = a.row[sortKey]
        const bVal = b.row[sortKey]
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return indexed
  }, [results, sortKey, sortDir, hasICP, scoreMap])

  const allSelected = results.length > 0 && selectedRows.size === results.length
  const someSelected = selectedRows.size > 0 && selectedRows.size < results.length
  const totalPages = Math.max(1, Math.ceil(totalResults / perPage))

  // Loading skeleton
  if (isLoading) {
    return <LoadingSkeleton columns={columns} hasICP={hasICP} />
  }

  // Empty state
  if (results.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ICP aggregate stats banner */}
      {aggregateStats && aggregateStats.totalScored > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#64748B] dark:border-gray-700/50 dark:bg-gray-900/50 dark:text-gray-400">
          <Target className="h-4 w-4 text-[#94A3B8] dark:text-gray-500" />
          <span>
            Average fit: <strong className="text-[#1E293B] dark:text-gray-100">{aggregateStats.average}%</strong>
          </span>
          <span className="text-[#E2E8F0] dark:text-gray-600">|</span>
          <span>
            High fit (80%+): <strong className="text-brand-teal dark:text-emerald-400">{aggregateStats.highFitCount}</strong> contacts
          </span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allSelected}
                ref={(el) => {
                  if (el) (el as any).indeterminate = someSelected
                }}
                onCheckedChange={() => onSelectAll()}
              />
            </TableHead>
            {hasICP && (
              <TableHead className="w-[90px]">
                <button
                  type="button"
                  onClick={() => handleSort('__icp_score')}
                  className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  ICP Fit
                  {sortKey === '__icp_score' ? (
                    sortDir === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </TableHead>
            )}
            {columns.map((col) => (
              <TableHead key={col.key}>
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedResults.map(({ row, idx }) => {
            const isSelected = selectedRows.has(idx)
            const icpScore = hasICP ? scoreMap.get(idx) : undefined
            return (
              <TableRow
                key={idx}
                className={cn(isSelected && 'bg-primary/5')}
              >
                <TableCell className="w-[40px]">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onSelectRow(idx)}
                  />
                </TableCell>
                {hasICP && (
                  <TableCell className="w-[90px]">
                    {icpScore ? (
                      <ICPFitBadge score={icpScore} size="sm" />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">--</span>
                    )}
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : renderText(row[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {selectedRows.size > 0
            ? `${selectedRows.size} of ${results.length} selected`
            : `Page ${page} of ${totalPages} (${totalResults.toLocaleString()} results)`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ columns, hasICP }: { columns: ColumnDef[]; hasICP?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Skeleton className="h-4 w-4" />
          </TableHead>
          {hasICP && <TableHead className="w-[90px]">ICP Fit</TableHead>}
          {columns.map((col) => (
            <TableHead key={col.key}>{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 10 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-4" />
            </TableCell>
            {hasICP && (
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
            )}
            {columns.map((col) => (
              <TableCell key={col.key}>
                <Skeleton className="h-4 w-24" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#64748B] dark:text-gray-400">
      <Search className="h-10 w-10 text-[#E2E8F0] dark:text-gray-600" />
      <p className="text-sm font-medium text-[#1E293B] dark:text-gray-100">No results found</p>
      <p className="text-xs text-[#94A3B8] dark:text-gray-500">
        Try broadening your search criteria.
      </p>
    </div>
  )
}
