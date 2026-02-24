import React, { useState } from 'react';
import { Plus, Trash2, Paintbrush } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FormattingRule, FormattingStyle } from '@/lib/utils/conditionalFormatting';
import { STYLE_PRESETS } from '@/lib/utils/conditionalFormatting';
import type { OpsTableColumn } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConditionalFormattingEditorProps {
  columns: OpsTableColumn[];
  rules: FormattingRule[];
  onChange: (rules: FormattingRule[]) => void;
}

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'starts_with', label: 'Starts with' },
];

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConditionalFormattingEditor({ columns, rules, onChange }: ConditionalFormattingEditorProps) {
  const addRule = () => {
    const newRule: FormattingRule = {
      id: crypto.randomUUID(),
      column_key: columns[0]?.key ?? '',
      operator: 'equals',
      value: '',
      style: { ...STYLE_PRESETS[0].style },
    };
    onChange([...rules, newRule]);
  };

  const updateRule = (index: number, updates: Partial<FormattingRule>) => {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Conditional Formatting</span>
        </div>
        <button
          onClick={addRule}
          className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
        >
          <Plus className="w-3 h-3" /> Add rule
        </button>
      </div>

      {rules.length === 0 && (
        <p className="text-xs text-gray-500 py-2">
          No formatting rules. Add a rule to highlight cells based on their values.
        </p>
      )}

      {rules.map((rule, i) => (
        <div key={rule.id} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-500 uppercase">If</span>
            <select
              value={rule.column_key}
              onChange={(e) => updateRule(i, { column_key: e.target.value })}
              className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
            >
              {columns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <select
              value={rule.operator}
              onChange={(e) => updateRule(i, { operator: e.target.value as FormattingRule['operator'] })}
              className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white outline-none"
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            {!NO_VALUE_OPERATORS.includes(rule.operator) && (
              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(i, { value: e.target.value })}
                placeholder="Value"
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-500 outline-none"
              />
            )}
            <button onClick={() => removeRule(i)} className="text-gray-600 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Style selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-gray-500 uppercase mr-1">Then</span>
            {STYLE_PRESETS.map((preset, pi) => {
              const isActive = JSON.stringify(rule.style) === JSON.stringify(preset.style);
              return (
                <button
                  key={pi}
                  onClick={() => updateRule(i, { style: { ...preset.style } })}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    isActive
                      ? 'ring-1 ring-violet-500 bg-gray-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                  style={preset.style.backgroundColor ? {
                    backgroundColor: isActive ? undefined : preset.style.backgroundColor,
                    color: preset.style.textColor,
                  } : undefined}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Scope toggle */}
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase mr-1">Apply to</span>
            <div className="inline-flex rounded-md bg-gray-800 p-0.5">
              <button
                onClick={() => updateRule(i, { scope: 'cell' as const })}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  (!rule.scope || rule.scope === 'cell')
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Cell
              </button>
              <button
                onClick={() => updateRule(i, { scope: 'row' as const })}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  rule.scope === 'row'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Entire row
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
