import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Check,
  X,
  Rows3,
  Sparkles,
  FileSpreadsheet,
  Bot,
  FileText,
  Plus,
  Upload,
  RefreshCw,
  Download,
  Copy,
  Zap,
  BookOpen,
  GitBranch,
  HelpCircle,
  Save,
  Clock,
  List,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { OpsTableService } from '@/lib/services/opsTableService';
import { OpsTable } from '@/components/ops/OpsTable';
import { AddColumnModal } from '@/components/ops/AddColumnModal';
import { ColumnHeaderMenu } from '@/components/ops/ColumnHeaderMenu';
import { EditEnrichmentModal } from '@/components/ops/EditEnrichmentModal';
import { ColumnFilterPopover } from '@/components/ops/ColumnFilterPopover';
import { ActiveFilterBar } from '@/components/ops/ActiveFilterBar';
import { BulkActionsBar } from '@/components/ops/BulkActionsBar';
import { HubSpotPushModal, type HubSpotPushConfig } from '@/components/ops/HubSpotPushModal';
import { CSVImportOpsTableWizard } from '@/components/ops/CSVImportOpsTableWizard';
import { ViewSelector } from '@/components/ops/ViewSelector';
import { SaveViewDialog } from '@/components/ops/SaveViewDialog';
import { ViewConfigPanel, normalizeSortConfig, type ViewConfigState } from '@/components/ops/ViewConfigPanel';
import type { SavedView, FilterCondition, OpsTableColumn, SortConfig, GroupConfig, AggregateType } from '@/lib/services/opsTableService';
import { generateSystemViews } from '@/lib/utils/systemViewGenerator';
import { useEnrichment } from '@/lib/hooks/useEnrichment';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useIntegrationPolling } from '@/lib/hooks/useIntegrationStatus';
import { useHubSpotSync } from '@/lib/hooks/useHubSpotSync';
import { useHubSpotWriteBack } from '@/lib/hooks/useHubSpotWriteBack';
import { HubSpotSyncHistory } from '@/components/ops/HubSpotSyncHistory';
import { HubSpotSyncSettingsModal } from '@/components/ops/HubSpotSyncSettingsModal';
import { SaveAsHubSpotListModal } from '@/components/ops/SaveAsHubSpotListModal';
import { useOpsRules } from '@/lib/hooks/useOpsRules';
import { RuleBuilder } from '@/components/ops/RuleBuilder';
import { RuleList } from '@/components/ops/RuleList';
import { AiQueryPreviewModal, type AiQueryOperation } from '@/components/ops/AiQueryPreviewModal';
import { AiQuerySummaryCard, type SummaryData } from '@/components/ops/AiQuerySummaryCard';
import { AiTransformPreviewModal, type TransformPreviewData } from '@/components/ops/AiTransformPreviewModal';
import { AiDeduplicatePreviewModal, type DeduplicatePreviewData } from '@/components/ops/AiDeduplicatePreviewModal';
import { AiQueryBar } from '@/components/ops/AiQueryBar';
import { AiChatThread } from '@/components/ops/AiChatThread';
import { AiInsightsBanner } from '@/components/ops/AiInsightsBanner';
import { WorkflowList } from '@/components/ops/WorkflowList';
import { WorkflowBuilder } from '@/components/ops/WorkflowBuilder';
import { AiRecipeLibrary } from '@/components/ops/AiRecipeLibrary';
import { AutomationsDropdown } from '@/components/ops/AutomationsDropdown';
import { CrossQueryResultPanel } from '@/components/ops/CrossQueryResultPanel';
import { QuickFilterBar } from '@/components/ops/QuickFilterBar';
import { SmartViewSuggestions } from '@/components/ops/SmartViewSuggestions';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { convertAIStyleToCSS, type FormattingRule } from '@/lib/utils/conditionalFormatting';

// ---------------------------------------------------------------------------
// Service singleton
// ---------------------------------------------------------------------------

const tableService = new OpsTableService(supabase);

// ---------------------------------------------------------------------------
// Normalize formatting rules from DB (handles old + new formats)
// ---------------------------------------------------------------------------

function normalizeFormattingRules(raw: any[]): FormattingRule[] {
  if (!raw || !Array.isArray(raw)) return [];

  return raw.flatMap((rule: any) => {
    // New format: flat {column_key, operator, value, style, scope}
    if (rule.column_key && rule.operator) return [rule as FormattingRule];

    // Old format: {conditions: [...], style: {bg_color, text_color}, label}
    if (rule.conditions && Array.isArray(rule.conditions)) {
      return rule.conditions.map((cond: any) => ({
        id: cond.id || crypto.randomUUID(),
        column_key: cond.column_key,
        operator: cond.operator,
        value: cond.value || '',
        scope: 'row' as const,
        style: rule.style?.backgroundColor
          ? rule.style // Already CSS format
          : convertAIStyleToCSS(rule.style || {}), // Convert from Tailwind
        label: rule.label,
      }));
    }

    return []; // Skip unrecognized format
  });
}

// ---------------------------------------------------------------------------
// Source badge config
// ---------------------------------------------------------------------------

