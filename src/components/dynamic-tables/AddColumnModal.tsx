import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Sparkles, Newspaper, Cpu, Swords, AlertTriangle } from 'lucide-react';

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (column: {
    key: string;
    label: string;
    columnType: string;
    isEnrichment: boolean;
    enrichmentPrompt?: string;
  }) => void;
}

const COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'enrichment', label: 'Enrichment' },
];

const ENRICHMENT_TEMPLATES = [
  {
    name: 'Recent News',
    prompt: 'Find recent news about this company',
    icon: Newspaper,
  },
  {
    name: 'Tech Stack',
    prompt: "Identify the company's tech stack from their website",
    icon: Cpu,
  },
  {
    name: 'Competitors',
    prompt: 'List main competitors for this company',
    icon: Swords,
  },
  {
    name: 'Pain Points',
    prompt: 'Based on role and company, identify likely pain points',
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

export function AddColumnModal({ isOpen, onClose, onAdd }: AddColumnModalProps) {
  const [label, setLabel] = useState('');
  const [columnType, setColumnType] = useState('text');
  const [enrichmentPrompt, setEnrichmentPrompt] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isEnrichment = columnType === 'enrichment';
  const key = toSnakeCase(label);
  const canAdd = label.trim().length > 0 && (!isEnrichment || enrichmentPrompt.trim().length > 0);

  const reset = useCallback(() => {
    setLabel('');
    setColumnType('text');
    setEnrichmentPrompt('');
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
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      key,
      label: label.trim(),
      columnType,
      isEnrichment,
      ...(isEnrichment ? { enrichmentPrompt: enrichmentPrompt.trim() } : {}),
    });
    onClose();
  };

  const handleTemplateClick = (template: (typeof ENRICHMENT_TEMPLATES)[number]) => {
    setLabel(template.name);
    setEnrichmentPrompt(template.prompt);
  };

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

          {/* Enrichment Section */}
          {isEnrichment && (
            <div className="space-y-4">
              {/* Enrichment Prompt */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  <Sparkles className="mr-1.5 inline-block h-4 w-4 text-violet-400" />
                  Enrichment Prompt
                </label>
                <textarea
                  value={enrichmentPrompt}
                  onChange={(e) => setEnrichmentPrompt(e.target.value)}
                  placeholder="Describe what data to enrich for each row..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
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
