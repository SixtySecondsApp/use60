/**
 * FlaggingRulesPanel — Admin CRUD for token anomaly detection rules
 */

import { useState } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  Zap,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { AnomalyRule } from '@/lib/hooks/useGoldenEyeData';

interface FlaggingRulesPanelProps {
  rules: AnomalyRule[];
  onRulesChanged: () => Promise<void>;
}

const RULE_TYPE_META = {
  per_request_max: {
    label: 'Per-Request Max',
    icon: Zap,
    unit: 'tokens',
    description: 'Flag any single request exceeding this token count',
  },
  rate_spike: {
    label: 'Rate Spike',
    icon: TrendingUp,
    unit: 'x multiplier',
    description: 'Flag when usage rate exceeds this multiple of average',
  },
  budget_percent: {
    label: 'Budget Threshold',
    icon: Wallet,
    unit: '%',
    description: 'Flag when user reaches this percentage of their budget',
  },
} as const;

const SEVERITY_COLORS = {
  info: 'border-blue-500/30 text-blue-300',
  warning: 'border-orange-500/30 text-orange-300',
  critical: 'border-red-500/30 text-red-300',
};

export function FlaggingRulesPanel({ rules, onRulesChanged }: FlaggingRulesPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newRule, setNewRule] = useState({
    rule_name: '',
    rule_type: 'per_request_max' as keyof typeof RULE_TYPE_META,
    threshold_value: '',
    time_window_minutes: '',
    severity: 'warning' as 'info' | 'warning' | 'critical',
  });

  const handleToggleRule = async (ruleId: string, isEnabled: boolean) => {
    const { error } = await supabase
      .from('token_anomaly_rules')
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to update rule');
      return;
    }

    await onRulesChanged();
  };

  const handleDeleteRule = async (ruleId: string) => {
    const { error } = await supabase
      .from('token_anomaly_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      toast.error('Failed to delete rule');
      return;
    }

    toast.success('Rule deleted');
    await onRulesChanged();
  };

  const handleAddRule = async () => {
    if (!newRule.rule_name || !newRule.threshold_value) {
      toast.error('Name and threshold are required');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from('token_anomaly_rules')
      .insert({
        rule_name: newRule.rule_name,
        rule_type: newRule.rule_type,
        threshold_value: parseFloat(newRule.threshold_value),
        time_window_minutes: newRule.time_window_minutes ? parseInt(newRule.time_window_minutes) : null,
        severity: newRule.severity,
        is_enabled: true,
      });

    setIsSaving(false);

    if (error) {
      toast.error('Failed to create rule');
      return;
    }

    toast.success('Rule created');
    setIsAdding(false);
    setNewRule({
      rule_name: '',
      rule_type: 'per_request_max',
      threshold_value: '',
      time_window_minutes: '',
      severity: 'warning',
    });
    await onRulesChanged();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Rules grid — 3 columns */}
      <div className="grid grid-cols-3 gap-3">
        {rules.map((rule) => {
          const meta = RULE_TYPE_META[rule.rule_type];
          const Icon = meta?.icon || Shield;

          return (
            <div
              key={rule.id}
              className={`p-3 rounded-lg border ${
                rule.is_enabled ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-900/30 border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{rule.rule_name}</p>
                    <p className="text-xs text-slate-500">{meta?.label}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[rule.severity]}`}>
                    {rule.severity}
                  </Badge>
                  <Switch
                    checked={rule.is_enabled}
                    onCheckedChange={(checked) => handleToggleRule(rule.id, checked)}
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Threshold: <span className="text-slate-200 font-mono">{rule.threshold_value}</span>
                  {' '}{meta?.unit}
                  {rule.time_window_minutes && (
                    <span className="text-slate-500"> (over {rule.time_window_minutes}min)</span>
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-red-400/60 hover:text-red-400 hover:bg-red-900/20 h-7 w-7 p-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {rules.length === 0 && !isAdding && (
          <div className="col-span-3 text-center py-8">
            <AlertTriangle className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No flagging rules configured</p>
          </div>
        )}
      </div>

      {/* Add new rule — spans full width below the grid */}
      <div className="mt-3 shrink-0">
        {isAdding ? (
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-slate-800/50">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-slate-400">Rule Name</Label>
                <Input
                  value={newRule.rule_name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, rule_name: e.target.value }))}
                  placeholder="e.g., High token request"
                  className="bg-slate-900 border-slate-700 text-slate-200 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Rule Type</Label>
                <Select
                  value={newRule.rule_type}
                  onValueChange={(v) => setNewRule(prev => ({ ...prev, rule_type: v as keyof typeof RULE_TYPE_META }))}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_request_max">Per-Request Max</SelectItem>
                    <SelectItem value="rate_spike">Rate Spike</SelectItem>
                    <SelectItem value="budget_percent">Budget %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-400">
                  Threshold ({RULE_TYPE_META[newRule.rule_type]?.unit})
                </Label>
                <Input
                  type="number"
                  value={newRule.threshold_value}
                  onChange={(e) => setNewRule(prev => ({ ...prev, threshold_value: e.target.value }))}
                  placeholder="100000"
                  className="bg-slate-900 border-slate-700 text-slate-200 h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">Severity</Label>
                <Select
                  value={newRule.severity}
                  onValueChange={(v) => setNewRule(prev => ({ ...prev, severity: v as 'info' | 'warning' | 'critical' }))}
                >
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-slate-200 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newRule.rule_type === 'rate_spike' && (
              <div className="mt-2 w-1/4">
                <Label className="text-xs text-slate-400">Time Window (min)</Label>
                <Input
                  type="number"
                  value={newRule.time_window_minutes}
                  onChange={(e) => setNewRule(prev => ({ ...prev, time_window_minutes: e.target.value }))}
                  placeholder="60"
                  className="bg-slate-900 border-slate-700 text-slate-200 h-8 text-sm"
                />
              </div>
            )}
            <div className="flex items-center gap-3 mt-3">
              <Button
                size="sm"
                onClick={handleAddRule}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
              >
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save Rule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-200 h-7 text-xs"
              >
                Cancel
              </Button>
              <p className="text-[10px] text-slate-500 ml-auto">
                {RULE_TYPE_META[newRule.rule_type]?.description}
              </p>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-dashed border-slate-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Rule
          </Button>
        )}
      </div>
    </div>
  );
}
