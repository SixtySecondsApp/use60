/**
 * PackInventory — Shows the org's active credit packs with remaining credits and purchased date.
 */

import { useQuery } from '@tanstack/react-query';
import { Package, Loader2, Inbox, Gift, RotateCcw, CreditCard } from 'lucide-react';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { getPacks, type OrgCreditPack } from '@/lib/services/creditService';
import { creditKeys } from '@/lib/hooks/useCreditBalance';
import { CREDIT_PACKS } from '@/lib/config/creditPacks';
import { cn } from '@/lib/utils';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getSourceIcon(source: OrgCreditPack['source']) {
  switch (source) {
    case 'bonus':
      return <Gift className="w-4 h-4 text-amber-500" />;
    case 'auto_top_up':
      return <RotateCcw className="w-4 h-4 text-indigo-500" />;
    case 'migration':
      return <Package className="w-4 h-4 text-blue-400" />;
    default:
      return <CreditCard className="w-4 h-4 text-emerald-500" />;
  }
}

function getSourceLabel(source: OrgCreditPack['source']): string {
  switch (source) {
    case 'bonus': return 'Bonus';
    case 'auto_top_up': return 'Auto';
    case 'migration': return 'Migrated';
    default: return 'Purchased';
  }
}

export function PackInventory() {
  const orgId = useOrgId();

  const { data: packs, isLoading } = useQuery({
    queryKey: [...creditKeys.all, 'packs', orgId || ''],
    queryFn: () => getPacks(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!packs || packs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <Inbox className="w-10 h-10 mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-sm">No active credit packs</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {packs.map((pack) => {
        const packConfig = CREDIT_PACKS[pack.packType];
        const pctRemaining = pack.creditsPurchased > 0
          ? (pack.creditsRemaining / pack.creditsPurchased) * 100
          : 0;

        const barColor =
          pctRemaining > 50 ? 'bg-emerald-500' :
          pctRemaining > 20 ? 'bg-amber-500' :
          'bg-red-500';

        return (
          <div
            key={pack.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50"
          >
            {/* Source icon */}
            <div className="flex-shrink-0">
              {getSourceIcon(pack.source)}
            </div>

            {/* Pack info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {packConfig?.label ?? pack.packType}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {getSourceLabel(pack.source)}
                  </span>
                </div>
                <span className="text-xs tabular-nums text-gray-700 dark:text-gray-300 font-medium flex-shrink-0">
                  {pack.creditsRemaining % 1 === 0 ? Math.round(pack.creditsRemaining) : pack.creditsRemaining.toFixed(1)}
                  {' / '}
                  {pack.creditsPurchased % 1 === 0 ? Math.round(pack.creditsPurchased) : pack.creditsPurchased.toFixed(1)} credits
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                <div
                  className={cn('h-full rounded-full transition-all', barColor)}
                  style={{ width: `${Math.max(pctRemaining, 1)}%` }}
                />
              </div>

              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Purchased {formatDate(pack.purchasedAt)}
                {pack.expiresAt && ` · Expires ${formatDate(pack.expiresAt)}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
