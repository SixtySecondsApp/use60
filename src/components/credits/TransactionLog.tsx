/**
 * TransactionLog — Paginated, filterable credit transaction table.
 *
 * Uses creditService.getTransactions() with type filter and pagination.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { getTransactions, type CreditTransaction } from '@/lib/services/creditService';
import { creditKeys } from '@/lib/hooks/useCreditBalance';
import { Loader2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 15;

type FilterType = 'all' | CreditTransaction['type'];

const TYPE_CONFIG: Record<CreditTransaction['type'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  purchase: { label: 'Purchase', variant: 'default' },
  deduction: { label: 'Deduction', variant: 'destructive' },
  refund: { label: 'Refund', variant: 'secondary' },
  adjustment: { label: 'Adjustment', variant: 'outline' },
  bonus: { label: 'Bonus', variant: 'default' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TransactionLog() {
  const orgId = useOrgId();
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState<FilterType>('all');

  const { data, isLoading } = useQuery({
    queryKey: [...creditKeys.transactions(orgId || ''), filterType, page],
    queryFn: () =>
      getTransactions(orgId!, {
        type: filterType === 'all' ? undefined : filterType,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleFilterChange = (value: string) => {
    setFilterType(value as FilterType);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Transaction History
        </h3>
        <Select value={filterType} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="purchase">Purchase</SelectItem>
            <SelectItem value="deduction">Deduction</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
            <SelectItem value="bonus">Bonus</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
          <Inbox className="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm">No transactions found</p>
          {filterType !== 'all' && (
            <button
              onClick={() => { setFilterType('all'); setPage(0); }}
              className="text-xs text-[#37bd7e] hover:underline mt-1"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!isLoading && transactions.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Date</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[100px] text-right">Amount</TableHead>
                <TableHead className="w-[100px] text-right">Balance</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => {
                const config = TYPE_CONFIG[tx.type] ?? { label: tx.type, variant: 'outline' as const };
                const isPositive = tx.amount > 0;

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {isPositive ? '+' : ''}{tx.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {tx.balanceAfter.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {tx.description || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {total} transaction{total !== 1 ? 's' : ''}
              {filterType !== 'all' ? ` (${TYPE_CONFIG[filterType as CreditTransaction['type']]?.label ?? filterType})` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="h-7 px-2"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
