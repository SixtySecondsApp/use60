import { useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';

/**
 * Fire-and-forget hook to push a cell edit back to Attio
 * when the table is configured for bi-directional sync.
 */
export function useAttioWriteBack() {
  const writeBack = useCallback(
    async (params: {
      tableId: string;
      rowId: string;
      columnId: string;
      newValue: string | null;
    }) => {
      try {
        const { error } = await supabase.functions.invoke('push-cell-to-attio', {
          body: {
            table_id: params.tableId,
            row_id: params.rowId,
            column_id: params.columnId,
            new_value: params.newValue,
          },
        });

        if (error) throw error;
      } catch (e: any) {
        console.warn('[useAttioWriteBack] Failed to push to Attio:', e);
      }
    },
    [],
  );

  return { writeBack };
}
