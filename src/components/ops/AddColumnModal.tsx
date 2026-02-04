import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Sparkles, Newspaper, Cpu, Swords, AlertTriangle, AtSign, Plus, Trash2 } from 'lucide-react';
import type { DropdownOption } from '@/lib/services/opsTableService';

interface ExistingColumn {
  key: string;
  label: string;
}

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (column: {
    key: string;
    label: string;
    columnType: string;
    isEnrichment: boolean;
    enrichmentPrompt?: string;
    autoRunRows?: number | 'all';
    dropdownOptions?: DropdownOption[];
    formulaExpression?: string;
  }) => void;
  existingColumns?: ExistingColumn[];
}

const COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'tags', label: 'Tags' },
  { value: 'formula', label: 'Formula' },
  { value: 'enrichment', label: 'Enrichment' },
];

const ENRICHMENT_TEMPLATES = [
  {
    name: 'Recent News',
    prompt: 'Find recent news about @company_name',
    icon: Newspaper,
  },
  {
    name: 'Tech Stack',
    prompt: "Identify @company_name's tech stack from their website",
    icon: Cpu,
  },
  {
    name: 'Competitors',
    prompt: 'List main competitors for @company_name',
    icon: Swords,
  },
  {
    name: 'Pain Points',
    prompt: 'Based on @title role at @company_name, identify likely pain points',
    icon: AlertTriangle,
  },
];

function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_');
}

