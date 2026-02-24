import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OpsTableRow, OpsTableColumn } from '@/lib/services/opsTableService';
import { toast } from 'sonner';

/**
 * Polls table data while integration columns have pending/running cells.
 * Shows a toast when integration completes.
 */
export function useIntegrationPolling(
  tableId: string | undefined,
  columns: OpsTableColumn[],
  rows: OpsTableRow[],
) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [wasPolling, setWasPolling] = useState(false);

  const integrationColumns = columns.filter(
    (c) => c.column_type === 'integration',
  );

  // Check if any integration cells are still pending/running
  const hasPending = integrationColumns.some((col) =>
    rows.some((row) => {
      const cell = row.cells[col.key];
      return cell && (cell.status === 'pending' || cell.status === 'running');
    }),
  );

  useEffect(() => {
    if (!tableId) return;

    if (hasPending) {
      setWasPolling(true);
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['ops-table-data', tableId] });
        }, 3000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Show completion toast if we were polling
      if (wasPolling) {
        setWasPolling(false);
        // Count results per integration column
        for (const col of integrationColumns) {
          let complete = 0;
          let failed = 0;
          for (const row of rows) {
            const cell = row.cells[col.key];
            if (cell?.status === 'complete') complete++;
            if (cell?.status === 'failed') failed++;
          }
          if (complete + failed > 0) {
            const label = col.integration_type ?? 'Integration';
            toast.success(
              `${label}: ${complete} complete${failed > 0 ? `, ${failed} failed` : ''}`,
            );
          }
        }
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tableId, hasPending, wasPolling, integrationColumns, rows, queryClient]);

  return { isPolling: hasPending };
}
