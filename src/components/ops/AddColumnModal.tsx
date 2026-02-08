import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Newspaper, Cpu, Swords, AlertTriangle, AtSign, Plus, Trash2 } from 'lucide-react';
import type { DropdownOption, ButtonConfig } from '@/lib/services/opsTableService';
import { HubSpotPropertyPicker } from './HubSpotPropertyPicker';
import { ApolloPropertyPicker } from './ApolloPropertyPicker';
import { OpenRouterModelPicker } from './OpenRouterModelPicker';
import { ButtonColumnConfigPanel } from './ButtonColumnConfigPanel';
import { InstantlyColumnWizard } from './InstantlyColumnWizard';

interface ExistingColumn {
  key: string;
  label: string;
}

interface ColumnConfig {
  key: string;
  label: string;
  columnType: string;
  isEnrichment: boolean;
  enrichmentPrompt?: string;
  enrichmentModel?: string;
  autoRunRows?: number | 'all';
  dropdownOptions?: DropdownOption[];
  formulaExpression?: string;
  integrationType?: string;
  integrationConfig?: Record<string, unknown>;
  hubspotPropertyName?: string;
  apolloPropertyName?: string;
  apolloEnrichConfig?: {
    reveal_personal_emails?: boolean;
    reveal_phone_number?: boolean;
  };
  actionType?: string;
  actionConfig?: ButtonConfig | Record<string, unknown>;
}

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (column: ColumnConfig) => void;
  onAddMultiple?: (columns: ColumnConfig[]) => void;
  existingColumns?: ExistingColumn[];
  sampleRowValues?: Record<string, string>;
  sourceType?: 'manual' | 'csv' | 'hubspot' | null;
  tableId?: string;
  orgId?: string;
}

/** Lightweight client-side formula evaluator for preview */
function evaluateFormulaPreview(expression: string, sampleValues: Record<string, string>): string {
  if (!expression.trim()) return '';
  try {
    // Step 1: Substitute @column_key with values (wrap in quotes for later eval)
    let expr = expression.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      const val = sampleValues[key];
      return val !== undefined && val !== '' ? `"${val}"` : '""';
    });

    // Step 2: Handle CONCAT(...) — extract args, strip quotes, join (skip empty)
    expr = expr.replace(/CONCAT\s*\(([^)]*)\)/gi, (_, argsStr: string) => {
      const args = splitArgs(argsStr);
      const resolved = args.map(stripQuotes).filter((v) => v !== '' && v !== 'N/A');
      return `"${resolved.join('')}"`;
    });

    // Step 3: Handle IF(cond, then, else)
    expr = expr.replace(/IF\s*\(([^)]*)\)/gi, (_, argsStr: string) => {
      const args = splitArgs(argsStr);
      if (args.length < 3) return '""';
      const cond = stripQuotes(args[0]);
      // Simple equality check: val = "something" or val = something
      const eqMatch = cond.match(/^(.+?)\s*=\s*(.+)$/);
      if (eqMatch) {
        const left = stripQuotes(eqMatch[1].trim());
        const right = stripQuotes(eqMatch[2].trim());
        return left === right ? args[1].trim() : args[2].trim();
      }
      // Can't evaluate complex conditions — return then branch
      return args[1].trim();
    });

    // Step 4: Handle & concatenation
    if (expr.includes('&')) {
      const parts: string[] = [];
      let current = '';
      let inStr: string | null = null;
      for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (inStr) { current += ch; if (ch === inStr) inStr = null; continue; }
        if (ch === '"' || ch === "'") { inStr = ch; current += ch; continue; }
        if (ch === '&') { parts.push(current); current = ''; continue; }
        current += ch;
      }
      if (current) parts.push(current);
      const resolved = parts.map((p) => stripQuotes(p.trim())).filter((v) => v !== '' && v !== 'N/A');
      return resolved.join('');
    }

    // Step 5: Simple math (+, -, *, /)
    const mathMatch = expr.match(/^"?(-?\d+(?:\.\d+)?)"?\s*([+\-*/])\s*"?(-?\d+(?:\.\d+)?)"?$/);
    if (mathMatch) {
      const a = parseFloat(mathMatch[1]);
      const op = mathMatch[2];
      const b = parseFloat(mathMatch[3]);
      switch (op) {
        case '+': return String(a + b);
        case '-': return String(a - b);
        case '*': return String(a * b);
        case '/': return b !== 0 ? String(a / b) : 'ERR:DIV/0';
      }
    }

    // Fallback: just strip quotes from the result
    return stripQuotes(expr);
  } catch {
    return stripQuotes(expression);
  }
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (inStr) { current += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; current += ch; continue; }
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }
    if (ch === ',' && depth === 0) { args.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

const BASE_COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'tags', label: 'Tags' },
  { value: 'formula', label: 'Formula' },
  { value: 'button', label: 'Button' },
  { value: 'integration', label: 'Integration' },
  { value: 'signal', label: 'Signal (Smart Listening)' },
  { value: 'enrichment', label: 'Enrichment' },
];

