/**
 * CreditWidget — Top-bar credit balance indicator with dropdown.
 *
 * Color-coded by projected runway:
 *   green  = >14 days
 *   yellow = 7–14 days
 *   red    = <7 days
 *   pulsing red = 0 balance
 */

import { CreditCard, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';
import { CreditWidgetDropdown } from './CreditWidgetDropdown';

function getBalanceColor(balance: number, projectedDays: number) {
  if (balance <= 0) return 'text-red-500 animate-pulse';
  if (projectedDays < 0) return 'text-emerald-500'; // no usage data yet
  if (projectedDays < 7) return 'text-red-500';
  if (projectedDays <= 14) return 'text-amber-500';
  return 'text-emerald-500';
}

function getDotColor(balance: number, projectedDays: number) {
  if (balance <= 0) return 'bg-red-500 animate-pulse';
  if (projectedDays < 0) return 'bg-emerald-500'; // no usage data yet
  if (projectedDays < 7) return 'bg-red-500';
  if (projectedDays <= 14) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function CreditWidget() {
  const orgId = useOrgId();
  const { data, isLoading } = useCreditBalance();

  // Only render when the user has an org
  if (!orgId) return null;

  // Loading skeleton
  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg">
        <CreditCard className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <div className="hidden sm:block w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  const { balance, projectedDaysRemaining, autoTopUp } = data;
  const colorClass = getBalanceColor(balance, projectedDaysRemaining);
  const dotClass = getDotColor(balance, projectedDaysRemaining);

  // Format: integer if whole, one decimal otherwise, e.g. "342 cr" or "342.5 cr"
  const formattedBalance = balance % 1 === 0 ? `${Math.round(balance)} cr` : `${balance.toFixed(1)} cr`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors',
            'hover:bg-slate-100 dark:hover:bg-gray-800/50',
            colorClass
          )}
        >
          <CreditCard className="w-4 h-4" />
          <span className="hidden sm:inline text-sm font-medium tabular-nums">
            {formattedBalance}
          </span>
          <span className="sm:hidden text-sm font-medium tabular-nums">
            {formattedBalance}
          </span>
          {autoTopUp?.enabled && (
            <RefreshCw className="w-3 h-3 opacity-70 flex-shrink-0" title="Auto top-up enabled" />
          )}
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <CreditWidgetDropdown data={data} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
