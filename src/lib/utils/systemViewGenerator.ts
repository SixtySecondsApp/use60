import type { OpsTableColumn, FilterCondition } from '@/lib/services/opsTableService';

export interface SystemViewConfig {
  name: string;
  filterConfig: FilterCondition[];
  sortConfig: { key: string; dir: 'asc' | 'desc' } | null;
  columnConfig: string[] | null; // null = all columns
  position: number;
}

/**
 * Generates system view configs based on column analysis.
 * Always includes an "All" view. May add smart views based on column types/names.
 */
export function generateSystemViews(columns: OpsTableColumn[]): SystemViewConfig[] {
  const views: SystemViewConfig[] = [];
  let position = 0;

  // 1. Always create "All" view — no filters, default sort, all columns
  views.push({
    name: 'All',
    filterConfig: [],
    sortConfig: null,
    columnConfig: null,
    position: position++,
  });

  // 2. If a date column exists, create "Recent" view (sorted by date descending)
  const dateColumn = columns.find((c) => c.column_type === 'date');
  if (dateColumn) {
    views.push({
      name: 'Recent',
      filterConfig: [],
      sortConfig: { key: dateColumn.key, dir: 'desc' },
      columnConfig: null,
      position: position++,
    });
  }

  // 3. If a score-like column exists, create "Top Scored" view
  const scoreColumn = columns.find((c) => {
    if (c.column_type !== 'number') return false;
    const lower = c.key.toLowerCase();
    return lower.includes('score') || lower.includes('rating') || lower.includes('rank') || lower === 'icp_score';
  });
  if (scoreColumn) {
    views.push({
      name: 'Top Scored',
      filterConfig: [],
      sortConfig: { key: scoreColumn.key, dir: 'desc' },
      columnConfig: null,
      position: position++,
    });
  }

  // 4. If an email column exists, create "Has Email" view
  const emailColumn = columns.find((c) => c.column_type === 'email');
  if (emailColumn) {
    views.push({
      name: 'Has Email',
      filterConfig: [{ column_key: emailColumn.key, operator: 'is_not_empty', value: '' }],
      sortConfig: null,
      columnConfig: null,
      position: position++,
    });
  }

  return views;
}
