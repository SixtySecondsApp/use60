import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Clock,
  Database,
  ChevronDown,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { formatDistanceToNow } from 'date-fns';
import { CSVImportOpsTableWizard } from '@/components/ops/CSVImportOpsTableWizard';
import { HubSpotImportWizard } from '@/components/ops/HubSpotImportWizard';
import { CrossOpImportWizard } from '@/components/ops/CrossOpImportWizard';
import { CreateTableModal } from '@/components/ops/CreateTableModal';

const tableService = new OpsTableService(supabase);

interface OpsTableItem {
  id: string;
  name: string;
  description: string | null;
  row_count: number;
  source_type: string | null;
  created_at: string;
  updated_at: string;
}

interface EnrichmentStats {
  enriched: number;
  pending: number;
  failed: number;
}

type DerivedStatus = 'running' | 'success' | 'error' | 'idle';

function deriveStatus(stats: EnrichmentStats | undefined): DerivedStatus {
  if (!stats) return 'idle';
  if (stats.pending > 0) return 'running';
  if (stats.failed > 0) return 'error';
  if (stats.enriched > 0) return 'success';
  return 'idle';
}

// --- Sub-components ---

function SourceBadge({ source }: { source: string | null }) {
  const label = source ?? 'manual';
  const config: Record<string, { bg: string; text: string; label: string }> = {
    hubspot: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'hubspot' },
    manual: { bg: 'bg-zinc-500/20', text: 'text-zinc-400', label: 'manual' },
    csv_import: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'csv' },
    csv: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'csv' },
    api: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'api' },
    ai_enrichment: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'ai enrichment' },
    ops_table: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'ops table' },
  };
  const c = config[label] ?? config.manual;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      {label === 'ai_enrichment' && <Sparkles className="h-3 w-3" />}
      {c.label}
    </span>
  );
}

function StatusIndicator({ status }: { status: DerivedStatus }) {
  if (status === 'idle') {
    return <div className="h-2 w-2 rounded-full bg-zinc-500 opacity-50" />;
  }
  if (status === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
  }
  if (status === 'error') {
    return <AlertCircle className="h-4 w-4 text-red-400" />;
  }
  // success
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
}

interface OpCardProps {
  table: OpsTableItem;
  stats: EnrichmentStats | undefined;
  onOpen: (id: string) => void;
}

