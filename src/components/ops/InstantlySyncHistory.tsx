import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/clientV2'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Loader2, Clock, ArrowUpRight, ArrowDownToLine } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { InstantlySyncHistoryEntry } from '@/lib/types/instantly'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableId: string
}

export function InstantlySyncHistory({ open, onOpenChange, tableId }: Props) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['instantly-sync-history', tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instantly_sync_history')
        .select('*')
        .eq('table_id', tableId)
        .order('synced_at', { ascending: false })
        .limit(30)

      if (error) throw error
      return data as InstantlySyncHistoryEntry[]
    },
    enabled: open && !!tableId,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Instantly Sync History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No sync history yet</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {entry.sync_type === 'lead_push' ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <ArrowDownToLine className="h-3.5 w-3.5 text-blue-400" />
                    )}
                    <span className="text-xs font-medium text-gray-300">
                      {entry.sync_type === 'lead_push' ? 'Push' : 'Engagement Sync'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(entry.synced_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-2 text-xs space-y-0.5 text-gray-400">
                  {entry.sync_type === 'lead_push' ? (
                    <p>Pushed {entry.pushed_leads_count} leads</p>
                  ) : (
                    <p>Matched {entry.updated_leads_count} leads</p>
                  )}
                  {entry.sync_duration_ms != null && (
                    <p className="text-gray-600">{(entry.sync_duration_ms / 1000).toFixed(1)}s</p>
                  )}
                  {entry.error_message && (
                    <p className="text-red-400">{entry.error_message}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
