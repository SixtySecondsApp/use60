import { useState, useEffect, useMemo, useCallback } from 'react'
import { Download, BarChart3, Filter, Loader2, ArrowUpDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrgMoney } from '@/lib/hooks/useOrgMoney'
import type { DemographicMetric } from '@/lib/services/linkedinAnalyticsService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PivotType =
  | 'JOB_TITLE'
  | 'JOB_FUNCTION'
  | 'SENIORITY'
  | 'INDUSTRY'
  | 'COMPANY_SIZE'
  | 'GEOGRAPHY'

type SortColumn = 'pivot_value' | 'impressions' | 'clicks' | 'spend' | 'leads'
type SortDir = 'asc' | 'desc'

interface DatePreset {
  label: string
  days: number
}

const PIVOT_OPTIONS: { value: PivotType; label: string }[] = [
  { value: 'JOB_TITLE', label: 'Job Title' },
  { value: 'JOB_FUNCTION', label: 'Job Function' },
  { value: 'SENIORITY', label: 'Seniority' },
  { value: 'INDUSTRY', label: 'Industry' },
  { value: 'COMPANY_SIZE', label: 'Company Size' },
  { value: 'GEOGRAPHY', label: 'Geography' },
]

const DATE_PRESETS: DatePreset[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

// Currency formatting is now handled by the component using useOrgMoney

function dateFromDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DemographicsPivotProps {
  demographics: DemographicMetric[]
  loading: boolean
  selectedPivotType: string
  dateRange: { from: string; to: string }
  fetchDemographics: (campaignId?: string, pivotType?: string) => Promise<void>
  setDateRange: (from: string, to: string) => void
  exportCsv: (type: 'metrics' | 'summaries' | 'demographics') => Promise<void>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DemographicsPivot({
  demographics,
  loading,
  selectedPivotType,
  dateRange,
  fetchDemographics,
  setDateRange,
  exportCsv,
}: DemographicsPivotProps) {
  const { currencyCode: orgCurrency } = useOrgMoney()
  const fmtCurrency = useCallback((n: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: orgCurrency, maximumFractionDigits: 2 }).format(n)
  }, [orgCurrency])

  const [activePreset, setActivePreset] = useState<string>('30d')
  const [customFrom, setCustomFrom] = useState(dateRange.from)
  const [customTo, setCustomTo] = useState(dateRange.to)
  const [showCustom, setShowCustom] = useState(false)
  const [sortColumn, setSortColumn] = useState<SortColumn>('impressions')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [exporting, setExporting] = useState(false)

  // Load demographics on mount if empty
  useEffect(() => {
    if (demographics.length === 0 && !loading) {
      fetchDemographics(undefined, selectedPivotType)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return col
      }
      setSortDir('desc')
      return col
    })
  }, [])

  const sorted = useMemo(() => {
    const copy = [...demographics]
    copy.sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      const na = Number(aVal) || 0
      const nb = Number(bVal) || 0
      return sortDir === 'asc' ? na - nb : nb - na
    })
    return copy
  }, [demographics, sortColumn, sortDir])

  // ---------------------------------------------------------------
  // Top-performing threshold: top 10% by impressions
  // ---------------------------------------------------------------

  const topThreshold = useMemo(() => {
    if (demographics.length === 0) return Infinity
    const sortedByImpressions = [...demographics].sort(
      (a, b) => b.impressions - a.impressions
    )
    const topIndex = Math.max(0, Math.ceil(demographics.length * 0.1) - 1)
    return sortedByImpressions[topIndex]?.impressions ?? Infinity
  }, [demographics])

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------

  const handlePivotChange = useCallback(
    (value: string) => {
      fetchDemographics(undefined, value)
    },
    [fetchDemographics]
  )

  const handlePreset = useCallback(
    (preset: DatePreset) => {
      setActivePreset(preset.label)
      setShowCustom(false)
      const from = dateFromDaysAgo(preset.days)
      const to = today()
      setDateRange(from, to)
      // Refetch after date change
      setTimeout(() => fetchDemographics(), 50)
    },
    [setDateRange, fetchDemographics]
  )

  const handleCustomApply = useCallback(() => {
    setActivePreset('')
    setDateRange(customFrom, customTo)
    setTimeout(() => fetchDemographics(), 50)
  }, [customFrom, customTo, setDateRange, fetchDemographics])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportCsv('demographics')
    } finally {
      setExporting(false)
    }
  }, [exportCsv])

  // ---------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------

  const renderSortIcon = (col: SortColumn) => (
    <ArrowUpDown
      className={`ml-1 inline h-3 w-3 ${
        sortColumn === col ? 'text-zinc-100' : 'text-zinc-500'
      }`}
    />
  )

  const pivotLabel =
    PIVOT_OPTIONS.find((p) => p.value === selectedPivotType)?.label ?? selectedPivotType

  // ---------------------------------------------------------------
  // Skeleton loading state
  // ---------------------------------------------------------------

  if (loading && demographics.length === 0) {
    return (
      <Card className="bg-zinc-900/60 border-zinc-800/60">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded bg-zinc-800" />
            <Skeleton className="h-5 w-40 rounded bg-zinc-800" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-40 rounded bg-zinc-800" />
            <Skeleton className="h-9 w-16 rounded bg-zinc-800" />
            <Skeleton className="h-9 w-16 rounded bg-zinc-800" />
            <Skeleton className="h-9 w-16 rounded bg-zinc-800" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded bg-zinc-800" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      {/* ---- Header ---- */}
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-zinc-100 text-base font-semibold">
            <BarChart3 className="h-5 w-5 text-zinc-400" />
            Audience Demographics
          </CardTitle>

          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/60"
            onClick={handleExport}
            disabled={exporting || demographics.length === 0}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---- Filters row ---- */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Pivot selector */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500" />
            <Select value={selectedPivotType} onValueChange={handlePivotChange}>
              <SelectTrigger className="w-[180px] border-zinc-700 bg-zinc-800/50 text-zinc-200 h-9 text-sm">
                <SelectValue placeholder="Select pivot" />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-900">
                {PIVOT_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-zinc-200 focus:bg-zinc-800 focus:text-zinc-100"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date presets */}
          <div className="flex items-center gap-1">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className={`h-8 px-3 text-xs border-zinc-700 ${
                  activePreset === preset.label
                    ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                    : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200'
                }`}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 px-3 text-xs border-zinc-700 ${
                showCustom
                  ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                  : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200'
              }`}
              onClick={() => setShowCustom((v) => !v)}
            >
              Custom
            </Button>
          </div>

          {/* Loading indicator */}
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          )}
        </div>

        {/* ---- Custom date range ---- */}
        {showCustom && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 rounded border border-zinc-700 bg-zinc-800/50 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <span className="text-zinc-500 text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 rounded border border-zinc-700 bg-zinc-800/50 px-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs border-zinc-700 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/60"
              onClick={handleCustomApply}
            >
              Apply
            </Button>
          </div>
        )}

        {/* ---- Table ---- */}
        {demographics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <BarChart3 className="mb-3 h-8 w-8 text-zinc-600" />
            <p className="text-sm">No demographic data for this period.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Try a different pivot type or date range.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-zinc-800/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800/60 hover:bg-transparent">
                  <TableHead
                    className="cursor-pointer select-none text-zinc-400"
                    onClick={() => handleSort('pivot_value')}
                  >
                    {pivotLabel}
                    {renderSortIcon('pivot_value')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right text-zinc-400"
                    onClick={() => handleSort('impressions')}
                  >
                    Impressions
                    {renderSortIcon('impressions')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right text-zinc-400"
                    onClick={() => handleSort('clicks')}
                  >
                    Clicks
                    {renderSortIcon('clicks')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right text-zinc-400"
                    onClick={() => handleSort('spend')}
                  >
                    Spend
                    {renderSortIcon('spend')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right text-zinc-400"
                    onClick={() => handleSort('leads')}
                  >
                    Leads
                    {renderSortIcon('leads')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, idx) => {
                  const isTop = row.impressions >= topThreshold
                  return (
                    <TableRow
                      key={`${row.pivot_value}-${idx}`}
                      className="border-zinc-800/60 hover:bg-zinc-800/30"
                    >
                      <TableCell className="text-zinc-200 font-medium">
                        <span className="flex items-center gap-2">
                          {row.pivot_value}
                          {isTop && (
                            <Badge
                              variant="success"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Top
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 tabular-nums">
                        {formatNumber(row.impressions)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 tabular-nums">
                        {formatNumber(row.clicks)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 tabular-nums">
                        {fmtCurrency(row.spend)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300 tabular-nums">
                        {formatNumber(row.leads)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ---- Footer summary ---- */}
        {demographics.length > 0 && (
          <p className="text-xs text-zinc-500">
            {demographics.length} segment{demographics.length !== 1 ? 's' : ''} by{' '}
            {pivotLabel.toLowerCase()} &middot;{' '}
            {dateRange.from} to {dateRange.to}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
