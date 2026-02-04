import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Sparkles,
  ArrowUpDown,
  ChevronDown,
  Mail,
  Linkedin,
  Building2,
  User,
  Hash,
  Calendar,
  Link2,
  Loader2,
  Phone,
  CheckSquare,
  ListFilter,
  Tags,
  FunctionSquare,
} from 'lucide-react';
import { OpsTableCell } from './OpsTableCell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Column {
  id: string;
  key: string;
  label: string;
  column_type: string;
  is_enrichment: boolean;
  width: number;
  is_visible: boolean;
  dropdown_options?: { value: string; label: string; color?: string }[] | null;
  formula_expression?: string | null;
}

interface Row {
  id: string;
  cells: Record<string, { value: string | null; confidence: number | null; status: string }>;
  source_data?: Record<string, unknown>;
}

interface OpsTableProps {
  columns: Column[];
  rows: Row[];
  selectedRows: Set<string>;
  onSelectRow: (rowId: string) => void;
  onSelectAll: () => void;
  onCellEdit: (rowId: string, columnKey: string, value: string) => void;
  onAddColumn: () => void;
  onColumnHeaderClick?: (columnId: string) => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Column type to icon mapping
// ---------------------------------------------------------------------------

const columnTypeIcons: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {
  text: Hash,
  email: Mail,
  url: Link2,
  number: Hash,
  linkedin: Linkedin,
  company: Building2,
  person: User,
  date: Calendar,
  icp_score: ArrowUpDown,
  phone: Phone,
  checkbox: CheckSquare,
  dropdown: ListFilter,
  tags: Tags,
  formula: FunctionSquare,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKBOX_COL_WIDTH = 44;
const ADD_COL_WIDTH = 44;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 34;
const OVERSCAN = 10;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const OpsTable: React.FC<OpsTableProps> = ({
  columns,
  rows,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onCellEdit,
  onAddColumn,
  onColumnHeaderClick,
  isLoading = false,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);

  // Only render visible columns
  const visibleColumns = useMemo(() => columns.filter((c) => c.is_visible), [columns]);

  // Total width of all columns + checkbox + add-column button
  const totalWidth = useMemo(
    () =>
      CHECKBOX_COL_WIDTH +
      visibleColumns.reduce((sum, c) => sum + c.width, 0) +
      ADD_COL_WIDTH,
    [visibleColumns],
  );

  // Selection helpers
  const allSelected = rows.length > 0 && selectedRows.size === rows.length;
  const someSelected = selectedRows.size > 0 && !allSelected;

  // Virtual row scroller
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // Cell edit handler (curried)
  const handleCellEdit = useCallback(
    (rowId: string, columnKey: string) => (value: string) => {
      onCellEdit(rowId, columnKey, value);
    },
    [onCellEdit],
  );

  // Extract first/last name from source_data for person columns
  const getPersonNames = useCallback(
    (row: Row): { firstName?: string; lastName?: string } => {
      const sd = row.source_data;
      if (!sd) return {};
      return {
        firstName: (sd.first_name ?? sd.firstName) as string | undefined,
        lastName: (sd.last_name ?? sd.lastName) as string | undefined,
      };
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderColumnIcon = (col: Column) => {
    if (col.is_enrichment) {
      return <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
    }
    const Icon = columnTypeIcons[col.column_type] ?? Hash;
    return <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />;
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-950 rounded-xl border border-gray-800">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
          <span className="text-sm text-gray-400">Loading table...</span>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Scrollable container */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* ---- HEADER ---- */}
          <div
            className="sticky top-0 z-30 flex border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm"
            style={{ height: HEADER_HEIGHT }}
          >
            {/* Checkbox header (sticky left) */}
            <div
              className="sticky left-0 z-40 flex items-center justify-center border-r border-gray-800 bg-gray-900/95 backdrop-blur-sm shrink-0"
              style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={onSelectAll}
                className="w-4 h-4 rounded border-gray-600 text-blue-600 bg-gray-800 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
            </div>

            {/* Column headers */}
            {visibleColumns.map((col) => (
              <div
                key={col.id}
                className={`
                  relative flex items-center gap-1.5 px-2 border-r border-gray-800 shrink-0 select-none
                  ${col.is_enrichment ? 'bg-violet-500/5' : ''}
                  group cursor-pointer hover:bg-gray-800/40 transition-colors
                `}
                style={{ width: col.width, minWidth: col.width }}
                onMouseEnter={() => setHoveredColumnId(col.id)}
                onMouseLeave={() => setHoveredColumnId(null)}
                onClick={() => onColumnHeaderClick?.(col.id)}
              >
                {renderColumnIcon(col)}
                <span className="truncate text-xs font-medium text-gray-300">
                  {col.label}
                </span>
                <ChevronDown
                  className={`
                    w-3 h-3 text-gray-500 shrink-0 ml-auto transition-opacity
                    ${hoveredColumnId === col.id ? 'opacity-100' : 'opacity-0'}
                  `}
                />
                {/* Resize handle (visual only) */}
                <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/60 transition-colors" />
              </div>
            ))}

            {/* Add column button */}
            <div
              className="flex items-center justify-center border-r border-gray-800 bg-gray-900/95 backdrop-blur-sm shrink-0"
              style={{ width: ADD_COL_WIDTH, minWidth: ADD_COL_WIDTH }}
            >
              <button
                onClick={onAddColumn}
                className="w-full h-full flex items-center justify-center hover:bg-gray-800 transition-colors rounded-none"
                title="Add column"
              >
                <Plus className="w-4 h-4 text-gray-500 hover:text-gray-300 transition-colors" />
              </button>
            </div>
          </div>

          {/* ---- BODY (virtualised) ---- */}
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const isSelected = selectedRows.has(row.id);
              const { firstName, lastName } = getPersonNames(row);

              return (
                <div
                  key={row.id}
                  className={`
                    absolute left-0 w-full flex
                    border-b border-gray-800/50
                    transition-colors duration-75
                    ${isSelected ? 'bg-blue-500/10' : 'hover:bg-blue-500/5'}
                  `}
                  style={{
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Checkbox cell (sticky left) */}
                  <div
                    className={`
                      sticky left-0 z-20 flex items-center justify-center border-r border-gray-800/50 shrink-0
                      ${isSelected ? 'bg-blue-500/10' : 'bg-gray-950'}
                    `}
                    style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelectRow(row.id)}
                      className="w-4 h-4 rounded border-gray-600 text-blue-600 bg-gray-800 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                    />
                  </div>

                  {/* Data cells */}
                  {visibleColumns.map((col) => {
                    const cellData = row.cells[col.key] ?? {
                      value: null,
                      confidence: null,
                      status: 'none' as const,
                    };
                    return (
                      <div
                        key={col.id}
                        className={`
                          flex items-center px-2 border-r border-gray-800/50 shrink-0 overflow-hidden
                          ${col.is_enrichment ? 'bg-violet-500/[0.03]' : ''}
                        `}
                        style={{ width: col.width, minWidth: col.width }}
                      >
                        <OpsTableCell
                          cell={{
                            value: cellData.value,
                            confidence: cellData.confidence,
                            status: (cellData.status as 'none' | 'pending' | 'complete' | 'failed') ?? 'none',
                          }}
                          columnType={col.column_type}
                          isEnrichment={col.is_enrichment}
                          firstName={firstName}
                          lastName={lastName}
                          onEdit={(col.is_enrichment || col.column_type === 'formula') ? undefined : handleCellEdit(row.id, col.key)}
                          dropdownOptions={col.dropdown_options}
                          formulaExpression={col.formula_expression}
                        />
                      </div>
                    );
                  })}

                  {/* Spacer for add-column area */}
                  <div
                    className="shrink-0 border-r border-gray-800/50"
                    style={{ width: ADD_COL_WIDTH, minWidth: ADD_COL_WIDTH }}
                  />
                </div>
              );
            })}
          </div>

          {/* ---- EMPTY STATE ---- */}
          {rows.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Hash className="w-8 h-8 mb-3 text-gray-700" />
              <p className="text-sm font-medium text-gray-400">No rows yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Import data or add rows to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpsTable;
