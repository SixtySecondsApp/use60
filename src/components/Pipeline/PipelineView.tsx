/**
 * PipelineView Component (PIPE-011)
 *
 * Refactored pipeline view with premium glass-morphism design.
 * - Uses usePipelineData hook for unified data fetching
 * - DealIntelligenceSheet integration (sheet on right, pipeline on left)
 * - Clean kanban/table view toggle
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Download, Users2 } from 'lucide-react';
import { PipelineHeader } from './PipelineHeader';
import { PipelineKanban } from './PipelineKanban';
import { PipelineTable } from './PipelineTable';
import { RelationshipGraph } from './RelationshipGraph';
import { DealIntelligenceSheet } from './DealIntelligenceSheet';
import { DealForm } from './DealForm';
import { HubSpotImportWizard } from '../ops/HubSpotImportWizard';
import { AttioImportWizard } from '../ops/AttioImportWizard';
import { usePipelineData } from './hooks/usePipelineData';
import { usePipelineFilters, PIPELINE_PAGE_SIZE } from './hooks/usePipelineFilters';
import { PipelinePagination } from './PipelinePagination';
import { PipelineSavedViewsPanel } from './PipelineSavedViewsPanel';
import { PipelineColumnCustomizer } from './PipelineColumnCustomizer';
import { PipelineManagerView } from './PipelineManagerView';
import { BulkActionBar } from './BulkActionBar';
import { usePipelineColumns } from './hooks/usePipelineColumns';
import { exportDealsToCSV } from './pipelineUtils';
import type { PipelineSavedView } from './hooks/usePipelineSavedViews';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgStore } from '@/lib/stores/orgStore';
import { toast } from 'sonner';
import logger from '@/lib/utils/logger';

function PipelineSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 dark:bg-white/[0.04] rounded-lg w-48 animate-pulse" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 w-28 bg-gray-100 dark:bg-white/[0.025] rounded-xl border border-gray-200/80 dark:border-white/[0.06] animate-pulse" />
          ))}
        </div>
      </div>

      {/* Columns skeleton */}
      <div className="flex gap-3 overflow-x-auto pb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="min-w-[300px] max-w-[300px] bg-white/80 dark:bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-gray-200/80 dark:border-white/[0.06] flex flex-col h-[500px]"
          >
            {/* Stage stripe */}
            <div className="h-[2.5px] w-full bg-gray-200 dark:bg-white/[0.06] rounded-t-2xl" />

            {/* Header */}
            <div className="p-4 border-b border-gray-200/80 dark:border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 bg-gray-200 dark:bg-white/[0.06] rounded w-20 animate-pulse" />
                <div className="h-4 w-6 bg-gray-100 dark:bg-white/[0.04] rounded-full animate-pulse" />
              </div>
              <div className="h-5 bg-gray-200 dark:bg-white/[0.06] rounded w-16 animate-pulse" />
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 flex-1">
              {[1, 2, 3].map((j) => (
                <div key={j} className="bg-gray-50 dark:bg-white/[0.02] rounded-xl p-3 h-28 animate-pulse border border-gray-200/50 dark:border-white/[0.04]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelineView() {
  const activeOrgId = useOrgStore((state) => state.activeOrgId);
  const filterState = usePipelineFilters();
  const isTableView = filterState.viewMode === 'table';
  const pipelineData = usePipelineData({
    filters: filterState.filters,
    sortBy: filterState.sortBy as any,
    sortDir: filterState.sortDir,
    // Table: paginated 25 at a time. Kanban: load all deals, lazy-render per column.
    limit: isTableView ? PIPELINE_PAGE_SIZE : 200,
    offset: isTableView ? (filterState.page - 1) * PIPELINE_PAGE_SIZE : 0,
  });

  const totalPages = Math.max(1, Math.ceil(pipelineData.data.totalCount / PIPELINE_PAGE_SIZE));

  // Sheet state
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null);

  // Multi-select state (PIPE-ADV-002)
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());

  // Manager view toggle (PIPE-ADV-003)
  const [showManagerView, setShowManagerView] = useState(false);

  // Column customization (PIPE-ADV-004)
  const { visibleColumns, visibleColumnIds, allColumns, toggleColumn, resetColumns } = usePipelineColumns();

  // Deal form state
  const [showDealForm, setShowDealForm] = useState(false);
  const [initialStageId, setInitialStageId] = useState<string | null>(null);
  const [editingDeal, setEditingDeal] = useState<any>(null);

  // CRM import state
  const [importSource, setImportSource] = useState<'hubspot' | 'attio' | null>(null);
  const [connectedCRMs, setConnectedCRMs] = useState({ hubspot: false, attio: false });

  // Detect connected CRMs
  useEffect(() => {
    if (!activeOrgId) return;
    async function checkCRMs() {
      const [{ data: hs }, { data: at }] = await Promise.all([
        supabase.from('hubspot_org_integrations').select('id').eq('clerk_org_id', activeOrgId!).eq('is_active', true).maybeSingle(),
        supabase.from('attio_org_integrations').select('id').eq('clerk_org_id', activeOrgId!).eq('is_active', true).maybeSingle(),
      ]);
      setConnectedCRMs({ hubspot: !!hs, attio: !!at });
    }
    checkCRMs();
  }, [activeOrgId]);

  // Get selected deal from dealMap
  const selectedDeal = selectedDealId ? pipelineData.data.dealMap[selectedDealId] || null : null;

  // Group deals by stage for kanban view
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    pipelineData.data.stageMetrics.forEach((stage) => {
      grouped[stage.stage_id] = [];
    });
    pipelineData.data.deals.forEach((deal) => {
      if (deal.stage_id && grouped[deal.stage_id]) {
        grouped[deal.stage_id].push(deal);
      }
    });
    return grouped;
  }, [pipelineData.data.deals, pipelineData.data.stageMetrics]);

  // Apply a saved view (PIPE-ADV-001)
  const handleApplySavedView = useCallback((view: PipelineSavedView) => {
    const f = view.filters;
    if (f.stage_ids !== undefined) filterState.setStageIds(f.stage_ids || []);
    if (f.health_status !== undefined) filterState.setHealthStatus(f.health_status || []);
    if (f.risk_level !== undefined) filterState.setRiskLevel(f.risk_level || []);
    if (f.owner_ids !== undefined) filterState.setOwnerIds(f.owner_ids || []);
    if (f.search !== undefined) filterState.setSearch(f.search || '');
    if (f.sort_by) filterState.setSortBy(f.sort_by as any);
    if (f.sort_dir) filterState.setSortDir(f.sort_dir as any);
    if (f.view_mode) filterState.setViewMode(f.view_mode as any);
    toast.success(`View "${view.name}" applied`);
  }, [filterState]);

  // Handle deal click - open sheet
  const handleDealClick = (dealId: string) => {
    setSelectedDealId(dealId);
  };

  // Handle add deal click (from header or column)
  const handleAddDealClick = useCallback((stageId: string | null = null) => {
    setEditingDeal(null);
    setInitialStageId(stageId);
    setShowDealForm(true);
  }, []);

  // Handle edit deal click (from intelligence sheet)
  const handleEditDeal = useCallback((deal: any) => {
    setEditingDeal(deal);
    setInitialStageId(null);
    setShowDealForm(true);
  }, []);

  // Handle save deal (create or update)
  const handleSaveDeal = useCallback(async (formData: any) => {
    try {
      // Compute value from revenue fields if not explicitly set
      const computedValue = formData.value ??
        (((formData.one_off_revenue || 0) + ((formData.monthly_mrr || 0) * 3)) || null);

      const dataWithValue = { ...formData, value: computedValue };

      if (editingDeal) {
        // Update existing deal
        const { error } = await supabase
          .from('deals')
          .update({
            ...dataWithValue,
            ...(dataWithValue.stage_id !== editingDeal.stage_id ? { stage_changed_at: new Date().toISOString() } : {}),
          })
          .eq('id', editingDeal.id);

        if (error) throw error;

        setShowDealForm(false);
        setEditingDeal(null);
        pipelineData.refetch().catch((err) => logger.warn('Refetch after deal update failed:', err));
        toast.success('Deal updated successfully');
      } else {
        // Create new deal — ensure company fallback
        const dataToInsert = {
          ...dataWithValue,
          company: dataWithValue.company || dataWithValue.name || 'Unknown',
          clerk_org_id: activeOrgId,
          stage_changed_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('deals')
          .insert(dataToInsert);

        if (error) throw error;

        setShowDealForm(false);
        setInitialStageId(null);
        pipelineData.refetch().catch((err) => logger.warn('Refetch after deal creation failed:', err));
        toast.success('Deal created successfully');
      }
    } catch (err: any) {
      logger.error('Error saving deal:', err);
      toast.error(`Failed to save deal: ${err?.message || 'Unknown error'}`);
    }
  }, [pipelineData, activeOrgId, editingDeal]);

  // Handle delete deal
  const handleDeleteDeal = useCallback(async (dealId: string) => {
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', dealId);

    if (error) throw error;

    setShowDealForm(false);
    setEditingDeal(null);
    setSelectedDealId(null);
    pipelineData.refetch().catch((err) => logger.warn('Refetch after deal delete failed:', err));
  }, [pipelineData]);

  // Handle deal stage change
  const handleDealStageChange = async (dealId: string, newStageId: string) => {
    try {
      const { error } = await supabase
        .from('deals')
        .update({
          stage_id: newStageId,
          stage_changed_at: new Date().toISOString(),
        })
        .eq('id', dealId);

      if (error) throw error;

      pipelineData.refetch().catch((err) => logger.warn('Refetch after stage change failed:', err));
      toast.success('Deal moved successfully');
    } catch (err: any) {
      logger.error('Error updating deal stage:', err);
      toast.error(`Failed to move deal: ${err?.message || 'Unknown error'}`);
      throw err;
    }
  };

  if (pipelineData.isLoading) {
    return <PipelineSkeleton />;
  }

  if (pipelineData.error) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="text-red-500 mb-4">Error loading pipeline data</div>
        <div className="text-gray-600 dark:text-gray-400">{pipelineData.error.message}</div>
      </div>
    );
  }

  return (
    <>
      <PipelineHeader
        summary={pipelineData.data.summary}
        stageMetrics={pipelineData.data.stageMetrics}
        viewMode={filterState.viewMode}
        onViewModeChange={filterState.setViewMode}
        searchValue={filterState.filters.search || ''}
        onSearchChange={filterState.setSearch}
        selectedStages={filterState.filters.stage_ids || []}
        onStagesChange={filterState.setStageIds}
        selectedHealthStatus={filterState.filters.health_status || []}
        onHealthStatusChange={filterState.setHealthStatus}
        selectedRiskLevel={filterState.filters.risk_level || []}
        onRiskLevelChange={filterState.setRiskLevel}
        onClearFilters={filterState.clearFilters}
        hasActiveFilters={filterState.hasActiveFilters}
        onAddDeal={() => handleAddDealClick(null)}
        connectedCRMs={connectedCRMs}
        onImportFromCRM={(source) => setImportSource(source)}
      />

      {/* Table toolbar: saved views, columns, export, manager view (PIPE-ADV-001/004/005/003) */}
      {isTableView && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <PipelineSavedViewsPanel
            currentFilters={{
              ...filterState.filters,
              sort_by: filterState.sortBy,
              sort_dir: filterState.sortDir,
              view_mode: filterState.viewMode,
            }}
            onApply={handleApplySavedView}
          />

          <PipelineColumnCustomizer
            allColumns={allColumns}
            visibleColumnIds={visibleColumnIds}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />

          <button
            onClick={() => setShowManagerView(!showManagerView)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium backdrop-blur-xl transition-all ${
              showManagerView
                ? 'bg-blue-50 dark:bg-blue-500/[0.08] border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
                : 'bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04]'
            }`}
          >
            <Users2 className="w-3.5 h-3.5" />
            Manager
          </button>

          <button
            onClick={() => exportDealsToCSV(pipelineData.data.deals)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-white/60 dark:bg-white/[0.02] border border-gray-200/80 dark:border-white/[0.09] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.13] hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.04] backdrop-blur-xl transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {filterState.viewMode === 'kanban' ? (
        <PipelineKanban
          stageMetrics={pipelineData.data.stageMetrics}
          dealsByStage={dealsByStage}
          onDealClick={handleDealClick}
          onDealStageChange={handleDealStageChange}
          onAddDealClick={handleAddDealClick}
        />
      ) : showManagerView ? (
        <PipelineManagerView
          deals={pipelineData.data.deals}
          stageMetrics={pipelineData.data.stageMetrics}
          onDealClick={handleDealClick}
        />
      ) : filterState.viewMode === 'graph' ? (
        <RelationshipGraph />
      ) : (
        <PipelineTable
          deals={pipelineData.data.deals}
          onDealClick={handleDealClick}
          sortBy={filterState.sortBy}
          sortDir={filterState.sortDir}
          onSort={(column) => {
            if (filterState.sortBy === column) {
              filterState.setSortDir(filterState.sortDir === 'asc' ? 'desc' : 'asc');
            } else {
              filterState.setSortBy(column as any);
              filterState.setSortDir('desc');
            }
          }}
          selectedIds={selectedDealIds}
          onSelectionChange={setSelectedDealIds}
          visibleColumns={visibleColumns}
        />
      )}

      {isTableView && totalPages > 1 && !showManagerView && (
        <PipelinePagination
          currentPage={filterState.page}
          totalPages={totalPages}
          totalCount={pipelineData.data.totalCount}
          pageSize={PIPELINE_PAGE_SIZE}
          onPageChange={filterState.setPage}
        />
      )}

      {/* Bulk action bar (PIPE-ADV-002) */}
      {isTableView && selectedDealIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedDealIds}
          stageMetrics={pipelineData.data.stageMetrics}
          onClear={() => setSelectedDealIds(new Set())}
          onRefresh={() => pipelineData.refetch().catch((err) => logger.warn('Refetch after bulk action failed:', err))}
        />
      )}

      {/* Deal Intelligence Sheet */}
      <DealIntelligenceSheet
        dealId={selectedDealId}
        deal={selectedDeal}
        open={!!selectedDealId}
        onOpenChange={(open) => {
          if (!open) setSelectedDealId(null);
        }}
        onEditDeal={handleEditDeal}
      />

      {/* Deal Form Modal (New + Edit) */}
      {showDealForm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              (e.currentTarget as HTMLElement).dataset.mouseStartX = e.clientX.toString();
              (e.currentTarget as HTMLElement).dataset.mouseStartY = e.clientY.toString();
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const startX = parseInt((e.currentTarget as HTMLElement).dataset.mouseStartX || '0');
              const startY = parseInt((e.currentTarget as HTMLElement).dataset.mouseStartY || '0');
              if (Math.abs(e.clientX - startX) < 5 && Math.abs(e.clientY - startY) < 5) {
                setShowDealForm(false);
                setInitialStageId(null);
                setEditingDeal(null);
              }
            }
          }}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl shadow-black/50 w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <DealForm
              key={editingDeal?.id || initialStageId || 'new-deal'}
              deal={editingDeal}
              onSave={handleSaveDeal}
              onDelete={handleDeleteDeal}
              onCancel={() => {
                setShowDealForm(false);
                setInitialStageId(null);
                setEditingDeal(null);
              }}
              initialStageId={initialStageId}
            />
          </div>
        </div>
      )}

      {/* CRM Import Wizards (pipeline mode) */}
      <HubSpotImportWizard
        open={importSource === 'hubspot'}
        onOpenChange={(open) => { if (!open) setImportSource(null); }}
        importMode="pipeline"
        onComplete={() => {
          setImportSource(null);
          pipelineData.refetch().catch((err) => logger.warn('Refetch after CRM import failed:', err));
        }}
      />
      <AttioImportWizard
        open={importSource === 'attio'}
        onOpenChange={(open) => { if (!open) setImportSource(null); }}
        importMode="pipeline"
        onComplete={() => {
          setImportSource(null);
          pipelineData.refetch().catch((err) => logger.warn('Refetch after CRM import failed:', err));
        }}
      />
    </>
  );
}

/**
 * PipelinePage - wraps PipelineView with layout
 */
export function PipelinePage() {
  return (
    <div className="max-w-full w-full min-h-screen bg-gray-50 dark:bg-[#0a0f1e] relative">
      {/* Ambient background orbs (dark mode only) */}
      <div className="hidden dark:block pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[200px] -left-[100px] w-[600px] h-[600px] rounded-full bg-blue-500/[0.06] blur-[120px]" />
        <div className="absolute -bottom-[150px] -right-[100px] w-[500px] h-[500px] rounded-full bg-violet-500/[0.05] blur-[120px]" />
      </div>

      <div className="relative z-[1] container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 overflow-hidden">
        <div className="relative">
          <PipelineView />
        </div>
      </div>
    </div>
  );
}
