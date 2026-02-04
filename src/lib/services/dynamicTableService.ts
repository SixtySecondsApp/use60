import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DynamicTable {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  source_type: 'manual' | 'apollo' | 'csv' | 'copilot';
  source_query: Record<string, unknown> | null;
  row_count: number;
  created_at: string;
  updated_at: string;
  columns?: DynamicTableColumn[];
}

export interface DynamicTableColumn {
  id: string;
  table_id: string;
  key: string;
  label: string;
  column_type:
    | 'text'
    | 'email'
    | 'url'
    | 'number'
    | 'boolean'
    | 'enrichment'
    | 'status'
    | 'person'
    | 'company'
    | 'linkedin'
    | 'date';
  is_enrichment: boolean;
  enrichment_prompt: string | null;
  position: number;
  width: number;
  is_visible: boolean;
  created_at: string;
}

export interface DynamicTableRow {
  id: string;
  table_id: string;
  row_index: number;
  source_id: string | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
  cells: Record<string, DynamicTableCell>; // keyed by column key
}

export interface DynamicTableCell {
  id: string;
  row_id: string;
  column_id: string;
  value: string | null;
  confidence: number | null;
  source: string | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
  error_message: string | null;
}

// Filter operators for views
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export interface FilterCondition {
  column_key: string;
  operator: FilterOperator;
  value: string;
}

export interface SavedView {
  id: string;
  table_id: string;
  created_by: string;
  name: string;
  is_default: boolean;
  is_system: boolean;
  filter_config: FilterCondition[];
  sort_config: { key: string; dir: 'asc' | 'desc' } | null;
  column_config: string[] | null; // array of column keys in display order
  position: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Internal raw types returned by Supabase queries
// ---------------------------------------------------------------------------

interface RawCell {
  id: string;
  row_id: string;
  column_id: string;
  value: string | null;
  confidence: number | null;
  source: string | null;
  status: string;
  error_message: string | null;
}

interface RawRow {
  id: string;
  table_id: string;
  row_index: number;
  source_id: string | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
  dynamic_table_cells: RawCell[];
}

// ---------------------------------------------------------------------------
// Column selections (explicit — never use select('*'))
// ---------------------------------------------------------------------------

const TABLE_COLUMNS =
  'id, organization_id, created_by, name, description, source_type, source_query, row_count, created_at, updated_at';

const COLUMN_COLUMNS =
  'id, table_id, key, label, column_type, is_enrichment, enrichment_prompt, position, width, is_visible, created_at';

const ROW_COLUMNS =
  'id, table_id, row_index, source_id, source_data, created_at';

const CELL_COLUMNS =
  'id, row_id, column_id, value, confidence, source, status, error_message';

const VIEW_COLUMNS =
  'id, table_id, created_by, name, is_default, is_system, filter_config, sort_config, column_config, position, created_at, updated_at';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DynamicTableService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // -----------------------------------------------------------------------
  // Table CRUD
  // -----------------------------------------------------------------------

  async createTable(params: {
    organizationId: string;
    createdBy: string;
    name: string;
    description?: string;
    sourceType?: DynamicTable['source_type'];
    sourceQuery?: Record<string, unknown>;
  }): Promise<DynamicTable> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .insert({
        organization_id: params.organizationId,
        created_by: params.createdBy,
        name: params.name,
        description: params.description ?? null,
        source_type: params.sourceType ?? 'manual',
        source_query: params.sourceQuery ?? null,
      })
      .select(TABLE_COLUMNS)
      .single();

