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

export const PIPELINE_PAGE_SIZE = 25;

interface UsePipelineFiltersReturn {
  // Current state
  filters: PipelineFilters;
  sortBy: PipelineSortBy;
  sortDir: PipelineSortDir;
  viewMode: PipelineViewMode;
  page: number;

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
  setPage: (page: number) => void;

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
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

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

  // Helper: update a param and reset page to 1
  const updateParamAndResetPage = useCallback(
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
        next.delete('page');
        return next;
      });
    },
    [setSearchParams]
  );

  const setStageIds = useCallback(
    (ids: string[]) => updateParamAndResetPage('stage', ids),
    [updateParamAndResetPage]
  );

  const setHealthStatus = useCallback(
    (statuses: string[]) => updateParamAndResetPage('health', statuses),
    [updateParamAndResetPage]
  );

  const setRiskLevel = useCallback(
    (levels: string[]) => updateParamAndResetPage('risk', levels),
    [updateParamAndResetPage]
  );

  const setOwnerIds = useCallback(
    (ids: string[]) => updateParamAndResetPage('owner', ids),
    [updateParamAndResetPage]
  );

  const setSearch = useCallback(
    (search: string) => updateParamAndResetPage('search', search || null),
    [updateParamAndResetPage]
  );

  const setStatus = useCallback(
    (status: string) => updateParamAndResetPage('status', status || 'active'),
    [updateParamAndResetPage]
  );

  const setSortBy = useCallback(
    (sortBy: PipelineSortBy) => updateParamAndResetPage('sort', sortBy),
    [updateParamAndResetPage]
  );

  const setSortDir = useCallback(
    (sortDir: PipelineSortDir) => updateParamAndResetPage('dir', sortDir),
    [updateParamAndResetPage]
  );

  const setViewMode = useCallback(
    (mode: PipelineViewMode) => updateParam('view', mode),
    [updateParam]
  );

  const setPage = useCallback(
    (page: number) => updateParam('page', page <= 1 ? null : String(page)),
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
      next.delete('page');
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
    page,
    setStageIds,
    setHealthStatus,
    setRiskLevel,
    setOwnerIds,
    setSearch,
    setStatus,
    setSortBy,
    setSortDir,
    setViewMode,
    setPage,
    clearFilters,
    hasActiveFilters,
  };
}
