import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Shield,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TableHealth {
  table_id: string;
  table_name: string;
  row_count: number;
  last_synced_at: string | null;
  source_breakdown: Record<string, number>;
  conflict_count_7d: number;
  stale_rows: number;
}

type HealthStatus = 'healthy' | 'warning' | 'error';

function getHealthStatus(table: TableHealth): HealthStatus {
  // Error: >10 conflicts in 7d OR >50% rows stale
  if (table.conflict_count_7d > 10) return 'error';
  if (table.row_count > 0 && table.stale_rows / table.row_count > 0.5) return 'error';

  // Warning: any conflicts OR >10% stale OR never synced with CRM rows
  if (table.conflict_count_7d > 0) return 'warning';
  if (table.row_count > 0 && table.stale_rows / table.row_count > 0.1) return 'warning';

  const crmRows = (table.source_breakdown['hubspot'] || 0) + (table.source_breakdown['attio'] || 0);
  if (table.row_count > 0 && crmRows === 0) return 'warning';

  return 'healthy';
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Never';
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_CONFIG: Record<HealthStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  healthy: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Healthy' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Warning' },
  error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Needs Attention' },
};

export function StandardTablesHealth() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const { data: healthData, isLoading, refetch } = useQuery({
    queryKey: ['standard-table-health', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      const { data, error } = await supabase.rpc('get_standard_table_health' as any, {
        p_org_id: activeOrgId,
      });
      if (error) throw error;
      return (data as TableHealth[]) || [];
    },
    enabled: !!activeOrgId,
    refetchInterval: 60000, // Refresh every 60s
  });

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const { error } = await supabase.functions.invoke('backfill-standard-ops-tables');
      if (error) throw error;
      toast.success('Backfill started — rows will populate shortly');
      refetch();
    } catch (err) {
      toast.error('Backfill failed: ' + (err as Error).message);
    } finally {
      setIsBackfilling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading sync health...
      </div>
    );
  }

  if (!healthData || healthData.length === 0) {
    return null; // No standard tables provisioned
  }

  // Aggregate stats
  const totalRows = healthData.reduce((sum, t) => sum + t.row_count, 0);
  const totalConflicts = healthData.reduce((sum, t) => sum + t.conflict_count_7d, 0);
  const totalStale = healthData.reduce((sum, t) => sum + t.stale_rows, 0);
  const overallStatus = healthData.some((t) => getHealthStatus(t) === 'error')
    ? 'error'
    : healthData.some((t) => getHealthStatus(t) === 'warning')
      ? 'warning'
      : 'healthy';

  const OverallIcon = STATUS_CONFIG[overallStatus].icon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-200">Sync Health</h3>
          <Badge variant="secondary" className={`${STATUS_CONFIG[overallStatus].bg} ${STATUS_CONFIG[overallStatus].color}`}>
            <OverallIcon className="mr-1 h-3 w-3" />
            {STATUS_CONFIG[overallStatus].label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackfill}
            disabled={isBackfilling}
            className="h-7 text-xs text-gray-400 hover:text-white"
          >
            {isBackfilling ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Database className="mr-1.5 h-3 w-3" />
            )}
            Backfill
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-7 text-xs text-gray-400 hover:text-white"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-800/50 bg-gray-900/40 p-3">
          <div className="text-xs text-gray-500">Total Rows</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold text-white">{totalRows.toLocaleString()}</span>
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-800/50 bg-gray-900/40 p-3">
          <div className="text-xs text-gray-500">Conflicts (7d)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg font-semibold ${totalConflicts > 0 ? 'text-yellow-400' : 'text-white'}`}>
              {totalConflicts}
            </span>
            <Shield className="h-3 w-3 text-gray-500" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-800/50 bg-gray-900/40 p-3">
          <div className="text-xs text-gray-500">Stale CRM Rows</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-lg font-semibold ${totalStale > 10 ? 'text-red-400' : 'text-white'}`}>
              {totalStale}
            </span>
            <Clock className="h-3 w-3 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Per-Table Health */}
      <div className="space-y-2">
        {healthData.map((table) => {
          const status = getHealthStatus(table);
          const config = STATUS_CONFIG[status];
          const StatusIcon = config.icon;
          const crmRows =
            (table.source_breakdown['hubspot'] || 0) + (table.source_breakdown['attio'] || 0);
          const appRows =
            (table.source_breakdown['app'] || 0) + (table.source_breakdown['manual'] || 0);

          return (
            <div
              key={table.table_id}
              className="flex items-center gap-4 rounded-lg border border-gray-800/40 bg-gray-900/30 px-4 py-3"
            >
              {/* Status indicator */}
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bg}`}>
                <StatusIcon className={`h-4 w-4 ${config.color}`} />
              </div>

              {/* Table name + last sync */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-100">{table.table_name}</div>
                <div className="text-xs text-gray-500">
                  Last sync: {formatRelativeTime(table.last_synced_at)}
                </div>
              </div>

              {/* Source breakdown */}
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span title="CRM rows (HubSpot + Attio)">
                  CRM: {crmRows}
                </span>
                <span className="text-gray-700">|</span>
                <span title="App + manual rows">
                  App: {appRows}
                </span>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-3">
                {table.conflict_count_7d > 0 && (
                  <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 text-xs">
                    {table.conflict_count_7d} conflicts
                  </Badge>
                )}
                {table.stale_rows > 0 && (
                  <Badge variant="secondary" className="bg-orange-500/10 text-orange-400 text-xs">
                    {table.stale_rows} stale
                  </Badge>
                )}
                <span className="text-sm font-medium text-gray-300">
                  {table.row_count.toLocaleString()} rows
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
