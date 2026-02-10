import { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpsTableRecord {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  description: string | null;
  source_type: 'manual' | 'apollo' | 'csv' | 'copilot' | 'hubspot' | 'ops_table';
  source_query: Record<string, unknown> | null;
  row_count: number;
  created_at: string;
  updated_at: string;
  columns?: OpsTableColumn[];
}

export interface DropdownOption {
  value: string;
  label: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Button column types (Coda-style configurable buttons)
// ---------------------------------------------------------------------------

export type ButtonActionType =
  | 'set_value'
  | 'open_url'
  | 'call_function'
  | 'push_to_crm'
  | 'push_to_instantly'
  | 're_enrich'
  | 'start_sequence';

export interface ButtonAction {
  type: ButtonActionType;
  config: Record<string, unknown>;
  // set_value:        { target_column_key: string; value: string }
  // open_url:         { url_column_key?: string; static_url?: string }
  // call_function:    { function_name: string; body_template?: Record<string, unknown> }
  // push_to_crm:      { field_mappings?: Array<{ ops_key: string; hubspot_property: string }> }
  // push_to_instantly: { campaign_id?: string; field_mapping?: Record<string, string> }
  // re_enrich:        {}
  // start_sequence:   { sequence_id: string; input_mapping?: Record<string, string> }
}

export interface ButtonConfig {
  label: string;              // Static text or formula with @column refs e.g. "Email @first_name"
  color: string;              // Hex color e.g. "#8b5cf6"
  icon?: string;              // Lucide icon name e.g. "send", "zap", "play"
  actions: ButtonAction[];    // Ordered list of actions (executed sequentially)
}

export interface OpsTableColumn {
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
    | 'date'
    | 'dropdown'
    | 'tags'
    | 'phone'
    | 'checkbox'
    | 'formula'
    | 'integration'
    | 'action'
    | 'button'
    | 'hubspot_property'
    | 'apollo_property'
    | 'apollo_org_property'
    | 'linkedin_property'
    | 'instantly'
    | 'signal';
  is_enrichment: boolean;
  enrichment_prompt: string | null;
  enrichment_model: string | null;
  dropdown_options: DropdownOption[] | null;
  formula_expression: string | null;
  integration_type: string | null;
  integration_config: Record<string, unknown> | null;
  action_type: string | null;
  action_config: ButtonConfig | Record<string, unknown> | null;
  hubspot_property_name: string | null;
  apollo_property_name: string | null;
  position: number;
  width: number;
  is_visible: boolean;
  created_at: string;
}

export interface OpsTableRow {
  id: string;
  table_id: string;
  row_index: number;
  source_id: string | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
  cells: Record<string, OpsTableCell>; // keyed by column key
}

export interface OpsTableCell {
  id: string;
  row_id: string;
  column_id: string;
  value: string | null;
  confidence: number | null;
  source: string | null;
  status: 'none' | 'pending' | 'complete' | 'failed';
  error_message: string | null;
  metadata?: Record<string, unknown> | null;
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

export type SortConfig = { key: string; dir: 'asc' | 'desc' };

export type AggregateType = 'count' | 'sum' | 'average' | 'min' | 'max' | 'filled_percent' | 'unique_count' | 'none';

export interface GroupConfig {
  column_key: string;
  collapsed_by_default?: boolean;
  sort_groups_by?: 'alpha' | 'count';
}

export interface SavedView {
  id: string;
  table_id: string;
  created_by: string;
  name: string;
  is_default: boolean;
  is_system: boolean;
  filter_config: FilterCondition[];
  sort_config: SortConfig | SortConfig[] | null;
  column_config: string[] | null; // array of column keys in display order
  formatting_rules: any[] | null; // conditional formatting rules
  group_config: GroupConfig | null;
  summary_config: Record<string, AggregateType> | null;
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
  metadata: Record<string, unknown> | null;
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
  'id, table_id, key, label, column_type, is_enrichment, enrichment_prompt, enrichment_model, dropdown_options, formula_expression, integration_type, integration_config, action_type, action_config, hubspot_property_name, apollo_property_name, position, width, is_visible, created_at';

const ROW_COLUMNS =
  'id, table_id, row_index, source_id, source_data, created_at';

const CELL_COLUMNS =
  'id, row_id, column_id, value, confidence, source, status, error_message, metadata';

const VIEW_COLUMNS =
  'id, table_id, created_by, name, is_default, is_system, filter_config, sort_config, column_config, formatting_rules, group_config, summary_config, position, created_at, updated_at';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OpsTableService {
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
    sourceType?: OpsTableRecord['source_type'];
    sourceQuery?: Record<string, unknown>;
  }): Promise<OpsTableRecord> {
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
    return data as OpsTableRecord;
  }

  async getTable(tableId: string): Promise<OpsTableRecord | null> {
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
      columns: (dynamic_table_columns as OpsTableColumn[]) ?? [],
    } as OpsTableRecord;
  }

  async listTables(organizationId: string): Promise<OpsTableRecord[]> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .select(TABLE_COLUMNS)
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as OpsTableRecord[];
  }

  async updateTable(
    tableId: string,
    updates: { name?: string; description?: string; source_query?: Record<string, unknown> }
  ): Promise<OpsTableRecord> {
    const { data, error } = await this.supabase
      .from('dynamic_tables')
      .update(updates)
      .eq('id', tableId)
      .select(TABLE_COLUMNS)
      .single();

    if (error) throw error;
    return data as OpsTableRecord;
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
    columnType: OpsTableColumn['column_type'];
    isEnrichment?: boolean;
    enrichmentPrompt?: string;
    enrichmentModel?: string;
    dropdownOptions?: DropdownOption[];
    formulaExpression?: string;
    integrationType?: string;
    integrationConfig?: Record<string, unknown>;
    actionType?: string;
    actionConfig?: Record<string, unknown>;
    hubspotPropertyName?: string;
    apolloPropertyName?: string;
    position?: number;
  }): Promise<OpsTableColumn> {
    const { data, error } = await this.supabase
      .from('dynamic_table_columns')
      .insert({
        table_id: params.tableId,
        key: params.key,
        label: params.label,
        column_type: params.columnType,
        is_enrichment: params.isEnrichment ?? false,
        enrichment_prompt: params.enrichmentPrompt ?? null,
        enrichment_model: params.enrichmentModel ?? null,
        dropdown_options: params.dropdownOptions ?? null,
        formula_expression: params.formulaExpression ?? null,
        integration_type: params.integrationType ?? null,
        integration_config: params.integrationConfig ?? null,
        action_type: params.actionType ?? null,
        action_config: params.actionConfig ?? null,
        hubspot_property_name: params.hubspotPropertyName ?? null,
        apollo_property_name: params.apolloPropertyName ?? null,
        position: params.position ?? 0,
      })
      .select(COLUMN_COLUMNS)
      .single();

    if (error) throw error;
    return data as OpsTableColumn;
  }

  async updateColumn(
    columnId: string,
    updates: {
      label?: string;
      width?: number;
      isVisible?: boolean;
      position?: number;
      dropdownOptions?: DropdownOption[];
      formulaExpression?: string;
      enrichmentPrompt?: string;
      enrichmentModel?: string;
      actionType?: string;
      actionConfig?: ButtonConfig | Record<string, unknown>;
      integrationConfig?: Record<string, unknown>;
    }
  ): Promise<OpsTableColumn> {
    const payload: Record<string, unknown> = {};
    if (updates.label !== undefined) payload.label = updates.label;
    if (updates.width !== undefined) payload.width = updates.width;
    if (updates.isVisible !== undefined) payload.is_visible = updates.isVisible;
    if (updates.position !== undefined) payload.position = updates.position;
    if (updates.dropdownOptions !== undefined) payload.dropdown_options = updates.dropdownOptions;
    if (updates.formulaExpression !== undefined) payload.formula_expression = updates.formulaExpression;
    if (updates.enrichmentPrompt !== undefined) payload.enrichment_prompt = updates.enrichmentPrompt;
    if (updates.enrichmentModel !== undefined) payload.enrichment_model = updates.enrichmentModel;
    if (updates.actionType !== undefined) payload.action_type = updates.actionType;
    if (updates.actionConfig !== undefined) payload.action_config = updates.actionConfig;
    if (updates.integrationConfig !== undefined) payload.integration_config = updates.integrationConfig;

    const { data, error } = await this.supabase
      .from('dynamic_table_columns')
      .update(payload)
      .eq('id', columnId)
      .select(COLUMN_COLUMNS)
      .single();

    if (error) throw error;
    return data as OpsTableColumn;
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
  ): Promise<OpsTableRow[]> {
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
    opts?: {
      page?: number;
      perPage?: number;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      filters?: FilterCondition[];
    }
  ): Promise<{ rows: OpsTableRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const perPage = opts?.perPage ?? 500;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    // Fetch columns so we can key cells and resolve filter column keys to IDs
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const columnsList = (columns ?? []) as { id: string; key: string; column_type: string }[];

    // Build a map of column key → column ID for server-side filtering
    const keyToColumnId = new Map<string, string>();
    const keyToColumnType = new Map<string, string>();
    for (const col of columnsList) {
      keyToColumnId.set(col.key, col.id);
      keyToColumnType.set(col.key, col.column_type);
    }

    // -----------------------------------------------------------------
    // Server-side filtering: get row IDs that match all filter conditions
    // -----------------------------------------------------------------
    const filters = opts?.filters ?? [];
    let filteredRowIds: string[] | null = null;

    if (filters.length > 0) {
      filteredRowIds = await this.getFilteredRowIds(tableId, filters, keyToColumnId, keyToColumnType);
    }

    // Build main query
    let query = this.supabase
      .from('dynamic_table_rows')
      .select(`${ROW_COLUMNS}, dynamic_table_cells(${CELL_COLUMNS})`, { count: 'exact' })
      .eq('table_id', tableId);

    // Apply filter (restrict to matching row IDs)
    if (filteredRowIds !== null) {
      if (filteredRowIds.length === 0) {
        // No rows match — return empty
        return { rows: [], total: 0 };
      }
      query = query.in('id', filteredRowIds);
    }

    // Sort
    const sortColumn = opts?.sortBy ?? 'row_index';
    const ascending = (opts?.sortDir ?? 'asc') === 'asc';

    if (sortColumn === 'row_index') {
      query = query.order('row_index', { ascending });
    } else {
      // For cell-based sorts, we sort client-side after fetch (Supabase
      // doesn't support ordering by nested relation columns). The server-side
      // filtering still narrows the result set significantly.
      query = query.order('row_index', { ascending: true });
    }

    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    let rows = this.mapRows(
      (data ?? []) as RawRow[],
      columnsList as { id: string; key: string }[]
    );

    // Client-side sort for cell-based columns (server already filtered)
    if (sortColumn && sortColumn !== 'row_index') {
      rows = [...rows].sort((a, b) => {
        const aVal = a.cells[sortColumn]?.value ?? '';
        const bVal = b.cells[sortColumn]?.value ?? '';
        const aEmpty = !aVal || aVal.trim() === '';
        const bEmpty = !bVal || bVal.trim() === '';
        // Push empty values to the end regardless of sort direction
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;
        if (aEmpty && bEmpty) return 0;
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return ascending ? cmp : -cmp;
      });
    }

    return { rows, total: count ?? 0 };
  }

  /**
   * Get row IDs that match ALL filter conditions (AND logic).
   * Each condition queries the cells table; results are intersected.
   */
  private async getFilteredRowIds(
    tableId: string,
    filters: FilterCondition[],
    keyToColumnId: Map<string, string>,
    keyToColumnType: Map<string, string>,
  ): Promise<string[]> {
    // Get all row IDs for this table first
    const { data: allRows, error: allRowsError } = await this.supabase
      .from('dynamic_table_rows')
      .select('id')
      .eq('table_id', tableId);

    if (allRowsError) throw allRowsError;
    let matchingRowIds = new Set((allRows ?? []).map((r) => (r as { id: string }).id));

    for (const filter of filters) {
      const columnId = keyToColumnId.get(filter.column_key);
      if (!columnId) continue;

      const conditionRowIds = await this.evaluateFilterCondition(
        tableId,
        columnId,
        filter,
        matchingRowIds,
      );

      // Intersect — all conditions must match (AND logic)
      matchingRowIds = new Set([...matchingRowIds].filter((id) => conditionRowIds.has(id)));

      // Short-circuit if no matches remain
      if (matchingRowIds.size === 0) break;
    }

    return [...matchingRowIds];
  }

  /**
   * Evaluate a single filter condition and return the set of matching row IDs.
   */
  private async evaluateFilterCondition(
    tableId: string,
    columnId: string,
    filter: FilterCondition,
    candidateRowIds: Set<string>,
  ): Promise<Set<string>> {
    const { operator, value } = filter;

    // Handle is_empty and is_not_empty specially — they check for absence of cells
    if (operator === 'is_empty') {
      // Rows that have no cell for this column, OR cell value is null/empty
      const { data: cellRows, error } = await this.supabase
        .from('dynamic_table_cells')
        .select('row_id, value')
        .eq('column_id', columnId)
        .in('row_id', [...candidateRowIds]);

      if (error) throw error;

      const nonEmptyRowIds = new Set(
        (cellRows ?? [])
          .filter((c) => (c as { row_id: string; value: string | null }).value != null && (c as { row_id: string; value: string | null }).value !== '')
          .map((c) => (c as { row_id: string }).row_id)
      );

      // Return rows that are NOT in the non-empty set
      return new Set([...candidateRowIds].filter((id) => !nonEmptyRowIds.has(id)));
    }

    if (operator === 'is_not_empty') {
      const { data: cellRows, error } = await this.supabase
        .from('dynamic_table_cells')
        .select('row_id, value')
        .eq('column_id', columnId)
        .in('row_id', [...candidateRowIds]);

      if (error) throw error;

      return new Set(
        (cellRows ?? [])
          .filter((c) => (c as { row_id: string; value: string | null }).value != null && (c as { row_id: string; value: string | null }).value !== '')
          .map((c) => (c as { row_id: string }).row_id)
      );
    }

    // For all other operators, query cells and filter
    let cellQuery = this.supabase
      .from('dynamic_table_cells')
      .select('row_id, value')
      .eq('column_id', columnId)
      .in('row_id', [...candidateRowIds]);

    // Use Supabase PostgREST operators where possible for performance
    switch (operator) {
      case 'equals':
        cellQuery = cellQuery.ilike('value', value);
        break;
      case 'not_equals':
        cellQuery = cellQuery.not('value', 'ilike', value);
        break;
      case 'contains':
        cellQuery = cellQuery.ilike('value', `%${value}%`);
        break;
      case 'not_contains':
        cellQuery = cellQuery.not('value', 'ilike', `%${value}%`);
        break;
      case 'starts_with':
        cellQuery = cellQuery.ilike('value', `${value}%`);
        break;
      case 'ends_with':
        cellQuery = cellQuery.ilike('value', `%${value}`);
        break;
      case 'greater_than':
        cellQuery = cellQuery.gt('value', value);
        break;
      case 'less_than':
        cellQuery = cellQuery.lt('value', value);
        break;
      default:
        break;
    }

    const { data: matchingCells, error } = await cellQuery;

    if (error) throw error;

    return new Set((matchingCells ?? []).map((c) => (c as { row_id: string }).row_id));
  }

  async updateCell(cellId: string, value: string): Promise<void> {
    const { error } = await this.supabase
      .from('dynamic_table_cells')
      .update({ value })
      .eq('id', cellId);

    if (error) throw error;
  }

  /**
   * Create a cell for an existing row + column, or update it if it already exists.
   * Used when the user types into an empty cell that has no cell record yet.
   */
  async upsertCell(rowId: string, columnId: string, value: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('dynamic_table_cells')
      .upsert(
        { row_id: rowId, column_id: columnId, value },
        { onConflict: 'row_id,column_id' }
      )
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
    sortConfig?: SortConfig | SortConfig[] | null;
    columnConfig?: string[] | null;
    formattingRules?: any[] | null;
    groupConfig?: GroupConfig | null;
    summaryConfig?: Record<string, AggregateType> | null;
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
        formatting_rules: params.formattingRules ?? null,
        group_config: params.groupConfig ?? null,
        summary_config: params.summaryConfig ?? null,
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
      sortConfig?: SortConfig | SortConfig[] | null;
      columnConfig?: string[] | null;
      position?: number;
      formattingRules?: any[] | null;
      groupConfig?: GroupConfig | null;
      summaryConfig?: Record<string, AggregateType> | null;
    }
  ): Promise<SavedView> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.isDefault !== undefined) payload.is_default = updates.isDefault;
    if (updates.filterConfig !== undefined) payload.filter_config = updates.filterConfig;
    if (updates.sortConfig !== undefined) payload.sort_config = updates.sortConfig;
    if (updates.columnConfig !== undefined) payload.column_config = updates.columnConfig;
    if (updates.position !== undefined) payload.position = updates.position;
    if (updates.formattingRules !== undefined) payload.formatting_rules = updates.formattingRules;
    if (updates.groupConfig !== undefined) payload.group_config = updates.groupConfig;
    if (updates.summaryConfig !== undefined) payload.summary_config = updates.summaryConfig;

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
    // Pre-check: block system view deletion client-side
    const { data: view, error: fetchError } = await this.supabase
      .from('dynamic_table_views')
      .select('is_system')
      .eq('id', viewId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!view) throw new Error('View not found');
    if (view.is_system) throw new Error('Cannot delete system views');

    const { error } = await this.supabase
      .from('dynamic_table_views')
      .delete()
      .eq('id', viewId);

    if (error) throw error;

    // Verify deletion — RLS may silently block if user doesn't own the view
    const { data: stillExists } = await this.supabase
      .from('dynamic_table_views')
      .select('id')
      .eq('id', viewId)
      .maybeSingle();

    if (stillExists) {
      throw new Error('Cannot delete this view — you may not have permission');
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Map raw Supabase row+cell join results into typed OpsTableRow objects
   * with cells keyed by column key.
   */
  private mapRows(
    rawRows: RawRow[],
    columns: { id: string; key: string }[]
  ): OpsTableRow[] {
    const columnIdToKey = new Map<string, string>();
    for (const col of columns) {
      columnIdToKey.set(col.id, col.key);
    }

    return rawRows.map((row) => {
      const cells: Record<string, OpsTableCell> = {};

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
          status: cell.status as OpsTableCell['status'],
          error_message: cell.error_message,
          metadata: cell.metadata,
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

  // -----------------------------------------------------------------------
  // Move Rows (reorder)
  // -----------------------------------------------------------------------

  async moveRows(
    tableId: string,
    conditions: FilterCondition[],
    position: 'top' | 'bottom'
  ): Promise<{ movedCount: number }> {
    // Get columns for filter evaluation
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const keyToColumnId = new Map<string, string>();
    const keyToColumnType = new Map<string, string>();
    for (const col of (columns ?? []) as { id: string; key: string; column_type: string }[]) {
      keyToColumnId.set(col.key, col.id);
      keyToColumnType.set(col.key, col.column_type);
    }

    // Get matching row IDs
    const matchingRowIds = await this.getFilteredRowIds(
      tableId, conditions, keyToColumnId, keyToColumnType
    );

    if (matchingRowIds.length === 0) return { movedCount: 0 };

    // Get current row_index bounds
    const { data: bounds } = await this.supabase
      .from('dynamic_table_rows')
      .select('row_index')
      .eq('table_id', tableId)
      .order('row_index', { ascending: position === 'top' })
      .limit(1)
      .single();

    const edgeIndex = bounds?.row_index ?? 0;
    const offset = position === 'bottom' ? 1 : -matchingRowIds.length;

    // Update each matching row's row_index
    for (let i = 0; i < matchingRowIds.length; i++) {
      const newIndex = edgeIndex + offset + i;
      await this.supabase
        .from('dynamic_table_rows')
        .update({ row_index: newIndex })
        .eq('id', matchingRowIds[i]);
    }

    return { movedCount: matchingRowIds.length };
  }

  // -----------------------------------------------------------------------
  // AI Query Operations
  // -----------------------------------------------------------------------

  /**
   * Preview an AI-parsed operation without executing it.
   * Returns matching rows for confirmation before destructive actions.
   */
  async previewAiQuery(
    tableId: string,
    operation: {
      action: 'filter' | 'delete' | 'update';
      conditions: FilterCondition[];
      targetColumn?: string;
      newValue?: string;
    }
  ): Promise<{ matchingRows: OpsTableRow[]; totalCount: number }> {
    // Get columns for mapping
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const keyToColumnId = new Map<string, string>();
    const keyToColumnType = new Map<string, string>();
    for (const col of (columns ?? []) as { id: string; key: string; column_type: string }[]) {
      keyToColumnId.set(col.key, col.id);
      keyToColumnType.set(col.key, col.column_type);
    }

    // Get matching row IDs
    const matchingRowIds = await this.getFilteredRowIds(
      tableId,
      operation.conditions,
      keyToColumnId,
      keyToColumnType
    );

    const totalCount = matchingRowIds.length;

    // Limit preview to first 100 rows for performance
    const previewRowIds = matchingRowIds.slice(0, 100);

    if (previewRowIds.length === 0) {
      return { matchingRows: [], totalCount: 0 };
    }

    // Fetch full row data for preview
    const { data: rowData, error: rowError } = await this.supabase
      .from('dynamic_table_rows')
      .select(`
        id,
        table_id,
        row_index,
        source_id,
        source_data,
        created_at,
        dynamic_table_cells (
          id,
          row_id,
          column_id,
          value,
          confidence,
          source,
          status,
          error_message
        )
      `)
      .in('id', previewRowIds)
      .order('row_index', { ascending: true });

    if (rowError) throw rowError;

    const matchingRows = this.mapRows(
      (rowData ?? []) as RawRow[],
      (columns ?? []) as { id: string; key: string }[]
    );

    return { matchingRows, totalCount };
  }

  /**
   * Execute an AI-parsed operation.
   * For delete: removes matching rows
   * For update: updates specified column for matching rows
   * For filter: returns the conditions to apply to the view (no mutation)
   */
  async executeAiQuery(
    tableId: string,
    operation: {
      action: 'filter' | 'delete' | 'update';
      conditions: FilterCondition[];
      targetColumn?: string;
      newValue?: string;
    }
  ): Promise<{ affectedCount: number; success: boolean; filterConditions?: FilterCondition[] }> {
    // For filter action, just return the conditions (no mutation needed)
    if (operation.action === 'filter') {
      return {
        affectedCount: 0,
        success: true,
        filterConditions: operation.conditions,
      };
    }

    // Get columns for mapping
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const keyToColumnId = new Map<string, string>();
    const keyToColumnType = new Map<string, string>();
    for (const col of (columns ?? []) as { id: string; key: string; column_type: string }[]) {
      keyToColumnId.set(col.key, col.id);
      keyToColumnType.set(col.key, col.column_type);
    }

    // Get matching row IDs
    const matchingRowIds = await this.getFilteredRowIds(
      tableId,
      operation.conditions,
      keyToColumnId,
      keyToColumnType
    );

    if (matchingRowIds.length === 0) {
      return { affectedCount: 0, success: true };
    }

    // Execute the action
    if (operation.action === 'delete') {
      await this.deleteRows(matchingRowIds);
      return { affectedCount: matchingRowIds.length, success: true };
    }

    if (operation.action === 'update' && operation.targetColumn && operation.newValue !== undefined) {
      const targetColumnId = keyToColumnId.get(operation.targetColumn);
      if (!targetColumnId) {
        throw new Error(`Column "${operation.targetColumn}" not found`);
      }

      // Batch update or upsert cells for all matching rows
      let updatedCount = 0;
      for (const rowId of matchingRowIds) {
        await this.upsertCell(rowId, targetColumnId, operation.newValue);
        updatedCount++;
      }

      return { affectedCount: updatedCount, success: true };
    }

    return { affectedCount: 0, success: false };
  }

  // -----------------------------------------------------------------------
  // Deduplication
  // -----------------------------------------------------------------------

  /**
   * Find duplicate groups by a column and return group info for preview.
   */
  async findDuplicateGroups(
    tableId: string,
    groupByColumnKey: string,
    keepStrategy: 'most_recent' | 'most_filled' | 'first' | 'last'
  ): Promise<{
    groups: { value: string; keepRowId: string; deleteRowIds: string[] }[];
    totalDuplicates: number;
  }> {
    // Get column ID
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const col = (columns ?? []).find((c: { key: string }) => c.key === groupByColumnKey);
    if (!col) throw new Error(`Column "${groupByColumnKey}" not found`);

    // Get all cells for this column
    const { data: allRows, error: rowError } = await this.supabase
      .from('dynamic_table_rows')
      .select('id, row_index, created_at')
      .eq('table_id', tableId)
      .order('row_index', { ascending: true });

    if (rowError) throw rowError;

    const { data: cells, error: cellError } = await this.supabase
      .from('dynamic_table_cells')
      .select('row_id, value')
      .eq('column_id', (col as { id: string }).id);

    if (cellError) throw cellError;

    // Build map: value → row IDs
    const valueToRows = new Map<string, { id: string; row_index: number; created_at: string }[]>();
    const rowMap = new Map<string, { id: string; row_index: number; created_at: string }>();
    for (const row of (allRows ?? []) as { id: string; row_index: number; created_at: string }[]) {
      rowMap.set(row.id, row);
    }

    for (const cell of (cells ?? []) as { row_id: string; value: string | null }[]) {
      const val = (cell.value ?? '').trim().toLowerCase();
      if (!val) continue;
      const row = rowMap.get(cell.row_id);
      if (!row) continue;

      if (!valueToRows.has(val)) {
        valueToRows.set(val, []);
      }
      valueToRows.get(val)!.push(row);
    }

    // Find groups with duplicates
    const groups: { value: string; keepRowId: string; deleteRowIds: string[] }[] = [];
    let totalDuplicates = 0;

    for (const [value, rows] of valueToRows) {
      if (rows.length <= 1) continue;

      // Sort by strategy to determine keeper
      let sorted: typeof rows;
      switch (keepStrategy) {
        case 'most_recent':
          sorted = [...rows].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          break;
        case 'first':
          sorted = [...rows].sort((a, b) => a.row_index - b.row_index);
          break;
        case 'last':
          sorted = [...rows].sort((a, b) => b.row_index - a.row_index);
          break;
        case 'most_filled':
        default:
          // For most_filled, we'd need cell counts — fall back to most_recent
          sorted = [...rows].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          break;
      }

      const keepRowId = sorted[0].id;
      const deleteRowIds = sorted.slice(1).map((r) => r.id);
      totalDuplicates += deleteRowIds.length;

      groups.push({ value, keepRowId, deleteRowIds });
    }

    return { groups, totalDuplicates };
  }

  /**
   * Execute deduplication — delete the duplicate rows.
   */
  async executeDeduplicate(
    tableId: string,
    groupByColumnKey: string,
    keepStrategy: 'most_recent' | 'most_filled' | 'first' | 'last'
  ): Promise<{ deletedCount: number }> {
    const { groups } = await this.findDuplicateGroups(tableId, groupByColumnKey, keepStrategy);
    const allDeleteIds = groups.flatMap((g) => g.deleteRowIds);

    if (allDeleteIds.length > 0) {
      await this.deleteRows(allDeleteIds);
    }

    return { deletedCount: allDeleteIds.length };
  }

  // -----------------------------------------------------------------------
  // Conditional Update
  // -----------------------------------------------------------------------

  /**
   * Apply different values based on different conditions.
   */
  async executeConditionalUpdate(
    tableId: string,
    targetColumnKey: string,
    rules: { conditions: FilterCondition[]; newValue: string }[]
  ): Promise<{ updatedCount: number }> {
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const keyToColumnId = new Map<string, string>();
    const keyToColumnType = new Map<string, string>();
    for (const col of (columns ?? []) as { id: string; key: string; column_type: string }[]) {
      keyToColumnId.set(col.key, col.id);
      keyToColumnType.set(col.key, col.column_type);
    }

    const targetColumnId = keyToColumnId.get(targetColumnKey);
    if (!targetColumnId) throw new Error(`Column "${targetColumnKey}" not found`);

    let totalUpdated = 0;
    const processedRowIds = new Set<string>();

    // Process rules in order — first match wins
    for (const rule of rules) {
      if (rule.conditions.length === 0) continue;

      const matchingRowIds = await this.getFilteredRowIds(
        tableId,
        rule.conditions,
        keyToColumnId,
        keyToColumnType
      );

      // Only update rows not already processed by a previous rule
      const newMatchIds = matchingRowIds.filter((id) => !processedRowIds.has(id));

      // Batch upsert
      if (newMatchIds.length > 0) {
        const upserts = newMatchIds.map((rowId) => ({
          row_id: rowId,
          column_id: targetColumnId,
          value: rule.newValue,
        }));

        // Process in chunks of 500
        for (let i = 0; i < upserts.length; i += 500) {
          const chunk = upserts.slice(i, i + 500);
          const { error } = await this.supabase
            .from('dynamic_table_cells')
            .upsert(chunk, { onConflict: 'row_id,column_id' });

          if (error) throw error;
        }

        totalUpdated += newMatchIds.length;
        for (const id of newMatchIds) {
          processedRowIds.add(id);
        }
      }
    }

    return { updatedCount: totalUpdated };
  }

  // -----------------------------------------------------------------------
  // CSV Export
  // -----------------------------------------------------------------------

  /**
   * Generate CSV content from rows and trigger download (client-side).
   */
  static generateCSVExport(
    rows: OpsTableRow[],
    columns: OpsTableColumn[],
    filename: string = 'export'
  ): void {
    const visibleCols = columns.filter((c) => c.is_visible);

    // Header row
    const headers = visibleCols.map((c) => `"${c.label.replace(/"/g, '""')}"`);
    const csvLines = [headers.join(',')];

    // Data rows
    for (const row of rows) {
      const values = visibleCols.map((col) => {
        const val = row.cells[col.key]?.value ?? '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvLines.push(values.join(','));
    }

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // -----------------------------------------------------------------------
  // Column Stats & Unique Values
  // -----------------------------------------------------------------------

  /**
   * Get unique values for a column (for batch view creation).
   */
  async getColumnUniqueValues(
    tableId: string,
    columnKey: string
  ): Promise<string[]> {
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const col = (columns ?? []).find((c: { key: string }) => c.key === columnKey);
    if (!col) return [];

    const { data: cells, error: cellError } = await this.supabase
      .from('dynamic_table_cells')
      .select('value')
      .eq('column_id', (col as { id: string }).id)
      .not('value', 'is', null);

    if (cellError) throw cellError;

    const unique = new Set<string>();
    for (const cell of (cells ?? []) as { value: string | null }[]) {
      if (cell.value && cell.value.trim()) {
        unique.add(cell.value.trim());
      }
    }

    return [...unique].sort();
  }

  /**
   * Get summary stats for a column or the whole table.
   */
  async getColumnStats(
    tableId: string,
    groupByColumnKey?: string,
    metricsColumnKeys?: string[]
  ): Promise<{
    totalRows: number;
    groups?: { value: string; count: number; percentage: number }[];
    columnStats?: Record<string, { filled: number; empty: number; fillRate: number }>;
  }> {
    // Get total rows
    const { data: allRows, error: rowError } = await this.supabase
      .from('dynamic_table_rows')
      .select('id')
      .eq('table_id', tableId);

    if (rowError) throw rowError;

    const totalRows = (allRows ?? []).length;
    const rowIds = (allRows ?? []).map((r: { id: string }) => r.id);

    if (totalRows === 0) {
      return { totalRows: 0 };
    }

    // Get columns
    const { data: columns, error: colError } = await this.supabase
      .from('dynamic_table_columns')
      .select('id, key, column_type')
      .eq('table_id', tableId);

    if (colError) throw colError;

    const colList = (columns ?? []) as { id: string; key: string; column_type: string }[];

    // Group-by breakdown
    let groups: { value: string; count: number; percentage: number }[] | undefined;

    if (groupByColumnKey) {
      const groupCol = colList.find((c) => c.key === groupByColumnKey);
      if (groupCol) {
        const { data: groupCells, error: groupError } = await this.supabase
          .from('dynamic_table_cells')
          .select('row_id, value')
          .eq('column_id', groupCol.id)
          .in('row_id', rowIds);

        if (!groupError) {
          const counts = new Map<string, number>();
          const seenRowIds = new Set<string>();

          for (const cell of (groupCells ?? []) as { row_id: string; value: string | null }[]) {
            const val = (cell.value ?? '').trim() || '(empty)';
            seenRowIds.add(cell.row_id);
            counts.set(val, (counts.get(val) || 0) + 1);
          }

          // Count rows with no cell for this column as (empty)
          const missingCount = totalRows - seenRowIds.size;
          if (missingCount > 0) {
            counts.set('(empty)', (counts.get('(empty)') || 0) + missingCount);
          }

          groups = [...counts.entries()]
            .map(([value, count]) => ({
              value,
              count,
              percentage: Math.round((count / totalRows) * 1000) / 10,
            }))
            .sort((a, b) => b.count - a.count);
        }
      }
    }

    // Column fill-rate stats
    let columnStats: Record<string, { filled: number; empty: number; fillRate: number }> | undefined;

    const metricsCols = metricsColumnKeys
      ? colList.filter((c) => metricsColumnKeys.includes(c.key))
      : colList.slice(0, 10); // Default to first 10 columns

    if (metricsCols.length > 0) {
      columnStats = {};

      for (const col of metricsCols) {
        const { data: cells, error: cellErr } = await this.supabase
          .from('dynamic_table_cells')
          .select('row_id, value')
          .eq('column_id', col.id)
          .in('row_id', rowIds);

        if (cellErr) continue;

        let filled = 0;
        for (const cell of (cells ?? []) as { value: string | null }[]) {
          if (cell.value && cell.value.trim()) filled++;
        }

        const empty = totalRows - filled;
        columnStats[col.key] = {
          filled,
          empty,
          fillRate: Math.round((filled / totalRows) * 1000) / 10,
        };
      }
    }

    return { totalRows, groups, columnStats };
  }

  // ===========================================================================
  // OI-013: Insights & Workflows Methods
  // ===========================================================================

  async getActiveInsights(tableId: string) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-insights-engine',
      {
        body: { tableId, action: 'get_active' },
      }
    );

    if (error) throw error;
    return data.insights;
  }

  async dismissInsight(insightId: string) {
    const { error } = await this.supabase
      .from('ops_table_insights')
      .update({
        dismissed_at: new Date().toISOString(),
        dismissed_by: (await this.supabase.auth.getUser()).data.user?.id,
      })
      .eq('id', insightId);

    if (error) throw error;
  }

  async getWorkflows(tableId: string) {
    const { data, error } = await this.supabase
      .from('ops_table_workflows')
      .select('*')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async saveWorkflow(workflow: any) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-workflow-engine',
      {
        body: {
          tableId: workflow.tableId,
          action: 'save',
          workflow,
        },
      }
    );

    if (error) throw error;
    return data.workflow;
  }

  async executeWorkflow(workflowId: string, tableId: string) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-workflow-engine',
      {
        body: { tableId, action: 'execute', workflowId },
      }
    );

    if (error) throw error;
    return data;
  }

  async toggleWorkflow(workflowId: string, isActive: boolean) {
    const { error } = await this.supabase
      .from('ops_table_workflows')
      .update({ is_active: isActive })
      .eq('id', workflowId);

    if (error) throw error;
  }

  // ===========================================================================
  // OI-017: Recipe Methods
  // ===========================================================================

  async getRecipes(tableId: string) {
    const { data, error } = await this.supabase
      .from('ops_table_recipes')
      .select('*')
      .eq('table_id', tableId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async saveRecipe(recipe: any) {
    const { data, error } = await this.supabase
      .from('ops_table_recipes')
      .insert(recipe)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async executeRecipe(recipeId: string) {
    const { data: recipe, error: recipeError } = await this.supabase
      .from('ops_table_recipes')
      .select('*')
      .eq('id', recipeId)
      .single();

    if (recipeError) throw recipeError;

    // Execute via ai-query with saved parsed_config
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-ai-query',
      {
        body: {
          tableId: recipe.table_id,
          action: 'execute_recipe',
          recipeId,
        },
      }
    );

    if (error) throw error;

    // Update run count
    await this.supabase
      .from('ops_table_recipes')
      .update({
        run_count: (recipe.run_count || 0) + 1,
        last_run_at: new Date().toISOString(),
      })
      .eq('id', recipeId);

    return data;
  }

  async toggleRecipeShare(recipeId: string, isShared: boolean) {
    const { error } = await this.supabase
      .from('ops_table_recipes')
      .update({ is_shared: isShared })
      .eq('id', recipeId);

    if (error) throw error;
  }

  async deleteRecipe(recipeId: string) {
    const { error } = await this.supabase
      .from('ops_table_recipes')
      .delete()
      .eq('id', recipeId);

    if (error) throw error;
  }

  // ===========================================================================
  // OI-023: Cross-Query Methods
  // ===========================================================================

  async getAvailableDataSources(orgId: string) {
    const { data, error } = await this.supabase.rpc(
      'get_available_data_sources',
      { p_org_id: orgId }
    );

    if (error) throw error;
    return data;
  }

  async executeCrossQuery(tableId: string, query: string) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-cross-query',
      {
        body: { tableId, query },
      }
    );

    if (error) throw error;
    return data;
  }

  async keepEnrichedColumn(tableId: string, columnConfig: any) {
    // Persist a temporary enriched column to the schema
    const { data, error } = await this.supabase
      .from('dynamic_table_columns')
      .insert({
        table_id: tableId,
        key: columnConfig.key,
        name: columnConfig.name,
        column_type: columnConfig.column_type || 'text',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ===========================================================================
  // OI-030: Chat Session Methods
  // ===========================================================================

  async createChatSession(tableId: string) {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await this.supabase
      .from('ops_table_chat_sessions')
      .insert({
        table_id: tableId,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getChatSession(sessionId: string) {
    const { data, error } = await this.supabase
      .from('ops_table_chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) throw error;
    return data;
  }

  async appendMessage(sessionId: string, message: any) {
    const { data: session } = await this.getChatSession(sessionId);
    const messages = [...(session.messages || []), message];

    const { error } = await this.supabase
      .from('ops_table_chat_sessions')
      .update({ messages })
      .eq('id', sessionId);

    if (error) throw error;
  }

  async clearChatSession(sessionId: string) {
    const { error } = await this.supabase
      .from('ops_table_chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;
  }

  // ===========================================================================
  // OI-034: Prediction Methods
  // ===========================================================================

  async getActivePredictions(tableId: string) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-predictions',
      {
        body: { tableId, action: 'get_active' },
      }
    );

    if (error) throw error;
    return data.predictions;
  }

  async dismissPrediction(predictionId: string) {
    const { error } = await this.supabase
      .from('ops_table_predictions')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', predictionId);

    if (error) throw error;
  }

  async runPredictions(tableId: string) {
    const { data, error } = await this.supabase.functions.invoke(
      'ops-table-predictions',
      {
        body: { tableId, action: 'analyze' },
      }
    );

    if (error) throw error;
    return data;
  }
}
