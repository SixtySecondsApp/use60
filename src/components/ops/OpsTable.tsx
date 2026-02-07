import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  ChevronRight,
} from 'lucide-react';
import { OpsTableCell } from './OpsTableCell';
import { evaluateFormattingRules, evaluateRowFormatting, formattingStyleToCSS } from '@/lib/utils/conditionalFormatting';
import type { FormattingRule } from '@/lib/utils/conditionalFormatting';
import { getLogoS3Url, getIntegrationDomain } from '@/lib/hooks/useIntegrationLogo';

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
  hubspot_property_name?: string | null;
  apollo_property_name?: string | null;
}

interface Row {
  id: string;
  cells: Record<string, { value: string | null; confidence: number | null; status: string; metadata?: Record<string, unknown> | null }>;
  source_data?: Record<string, unknown>;
  hubspot_removed_at?: string | null;
}

interface GroupConfig {
  column_key: string;
  collapsed_by_default?: boolean;
  sort_groups_by?: 'alpha' | 'count';
}

type AggregateType = 'count' | 'sum' | 'average' | 'min' | 'max' | 'filled_percent' | 'unique_count' | 'none';

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
  onEnrichRow?: (rowId: string, columnId: string) => void;
  groupConfig?: GroupConfig | null;
  summaryConfig?: Record<string, AggregateType> | null;
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
        ${col.hubspot_property_name ? 'bg-orange-500/30' : ''}
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
  onEnrichRow,
  groupConfig,
  summaryConfig,
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

  // ---- GROUPING ----
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Reset collapsed state when group config changes
  useEffect(() => {
    if (groupConfig?.collapsed_by_default) {
      // Collapse all groups initially
      const allGroupKeys = new Set(
        rows.map((r) => r.cells[groupConfig.column_key]?.value ?? '__empty__')
      );
      setCollapsedGroups(allGroupKeys);
    } else {
      setCollapsedGroups(new Set());
    }
  }, [groupConfig?.column_key, groupConfig?.collapsed_by_default]);

  type FlatItem = { type: 'group-header'; groupKey: string; count: number } | { type: 'row'; row: Row };

  const flatItems: FlatItem[] = useMemo(() => {
    if (!groupConfig) return rows.map((row) => ({ type: 'row' as const, row }));

    // Build groups
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const val = row.cells[groupConfig.column_key]?.value ?? '__empty__';
      if (!groups.has(val)) groups.set(val, []);
      groups.get(val)!.push(row);
    }

    // Sort groups
    let sortedKeys = [...groups.keys()];
    if (groupConfig.sort_groups_by === 'count') {
      sortedKeys.sort((a, b) => (groups.get(b)?.length ?? 0) - (groups.get(a)?.length ?? 0));
    } else {
      sortedKeys.sort((a, b) => {
        if (a === '__empty__') return 1;
        if (b === '__empty__') return -1;
        return a.localeCompare(b);
      });
    }

    const items: FlatItem[] = [];
    for (const key of sortedKeys) {
      const groupRows = groups.get(key) ?? [];
      items.push({ type: 'group-header', groupKey: key, count: groupRows.length });
      if (!collapsedGroups.has(key)) {
        for (const row of groupRows) {
          items.push({ type: 'row', row });
        }
      }
    }
    return items;
  }, [rows, groupConfig, collapsedGroups]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ---- SUMMARY ROW ----
  const summaryValues = useMemo(() => {
    if (!summaryConfig) return null;
    const result: Record<string, string> = {};
    for (const [colKey, aggType] of Object.entries(summaryConfig)) {
      if (aggType === 'none') continue;
      const values = rows.map((r) => r.cells[colKey]?.value).filter((v): v is string => v != null && v !== '');
      switch (aggType) {
        case 'count':
          result[colKey] = `${values.length}`;
          break;
        case 'sum': {
          const nums = values.map(Number).filter((n) => !isNaN(n));
          result[colKey] = nums.reduce((a, b) => a + b, 0).toLocaleString();
          break;
        }
        case 'average': {
          const nums = values.map(Number).filter((n) => !isNaN(n));
          result[colKey] = nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : '—';
          break;
        }
        case 'min': {
          const nums = values.map(Number).filter((n) => !isNaN(n));
          result[colKey] = nums.length > 0 ? Math.min(...nums).toLocaleString() : '—';
          break;
        }
        case 'max': {
          const nums = values.map(Number).filter((n) => !isNaN(n));
          result[colKey] = nums.length > 0 ? Math.max(...nums).toLocaleString() : '—';
          break;
        }
        case 'filled_percent':
          result[colKey] = rows.length > 0 ? `${Math.round((values.length / rows.length) * 100)}%` : '0%';
          break;
        case 'unique_count':
          result[colKey] = `${new Set(values).size}`;
          break;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }, [summaryConfig, rows]);

  // Virtual row scroller — uses flatItems for grouped view
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
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
    // Integration column: show integration logo (HubSpot, Apollo, Instantly, etc.)
    const integrationId = col.hubspot_property_name ? 'hubspot' : col.apollo_property_name ? 'apollo' : col.integration_type;
    if (integrationId) {
      // Extract base integration name from types like "apollo_enrich" -> "apollo"
      const baseName = integrationId.split('_')[0];
      // Use getIntegrationDomain for proper domain mapping (apollo -> apollo.io, instantly -> instantly.ai)
      const domain = getIntegrationDomain(baseName);
      const logoUrl = getLogoS3Url(domain);

      return (
        <img
          src={logoUrl}
          alt={baseName}
          className="w-3.5 h-3.5 shrink-0 rounded-sm object-contain"
          onError={(e) => {
            // Fallback to Zap icon if logo fails to load
            e.currentTarget.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-400"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
            e.currentTarget.parentNode?.appendChild(fallback.firstChild!);
          }}
        />
      );
    }
    // Enrichment column: show sparkles
    if (col.is_enrichment) {
      return <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
    }
    // Default: show column type icon
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
        style={{ maxHeight: 'var(--ops-table-max-height, calc(100vh - 220px))' }}
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
              const item = flatItems[virtualRow.index];
              if (!item) return null;

              // ---- GROUP HEADER ----
              if (item.type === 'group-header') {
                const isCollapsed = collapsedGroups.has(item.groupKey);
                const displayLabel = item.groupKey === '__empty__' ? '(No value)' : item.groupKey;
                return (
                  <div
                    key={`gh-${item.groupKey}`}
                    className="absolute left-0 w-full flex items-center border-b border-gray-700 bg-gray-800/80 cursor-pointer hover:bg-gray-800"
                    style={{ height: ROW_HEIGHT, transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => toggleGroup(item.groupKey)}
                  >
                    <div className="flex items-center gap-2 px-4">
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                      />
                      <span className="text-sm font-medium text-gray-200">{displayLabel}</span>
                      <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );
              }

              // ---- DATA ROW ----
              const row = item.row;
              const isSelected = selectedRows.has(row.id);
              const { firstName, lastName } = getPersonNames(row);
              const rowFmtStyle = formattingRules.length > 0
                ? evaluateRowFormatting(formattingRules, row.cells)
                : null;

              return (
                <div
                  key={row.id}
                  className={`
                    absolute left-0 w-full flex
                    border-b border-gray-800/50
                    transition-colors duration-75
                    ${isSelected ? 'bg-blue-500/10' : rowFmtStyle ? '' : 'hover:bg-blue-500/5'}
                    ${row.hubspot_removed_at ? 'opacity-50 line-through' : ''}
                  `}
                  style={{
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                    ...(rowFmtStyle ? formattingStyleToCSS(rowFmtStyle) : {}),
                  }}
                >
                  {/* Checkbox cell (sticky left) */}
                  <div
                    className={`
                      sticky left-0 z-20 flex items-center justify-center border-r border-gray-800/50 shrink-0
                      ${isSelected ? 'bg-blue-500/10' : rowFmtStyle ? '' : 'bg-gray-950'}
                    `}
                    style={{
                      width: CHECKBOX_COL_WIDTH,
                      minWidth: CHECKBOX_COL_WIDTH,
                      ...(rowFmtStyle && !isSelected ? formattingStyleToCSS(rowFmtStyle) : {}),
                    }}
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
                          ${col.hubspot_property_name ? 'bg-orange-500/10' : ''}
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
                          onEdit={((col.is_enrichment && col.column_type !== 'apollo_property' && col.column_type !== 'apollo_org_property') || col.column_type === 'formula') ? undefined : handleCellEdit(row.id, col.key)}
                          dropdownOptions={col.dropdown_options}
                          formulaExpression={col.formula_expression}
                          columnLabel={col.label}
                          metadata={cellData.metadata}
                          onEnrichRow={(col.is_enrichment || col.column_type === 'apollo_property' || col.column_type === 'apollo_org_property') ? () => onEnrichRow?.(row.id, col.id) : undefined}
                          buttonConfig={(col.column_type === 'button' || col.column_type === 'action') ? col.action_config as any : undefined}
                          rowCellValues={(col.column_type === 'button' || col.column_type === 'action' || col.column_type === 'instantly') ? Object.fromEntries(
                            Object.entries(row.cells).map(([k, v]) => [k, v.value ?? ''])
                          ) : undefined}
                          integrationConfig={col.column_type === 'instantly' ? col.integration_config : undefined}
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

          {/* ---- SUMMARY ROW ---- */}
          {summaryValues && rows.length > 0 && (
            <div
              className="sticky bottom-0 z-10 flex border-t border-gray-700 bg-gray-800/90 backdrop-blur-sm"
              style={{ minWidth: totalWidth }}
            >
              {/* Checkbox placeholder */}
              <div
                className="flex items-center justify-center border-r border-gray-700 shrink-0 bg-gray-800/90"
                style={{ width: CHECKBOX_COL_WIDTH, minWidth: CHECKBOX_COL_WIDTH, height: ROW_HEIGHT }}
              />
              {visibleColumns.map((col) => {
                const val = summaryValues[col.key];
                const aggType = summaryConfig?.[col.key];
                const aggLabel = aggType && aggType !== 'none'
                  ? { count: '#', sum: '\u03A3', average: 'Avg', min: 'Min', max: 'Max', filled_percent: '%', unique_count: '\u2261' }[aggType] ?? ''
                  : '';
                const cellWidth = resizingColumnId === col.id ? (resizingWidth ?? col.width) : col.width;
                return (
                  <div
                    key={col.id}
                    className="flex items-center px-2 border-r border-gray-700 shrink-0 overflow-hidden"
                    style={{ width: cellWidth, minWidth: cellWidth, height: ROW_HEIGHT }}
                  >
                    {val ? (
                      <span className="text-xs font-medium text-gray-300 truncate">
                        <span className="text-gray-500 mr-1">{aggLabel}</span>
                        {val}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              <div
                className="shrink-0 border-r border-gray-700"
                style={{ width: ADD_COL_WIDTH, minWidth: ADD_COL_WIDTH, height: ROW_HEIGHT }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpsTable;
