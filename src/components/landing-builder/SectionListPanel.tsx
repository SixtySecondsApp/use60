/**
 * SectionListPanel — Sortable section list for the landing page builder editor mode.
 *
 * One of 3 panels in the editor layout: section list | preview | properties.
 * Shows all LandingSection items in a draggable, reorderable list using @dnd-kit.
 */

import React, { useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  LayoutGrid,
  Quote,
  MousePointerClick,
  HelpCircle,
  PanelBottom,
  DollarSign,
  GitCompare,
  BarChart3,
  ListOrdered,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LandingSection, SectionType, AssetStatus } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionListPanelProps {
  sections: LandingSection[];
  selectedSectionId?: string;
  onSelectSection: (sectionId: string) => void;
  onReorder: (sections: LandingSection[]) => void;
}

// ---------------------------------------------------------------------------
// Section type icon mapping
// ---------------------------------------------------------------------------

const SECTION_ICONS: Record<SectionType, React.FC<{ className?: string }>> = {
  hero: Sparkles,
  problem: AlertTriangle,
  solution: Lightbulb,
  features: LayoutGrid,
  'social-proof': Quote,
  cta: MousePointerClick,
  faq: HelpCircle,
  footer: PanelBottom,
  pricing: DollarSign,
  comparison: GitCompare,
  stats: BarChart3,
  'how-it-works': ListOrdered,
};

const SECTION_LABELS: Record<SectionType, string> = {
  hero: 'Hero',
  problem: 'Problem',
  solution: 'Solution',
  features: 'Features',
  'social-proof': 'Social Proof',
  cta: 'CTA',
  faq: 'FAQ',
  footer: 'Footer',
  pricing: 'Pricing',
  comparison: 'Comparison',
  stats: 'Stats',
  'how-it-works': 'How It Works',
};

// ---------------------------------------------------------------------------
// Asset status dot
// ---------------------------------------------------------------------------

function AssetDot({ status, label }: { status: AssetStatus; label: string }) {
  if (status === 'idle') return null;

  return (
    <span
      title={`${label}: ${status}`}
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full',
        status === 'generating' && 'bg-blue-500 animate-pulse',
        status === 'complete' && 'bg-emerald-500',
        status === 'failed' && 'bg-red-500',
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

interface SortableRowProps {
  section: LandingSection;
  isSelected: boolean;
  onSelect: () => void;
}

function SortableRow({ section, isSelected, onSelect }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = SECTION_ICONS[section.type] ?? Sparkles;
  const label = SECTION_LABELS[section.type] ?? section.type;
  const headline = section.copy.headline
    ? section.copy.headline.length > 32
      ? `${section.copy.headline.slice(0, 32)}...`
      : section.copy.headline
    : label;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
        'hover:bg-gray-100 dark:hover:bg-white/[0.04]',
        isSelected && 'bg-violet-500/10 ring-1 ring-violet-500',
        isDragging && 'opacity-50 z-50 shadow-lg bg-white dark:bg-gray-800',
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={cn(
          'flex-none p-0.5 rounded cursor-grab active:cursor-grabbing',
          'text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          isSelected && 'opacity-100',
        )}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Section type icon */}
      <Icon className="w-3.5 h-3.5 flex-none text-gray-500 dark:text-slate-400" />

      {/* Section name */}
      <span className="flex-1 truncate text-xs text-gray-700 dark:text-slate-300">
        {headline}
      </span>

      {/* Asset status dots */}
      <div className="flex items-center gap-1 flex-none">
        <AssetDot status={section.image_status} label="Image" />
        <AssetDot status={section.svg_status} label="SVG" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SectionListPanel: React.FC<SectionListPanelProps> = ({
  sections,
  selectedSectionId,
  onSelectSection,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sections, oldIndex, newIndex).map(
        (section, idx) => ({ ...section, order: idx }),
      );
      onReorder(reordered);
    },
    [sections, onReorder],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-white/5">
        <span className="text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">
          Sections
        </span>
        <span className="text-[10px] text-gray-400 dark:text-slate-500">
          {sections.length}
        </span>
      </div>

      {/* Sortable list */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {sections.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-8">
            No sections yet. Run the strategy phase to generate a layout.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sectionIds}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => (
                <SortableRow
                  key={section.id}
                  section={section}
                  isSelected={section.id === selectedSectionId}
                  onSelect={() => onSelectSection(section.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export default SectionListPanel;
