import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { DynamicTableService } from '@/lib/services/dynamicTableService';
import { DynamicTable } from '@/components/dynamic-tables/DynamicTable';
import { AddColumnModal } from '@/components/dynamic-tables/AddColumnModal';
import { ColumnHeaderMenu } from '@/components/dynamic-tables/ColumnHeaderMenu';
import { BulkActionsBar } from '@/components/dynamic-tables/BulkActionsBar';

// ---------------------------------------------------------------------------
// Service singleton
// ---------------------------------------------------------------------------

const tableService = new DynamicTableService(supabase);

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

function DynamicTableDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  // ---- Data queries ----

  const {
    data: table,
    isLoading: isTableLoading,
    error: tableError,
  } = useQuery({
    queryKey: ['dynamic-table', tableId],
    queryFn: () => tableService.getTable(tableId!),
    enabled: !!tableId,
  });

  const {
    data: tableData,
    isLoading: isDataLoading,
  } = useQuery({
    queryKey: ['dynamic-table-data', tableId, sortState],
    queryFn: () =>
      tableService.getTableData(tableId!, {
        perPage: 500,
        sortBy: sortState?.key === 'row_index' ? 'row_index' : undefined,
        sortDir: sortState?.dir,
      }),
    enabled: !!tableId,
  });

  // ---- Derived data ----

  const columns = useMemo(
    () =>
      (table?.columns ?? []).sort((a, b) => a.position - b.position),
    [table?.columns],
  );

  const rows = useMemo(() => {
    const rawRows = tableData?.rows ?? [];
    if (!sortState || sortState.key === 'row_index') return rawRows;

    // Client-side sort by cell value for a given column key
    const sorted = [...rawRows].sort((a, b) => {
      const aVal = a.cells[sortState.key]?.value ?? '';
      const bVal = b.cells[sortState.key]?.value ?? '';
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [tableData?.rows, sortState]);

  // ---- Mutations ----

  const updateTableMutation = useMutation({
    mutationFn: (updates: { name?: string; description?: string }) =>
      tableService.updateTable(tableId!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      toast.success('Table updated');
    },
    onError: () => toast.error('Failed to update table'),
  });

  const addColumnMutation = useMutation({
    mutationFn: (params: {
      key: string;
      label: string;
      columnType: string;
      isEnrichment: boolean;
      enrichmentPrompt?: string;
    }) =>
      tableService.addColumn({
        tableId: tableId!,
        key: params.key,
        label: params.label,
        columnType: params.columnType as 'text',
        isEnrichment: params.isEnrichment,
        enrichmentPrompt: params.enrichmentPrompt,
        position: (table?.columns?.length ?? 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-table-data', tableId] });
      toast.success('Column added');
    },
    onError: () => toast.error('Failed to add column'),
  });

  const renameColumnMutation = useMutation({
    mutationFn: ({ columnId, label }: { columnId: string; label: string }) =>
      tableService.updateColumn(columnId, { label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      toast.success('Column renamed');
    },
    onError: () => toast.error('Failed to rename column'),
  });

  const hideColumnMutation = useMutation({
    mutationFn: (columnId: string) =>
      tableService.updateColumn(columnId, { isVisible: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      toast.success('Column hidden');
    },
    onError: () => toast.error('Failed to hide column'),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: (columnId: string) => tableService.removeColumn(columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-table-data', tableId] });
      toast.success('Column deleted');
    },
    onError: () => toast.error('Failed to delete column'),
  });

  const cellEditMutation = useMutation({
    mutationFn: ({ cellId, value }: { cellId: string; value: string }) =>
      tableService.updateCell(cellId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-table-data', tableId] });
    },
    onError: () => toast.error('Failed to update cell'),
  });

  const deleteRowsMutation = useMutation({
    mutationFn: (rowIds: string[]) => tableService.deleteRows(rowIds),
    onSuccess: () => {
      setSelectedRows(new Set());
      queryClient.invalidateQueries({ queryKey: ['dynamic-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-table-data', tableId] });
      toast.success('Rows deleted');
    },
    onError: () => toast.error('Failed to delete rows'),
  });

  // ---- Handlers ----

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
      const row = rows.find((r) => r.id === rowId);
      const cell = row?.cells[columnKey];
      if (cell?.id) {
        cellEditMutation.mutate({ cellId: cell.id, value });
      }
    },
    [rows, cellEditMutation],
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
          onClick={() => navigate('/dynamic-tables')}
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dynamic Tables
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
          onClick={() => navigate('/dynamic-tables')}
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dynamic Tables
        </button>

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
        </div>
      </div>

      {/* Table area */}
      <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
        <DynamicTable
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
          onHide={() => hideColumnMutation.mutate(activeColumn.id)}
          onDelete={() => deleteColumnMutation.mutate(activeColumn.id)}
          anchorRect={activeColumnMenu?.anchorRect}
        />
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedRows.size}
        totalCount={rows.length}
        onEnrich={() => toast.info('Enrichment coming soon.')}
        onPushToInstantly={() => toast.info('Push to Instantly coming soon.')}
        onDelete={() => deleteRowsMutation.mutate(Array.from(selectedRows))}
        onDeselectAll={() => setSelectedRows(new Set())}
      />
    </div>
  );
}

export default DynamicTableDetailPage;
