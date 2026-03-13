/**
 * PropertiesPanel — Right-column properties editor for direct section editing
 *
 * When a section is selected in the landing page builder, this panel shows
 * editable fields grouped into collapsible sections: Copy, Layout, Assets, Style.
 * All changes fire onSectionUpdate immediately (debounced 300ms).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Type, Layout, Image, Palette, ChevronDown, ChevronUp, Loader2, Trash2, RefreshCw, FileText, Plus, X, Upload, Crop, Link, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LandingSection, LayoutVariant, AssetStatus, AssetStrategy, SectionDividerType, FormConfig, FormField } from './types';
import { DEFAULT_CTA_FORM } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  section: LandingSection | null;
  onSectionUpdate: (sectionId: string, patch: Partial<LandingSection>) => void;
  onRegenerateAsset: (sectionId: string, assetType: 'image' | 'svg') => void;
  /** Upload a File for this section's image. Returns the public URL. */
  onUploadAsset?: (sectionId: string, file: File) => Promise<string>;
  /** Open the crop modal for the current section image */
  onCropAsset?: (sectionId: string) => void;
}

const LAYOUT_OPTIONS: { value: LayoutVariant; label: string }[] = [
  { value: 'centered', label: 'Centered' },
  { value: 'split-left', label: 'Split Left' },
  { value: 'split-right', label: 'Split Right' },
  { value: 'cards-grid', label: 'Cards Grid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'alternating', label: 'Alternating' },
  { value: 'logo-banner', label: 'Logo Banner' },
  { value: 'metrics-bar', label: 'Metrics Bar' },
  { value: 'case-study', label: 'Case Study' },
  { value: 'review-badges', label: 'Review Badges' },
];

const ASSET_STRATEGY_OPTIONS: { value: AssetStrategy; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'svg', label: 'SVG' },
  { value: 'icon', label: 'Icon' },
  { value: 'none', label: 'None' },
];

const DIVIDER_OPTIONS: { value: SectionDividerType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'wave', label: 'Wave' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'curve', label: 'Curve' },
  { value: 'mesh', label: 'Mesh' },
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
// Form field type options
// ---------------------------------------------------------------------------

const FIELD_TYPE_OPTIONS: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Textarea' },
];

// ---------------------------------------------------------------------------
// Form editor sub-component
// ---------------------------------------------------------------------------