export function AddColumnModal({ isOpen, onClose, onAdd, existingColumns = [] }: AddColumnModalProps) {
  const [label, setLabel] = useState('');
  const [columnType, setColumnType] = useState('text');
  const [enrichmentPrompt, setEnrichmentPrompt] = useState('');
  const [autoRunRows, setAutoRunRows] = useState<string>('all');
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([
    { value: 'option_1', label: 'Option 1', color: '#8b5cf6' },
  ]);
  const [formulaExpression, setFormulaExpression] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  // @mention dropdown state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEnrichment = columnType === 'enrichment';
  const isDropdownOrTags = columnType === 'dropdown' || columnType === 'tags';
  const isFormula = columnType === 'formula';
  const key = toSnakeCase(label);
  const canAdd =
    label.trim().length > 0
    && (!isEnrichment || enrichmentPrompt.trim().length > 0)
    && (!isDropdownOrTags || dropdownOptions.length > 0)
    && (!isFormula || formulaExpression.trim().length > 0);

  // Filter columns for the @mention dropdown (exclude enrichment columns being created)
  const filteredColumns = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return existingColumns.filter(
      (col) =>
        col.key.toLowerCase().includes(q) ||
        col.label.toLowerCase().includes(q),
    );
  }, [existingColumns, mentionQuery, mentionOpen]);

  const reset = useCallback(() => {
    setLabel('');
    setColumnType('text');
    setEnrichmentPrompt('');
    setAutoRunRows('all');
    setDropdownOptions([{ value: 'option_1', label: 'Option 1', color: '#8b5cf6' }]);
    setFormulaExpression('');
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
  }, []);

  useEffect(() => {
    if (isOpen) {
      reset();
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mentionOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, mentionOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleAdd = () => {
    if (!canAdd) return;
    const parsedAutoRun = autoRunRows === 'all' ? 'all' as const
      : autoRunRows === 'none' ? undefined
      : Number(autoRunRows);
    onAdd({
      key,
      label: label.trim(),
      columnType,
      isEnrichment,
      ...(isEnrichment ? {
        enrichmentPrompt: enrichmentPrompt.trim(),
        autoRunRows: parsedAutoRun,
      } : {}),
      ...(isDropdownOrTags ? { dropdownOptions } : {}),
      ...(isFormula ? { formulaExpression: formulaExpression.trim() } : {}),
    });
    onClose();
  };

  const handleTemplateClick = (template: (typeof ENRICHMENT_TEMPLATES)[number]) => {
    setLabel(template.name);
    setEnrichmentPrompt(template.prompt);
    setMentionOpen(false);
  };

  // Insert a column mention at the current cursor position
  const insertMention = useCallback(
    (column: ExistingColumn) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      // Replace from @+query to the column key
      const before = enrichmentPrompt.slice(0, mentionStartPos);
      const after = enrichmentPrompt.slice(textarea.selectionStart);
      const inserted = `@${column.key}`;
      const newValue = before + inserted + after;

      setEnrichmentPrompt(newValue);
      setMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(0);

      // Restore cursor position after the inserted mention
      const cursorPos = before.length + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [enrichmentPrompt, mentionStartPos],
  );

  // Handle textarea changes — detect @ mentions
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      setEnrichmentPrompt(value);

      // Check if we're in an @mention context
      if (existingColumns.length === 0) return;

      // Look backwards from cursor for an unmatched @
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex === -1) {
        setMentionOpen(false);
        return;
      }

      // Ensure @ is at start of word (preceded by space, newline, or start of string)
      if (lastAtIndex > 0 && !/[\s]/.test(textBeforeCursor[lastAtIndex - 1])) {
        setMentionOpen(false);
        return;
      }

      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // If there's a space after @ + text, the mention is complete — close dropdown
      if (/\s/.test(textAfterAt)) {
        setMentionOpen(false);
        return;
      }

      // Show the dropdown with the query text
      setMentionStartPos(lastAtIndex);
      setMentionQuery(textAfterAt);
      setMentionIndex(0);
      setMentionOpen(true);
    },
    [existingColumns.length],
  );

  // Handle keyboard navigation in the dropdown
  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionOpen || filteredColumns.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredColumns.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredColumns.length) % filteredColumns.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(filteredColumns[mentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
      }
    },
    [mentionOpen, filteredColumns, mentionIndex, insertMention],
  );

  // Scroll active dropdown item into view
  useEffect(() => {
    if (!mentionOpen || !dropdownRef.current) return;
    const activeItem = dropdownRef.current.querySelector('[data-active="true"]');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [mentionIndex, mentionOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700/60 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-100">Add Column</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Column Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Column Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Company Size"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            />
            {label.trim() && (
              <p className="mt-1 text-xs text-gray-500">
                Key: <span className="font-mono text-gray-400">{key}</span>
              </p>
            )}
          </div>

          {/* Column Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Column Type
            </label>
            <select
              value={columnType}
              onChange={(e) => setColumnType(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            >
              {COLUMN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown/Tags Options Editor */}
          {isDropdownOrTags && (
            <div className="space-y-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                {columnType === 'dropdown' ? 'Dropdown Options' : 'Tag Options'}
              </label>
              <div className="space-y-1.5">
                {dropdownOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={opt.color ?? '#8b5cf6'}
                      onChange={(e) => {
                        const updated = [...dropdownOptions];
                        updated[idx] = { ...updated[idx], color: e.target.value };
                        setDropdownOptions(updated);
                      }}
                      className="h-7 w-7 cursor-pointer rounded border border-gray-700 bg-gray-800 p-0.5"
                    />
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => {
                        const updated = [...dropdownOptions];
                        updated[idx] = {
                          ...updated[idx],
                          label: e.target.value,
                          value: toSnakeCase(e.target.value) || `option_${idx + 1}`,
                        };
                        setDropdownOptions(updated);
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                    />
                    {dropdownOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDropdownOptions(dropdownOptions.filter((_, i) => i !== idx))}
                        className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDropdownOptions([
                    ...dropdownOptions,
                    { value: `option_${dropdownOptions.length + 1}`, label: '', color: '#6366f1' },
                  ])
                }
                className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300"
              >
                <Plus className="h-3.5 w-3.5" />
                Add option
              </button>
            </div>
          )}

          {/* Formula Expression Editor */}
          {isFormula && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Formula Expression
                </label>
                <div className="relative">
                  <textarea
                    ref={formulaRef}
                    value={formulaExpression}
                    onChange={(e) => setFormulaExpression(e.target.value)}
                    placeholder="e.g. @price * @quantity or IF(@status = 'won', @revenue, 0)"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 font-mono text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  {existingColumns.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      <AtSign className="mr-0.5 inline-block h-3 w-3" />
                      Use <span className="font-mono text-gray-400">@column_key</span> to reference column values
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Quick Insert
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'SUM', expr: '@col1 + @col2' },
                    { label: 'IF', expr: 'IF(@col = "value", "yes", "no")' },
                    { label: 'CONCAT', expr: 'CONCAT(@first, " ", @last)' },
                    { label: 'MULTIPLY', expr: '@price * @quantity' },
                  ].map((tmpl) => (
                    <button
                      key={tmpl.label}
                      type="button"
                      onClick={() => setFormulaExpression(tmpl.expr)}
                      className="rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs font-medium text-gray-400 hover:border-violet-500/40 hover:text-violet-300"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Enrichment Section */}
          {isEnrichment && (
            <div className="space-y-4">
              {/* Enrichment Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  <Sparkles className="mr-1.5 inline-block h-4 w-4 text-violet-400" />
                  Enrichment Prompt
                </label>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={enrichmentPrompt}
                    onChange={handlePromptChange}
                    onKeyDown={handlePromptKeyDown}
                    placeholder="Describe what to enrich… Type @ to reference a column"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />

                  {/* @mention dropdown */}
                  {mentionOpen && filteredColumns.length > 0 && (
                    <div
                      ref={dropdownRef}
                      className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
                    >
                      {filteredColumns.map((col, idx) => (
                        <button
                          key={col.key}
                          data-active={idx === mentionIndex}
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent textarea blur
                            insertMention(col);
                          }}
                          onMouseEnter={() => setMentionIndex(idx)}
                          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                            idx === mentionIndex
                              ? 'bg-violet-600/20 text-violet-200'
                              : 'text-gray-300 hover:bg-gray-700/50'
                          }`}
                        >
                          <AtSign className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                          <span className="font-medium">{col.label}</span>
                          <span className="ml-auto font-mono text-xs text-gray-500">
                            {col.key}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Hint when dropdown is closed and columns exist */}
                  {!mentionOpen && existingColumns.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      <AtSign className="mr-0.5 inline-block h-3 w-3" />
                      Type <span className="font-mono text-gray-400">@</span> to reference a column value per row
                    </p>
                  )}
                </div>
              </div>

              {/* Auto-run preference */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Auto-run enrichment
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { value: 'none', label: "Don't run" },
                    { value: '10', label: '10 rows' },
                    { value: '50', label: '50 rows' },
                    { value: 'all', label: 'All rows' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAutoRunRows(opt.value)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        autoRunRows === opt.value
                          ? 'border-violet-500 bg-violet-500/15 text-violet-300'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  How many rows to enrich automatically when the column is added
                </p>
              </div>

              {/* Templates Grid */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Templates
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ENRICHMENT_TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    return (
                      <button
                        key={template.name}
                        onClick={() => handleTemplateClick(template)}
                        className="flex items-start gap-2.5 rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2.5 text-left transition-colors hover:border-violet-500/40 hover:bg-gray-800"
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-200">
                            {template.name}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-gray-500">
                            {template.prompt}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-700/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddColumnModal;
