import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';
import type { ButtonConfig, ButtonAction } from '@/lib/services/opsTableService';

interface ExecuteButtonParams {
  columnId: string;
  rowId: string;
  buttonConfig: ButtonConfig;
  /** Cell values for this row, keyed by column key — used by set_value and open_url */
  rowCellValues: Record<string, string>;
  /** Callback to update a single cell (for set_value actions) */
  onUpdateCell?: (columnKey: string, value: string) => void;
}

interface ExecuteSingleActionParams {
  columnId: string;
  rowId: string;
  actionType: string;
  actionConfig?: Record<string, unknown>;
}

/**
 * Hook for executing button/action column actions.
 * Supports multi-action chaining (sequential execution, stops on failure).
 */
export function useActionExecution(tableId: string | undefined) {
  const queryClient = useQueryClient();

  /** Execute a single legacy action (push_to_crm, re_enrich) */
  const executeSingleAction = useMutation({
    mutationFn: async ({ columnId, rowId, actionType, actionConfig }: ExecuteSingleActionParams) => {
      switch (actionType) {
        case 'push_to_crm': {
          const { data, error } = await supabase.functions.invoke('push-to-hubspot', {
            body: { table_id: tableId, column_id: columnId, row_ids: [rowId], config: actionConfig },
          });
          if (error) throw error;
          return data;
        }
        case 'push_to_instantly': {
          const { data, error } = await supabase.functions.invoke('push-to-instantly', {
            body: { table_id: tableId, row_ids: [rowId], ...(actionConfig ?? {}) },
          });
          if (error) throw error;
          return data;
        }
        case 're_enrich': {
          const { data, error } = await supabase.functions.invoke('enrich-dynamic-table', {
            body: { table_id: tableId, row_ids: [rowId], force_rerun: true },
          });
          if (error) throw error;
          return data;
        }
        default:
          throw new Error(`Unknown action type: ${actionType}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });

  /** Execute a Coda-style button with chained actions */
  const executeButton = useMutation({
    mutationFn: async ({ buttonConfig, rowId, columnId, rowCellValues, onUpdateCell }: ExecuteButtonParams) => {
      const results: { action: ButtonAction; success: boolean; error?: string }[] = [];

      for (const action of buttonConfig.actions) {
        try {
          await executeSingleButtonAction(action, {
            tableId: tableId!,
            columnId,
            rowId,
            rowCellValues,
            onUpdateCell,
          });
          results.push({ action, success: true });
        } catch (err: any) {
          results.push({ action, success: false, error: err.message });
          // Stop chain on failure
          break;
        }
      }

      const failed = results.find((r) => !r.success);
      if (failed) {
        throw new Error(`Action "${failed.action.type}" failed: ${failed.error}`);
      }

      return results;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(`${variables.buttonConfig.label || 'Button'} completed`);
    },
    onError: (err: Error) => toast.error(err.message || 'Button action failed'),
  });

  return { executeSingleAction, executeButton };
}

async function executeSingleButtonAction(
  action: ButtonAction,
  ctx: {
    tableId: string;
    columnId: string;
    rowId: string;
    rowCellValues: Record<string, string>;
    onUpdateCell?: (columnKey: string, value: string) => void;
  },
): Promise<void> {
  switch (action.type) {
    case 'set_value': {
      const targetKey = action.config.target_column_key as string;
      const value = resolveValueExpression(action.config.value as string, ctx.rowCellValues);
      if (!targetKey) throw new Error('No target column specified');
      ctx.onUpdateCell?.(targetKey, value);
      return;
    }

    case 'open_url': {
      const urlColumnKey = action.config.url_column_key as string;
      const staticUrl = action.config.static_url as string;
      const url = urlColumnKey ? ctx.rowCellValues[urlColumnKey] : staticUrl;
      if (!url) throw new Error('No URL found');
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    case 'push_to_crm': {
      const { error } = await supabase.functions.invoke('push-to-hubspot', {
        body: { table_id: ctx.tableId, column_id: ctx.columnId, row_ids: [ctx.rowId], config: action.config },
      });
      if (error) throw error;
      return;
    }

    case 'push_to_instantly': {
      const { error } = await supabase.functions.invoke('push-to-instantly', {
        body: {
          table_id: ctx.tableId,
          row_ids: [ctx.rowId],
          campaign_id: action.config.campaign_id as string,
          field_mapping: action.config.field_mapping as Record<string, string> | undefined,
        },
      });
      if (error) throw error;
      return;
    }

    case 're_enrich': {
      const { error } = await supabase.functions.invoke('enrich-dynamic-table', {
        body: { table_id: ctx.tableId, row_ids: [ctx.rowId], force_rerun: true },
      });
      if (error) throw error;
      return;
    }

    case 'call_function': {
      const fnName = action.config.function_name as string;
      if (!fnName) throw new Error('No function name specified');
      const { error } = await supabase.functions.invoke(fnName, {
        body: { table_id: ctx.tableId, row_id: ctx.rowId, ...(action.config.body_template as Record<string, unknown> ?? {}) },
      });
      if (error) throw error;
      return;
    }

    case 'start_sequence': {
      const seqId = action.config.sequence_id as string;
      if (!seqId) throw new Error('No sequence ID specified');
      const { error } = await supabase.functions.invoke('run-sequence', {
        body: { sequence_id: seqId, table_id: ctx.tableId, row_id: ctx.rowId, input_mapping: action.config.input_mapping ?? {} },
      });
      if (error) throw error;
      return;
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/** Resolve @column_key references in a value expression */
function resolveValueExpression(expr: string, cellValues: Record<string, string>): string {
  if (!expr) return '';
  return expr.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    return cellValues[key] ?? '';
  });
}
