import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, AtSign } from 'lucide-react';
import { ButtonColumnConfigPanel } from './ButtonColumnConfigPanel';
import type { ButtonConfig } from '@/lib/services/opsTableService';

interface ExistingColumn {
  key: string;
  label: string;
}

interface EditFormulaProps {
  mode: 'formula';
  currentFormula: string;
  onSave: (formula: string) => void;
}

interface EditButtonProps {
  mode: 'button';
  currentConfig: ButtonConfig;
  onSave: (config: ButtonConfig) => void;
}

type EditColumnSettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  columnLabel: string;
  existingColumns?: ExistingColumn[];
  sampleRowValues?: Record<string, string>;
} & (EditFormulaProps | EditButtonProps);

/** Lightweight client-side formula evaluator for preview */
function evaluateFormulaPreview(expression: string, sampleValues: Record<string, string>): string {
  if (!expression.trim()) return '';
  try {
    let expr = expression.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      const val = sampleValues[key];
      return val !== undefined && val !== '' ? `"${val}"` : '""';
    });
    // CONCAT
    expr = expr.replace(/CONCAT\s*\(([^)]*)\)/gi, (_, argsStr: string) => {
      const args = splitArgs(argsStr);
      const resolved = args.map(stripQuotes).filter((v) => v !== '' && v !== 'N/A');
      return `"${resolved.join('')}"`;
    });
    // IF
    expr = expr.replace(/IF\s*\(([^)]*)\)/gi, (_, argsStr: string) => {
      const args = splitArgs(argsStr);
      if (args.length < 3) return '""';
      const cond = stripQuotes(args[0]);
      const eqMatch = cond.match(/^(.+?)\s*=\s*(.+)$/);
      if (eqMatch) {
        const left = stripQuotes(eqMatch[1].trim());
        const right = stripQuotes(eqMatch[2].trim());
        return left === right ? args[1].trim() : args[2].trim();
      }
      return args[1].trim();
    });
    // & concatenation
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
      return parts.map((p) => stripQuotes(p.trim())).filter((v) => v !== '' && v !== 'N/A').join('');
    }
    // Simple math
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
    return stripQuotes(expr);
  } catch {
    return stripQuotes(expression);
  }
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
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

export function EditColumnSettingsModal(props: EditColumnSettingsModalProps) {
  const { isOpen, onClose, columnLabel, existingColumns = [], sampleRowValues = {} } = props;

  // Formula state
  const [formula, setFormula] = useState('');
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  // Button state
  const [buttonConfig, setButtonConfig] = useState<ButtonConfig>({ label: '', color: '#8b5cf6', actions: [] });

  // @mention state for formula
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize state from props
  useEffect(() => {
    if (!isOpen) return;
    if (props.mode === 'formula') {
      setFormula(props.currentFormula);
    } else {
      setButtonConfig(props.currentConfig);
    }
    setMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(0);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus formula textarea on open
  useEffect(() => {
    if (isOpen && props.mode === 'formula') {
      setTimeout(() => formulaRef.current?.focus(), 100);
    }
  }, [isOpen, props.mode]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mentionOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, mentionOpen]);

  // Filter columns for @mention
  const filteredColumns = useMemo(() => {
    if (!mentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return existingColumns.filter(
      (col) => col.key.toLowerCase().includes(q) || col.label.toLowerCase().includes(q),
    );
  }, [existingColumns, mentionQuery, mentionOpen]);

  const insertMention = useCallback(
    (column: ExistingColumn) => {
      const textarea = formulaRef.current;
      if (!textarea) return;
      const before = formula.slice(0, mentionStartPos);
      const after = formula.slice(textarea.selectionStart);
      const inserted = `@${column.key}`;
      const newValue = before + inserted + after;
      setFormula(newValue);
      setMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(0);
      const cursorPos = before.length + inserted.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [formula, mentionStartPos],
  );

  const handleFormulaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;
      setFormula(value);
      if (existingColumns.length === 0) return;
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');
      if (lastAtIndex === -1) { setMentionOpen(false); return; }
      if (lastAtIndex > 0 && !/[\s(,]/.test(textBeforeCursor[lastAtIndex - 1])) {
        setMentionOpen(false);
        return;
      }
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (/\s/.test(textAfterAt)) { setMentionOpen(false); return; }
      setMentionStartPos(lastAtIndex);
      setMentionQuery(textAfterAt);
      setMentionIndex(0);
      setMentionOpen(true);
    },
    [existingColumns.length],
  );

  const handleFormulaKeyDown = useCallback(
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

  const handleSave = () => {
    if (props.mode === 'formula') {
      if (formula.trim()) props.onSave(formula.trim());
    } else {
      props.onSave(buttonConfig);
    }
    onClose();
  };

  const canSave = props.mode === 'formula'
    ? formula.trim().length > 0
    : buttonConfig.label.trim().length > 0 && buttonConfig.actions.length > 0;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
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
          <h2 className="text-lg font-semibold text-gray-100">
            Edit {props.mode === 'formula' ? 'Formula' : 'Button'}: {columnLabel}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-5">
          {props.mode === 'formula' ? (
            <div className="space-y-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Formula Expression
              </label>
              <div className="relative">
                <textarea
                  ref={formulaRef}
                  value={formula}
                  onChange={handleFormulaChange}
                  onKeyDown={handleFormulaKeyDown}
                  placeholder='e.g. @first_name & " " & @last_name'
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 font-mono text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />

                {/* @mention dropdown (portal to avoid overflow clipping) */}
                {mentionOpen && filteredColumns.length > 0 && formulaRef.current && createPortal(
                  <div
                    ref={dropdownRef}
                    style={{
                      position: 'fixed',
                      top: formulaRef.current.getBoundingClientRect().bottom + 4,
                      left: formulaRef.current.getBoundingClientRect().left,
                      width: formulaRef.current.getBoundingClientRect().width,
                    }}
                    className="z-[100] max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
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
                        <span className="ml-auto font-mono text-xs text-gray-500">{col.key}</span>
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}

                {!mentionOpen && existingColumns.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    <AtSign className="mr-0.5 inline-block h-3 w-3" />
                    Type <span className="font-mono text-gray-400">@</span> to reference a column value
                  </p>
                )}
              </div>

              {/* Formula Preview */}
              {formula.trim() && Object.keys(sampleRowValues).length > 0 && (
                <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 px-3.5 py-2.5">
                  <p className="mb-1 text-xs font-medium text-gray-500">Preview (Row 1)</p>
                  <p className="text-sm text-gray-200">
                    {evaluateFormulaPreview(formula, sampleRowValues) || <span className="italic text-gray-500">empty</span>}
                  </p>
                </div>
              )}

              {/* Quick insert templates */}
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
                      onClick={() => setFormula(tmpl.expr)}
                      className="rounded border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs font-medium text-gray-400 hover:border-violet-500/40 hover:text-violet-300"
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <ButtonColumnConfigPanel
              value={buttonConfig}
              onChange={setButtonConfig}
              existingColumns={existingColumns}
            />
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditColumnSettingsModal;
