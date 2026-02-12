import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Sparkles, AtSign, Brain, Globe, ChevronDown, Shield, Building2 } from 'lucide-react';
import { OpenRouterModelPicker } from './OpenRouterModelPicker';
import { GENERIC_TEMPLATES, EXA_TEMPLATES } from './enrichmentTemplates';

interface ExistingColumn {
  key: string;
  label: string;
}

interface EditEnrichmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: string, model: string, provider: 'openrouter' | 'anthropic' | 'exa') => void;
  currentPrompt: string;
  currentModel: string;
  currentProvider: 'openrouter' | 'anthropic' | 'exa';
  columnLabel: string;
  existingColumns?: ExistingColumn[];
  contextProfileName?: string | null;
  contextProfileIsOrg?: boolean;
}

export function EditEnrichmentModal({
  isOpen,
  onClose,
  onSave,
  currentPrompt,
  currentModel,
  currentProvider,
  columnLabel,
  existingColumns = [],
  contextProfileName,
  contextProfileIsOrg,
}: EditEnrichmentModalProps) {
  const [prompt, setPrompt] = useState(currentPrompt);
  const [model, setModel] = useState(currentModel);
  const [provider, setProvider] = useState<'openrouter' | 'anthropic' | 'exa'>(currentProvider);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention dropdown state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredColumns = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return existingColumns.filter(
      (col) =>
        col.key.toLowerCase().includes(q) ||
        col.label.toLowerCase().includes(q),
    );
  }, [existingColumns, mentionQuery, mentionOpen]);

  const hasChanges = prompt !== currentPrompt || model !== currentModel || provider !== currentProvider;
  const canSave = prompt.trim().length > 0 && hasChanges;

  useEffect(() => {
    if (isOpen) {
      setPrompt(currentPrompt);
      setModel(currentModel);
      setProvider(currentProvider);
      setMentionOpen(false);
      setTemplatesOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, currentPrompt, currentModel, currentProvider]);

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

  const handleSave = () => {
    if (!canSave) return;
    onSave(prompt.trim(), model, provider);
    onClose();
  };

  // Insert a column mention at the current cursor position
  const insertMention = useCallback(
    (column: ExistingColumn) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const before = prompt.slice(0, mentionStartPos);
      const after = prompt.slice(textarea.selectionStart);
      const inserted = `@${column.key}`;
      const newValue = before + inserted + after;

      setPrompt(newValue);
      setMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(0);

      const cursorPos = before.length + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [prompt, mentionStartPos],
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      setPrompt(value);

      if (existingColumns.length === 0) return;

      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex === -1) {
        setMentionOpen(false);
        return;
      }

      if (lastAtIndex > 0 && !/[\s]/.test(textBeforeCursor[lastAtIndex - 1])) {
        setMentionOpen(false);
        return;
      }

      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      if (/\s/.test(textAfterAt)) {
        setMentionOpen(false);
        return;
      }

      setMentionStartPos(lastAtIndex);
      setMentionQuery(textAfterAt);
      setMentionIndex(0);
      setMentionOpen(true);
    },
    [existingColumns.length],
  );

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
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-gray-100">Edit Enrichment</h2>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {columnLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Enrichment Prompt */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Enrichment Prompt
            </label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={handlePromptKeyDown}
                placeholder={provider === 'exa' ? 'What recent funding has @company_name raised?' : 'Describe what to enrich… Type @ to reference a column'}
                rows={4}
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
                        e.preventDefault();
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

              {!mentionOpen && existingColumns.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  <AtSign className="mr-0.5 inline-block h-3 w-3" />
                  Type <span className="font-mono text-gray-400">@</span> to reference a column value per row
                </p>
              )}
            </div>
          </div>

          {/* Collapsible Suggested Prompts */}
          <div>
            <button
              type="button"
              onClick={() => setTemplatesOpen(!templatesOpen)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${templatesOpen ? '' : '-rotate-90'}`} />
              {templatesOpen ? 'Hide suggested prompts' : 'Show suggested prompts'}
            </button>
            {templatesOpen && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(provider === 'exa' ? EXA_TEMPLATES : GENERIC_TEMPLATES).map((template) => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.name}
                      type="button"
                      onClick={() => {
                        setPrompt(template.prompt);
                        setTemplatesOpen(false);
                      }}
                      className="flex items-start gap-2.5 rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-2.5 text-left transition-colors hover:border-violet-500/40 hover:bg-gray-800"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-200">
                          {template.name}
                        </p>
                        <p className="mt-0.5 text-xs leading-snug text-gray-500">
                          {template.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Enrichment Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'openrouter' as const, icon: Brain, title: 'OpenRouter', desc: 'AI model of your choice' },
                  { value: 'anthropic' as const, icon: Sparkles, title: 'Anthropic Claude', desc: 'Claude by Anthropic' },
                  { value: 'exa' as const, icon: Globe, title: 'Exa Web Search', desc: 'Live web search' },
                ]).map((p) => {
                  const Icon = p.icon;
                  const selected = provider === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setProvider(p.value)}
                      className={`rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500/30'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      }`}
                    >
                      <Icon className={`h-4 w-4 mb-1 ${selected ? 'text-violet-400' : 'text-gray-400'}`} />
                      <p className={`text-xs font-medium ${selected ? 'text-violet-200' : 'text-gray-200'}`}>{p.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Exa callout */}
            {provider === 'exa' && (
              <div className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
                <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                <p className="text-xs leading-relaxed text-gray-300">
                  Exa searches the live web and returns answers with source citations and intent signals.
                </p>
              </div>
            )}

            {provider === 'openrouter' && (
              <OpenRouterModelPicker
                value={model}
                onChange={setModel}
              />
            )}
          </div>

          {/* Context profile info */}
          {contextProfileName && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-700/40 bg-gray-800/30 px-3 py-2">
              {contextProfileIsOrg ? (
                <Shield className="h-3.5 w-3.5 shrink-0 text-violet-400" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
              )}
              <span className="text-xs text-gray-400">
                Context: <span className="font-medium text-gray-300">{contextProfileName}</span>
                {contextProfileIsOrg && (
                  <span className="ml-1 text-gray-500">(Your Business)</span>
                )}
              </span>
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
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditEnrichmentModal;
