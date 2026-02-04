import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Send,
  Loader2,
  Pencil,
  Check,
  X,
  Clock,
  Rows3,
  Sparkles,
  FileSpreadsheet,
  Bot,
  FileText,
  MessageSquare,
  Plus,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { OpsTable } from '@/components/ops/OpsTable';
import { AddColumnModal } from '@/components/ops/AddColumnModal';
import { ColumnHeaderMenu } from '@/components/ops/ColumnHeaderMenu';
import { ColumnFilterPopover } from '@/components/ops/ColumnFilterPopover';
import { ActiveFilterBar } from '@/components/ops/ActiveFilterBar';
import { BulkActionsBar } from '@/components/ops/BulkActionsBar';
import { HubSpotPushModal } from '@/components/ops/HubSpotPushModal';
import { CSVImportOpsTableWizard } from '@/components/ops/CSVImportOpsTableWizard';
import { ViewSelector } from '@/components/ops/ViewSelector';
import { SaveViewDialog } from '@/components/ops/SaveViewDialog';
import type { SavedView, FilterCondition, OpsTableColumn } from '@/lib/services/opsTableService';
import { generateSystemViews } from '@/lib/utils/systemViewGenerator';
import { useEnrichment } from '@/lib/hooks/useEnrichment';
import { useIntegrationPolling } from '@/lib/hooks/useIntegrationStatus';

// ---------------------------------------------------------------------------
// Service singleton
// ---------------------------------------------------------------------------

const tableService = new OpsTableService(supabase);

// ---------------------------------------------------------------------------
// Source badge config
// ---------------------------------------------------------------------------