const SOURCE_BADGE: Record<string, { label: string; className: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }> = {
  apollo: { label: 'Apollo', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: Sparkles },
  csv: { label: 'CSV', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: FileSpreadsheet },
  copilot: { label: 'Copilot', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Bot },
  hubspot: { label: 'HubSpot', className: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: Download },
  ops_table: { label: 'Ops Import', className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Copy },
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
  const { data: authUser } = useAuthUser();
  const currentUserId = authUser?.id;

  // ---- Local state ----
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [activeColumnMenu, setActiveColumnMenu] = useState<{
    columnId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [sortState, setSortState] = useState<SortConfig | SortConfig[] | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(searchParams.get('view'));
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  // Use ref instead of state to prevent StrictMode double-creation race condition
  const systemViewsCreatedRef = useRef(false);
  const [filterPopoverColumn, setFilterPopoverColumn] = useState<{
    column: OpsTableColumn;
    anchorRect: DOMRect;
    editIndex?: number;
  } | null>(null);

  // OI-028: Chat session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showHubSpotPush, setShowHubSpotPush] = useState(false);
  const [editEnrichmentColumn, setEditEnrichmentColumn] = useState<OpsTableColumn | null>(null);
  const [activeTab, setActiveTab] = useState<'data' | 'rules'>('data');
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [columnOrder, setColumnOrder] = useState<string[] | null>(null);
  const [showViewConfigPanel, setShowViewConfigPanel] = useState(false);
  const [editingView, setEditingView] = useState<SavedView | null>(null);
  const [groupConfig, setGroupConfig] = useState<GroupConfig | null>(null);
  const [summaryConfig, setSummaryConfig] = useState<Record<string, AggregateType> | null>(null);
  const [viewSuggestions, setViewSuggestions] = useState<Array<{
    name: string;
    description: string;
    filterConditions: FilterCondition[];
    sortConfig: SortConfig[];
  }>>([]);
  const [nlViewConfig, setNlViewConfig] = useState<ViewConfigState | null>(null);
  const [nlQueryLoading, setNlQueryLoading] = useState(false);

  // Snapshot state before panel opens so we can revert on cancel
  const preConfigSnapshot = useRef<{
    filters: FilterCondition[];
    sort: SortConfig[];
    columnOrder: string[] | null;
  } | null>(null);

  // ---- OI: New feature state ----
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showWorkflowBuilder, setShowWorkflowBuilder] = useState(false);
  const [showRecipeLibrary, setShowRecipeLibrary] = useState(false);
  const [showSyncHistory, setShowSyncHistory] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [hubspotLists, setHubspotLists] = useState<{ listId: string; name: string }[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [showSaveAsHubSpotList, setShowSaveAsHubSpotList] = useState(false);
  const [crossQueryResult, setCrossQueryResult] = useState<any>(null);

  // ---- Fullscreen mode ----
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dispatch event to AppLayout to hide/show sidebar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ops-fullscreen-change', { detail: { isFullscreen } }));
    return () => {
      // Ensure sidebar is restored on unmount
      window.dispatchEvent(new CustomEvent('ops-fullscreen-change', { detail: { isFullscreen: false } }));
    };
  }, [isFullscreen]);

  // Keyboard shortcut: Cmd/Ctrl + Shift + F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      // Escape exits fullscreen
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // ---- Save as Recipe state ----
  const [lastSuccessfulQuery, setLastSuccessfulQuery] = useState<{ query: string; resultType: string; parsedResult: any } | null>(null);
  const [showSaveRecipeDialog, setShowSaveRecipeDialog] = useState(false);
  const [recipeNameInput, setRecipeNameInput] = useState('');
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // ---- AI Query state ----
  const [aiQueryOperation, setAiQueryOperation] = useState<AiQueryOperation | null>(null);
  const [aiQueryPreviewRows, setAiQueryPreviewRows] = useState<any[]>([]);
  const [aiQueryTotalCount, setAiQueryTotalCount] = useState(0);
  const [isAiQueryParsing, setIsAiQueryParsing] = useState(false);
  const [isAiQueryLoading, setIsAiQueryLoading] = useState(false);
  const [isAiQueryExecuting, setIsAiQueryExecuting] = useState(false);
  const [showAiQueryPreview, setShowAiQueryPreview] = useState(false);

  // ---- New AI Query Commander state ----
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [transformPreviewData, setTransformPreviewData] = useState<TransformPreviewData | null>(null);
  const [showTransformPreview, setShowTransformPreview] = useState(false);
  const [isTransformExecuting, setIsTransformExecuting] = useState(false);
  const [deduplicatePreviewData, setDeduplicatePreviewData] = useState<DeduplicatePreviewData | null>(null);
  const [showDeduplicatePreview, setShowDeduplicatePreview] = useState(false);
  const [isDeduplicateLoading, setIsDeduplicateLoading] = useState(false);
  const [isDeduplicateExecuting, setIsDeduplicateExecuting] = useState(false);

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

  // Normalize sort for query — primary sort goes to server, multi-sort client-side
  const normalizedSorts = useMemo(() => normalizeSortConfig(sortState), [sortState]);
  const primarySort = normalizedSorts[0] ?? null;

  const {
    data: tableData,
    isLoading: isDataLoading,
  } = useQuery({
    queryKey: ['ops-table-data', tableId, sortState, filterConditions],
    queryFn: () =>
      tableService.getTableData(tableId!, {
        perPage: 500,
        sortBy: primarySort?.key ?? 'row_index',
        sortDir: primarySort?.dir,
        filters: filterConditions.length > 0 ? filterConditions : undefined,
      }),
    enabled: !!tableId,
  });

  const { data: views = [], isLoading: isViewsLoading } = useQuery({
    queryKey: ['ops-table-views', tableId],
    queryFn: () => tableService.getViews(tableId!),
    enabled: !!tableId,
  });

  // ---- Enrichment hook ----
  const { startEnrichment, startSingleRowEnrichment } = useEnrichment(tableId ?? '');

  // ---- HubSpot sync hook ----
  const { sync: syncHubSpot, isSyncing: isHubSpotSyncing } = useHubSpotSync(tableId);
  const { writeBack: pushCellToHubSpot } = useHubSpotWriteBack();

  // ---- Rules hook ----
  const { rules, createRule, toggleRule, deleteRule, isCreating: isRuleCreating } = useOpsRules(tableId);

  // ---- Derived data ----

  const columns = useMemo(
    () =>
      (table?.columns ?? []).sort((a, b) => a.position - b.position),
    [table?.columns],
  );

  // Auto-create system views when a table has zero views
  useEffect(() => {
    // Wait for views query to finish loading before deciding to create
    if (isViewsLoading) return;
    if (!tableId || !table || !currentUserId || views.length > 0 || systemViewsCreatedRef.current) return;
    if (columns.length === 0) return;

    // Mark as created immediately (sync) to prevent double-creation
    systemViewsCreatedRef.current = true;

    const systemViewConfigs = generateSystemViews(columns);

    Promise.all(
      systemViewConfigs.map((config) =>
        tableService.createView({
          tableId: tableId,
          createdBy: currentUserId,
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
  }, [tableId, table, currentUserId, views.length, columns, isViewsLoading, queryClient]);

  // Rows: server-side filter + primary sort, then client-side multi-sort if needed
  const rows = useMemo(() => {
    const base = tableData?.rows ?? [];
    if (normalizedSorts.length <= 1) return base;
    // Multi-sort: apply all sort keys client-side
    return [...base].sort((a, b) => {
      for (const s of normalizedSorts) {
        const aVal = a.cells[s.key]?.value ?? '';
        const bVal = b.cells[s.key]?.value ?? '';
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        let cmp: number;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
        }
        if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }, [tableData?.rows, normalizedSorts]);

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
      hubspotPropertyName?: string;
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
        hubspotPropertyName: params.hubspotPropertyName,
        position: (table?.columns?.length ?? 0),
      });
      return { column, autoRunRows: params.autoRunRows, hubspotPropertyName: params.hubspotPropertyName };
    },
    onSuccess: async ({ column, autoRunRows: runRows, hubspotPropertyName }) => {
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

      // Auto-populate HubSpot property columns
      if (hubspotPropertyName && tableId) {
        toast.loading('Populating column values from HubSpot...', { id: 'populate-hubspot' });
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            const resp = await supabase.functions.invoke('populate-hubspot-column', {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                table_id: tableId,
                column_id: column.id,
                property_name: hubspotPropertyName,
              }),
            });
            if (resp.error) {
              toast.error('Failed to populate column values', { id: 'populate-hubspot' });
            } else {
              toast.success(`Populated ${resp.data?.cells_populated ?? 0} cells`, { id: 'populate-hubspot' });
              queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
            }
          }
        } catch (e) {
          console.error('[OpsDetailPage] Populate HubSpot column error:', e);
          toast.error('Failed to populate column values', { id: 'populate-hubspot' });
        }
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

  const updateEnrichmentMutation = useMutation({
    mutationFn: ({ columnId, enrichmentPrompt, enrichmentModel }: { columnId: string; enrichmentPrompt: string; enrichmentModel: string }) =>
      tableService.updateColumn(columnId, { enrichmentPrompt, enrichmentModel }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      toast.success('Enrichment settings updated');
    },
    onError: () => toast.error('Failed to update enrichment settings'),
  });

  const resizeColumnMutation = useMutation({
    mutationFn: ({ columnId, width }: { columnId: string; width: number }) =>
      tableService.updateColumn(columnId, { width }),
    onMutate: async ({ columnId, width }) => {
      // Optimistically update the column width in cache
      await queryClient.cancelQueries({ queryKey: ['ops-table', tableId] });
      const previousTable = queryClient.getQueryData(['ops-table', tableId]);
      queryClient.setQueryData(['ops-table', tableId], (old: any) => {
        if (!old?.columns) return old;
        return {
          ...old,
          columns: old.columns.map((col: any) =>
            col.id === columnId ? { ...col, width } : col
          ),
        };
      });
      return { previousTable };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousTable) {
        queryClient.setQueryData(['ops-table', tableId], context.previousTable);
      }
      toast.error('Failed to resize column');
    },
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
    mutationFn: async (config: HubSpotPushConfig) => {
      const { data, error } = await supabase.functions.invoke('push-to-hubspot', {
        body: { table_id: tableId, row_ids: Array.from(selectedRows), config },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      setShowHubSpotPush(false);
      const listMsg = data?.list_contacts_added
        ? `, ${data.list_contacts_added} added to list`
        : '';
      toast.success(`HubSpot: ${data?.pushed ?? 0} pushed, ${data?.failed ?? 0} failed${listMsg}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to push to HubSpot'),
  });

  // Fetch HubSpot lists when push modal opens
  const fetchHubSpotLists = useCallback(async () => {
    if (!table) return;
    setIsLoadingLists(true);
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-admin', {
        body: { action: 'get_lists', org_id: table.organization_id },
      });
      if (error) throw error;
      const lists = (data?.lists ?? []).map((l: any) => ({
        listId: String(l.listId),
        name: l.name ?? `List ${l.listId}`,
      }));
      setHubspotLists(lists);
    } catch (err) {
      console.error('[OpsDetailPage] Failed to fetch HubSpot lists:', err);
      setHubspotLists([]);
    } finally {
      setIsLoadingLists(false);
    }
  }, [table]);

  // Save as HubSpot List mutation
  const createHubSpotListMutation = useMutation({
    mutationFn: async (config: { listName: string; scope: 'all' | 'selected'; linkList: boolean }) => {
      const rowIds = config.scope === 'selected' ? Array.from(selectedRows) : undefined;
      const { data, error } = await supabase.functions.invoke('hubspot-list-ops', {
        body: {
          action: 'create_list_from_table',
          table_id: tableId,
          list_name: config.listName,
          row_ids: rowIds,
          link_list: config.linkList,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setShowSaveAsHubSpotList(false);
      if (data?.link_list) {
        queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      }
      toast.success(`Created HubSpot list "${data?.list_name}" with ${data?.contacts_added ?? 0} contacts`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create HubSpot list'),
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
    mutationFn: async (rowIds: string[]) => {
      // Pre-capture source_ids for HubSpot list removal
      const sourceIds = rows
        .filter((r) => rowIds.includes(r.id) && r.source_id)
        .map((r) => r.source_id as string);
      await tableService.deleteRows(rowIds);
      return sourceIds;
    },
    onSuccess: (sourceIds) => {
      setSelectedRows(new Set());
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success('Rows deleted');

      // Fire-and-forget: mirror delete to HubSpot list if bidirectional
      const isBidirectional = table?.source_type === 'hubspot' &&
        (table?.source_query as any)?.sync_direction === 'bidirectional';
      const listId = (table?.source_query as any)?.list_id;
      if (isBidirectional && listId && sourceIds.length > 0) {
        supabase.functions.invoke('hubspot-list-ops', {
          body: {
            action: 'remove_from_list',
            list_id: listId,
            contact_ids: sourceIds,
            org_id: table?.organization_id,
          },
        }).then(({ error }) => {
          if (error) {
            console.error('[OpsDetailPage] Failed to remove contacts from HubSpot list:', error);
          } else {
            toast.success(`Removed ${sourceIds.length} contacts from HubSpot list`, { duration: 3000 });
          }
        });
      }
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
    mutationFn: (params: { name: string; formattingRules?: any[] }) =>
      tableService.createView({
        tableId: tableId!,
        createdBy: currentUserId!,
        name: params.name,
        filterConfig: filterConditions,
        sortConfig: sortState,
        columnConfig: null,
        formattingRules: params.formattingRules,
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
    onError: (error: Error) => toast.error(`Failed to delete view: ${error.message}`),
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
      setColumnOrder(view.column_config ?? null);
      setGroupConfig(view.group_config ?? null);
      setSummaryConfig(view.summary_config ?? null);
    }
  }, [views, setSearchParams]);

  const handleDuplicateView = useCallback((view: SavedView) => {
    createViewMutation.mutate({ name: `${view.name} (copy)` });
  }, [createViewMutation]);

  const handleOpenViewConfig = useCallback((viewToEdit?: SavedView) => {
    // Snapshot current state for cancel/revert
    preConfigSnapshot.current = {
      filters: [...filterConditions],
      sort: normalizeSortConfig(sortState),
      columnOrder: columnOrder ? [...columnOrder] : null,
    };
    if (viewToEdit) {
      setEditingView(viewToEdit);
    } else {
      setEditingView(null);
    }
    setShowViewConfigPanel(true);
  }, [filterConditions, sortState, columnOrder]);

  const handleViewConfigClose = useCallback(() => {
    // Revert to snapshot
    if (preConfigSnapshot.current) {
      setFilterConditions(preConfigSnapshot.current.filters);
      setSortState(
        preConfigSnapshot.current.sort.length === 1
          ? preConfigSnapshot.current.sort[0]
          : preConfigSnapshot.current.sort.length > 1
            ? preConfigSnapshot.current.sort
            : null
      );
      setColumnOrder(preConfigSnapshot.current.columnOrder);
    }
    setShowViewConfigPanel(false);
    setEditingView(null);
    setNlViewConfig(null);
    preConfigSnapshot.current = null;
  }, []);

  const handleViewConfigSave = useCallback((config: ViewConfigState) => {
    const sortCfg = config.sorts.length === 1
      ? config.sorts[0]
      : config.sorts.length > 1
        ? config.sorts
        : null;

    if (editingView) {
      // Update existing view
      tableService.updateView(editingView.id, {
        name: config.name,
        filterConfig: config.filters,
        sortConfig: sortCfg,
        columnConfig: config.columnOrder,
        formattingRules: config.formattingRules.length > 0 ? config.formattingRules : null,
        groupConfig: config.groupConfig,
        summaryConfig: config.summaryConfig,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
        toast.success('View updated');
      }).catch(() => toast.error('Failed to update view'));
    } else {
      // Create new view
      tableService.createView({
        tableId: tableId!,
        createdBy: currentUserId!,
        name: config.name,
        filterConfig: config.filters,
        sortConfig: sortCfg,
        columnConfig: config.columnOrder,
        formattingRules: config.formattingRules.length > 0 ? config.formattingRules : null,
        groupConfig: config.groupConfig,
        summaryConfig: config.summaryConfig,
      }).then((newView) => {
        queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
        setActiveViewId(newView.id);
        setSearchParams({ view: newView.id });
        toast.success('View created');
      }).catch(() => toast.error('Failed to create view'));
    }

    // Apply config to current state
    setFilterConditions(config.filters);
    setSortState(sortCfg);
    setColumnOrder(config.columnOrder);
    setGroupConfig(config.groupConfig);
    setSummaryConfig(config.summaryConfig);
    setShowViewConfigPanel(false);
    setEditingView(null);
    setNlViewConfig(null);
    preConfigSnapshot.current = null;
  }, [editingView, tableId, currentUserId, queryClient, setSearchParams]);

  // PV-010: Handle NL view description from ViewConfigPanel
  const handleNlViewQuery = useCallback(async (query: string) => {
    if (!tableId) return;
    setNlQueryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ops-table-ai-query', {
        body: { tableId, query },
      });
      if (error) throw error;
      const result = data as Record<string, unknown>;
      if (result.type === 'configure_view') {
        const viewFilters = (result.filterConditions as FilterCondition[]) || [];
        const viewSorts = (result.sortConfig as SortConfig[]) || [];
        const viewHidden = (result.hiddenColumns as string[]) || [];
        const viewName = result.viewName as string;
        const allColumnKeys = columns.map((c) => c.key);
        const visibleCols = allColumnKeys.filter((k) => !viewHidden.includes(k));
        // Update the panel's config (triggers useEffect re-init)
        setNlViewConfig({
          name: viewName,
          filters: viewFilters,
          sorts: viewSorts,
          columnOrder: visibleCols.length < allColumnKeys.length ? visibleCols : null,
          formattingRules: [],
          groupConfig: null,
          summaryConfig: null,
        });
        // Apply live preview
        setFilterConditions(viewFilters);
        setSortState(viewSorts.length === 1 ? viewSorts[0] : viewSorts.length > 1 ? viewSorts : null);
        toast.success(result.summary as string);
      } else {
        toast.info('Try describing filters and sorts, like "show California leads sorted by score"');
      }
    } catch (err) {
      console.error('[NL View] Error:', err);
      toast.error('Failed to parse view description');
    } finally {
      setNlQueryLoading(false);
    }
  }, [tableId, columns]);

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

      const onSuccess = () => {
        // Fire-and-forget: push to HubSpot if bi-directional
        if (
          table?.source_type === 'hubspot' &&
          (table?.source_query as any)?.sync_direction === 'bidirectional' &&
          col?.hubspot_property_name &&
          tableId
        ) {
          pushCellToHubSpot({
            tableId,
            rowId,
            columnId: col.id,
            newValue: value,
          });
        }
      };

      if (cell?.id) {
        cellEditMutation.mutate(
          { cellId: cell.id, rowId, columnId: col?.id ?? '', value },
          { onSuccess },
        );
      } else if (col) {
        // Cell doesn't exist yet — upsert
        cellEditMutation.mutate(
          { rowId, columnId: col.id, value },
          { onSuccess },
        );
      }
    },
    [tableData?.rows, columns, cellEditMutation, table, tableId, pushCellToHubSpot],
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

  const handleEnrichRow = useCallback(
    (rowId: string, columnId: string) => {
      startSingleRowEnrichment({ columnId, rowId });
    },
    [startSingleRowEnrichment],
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
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!queryInput.trim() || !tableId) return;

      setIsAiQueryParsing(true);

      try {
        const submittedQuery = queryInput.trim();

        // Build sample values from first 5 rows to help AI match column references
        const sampleValues: Record<string, string[]> = {};
        const sampleRows = rows.slice(0, 5);
        for (const col of columns) {
          const vals = sampleRows
            .map((r) => r.cells[col.key]?.value)
            .filter((v): v is string => !!v && v.trim() !== '');
          if (vals.length > 0) sampleValues[col.key] = vals;
        }

        // Call the AI query edge function to parse the natural language
        const { data, error } = await supabase.functions.invoke('ops-table-ai-query', {
          body: {
            tableId,
            query: queryInput.trim(),
            columns: columns.map((c) => ({
              key: c.key,
              label: c.label,
              column_type: c.column_type,
            })),
            rowCount: table?.row_count,
            sampleValues,
            sessionId: currentSessionId, // OI-028: Include session ID for conversational context
          },
        });

        if (error) throw error;

        const result = data as Record<string, unknown>;

        // OI-028: Update session state from response
        if (result.sessionId) {
          setCurrentSessionId(result.sessionId as string);
        }
        if (result.sessionMessages) {
          setSessionMessages(result.sessionMessages as any[]);
        }

        const resultType = (result.type as string) || result.action;

        switch (resultType) {
          // === EXISTING: Filter (non-destructive, apply directly) ===
          case 'filter': {
            setFilterConditions(result.conditions as FilterCondition[]);
            setQueryInput('');
            toast.success(result.summary as string);
            break;
          }

          // === EXISTING: Delete/Update (destructive, show preview) ===
          case 'delete':
          case 'update': {
            const operation = result as unknown as AiQueryOperation;
            setAiQueryOperation(operation);
            setShowAiQueryPreview(true);
            setIsAiQueryLoading(true);
            const preview = await tableService.previewAiQuery(tableId, operation);
            setAiQueryPreviewRows(preview.matchingRows);
            setAiQueryTotalCount(preview.totalCount);
            setIsAiQueryLoading(false);
            break;
          }

          // === NEW: Move Rows (reorder to top/bottom) ===
          case 'move_rows': {
            const moveConditions = result.conditions as FilterCondition[];
            const movePosition = result.position as 'top' | 'bottom';
            const moveResult = await tableService.moveRows(tableId, moveConditions, movePosition);
            if (moveResult.movedCount > 0) {
              // Reset sort to default (row_index) so the move is visible
              setSortState(null);
              queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
              toast.success(result.summary as string);
            } else {
              toast.error('No matching rows found to move');
            }
            setQueryInput('');
            break;
          }

          // === NEW: Sort ===
          case 'sort': {
            const sortConfig = (result.sortConfig as { key: string; dir: 'asc' | 'desc' }[]) || [];
            if (sortConfig.length > 0) {
              setSortState(sortConfig[0]); // Apply first sort (multi-sort needs UI support)
            }
            setQueryInput('');
            toast.success(result.summary as string);
            break;
          }

          // === NEW: Create Column ===
          case 'create_column': {
            const colDef = result.columnDef as {
              key: string;
              label: string;
              columnType: string;
              enrichmentPrompt?: string;
              autoRun?: boolean;
            };
            addColumnMutation.mutate({
              key: colDef.key,
              label: colDef.label,
              columnType: colDef.columnType,
              isEnrichment: colDef.columnType === 'enrichment',
              enrichmentPrompt: colDef.enrichmentPrompt,
              autoRunRows: colDef.autoRun ? 'all' : undefined,
            });
            setQueryInput('');
            toast.success(result.summary as string);
            break;
          }

          // === NEW: Create View ===
          case 'create_view': {
            const viewConditions = (result.filterConditions as FilterCondition[]) || [];
            setFilterConditions(viewConditions);
            createViewMutation.mutate({ name: result.viewName as string });
            setQueryInput('');
            break;
          }

          // === NEW: Batch Create Views ===
          case 'batch_create_views': {
            const splitCol = result.splitByColumn as string;
            const uniqueValues = await tableService.getColumnUniqueValues(tableId, splitCol);
            const colLabel = columns.find((c) => c.key === splitCol)?.label || splitCol;
            for (const val of uniqueValues) {
              await tableService.createView({
                tableId,
                createdBy: currentUserId!,
                name: `${colLabel}: ${val}`,
                filterConfig: [{ column_key: splitCol, operator: 'equals', value: val }],
                sortConfig: null,
                columnConfig: null,
              });
            }
            queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
            setQueryInput('');
            toast.success(`Created ${uniqueValues.length} views by ${colLabel}`);
            break;
          }

          // === NEW: Summarize ===
          case 'summarize': {
            const stats = await tableService.getColumnStats(
              tableId,
              result.groupByColumn as string | undefined,
              result.metricsColumns as string[] | undefined,
            );
            setSummaryData({
              question: result.question as string,
              totalRows: stats.totalRows,
              groups: stats.groups,
              columnStats: stats.columnStats,
              summary: result.summary as string,
            });
            setQueryInput('');
            break;
          }

          // === NEW: Transform ===
          case 'transform': {
            const colKey = result.columnKey as string;
            const colObj = columns.find((c) => c.key === colKey);
            setShowTransformPreview(true);
            setTransformPreviewData(null);
            // Get preview
            const { data: previewData, error: previewErr } = await supabase.functions.invoke(
              'ops-table-transform-column',
              {
                body: {
                  tableId,
                  columnKey: colKey,
                  transformPrompt: result.transformPrompt as string,
                  conditions: result.conditions,
                  previewOnly: true,
                },
              }
            );
            if (previewErr) throw previewErr;
            setTransformPreviewData({
              columnKey: colKey,
              columnLabel: colObj?.label || colKey,
              transformPrompt: result.transformPrompt as string,
              totalEligible: previewData.totalEligible,
              samples: previewData.samples,
            });
            setQueryInput('');
            break;
          }

          // === NEW: Deduplicate ===
          case 'deduplicate': {
            const groupCol = result.groupByColumn as string;
            const groupColObj = columns.find((c) => c.key === groupCol);
            setShowDeduplicatePreview(true);
            setIsDeduplicateLoading(true);
            const dedupResult = await tableService.findDuplicateGroups(
              tableId,
              groupCol,
              (result.keepStrategy as 'most_recent' | 'most_filled' | 'first' | 'last') || 'most_recent',
            );
            setDeduplicatePreviewData({
              groupByColumn: groupCol,
              groupByLabel: groupColObj?.label || groupCol,
              keepStrategy: (result.keepStrategy as string) || 'most_recent',
              groups: dedupResult.groups,
              totalDuplicates: dedupResult.totalDuplicates,
            });
            setIsDeduplicateLoading(false);
            setQueryInput('');
            break;
          }

          // === NEW: Conditional Update ===
          case 'conditional_update': {
            const cRules = (result.rules as { conditions: FilterCondition[]; newValue: string; label?: string }[]) || [];
            const targetCol = result.targetColumn as string;
            // Show as standard preview with rule summary
            const totalMatching = cRules.reduce((sum, r) => sum + r.conditions.length, 0);
            setAiQueryOperation({
              action: 'update',
              conditions: cRules[0]?.conditions || [],
              targetColumn: targetCol,
              newValue: cRules.map((r) => r.label || r.newValue).join('; '),
              summary: result.summary as string,
            });
            setShowAiQueryPreview(true);
            setIsAiQueryLoading(true);
            // Preview first rule's matches
            if (cRules[0]) {
              const preview = await tableService.previewAiQuery(tableId, {
                action: 'update',
                conditions: cRules[0].conditions,
                targetColumn: targetCol,
                newValue: cRules[0].newValue,
              });
              setAiQueryPreviewRows(preview.matchingRows);
              setAiQueryTotalCount(preview.totalCount);
            }
            setIsAiQueryLoading(false);
            break;
          }

          // === NEW: Apply Formatting ===
          case 'formatting': {
            const fmtRules = (result.rules as {
              conditions: FilterCondition[];
              style: { bg_color?: string; text_color?: string };
              label?: string;
            }[]) || [];
            // Convert AI conditions format → flat FormattingRule format with CSS colors
            const formattingRules = fmtRules.flatMap((rule) =>
              rule.conditions.map((cond) => ({
                id: crypto.randomUUID(),
                column_key: cond.column_key,
                operator: cond.operator,
                value: cond.value || '',
                scope: 'row' as const,
                style: convertAIStyleToCSS(rule.style),
                label: rule.label,
              }))
            );
            if (activeViewId) {
              // Save to existing view
              await tableService.updateView(activeViewId, {
                formattingRules,
              });
              queryClient.invalidateQueries({ queryKey: ['ops-table-views', tableId] });
            } else {
              // Create a new view with the formatting
              createViewMutation.mutate({
                name: `Formatted: ${result.summary}`,
                formattingRules,
              });
            }
            setQueryInput('');
            toast.success(result.summary as string);
            break;
          }

          // === NEW: Export ===
          case 'export': {
            const exportConditions = (result.conditions as FilterCondition[]) || [];
            let exportRows = rows;
            if (exportConditions.length > 0) {
              // Apply filter and get matching rows
              const filteredData = await tableService.getTableData(tableId, {
                perPage: 10000,
                filters: exportConditions,
              });
              exportRows = filteredData.rows;
            }
            const exportCols = (result.columns as string[])
              ? columns.filter((c) => (result.columns as string[]).includes(c.key))
              : columns.filter((c) => c.is_visible);
            OpsTableService.generateCSVExport(
              exportRows,
              exportCols,
              (result.filename as string) || table?.name || 'export'
            );
            setQueryInput('');
            toast.success(`Exported ${exportRows.length} rows to CSV`);
            break;
          }

          // === NEW: Cross Column Validate ===
          case 'cross_column_validate': {
            // Create an enrichment column with a validation prompt
            const srcCol = result.sourceColumn as string;
            const tgtCol = result.targetColumn as string;
            const srcLabel = columns.find((c) => c.key === srcCol)?.label || srcCol;
            const tgtLabel = columns.find((c) => c.key === tgtCol)?.label || tgtCol;
            addColumnMutation.mutate({
              key: (result.flagColumnLabel as string || 'validation_result').toLowerCase().replace(/\s+/g, '_'),
              label: (result.flagColumnLabel as string) || 'Validation Result',
              columnType: 'enrichment',
              isEnrichment: true,
              enrichmentPrompt: `Compare the value in {${srcCol}} against {${tgtCol}}. ${result.validationPrompt}. Respond with only "Match" or "Mismatch".`,
              autoRunRows: 'all',
            });
            setQueryInput('');
            toast.success(`Creating validation column: ${srcLabel} vs ${tgtLabel}`);
            break;
          }

          // === PV-009: Suggest Views ===
          case 'suggest_views': {
            const suggestions = (result.suggestions as Array<{
              name: string;
              description: string;
              filterConditions: FilterCondition[];
              sortConfig: SortConfig[];
            }>) || [];
            setViewSuggestions(suggestions);
            setQueryInput('');
            toast.success(`Found ${suggestions.length} view suggestions`);
            break;
          }

          // === PV-010: Configure View from NL ===
          case 'configure_view': {
            const viewFilters = (result.filterConditions as FilterCondition[]) || [];
            const viewSorts = (result.sortConfig as SortConfig[]) || [];
            const viewHidden = (result.hiddenColumns as string[]) || [];
            const viewName = result.viewName as string;
            // Open the ViewConfigPanel pre-populated with the AI config
            const allColumnKeys = columns.map((c) => c.key);
            const visibleCols = allColumnKeys.filter((k) => !viewHidden.includes(k));
            setEditingView(null);
            setShowViewConfigPanel(true);
            // Defer so that ViewConfigPanel picks up existingConfig
            setNlViewConfig({
              name: viewName,
              filters: viewFilters,
              sorts: viewSorts,
              columnOrder: visibleCols.length < allColumnKeys.length ? visibleCols : null,
              formattingRules: [],
              groupConfig: null,
              summaryConfig: null,
            });
            setQueryInput('');
            toast.success(result.summary as string);
            break;
          }

          default: {
            toast.error(`Unknown action type: ${resultType}`);
          }
        }

        // Track successful query for "Save as Recipe"
        if (resultType && resultType !== 'unknown') {
          setLastSuccessfulQuery({
            query: submittedQuery,
            resultType: resultType,
            parsedResult: result,
          });
        }
      } catch (err) {
        console.error('[AI Query] Error:', err);
        const message = err instanceof Error ? err.message : 'Failed to parse query';
        toast.error(message);
      } finally {
        setIsAiQueryParsing(false);
      }
    },
    [queryInput, tableId, columns, table, rows, activeViewId, filterConditions, sortState, queryClient, addColumnMutation, createViewMutation],
  );

  const handleAiQueryConfirm = useCallback(async () => {
    if (!aiQueryOperation || !tableId) return;

    setIsAiQueryExecuting(true);

    try {
      const result = await tableService.executeAiQuery(tableId, aiQueryOperation);

      if (result.success) {
        // Refresh table data
        queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
        queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });

        const actionVerb = aiQueryOperation.action === 'delete' ? 'Deleted' : 'Updated';
        toast.success(`${actionVerb} ${result.affectedCount} row${result.affectedCount !== 1 ? 's' : ''}`);
      }

      // Close modal and reset state
      setShowAiQueryPreview(false);
      setAiQueryOperation(null);
      setAiQueryPreviewRows([]);
      setAiQueryTotalCount(0);
      setQueryInput('');
    } catch (err) {
      console.error('[AI Query] Execute error:', err);
      toast.error('Failed to execute operation');
    } finally {
      setIsAiQueryExecuting(false);
    }
  }, [aiQueryOperation, tableId, queryClient]);

  const handleAiQueryCancel = useCallback(() => {
    setShowAiQueryPreview(false);
    setAiQueryOperation(null);
    setAiQueryPreviewRows([]);
    setAiQueryTotalCount(0);
  }, []);

  // OI-028: New Session handler - clears conversational context
  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setSessionMessages([]);
    // Clear filters and reset table state
    setFilterConditions([]);
    setSortState(null);
    toast.success('Started new chat session');
  }, []);

  const handleTransformConfirm = useCallback(async () => {
    if (!transformPreviewData || !tableId) return;
    setIsTransformExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ops-table-transform-column', {
        body: {
          tableId,
          columnKey: transformPreviewData.columnKey,
          transformPrompt: transformPreviewData.transformPrompt,
          previewOnly: false,
        },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`Transformed ${data.transformedCount} cells`);
      setShowTransformPreview(false);
      setTransformPreviewData(null);
      setQueryInput('');
    } catch (err) {
      toast.error('Failed to transform column');
    } finally {
      setIsTransformExecuting(false);
    }
  }, [transformPreviewData, tableId, queryClient]);

  const handleDeduplicateConfirm = useCallback(async () => {
    if (!deduplicatePreviewData || !tableId) return;
    setIsDeduplicateExecuting(true);
    try {
      const result = await tableService.executeDeduplicate(
        tableId,
        deduplicatePreviewData.groupByColumn,
        deduplicatePreviewData.keepStrategy as 'most_recent' | 'most_filled' | 'first' | 'last',
      );
      queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`Removed ${result.deletedCount} duplicates`);
      setShowDeduplicatePreview(false);
      setDeduplicatePreviewData(null);
      setQueryInput('');
    } catch (err) {
      toast.error('Failed to deduplicate');
    } finally {
      setIsDeduplicateExecuting(false);
    }
  }, [deduplicatePreviewData, tableId, queryClient]);

  // ---- Save as Recipe handler ----

  const handleSaveRecipe = useCallback(async () => {
    if (!lastSuccessfulQuery || !tableId || !currentUserId) return;
    setIsSavingRecipe(true);
    try {
      await tableService.saveRecipe({
        table_id: tableId,
        created_by: currentUserId,
        name: recipeNameInput.trim() || lastSuccessfulQuery.query.slice(0, 60),
        query_text: lastSuccessfulQuery.query,
        parsed_config: lastSuccessfulQuery.parsedResult,
        trigger_type: 'one_shot',
        is_shared: false,
      });
      queryClient.invalidateQueries({ queryKey: ['recipes', tableId] });
      toast.success('Recipe saved');
      setShowSaveRecipeDialog(false);
      setLastSuccessfulQuery(null);
      setRecipeNameInput('');
    } catch (err) {
      toast.error('Failed to save recipe');
    } finally {
      setIsSavingRecipe(false);
    }
  }, [lastSuccessfulQuery, tableId, currentUserId, recipeNameInput, queryClient]);

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
    <div className="flex flex-col min-h-screen">
      {/* Top section: back nav + query bar + metadata */}
      <div className={`shrink-0 border-b border-gray-800 bg-gray-950 px-6 ${isFullscreen ? 'pb-3 pt-3' : 'pb-4 pt-5'}`}>
        {/* Back button — hidden in fullscreen */}
        {!isFullscreen && (
          <button
            onClick={() => navigate('/ops')}
            className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Ops
          </button>
        )}

        {/* View selector tabs — hidden in fullscreen */}
        {!isFullscreen && views.length > 0 && (
          <div className="mb-3">
            <ViewSelector
              views={views}
              activeViewId={activeViewId}
              onSelectView={handleSelectView}
              onCreateView={() => handleOpenViewConfig()}
              onRenameView={(viewId, name) =>
                updateViewMutation.mutate({ viewId, updates: { name } })
              }
              onDuplicateView={handleDuplicateView}
              onDeleteView={(viewId) => deleteViewMutation.mutate(viewId)}
              onEditView={(viewId) => {
                const v = views.find((vw) => vw.id === viewId);
                if (v) handleOpenViewConfig(v);
              }}
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

        {/* Quick filter bar — hidden in fullscreen */}
        {!isFullscreen && rows.length > 0 && (
          <div className="mb-3">
            <QuickFilterBar
              columns={columns}
              rows={rows}
              activeFilters={filterConditions}
              onAddFilter={(condition) => setFilterConditions((prev) => [...prev, condition])}
              onRemoveFilter={(index) => setFilterConditions((prev) => prev.filter((_, i) => i !== index))}
            />
          </div>
        )}

        {/* Smart view suggestions — hidden in fullscreen */}
        {!isFullscreen && viewSuggestions.length > 0 && (
          <SmartViewSuggestions
            suggestions={viewSuggestions}
            onApply={(suggestion) => {
              setFilterConditions(suggestion.filterConditions);
              if (suggestion.sortConfig.length > 0) {
                setSortState(
                  suggestion.sortConfig.length === 1
                    ? suggestion.sortConfig[0]
                    : suggestion.sortConfig
                );
              }
              // Open view config panel pre-filled
              setEditingView(null);
              setNlViewConfig({
                name: suggestion.name,
                filters: suggestion.filterConditions,
                sorts: suggestion.sortConfig,
                columnOrder: null,
                formattingRules: [],
                groupConfig: null,
                summaryConfig: null,
              });
              setShowViewConfigPanel(true);
              setViewSuggestions([]);
            }}
            onDismiss={() => setViewSuggestions([])}
          />
        )}

        {/* Consolidated toolbar */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Left: table name + meta badges */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  onBlur={handleSaveName}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1 text-base font-semibold text-white outline-none focus:border-violet-500"
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
              <div className="group flex items-center gap-1.5">
                <h1 className="text-base font-semibold text-white truncate">{table.name}</h1>
                <button
                  onClick={handleStartEditName}
                  className="rounded p-1 text-gray-500 opacity-0 transition-all hover:bg-gray-800 hover:text-gray-300 group-hover:opacity-100"
                  title="Rename table"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${sourceBadge.className}`}
            >
              <SourceIcon className="h-3 w-3" />
              {sourceBadge.label}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Rows3 className="h-3 w-3" />
              {table.row_count.toLocaleString()} {table.row_count === 1 ? 'row' : 'rows'}
            </span>
          </div>

          {/* Center: AI Query Bar */}
          <div className="flex-1 max-w-xl">
            <AiQueryBar
              value={queryInput}
              onChange={setQueryInput}
              onSubmit={handleQuerySubmit}
              isLoading={isAiQueryParsing}
              columns={columns.map((c) => ({ key: c.key, label: c.label, column_type: c.column_type }))}
              tableId={tableId!}
            />
          </div>

          {/* Right: action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            <AutomationsDropdown
              onOpenWorkflows={() => setShowWorkflows(true)}
              onOpenRecipes={() => setShowRecipeLibrary(true)}
            />
            {/* HubSpot sync buttons (only for hubspot-sourced tables) */}
            {table.source_type === 'hubspot' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={syncHubSpot}
                  disabled={isHubSpotSyncing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-700/40 bg-orange-900/20 px-3 py-1.5 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-900/40 hover:text-orange-200 disabled:opacity-50"
                >
                  {isHubSpotSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sync
                </button>
                <button
                  onClick={() => setShowSyncHistory(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-orange-700/40 bg-orange-900/20 text-orange-300 transition-colors hover:bg-orange-900/40 hover:text-orange-200"
                  title="Sync history"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowSaveAsHubSpotList(true)}
                  disabled={createHubSpotListMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-700/40 bg-orange-900/20 px-3 py-1.5 text-sm font-medium text-orange-300 transition-colors hover:bg-orange-900/40 hover:text-orange-200 disabled:opacity-50"
                  title="Save as HubSpot List"
                >
                  <List className="h-3.5 w-3.5" />
                  Save List
                </button>
              </div>
            )}
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
              CSV
            </button>
            <a
              href="/docs#ops-intelligence"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
              title="Ops Intelligence docs"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </a>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                isFullscreen
                  ? 'border-violet-500/50 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30'
                  : 'border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
              title={isFullscreen ? 'Exit fullscreen (Ctrl+Shift+F)' : 'Fullscreen (Ctrl+Shift+F)'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Save as Recipe bar — shown after successful query, hidden in fullscreen */}
        {!isFullscreen && lastSuccessfulQuery && !showSaveRecipeDialog && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-1.5">
            <BookOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-xs text-amber-300/80 truncate flex-1">
              {lastSuccessfulQuery.query}
            </span>
            <button
              onClick={() => {
                setRecipeNameInput(lastSuccessfulQuery.query.slice(0, 60));
                setShowSaveRecipeDialog(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600/20 border border-amber-600/30 px-2 py-0.5 text-xs font-medium text-amber-300 hover:bg-amber-600/30 transition-colors shrink-0"
            >
              <Save className="h-3 w-3" />
              Save as Recipe
            </button>
            <button
              onClick={() => setLastSuccessfulQuery(null)}
              className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Save Recipe mini dialog — hidden in fullscreen */}
        {!isFullscreen && showSaveRecipeDialog && lastSuccessfulQuery && (
          <div className="mb-3 rounded-xl border border-amber-700/30 bg-gray-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-gray-200">Save as Recipe</span>
            </div>
            <input
              type="text"
              value={recipeNameInput}
              onChange={(e) => setRecipeNameInput(e.target.value)}
              placeholder="Recipe name"
              className="w-full h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRecipe();
                if (e.key === 'Escape') {
                  setShowSaveRecipeDialog(false);
                  setRecipeNameInput('');
                }
              }}
            />
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-2">
              <p className="text-xs text-gray-500 font-mono truncate">{lastSuccessfulQuery.query}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveRecipeDialog(false);
                  setRecipeNameInput('');
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecipe}
                disabled={isSavingRecipe}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-500 transition-all disabled:opacity-50"
              >
                {isSavingRecipe ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                Save Recipe
              </button>
            </div>
          </div>
        )}

        {/* OI-010: AI Insights Banner + OI-033: Predictions — hidden in fullscreen */}
        {!isFullscreen && (
          <AiInsightsBanner
            tableId={tableId!}
            onActionClick={(action: any) => {
              if (action.action_type === 'filter') {
                // Apply filter from insight action
                toast.info('Applying insight filter...');
              }
            }}
          />
        )}

        {/* OI-022: Cross-Query Results — hidden in fullscreen */}
        {!isFullscreen && crossQueryResult && (
          <CrossQueryResultPanel
            result={crossQueryResult}
            onKeepColumn={(col: any) => {
              toast.success(`Column "${col.name}" added to table`);
              setCrossQueryResult(null);
            }}
            onDismiss={() => setCrossQueryResult(null)}
          />
        )}

        {/* AI Summary Card — hidden in fullscreen */}
        {!isFullscreen && summaryData && (
          <div className="mb-4">
            <AiQuerySummaryCard
              data={summaryData}
              onDismiss={() => setSummaryData(null)}
            />
          </div>
        )}
      </div>

      {/* Tab bar — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="shrink-0 border-b border-gray-800 bg-gray-950 px-6">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('data')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'data'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Data
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Rules
              {rules.length > 0 && (
                <span className="ml-1 text-[10px] font-medium bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                  {rules.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Table area */}
      {activeTab === 'data' && (
        <div
          className="px-6 py-4"
          style={{ '--ops-table-max-height': isFullscreen ? 'calc(100vh - 90px)' : 'calc(100vh - 220px)' } as React.CSSProperties}
        >
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
            formattingRules={
              activeViewId
                ? normalizeFormattingRules(views.find((v) => v.id === activeViewId)?.formatting_rules ?? [])
                : []
            }
            columnOrder={columnOrder}
            onColumnReorder={setColumnOrder}
            onColumnResize={(columnId, width) => resizeColumnMutation.mutate({ columnId, width })}
            onEnrichRow={handleEnrichRow}
            groupConfig={groupConfig}
            summaryConfig={summaryConfig}
          />
        </div>
      )}

      {/* Rules tab */}
      {activeTab === 'rules' && (
        <div className="px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Automation Rules</h2>
              {!showRuleBuilder && (
                <button
                  onClick={() => setShowRuleBuilder(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Rule
                </button>
              )}
            </div>

            {showRuleBuilder && (
              <RuleBuilder
                columns={columns}
                userId={table.created_by}
                onSave={(rule) => {
                  createRule(rule);
                  setShowRuleBuilder(false);
                }}
                onCancel={() => setShowRuleBuilder(false)}
                isSaving={isRuleCreating}
              />
            )}

            <RuleList
              rules={rules}
              onToggle={toggleRule}
              onDelete={deleteRule}
            />
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      <AddColumnModal
        isOpen={showAddColumn}
        onClose={() => setShowAddColumn(false)}
        onAdd={(col) => addColumnMutation.mutate(col)}
        onAddMultiple={async (cols) => {
          // Add multiple HubSpot property columns sequentially
          for (const col of cols) {
            await addColumnMutation.mutateAsync(col);
          }
        }}
        existingColumns={columns.map((c) => ({ key: c.key, label: c.label }))}
        sourceType={table?.source_type as 'manual' | 'csv' | 'hubspot' | null}
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
          onEditEnrichment={activeColumn.is_enrichment ? () => {
            setEditEnrichmentColumn(activeColumn);
          } : undefined}
          onReEnrich={activeColumn.is_enrichment ? () => {
            startEnrichment({ columnId: activeColumn.id });
          } : undefined}
          anchorRect={activeColumnMenu?.anchorRect}
        />
      )}

      {/* Edit Enrichment Modal */}
      {editEnrichmentColumn && (
        <EditEnrichmentModal
          isOpen={!!editEnrichmentColumn}
          onClose={() => setEditEnrichmentColumn(null)}
          onSave={(prompt, model) => {
            updateEnrichmentMutation.mutate({
              columnId: editEnrichmentColumn.id,
              enrichmentPrompt: prompt,
              enrichmentModel: model,
            });
          }}
          currentPrompt={editEnrichmentColumn.enrichment_prompt ?? ''}
          currentModel={editEnrichmentColumn.enrichment_model ?? 'anthropic/claude-3.5-sonnet'}
          columnLabel={editEnrichmentColumn.label}
          existingColumns={columns.map((c) => ({ key: c.key, label: c.label }))}
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
        onPushToHubSpot={() => { setShowHubSpotPush(true); fetchHubSpotLists(); }}
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
        hubspotLists={hubspotLists}
        isLoadingLists={isLoadingLists}
      />

      {/* AI Query Preview Modal */}
      <AiQueryPreviewModal
        isOpen={showAiQueryPreview}
        onClose={handleAiQueryCancel}
        onConfirm={handleAiQueryConfirm}
        operation={aiQueryOperation}
        previewRows={aiQueryPreviewRows}
        totalCount={aiQueryTotalCount}
        columns={columns}
        isLoading={isAiQueryLoading}
        isExecuting={isAiQueryExecuting}
      />

      {/* View Config Panel (replaces SaveViewDialog for new/edit views) */}
      <ViewConfigPanel
        isOpen={showViewConfigPanel}
        onClose={handleViewConfigClose}
        onSave={handleViewConfigSave}
        columns={columns}
        rows={rows}
        totalRows={tableData?.total ?? rows.length}
        filteredRows={rows.length}
        mode={editingView ? 'edit' : 'create'}
        existingConfig={
          editingView
            ? {
                viewId: editingView.id,
                name: editingView.name,
                filters: editingView.filter_config ?? [],
                sorts: normalizeSortConfig(editingView.sort_config),
                columnOrder: editingView.column_config,
                formattingRules: editingView.formatting_rules ?? [],
                groupConfig: editingView.group_config ?? null,
                summaryConfig: editingView.summary_config ?? null,
              }
            : nlViewConfig
              ? nlViewConfig
              : {
                  filters: filterConditions,
                  sorts: normalizeSortConfig(sortState),
                  columnOrder,
                }
        }
        onFiltersChange={setFilterConditions}
        onSortsChange={(sorts) => {
          setSortState(sorts.length === 1 ? sorts[0] : sorts.length > 1 ? sorts : null);
        }}
        onColumnOrderChange={setColumnOrder}
        onNlQuery={handleNlViewQuery}
        nlQueryLoading={nlQueryLoading}
      />

      {/* Save View Dialog (legacy — kept for AI query inline create) */}
      <SaveViewDialog
        isOpen={showSaveViewDialog}
        onClose={() => setShowSaveViewDialog(false)}
        columns={columns}
        onSave={(name, formattingRules) => {
          createViewMutation.mutate({ name, formattingRules });
          setShowSaveViewDialog(false);
        }}
      />

      {/* Transform Preview Modal */}
      <AiTransformPreviewModal
        isOpen={showTransformPreview}
        onClose={() => {
          setShowTransformPreview(false);
          setTransformPreviewData(null);
        }}
        onConfirm={handleTransformConfirm}
        data={transformPreviewData}
        isLoading={!transformPreviewData}
        isExecuting={isTransformExecuting}
      />

      {/* Deduplicate Preview Modal */}
      <AiDeduplicatePreviewModal
        isOpen={showDeduplicatePreview}
        onClose={() => {
          setShowDeduplicatePreview(false);
          setDeduplicatePreviewData(null);
        }}
        onConfirm={handleDeduplicateConfirm}
        data={deduplicatePreviewData}
        isLoading={isDeduplicateLoading}
        isExecuting={isDeduplicateExecuting}
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

      {/* OI-028: Conversational Chat Thread */}
      <AiChatThread
        tableId={tableId!}
        sessionId={currentSessionId}
        messages={sessionMessages}
        onNewSession={handleNewSession}
      />

      {/* OI-005: Workflows Panel */}
      <Sheet open={showWorkflows} onOpenChange={setShowWorkflows}>
        <SheetContent className="w-[480px] sm:w-[520px] overflow-y-auto !top-16 !h-auto !p-0 border-l border-white/[0.06] bg-gray-950">
          {/* Header */}
          <div className="border-b border-white/[0.06] px-6 pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <GitBranch className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <SheetTitle className="text-base font-semibold text-gray-100">Workflows</SheetTitle>
                  <p className="text-xs text-gray-500 mt-0.5">Automate actions on your table</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5" />
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            {!showWorkflowBuilder && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowWorkflowBuilder(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-400 hover:to-purple-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Workflow
                </button>
              </div>
            )}
            {showWorkflowBuilder ? (
              <WorkflowBuilder tableId={tableId!} onClose={() => setShowWorkflowBuilder(false)} />
            ) : (
              <WorkflowList tableId={tableId!} onEdit={() => setShowWorkflowBuilder(true)} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* OI-016: Recipe Library */}
      <AiRecipeLibrary
        tableId={tableId!}
        open={showRecipeLibrary}
        onOpenChange={setShowRecipeLibrary}
        onRun={(recipe: any) => {
          setQueryInput(recipe.query_text);
          setShowRecipeLibrary(false);
          toast.info('Recipe loaded into query bar');
        }}
      />

      {/* HubSpot Sync History */}
      {tableId && (
        <HubSpotSyncHistory
          open={showSyncHistory}
          onOpenChange={setShowSyncHistory}
          tableId={tableId}
        />
      )}

      {/* HubSpot Sync Settings */}
      {tableId && table?.source_type === 'hubspot' && (
        <HubSpotSyncSettingsModal
          open={showSyncSettings}
          onOpenChange={setShowSyncSettings}
          tableId={tableId}
          currentSourceQuery={table?.source_query ?? null}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['ops-table', tableId] });
          }}
        />
      )}

      {/* Save as HubSpot List Modal */}
      <SaveAsHubSpotListModal
        isOpen={showSaveAsHubSpotList}
        onClose={() => setShowSaveAsHubSpotList(false)}
        tableName={table?.name ?? 'Untitled'}
        totalRows={rows.length}
        selectedCount={selectedRows.size}
        onSave={(config) => createHubSpotListMutation.mutate(config)}
        isSaving={createHubSpotListMutation.isPending}
      />
    </div>
  );
}

export default OpsDetailPage;
