/**
 * PropertiesPanel — Right-column properties editor for direct section editing
 *
 * When a section is selected in the landing page builder, this panel shows
 * editable fields grouped into collapsible sections: Copy, Layout, Assets, Style.
 * All changes fire onSectionUpdate immediately (debounced 300ms).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Type, Layout, Image, Palette, ChevronDown, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LandingSection, LayoutVariant, AssetStatus } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  section: LandingSection | null;
  onSectionUpdate: (sectionId: string, patch: Partial<LandingSection>) => void;
  onRegenerateAsset: (sectionId: string, assetType: 'image' | 'svg') => void;
}

const LAYOUT_OPTIONS: { value: LayoutVariant; label: string }[] = [
  { value: 'centered', label: 'Centered' },
  { value: 'split-left', label: 'Split Left' },
  { value: 'split-right', label: 'Split Right' },
  { value: 'cards-grid', label: 'Cards Grid' },
];

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  id,
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-200 dark:border-white/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
        aria-controls={`panel-section-${id}`}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={`panel-section-${id}`} className="px-3 pb-3 pt-1 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium text-gray-500 dark:text-slate-400 mb-0.5">
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
      />
    </div>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y transition-colors"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded border border-gray-200 dark:border-white/10 flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 text-xs font-mono rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset status badge (compact inline)
// ---------------------------------------------------------------------------

function AssetStatusBadge({ status }: { status: AssetStatus }) {
  if (status === 'idle') return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-medium',
        status === 'generating' && 'text-blue-400',
        status === 'complete' && 'text-emerald-400',
        status === 'failed' && 'text-red-400',
      )}
    >
      {status === 'generating' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  section,
  onSectionUpdate,
  onRegenerateAsset,
}) => {
  // Local copy of section fields for immediate feedback
  const [localCopy, setLocalCopy] = useState(section?.copy ?? { headline: '', subhead: '', body: '', cta: '' });
  const [localStyle, setLocalStyle] = useState(section?.style ?? { bg_color: '', text_color: '', accent_color: '' });
  const [localLayout, setLocalLayout] = useState<LayoutVariant>(section?.layout_variant ?? 'centered');

  // Sync local state when section prop changes (different section selected)
  const prevSectionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (section && section.id !== prevSectionIdRef.current) {
      setLocalCopy(section.copy);
      setLocalStyle(section.style);
      setLocalLayout(section.layout_variant);
      prevSectionIdRef.current = section.id;
    }
  }, [section]);

  // Debounced updater for copy changes
  const debouncedUpdateCopy = useDebouncedCallback(
    (sectionId: string, copy: LandingSection['copy']) => {
      onSectionUpdate(sectionId, { copy });
    },
    300,
  );

  // Debounced updater for style changes
  const debouncedUpdateStyle = useDebouncedCallback(
    (sectionId: string, style: LandingSection['style']) => {
      onSectionUpdate(sectionId, { style });
    },
    300,
  );

  const handleCopyChange = useCallback(
    (field: keyof LandingSection['copy'], value: string) => {
      if (!section) return;
      const next = { ...localCopy, [field]: value };
      setLocalCopy(next);
      debouncedUpdateCopy(section.id, next);
    },
    [section, localCopy, debouncedUpdateCopy],
  );

  const handleStyleChange = useCallback(
    (field: keyof LandingSection['style'], value: string) => {
      if (!section) return;
      const next = { ...localStyle, [field]: value };
      setLocalStyle(next);
      debouncedUpdateStyle(section.id, next);
    },
    [section, localStyle, debouncedUpdateStyle],
  );

  const handleLayoutChange = useCallback(
    (variant: LayoutVariant) => {
      if (!section) return;
      setLocalLayout(variant);
      onSectionUpdate(section.id, { layout_variant: variant });
    },
    [section, onSectionUpdate],
  );

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  if (!section) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-slate-500 px-4 text-center">
        Select a section to edit
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Section header */}
      <div className="px-3 py-2.5 border-b border-gray-200 dark:border-white/5">
        <div className="text-xs font-semibold capitalize text-gray-700 dark:text-slate-200">
          {section.type.replace('-', ' ')}
        </div>
        <div className="text-[10px] text-gray-400 dark:text-slate-500 font-mono mt-0.5">
          {section.id}
        </div>
      </div>

      {/* ---- Copy ---- */}
      <CollapsibleSection id="copy" title="Copy" icon={Type}>
        <TextInput
          label="Headline"
          value={localCopy.headline}
          onChange={(v) => handleCopyChange('headline', v)}
        />
        <TextInput
          label="Subhead"
          value={localCopy.subhead}
          onChange={(v) => handleCopyChange('subhead', v)}
        />
        <TextAreaInput
          label="Body"
          value={localCopy.body}
          onChange={(v) => handleCopyChange('body', v)}
          rows={4}
        />
        <TextInput
          label="CTA"
          value={localCopy.cta}
          onChange={(v) => handleCopyChange('cta', v)}
        />
      </CollapsibleSection>

      {/* ---- Layout ---- */}
      <CollapsibleSection id="layout" title="Layout" icon={Layout}>
        <div className="grid grid-cols-2 gap-1.5">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleLayoutChange(opt.value)}
              className={cn(
                'px-2 py-1.5 text-[11px] rounded-md border transition-colors text-center',
                localLayout === opt.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-400 font-medium'
                  : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-white/20',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      {/* ---- Assets ---- */}
      <CollapsibleSection id="assets" title="Assets" icon={Image}>
        {/* Image controls */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>Image</FieldLabel>
            <AssetStatusBadge status={section.image_status} />
          </div>
          {section.image_url && (
            <div className="mb-1.5 rounded-md overflow-hidden border border-gray-200 dark:border-white/10">
              <img
                src={section.image_url}
                alt={`${section.type} section image`}
                className="w-full h-20 object-cover"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => onRegenerateAsset(section.id, 'image')}
            disabled={section.image_status === 'generating'}
            className={cn(
              'flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors',
              section.image_status === 'generating'
                ? 'border-blue-500/30 bg-blue-500/5 text-blue-400 cursor-wait'
                : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]',
            )}
          >
            {section.image_status === 'generating' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {section.image_url ? 'Regenerate' : 'Generate'} Image
          </button>
        </div>

        {/* SVG controls */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <FieldLabel>SVG Graphic</FieldLabel>
            <AssetStatusBadge status={section.svg_status} />
          </div>
          {section.svg_code && (
            <div
              className="mb-1.5 rounded-md overflow-hidden border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] p-2 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-16"
              dangerouslySetInnerHTML={{ __html: section.svg_code }}
            />
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onRegenerateAsset(section.id, 'svg')}
              disabled={section.svg_status === 'generating'}
              className={cn(
                'flex items-center gap-1.5 flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors',
                section.svg_status === 'generating'
                  ? 'border-blue-500/30 bg-blue-500/5 text-blue-400 cursor-wait'
                  : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]',
              )}
            >
              {section.svg_status === 'generating' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {section.svg_code ? 'Regenerate' : 'Generate'}
            </button>
            {section.svg_code && (
              <button
                type="button"
                onClick={() => onSectionUpdate(section.id, { svg_code: null, svg_status: 'idle' })}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/5 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ---- Style ---- */}
      <CollapsibleSection id="style" title="Style" icon={Palette}>
        <ColorField
          label="Background"
          value={localStyle.bg_color}
          onChange={(v) => handleStyleChange('bg_color', v)}
        />
        <ColorField
          label="Text"
          value={localStyle.text_color}
          onChange={(v) => handleStyleChange('text_color', v)}
        />
        <ColorField
          label="Accent"
          value={localStyle.accent_color}
          onChange={(v) => handleStyleChange('accent_color', v)}
        />
      </CollapsibleSection>
    </div>
  );
};

export default PropertiesPanel;
