import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrg } from '@/lib/contexts/OrgContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Users,
  Building2,
  Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttioSyncHistoryEntry {
  id: string;
  sync_type: string;
  status: string;
  entity_type: string | null;
  records_synced: number | null;
  error_message: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface AttioSyncHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  success: {
    label: 'Success',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    icon: XCircle,
  },
  partial: {
    label: 'Partial',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    icon: AlertTriangle,
  },
};

const syncTypeLabels: Record<string, string> = {
  full: 'Full sync',
  incremental: 'Incremental',
  webhook: 'Webhook',
};

const entityTypeConfig: Record<string, { label: string; icon: React.ElementType }> = {
  people: { label: 'People', icon: Users },
  companies: { label: 'Companies', icon: Building2 },
  deals: { label: 'Deals', icon: Briefcase },
};

function getStatusConfig(status: string) {
  return (
    statusConfig[status] ?? {
      label: status,
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/10',
      icon: Clock,
    }
  );
}

function getEntityConfig(entityType: string | null) {
  if (!entityType) return null;
  return entityTypeConfig[entityType] ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AttioSyncHistory({ open, onOpenChange, tableId }: AttioSyncHistoryProps) {
  const { activeOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ---- Fetch sync history ----
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['attio-sync-history', activeOrgId, tableId],
    queryFn: async () => {
      if (!activeOrgId) throw new Error('No active organization');

      const { data, error } = await supabase
        .from('attio_sync_history')
        .select(
          'id, sync_type, status, entity_type, records_synced, error_message, details, created_at'
        )
        .eq('org_id', activeOrgId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data ?? []) as AttioSyncHistoryEntry[];
    },
    enabled: open && !!activeOrgId,
  });

  // ---- Trigger re-sync ----
  const resyncMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrgId) throw new Error('No active organization');

      const resp = await supabase.functions.invoke('sync-attio-ops-table', {
        body: { table_id: tableId, org_id: activeOrgId },
      });

      if (resp.error) throw new Error(resp.error.message || 'Failed to sync');
      if (resp.data?.error) throw new Error(resp.data.error);
      return resp.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      queryClient.invalidateQueries({ queryKey: ['attio-sync-history', activeOrgId, tableId] });
      toast.success('Attio sync completed');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to sync from Attio');
    },
  });

  // ---- Revert (stub) ----
  const handleRevert = (_entry: AttioSyncHistoryEntry) => {
    toast.info('Revert not yet implemented');
  };

  // ---- Expand / collapse details ----
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!top-16 !h-[calc(100vh-4rem)] w-[400px] sm:w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              Attio Sync History
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resyncMutation.mutate()}
              disabled={resyncMutation.isPending}
              className="text-xs"
            >
              {resyncMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Re-sync
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-4rem-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 text-gray-700" />
              <p className="text-sm">No syncs recorded yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Sync history will appear here after your first Attio sync.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const sc = getStatusConfig(entry.status);
              const StatusIcon = sc.icon;
              const ec = getEntityConfig(entry.entity_type);
              const isExpanded = expandedId === entry.id;
              const hasSnapshot = !!(
                entry.details &&
                (entry.details as Record<string, unknown>).snapshot
              );

              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2"
                >
                  {/* Header row: status badge + sync type + timestamp */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${sc.color} ${sc.bgColor}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {sc.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        {syncTypeLabels[entry.sync_type] ?? entry.sync_type}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Entity type + records synced */}
                  <div className="flex items-center gap-3">
                    {ec && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                        <ec.icon className="w-3 h-3 text-gray-500" />
                        {ec.label}
                      </span>
                    )}
                    {entry.records_synced != null && entry.records_synced > 0 && (
                      <span className="text-xs text-gray-400">
                        {entry.records_synced} record{entry.records_synced !== 1 ? 's' : ''} synced
                      </span>
                    )}
                    {(entry.records_synced === 0 || entry.records_synced == null) &&
                      entry.status === 'success' && (
                        <span className="text-xs text-gray-500">No changes</span>
                      )}
                  </div>

                  {/* Error message */}
                  {entry.error_message && (
                    <p className="text-xs text-red-400">{entry.error_message}</p>
                  )}

                  {/* Expand details toggle */}
                  {entry.details && (
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Details
                    </button>
                  )}

                  {/* Expanded details JSON */}
                  {isExpanded && entry.details && (
                    <pre className="text-[10px] text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  )}

                  {/* Revert button (only when snapshot data exists in details) */}
                  {hasSnapshot && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      onClick={() => handleRevert(entry)}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Revert this sync
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