function OpCard({ table, stats, onOpen }: OpCardProps) {
  const status = deriveStatus(stats);
  const enriched = stats?.enriched ?? 0;
  const enrichmentRate = table.row_count > 0 ? Math.round((enriched / table.row_count) * 100) : 0;

  return (
    <div
      onClick={() => onOpen(table.id)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-gray-800/50 bg-gradient-to-br from-gray-900/80 to-gray-900/40 p-6 backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/10"
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <StatusIndicator status={status} />
          <h3 className="truncate text-[15px] font-semibold text-gray-100 transition-colors group-hover:text-white">
            {table.name}
          </h3>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <SourceBadge source={table.source_type} />
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-5 flex items-center gap-5">
        <div className="flex items-center gap-1.5 text-sm">
          <Database className="h-3.5 w-3.5 text-gray-500" />
          <span className="font-semibold text-gray-200">{table.row_count.toLocaleString()}</span>
          <span className="text-gray-500">rows</span>
        </div>
        {enriched > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <Zap className="h-3.5 w-3.5 text-emerald-500/60" />
            <span className="font-semibold text-emerald-400">{enriched.toLocaleString()}</span>
            <span className="text-gray-500">enriched</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {table.row_count > 0 && enriched > 0 && (
        <div className="mb-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-800/80">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                status === 'running'
                  ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]'
                  : enrichmentRate === 100
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                    : 'bg-emerald-500/70'
              }`}
              style={{ width: `${enrichmentRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDistanceToNow(new Date(table.updated_at), { addSuffix: true })}</span>
        </div>

        {/* Open button - show on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen(table.id);
          }}
          className="rounded-xl p-1.5 text-gray-400 opacity-0 transition-all duration-300 hover:bg-gray-800/60 hover:text-white group-hover:opacity-100"
          title="Open"
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// --- Main Page ---

function OpsPage() {
  const navigate = useNavigate();
  const { userData: user } = useUser();
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showHubSpotImport, setShowHubSpotImport] = useState(false);
  const [showCrossOpImport, setShowCrossOpImport] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // --- Data: tables list ---
  const { data: tables, isLoading } = useQuery({
    queryKey: ['ops-tables', activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return [];
      const { data, error } = await supabase
        .from('dynamic_tables')
        .select('id, name, description, row_count, source_type, created_at, updated_at')
        .eq('organization_id', activeOrg.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as OpsTableItem[];
    },
    enabled: !!activeOrg?.id,
  });

  // --- Data: enrichment stats per table (OLR-001) ---
  const tableIds = useMemo(() => (tables ?? []).map((t) => t.id), [tables]);

  const { data: enrichmentMap } = useQuery({
    queryKey: ['ops-enrichment-stats', tableIds],
    queryFn: async () => {
      if (tableIds.length === 0) return {} as Record<string, EnrichmentStats>;

      // Fetch rows for all tables in one query
      const { data: rows, error: rowErr } = await supabase
        .from('dynamic_table_rows')
        .select('id, table_id')
        .in('table_id', tableIds);

      if (rowErr) throw rowErr;
      if (!rows || rows.length === 0) return {} as Record<string, EnrichmentStats>;

      // Build row→table lookup
      const rowToTable = new Map<string, string>();
      for (const r of rows) {
        rowToTable.set(r.id, r.table_id);
      }
      const allRowIds = rows.map((r) => r.id);

      // Fetch enrichment cells in chunks (Supabase IN limit)
      const CHUNK = 500;
      const cellRows: { row_id: string; status: string; confidence: number | null }[] = [];
      for (let i = 0; i < allRowIds.length; i += CHUNK) {
        const chunk = allRowIds.slice(i, i + CHUNK);
        const { data: cells, error: cellErr } = await supabase
          .from('dynamic_table_cells')
          .select('row_id, status, confidence')
          .in('row_id', chunk)
          .in('status', ['complete', 'pending', 'failed']);

        if (cellErr) throw cellErr;
        if (cells) cellRows.push(...cells);
      }

      // Aggregate per table
      const statsMap: Record<string, EnrichmentStats> = {};
      for (const cell of cellRows) {
        const tableId = rowToTable.get(cell.row_id);
        if (!tableId) continue;
        if (!statsMap[tableId]) statsMap[tableId] = { enriched: 0, pending: 0, failed: 0 };
        const s = statsMap[tableId];
        if (cell.status === 'complete' && cell.confidence !== null) {
          s.enriched++;
        } else if (cell.status === 'pending') {
          s.pending++;
        } else if (cell.status === 'failed') {
          s.failed++;
        }
      }

      return statsMap;
    },
    enabled: tableIds.length > 0,
    refetchInterval: 30_000, // Poll every 30s to pick up running enrichments
  });

  // --- Create table mutation ---
  const createTableMutation = useMutation({
    mutationFn: () => {
      if (!activeOrg?.id || !user?.id) throw new Error('Not authenticated');
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const seg = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const name = `${seg()}-${seg()}-${seg()}`;
      return tableService.createTable({
        organizationId: activeOrg.id,
        createdBy: user.id,
        name,
        sourceType: 'manual',
      });
    },
    onSuccess: (newTable) => {
      queryClient.invalidateQueries({ queryKey: ['ops-tables', activeOrg?.id] });
      navigate(`/ops/${newTable.id}`);
    },
    onError: (err: any) => {
      console.error('Create table error:', err);
      toast.error(err?.message || 'Failed to create table');
    },
  });

  // --- Filtering ---
  const filteredTables = useMemo(() => {
    if (!tables) return [];
    return tables.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSource = sourceFilter === 'all' || (t.source_type ?? 'manual') === sourceFilter;
      const matchesStatus =
        statusFilter === 'all' || deriveStatus(enrichmentMap?.[t.id]) === statusFilter;
      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [tables, searchQuery, sourceFilter, statusFilter, enrichmentMap]);

  // --- Aggregate stats ---
  const totalRows = (tables ?? []).reduce((acc, t) => acc + t.row_count, 0);
  const totalEnriched = Object.values(enrichmentMap ?? {}).reduce((acc, s) => acc + s.enriched, 0);
  const runningCount = (tables ?? []).filter(
    (t) => deriveStatus(enrichmentMap?.[t.id]) === 'running'
  ).length;

  // --- Unique source types for filter dropdown ---
  const sourceTypes = useMemo(() => {
    const set = new Set<string>();
    (tables ?? []).forEach((t) => set.add(t.source_type ?? 'manual'));
    return Array.from(set).sort();
  }, [tables]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800/60 bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100">Ops</h1>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          disabled={createTableMutation.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
        >
          {createTableMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Table
        </button>
      </div>

      <p className="mb-6 text-sm text-zinc-500">AI-powered lead enrichment and data processing</p>

      {/* Quick Stats */}
      {tables && tables.length > 0 && (
        <div className="mb-6 flex items-center gap-6 border-b border-zinc-800/60 pb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{tables.length}</span>
            <span className="text-sm text-zinc-500">tables</span>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{totalRows.toLocaleString()}</span>
            <span className="text-sm text-zinc-500">total rows</span>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-emerald-400">{totalEnriched.toLocaleString()}</span>
            <span className="text-sm text-zinc-500">enriched</span>
          </div>
          {runningCount > 0 && (
            <>
              <div className="h-6 w-px bg-zinc-800" />
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                <span className="text-sm text-blue-400">{runningCount} running</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      {tables && tables.length > 0 && (
        <div className="mb-6 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/60 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 transition-all focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-zinc-800/60 bg-zinc-900/60 py-2.5 pl-4 pr-10 text-sm text-zinc-300 transition-all focus:border-zinc-700 focus:outline-none"
            >
              <option value="all">All Sources</option>
              {sourceTypes.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-zinc-800/60 bg-zinc-900/60 py-2.5 pl-4 pr-10 text-sm text-zinc-300 transition-all focus:border-zinc-700 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="success">Completed</option>
              <option value="running">Running</option>
              <option value="error">Error</option>
              <option value="idle">Idle</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </div>
        </div>
      )}

      {/* Grid */}
      {filteredTables.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTables.map((table) => (
            <OpCard
              key={table.id}
              table={table}
              stats={enrichmentMap?.[table.id]}
              onOpen={(id) => navigate(`/ops/${id}`)}
            />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        /* No results from filters */
        <div className="py-16 text-center">
          <Database className="mx-auto mb-3 h-12 w-12 text-zinc-700" />
          <p className="text-zinc-500">No tables found</p>
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800/50 bg-gradient-to-br from-gray-900/80 to-gray-900/40 px-6 py-20 text-center backdrop-blur-xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
            <Database className="h-7 w-7 text-zinc-500" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-white">No tables yet</h3>
          <p className="mb-6 max-w-sm text-sm text-zinc-400">
            Create your first ops table to start enriching leads and processing data with AI.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={createTableMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {createTableMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create Table
          </button>
        </div>
      )}

      {/* Modals */}
      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSelectCSV={() => setShowCSVImport(true)}
        onSelectHubSpot={() => setShowHubSpotImport(true)}
        onSelectOpsTable={() => setShowCrossOpImport(true)}
        onSelectBlank={() => createTableMutation.mutate()}
      />

      <CSVImportOpsTableWizard
        open={showCSVImport}
        onOpenChange={setShowCSVImport}
        onComplete={(tableId) => {
          setShowCSVImport(false);
          navigate(`/ops/${tableId}`);
        }}
      />

      <HubSpotImportWizard
        open={showHubSpotImport}
        onOpenChange={setShowHubSpotImport}
        onComplete={(tableId) => {
          setShowHubSpotImport(false);
          navigate(`/ops/${tableId}`);
        }}
      />

      <CrossOpImportWizard
        open={showCrossOpImport}
        onOpenChange={setShowCrossOpImport}
        onComplete={(tableId) => {
          setShowCrossOpImport(false);
          navigate(`/ops/${tableId}`);
        }}
      />
    </div>
  );
}

export default OpsPage;
