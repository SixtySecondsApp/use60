/**
 * TransactionHistorySection — Paginated, filterable credit transaction table
 * for the Billing settings page.
 *
 * Uses creditService.getTransactions() with React Query.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { getTransactions, type CreditTransaction } from '@/lib/services/creditService';
import { creditKeys } from '@/lib/hooks/useCreditBalance';
import {
  History,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 10;

type FilterType = 'all' | CreditTransaction['type'];

const TYPE_BADGE_CLASS: Record<CreditTransaction['type'], string> = {
  purchase: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  deduction: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
  bonus: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  refund: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  adjustment: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800',
};

const TYPE_LABEL: Record<CreditTransaction['type'], string> = {
  purchase: 'Purchase',
  deduction: 'Deduction',
  bonus: 'Bonus',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

// ============================================================================
// Helpers
// ============================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}${formatted} cr`;
}

// ============================================================================
// Main component
// ============================================================================

export function TransactionHistorySection() {
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
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <History className="w-4 h-4 text-[#37bd7e]" />
          Transaction History
        </h3>

        <Select value={filterType} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="purchase">Subscriptions &amp; Packs</SelectItem>
            <SelectItem value="deduction">Deductions</SelectItem>
            <SelectItem value="bonus">Bonus</SelectItem>
            <SelectItem value="refund">Refunds</SelectItem>
            <SelectItem value="adjustment">Adjustments</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <Inbox className="w-8 h-8 mb-2 text-gray-300 dark:text-gray-600" />
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
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="text-right py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-right py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Balance After
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {transactions.map((tx) => {
                const isPositive = tx.amount >= 0;
                const badgeClass = TYPE_BADGE_CLASS[tx.type] ?? TYPE_BADGE_CLASS.adjustment;
                const typeLabel = TYPE_LABEL[tx.type] ?? tx.type;

                return (
                  <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 pr-4 text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', badgeClass)}>
                        {typeLabel}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {tx.description || '—'}
                    </td>
                    <td className={cn(
                      'py-2.5 pr-4 text-right text-sm font-semibold tabular-nums',
                      isPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    )}>
                      {formatAmount(tx.amount)}
                    </td>
                    <td className="py-2.5 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {tx.balanceAfter % 1 === 0
                        ? `${tx.balanceAfter.toFixed(0)} cr`
                        : `${tx.balanceAfter.toFixed(1)} cr`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && transactions.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {total} transaction{total !== 1 ? 's' : ''}
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
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
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
      )}
    </div>
  );
}
