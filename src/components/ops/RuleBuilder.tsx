import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import type { OpsTableColumn } from '@/lib/services/opsTableService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleBuilderProps {
  columns: OpsTableColumn[];
  onSave: (rule: {
    name: string;
    trigger_type: string;
    condition: { column_key?: string; operator?: string; value?: string };
    action_type: string;
    action_config: Record<string, any>;
    created_by: string;
  }) => void;
  onCancel: () => void;
  userId: string;
  isSaving?: boolean;
}

const TRIGGER_TYPES = [
  { value: 'cell_updated', label: 'When a cell is updated' },
  { value: 'enrichment_complete', label: 'When enrichment completes' },
  { value: 'row_created', label: 'When a new row is created' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'starts_with', label: 'Starts with' },
];

const ACTION_TYPES = [
  { value: 'update_cell', label: 'Update a cell value' },
  { value: 'add_tag', label: 'Add a tag' },
  { value: 'run_enrichment', label: 'Run enrichment' },
  { value: 'notify', label: 'Log notification' },
];

const NO_VALUE_OPERATORS = ['is_empty', 'is_not_empty'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RuleBuilder({ columns, onSave, onCancel, userId, isSaving }: RuleBuilderProps) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('cell_updated');
  const [conditionColumnKey, setConditionColumnKey] = useState('');
  const [conditionOperator, setConditionOperator] = useState('equals');
  const [conditionValue, setConditionValue] = useState('');
  const [actionType, setActionType] = useState('update_cell');
  const [actionTargetColumn, setActionTargetColumn] = useState('');
  const [actionValue, setActionValue] = useState('');
  const [actionTag, setActionTag] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionEnrichmentColumnId, setActionEnrichmentColumnId] = useState('');

  const enrichmentColumns = columns.filter((c) => c.is_enrichment);
  const tagsColumns = columns.filter((c) => c.column_type === 'tags');

  const canSave = name.trim() && triggerType;

  const handleSave = () => {
    const condition: Record<string, any> = {};
    if (conditionColumnKey) {
      condition.column_key = conditionColumnKey;
      condition.operator = conditionOperator;
      if (!NO_VALUE_OPERATORS.includes(conditionOperator)) {
        condition.value = conditionValue;
      }
    }

    const actionConfig: Record<string, any> = {};
    switch (actionType) {
      case 'update_cell':
        actionConfig.target_column_key = actionTargetColumn;
        actionConfig.value = actionValue;
        break;
      case 'add_tag':
        actionConfig.target_column_key = actionTargetColumn || tagsColumns[0]?.key;
        actionConfig.tag = actionTag;
        break;
      case 'run_enrichment':
        actionConfig.enrichment_column_id = actionEnrichmentColumnId || enrichmentColumns[0]?.id;
        break;
      case 'notify':
        actionConfig.message = actionMessage || `Rule "${name}" triggered`;
        break;
    }

    onSave({
      name: name.trim(),
      trigger_type: triggerType,
      condition,
      action_type: actionType,
      action_config: actionConfig,
      created_by: userId,
    });
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">New Rule</h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Rule name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-400">Rule name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tag high-score leads"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-violet-500"
        />
      </div>

      {/* Trigger */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-400">WHEN (trigger)</label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none"
        >
          {TRIGGER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Condition */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-400">IF (condition — optional)</label>
        <div className="flex gap-2">
          <select
            value={conditionColumnKey}
            onChange={(e) => setConditionColumnKey(e.target.value)}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white outline-none"
          >
            <option value="">Any column</option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select
            value={conditionOperator}
            onChange={(e) => setConditionOperator(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white outline-none"
          >
            {CONDITION_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          {!NO_VALUE_OPERATORS.includes(conditionOperator) && (
            <input
              type="text"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="Value"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white placeholder-gray-500 outline-none"
            />
          )}
        </div>
      </div>

      {/* Action */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-400">THEN (action)</label>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none mb-2"
        >
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        {/* Action config fields */}
        {actionType === 'update_cell' && (
          <div className="flex gap-2">
            <select
              value={actionTargetColumn}
              onChange={(e) => setActionTargetColumn(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white outline-none"
            >
              <option value="">Select column</option>
              {columns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              placeholder="New value"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>
        )}

        {actionType === 'add_tag' && (
          <div className="flex gap-2">
            <select
              value={actionTargetColumn}
              onChange={(e) => setActionTargetColumn(e.target.value)}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white outline-none"
            >
              <option value="">Tags column</option>
              {tagsColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={actionTag}
              onChange={(e) => setActionTag(e.target.value)}
              placeholder="Tag to add"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>
        )}

        {actionType === 'run_enrichment' && (
          <select
            value={actionEnrichmentColumnId}
            onChange={(e) => setActionEnrichmentColumnId(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="">Select enrichment column</option>
            {enrichmentColumns.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}

        {actionType === 'notify' && (
          <input
            type="text"
            value={actionMessage}
            onChange={(e) => setActionMessage(e.target.value)}
            placeholder="Notification message"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none"
          />
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} className="text-gray-400">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="bg-violet-600 hover:bg-violet-500"
        >
          {isSaving ? 'Creating...' : 'Create Rule'}
        </Button>
      </div>
    </div>
  );
}
