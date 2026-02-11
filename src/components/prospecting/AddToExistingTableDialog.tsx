import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TableProperties,
  Loader2,
  ExternalLink,
  ArrowRight,
  AlertCircle,
  Plus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/clientV2'
import { OpsTableService } from '@/lib/services/opsTableService'
import type { OpsTableRecord, OpsTableColumn } from '@/lib/services/opsTableService'
import { useOrgId } from '@/lib/contexts/OrgContext'
import type { ProspectingProvider } from '@/lib/hooks/useProspectingSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddToExistingTableDialogProps {
  isOpen: boolean
  onClose: () => void
  results: Record<string, unknown>[]
  selectedRowIds: number[]
  provider: ProspectingProvider
}

type DedupMode = 'skip' | 'merge' | 'create_all'

interface ColumnMapping {
  sourceKey: string
  sourceLabel: string
  targetColumnId: string | null
  targetColumnLabel: string | null
}

// ---------------------------------------------------------------------------
// Fuzzy column matching
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function fuzzyMatchColumns(
  sourceKeys: string[],
  targetColumns: OpsTableColumn[]
): ColumnMapping[] {
  const targetNormalized = targetColumns.map((col) => ({
    ...col,
    normalized: normalize(col.label),
    normalizedKey: normalize(col.key),
  }))

  return sourceKeys.map((key) => {
    const srcNorm = normalize(key)
    // Human-readable label: convert snake_case to Title Case
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    // Exact match on normalized label or key
    const exact = targetNormalized.find(
      (t) => t.normalized === srcNorm || t.normalizedKey === srcNorm
    )
    if (exact) {
      return {
        sourceKey: key,
        sourceLabel: label,
        targetColumnId: exact.id,
        targetColumnLabel: exact.label,
      }
    }

    // Partial match: source contains target or vice versa
    const partial = targetNormalized.find(
      (t) =>
        t.normalized.includes(srcNorm) ||
        srcNorm.includes(t.normalized) ||
        t.normalizedKey.includes(srcNorm) ||
        srcNorm.includes(t.normalizedKey)
    )
    if (partial) {
      return {
        sourceKey: key,
        sourceLabel: label,
        targetColumnId: partial.id,
        targetColumnLabel: partial.label,
      }
    }

    return {
      sourceKey: key,
      sourceLabel: label,
      targetColumnId: null,
      targetColumnLabel: null,
    }
  })
}

// ---------------------------------------------------------------------------
// Service instance
// ---------------------------------------------------------------------------

