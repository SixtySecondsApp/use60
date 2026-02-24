import React, { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, MousePointerClick } from 'lucide-react';
import type { ButtonConfig, ButtonAction, ButtonActionType } from '@/lib/services/opsTableService';

interface ExistingColumn {
  key: string;
  label: string;
}

interface ButtonColumnConfigPanelProps {
  value: ButtonConfig;
  onChange: (config: ButtonConfig) => void;
  existingColumns: ExistingColumn[];
}

const ACTION_TYPES: { value: ButtonActionType; label: string; description: string }[] = [
  { value: 'set_value', label: 'Set Value', description: 'Set a column value in the same row' },
  { value: 'open_url', label: 'Open URL', description: 'Open a URL from a column or static link' },
  { value: 'push_to_crm', label: 'Push to CRM', description: 'Push this row to HubSpot' },
  { value: 'push_to_instantly', label: 'Push to Instantly', description: 'Push this row as a lead to Instantly' },
  { value: 're_enrich', label: 'Re-enrich', description: 'Force re-enrichment of this row' },
  { value: 'call_function', label: 'Call Function', description: 'Invoke a Supabase edge function' },
  { value: 'start_sequence', label: 'Start Sequence', description: 'Trigger an automation sequence' },
];

const BUTTON_COLORS = [
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#6b7280', label: 'Gray' },
];

function defaultConfigForType(type: ButtonActionType): Record<string, unknown> {
  switch (type) {
    case 'set_value': return { target_column_key: '', value: '' };
    case 'open_url': return { url_column_key: '' };
    case 'push_to_crm': return {};
    case 'push_to_instantly': return { campaign_id: '' };
    case 're_enrich': return {};
    case 'call_function': return { function_name: '' };
    case 'start_sequence': return { sequence_id: '' };
    default: return {};
  }
}

