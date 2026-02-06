import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Sparkles, AtSign } from 'lucide-react';
import { OpenRouterModelPicker } from './OpenRouterModelPicker';

interface ExistingColumn {
  key: string;
  label: string;
}

interface EditEnrichmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: string, model: string) => void;
  currentPrompt: string;
  currentModel: string;
  columnLabel: string;
  existingColumns?: ExistingColumn[];
}

export function EditEnrichmentModal({
  isOpen,
  onClose,
  onSave,
  currentPrompt,
  currentModel,
  columnLabel,
  existingColumns = [],
}: EditEnrichmentModalProps) {
  const [prompt, setPrompt] = useState(currentPrompt);
  const [model, setModel] = useState(currentModel);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention dropdown state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
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

  const hasChanges = prompt !== currentPrompt || model !== currentModel;
  const canSave = prompt.trim().length > 0 && hasChanges;

  useEffect(() => {
    if (isOpen) {
      setPrompt(currentPrompt);
      setModel(currentModel);
      setMentionOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, currentPrompt, currentModel]);

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
    onSave(prompt.trim(), model);
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
                placeholder="Describe what to enrich… Type @ to reference a column"
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

          {/* AI Model Selection */}
          <OpenRouterModelPicker
            value={model}
            onChange={setModel}
          />
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