const tableService = new OpsTableService(supabase)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddToExistingTableDialog({
  isOpen,
  onClose,
  results,
  selectedRowIds,
  provider,
}: AddToExistingTableDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orgId = useOrgId()

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [dedupMode, setDedupMode] = useState<DedupMode>('skip')
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])

  const rowsToAdd = selectedRowIds.length > 0
    ? results.filter((_, i) => selectedRowIds.includes(i))
    : results

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedTableId(null)
      setDedupMode('skip')
      setColumnMappings([])
    }
  }, [isOpen])

  // Fetch org tables
  const { data: tables = [], isLoading: tablesLoading } = useQuery<OpsTableRecord[]>({
    queryKey: ['ops-tables', orgId],
    queryFn: () => tableService.listTables(orgId!),
    enabled: isOpen && !!orgId,
  })

  // Fetch target table columns when table selected
  const { data: targetTable, isLoading: columnsLoading } = useQuery<OpsTableRecord | null>({
    queryKey: ['ops-table-detail', selectedTableId],
    queryFn: () => tableService.getTable(selectedTableId!),
    enabled: !!selectedTableId,
  })

  const targetColumns = targetTable?.columns ?? []

  // Auto-map columns when target table changes
  useEffect(() => {
    if (!targetColumns.length || !rowsToAdd.length) {
      setColumnMappings([])
      return
    }

    const sourceKeys = Object.keys(rowsToAdd[0]).filter(
      (k) => !['apollo_id', 'ai_ark_id'].includes(k)
    )
    setColumnMappings(fuzzyMatchColumns(sourceKeys, targetColumns))
  }, [targetColumns, rowsToAdd])

  const mappedCount = columnMappings.filter((m) => m.targetColumnId).length
  const unmappedCount = columnMappings.length - mappedCount

  // Add rows mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTableId || !targetColumns.length) {
        throw new Error('No target table selected')
      }

      // Build column key map: target column id -> target column key
      const colIdToKey = new Map<string, string>()
      for (const col of targetColumns) {
        colIdToKey.set(col.id, col.key)
      }

      // Build reverse mapping: target column key -> source key
      const targetKeyToSource = new Map<string, string>()
      for (const mapping of columnMappings) {
        if (mapping.targetColumnId) {
          const targetKey = colIdToKey.get(mapping.targetColumnId)
          if (targetKey) {
            targetKeyToSource.set(targetKey, mapping.sourceKey)
          }
        }
      }

      // Build rows in the format addRows() expects
      const rows = rowsToAdd.map((row) => {
        const cells: Record<string, string> = {}
        for (const [targetKey, sourceKey] of targetKeyToSource) {
          const val = row[sourceKey]
          if (val != null) {
            cells[targetKey] = Array.isArray(val) ? val.join(', ') : String(val)
          }
        }
        return {
          sourceId: (row.apollo_id as string) || (row.ai_ark_id as string) || undefined,
          sourceData: row,
          cells,
        }
      })

      // TODO: Dedup logic would run here — for now, pass all rows.
      // Full dedup requires fetching existing rows and comparing by email column.

      return tableService.addRows(selectedTableId, rows)
    },

    onSuccess: (insertedRows) => {
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] })
      queryClient.invalidateQueries({ queryKey: ['ops-table-detail', selectedTableId] })
      queryClient.invalidateQueries({ queryKey: ['ops-table', selectedTableId] })

      const count = insertedRows.length
      const tableName = tables.find((t) => t.id === selectedTableId)?.name ?? 'table'

      toast.success(
        <div className="flex items-center gap-2">
          <span>{count} rows added to "{tableName}"</span>
          <button
            type="button"
            onClick={() => navigate(`/ops/${selectedTableId}`)}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )

      onClose()
    },

    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add rows. Please try again.')
    },
  })

  const isAdding = addMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isAdding) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableProperties className="h-5 w-5" />
            Add to Existing Table
          </DialogTitle>
          <DialogDescription>
            Add {rowsToAdd.length.toLocaleString()} rows to an existing Ops table.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Table selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Target Table
            </label>
            {tablesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : tables.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  No Ops tables found. Import to a new table instead.
                </span>
              </div>
            ) : (
              <Select
                value={selectedTableId ?? undefined}
                onValueChange={setSelectedTableId}
                disabled={isAdding}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a table..." />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      <span className="flex items-center gap-2">
                        {table.name}
                        <span className="text-xs text-gray-400">
                          ({table.row_count} rows)
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Column mapping preview */}
          {selectedTableId && !columnsLoading && columnMappings.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Column Mapping
                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                  {mappedCount} matched, {unmappedCount} skipped
                </span>
              </label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
                {columnMappings.map((mapping) => (
                  <div
                    key={mapping.sourceKey}
                    className="flex items-center gap-2 border-b border-gray-100 px-3 py-1.5 text-sm last:border-b-0 dark:border-gray-800"
                  >
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                      {mapping.sourceLabel}
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-gray-400" />
                    {mapping.targetColumnId ? (
                      <Badge variant="success" className="flex-shrink-0">
                        {mapping.targetColumnLabel}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex-shrink-0">
                        Skipped
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {columnsLoading && selectedTableId && (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {/* Dedup options */}
          {selectedTableId && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Duplicate Handling
              </label>
              <RadioGroup
                value={dedupMode}
                onValueChange={(v) => setDedupMode(v as DedupMode)}
                disabled={isAdding}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="skip" id="dedup-skip" />
                  <label htmlFor="dedup-skip" className="text-sm text-gray-700 dark:text-gray-300">
                    Skip existing (match by email)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="merge" id="dedup-merge" />
                  <label htmlFor="dedup-merge" className="text-sm text-gray-700 dark:text-gray-300">
                    Merge (update existing rows)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="create_all" id="dedup-all" />
                  <label htmlFor="dedup-all" className="text-sm text-gray-700 dark:text-gray-300">
                    Create all (allow duplicates)
                  </label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Progress */}
          {isAdding && (
            <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Adding rows to table...</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={isAdding || !selectedTableId || tables.length === 0}
          >
            {isAdding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add {rowsToAdd.length.toLocaleString()} Rows
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
