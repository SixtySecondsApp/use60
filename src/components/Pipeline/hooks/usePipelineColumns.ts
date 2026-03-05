/**
 * usePipelineColumns Hook (PIPE-ADV-004)
 *
 * Manages visible/hidden column preferences for the pipeline table.
 * Persisted to localStorage per org.
 */

import { useState, useCallback, useMemo } from 'react';
import { useOrgStore } from '@/lib/stores/orgStore';

export interface PipelineColumn {
  id: string;
  label: string;
  sortable: boolean;
  sortKey?: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

export const ALL_PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: 'company',      label: 'Company',      sortable: true,  sortKey: 'company',     defaultVisible: true, alwaysVisible: true },
  { id: 'value',        label: 'Value',        sortable: true,  sortKey: 'value',       defaultVisible: true },
  { id: 'stage',        label: 'Stage',        sortable: false,                          defaultVisible: true },
  { id: 'health',       label: 'Health',       sortable: true,  sortKey: 'health_score', defaultVisible: true },
  { id: 'rel_health',   label: 'Rel. Health',  sortable: false,                          defaultVisible: true },
  { id: 'risk',         label: 'Risk',         sortable: false,                          defaultVisible: true },
  { id: 'probability',  label: 'Probability',  sortable: false,                          defaultVisible: true },
  { id: 'days',         label: 'Days',         sortable: true,  sortKey: 'days_in_stage', defaultVisible: true },
  { id: 'close_date',   label: 'Close Date',   sortable: true,  sortKey: 'close_date',  defaultVisible: true },
  { id: 'owner',        label: 'Owner',        sortable: false,                          defaultVisible: true },
];

function getStorageKey(orgId: string | null) {
  return `pipeline_columns_${orgId || 'default'}`;
}

function loadVisibleColumns(orgId: string | null): string[] | null {
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    // ignore
  }
  return null;
}

function saveVisibleColumns(orgId: string | null, columns: string[]) {
  try {
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(columns));
  } catch {
    // ignore
  }
}

export function usePipelineColumns() {
  const activeOrgId = useOrgStore((s) => s.activeOrgId);

  const defaultVisible = ALL_PIPELINE_COLUMNS
    .filter((c) => c.defaultVisible)
    .map((c) => c.id);

  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    return loadVisibleColumns(activeOrgId) ?? defaultVisible;
  });

  const visibleColumns = useMemo(
    () => ALL_PIPELINE_COLUMNS.filter((c) => visibleColumnIds.includes(c.id)),
    [visibleColumnIds]
  );

  const toggleColumn = useCallback(
    (columnId: string) => {
      setVisibleColumnIds((prev) => {
        const col = ALL_PIPELINE_COLUMNS.find((c) => c.id === columnId);
        if (col?.alwaysVisible) return prev;

        const next = prev.includes(columnId)
          ? prev.filter((id) => id !== columnId)
          : [...prev, columnId];

        saveVisibleColumns(activeOrgId, next);
        return next;
      });
    },
    [activeOrgId]
  );

  const resetColumns = useCallback(() => {
    saveVisibleColumns(activeOrgId, defaultVisible);
    setVisibleColumnIds(defaultVisible);
  }, [activeOrgId, defaultVisible]);

  return {
    visibleColumns,
    visibleColumnIds,
    allColumns: ALL_PIPELINE_COLUMNS,
    toggleColumn,
    resetColumns,
  };
}
