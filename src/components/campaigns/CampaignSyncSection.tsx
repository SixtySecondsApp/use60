import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import {
  RefreshCw,
  Loader2,
  ArrowDownToLine,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  orgId: string;
  userId: string;
  campaignId: string;
  campaignName: string;
}

interface SyncHistoryEntry {
  id: string;
  synced_at: string;
  sync_type: 'engagement_pull' | 'lead_push';
  updated_leads_count: number;
  pushed_leads_count: number;
  sync_duration_ms: number | null;
  error_message: string | null;
}

export function CampaignSyncSection({ orgId, userId, campaignId, campaignName }: Props) {
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: history = [], isLoading, refetch } = useQuery({
    queryKey: ['campaign-sync-history', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instantly_sync_history')
        .select('id, synced_at, sync_type, updated_leads_count, pushed_leads_count, sync_duration_ms, error_message')
        .eq('campaign_id', campaignId)
        .order('synced_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SyncHistoryEntry[];
    },
    enabled: !!campaignId,
  });

  async function handleSync() {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-instantly-engagement', {
        body: { org_id: orgId, user_id: userId, campaign_id: campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Synced ${data?.matched_leads ?? 0} leads`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Sync trigger */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <h4 className="text-sm font-medium text-white mb-1">Engagement Sync</h4>
        <p className="text-xs text-gray-500 mb-3">
          Pull the latest open, click, and reply data from Instantly for &ldquo;{campaignName}&rdquo;.
        </p>
        <Button
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      {/* History */}
      <div>
        <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-500" />
          Sync History
        </h4>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No sync history yet</p>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-800 bg-gray-900/30 px-3 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-gray-300">Engagement Sync</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(entry.synced_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-1.5 text-xs space-y-0.5 text-gray-400">
                  <p>Matched {entry.updated_leads_count} leads</p>
                  {entry.sync_duration_ms != null && (
                    <p className="text-gray-600">{(entry.sync_duration_ms / 1000).toFixed(1)}s</p>
                  )}
                  {entry.error_message && (
                    <p className="text-red-400">{entry.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
