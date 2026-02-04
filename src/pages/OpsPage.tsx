import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table2, Plus, Clock, Rows3, Sparkles, Loader2, Upload, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { formatDistanceToNow } from 'date-fns';
import { CSVImportOpsTableWizard } from '@/components/ops/CSVImportOpsTableWizard';
import { HubSpotImportWizard } from '@/components/ops/HubSpotImportWizard';
import { CrossOpImportWizard } from '@/components/ops/CrossOpImportWizard';

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

function OpsPage() {
  const navigate = useNavigate();
  const { userData: user } = useUser();
  const { activeOrg } = useOrg();

  const queryClient = useQueryClient();
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showHubSpotImport, setShowHubSpotImport] = useState(false);
  const [showCrossOpImport, setShowCrossOpImport] = useState(false);

  const createTableMutation = useMutation({
    mutationFn: () => {
      if (!activeOrg?.id || !user?.id) throw new Error('Not authenticated');
      // Generate a short table ID as the default name (XXX-XXX-XXX format)
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

  const sourceTypeBadge = (sourceType: string | null) => {
    const label = sourceType ?? 'manual';
    const colorMap: Record<string, string> = {
      ai_enrichment: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      csv_import: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      csv: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      api: 'bg-green-500/20 text-green-300 border-green-500/30',
      hubspot: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      ops_table: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      manual: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    };
    const colors = colorMap[label] ?? colorMap.manual;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}>
        {label === 'ai_enrichment' && <Sparkles className="h-3 w-3" />}
        {label.replace(/_/g, ' ')}
      </span>
    );
  };

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
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Table2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Ops</h1>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            AI-powered lead enrichment and data processing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCrossOpImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          >
            <Copy className="h-4 w-4" />
            Import from Op
          </button>
          <button
            onClick={() => setShowHubSpotImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-700/50 bg-orange-900/20 px-4 py-2 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-900/40 hover:text-orange-200"
          >
            <Download className="h-4 w-4" />
            HubSpot
          </button>
          <button
            onClick={() => setShowCSVImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          >
            <Upload className="h-4 w-4" />
            Upload CSV
          </button>
          <button
            onClick={() => createTableMutation.mutate()}
            disabled={createTableMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {createTableMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New Table
          </button>
        </div>
      </div>

      {/* Table Grid */}
      {tables && tables.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => navigate(`/ops/${table.id}`)}
              className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-left transition-all hover:border-zinc-700 hover:bg-zinc-900"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="text-base font-medium text-white group-hover:text-purple-300 transition-colors">
                  {table.name}
                </h3>
                {sourceTypeBadge(table.source_type)}
              </div>

              {table.description && (
                <p className="mb-4 line-clamp-2 text-sm text-zinc-400">
                  {table.description}
                </p>
              )}

              <div className="mt-auto flex items-center gap-4 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <Rows3 className="h-3.5 w-3.5" />
                  {table.row_count.toLocaleString()} rows
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDistanceToNow(new Date(table.updated_at), { addSuffix: true })}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
            <Table2 className="h-7 w-7 text-zinc-500" />
          </div>
          <h3 className="mb-1 text-lg font-medium text-white">No tables yet</h3>
          <p className="mb-6 max-w-sm text-sm text-zinc-400">
            Create your first ops table to start enriching leads and processing data with AI.
          </p>
          <button
            onClick={() => createTableMutation.mutate()}
            disabled={createTableMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
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
