import { useMemo, useState, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import {
  FileText,
  AlertTriangle,
  Lightbulb,
  Route,
  Calendar,
  DollarSign,
  FileCheck,
  Pencil,
  Check,
  GripVertical,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalSection {
  id: string;
  type:
    | 'cover'
    | 'executive_summary'
    | 'problem'
    | 'solution'
    | 'approach'
    | 'timeline'
    | 'pricing'
    | 'terms'
    | 'custom';
  title: string;
  content: string; // HTML content
  order: number;
}

export interface BrandConfig {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_family?: string;
  logo_url?: string;
  company_name?: string;
  _generation_progress?: unknown;
}

export interface ProposalPreviewProps {
  sections: ProposalSection[];
  brandConfig?: BrandConfig;
  title?: string;
  contactName?: string;
  companyName?: string;
  className?: string;
  editable?: boolean;
  onSectionsChange?: (sections: ProposalSection[]) => void;
  onSectionClick?: (sectionId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTION_ICONS: Record<string, LucideIcon> = {
  executive_summary: FileText,
  problem: AlertTriangle,
  solution: Lightbulb,
  approach: Route,
  timeline: Calendar,
  pricing: DollarSign,
  terms: FileCheck,
  custom: FileText,
};

const DEFAULT_PRIMARY = '#1e40af';
const DEFAULT_FONT = 'Inter, system-ui, sans-serif';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function lightenColor(hex: string, amount: number): string {
  const sanitized = hex.replace('#', '');
  const num = parseInt(sanitized, 16);
  const r = Math.min(255, Math.floor(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.floor((num & 0xff) + (255 - (num & 0xff)) * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CoverSection({
  section,
  brandConfig,
  title,
  contactName,
  companyName,
  editable,
  onContentChange,
  onClick,
}: {
  section: ProposalSection;
  brandConfig?: BrandConfig;
  title?: string;
  contactName?: string;
  companyName?: string;
  editable?: boolean;
  onContentChange?: (content: string) => void;
  onClick?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const primary = brandConfig?.primary_color || DEFAULT_PRIMARY;
  const fontFamily = brandConfig?.font_family || DEFAULT_FONT;
  const displayCompany = companyName || brandConfig?.company_name;

  const handleSave = useCallback(() => {
    if (contentRef.current && onContentChange) {
      onContentChange(contentRef.current.innerHTML);
    }
    setEditing(false);
  }, [onContentChange]);

  return (
    <section
      className={cn(
        'relative flex flex-col items-center justify-center text-center px-8 py-16 md:py-24',
        'border-b border-gray-200 dark:border-gray-700',
        !editing && onClick && 'cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors',
      )}
      style={{ fontFamily }}
      onClick={!editing ? onClick : undefined}
      role={!editing && onClick ? 'button' : undefined}
      tabIndex={!editing && onClick ? 0 : undefined}
    >
      {/* Accent stripe at top */}
      <div
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ backgroundColor: primary }}
      />

      {/* Edit button */}
      {editable && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="absolute top-4 right-4 p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors z-10"
          title="Edit section"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {editable && editing && (
        <button
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          className="absolute top-4 right-4 p-1.5 rounded-md bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/40 text-green-700 dark:text-green-400 transition-colors z-10"
          title="Save changes"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Logo */}
      {brandConfig?.logo_url && (
        <img
          src={brandConfig.logo_url}
          alt={displayCompany ? `${displayCompany} logo` : 'Company logo'}
          className="h-16 w-auto object-contain mb-8"
        />
      )}

      {displayCompany && (
        <p
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: primary }}
        >
          {displayCompany}
        </p>
      )}

      <h1
        className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-3 leading-tight max-w-2xl"
        style={{ fontFamily }}
      >
        {title || section.title || 'Proposal'}
      </h1>

      {contactName && (
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Prepared for <span className="font-medium text-gray-800 dark:text-gray-200">{contactName}</span>
        </p>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-500">{formatDate()}</p>

      {section.content && (
        <div
          ref={contentRef}
          className={cn(
            'mt-8 prose prose-sm dark:prose-invert max-w-2xl',
            editing && 'ring-2 ring-blue-500/50 rounded-md p-3 bg-white dark:bg-gray-900 min-h-[60px]',
          )}
          contentEditable={editing}
          suppressContentEditableWarning
          dangerouslySetInnerHTML={!editing ? { __html: DOMPurify.sanitize(section.content) } : undefined}
          onBlur={editing ? handleSave : undefined}
        />
      )}
    </section>
  );
}

function ContentSection({
  section,
  index,
  brandConfig,
  editable,
  onContentChange,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  onClick,
}: {
  section: ProposalSection;
  index: number;
  brandConfig?: BrandConfig;
  editable?: boolean;
  onContentChange?: (content: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  onClick?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const primary = brandConfig?.primary_color || DEFAULT_PRIMARY;
  const fontFamily = brandConfig?.font_family || DEFAULT_FONT;
  const Icon = SECTION_ICONS[section.type] || FileText;
  const isEven = index % 2 === 0;

  const handleSave = useCallback(() => {
    if (contentRef.current && onContentChange) {
      onContentChange(contentRef.current.innerHTML);
    }
    setEditing(false);
  }, [onContentChange]);

  return (
    <section
      className={cn(
        'relative px-6 md:px-10 py-8 md:py-10 group',
        'border-b border-gray-100 dark:border-gray-800 last:border-b-0',
        isEven
          ? 'bg-white dark:bg-gray-900/40'
          : 'bg-gray-50/60 dark:bg-gray-900/60',
        !editing && onClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
      )}
      onClick={!editing ? onClick : undefined}
      role={!editing && onClick ? 'button' : undefined}
      tabIndex={!editing && onClick ? 0 : undefined}
    >
      {/* Reorder + edit controls */}
      {editable && (
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          {!isFirst && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
              className="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="Move up"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
          {!isLast && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
              className="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="Move down"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!editing ? (
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="p-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="Edit section"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); handleSave(); }}
              className="p-1 rounded-md bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/40 text-green-700 dark:text-green-400"
              title="Save changes"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 ml-0.5" />
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-1 h-7 rounded-full flex-shrink-0"
          style={{ backgroundColor: primary }}
        />
        <Icon
          className="w-5 h-5 flex-shrink-0"
          style={{ color: primary }}
        />
        <h2
          className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-50"
          style={{ fontFamily }}
        >
          {section.title}
        </h2>
      </div>

      {/* Subtle underline below heading */}
      <div
        className="h-px mb-6 ml-9"
        style={{ background: `linear-gradient(to right, ${lightenColor(primary, 0.6)}, transparent)` }}
      />

      {/* HTML content — editable or read-only */}
      <div
        ref={contentRef}
        className={cn(
          'prose prose-gray dark:prose-invert max-w-none ml-9 prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-img:rounded-lg',
          editing && 'ring-2 ring-blue-500/50 rounded-md p-3 bg-white dark:bg-gray-900 min-h-[80px] outline-none',
        )}
        style={{ fontFamily }}
        contentEditable={editing}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={!editing ? { __html: DOMPurify.sanitize(section.content) } : undefined}
        onBlur={editing ? handleSave : undefined}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
      <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
        No proposal content yet
      </h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
        Once sections are generated, they will appear here as a formatted preview.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ProposalPreview({
  sections,
  brandConfig,
  title,
  contactName,
  companyName,
  className,
  editable = false,
  onSectionsChange,
  onSectionClick,
}: ProposalPreviewProps) {
  const sortedSections = useMemo(() => {
    if (!sections || sections.length === 0) return [];
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);

  const handleContentChange = useCallback((sectionId: string, newContent: string) => {
    if (!onSectionsChange) return;
    const updated = sections.map((s) =>
      s.id === sectionId ? { ...s, content: newContent } : s
    );
    onSectionsChange(updated);
  }, [sections, onSectionsChange]);

  const handleMoveSection = useCallback((sectionId: string, direction: 'up' | 'down') => {
    if (!onSectionsChange) return;
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap order values
    const updated = sorted.map((s, i) => {
      if (i === idx) return { ...s, order: sorted[targetIdx].order };
      if (i === targetIdx) return { ...s, order: sorted[idx].order };
      return s;
    });

    onSectionsChange(updated);
  }, [sections, onSectionsChange]);

  if (sortedSections.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 overflow-hidden',
          className,
        )}
      >
        <EmptyState />
      </div>
    );
  }

  // Content sections = everything except cover
  const contentSections = sortedSections.filter((s) => s.type !== 'cover');
  let contentIndex = 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 overflow-hidden',
        'shadow-sm print:shadow-none print:border-0 print:rounded-none',
        className,
      )}
    >
      {sortedSections.map((section) => {
        if (section.type === 'cover') {
          return (
            <CoverSection
              key={section.id}
              section={section}
              brandConfig={brandConfig}
              title={title}
              contactName={contactName}
              companyName={companyName}
              editable={editable}
              onContentChange={(content) => handleContentChange(section.id, content)}
              onClick={onSectionClick ? () => onSectionClick(section.id) : undefined}
            />
          );
        }

        const idx = contentIndex;
        contentIndex += 1;

        return (
          <ContentSection
            key={section.id}
            section={section}
            index={idx}
            brandConfig={brandConfig}
            editable={editable}
            onContentChange={(content) => handleContentChange(section.id, content)}
            onMoveUp={() => handleMoveSection(section.id, 'up')}
            onMoveDown={() => handleMoveSection(section.id, 'down')}
            isFirst={idx === 0}
            isLast={idx === contentSections.length - 1}
            onClick={onSectionClick ? () => onSectionClick(section.id) : undefined}
          />
        );
      })}

      {/* Print-friendly footer */}
      <div className="hidden print:block text-center text-xs text-gray-400 py-4 border-t border-gray-200">
        Generated on {formatDate()}
        {(companyName || brandConfig?.company_name) && (
          <span> by {companyName || brandConfig?.company_name}</span>
        )}
      </div>
    </div>
  );
}
