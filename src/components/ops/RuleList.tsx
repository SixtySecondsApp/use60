import React, { useState } from 'react';
import { Zap, Trash2, AlertTriangle, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { OpsRule } from '@/lib/hooks/useOpsRules';
import { useRuleExecutions } from '@/lib/hooks/useOpsRules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RuleListProps {
  rules: OpsRule[];
  onToggle: (params: { ruleId: string; enabled: boolean }) => void;
  onDelete: (ruleId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RuleList({ rules, onToggle, onDelete }: RuleListProps) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 py-10 text-center">
        <Zap className="mx-auto mb-2 h-6 w-6 text-gray-600" />
        <p className="text-sm text-gray-500">No rules yet</p>
        <p className="text-xs text-gray-600 mt-1">Create a rule to automate actions on your table.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <RuleItem
          key={rule.id}
          rule={rule}
          isExpanded={expandedRuleId === rule.id}
          onToggleExpand={() => setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule Item
// ---------------------------------------------------------------------------

function RuleItem({
  rule,
  isExpanded,
  onToggleExpand,
  onToggle,
  onDelete,
}: {
  rule: OpsRule;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggle: (params: { ruleId: string; enabled: boolean }) => void;
  onDelete: (ruleId: string) => void;
}) {
  const isCircuitBroken = rule.consecutive_failures >= 10;

  const triggerLabels: Record<string, string> = {
    cell_updated: 'Cell updated',
    enrichment_complete: 'Enrichment done',
    row_created: 'Row created',
  };

  const actionLabels: Record<string, string> = {
    update_cell: 'Update cell',
    add_tag: 'Add tag',
    run_enrichment: 'Run enrichment',
    notify: 'Notify',
    push_to_hubspot: 'Push to HubSpot',
    webhook: 'Webhook',
  };

  return (
    <div className={`rounded-xl border ${
      isCircuitBroken
        ? 'border-red-800/50 bg-red-950/10'
        : rule.is_enabled
          ? 'border-gray-700 bg-gray-900/50'
          : 'border-gray-800 bg-gray-950/50 opacity-60'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Expand toggle */}
        <button onClick={onToggleExpand} className="text-gray-500 hover:text-gray-300">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Status indicator */}
        {isCircuitBroken ? (
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
        ) : rule.is_enabled ? (
          <Zap className="w-4 h-4 text-violet-400 shrink-0" />
        ) : (
          <Zap className="w-4 h-4 text-gray-600 shrink-0" />
        )}

        {/* Name and meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{rule.name}</span>
            {isCircuitBroken && (
              <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                {rule.consecutive_failures} failures
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {triggerLabels[rule.trigger_type] ?? rule.trigger_type}
            {rule.condition?.column_key && ` · ${rule.condition.column_key} ${rule.condition.operator}`}
            {' → '}
            {actionLabels[rule.action_type] ?? rule.action_type}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onToggle({ ruleId: rule.id, enabled: !rule.is_enabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            rule.is_enabled ? 'bg-violet-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              rule.is_enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(rule.id)}
          className="text-gray-600 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded: execution log */}
      {isExpanded && (
        <div className="border-t border-gray-800 px-4 py-3">
          <RuleExecutionLog ruleId={rule.id} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution Log
// ---------------------------------------------------------------------------

function RuleExecutionLog({ ruleId }: { ruleId: string }) {
  const { data: executions = [], isLoading } = useRuleExecutions(ruleId);

  if (isLoading) {
    return <p className="text-xs text-gray-500 py-2">Loading...</p>;
  }

  if (executions.length === 0) {
    return <p className="text-xs text-gray-500 py-2">No executions yet</p>;
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
        Recent executions ({executions.length})
      </p>
      {executions.map((exec) => (
        <div key={exec.id} className="flex items-center gap-2 text-xs">
          {exec.status === 'success' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : exec.status === 'failed' ? (
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
          ) : (
            <Clock className="w-3 h-3 text-gray-500 shrink-0" />
          )}
          <span className={`${
            exec.status === 'success' ? 'text-gray-400' :
            exec.status === 'failed' ? 'text-red-400' : 'text-gray-500'
          }`}>
            {exec.status === 'failed' ? exec.error : exec.status}
          </span>
          <span className="text-gray-600 ml-auto shrink-0">
            {formatDistanceToNow(new Date(exec.executed_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
