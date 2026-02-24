import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Upload, Loader2, Table2, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase/clientV2'
import type { ProspectingProvider, ProspectingAction } from '@/lib/hooks/useProspectingSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportToOpsDialogProps {
  isOpen: boolean
  onClose: () => void
  results: Record<string, unknown>[]
  selectedRowIds: number[]
  provider: ProspectingProvider
  action?: ProspectingAction
  icpProfileName?: string
  searchParams: Record<string, unknown>
}

interface ImportResult {
  table_id: string
  table_name: string
  row_count: number
  column_count: number
  source_type: string
  enriched_count: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateTableName(icpProfileName?: string): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  if (icpProfileName) {
    return `${icpProfileName} - ${date}`
  }
  return `Prospecting Search - ${date}`
}

function providerLabel(provider: ProspectingProvider): string {
  return provider === 'apollo' ? 'Apollo' : 'AI Ark'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportToOpsDialog({
  isOpen,
  onClose,
  results,
  selectedRowIds,
  provider,
  action,
  icpProfileName,
  searchParams,
}: ImportToOpsDialogProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tableName, setTableName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  // Auto-suggest table name when dialog opens
  useEffect(() => {
    if (isOpen) {
      setTableName(generateTableName(icpProfileName))
      setNameError(null)
    }
  }, [isOpen, icpProfileName])

  const rowCount = selectedRowIds.length > 0 ? selectedRowIds.length : results.length
  const isSubset = selectedRowIds.length > 0 && selectedRowIds.length < results.length

  // Import mutation
  const importMutation = useMutation<ImportResult, Error & { code?: string }>({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('copilot-dynamic-table', {
        body: {
          source: provider,
          action: provider === 'ai_ark' ? (action || 'people_search') : undefined,
          query_description: tableName,
          search_params: searchParams,
          table_name: tableName.trim(),
        },
      })

      if (error) {
        throw new Error(error.message || 'Failed to create ops table')
      }

      if (data?.error) {
        const err = new Error(data.error) as Error & { code?: string }
        err.code = data.code
        throw err
      }

      return data as ImportResult
    },

    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ops-tables'] })

      toast.success(
        <div className="flex items-center gap-2">
          <span>{result.row_count} leads imported to "{result.table_name}"</span>
          <button
            type="button"
            onClick={() => navigate(`/ops/${result.table_id}`)}
            className="inline-flex items-center gap-1 text-brand-blue hover:text-brand-blue/80 dark:text-blue-400 font-medium"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )

      onClose()
    },

    onError: (error) => {
      if (error.code === 'DUPLICATE_TABLE_NAME') {
        setNameError('A table with this name already exists. Please choose a different name.')
        return
      }

      toast.error(error.message || 'Failed to import results. Please try again.')
    },
  })

  const handleImport = () => {
    const trimmed = tableName.trim()
    if (!trimmed) {
      setNameError('Table name is required.')
      return
    }
    setNameError(null)
    importMutation.mutate()
  }

  const handleNameChange = (value: string) => {
    setTableName(value)
    if (nameError) setNameError(null)
  }

  const isImporting = importMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isImporting) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import to New Ops Table
          </DialogTitle>
          <DialogDescription>
            Create a new Ops table from your search results.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Table name input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="table-name"
              className="text-sm font-medium text-[#1E293B] dark:text-gray-300"
            >
              Table Name
            </label>
            <Input
              id="table-name"
              value={tableName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter table name..."
              disabled={isImporting}
              className={nameError ? 'border-red-500 focus-visible:ring-red-500' : ''}
            />
            {nameError && (
              <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>
            )}
          </div>

          {/* Import summary */}
          <div className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 dark:border-gray-700/50 dark:bg-gray-900/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B] dark:text-gray-300">Rows to import</span>
              <span className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                {rowCount.toLocaleString()}
                {isSubset && (
                  <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                    of {results.length} selected
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-[#64748B] dark:text-gray-300">Source</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="default">{providerLabel(provider)}</Badge>
                {action && (
                  <Badge variant="secondary">
                    {action === 'company_search' ? 'Companies' : 'People'}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Importing progress */}
          {isImporting && (
            <div className="flex items-center gap-2 rounded-xl bg-brand-blue/5 px-3 py-2 text-sm text-brand-blue dark:bg-blue-950/30 dark:text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Creating table and importing rows...</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !tableName.trim()}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Table2 className="mr-2 h-4 w-4" />
                Import {rowCount.toLocaleString()} Rows
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
