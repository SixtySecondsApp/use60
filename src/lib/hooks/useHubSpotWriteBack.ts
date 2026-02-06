import { useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { toast } from 'sonner';

/**
 * Fire-and-forget hook to push a cell edit back to HubSpot
 * when the table is configured for bi-directional sync.
 */
export function useHubSpotWriteBack() {
  const writeBack = useCallback(
    async (params: {
      tableId: string;
      rowId: string;
      columnId: string;
      newValue: string | null;
    }) => {
      try {
        const { error } = await supabase.functions.invoke('push-cell-to-hubspot', {
          body: {
            table_id: params.tableId,
            row_id: params.rowId,
            column_id: params.columnId,
            new_value: params.newValue,
          },
        });

        if (error) throw error;
      } catch (e: any) {
        console.warn('[useHubSpotWriteBack] Failed to push to HubSpot:', e);
        toast.error('Failed to push change to HubSpot. Your edit was saved locally.');
      }
    },
    [],
  );

  return { writeBack };
}
