import React, { useState } from 'react'
import { Download, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApifyGdprConfirmDialog } from './ApifyGdprConfirmDialog'
import { ApifyMappedRecord } from '@/lib/services/apifyService'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/clientV2'

interface ApifyBulkActionsProps {
  selectedRecords: ApifyMappedRecord[]
  totalCount: number
  onDeselectAll: () => void
  onRefresh: () => void
}

export function ApifyBulkActions({
  selectedRecords,
  totalCount,
  onDeselectAll,
  onRefresh,
}: ApifyBulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showGdprDialog, setShowGdprDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedCount = selectedRecords.length
  const isVisible = selectedCount > 0

  const gdprFlaggedCount = selectedRecords.filter(
    (r) => r.gdpr_flags && r.gdpr_flags.length > 0
  ).length

  const handleExportCsv = () => {
    setIsExporting(true)
    try {
      // Collect all unique keys from mapped_data
      const allKeys = new Set<string>()
      for (const record of selectedRecords) {
        if (record.mapped_data) {
          for (const key of Object.keys(record.mapped_data)) {
            allKeys.add(key)
          }
        }
      }
      const columns = Array.from(allKeys).sort()

      // Build CSV
      const escapeCsv = (val: unknown): string => {
        if (val == null) return ''
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }

      const headerRow = ['id', 'confidence', 'gdpr_flags', 'dedup_key', 'created_at', ...columns]
      const lines = [headerRow.join(',')]

      for (const record of selectedRecords) {
        const row = [
          record.id,
          record.mapping_confidence,
          (record.gdpr_flags || []).join('; '),
          record.dedup_key || '',
          record.created_at,
          ...columns.map((col) => escapeCsv(record.mapped_data?.[col])),
        ]
        lines.push(row.map(escapeCsv).join(','))
      }

      const csv = lines.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `apify-results-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

      toast.success(`Exported ${selectedRecords.length} records to CSV`)
    } catch {
      toast.error('Failed to export CSV')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const ids = selectedRecords.map((r) => r.id)
      const { error } = await supabase
        .from('mapped_records')
        .delete()
        .in('id', ids)

      if (error) throw error
      toast.success(`Deleted ${ids.length} records`)
      onDeselectAll()
      onRefresh()
    } catch (err) {
      toast.error('Failed to delete records')
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleGdprConfirm = (basis: string) => {
    setShowGdprDialog(false)
    toast.success(`GDPR basis recorded: ${basis.replace(/_/g, ' ')}`)
    // In future: sync to CRM with basis stored
  }

  return (
    <>
      <div
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ease-out ${
          isVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <div className="rounded-2xl border border-gray-700 bg-gray-900/90 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-1 px-4 py-3">
            <span className="mr-2 whitespace-nowrap text-sm font-medium text-gray-300">
              {selectedCount} selected
              <span className="ml-1 text-gray-500">of {totalCount}</span>
            </span>

            <div className="mx-2 h-5 w-px bg-gray-700" />

            {/* Export CSV */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800"
              onClick={handleExportCsv}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export CSV
            </Button>

            {/* Delete */}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>

            <div className="mx-2 h-5 w-px bg-gray-700" />

            {/* Deselect */}
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-gray-200 hover:bg-gray-800 px-1.5"
              onClick={onDeselectAll}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected mapped records. Raw results in apify_results are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GDPR confirmation */}
      <ApifyGdprConfirmDialog
        open={showGdprDialog}
        onOpenChange={setShowGdprDialog}
        flaggedCount={gdprFlaggedCount}
        onConfirm={handleGdprConfirm}
      />
    </>
  )
}
