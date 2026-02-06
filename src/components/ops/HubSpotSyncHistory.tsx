import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw, Clock, Plus, Pencil, Minus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface SyncHistoryEntry {
  id: string;
  synced_at: string;
  new_contacts_count: number;
  updated_contacts_count: number;
  removed_contacts_count: number;
  returned_contacts_count: number;
  sync_duration_ms: number | null;
  error_message: string | null;
}

interface HubSpotSyncHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
}

export function HubSpotSyncHistory({ open, onOpenChange, tableId }: HubSpotSyncHistoryProps) {
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['hubspot-sync-history', tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hubspot_sync_history')
        .select('id, synced_at, new_contacts_count, updated_contacts_count, removed_contacts_count, returned_contacts_count, sync_duration_ms, error_message')
        .eq('table_id', tableId)
        .order('synced_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as SyncHistoryEntry[];
    },
    enabled: open && !!tableId,
  });

  const revertMutation = useMutation({
    mutationFn: async (syncId: string) => {
      const { data, error } = await supabase.functions.invoke('revert-hubspot-sync', {
        body: { sync_id: syncId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      queryClient.invalidateQueries({ queryKey: ['hubspot-sync-history', tableId] });
      toast.success(`Reverted: ${data?.cells_restored ?? 0} cells, ${data?.rows_restored ?? 0} rows`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to revert sync');
    },
  });

  const handleRevert = (entry: SyncHistoryEntry) => {
    if (revertMutation.isPending) return;
    revertMutation.mutate(entry.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-400" />
            Sync History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 text-gray-700" />
              <p className="text-sm">No syncs recorded yet</p>
            </div>
          ) : (
            entries.map((entry, index) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(entry.synced_at), { addSuffix: true })}
                  </span>
                  {entry.sync_duration_ms != null && (
                    <span className="text-[10px] text-gray-600">
                      {entry.sync_duration_ms < 1000
                        ? `${entry.sync_duration_ms}ms`
                        : `${(entry.sync_duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>

                {entry.error_message ? (
                  <p className="text-xs text-red-400">{entry.error_message}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {entry.new_contacts_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        <Plus className="w-3 h-3" />
                        {entry.new_contacts_count} new
                      </span>
                    )}
                    {entry.updated_contacts_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        <Pencil className="w-3 h-3" />
                        {entry.updated_contacts_count} updated
                      </span>
                    )}
                    {entry.removed_contacts_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                        <Minus className="w-3 h-3" />
                        {entry.removed_contacts_count} removed
                      </span>
                    )}
                    {entry.returned_contacts_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                        <Undo2 className="w-3 h-3" />
                        {entry.returned_contacts_count} returned
                      </span>
                    )}
                    {entry.new_contacts_count === 0 && entry.updated_contacts_count === 0 && entry.removed_contacts_count === 0 && entry.returned_contacts_count === 0 && (
                      <span className="text-xs text-gray-500">No changes</span>
                    )}
                  </div>
                )}

                {index === 0 && !entry.error_message && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-1 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                    onClick={() => handleRevert(entry)}
                    disabled={revertMutation.isPending}
                  >
                    {revertMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="w-3 h-3 mr-1" />
                    )}
                    Revert this sync
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
