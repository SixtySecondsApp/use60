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
import {
  Loader2, ChevronLeft, ChevronRight, Inbox,
  Bot, Cpu, CreditCard, RefreshCw, Gift, RotateCcw,
} from 'lucide-react';
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

const TYPE_CONFIG: Record<CreditTransaction['type'], {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof CreditCard;
  iconClass: string;
}> = {
  purchase: { label: 'Purchase', variant: 'default', icon: CreditCard, iconClass: 'text-emerald-500' },
  deduction: { label: 'AI Action', variant: 'destructive', icon: Bot, iconClass: 'text-red-400' },
  refund: { label: 'Refund', variant: 'secondary', icon: RotateCcw, iconClass: 'text-blue-400' },
  adjustment: { label: 'Adjustment', variant: 'outline', icon: Cpu, iconClass: 'text-gray-400' },
  bonus: { label: 'Bonus', variant: 'default', icon: Gift, iconClass: 'text-amber-500' },
};

/** Detect if a deduction is an auto top-up purchase based on description */
function isAutoTopUp(tx: CreditTransaction): boolean {
  return tx.type === 'purchase' && (tx.description?.toLowerCase().includes('auto') ?? false);
}

/** Detect transaction category from feature_key or description */
function getCategoryLabel(tx: CreditTransaction): string | null {
  if (tx.featureKey) {
    if (tx.featureKey.includes('storage')) return 'Storage';
    if (tx.featureKey.includes('apollo') || tx.featureKey.includes('ai_ark') || tx.featureKey.includes('exa') || tx.featureKey.includes('email_send')) return 'Integration';
    if (tx.featureKey.includes('ar_budget') || tx.featureKey.includes('proactive')) return 'AR Budget';
    return 'AI';
  }
  return null;
}

function formatCreditAmount(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
  const prefix = amount >= 0 ? '+' : '-';
  return `${prefix}${formatted} cr`;
}

function formatBalance(balance: number): string {
  return balance % 1 === 0 ? `${Math.round(balance)} cr` : `${balance.toFixed(1)} cr`;
}

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
                const autoTopUp = isAutoTopUp(tx);
                const config = TYPE_CONFIG[tx.type] ?? { label: tx.type, variant: 'outline' as const, icon: CreditCard, iconClass: 'text-gray-400' };
                const TypeIcon = autoTopUp ? RefreshCw : config.icon;
                const iconClass = autoTopUp ? 'text-indigo-500' : config.iconClass;
                const isPositive = tx.amount > 0;
                const categoryLabel = getCategoryLabel(tx);

                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <TypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
                        <Badge
                          variant={autoTopUp ? 'outline' : config.variant}
                          className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${autoTopUp ? 'border-indigo-300 text-indigo-600 dark:text-indigo-400' : ''}`}
                        >
                          {autoTopUp ? 'Auto Top-Up' : config.label}
                        </Badge>
                        {categoryLabel && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{categoryLabel}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCreditAmount(tx.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
                      {formatBalance(tx.balanceAfter)}
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
