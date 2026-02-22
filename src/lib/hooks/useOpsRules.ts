import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

export interface OpsRule {
  id: string;
  table_id: string;
  name: string;
  trigger_type: 'cell_updated' | 'enrichment_complete' | 'row_created';
  condition: {
    column_key?: string;
    operator?: string;
    value?: string;
  };
  action_type: 'update_cell' | 'run_enrichment' | 'push_to_hubspot' | 'add_tag' | 'notify' | 'webhook';
  action_config: Record<string, any>;
  is_enabled: boolean;
  consecutive_failures: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OpsRuleExecution {
  id: string;
  rule_id: string;
  row_id: string | null;
  status: 'success' | 'failed' | 'skipped';
  result: Record<string, any> | null;
  error: string | null;
  executed_at: string;
}

export function useOpsRules(tableId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['ops-rules', tableId],
    queryFn: async () => {
      if (!tableId) return [];
      const { data, error } = await supabase
        .from('ops_rules')
        .select('id, table_id, name, trigger_type, condition, action_type, action_config, is_enabled, consecutive_failures, created_by, created_at, updated_at')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpsRule[];
    },
    enabled: !!tableId,
  });

  const createRuleMutation = useMutation({
    mutationFn: async (rule: {
      name: string;
      trigger_type: string;
      condition: Record<string, any>;
      action_type: string;
      action_config: Record<string, any>;
      created_by: string;
    }) => {
      const { data, error } = await supabase
        .from('ops_rules')
        .insert({ ...rule, table_id: tableId })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-rules', tableId] });
      toast.success('Rule created');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create rule'),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId, updates }: { ruleId: string; updates: Partial<OpsRule> }) => {
      const { error } = await supabase
        .from('ops_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-rules', tableId] });
      toast.success('Rule updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update rule'),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('ops_rules')
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-rules', tableId] });
      toast.success('Rule deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete rule'),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const updates: Record<string, any> = { is_enabled: enabled };
      // Reset circuit breaker when re-enabling
      if (enabled) updates.consecutive_failures = 0;
      const { error } = await supabase
        .from('ops_rules')
        .update(updates)
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-rules', tableId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to toggle rule'),
  });

  return {
    rules,
    isLoading,
    createRule: createRuleMutation.mutate,
    updateRule: updateRuleMutation.mutate,
    deleteRule: deleteRuleMutation.mutate,
    toggleRule: toggleRuleMutation.mutate,
    isCreating: createRuleMutation.isPending,
  };
}

export function useRuleExecutions(ruleId: string | undefined) {
  return useQuery({
    queryKey: ['ops-rule-executions', ruleId],
    queryFn: async () => {
      if (!ruleId) return [];
      const { data, error } = await supabase
        .from('ops_rule_executions')
        .select('id, rule_id, row_id, status, result, error, executed_at')
        .eq('rule_id', ruleId)
        .order('executed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OpsRuleExecution[];
    },
    enabled: !!ruleId,
  });
}