function FormEditor({
  form,
  onFormChange,
}: {
  form: FormConfig | undefined;
  onFormChange: (form: FormConfig | undefined) => void;
}) {
  const enabled = !!form;

  const handleToggle = () => {
    if (enabled) {
      onFormChange(undefined);
    } else {
      onFormChange({ ...DEFAULT_CTA_FORM, fields: DEFAULT_CTA_FORM.fields.map((f) => ({ ...f })) });
    }
  };

  const updateField = (index: number, patch: Partial<FormField>) => {
    if (!form) return;
    const fields = form.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onFormChange({ ...form, fields });
  };

  const removeField = (index: number) => {
    if (!form) return;
    const fields = form.fields.filter((_, i) => i !== index);
    onFormChange({ ...form, fields });
  };

  const addField = () => {
    if (!form) return;
    const newField: FormField = {
      name: `field_${Date.now()}`,
      type: 'text',
      label: 'New Field',
      required: false,
      placeholder: '',
    };
    onFormChange({ ...form, fields: [...form.fields, newField] });
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (!form) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= form.fields.length) return;
    const fields = [...form.fields];
    const temp = fields[index];
    fields[index] = fields[newIndex];
    fields[newIndex] = temp;
    onFormChange({ ...form, fields });
  };

  return (
    <div className="space-y-3">
      {/* Enable / Disable toggle */}
      <div className="flex items-center justify-between">
        <FieldLabel>Enable Form</FieldLabel>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            enabled ? 'bg-violet-500' : 'bg-gray-300 dark:bg-white/10',
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-4.5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {form && (
        <>
          {/* Field list */}
          <div className="space-y-2.5">
            {form.fields.map((field, index) => (
              <div
                key={`${field.name}-${index}`}
                className="rounded-md border border-gray-200 dark:border-white/10 p-2 space-y-1.5"
              >
                {/* Field header: move buttons + remove */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500">
                    Field {index + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveField(index, 'up')}
                      className="p-0.5 rounded text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === form.fields.length - 1}
                      onClick={() => moveField(index, 'down')}
                      className="p-0.5 rounded text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(index)}
                      className="p-0.5 rounded text-red-400 hover:text-red-500 transition-colors ml-1"
                      title="Remove field"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Label */}
                <TextInput
                  label="Label"
                  value={field.label}
                  onChange={(v) => updateField(index, { label: v })}
                />

                {/* Placeholder */}
                <TextInput
                  label="Placeholder"
                  value={field.placeholder ?? ''}
                  onChange={(v) => updateField(index, { placeholder: v })}
                />

                {/* Type dropdown */}
                <div>
                  <FieldLabel>Type</FieldLabel>
                  <select
                    value={field.type}
                    onChange={(e) => updateField(index, { type: e.target.value as FormField['type'] })}
                    className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Required toggle */}
                <div className="flex items-center justify-between pt-0.5">
                  <FieldLabel>Required</FieldLabel>
                  <button
                    type="button"
                    onClick={() => updateField(index, { required: !field.required })}
                    className={cn(
                      'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                      field.required ? 'bg-violet-500' : 'bg-gray-300 dark:bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform',
                        field.required ? 'translate-x-3.5' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Field button */}
          <button
            type="button"
            onClick={addField}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-medium rounded-md border border-dashed border-gray-300 dark:border-white/10 text-gray-500 dark:text-slate-400 hover:border-violet-400 hover:text-violet-400 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Field
          </button>

          {/* Submit Label */}
          <TextInput
            label="Submit Button Label"
            value={form.submit_label}
            onChange={(v) => onFormChange({ ...form, submit_label: v })}
          />

          {/* Success Message */}
          <TextInput
            label="Success Message"
            value={form.success_message}
            onChange={(v) => onFormChange({ ...form, success_message: v })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  section,
  onSectionUpdate,
  onRegenerateAsset,
  onUploadAsset,
  onCropAsset,
}) => {
  // Local copy of section fields for immediate feedback
  const [localCopy, setLocalCopy] = useState(section?.copy ?? { headline: '', subhead: '', body: '', cta: '' });
  const [localStyle, setLocalStyle] = useState(section?.style ?? { bg_color: '', text_color: '', accent_color: '' });
  const [localLayout, setLocalLayout] = useState<LayoutVariant>(section?.layout_variant ?? 'centered');

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPasteUrl, setShowPasteUrl] = useState(false);
  const [pasteUrlValue, setPasteUrlValue] = useState('');
  const [pasteUrlLoading, setPasteUrlLoading] = useState(false);
  const [pasteUrlError, setPasteUrlError] = useState<string | null>(null);

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
  // File upload handler
  // -----------------------------------------------------------------------

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !section || !onUploadAsset) return;

      setIsUploading(true);
      try {
        await onUploadAsset(section.id, file);
      } finally {
        setIsUploading(false);
        // Reset the input so the same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [section, onUploadAsset],
  );

  // -----------------------------------------------------------------------
  // Paste URL validation + apply
  // -----------------------------------------------------------------------

  const handlePasteUrlApply = useCallback(async () => {
    if (!section || !pasteUrlValue.trim()) return;
    setPasteUrlLoading(true);
    setPasteUrlError(null);

    try {
      // Validate URL format
      const url = new URL(pasteUrlValue.trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('URL must start with http:// or https://');
      }

      // Test that the URL loads as an image
      await new Promise<void>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image from URL'));
        img.src = url.href;
      });

      // Apply the URL directly to the section
      onSectionUpdate(section.id, { image_url: url.href, image_status: 'complete' });
      setPasteUrlValue('');
      setShowPasteUrl(false);
    } catch (err) {
      setPasteUrlError(err instanceof Error ? err.message : 'Invalid URL');
    } finally {
      setPasteUrlLoading(false);
    }
  }, [section, pasteUrlValue, onSectionUpdate]);

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

      {/* ---- Asset Strategy + Divider ---- */}
      <CollapsibleSection id="advanced" title="Advanced" icon={Layout} defaultOpen={false}>
        {/* Asset strategy selector */}
        <div>
          <FieldLabel>Asset Strategy</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {ASSET_STRATEGY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (!section) return;
                  onSectionUpdate(section.id, { asset_strategy: opt.value });
                }}
                className={cn(
                  'px-2 py-1.5 text-[11px] rounded-md border transition-colors text-center',
                  section.asset_strategy === opt.value
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400 font-medium'
                    : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-white/20',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Icon name — only when strategy is icon */}
        {section.asset_strategy === 'icon' && (
          <TextInput
            label="Icon Name (Lucide)"
            value={section.icon_name ?? ''}
            onChange={(v) => {
              if (!section) return;
              onSectionUpdate(section.id, { icon_name: v });
            }}
          />
        )}

        {/* Divider selector */}
        <div>
          <FieldLabel>Section Divider</FieldLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {DIVIDER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (!section) return;
                  onSectionUpdate(section.id, { divider: opt.value });
                }}
                className={cn(
                  'px-2 py-1.5 text-[11px] rounded-md border transition-colors text-center',
                  (section.divider ?? 'none') === opt.value
                    ? 'border-violet-500 bg-violet-500/10 text-violet-400 font-medium'
                    : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-white/20',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
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

          {/* Thumbnail preview */}
          {section.image_url && (
            <div className="mb-1.5 rounded-md overflow-hidden border border-gray-200 dark:border-white/10 relative group">
              <img
                src={section.image_url}
                alt={`${section.type} section image`}
                className="w-full h-20 object-cover"
              />
              {/* Crop overlay button on hover */}
              {onCropAsset && (
                <button
                  type="button"
                  onClick={() => onCropAsset(section.id)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Crop image"
                >
                  <Crop className="w-4 h-4 text-white" />
                </button>
              )}
            </div>
          )}

          {/* Action buttons row: Regenerate + Upload + Crop */}
          <div className="flex gap-1.5">
            {/* Generate / Regenerate */}
            <button
              type="button"
              onClick={() => onRegenerateAsset(section.id, 'image')}
              disabled={section.image_status === 'generating'}
              className={cn(
                'flex items-center gap-1.5 flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors',
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
              {section.image_url ? 'Regen' : 'Generate'}
            </button>

            {/* Upload image */}
            {onUploadAsset && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md border transition-colors',
                  isUploading
                    ? 'border-blue-500/30 bg-blue-500/5 text-blue-400 cursor-wait'
                    : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]',
                )}
              >
                {isUploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                Upload
              </button>
            )}

            {/* Crop existing image */}
            {section.image_url && onCropAsset && (
              <button
                type="button"
                onClick={() => onCropAsset(section.id)}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-md border border-gray-200 dark:border-white/10 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
              >
                <Crop className="w-3 h-3" />
                Crop
              </button>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Paste URL toggle + input */}
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setShowPasteUrl((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500 hover:text-violet-500 transition-colors"
            >
              <Link className="w-2.5 h-2.5" />
              {showPasteUrl ? 'Hide' : 'Paste URL'}
            </button>

            {showPasteUrl && (
              <div className="mt-1 flex gap-1">
                <input
                  type="text"
                  value={pasteUrlValue}
                  onChange={(e) => { setPasteUrlValue(e.target.value); setPasteUrlError(null); }}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-2 py-1 text-[11px] rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePasteUrlApply(); }}
                />
                <button
                  type="button"
                  onClick={handlePasteUrlApply}
                  disabled={pasteUrlLoading || !pasteUrlValue.trim()}
                  className="flex items-center px-2 py-1 text-[11px] font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {pasteUrlLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
              </div>
            )}
            {pasteUrlError && (
              <p className="mt-0.5 text-[10px] text-red-400">{pasteUrlError}</p>
            )}
          </div>
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

      {/* ---- Form (CTA sections only) ---- */}
      {section.type === 'cta' && (
        <CollapsibleSection id="form" title="Form" icon={FileText}>
          <FormEditor
            form={section.form}
            onFormChange={(form) => onSectionUpdate(section.id, { form })}
          />
        </CollapsibleSection>
      )}
    </div>
  );
};

export default PropertiesPanel;
