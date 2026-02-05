import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  Zap,
  Play,
  GripVertical,
} from 'lucide-react';
import { OpsTableCell } from './OpsTableCell';
import { evaluateFormattingRules, formattingStyleToCSS } from '@/lib/utils/conditionalFormatting';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';

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
  integration_type?: string | null;
  integration_config?: Record<string, unknown> | null;
  action_type?: string | null;
  action_config?: Record<string, unknown> | null;
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
  formattingRules?: FormattingRule[];
  columnOrder?: string[] | null;
  onColumnReorder?: (columnKeys: string[]) => void;
  onColumnResize?: (columnId: string, width: number) => void;
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
  integration: Zap,
  action: Play,
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
// Sortable Column Header
// ---------------------------------------------------------------------------

function SortableColumnHeader({
  col,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  renderIcon,
  onResizeStart,
  resizingWidth,
}: {
  col: Column;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
  renderIcon: (col: Column) => React.ReactNode;
  onResizeStart?: (e: React.MouseEvent, columnId: string) => void;
  resizingWidth?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const currentWidth = resizingWidth ?? col.width;
  const style: React.CSSProperties = {
    width: currentWidth,
    minWidth: currentWidth,
    transform: CSS.Transform.toString(transform),
    transition: resizingWidth ? 'none' : transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex items-center gap-1 px-2 border-r border-gray-800 shrink-0 select-none
        ${col.is_enrichment ? 'bg-violet-500/5' : ''}
        group cursor-pointer hover:bg-gray-800/40 transition-colors
      `}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      data-column-id={col.id}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={`shrink-0 cursor-grab active:cursor-grabbing transition-opacity ${
          isHovered ? 'opacity-60' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3 text-gray-500" />
      </div>
      {renderIcon(col)}
      <span className="truncate text-xs font-medium text-gray-300">
        {col.label}
      </span>
      <ChevronDown
        className={`
          w-3 h-3 text-gray-500 shrink-0 ml-auto transition-opacity
          ${isHovered ? 'opacity-100' : 'opacity-0'}
        `}
      />
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/60 transition-colors z-10"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onResizeStart?.(e, col.id);
        }}
      />
    </div>
  );
}

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
  formattingRules = [],
  columnOrder,
  onColumnReorder,
  onColumnResize,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null);

  // Column resize state
  const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
  const [resizingWidth, setResizingWidth] = useState<number | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    const column = columns.find((c) => c.id === columnId);
    if (!column) return;

    resizeStartX.current = e.clientX;
    resizeStartWidth.current = column.width;
    setResizingColumnId(columnId);
    setResizingWidth(column.width);
  }, [columns]);

  // Global mouse move/up handlers for resizing
  React.useEffect(() => {
    if (!resizingColumnId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(60, resizeStartWidth.current + delta); // Min width 60px
      setResizingWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (resizingColumnId && resizingWidth) {
        onColumnResize?.(resizingColumnId, resizingWidth);
      }
      setResizingColumnId(null);
      setResizingWidth(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumnId, resizingWidth, onColumnResize]);

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Only render visible columns, optionally reordered by columnOrder
  const visibleColumns = useMemo(() => {
    const visible = columns.filter((c) => c.is_visible);
    if (!columnOrder || columnOrder.length === 0) return visible;
    const orderMap = new Map(columnOrder.map((key, idx) => [key, idx]));
    return [...visible].sort((a, b) => {
      const aIdx = orderMap.get(a.key) ?? a.position + 1000;
      const bIdx = orderMap.get(b.key) ?? b.position + 1000;
      return aIdx - bIdx;
    });
  }, [columns, columnOrder]);

  // Drag-end handler for column reordering
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onColumnReorder) return;

      const oldIndex = visibleColumns.findIndex((c) => c.id === active.id);
      const newIndex = visibleColumns.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = [...visibleColumns];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);
      onColumnReorder(newOrder.map((c) => c.key));
    },
    [visibleColumns, onColumnReorder],
  );

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

            {/* Column headers (draggable) */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                {visibleColumns.map((col) => (
                  <SortableColumnHeader
                    key={col.id}
                    col={col}
                    isHovered={hoveredColumnId === col.id}
                    onMouseEnter={() => setHoveredColumnId(col.id)}
                    onMouseLeave={() => setHoveredColumnId(null)}
                    onClick={() => onColumnHeaderClick?.(col.id)}
                    renderIcon={renderColumnIcon}
                    onResizeStart={handleResizeStart}
                    resizingWidth={resizingColumnId === col.id ? resizingWidth ?? undefined : undefined}
                  />
                ))}
              </SortableContext>
            </DndContext>

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
                    // Apply conditional formatting
                    const cellStyles = formattingRules.length > 0
                      ? evaluateFormattingRules(formattingRules, row.cells)
                      : {};
                    const fmtStyle = cellStyles[col.key]
                      ? formattingStyleToCSS(cellStyles[col.key])
                      : undefined;
                    const cellWidth = resizingColumnId === col.id ? (resizingWidth ?? col.width) : col.width;
                    return (
                      <div
                        key={col.id}
                        className={`
                          flex items-center px-2 border-r border-gray-800/50 shrink-0 overflow-hidden
                          ${col.is_enrichment ? 'bg-violet-500/[0.03]' : ''}
                        `}
                        style={{ width: cellWidth, minWidth: cellWidth, ...fmtStyle }}
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
