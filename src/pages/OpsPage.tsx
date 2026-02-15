import React, { useState, useMemo, useCallback } from 'react';
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
  Wand2,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '@/lib/hooks/useUser';
import { useOrg } from '@/lib/contexts/OrgContext';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { formatDistanceToNow } from 'date-fns';
import { CSVImportOpsTableWizard } from '@/components/ops/CSVImportOpsTableWizard';
import { HubSpotImportWizard } from '@/components/ops/HubSpotImportWizard';
import { AttioImportWizard } from '@/components/ops/AttioImportWizard';
import { CrossOpImportWizard } from '@/components/ops/CrossOpImportWizard';
import { ApolloSearchWizard } from '@/components/ops/ApolloSearchWizard';
import { CreateTableModal } from '@/components/ops/CreateTableModal';
import { StandardTablesGallery } from '@/components/ops/StandardTablesGallery';
import { StandardTablesHealth } from '@/components/ops/StandardTablesHealth';
import { useWorkflowOrchestrator } from '@/lib/hooks/useWorkflowOrchestrator';
import { WorkflowProgressStepper } from '@/components/ops/WorkflowProgressStepper';
import { useSmartPollingInterval } from '@/lib/hooks/useSmartPolling';

const tableService = new OpsTableService(supabase);

interface OpsTableItem {
  id: string;
  name: string;
  description: string | null;
  row_count: number;
  source_type: string | null;
  is_standard?: boolean;
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
  const [showAttioImport, setShowAttioImport] = useState(false);
  const [showApolloSearch, setShowApolloSearch] = useState(false);
  const [showCrossOpImport, setShowCrossOpImport] = useState(false);
  const [showWorkflowPrompt, setShowWorkflowPrompt] = useState(false);
  const [workflowInput, setWorkflowInput] = useState('');

  const workflow = useWorkflowOrchestrator();
  const enrichmentPolling = useSmartPollingInterval(60000, 'standard');

  const handleWorkflowSubmit = useCallback(() => {
    const prompt = workflowInput.trim();
    if (!prompt) return;
    setShowWorkflowPrompt(false);
    setWorkflowInput('');
    workflow.execute(prompt);
  }, [workflowInput, workflow]);

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
        .select('id, name, description, row_count, source_type, is_standard, created_at, updated_at')
        .eq('organization_id', activeOrg.id)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as OpsTableItem[];
    },
    enabled: !!activeOrg?.id,
  });

  // --- Data: enrichment stats per table (via server-side RPC) ---
  const { data: enrichmentMap } = useQuery({
    queryKey: ['ops-enrichment-stats', activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return {} as Record<string, EnrichmentStats>;

      const { data, error } = await supabase.rpc('get_enrichment_stats', {
        p_org_id: activeOrg.id,
      });

      if (error) throw error;
      if (!data || data.length === 0) return {} as Record<string, EnrichmentStats>;

      const statsMap: Record<string, EnrichmentStats> = {};
      for (const row of data) {
        statsMap[row.table_id] = {
          enriched: Number(row.enriched) || 0,
          pending: Number(row.pending) || 0,
          failed: Number(row.failed) || 0,
        };
      }
      return statsMap;
    },
    enabled: !!activeOrg?.id,
    refetchInterval: enrichmentPolling,
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
      if (t.is_standard) return false;
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSource = sourceFilter === 'all' || (t.source_type ?? 'manual') === sourceFilter;
      const matchesStatus =
        statusFilter === 'all' || deriveStatus(enrichmentMap?.[t.id]) === statusFilter;
      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [tables, searchQuery, sourceFilter, statusFilter, enrichmentMap]);

  // --- Aggregate stats (custom tables only) ---
  const customTables = useMemo(() => (tables ?? []).filter((t) => !t.is_standard), [tables]);
  const totalRows = customTables.reduce((acc, t) => acc + t.row_count, 0);
  const totalEnriched = customTables.reduce((acc, t) => acc + (enrichmentMap?.[t.id]?.enriched ?? 0), 0);
  const runningCount = customTables.filter(
    (t) => deriveStatus(enrichmentMap?.[t.id]) === 'running'
  ).length;

  // --- Unique source types for filter dropdown ---
  const sourceTypes = useMemo(() => {
    const set = new Set<string>();
    customTables.forEach((t) => set.add(t.source_type ?? 'manual'));
    return Array.from(set).sort();
  }, [customTables]);

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
            <span className="text-2xl font-semibold text-zinc-100">{customTables.length}</span>
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

      {/* Standard Tables Gallery */}
      {tables && tables.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Standard Tables</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Pre-configured CRM tables with auto-sync and enrichment
              </p>
            </div>
          </div>
          <StandardTablesGallery
            onTableClick={(tableId) => navigate(`/ops/${tableId}`)}
            existingTables={tables}
          />
          <div className="mt-4">
            <StandardTablesHealth />
          </div>
        </div>
      )}

      {/* Custom Tables Section Header */}
      {tables && tables.length > 0 && (
        <div className="mb-4 mt-8">
          <h2 className="text-lg font-semibold text-zinc-100">Custom Tables</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your imported and custom ops tables
          </p>
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
        onSelectAttio={() => setShowAttioImport(true)}
        onSelectApollo={() => setShowApolloSearch(true)}
        onSelectOpsTable={() => setShowCrossOpImport(true)}
        onSelectBlank={() => createTableMutation.mutate()}
        onSelectWorkflow={() => setShowWorkflowPrompt(true)}
        existingTables={tables ?? []}
        onTableClick={(id) => {
          setShowCreateModal(false);
          navigate(`/ops/${id}`);
        }}
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

      <AttioImportWizard
        open={showAttioImport}
        onOpenChange={setShowAttioImport}
        onComplete={(tableId) => {
          setShowAttioImport(false);
          navigate(`/ops/${tableId}`);
        }}
      />

      <ApolloSearchWizard
        open={showApolloSearch}
        onOpenChange={setShowApolloSearch}
        onComplete={(tableId) => {
          setShowApolloSearch(false);
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

      {/* NLT: Workflow Prompt Dialog */}
      {showWorkflowPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWorkflowPrompt(false); }}
        >
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-700/60 px-6 py-4">
              <div className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Describe Your Workflow</h2>
              </div>
              <button
                onClick={() => setShowWorkflowPrompt(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-400">
                Describe what you want to do in plain English. The AI will search for leads,
                generate personalised emails, and create an Instantly campaign for you.
              </p>
              <textarea
                value={workflowInput}
                onChange={(e) => setWorkflowInput(e.target.value)}
                placeholder="e.g. Find 50 VP Engineering at Series A-C SaaS companies in the US, write a 3-step cold email sequence about our developer productivity tool, and create an Instantly campaign"
                rows={4}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20 resize-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleWorkflowSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500">
                  Cmd+Enter to submit
                </span>
                <button
                  onClick={handleWorkflowSubmit}
                  disabled={!workflowInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Run Workflow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NLT: Workflow Progress Stepper (shown at bottom of page) */}
      {(workflow.isRunning || workflow.result || workflow.clarifyingQuestions || workflow.steps.length > 0) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl">
          <WorkflowProgressStepper
            isRunning={workflow.isRunning}
            steps={workflow.steps}
            plan={workflow.plan}
            result={workflow.result}
            clarifyingQuestions={workflow.clarifyingQuestions}
            onAnswerClarifications={workflow.answerClarifications}
            onAbort={workflow.abort}
            onDismiss={workflow.reset}
            onNavigateToTable={(id) => {
              workflow.reset();
              navigate(`/ops/${id}`);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default OpsPage;
