import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

/**
 * Hook for executing action columns (push_to_crm, re_enrich, etc.)
 */
export function useActionExecution(tableId: string | undefined) {
  const queryClient = useQueryClient();

  const executeAction = useMutation({
    mutationFn: async ({
      columnId,
      rowIds,
      actionType,
      actionConfig,
    }: {
      columnId: string;
      rowIds: string[];
      actionType: string;
      actionConfig?: Record<string, unknown>;
    }) => {
      switch (actionType) {
        case 'push_to_crm': {
          const { data, error } = await supabase.functions.invoke('push-to-hubspot', {
            body: { table_id: tableId, column_id: columnId, row_ids: rowIds, config: actionConfig },
          });
          if (error) throw error;
          return data;
        }
        case 're_enrich': {
          const { data, error } = await supabase.functions.invoke('enrich-dynamic-table', {
            body: { table_id: tableId, row_ids: rowIds, force_rerun: true },
          });
          if (error) throw error;
          return data;
        }
        default:
          throw new Error(`Unknown action type: ${actionType}`);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
      toast.success(
        variables.actionType === 'push_to_crm'
          ? `Pushing ${variables.rowIds.length} rows to HubSpot...`
          : `Re-enriching ${variables.rowIds.length} rows...`
      );
    },
    onError: (err: Error) => toast.error(err.message || 'Action failed'),
  });

  return { executeAction };
}