    if (error) throw error;
    return data as DynamicTable;
  }

  async getTable(tableId: string): Promise<DynamicTable | null> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .select(`${TABLE_COLUMNS}, dynamic_table_columns(${COLUMN_COLUMNS})`)
      .eq('id', tableId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const { dynamic_table_columns, ...rest } = data as Record<string, unknown>;
    return {
      ...rest,
      columns: (dynamic_table_columns as DynamicTableColumn[]) ?? [],
    } as DynamicTable;
  }

  async listTables(organizationId: string): Promise<DynamicTable[]> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .select(TABLE_COLUMNS)
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as DynamicTable[];
  }

  async updateTable(
    tableId: string,
    updates: { name?: string; description?: string }
  ): Promise<DynamicTable> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .update(updates)
      .eq('id', tableId)
      .select(TABLE_COLUMNS)
      .single();

    if (error) throw error;
    return data as DynamicTable;
  }

  async deleteTable(tableId: string): Promise<void> {
    const { error } = await this.supabase
      .from('dynamic_tables')
      .delete()
      .eq('id', tableId);

    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // Column CRUD
  // -----------------------------------------------------------------------

  async addColumn(params: {
    tableId: string;
    key: string;
    label: string;
    columnType: DynamicTableColumn['column_type'];
    isEnrichment?: boolean;
    enrichmentPrompt?: string;
    position?: number;
  }): Promise<DynamicTableColumn> {
    const { data, error } = await this.supabase
      .from('dynamic_table_columns')
      .insert({
        table_id: params.tableId,
        key: params.key,
        label: params.label,
        column_type: params.columnType,
        is_enrichment: params.isEnrichment ?? false,
        enrichment_prompt: params.enrichmentPrompt ?? null,
        position: params.position ?? 0,
      })
      .select(COLUMN_COLUMNS)
      .single();

    if (error) throw error;
    return data as DynamicTableColumn;
  }

  async updateColumn(
    columnId: string,
    updates: { label?: string; width?: number; isVisible?: boolean; position?: number }
  ): Promise<DynamicTableColumn> {
    const payload: Record<string, unknown> = {};
    if (updates.label !== undefined) payload.label = updates.label;
    if (updates.width !== undefined) payload.width = updates.width;
    if (updates.isVisible !== undefined) payload.is_visible = updates.isVisible;
    if (updates.position !== undefined) payload.position = updates.position;

    const { data, error } = await this.supabase
      .from('dynamic_table_columns')
      .update(payload)
      .eq('id', columnId)
      .select(COLUMN_COLUMNS)
      .single();

    if (error) throw error;
    return data as DynamicTableColumn;
  }

  async removeColumn(columnId: string): Promise<void> {
    const { error } = await this.supabase
      .from('dynamic_table_columns')
      .delete()
      .eq('id', columnId);

    if (error) throw error;
  }

  async reorderColumns(tableId: string, columnIds: string[]): Promise<void> {
    const updates = columnIds.map((id, index) => ({
      id,
      table_id: tableId,
      position: index,
    }));

    const { error } = await this.supabase
      .from('dynamic_table_columns')
      .upsert(updates, { onConflict: 'id' });

    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // Row & Cell operations
  // -----------------------------------------------------------------------

  async addRows(
    tableId: string,
    rows: { sourceId?: string; sourceData?: Record<string, unknown>; cells: Record<string, string> }[]
  ): Promise<DynamicTableRow[]> {
    // 1. Fetch columns for this table so we can map keys → column IDs
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const keyToColumnId = new Map<string, string>();
    for (const col of columns ?? []) {
      keyToColumnId.set((col as { id: string; key: string }).key, (col as { id: string; key: string }).id);
    }

    // 2. Insert rows
    const rowInserts = rows.map((row) => ({
      table_id: tableId,
      source_id: row.sourceId ?? null,
      source_data: row.sourceData ?? null,
    }));

    const { data: insertedRows, error: rowError } = await this.supabase
      .from('dynamic_table_rows')
      .insert(rowInserts)
      .select(ROW_COLUMNS);

    if (rowError) throw rowError;
    if (!insertedRows || insertedRows.length === 0) {
      return [];
    }

    // 3. Bulk-insert cells for every row
    const cellInserts: {
      row_id: string;
      column_id: string;
      value: string;
    }[] = [];

    for (let i = 0; i < insertedRows.length; i++) {
      const row = insertedRows[i] as { id: string };
      const cellMap = rows[i].cells;

      for (const [key, value] of Object.entries(cellMap)) {
        const columnId = keyToColumnId.get(key);
        if (!columnId) continue; // skip unknown columns
        cellInserts.push({
          row_id: row.id,
          column_id: columnId,
          value,
        });
      }
    }

    if (cellInserts.length > 0) {
      const { error: cellError } = await this.supabase
        .from('dynamic_table_cells')
        .insert(cellInserts);

      if (cellError) throw cellError;
    }

    // 4. Re-fetch the rows with their cells to return a complete picture
    const rowIds = (insertedRows as { id: string }[]).map((r) => r.id);

    const { data: fullRows, error: fetchError } = await this.supabase
      .from('dynamic_table_rows')
      .select(`${ROW_COLUMNS}, dynamic_table_cells(${CELL_COLUMNS})`)
      .in('id', rowIds)
      .order('row_index', { ascending: true });

    if (fetchError) throw fetchError;

    return this.mapRows(fullRows as RawRow[], columns as { id: string; key: string }[]);
  }

  async getTableData(
    tableId: string,
    opts?: { page?: number; perPage?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }
  ): Promise<{ rows: DynamicTableRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const perPage = opts?.perPage ?? 50;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    // Fetch columns so we can key cells
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', tableId);

    if (colError) throw colError;

    // Build query
    let query = this.supabase
      .from('dynamic_table_rows')
      .select(`${ROW_COLUMNS}, dynamic_table_cells(${CELL_COLUMNS})`, { count: 'exact' })
      .eq('table_id', tableId)
      .range(from, to);

    const sortColumn = opts?.sortBy ?? 'row_index';
    const ascending = (opts?.sortDir ?? 'asc') === 'asc';
    query = query.order(sortColumn, { ascending });

    const { data, error, count } = await query;

    if (error) throw error;

    const rows = this.mapRows(
      (data ?? []) as RawRow[],
      (columns ?? []) as { id: string; key: string }[]
    );

    return { rows, total: count ?? 0 };
  }

  async updateCell(cellId: string, value: string): Promise<void> {
    const { error } = await this.supabase
      .from('dynamic_table_cells')
      .update({ value })
      .eq('id', cellId);

    if (error) throw error;
  }

  async deleteRows(rowIds: string[]): Promise<void> {
    if (rowIds.length === 0) return;

    const { error } = await this.supabase
      .from('dynamic_table_rows')
      .delete()
      .in('id', rowIds);

    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // View CRUD
  // -----------------------------------------------------------------------

  async getViews(tableId: string): Promise<SavedView[]> {
    const { data, error } = await this.supabase
      .from('dynamic_table_views')
      .select(VIEW_COLUMNS)
      .eq('table_id', tableId)
      .order('is_system', { ascending: false })
      .order('position', { ascending: true });

    if (error) throw error;
    return (data ?? []) as SavedView[];
  }

  async createView(params: {
    tableId: string;
    createdBy: string;
    name: string;
    isDefault?: boolean;
    isSystem?: boolean;
    filterConfig?: FilterCondition[];
    sortConfig?: { key: string; dir: 'asc' | 'desc' } | null;
    columnConfig?: string[] | null;
    position?: number;
  }): Promise<SavedView> {
    const { data, error } = await this.supabase
      .from('dynamic_table_views')
      .insert({
        table_id: params.tableId,
        created_by: params.createdBy,
        name: params.name,
        is_default: params.isDefault ?? false,
        is_system: params.isSystem ?? false,
        filter_config: params.filterConfig ?? [],
        sort_config: params.sortConfig ?? null,
        column_config: params.columnConfig ?? null,
        position: params.position ?? 0,
      })
      .select(VIEW_COLUMNS)
      .single();

    if (error) throw error;
    return data as SavedView;
  }

  async updateView(
    viewId: string,
    updates: {
      name?: string;
      isDefault?: boolean;
      filterConfig?: FilterCondition[];
      sortConfig?: { key: string; dir: 'asc' | 'desc' } | null;
      columnConfig?: string[] | null;
      position?: number;
    }
  ): Promise<SavedView> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.isDefault !== undefined) payload.is_default = updates.isDefault;
    if (updates.filterConfig !== undefined) payload.filter_config = updates.filterConfig;
    if (updates.sortConfig !== undefined) payload.sort_config = updates.sortConfig;
    if (updates.columnConfig !== undefined) payload.column_config = updates.columnConfig;
    if (updates.position !== undefined) payload.position = updates.position;

    const { data, error } = await this.supabase
      .from('dynamic_table_views')
      .update(payload)
      .eq('id', viewId)
      .select(VIEW_COLUMNS)
      .single();

    if (error) throw error;
    return data as SavedView;
  }

  async deleteView(viewId: string): Promise<void> {
    // First check if it's a system view
    const { data: view, error: fetchError } = await this.supabase
      .from('dynamic_table_views')
      .select('is_system')
      .eq('id', viewId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (view?.is_system) throw new Error('Cannot delete system views');

    const { error } = await this.supabase
      .from('dynamic_table_views')
      .delete()
      .eq('id', viewId);

    if (error) throw error;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Map raw Supabase row+cell join results into typed DynamicTableRow objects
   * with cells keyed by column key.
   */
  private mapRows(
    rawRows: RawRow[],
    columns: { id: string; key: string }[]
  ): DynamicTableRow[] {
    const columnIdToKey = new Map<string, string>();
    for (const col of columns) {
      columnIdToKey.set(col.id, col.key);
    }

    return rawRows.map((row) => {
      const cells: Record<string, DynamicTableCell> = {};

      for (const cell of row.dynamic_table_cells ?? []) {
        const key = columnIdToKey.get(cell.column_id);
        if (!key) continue;

        cells[key] = {
          id: cell.id,
          row_id: cell.row_id,
          column_id: cell.column_id,
          value: cell.value,
          confidence: cell.confidence,
          source: cell.source,
          status: cell.status as DynamicTableCell['status'],
          error_message: cell.error_message,
        };
      }

      return {
        id: row.id,
        table_id: row.table_id,
        row_index: row.row_index,
        source_id: row.source_id,
        source_data: row.source_data,
        created_at: row.created_at,
        cells,
      };
    });
  }
}
