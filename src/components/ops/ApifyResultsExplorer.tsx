import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldAlert,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileJson,
  Filter,
  Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { apifyService, ApifyMappedRecord, ApifyRun } from '@/lib/services/apifyService'
import { ApifyBulkActions } from './ApifyBulkActions'

interface ApifyResultsExplorerProps {
  runId?: string
  run?: ApifyRun | null
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  medium: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  low: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

const PAGE_SIZES = [25, 50, 100]

export function ApifyResultsExplorer({ runId, run }: ApifyResultsExplorerProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [confidence, setConfidence] = useState<string>('')
  const [gdprOnly, setGdprOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: result, isLoading, refetch } = useQuery({
    queryKey: ['apify-mapped-records', runId, page, pageSize, confidence, gdprOnly, search],
    queryFn: () =>
      apifyService.listMappedRecords({
        runId,
        confidence: confidence || undefined,
        gdprOnly,
        search: search || undefined,
        page,
        pageSize,
      }),
    enabled: !!runId,
  })

  const records = result?.data || []
  const total = result?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  // Derive column names from mapped_data keys across all records
  const columns = useMemo(() => {
    const keySet = new Set<string>()
    for (const record of records) {
      if (record.mapped_data) {
        for (const key of Object.keys(record.mapped_data)) {
          keySet.add(key)
        }
      }
    }
    return Array.from(keySet).sort()
  }, [records])

  // Show up to 6 columns in the table, rest in expanded view
  const visibleColumns = columns.slice(0, 6)

  // Selection helpers
  const selectedRecords = useMemo(
    () => records.filter((r) => selectedIds.has(r.id)),
    [records, selectedIds]
  )

  const allOnPageSelected = records.length > 0 && records.every((r) => selectedIds.has(r.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const r of records) next.delete(r.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const r of records) next.add(r.id)
        return next
      })
    }
  }

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const toggleExpand = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id)
  }

  const formatCellValue = (value: unknown): string => {
    if (value == null) return '—'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.join(', ')
    return JSON.stringify(value)
  }

  if (!runId) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a run to explore mapped results</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with run info */}
      {run && (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {run.actor_name || run.actor_id}
          </span>
          <span>{run.total_records} raw</span>
          <span>{run.mapped_records_count} mapped</span>
          {run.gdpr_flagged_count > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              {run.gdpr_flagged_count} GDPR
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search mapped data..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm"
          />
          <Button variant="ghost" size="sm" onClick={handleSearch} className="h-8 px-2">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <Select value={confidence} onValueChange={(v) => { setConfidence(v === 'all' ? '' : v); setPage(0) }}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="Confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All confidence</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={gdprOnly ? 'default' : 'outline'}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => { setGdprOnly(!gdprOnly); setPage(0) }}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          GDPR only
        </Button>

        {(search || confidence || gdprOnly) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-gray-500"
            onClick={() => {
              setSearch('')
              setSearchInput('')
              setConfidence('')
              setGdprOnly(false)
              setPage(0)
            }}
          >
            <Filter className="w-3.5 h-3.5 mr-1" />
            Clear
          </Button>
        )}

        <div className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {total} record{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {search || confidence || gdprOnly
              ? 'No records match your filters'
              : 'No mapped records yet'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-2">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-8" />
                  {visibleColumns.map((col) => (
                    <TableHead key={col} className="text-xs font-medium whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-xs">Confidence</TableHead>
                  <TableHead className="w-10 text-xs">GDPR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <React.Fragment key={record.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => toggleExpand(record.id)}
                    >
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(record.id)}
                          onCheckedChange={() => toggleSelect(record.id)}
                        />
                      </TableCell>
                      <TableCell className="px-2">
                        {expandedRow === record.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </TableCell>
                      {visibleColumns.map((col) => (
                        <TableCell key={col} className="text-sm max-w-[200px] truncate">
                          {formatCellValue(record.mapped_data?.[col])}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${CONFIDENCE_STYLES[record.mapping_confidence] || ''}`}
                        >
                          {record.mapping_confidence}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.gdpr_flags && record.gdpr_flags.length > 0 && (
                          <ShieldAlert className="w-4 h-4 text-amber-500" />
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {expandedRow === record.id && (
                      <TableRow>
                        <TableCell colSpan={visibleColumns.length + 4} className="bg-gray-50 dark:bg-gray-800/30 p-4">
                          <ExpandedRecordDetail record={record} allColumns={columns} />
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(0) }}
            >
              <SelectTrigger className="w-[70px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      <ApifyBulkActions
        selectedRecords={selectedRecords}
        totalCount={total}
        onDeselectAll={() => setSelectedIds(new Set())}
        onRefresh={() => refetch()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expanded Record Detail
// ---------------------------------------------------------------------------

function ExpandedRecordDetail({
  record,
  allColumns,
}: {
  record: ApifyMappedRecord
  allColumns: string[]
}) {
  const [showRaw, setShowRaw] = useState(false)
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null)
  const [rawLoading, setRawLoading] = useState(false)

  const loadRawData = async () => {
    if (!record.source_result_id) return
    setRawLoading(true)
    try {
      const result = await apifyService.getRawResult(record.source_result_id)
      setRawData(result)
      setShowRaw(true)
    } catch {
      // silently fail
    } finally {
      setRawLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* All mapped fields */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {allColumns.map((col) => {
          const value = record.mapped_data?.[col]
          if (value == null) return null
          return (
            <div key={col} className="text-sm">
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                {col.replace(/_/g, ' ')}
              </span>
              <div className="text-gray-900 dark:text-gray-100 break-all">
                {typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))
                  ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {value}
                    </a>
                  )
                  : String(value)}
              </div>
            </div>
          )
        })}
      </div>

      {/* GDPR flags */}
      {record.gdpr_flags && record.gdpr_flags.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <span className="text-amber-600 dark:text-amber-400 font-medium text-xs">
            GDPR flags:
          </span>
          {record.gdpr_flags.map((flag) => (
            <Badge key={flag} variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              {flag}
            </Badge>
          ))}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {record.dedup_key && <span>Dedup: {record.dedup_key}</span>}
        <span>Created: {new Date(record.created_at).toLocaleString()}</span>
        {record.synced_to_crm && <span className="text-emerald-600">Synced to CRM</span>}
      </div>

      {/* Raw JSON toggle */}
      {record.source_result_id && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={(e) => {
              e.stopPropagation()
              if (showRaw) {
                setShowRaw(false)
              } else if (rawData) {
                setShowRaw(true)
              } else {
                loadRawData()
              }
            }}
            disabled={rawLoading}
          >
            {rawLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileJson className="w-3.5 h-3.5" />
            )}
            {showRaw ? 'Hide raw JSON' : 'View raw JSON'}
          </Button>

          {showRaw && rawData && (
            <pre className="mt-2 p-3 rounded bg-gray-100 dark:bg-gray-900 text-xs overflow-x-auto max-h-[300px] overflow-y-auto font-mono">
              {JSON.stringify(rawData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