const HUBSPOT_COLUMN_TYPE = { value: 'hubspot_property', label: 'HubSpot Property' };
const APOLLO_COLUMN_TYPE = { value: 'apollo_property', label: 'Apollo Property' };
const INSTANTLY_COLUMN_TYPE = { value: 'instantly', label: 'Instantly Campaign' };

const INTEGRATION_TYPES = [
  { value: 'reoon_email_verify', label: 'Reoon Email Verification' },
  { value: 'apify_actor', label: 'Apify Actor' },
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

export function AddColumnModal({ isOpen, onClose, onAdd, onAddMultiple, existingColumns = [], sampleRowValues = {}, sourceType, tableId, orgId }: AddColumnModalProps) {
  const isHubSpotTable = sourceType === 'hubspot';
  const COLUMN_TYPES = useMemo(() => {
    const types = [...BASE_COLUMN_TYPES];
    if (isHubSpotTable) types.push(HUBSPOT_COLUMN_TYPE);
    types.push(APOLLO_COLUMN_TYPE);
    types.push(INSTANTLY_COLUMN_TYPE);
    return types;
  }, [isHubSpotTable]);
  const [label, setLabel] = useState('');
  const [columnType, setColumnType] = useState('text');
  const [enrichmentPrompt, setEnrichmentPrompt] = useState('');
  const [autoRunRows, setAutoRunRows] = useState<string>('all');
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([
    { value: 'option_1', label: 'Option 1', color: '#8b5cf6' },
  ]);
  const [formulaExpression, setFormulaExpression] = useState('');
  const [integrationType, setIntegrationType] = useState('reoon_email_verify');
  const [integrationSourceColumn, setIntegrationSourceColumn] = useState('');
  const [apifyActorId, setApifyActorId] = useState('');
  const [hubspotPropertyName, setHubspotPropertyName] = useState('');
  const [hubspotPropertyColumnType, setHubspotPropertyColumnType] = useState('text');
  const [apolloPropertyName, setApolloPropertyName] = useState('');
  const [apolloPropertyColumnType, setApolloPropertyColumnType] = useState('text');
  const [apolloRevealEmails, setApolloRevealEmails] = useState(false);
  const [apolloRevealPhone, setApolloRevealPhone] = useState(false);
  const [apolloAutoRunRows, setApolloAutoRunRows] = useState<string>('none');
  const [enrichmentModel, setEnrichmentModel] = useState('google/gemini-3-flash-preview');
  const [buttonConfig, setButtonConfig] = useState<ButtonConfig>({
    label: '', color: '#8b5cf6', actions: [],
  });
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  // @mention dropdown state (enrichment prompt)
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // @mention dropdown state (formula editor)
  const [formulaMentionOpen, setFormulaMentionOpen] = useState(false);
  const [formulaMentionQuery, setFormulaMentionQuery] = useState('');
  const [formulaMentionIndex, setFormulaMentionIndex] = useState(0);
  const [formulaMentionStartPos, setFormulaMentionStartPos] = useState(0);
  const formulaDropdownRef = useRef<HTMLDivElement>(null);

  const isEnrichment = columnType === 'enrichment';
  const isDropdownOrTags = columnType === 'dropdown' || columnType === 'tags';
  const isFormula = columnType === 'formula';
  const isIntegration = columnType === 'integration';
  const isHubSpotProperty = columnType === 'hubspot_property';
  const isApolloProperty = columnType === 'apollo_property';
  const isButton = columnType === 'button';
  const isInstantly = columnType === 'instantly';
  const key = toSnakeCase(label);
  const canAdd =
    label.trim().length > 0
    && (!isEnrichment || enrichmentPrompt.trim().length > 0)
    && (!isDropdownOrTags || dropdownOptions.length > 0)
    && (!isFormula || formulaExpression.trim().length > 0)
    && (!isIntegration || (integrationType === 'apify_actor' ? apifyActorId.trim().length > 0 : integrationSourceColumn.length > 0))
    && (!isHubSpotProperty || hubspotPropertyName.length > 0)
    && (!isApolloProperty || apolloPropertyName.length > 0)
    && (!isButton || (buttonConfig.label.trim().length > 0 && buttonConfig.actions.length > 0))
    && !isInstantly; // Instantly uses its own wizard flow, not the standard Add button

  // Filter columns for the @mention dropdown (enrichment prompt)
  const filteredColumns = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return existingColumns.filter(
      (col) =>
        col.key.toLowerCase().includes(q) ||
        col.label.toLowerCase().includes(q),
    );
  }, [existingColumns, mentionQuery, mentionOpen]);

  // Filter columns for the @mention dropdown (formula editor)
  const filteredFormulaColumns = useMemo(() => {
    if (!formulaMentionOpen) return [];
    const q = formulaMentionQuery.toLowerCase();
    return existingColumns.filter(
      (col) =>
        col.key.toLowerCase().includes(q) ||
        col.label.toLowerCase().includes(q),
    );
  }, [existingColumns, formulaMentionQuery, formulaMentionOpen]);

  const reset = useCallback(() => {
    setLabel('');
    setColumnType('text');
    setEnrichmentPrompt('');
    setAutoRunRows('all');
    setDropdownOptions([{ value: 'option_1', label: 'Option 1', color: '#8b5cf6' }]);
    setFormulaExpression('');
    setIntegrationType('reoon_email_verify');
    setIntegrationSourceColumn('');
    setApifyActorId('');
    setHubspotPropertyName('');
    setHubspotPropertyColumnType('text');
    setApolloPropertyName('');
    setApolloPropertyColumnType('text');
    setApolloRevealEmails(false);
    setApolloRevealPhone(false);
    setApolloAutoRunRows('none');
    setEnrichmentModel('google/gemini-3-flash-preview');
    setButtonConfig({ label: '', color: '#8b5cf6', actions: [] });
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
    setFormulaMentionOpen(false);
    setFormulaMentionQuery('');
    setFormulaMentionIndex(0);
  }, [isHubSpotTable]);

  useEffect(() => {
    if (isOpen) {
      reset();
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [isOpen, reset]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mentionOpen && !formulaMentionOpen) onClose();
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
    const parsedApolloAutoRun = apolloAutoRunRows === 'all' ? 'all' as const
      : apolloAutoRunRows === 'none' ? undefined
      : Number(apolloAutoRunRows);
    onAdd({
      key: isApolloProperty ? apolloPropertyName : key,
      label: isApolloProperty ? label.trim() || apolloPropertyName : label.trim(),
      columnType: isHubSpotProperty ? hubspotPropertyColumnType
        : isApolloProperty ? apolloPropertyColumnType
        : columnType,
      isEnrichment,
      ...(isEnrichment ? {
        enrichmentPrompt: enrichmentPrompt.trim(),
        enrichmentModel,
        autoRunRows: parsedAutoRun,
      } : {}),
      ...(isDropdownOrTags ? { dropdownOptions } : {}),
      ...(isFormula ? { formulaExpression: formulaExpression.trim() } : {}),
      ...(isIntegration ? {
        integrationType,
        integrationConfig: integrationType === 'apify_actor'
          ? { actor_id: apifyActorId.trim(), input_template: {}, result_path: '' }
          : { source_column_key: integrationSourceColumn },
      } : {}),
      ...(isButton ? {
        actionType: 'button',
        actionConfig: buttonConfig,
      } : {}),
      ...(isHubSpotProperty ? { hubspotPropertyName } : {}),
      ...(isApolloProperty ? {
        apolloPropertyName,
        autoRunRows: parsedApolloAutoRun,
        apolloEnrichConfig: {
          reveal_personal_emails: apolloRevealEmails,
          reveal_phone_number: apolloRevealPhone,
        },
      } : {}),
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

  // Scroll active dropdown item into view (enrichment)
  useEffect(() => {
    if (!mentionOpen || !dropdownRef.current) return;
    const activeItem = dropdownRef.current.querySelector('[data-active="true"]');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [mentionIndex, mentionOpen]);

  // ---- Formula @mention handlers ----

  const insertFormulaMention = useCallback(
    (column: ExistingColumn) => {
      const textarea = formulaRef.current;
      if (!textarea) return;
      const before = formulaExpression.slice(0, formulaMentionStartPos);
      const after = formulaExpression.slice(textarea.selectionStart);
      const inserted = `@${column.key}`;
      const newValue = before + inserted + after;
      setFormulaExpression(newValue);
      setFormulaMentionOpen(false);
      setFormulaMentionQuery('');
      setFormulaMentionIndex(0);
      const cursorPos = before.length + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [formulaExpression, formulaMentionStartPos],
  );

  const handleFormulaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      setFormulaExpression(value);
      if (existingColumns.length === 0) return;
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      if (lastAtIndex === -1) { setFormulaMentionOpen(false); return; }
      if (lastAtIndex > 0 && !/[\s(,]/.test(textBeforeCursor[lastAtIndex - 1])) {
        setFormulaMentionOpen(false);
        return;
      }
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (/\s/.test(textAfterAt)) { setFormulaMentionOpen(false); return; }
      setFormulaMentionStartPos(lastAtIndex);
      setFormulaMentionQuery(textAfterAt);
      setFormulaMentionIndex(0);
      setFormulaMentionOpen(true);
    },
    [existingColumns.length],
  );

  const handleFormulaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!formulaMentionOpen || filteredFormulaColumns.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFormulaMentionIndex((prev) => (prev + 1) % filteredFormulaColumns.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFormulaMentionIndex((prev) => (prev - 1 + filteredFormulaColumns.length) % filteredFormulaColumns.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertFormulaMention(filteredFormulaColumns[formulaMentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setFormulaMentionOpen(false);
      }
    },
    [formulaMentionOpen, filteredFormulaColumns, formulaMentionIndex, insertFormulaMention],
  );

  // Scroll active formula dropdown item into view
  useEffect(() => {
    if (!formulaMentionOpen || !formulaDropdownRef.current) return;
    const activeItem = formulaDropdownRef.current.querySelector('[data-active="true"]');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [formulaMentionIndex, formulaMentionOpen]);

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
        <div className="max-h-[calc(100vh-200px)] space-y-5 overflow-y-auto px-6 py-5">
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
                    onChange={handleFormulaChange}
                    onKeyDown={handleFormulaKeyDown}
                    placeholder="e.g. @first_name & &quot; &quot; & @last_name or IF(@status = 'won', @revenue, 0)"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 font-mono text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />

                  {/* @mention dropdown for formula (portal to avoid overflow clipping) */}
                  {formulaMentionOpen && filteredFormulaColumns.length > 0 && formulaRef.current && createPortal(
                    <div
                      ref={formulaDropdownRef}
                      style={{
                        position: 'fixed',
                        top: formulaRef.current.getBoundingClientRect().bottom + 4,
                        left: formulaRef.current.getBoundingClientRect().left,
                        width: formulaRef.current.getBoundingClientRect().width,
                      }}
                      className="z-[100] max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
                    >
                      {filteredFormulaColumns.map((col, idx) => (
                        <button
                          key={col.key}
                          data-active={idx === formulaMentionIndex}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertFormulaMention(col);
                          }}
                          onMouseEnter={() => setFormulaMentionIndex(idx)}
                          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                            idx === formulaMentionIndex
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
                    </div>,
                    document.body,
                  )}

                  {!formulaMentionOpen && existingColumns.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      <AtSign className="mr-0.5 inline-block h-3 w-3" />
                      Type <span className="font-mono text-gray-400">@</span> to reference a column value
                    </p>
                  )}
                </div>
              </div>

              {/* Formula Preview */}
              {formulaExpression.trim() && Object.keys(sampleRowValues).length > 0 && (
                <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 px-3.5 py-2.5">
                  <p className="mb-1 text-xs font-medium text-gray-500">Preview (Row 1)</p>
                  <p className="text-sm text-gray-200">
                    {evaluateFormulaPreview(formulaExpression, sampleRowValues) || <span className="italic text-gray-500">empty</span>}
                  </p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Quick Insert
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'JOIN (&)', expr: '@first_name & " " & @last_name' },
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

          {/* Integration Section */}
          {isIntegration && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Integration Type
                </label>
                <select
                  value={integrationType}
                  onChange={(e) => setIntegrationType(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                >
                  {INTEGRATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {integrationType === 'reoon_email_verify' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-300">
                    Email Source Column
                  </label>
                  <select
                    value={integrationSourceColumn}
                    onChange={(e) => setIntegrationSourceColumn(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  >
                    <option value="">Select column...</option>
                    {existingColumns.map((col) => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Column containing email addresses to verify
                  </p>
                </div>
              )}

              {integrationType === 'apify_actor' && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-300">
                    Actor ID
                  </label>
                  <input
                    type="text"
                    value={apifyActorId}
                    onChange={(e) => setApifyActorId(e.target.value)}
                    placeholder="e.g. apify/web-scraper"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Apify actor to run per row. Configure input mapping after column creation.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Button Column Section */}
          {isButton && (
            <ButtonColumnConfigPanel
              value={buttonConfig}
              onChange={setButtonConfig}
              existingColumns={existingColumns}
            />
          )}

          {/* HubSpot Property Section */}
          {isHubSpotProperty && (
            <div className="space-y-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Select HubSpot Properties
              </label>
              <p className="text-xs text-gray-500 -mt-2">
                Select multiple properties to add them all at once
              </p>
              <HubSpotPropertyPicker
                multiSelect={true}
                onSelect={(property) => {
                  // Single select fallback
                  setHubspotPropertyName(property.name);
                  setHubspotPropertyColumnType(property.columnType);
                  if (!label.trim()) {
                    setLabel(property.label);
                  }
                }}
                onSelectMultiple={(properties) => {
                  // Handle multiple properties
                  if (onAddMultiple && properties.length > 0) {
                    const columns = properties.map((p) => ({
                      key: p.name,
                      label: p.label,
                      columnType: p.columnType,
                      isEnrichment: false,
                      hubspotPropertyName: p.name,
                    }));
                    onAddMultiple(columns);
                    onClose();
                  } else if (properties.length === 1) {
                    // Fallback to single add
                    const p = properties[0];
                    onAdd({
                      key: p.name,
                      label: p.label,
                      columnType: p.columnType,
                      isEnrichment: false,
                      hubspotPropertyName: p.name,
                    });
                    onClose();
                  }
                }}
                excludeProperties={existingColumns.map((c) => c.key)}
              />
            </div>
          )}

          {/* Apollo Property Section */}
          {isApolloProperty && (
            <div className="space-y-4">
              {/* Run controls — shown first so user sees it immediately */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Run enrichment on add
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { value: 'none', label: "Don't run" },
                    { value: '10', label: '10 rows' },
                    { value: '50', label: '50 rows' },
                    { value: '100', label: '100 rows' },
                    { value: 'all', label: 'All rows' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setApolloAutoRunRows(opt.value)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        apolloAutoRunRows === opt.value
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  How many rows to enrich with Apollo when the column is added
                </p>
              </div>

              {/* Enrichment Options */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Enrichment Options
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 cursor-pointer hover:border-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={apolloRevealEmails}
                    onChange={(e) => setApolloRevealEmails(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-gray-200">Reveal personal emails</span>
                    <span className="ml-2 text-xs text-gray-500">+1 credit/row</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 cursor-pointer hover:border-gray-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={apolloRevealPhone}
                    onChange={(e) => setApolloRevealPhone(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-gray-200">Reveal phone numbers</span>
                    <span className="ml-2 text-xs text-gray-500">+8 credits/row</span>
                  </div>
                </label>
              </div>

              {/* Property picker — scrollable list at bottom */}
              <div className="space-y-3">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Select Apollo Properties
                </label>
                <p className="text-xs text-gray-500 -mt-2">
                  Select multiple properties to add them all at once
                </p>
                <ApolloPropertyPicker
                  multiSelect={true}
                  onSelect={(property) => {
                    setApolloPropertyName(property.name);
                    setApolloPropertyColumnType(property.columnType);
                    if (!label.trim()) {
                      setLabel(property.label);
                    }
                  }}
                  onSelectMultiple={(properties) => {
                    if (onAddMultiple && properties.length > 0) {
                      const parsedRun = apolloAutoRunRows === 'all' ? 'all' as const
                        : apolloAutoRunRows === 'none' ? undefined
                        : Number(apolloAutoRunRows);
                      const columns = properties.map((p) => ({
                        key: p.name,
                        label: p.label,
                        columnType: p.isOrgEnrichment ? 'apollo_org_property' : p.columnType,
                        isEnrichment: false,
                        apolloPropertyName: p.name,
                        autoRunRows: parsedRun,
                        apolloEnrichConfig: p.isOrgEnrichment ? undefined : {
                          reveal_personal_emails: apolloRevealEmails,
                          reveal_phone_number: apolloRevealPhone,
                        },
                      }));
                      onAddMultiple(columns);
                      onClose();
                    } else if (properties.length === 1) {
                      const p = properties[0];
                      const parsedRun = apolloAutoRunRows === 'all' ? 'all' as const
                        : apolloAutoRunRows === 'none' ? undefined
                        : Number(apolloAutoRunRows);
                      onAdd({
                        key: p.name,
                        label: p.label,
                        columnType: p.isOrgEnrichment ? 'apollo_org_property' : p.columnType,
                        isEnrichment: false,
                        apolloPropertyName: p.name,
                        autoRunRows: parsedRun,
                        apolloEnrichConfig: p.isOrgEnrichment ? undefined : {
                          reveal_personal_emails: apolloRevealEmails,
                          reveal_phone_number: apolloRevealPhone,
                        },
                      });
                      onClose();
                    }
                  }}
                  excludeProperties={existingColumns.map((c) => c.key)}
                />
              </div>
            </div>
          )}

          {/* Instantly Campaign Section */}
          {isInstantly && tableId && orgId && (
            <InstantlyColumnWizard
              tableId={tableId}
              orgId={orgId}
              existingColumns={existingColumns}
              onComplete={(columns) => {
                if (columns.length === 1) {
                  onAdd(columns[0]);
                } else if (onAddMultiple && columns.length > 1) {
                  onAddMultiple(columns);
                }
                onClose();
              }}
              onCancel={onClose}
            />
          )}

          {isInstantly && (!tableId || !orgId) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm text-amber-300">
                Save this table first before adding Instantly columns.
              </p>
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

              {/* AI Model Selection */}
              <OpenRouterModelPicker
                value={enrichmentModel}
                onChange={setEnrichmentModel}
              />

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