const SOURCE_BADGE: Record<string, { label: string; className: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }> = {
  apollo: { label: 'Apollo', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: Sparkles },
  csv: { label: 'CSV', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: FileSpreadsheet },
  copilot: { label: 'Copilot', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Bot },
  manual: { label: 'Manual', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', icon: FileText },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function OpsDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Local state ----
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [activeColumnMenu, setActiveColumnMenu] = useState<{
    columnId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [sortState, setSortState] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(searchParams.get('view'));
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [systemViewsCreated, setSystemViewsCreated] = useState(false);
  const [filterPopoverColumn, setFilterPopoverColumn] = useState<{
    column: OpsTableColumn;
    anchorRect: DOMRect;
    editIndex?: number;
  } | null>(null);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showHubSpotPush, setShowHubSpotPush] = useState(false);

  // ---- Data queries ----

  const {
    data: table,
    isLoading: isTableLoading,
    error: tableError,
  } = useQuery({
    queryKey: ['ops-table', tableId],
    queryFn: () => tableService.getTable(tableId!),
    enabled: !!tableId,
  });

  const {
    data: tableData,
    isLoading: isDataLoading,
  } = useQuery({
    queryKey: ['ops-table-data', tableId, sortState, filterConditions],
    queryFn: () =>
      tableService.getTableData(tableId!, {
        perPage: 500,
        sortBy: sortState?.key ?? 'row_index',
        sortDir: sortState?.dir,
        filters: filterConditions.length > 0 ? filterConditions : undefined,
      }),
    enabled: !!tableId,
  });

  const { data: views = [] } = useQuery({
    queryKey: ['ops-table-views', tableId],
    queryFn: () => tableService.getViews(tableId!),
    enabled: !!tableId,
  });

  // ---- Enrichment hook ----
  const { startEnrichment } = useEnrichment(tableId ?? '');

  // ---- Derived data ----

  const columns = useMemo(
    () =>
      (table?.columns ?? []).sort((a, b) => a.position - b.position),
    [table?.columns],
  );

  // Auto-create system views when a table has zero views
  useEffect(() => {
    if (!tableId || !table || views.length > 0 || systemViewsCreated) return;
    if (columns.length === 0) return;

    setSystemViewsCreated(true);

    const systemViewConfigs = generateSystemViews(columns);

    Promise.all(
      systemViewConfigs.map((config) =>
        tableService.createView({
          tableId: tableId,
          createdBy: table.created_by,
          name: config.name,
          isSystem: true,
          isDefault: config.name === 'All',
          filterConfig: config.filterConfig,
          sortConfig: config.sortConfig,
          columnConfig: config.columnConfig,
          position: config.position,
        })
      )
    ).then((createdViews) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
      // Auto-select the "All" view
      const allView = createdViews.find((v) => v.name === 'All');
      if (allView) {
        setActiveViewId(allView.id);
      }
    }).catch(() => {
      // Silently fail — views will just not be auto-created
      // User can still manually create views
    });
  }, [tableId, table, views.length, columns, systemViewsCreated, queryClient]);

  // Rows are now filtered and sorted server-side via getTableData()
  const rows = useMemo(() => tableData?.rows ?? [], [tableData?.rows]);

  // ---- Integration polling ----
  useIntegrationPolling(tableId, columns, rows);

  // ---- Mutations ----

  const updateTableMutation = useMutation({
    mutationFn: (updates: { name?: string; description?: string }) =>
      tableService.updateTable(tableId!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      toast.success('Table updated');
    },
    onError: () => toast.error('Failed to update table'),
  });

  const addColumnMutation = useMutation({
    mutationFn: async (params: {
      key: string;
      label: string;
      columnType: string;
      isEnrichment: boolean;
      enrichmentPrompt?: string;
      autoRunRows?: number | 'all';
      dropdownOptions?: { value: string; label: string; color?: string }[];
      formulaExpression?: string;
      integrationType?: string;
      integrationConfig?: Record<string, unknown>;
    }) => {
      const column = await tableService.addColumn({
        tableId: tableId!,
        key: params.key,
        label: params.label,
        columnType: params.columnType as 'text',
        isEnrichment: params.isEnrichment,
        enrichmentPrompt: params.enrichmentPrompt,
        dropdownOptions: params.dropdownOptions,
        formulaExpression: params.formulaExpression,
        integrationType: params.integrationType,
        integrationConfig: params.integrationConfig,
        position: (table?.columns?.length ?? 0),
      });
      return { column, autoRunRows: params.autoRunRows };
    },
    onSuccess: ({ column, autoRunRows: runRows }) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success('Column added');

      // Auto-trigger enrichment if requested
      if (column.is_enrichment && runRows != null) {
        const allRowIds = tableData?.rows?.map((r) => r.id);
        let rowIdsToEnrich: string[] | undefined;

        if (typeof runRows === 'number' && allRowIds) {
          rowIdsToEnrich = allRowIds.slice(0, runRows);
        }
        // runRows === 'all' → pass undefined (enriches all rows)

        if (allRowIds && allRowIds.length > 0) {
          startEnrichment({ columnId: column.id, rowIds: rowIdsToEnrich });
        }
      }

      // Auto-evaluate formula columns on creation
      if (column.column_type === 'formula' && column.formula_expression) {
        recalcFormulaMutation.mutate(column.id);
      }
    },
    onError: () => toast.error('Failed to add column'),
  });

  const renameColumnMutation = useMutation({
    mutationFn: ({ columnId, label }: { columnId: string; label: string }) =>
      tableService.updateColumn(columnId, { label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      toast.success('Column renamed');
    },
    onError: () => toast.error('Failed to rename column'),
  });

  const hideColumnMutation = useMutation({
    mutationFn: (columnId: string) =>
      tableService.updateColumn(columnId, { isVisible: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      toast.success('Column hidden');
    },
    onError: () => toast.error('Failed to hide column'),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: (columnId: string) => tableService.removeColumn(columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success('Column deleted');
    },
    onError: () => toast.error('Failed to delete column'),
  });

  const pushToHubSpotMutation = useMutation({
    mutationFn: async (config: {
      fieldMappings: { opsColumnKey: string; hubspotProperty: string }[];
      duplicateStrategy: 'update' | 'skip' | 'create';
      listId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('push-to-hubspot', {
        body: { table_id: tableId, row_ids: Array.from(selectedRows), config },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      setShowHubSpotPush(false);
      toast.success(`HubSpot: ${data?.pushed ?? 0} pushed, ${data?.failed ?? 0} failed`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to push to HubSpot'),
  });

  const runIntegrationMutation = useMutation({
    mutationFn: async ({ columnId, rowIds }: { columnId: string; rowIds?: string[] }) => {
      const col = columns.find((c) => c.id === columnId);
      if (!col) throw new Error('Column not found');
      const edgeFn = col.integration_type === 'apify_actor' ? 'run-apify-actor' : 'run-reoon-verification';
      const { data, error } = await supabase.functions.invoke(edgeFn, {
        body: { table_id: tableId, column_id: columnId, row_ids: rowIds },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`Integration started (${data?.processed ?? 0} rows)`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to run integration'),
  });

  const recalcFormulaMutation = useMutation({
    mutationFn: async (columnId: string) => {
      const { data, error } = await supabase.functions.invoke('evaluate-formula', {
        body: { table_id: tableId, column_id: columnId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`Formula recalculated (${data?.evaluated ?? 0} rows)`);
    },
    onError: () => toast.error('Failed to recalculate formula'),
  });

  const cellEditMutation = useMutation({
    mutationFn: ({ cellId, rowId, columnId, value }: { cellId?: string; rowId: string; columnId: string; value: string }) => {
      if (cellId) {
        return tableService.updateCell(cellId, value);
      }
      // Cell doesn't exist yet (empty row) — upsert it
      return tableService.upsertCell(rowId, columnId, value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
    },
    onError: () => toast.error('Failed to update cell'),
  });

  const deleteRowsMutation = useMutation({
    mutationFn: (rowIds: string[]) => tableService.deleteRows(rowIds),
    onSuccess: () => {
      setSelectedRows(new Set());
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success('Rows deleted');
    },
    onError: () => toast.error('Failed to delete rows'),
  });

  const addRowMutation = useMutation({
    mutationFn: () =>
      tableService.addRows(tableId!, [{ cells: {} }]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success('Row added');
    },
    onError: () => toast.error('Failed to add row'),
  });

  // ---- View mutations ----

  const createViewMutation = useMutation({
    mutationFn: (params: { name: string }) =>
      tableService.createView({
        tableId: tableId!,
        createdBy: table!.created_by,
        name: params.name,
        filterConfig: filterConditions,
        sortConfig: sortState,
        columnConfig: null,
      }),
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
      setActiveViewId(newView.id);
      setSearchParams({ view: newView.id });
      toast.success('View created');
    },
    onError: () => toast.error('Failed to create view'),
  });

  const updateViewMutation = useMutation({
    mutationFn: ({ viewId, updates }: { viewId: string; updates: { name?: string } }) =>
      tableService.updateView(viewId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
      toast.success('View updated');
    },
    onError: () => toast.error('Failed to update view'),
  });

  const deleteViewMutation = useMutation({
    mutationFn: (viewId: string) => tableService.deleteView(viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
      setActiveViewId(null);
      setSearchParams({});
      toast.success('View deleted');
    },
    onError: () => toast.error('Failed to delete view'),
  });

  // ---- Handlers ----

  const handleSelectView = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    setSearchParams({ view: viewId });

    // Apply the view's config
    const view = views.find((v) => v.id === viewId);
    if (view) {
      setFilterConditions(view.filter_config ?? []);
      setSortState(view.sort_config ?? null);
    }
  }, [views, setSearchParams]);

  const handleDuplicateView = useCallback((view: SavedView) => {
    createViewMutation.mutate({ name: `${view.name} (copy)` });
  }, [createViewMutation]);

  const handleSelectRow = useCallback((rowId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((r) => r.id)));
    }
  }, [rows, selectedRows.size]);

  const handleCellEdit = useCallback(
    (rowId: string, columnKey: string, value: string) => {
      // Look up from the full tableData rows (which have cell IDs)
      const fullRow = tableData?.rows?.find((r) => r.id === rowId);
      const cell = fullRow?.cells[columnKey];
      const col = columns.find((c) => c.key === columnKey);

      if (cell?.id) {
        cellEditMutation.mutate({ cellId: cell.id, rowId, columnId: col?.id ?? '', value });
      } else if (col) {
        // Cell doesn't exist yet — upsert
        cellEditMutation.mutate({ rowId, columnId: col.id, value });
      }
    },
    [tableData?.rows, columns, cellEditMutation],
  );

  const handleColumnHeaderClick = useCallback(
    (columnId: string) => {
      // Find the column header DOM element to anchor the menu
      const headerEl = document.querySelector(`[data-column-id="${columnId}"]`);
      if (headerEl) {
        setActiveColumnMenu({ columnId, anchorRect: headerEl.getBoundingClientRect() });
      } else {
        // Fallback: use a synthetic rect
        setActiveColumnMenu({
          columnId,
          anchorRect: new DOMRect(200, 200, 100, 34),
        });
      }
    },
    [],
  );

  const handleStartEditName = useCallback(() => {
    if (table) {
      setEditNameValue(table.name);
      setIsEditingName(true);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [table]);

  const handleSaveName = useCallback(() => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== table?.name) {
      updateTableMutation.mutate({ name: trimmed });
    }
    setIsEditingName(false);
  }, [editNameValue, table?.name, updateTableMutation]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveName();
      }
      if (e.key === 'Escape') {
        setIsEditingName(false);
      }
    },
    [handleSaveName],
  );

  const handleApplyFilter = useCallback((condition: FilterCondition, editIndex?: number) => {
    setFilterConditions((prev) => {
      if (editIndex !== undefined) {
        const next = [...prev];
        next[editIndex] = condition;
        return next;
      }
      return [...prev, condition];
    });
    setFilterPopoverColumn(null);
  }, []);

  const handleRemoveFilter = useCallback((index: number) => {
    setFilterConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleEditFilter = useCallback((index: number) => {
    const condition = filterConditions[index];
    const col = columns.find((c) => c.key === condition.column_key);
    if (col) {
      const headerEl = document.querySelector(`[data-column-id="${col.id}"]`);
      const rect = headerEl?.getBoundingClientRect() ?? new DOMRect(200, 200, 100, 34);
      setFilterPopoverColumn({ column: col, anchorRect: rect, editIndex: index });
    }
  }, [filterConditions, columns]);

  const handleQuerySubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!queryInput.trim()) return;
      // Placeholder: will be wired to copilot in a later story
      toast.info('Query bar will be connected to the copilot soon.');
    },
    [queryInput],
  );

  // ---- Active column for menu ----

  const activeColumn = useMemo(() => {
    if (!activeColumnMenu) return null;
    return columns.find((c) => c.id === activeColumnMenu.columnId) ?? null;
  }, [activeColumnMenu, columns]);

  // ---- Source badge ----

  const sourceBadge = SOURCE_BADGE[table?.source_type ?? 'manual'] ?? SOURCE_BADGE.manual;
  const SourceIcon = sourceBadge.icon;

  // ---- Loading & error states ----

  if (isTableLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
          <span className="text-sm text-gray-400">Loading table...</span>
        </div>
      </div>
    );
  }

  if (tableError || !table) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/ops')}
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Ops
        </button>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-800/50 bg-red-950/20 px-6 py-20 text-center">
          <p className="text-sm text-red-400">
            {tableError ? 'Failed to load table.' : 'Table not found.'}
          </p>
        </div>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="flex h-full flex-col">
      {/* Top section: back nav + query bar + metadata */}
      <div className="shrink-0 border-b border-gray-800 bg-gray-950 px-6 pb-4 pt-5">
        {/* Back button */}
        <button
          onClick={() => navigate('/ops')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Ops
        </button>

        {/* View selector tabs */}
        {views.length > 0 && (
          <div className="mb-3">
            <ViewSelector
              views={views}
              activeViewId={activeViewId}
              onSelectView={handleSelectView}
              onCreateView={() => setShowSaveViewDialog(true)}
              onRenameView={(viewId, name) =>
                updateViewMutation.mutate({ viewId, updates: { name } })
              }
              onDuplicateView={handleDuplicateView}
              onDeleteView={(viewId) => deleteViewMutation.mutate(viewId)}
            />
          </div>
        )}

        {/* Active filter bar */}
        {filterConditions.length > 0 && (
          <div className="mb-3">
            <ActiveFilterBar
              conditions={filterConditions}
              columns={columns}
              onRemove={handleRemoveFilter}
              onClearAll={() => setFilterConditions([])}
              onEditFilter={handleEditFilter}
            />
          </div>
        )}

        {/* Query bar */}
        <form onSubmit={handleQuerySubmit} className="mb-5">
          <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2.5 transition-colors focus-within:border-violet-500/40 focus-within:ring-1 focus-within:ring-violet-500/20">
            <MessageSquare className="h-4 w-4 shrink-0 text-gray-500" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Ask anything... e.g. 'Remove anyone without a verified email'"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
            />
            <button
              type="submit"
              disabled={!queryInput.trim()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        {/* Metadata header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: name + description */}
          <div className="min-w-0 flex-1">
            {/* Editable table name */}
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onBlur={handleSaveName}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-lg font-semibold text-white outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={handleSaveName}
                    className="rounded p-1 text-green-400 transition-colors hover:bg-gray-800"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-white">{table.name}</h1>
                  <button
                    onClick={handleStartEditName}
                    className="rounded p-1 text-gray-500 opacity-0 transition-all hover:bg-gray-800 hover:text-gray-300 group-hover:opacity-100"
                    title="Rename table"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            {table.description && (
              <p className="mt-1 text-sm text-gray-400">{table.description}</p>
            )}

            {/* Badges & meta row */}
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {/* Source badge */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium ${sourceBadge.className}`}
              >
                <SourceIcon className="h-3 w-3" />
                {sourceBadge.label}
              </span>

              {/* Row count */}
              <span className="inline-flex items-center gap-1">
                <Rows3 className="h-3 w-3" />
                {table.row_count.toLocaleString()} {table.row_count === 1 ? 'row' : 'rows'}
              </span>

              {/* Created */}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created {formatDistanceToNow(new Date(table.created_at), { addSuffix: true })}
              </span>

              {/* Updated */}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated {formatDistanceToNow(new Date(table.updated_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => addRowMutation.mutate()}
              disabled={addRowMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
            >
              {addRowMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Row
            </button>
            <button
              onClick={() => setShowCSVImport(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table area */}
      <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
        <OpsTable
          columns={columns}
          rows={rows}
          selectedRows={selectedRows}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          onCellEdit={handleCellEdit}
          onAddColumn={() => setShowAddColumn(true)}
          onColumnHeaderClick={handleColumnHeaderClick}
          isLoading={isDataLoading}
        />
      </div>

      {/* Add Column Modal */}
      <AddColumnModal
        isOpen={showAddColumn}
        onClose={() => setShowAddColumn(false)}
        onAdd={(col) => addColumnMutation.mutate(col)}
        existingColumns={columns.map((c) => ({ key: c.key, label: c.label }))}
      />

      {/* Column Header Menu */}
      {activeColumn && (
        <ColumnHeaderMenu
          isOpen={!!activeColumnMenu}
          onClose={() => setActiveColumnMenu(null)}
          column={activeColumn}
          onRename={(label) =>
            renameColumnMutation.mutate({ columnId: activeColumn.id, label })
          }
          onSortAsc={() => {
            setSortState({ key: activeColumn.key, dir: 'asc' });
          }}
          onSortDesc={() => {
            setSortState({ key: activeColumn.key, dir: 'desc' });
          }}
          onFilter={() => {
            if (activeColumnMenu) {
              setFilterPopoverColumn({
                column: activeColumn,
                anchorRect: activeColumnMenu.anchorRect,
              });
              setActiveColumnMenu(null);
            }
          }}
          onHide={() => hideColumnMutation.mutate(activeColumn.id)}
          onDelete={() => deleteColumnMutation.mutate(activeColumn.id)}
          onRecalcFormula={activeColumn.column_type === 'formula' ? () => recalcFormulaMutation.mutate(activeColumn.id) : undefined}
          onRunIntegration={activeColumn.column_type === 'integration' ? () => runIntegrationMutation.mutate({ columnId: activeColumn.id }) : undefined}
          onRetryFailed={activeColumn.column_type === 'integration' ? () => {
            const failedRowIds = tableData?.rows
              ?.filter((r) => r.cells[activeColumn.key]?.status === 'failed')
              .map((r) => r.id);
            if (failedRowIds && failedRowIds.length > 0) {
              runIntegrationMutation.mutate({ columnId: activeColumn.id, rowIds: failedRowIds });
            } else {
              toast.info('No failed rows to retry');
            }
          } : undefined}
          anchorRect={activeColumnMenu?.anchorRect}
        />
      )}

      {/* Column Filter Popover */}
      {filterPopoverColumn && (
        <ColumnFilterPopover
          column={filterPopoverColumn.column}
          onApply={(condition) => handleApplyFilter(condition, filterPopoverColumn.editIndex)}
          onClose={() => setFilterPopoverColumn(null)}
          anchorRect={filterPopoverColumn.anchorRect}
          existingCondition={
            filterPopoverColumn.editIndex !== undefined
              ? filterConditions[filterPopoverColumn.editIndex]
              : undefined
          }
        />
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedRows.size}
        totalCount={rows.length}
        onEnrich={() => {
          const enrichCols = columns.filter((c) => c.is_enrichment);
          if (enrichCols.length === 0) return toast.info('No enrichment columns');
          startEnrichment({ columnId: enrichCols[0].id, rowIds: Array.from(selectedRows) });
        }}
        onPushToInstantly={() => toast.info('Push to Instantly coming soon.')}
        onPushToHubSpot={() => setShowHubSpotPush(true)}
        onReEnrich={() => {
          const enrichCols = columns.filter((c) => c.is_enrichment);
          if (enrichCols.length === 0) return toast.info('No enrichment columns');
          startEnrichment({ columnId: enrichCols[0].id, rowIds: Array.from(selectedRows) });
        }}
        onDelete={() => deleteRowsMutation.mutate(Array.from(selectedRows))}
        onDeselectAll={() => setSelectedRows(new Set())}
      />

      {/* HubSpot Push Modal */}
      <HubSpotPushModal
        isOpen={showHubSpotPush}
        onClose={() => setShowHubSpotPush(false)}
        columns={columns}
        selectedRows={rows.filter((r) => selectedRows.has(r.id))}
        onPush={(config) => pushToHubSpotMutation.mutate(config)}
        isPushing={pushToHubSpotMutation.isPending}
      />

      {/* Save View Dialog */}
      <SaveViewDialog
        isOpen={showSaveViewDialog}
        onClose={() => setShowSaveViewDialog(false)}
        onSave={(name) => {
          createViewMutation.mutate({ name });
          setShowSaveViewDialog(false);
        }}
      />

      {/* CSV Import Wizard */}
      <CSVImportOpsTableWizard
        open={showCSVImport}
        onOpenChange={setShowCSVImport}
        onComplete={(_importedTableId) => {
          setShowCSVImport(false);
          queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
          queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
        }}
      />
    </div>
  );
}

export default OpsDetailPage;