export function ButtonColumnConfigPanel({ value, onChange, existingColumns }: ButtonColumnConfigPanelProps) {
  const [expandedAction, setExpandedAction] = useState<number | null>(value.actions.length > 0 ? 0 : null);

  const updateLabel = useCallback((label: string) => {
    onChange({ ...value, label });
  }, [value, onChange]);

  const updateColor = useCallback((color: string) => {
    onChange({ ...value, color });
  }, [value, onChange]);

  const addAction = useCallback(() => {
    const newAction: ButtonAction = { type: 'set_value', config: defaultConfigForType('set_value') };
    const updated = { ...value, actions: [...value.actions, newAction] };
    onChange(updated);
    setExpandedAction(updated.actions.length - 1);
  }, [value, onChange]);

  const removeAction = useCallback((idx: number) => {
    const updated = { ...value, actions: value.actions.filter((_, i) => i !== idx) };
    onChange(updated);
    setExpandedAction(null);
  }, [value, onChange]);

  const updateActionType = useCallback((idx: number, type: ButtonActionType) => {
    const actions = [...value.actions];
    actions[idx] = { type, config: defaultConfigForType(type) };
    onChange({ ...value, actions });
  }, [value, onChange]);

  const updateActionConfig = useCallback((idx: number, key: string, val: unknown) => {
    const actions = [...value.actions];
    actions[idx] = { ...actions[idx], config: { ...actions[idx].config, [key]: val } };
    onChange({ ...value, actions });
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Button Label */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Button Label
        </label>
        <input
          type="text"
          value={value.label}
          onChange={(e) => updateLabel(e.target.value)}
          placeholder="e.g. Qualify, Send Email, Open LinkedIn"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        />
        <p className="mt-1 text-xs text-gray-500">
          Use <span className="font-mono text-gray-400">@column_key</span> for dynamic labels (e.g. &quot;Email @first_name&quot;)
        </p>
      </div>

      {/* Button Color */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Button Color
        </label>
        <div className="flex flex-wrap gap-2">
          {BUTTON_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => updateColor(c.value)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                value.color === c.value
                  ? 'border-white/30 ring-1 ring-white/20'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
              style={{ backgroundColor: c.value + '20', color: c.value }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.value }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Button Preview */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Preview
        </label>
        <div className="flex items-center justify-center rounded-lg border border-gray-700/60 bg-gray-800/50 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              borderColor: value.color + '60',
              backgroundColor: value.color + '15',
              color: value.color,
            }}
          >
            <MousePointerClick className="w-3 h-3" />
            {value.label || 'Button'}
          </button>
        </div>
      </div>

      {/* Actions List */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-300">
            Actions ({value.actions.length})
          </label>
          <button
            type="button"
            onClick={addAction}
            className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Action
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-500">
          Actions execute sequentially when the button is clicked.
        </p>

        {value.actions.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/30 py-6 text-center">
            <MousePointerClick className="mx-auto h-6 w-6 text-gray-600" />
            <p className="mt-1.5 text-xs text-gray-500">No actions yet. Add one to make the button do something.</p>
          </div>
        )}

        <div className="space-y-2">
          {value.actions.map((action, idx) => {
            const isExpanded = expandedAction === idx;
            const actionDef = ACTION_TYPES.find((a) => a.value === action.type);
            return (
              <div
                key={idx}
                className="rounded-lg border border-gray-700/60 bg-gray-800/50 overflow-hidden"
              >
                {/* Action Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedAction(isExpanded ? null : idx)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedAction(isExpanded ? null : idx); } }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-800/80 transition-colors"
                >
                  <GripVertical className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                  <span className="font-mono text-xs text-gray-500">{idx + 1}.</span>
                  <span className="font-medium text-gray-200">{actionDef?.label ?? action.type}</span>
                  <span className="ml-auto text-xs text-gray-500">{actionDef?.description}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeAction(idx); }}
                    className="rounded p-0.5 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Action Config (expanded) */}
                {isExpanded && (
                  <div className="border-t border-gray-700/40 px-3 py-3 space-y-3">
                    {/* Action Type Selector */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-400">Action Type</label>
                      <select
                        value={action.type}
                        onChange={(e) => updateActionType(idx, e.target.value as ButtonActionType)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
                      >
                        {ACTION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Type-specific config */}
                    {action.type === 'set_value' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-400">Target Column</label>
                          <select
                            value={(action.config.target_column_key as string) ?? ''}
                            onChange={(e) => updateActionConfig(idx, 'target_column_key', e.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
                          >
                            <option value="">Select column...</option>
                            {existingColumns.map((col) => (
                              <option key={col.key} value={col.key}>{col.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-400">Value to Set</label>
                          <input
                            type="text"
                            value={(action.config.value as string) ?? ''}
                            onChange={(e) => updateActionConfig(idx, 'value', e.target.value)}
                            placeholder='e.g. "Qualified" or @column_key'
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                          />
                        </div>
                      </>
                    )}

                    {action.type === 'open_url' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">URL Source</label>
                        <select
                          value={(action.config.url_column_key as string) ?? ''}
                          onChange={(e) => updateActionConfig(idx, 'url_column_key', e.target.value)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
                        >
                          <option value="">Select column with URL...</option>
                          {existingColumns.map((col) => (
                            <option key={col.key} value={col.key}>{col.label}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Or enter a static URL:
                        </p>
                        <input
                          type="text"
                          value={(action.config.static_url as string) ?? ''}
                          onChange={(e) => updateActionConfig(idx, 'static_url', e.target.value)}
                          placeholder="https://..."
                          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    {action.type === 'call_function' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">Edge Function Name</label>
                        <input
                          type="text"
                          value={(action.config.function_name as string) ?? ''}
                          onChange={(e) => updateActionConfig(idx, 'function_name', e.target.value)}
                          placeholder="e.g. process-lead"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    {action.type === 'start_sequence' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">Sequence ID</label>
                        <input
                          type="text"
                          value={(action.config.sequence_id as string) ?? ''}
                          onChange={(e) => updateActionConfig(idx, 'sequence_id', e.target.value)}
                          placeholder="e.g. seq-qualify-lead"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    {action.type === 'push_to_instantly' && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-400">Campaign ID (optional)</label>
                        <input
                          type="text"
                          value={(action.config.campaign_id as string) ?? ''}
                          onChange={(e) => updateActionConfig(idx, 'campaign_id', e.target.value)}
                          placeholder="Leave empty to use the linked campaign"
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-violet-500"
                        />
                      </div>
                    )}

                    {(action.type === 'push_to_crm' || action.type === 're_enrich') && (
                      <p className="text-xs text-gray-500 italic">
                        No additional configuration needed. Uses default settings.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ButtonColumnConfigPanel;
