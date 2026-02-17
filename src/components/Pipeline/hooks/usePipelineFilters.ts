/**
 * usePipelineFilters Hook
 *
 * Manages filter/sort/search state for the pipeline view via URL search params.
 * Provides typed filter object compatible with the RPC's p_filters JSONB.
 * Persists to URL for shareable links.
 */

import { useSearchParams } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import type { PipelineFilters } from './usePipelineData';

export type PipelineViewMode = 'kanban' | 'table';
export type PipelineSortBy = 'value' | 'health_score' | 'days_in_stage' | 'close_date' | 'created_at' | 'name';
export type PipelineSortDir = 'asc' | 'desc';

interface UsePipelineFiltersReturn {
  // Current state
  filters: PipelineFilters;
  sortBy: PipelineSortBy;
  sortDir: PipelineSortDir;
  viewMode: PipelineViewMode;

  // Update functions
  setStageIds: (ids: string[]) => void;
  setHealthStatus: (statuses: string[]) => void;
  setRiskLevel: (levels: string[]) => void;
  setOwnerIds: (ids: string[]) => void;
  setSearch: (search: string) => void;
  setStatus: (status: string) => void;
  setSortBy: (sortBy: PipelineSortBy) => void;
  setSortDir: (sortDir: PipelineSortDir) => void;
  setViewMode: (mode: PipelineViewMode) => void;

  // Utility functions
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

export function usePipelineFilters(): UsePipelineFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse current state from URL
  const filters: PipelineFilters = useMemo(() => {
    const stage = searchParams.get('stage');
    const health = searchParams.get('health');
    const risk = searchParams.get('risk');
    const owner = searchParams.get('owner');
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    return {
      stage_ids: stage ? stage.split(',').filter(Boolean) : undefined,
      health_status: health ? health.split(',').filter(Boolean) : undefined,
      risk_level: risk ? risk.split(',').filter(Boolean) : undefined,
      owner_ids: owner ? owner.split(',').filter(Boolean) : undefined,
      search: search || undefined,
      status: status || 'active',
    };
  }, [searchParams]);

  const sortBy = (searchParams.get('sort') as PipelineSortBy) || 'value';
  const sortDir = (searchParams.get('dir') as PipelineSortDir) || 'desc';
  const viewMode = (searchParams.get('view') as PipelineViewMode) || 'kanban';

  // Update functions
  const updateParam = useCallback(
    (key: string, value: string | string[] | null | undefined) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);

        if (!value || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          next.set(key, value.join(','));
        } else {
          next.set(key, value);
        }

        return next;
      });
    },
    [setSearchParams]
  );

  const setStageIds = useCallback(
    (ids: string[]) => updateParam('stage', ids),
    [updateParam]
  );

  const setHealthStatus = useCallback(
    (statuses: string[]) => updateParam('health', statuses),
    [updateParam]
  );

  const setRiskLevel = useCallback(
    (levels: string[]) => updateParam('risk', levels),
    [updateParam]
  );

  const setOwnerIds = useCallback(
    (ids: string[]) => updateParam('owner', ids),
    [updateParam]
  );

  const setSearch = useCallback(
    (search: string) => updateParam('search', search || null),
    [updateParam]
  );

  const setStatus = useCallback(
    (status: string) => updateParam('status', status || 'active'),
    [updateParam]
  );

  const setSortBy = useCallback(
    (sortBy: PipelineSortBy) => updateParam('sort', sortBy),
    [updateParam]
  );

  const setSortDir = useCallback(
    (sortDir: PipelineSortDir) => updateParam('dir', sortDir),
    [updateParam]
  );

  const setViewMode = useCallback(
    (mode: PipelineViewMode) => updateParam('view', mode),
    [updateParam]
  );

  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('stage');
      next.delete('health');
      next.delete('risk');
      next.delete('owner');
      next.delete('search');
      // Keep status, sort, dir, view
      return next;
    });
  }, [setSearchParams]);

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.stage_ids?.length ||
      filters.health_status?.length ||
      filters.risk_level?.length ||
      filters.owner_ids?.length ||
      filters.search
    );
  }, [filters]);

  return {
    filters,
    sortBy,
    sortDir,
    viewMode,
    setStageIds,
    setHealthStatus,
    setRiskLevel,
    setOwnerIds,
    setSearch,
    setStatus,
    setSortBy,
    setSortDir,
    setViewMode,
    clearFilters,
    hasActiveFilters,
  };
}
