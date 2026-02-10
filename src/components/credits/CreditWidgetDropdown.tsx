/**
 * CreditWidgetDropdown — Dropdown panel for the CreditWidget.
 *
 * Sections:
 *   1. Balance header with color indicator
 *   2. Stats row (burn rate + projected days)
 *   3. Usage by feature (top 5 horizontal bars)
 *   4. Recent transactions (last 5)
 *   5. Footer with Top Up + View All
 */

import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreditBalance, CreditTransaction } from '@/lib/services/creditService';
import { useDropdownMenuClose } from '@/components/ui/dropdown-menu';

interface CreditWidgetDropdownProps {
  data: CreditBalance;
}

function getBalanceDotClass(balance: number, projectedDays: number) {
  if (balance <= 0) return 'bg-red-500 animate-pulse';
  if (projectedDays < 0) return 'bg-emerald-500'; // no usage data yet
  if (projectedDays < 7) return 'bg-red-500';
  if (projectedDays <= 14) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getTransactionIcon(type: CreditTransaction['type']) {
  switch (type) {
    case 'purchase':
      return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />;
    case 'deduction':
      return <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />;
    case 'refund':
      return <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />;
    case 'bonus':
      return <Coins className="w-3.5 h-3.5 text-amber-400" />;
    default:
      return <CreditCard className="w-3.5 h-3.5 text-gray-400" />;
  }
}

function formatAmount(amount: number) {
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function CreditWidgetDropdown({ data }: CreditWidgetDropdownProps) {
  const navigate = useNavigate();
  const closeDropdown = useDropdownMenuClose();
  const { balance, dailyBurnRate, projectedDaysRemaining, usageByFeature, recentTransactions } = data;

  const dotClass = getBalanceDotClass(balance, projectedDaysRemaining);

  // Top 5 features for the bar chart
  const topFeatures = usageByFeature.slice(0, 5);
  const maxFeatureCost = topFeatures.length > 0 ? Math.max(...topFeatures.map((f) => f.totalCost)) : 1;

  // Last 5 transactions
  const recentTxns = recentTransactions.slice(0, 5);

  return (
    <div className="py-2">
      {/* Balance Header */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dotClass)} />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Credit Balance
          </span>
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-50 tabular-nums">
          ${balance.toFixed(2)}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 dark:bg-gray-700/50 mx-3" />

      {/* Stats Row */}
      <div className="flex items-center gap-4 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Burn rate:</span>
          <span className="font-medium text-gray-700 dark:text-gray-200">
            ${dailyBurnRate.toFixed(2)}/day
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {projectedDaysRemaining < 0 ? (
            <span className="font-medium text-gray-500 dark:text-gray-400">no usage yet</span>
          ) : (
            <>
              ~<span className="font-medium text-gray-700 dark:text-gray-200">
                {projectedDaysRemaining > 365 ? '365+' : projectedDaysRemaining}
              </span> days remaining
            </>
          )}
        </div>
      </div>

      {/* Usage by Feature */}
      {topFeatures.length > 0 && (
        <>
          <div className="h-px bg-gray-200 dark:bg-gray-700/50 mx-3" />
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Usage by Feature
            </div>
            <div className="space-y-1.5">
              {topFeatures.map((feature) => {
                const widthPct = maxFeatureCost > 0 ? (feature.totalCost / maxFeatureCost) * 100 : 0;
                return (
                  <div key={feature.featureKey} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-300 w-24 truncate flex-shrink-0">
                      {feature.featureName}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full transition-all"
                        style={{ width: `${Math.max(widthPct, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-12 text-right flex-shrink-0">
                      ${feature.totalCost.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Recent Transactions */}
      {recentTxns.length > 0 && (
        <>
          <div className="h-px bg-gray-200 dark:bg-gray-700/50 mx-3" />
          <div className="px-3 py-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Recent Transactions
            </div>
            <div className="space-y-1">
              {recentTxns.map((txn) => (
                <div key={txn.id} className="flex items-center gap-2 py-0.5">
                  <span className="flex-shrink-0">{getTransactionIcon(txn.type)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">
                    {txn.description || txn.type}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums flex-shrink-0',
                      txn.amount >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500 dark:text-red-400'
                    )}
                  >
                    {formatAmount(txn.amount)}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-10 text-right">
                    {timeAgo(txn.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="h-px bg-gray-200 dark:bg-gray-700/50 mx-3" />
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <button
          onClick={() => {
            closeDropdown();
            navigate('/settings/credits?action=topup');
          }}
          className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 px-3 py-1.5 rounded-md transition-colors"
        >
          Top Up Credits
        </button>
        <button
          onClick={() => {
            closeDropdown();
            navigate('/settings/credits');
          }}
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          View All
        </button>
      </div>
    </div>
  );
}
