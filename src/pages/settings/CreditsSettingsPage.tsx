/**
 * CreditsSettingsPage — Full credits management page under Settings.
 *
 * Sections:
 *   1. Balance overview (balance, burn rate, projected days)
 *   2. Quick top-up (credit pack buttons -> CreditPurchaseModal)
 *   3. Usage chart (30-day spend trend)
 *   4. Usage by feature (horizontal bar chart)
 *   5. Transaction log (paginated, filterable)
 */

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useCreditBalance, creditKeys } from '@/lib/hooks/useCreditBalance';
import { getUsageBreakdown, grantCredits, type FeatureUsage } from '@/lib/services/creditService';
import { useOrgId } from '@/lib/contexts/OrgContext';
import CreditPurchaseModal from '@/components/credits/CreditPurchaseModal';
import { UsageChart } from '@/components/credits/UsageChart';
import { CreditEstimator } from '@/components/credits/CreditEstimator';
import { TransactionLog } from '@/components/credits/TransactionLog';
import { SimpleModelTierSelector } from '@/components/credits/SimpleModelTierSelector';
import {
  Loader2,
  TrendingDown,
  Clock,
  Wallet,
  Plus,
  BarChart3,
  AlertCircle,
  Brain,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';

// ============================================================================
// Balance color helpers (matching CreditWidget)
// ============================================================================

function getStatusColor(balance: number, projectedDays: number) {
  if (balance <= 0) return 'text-red-500';
  if (projectedDays < 0) return 'text-emerald-500'; // no usage data yet
  if (projectedDays < 7) return 'text-red-500';
  if (projectedDays <= 14) return 'text-amber-500';
  return 'text-emerald-500';
}

function getStatusBg(balance: number, projectedDays: number) {
  if (balance <= 0) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  if (projectedDays < 0) return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'; // no usage data yet
  if (projectedDays < 7) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  if (projectedDays <= 14) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
}

// ============================================================================
// Quick top-up packs
// ============================================================================

const QUICK_PACKS = [
  { credits: 25, label: '$25' },
  { credits: 50, label: '$50' },
  { credits: 100, label: '$100' },
  { credits: 250, label: '$250' },
];

// ============================================================================
// Feature usage bar component
// ============================================================================

function FeatureBar({ feature, maxCost }: { feature: FeatureUsage; maxCost: number }) {
  const pct = maxCost > 0 ? (feature.totalCost / maxCost) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 dark:text-gray-400 w-36 truncate flex-shrink-0" title={feature.featureName}>
        {feature.featureName}
      </span>
      <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#37bd7e] rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20 text-right tabular-nums flex-shrink-0">
        ${feature.totalCost.toFixed(2)}
      </span>
      <span className="text-[10px] text-gray-500 dark:text-gray-500 w-16 text-right tabular-nums flex-shrink-0">
        {feature.callCount} calls
      </span>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function CreditsSettingsPage() {
  const orgId = useOrgId();
  const { data: balance, isLoading: balanceLoading } = useCreditBalance();
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const queryClient = useQueryClient();

  // Admin grant credits state
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [isGranting, setIsGranting] = useState(false);

  const handleGrantCredits = async () => {
    if (!orgId) return;
    const amount = parseFloat(grantAmount);
    if (!amount || amount <= 0 || amount > 10000) {
      toast.error('Enter a valid amount between 1 and 10,000');
      return;
    }
    setIsGranting(true);
    try {
      const newBalance = await grantCredits(orgId, amount, grantReason);
      toast.success(`Granted ${amount} credits. New balance: ${newBalance.toFixed(2)}`);
      setGrantAmount('');
      setGrantReason('');
      // Optimistically update the cached balance immediately
      queryClient.setQueryData(creditKeys.balance(orgId), (old: any) => ({
        ...(old || { dailyBurnRate: 0, projectedDaysRemaining: -1, usageByFeature: [], recentTransactions: [], lastPurchaseDate: null }),
        balance: newBalance,
      }));
      // Also invalidate to get a full refresh in background
      queryClient.invalidateQueries({ queryKey: creditKeys.balance(orgId) });
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant credits');
    } finally {
      setIsGranting(false);
    }
  };

  // Feature usage breakdown
  const { data: featureUsage, isLoading: featureLoading } = useQuery<FeatureUsage[]>({
    queryKey: [...creditKeys.usage(orgId || ''), 30],
    queryFn: () => getUsageBreakdown(orgId!, 30),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const maxFeatureCost = useMemo(() => {
    if (!featureUsage || featureUsage.length === 0) return 0;
    return Math.max(...featureUsage.map((f) => f.totalCost));
  }, [featureUsage]);

  const handleQuickTopUp = () => {
    setPurchaseModalOpen(true);
  };

  if (!orgId) {
    return (
      <SettingsPageWrapper title="Credits & AI" description="Manage your AI credit balance and usage">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No organization selected</p>
          </div>
        </div>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper title="Credits & AI" description="Manage your AI credit balance and usage">
      <div className="space-y-8">
        {/* ================================================================
            Section 1: Balance Overview
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#37bd7e]" />
            Balance Overview
          </h2>

          {balanceLoading ? (
            <div className="flex items-center justify-center h-28">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : balance ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Current balance */}
              <div className={cn(
                'border rounded-xl p-5',
                getStatusBg(balance.balance, balance.projectedDaysRemaining)
              )}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Credit Balance
                </p>
                <p className={cn(
                  'text-3xl font-bold tabular-nums',
                  getStatusColor(balance.balance, balance.projectedDaysRemaining)
                )}>
                  {balance.balance.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  1 credit = $1
                </p>
              </div>

              {/* Daily burn rate */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  Daily Burn Rate
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                  ${balance.dailyBurnRate.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  per day average
                </p>
              </div>

              {/* Projected days */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Projected Runway
                </p>
                <p className={cn(
                  'text-3xl font-bold tabular-nums',
                  getStatusColor(balance.balance, balance.projectedDaysRemaining)
                )}>
                  {balance.projectedDaysRemaining < 0 || balance.projectedDaysRemaining === Infinity
                    ? '--'
                    : `${Math.round(balance.projectedDaysRemaining)}d`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {balance.projectedDaysRemaining < 0
                    ? 'no usage yet'
                    : 'at current usage'}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* ================================================================
            Section 1b: Credit Estimator
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#37bd7e]" />
            What Can Your Credits Do?
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <CreditEstimator />
          </div>
        </div>

        {/* ================================================================
            Section 2: Quick Top-Up
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#37bd7e]" />
            Quick Top-Up
          </h2>
          <div className="flex flex-wrap gap-3">
            {QUICK_PACKS.map((pack) => (
              <Button
                key={pack.credits}
                variant="outline"
                onClick={handleQuickTopUp}
                className="hover:border-[#37bd7e] hover:text-[#37bd7e]"
              >
                {pack.label} ({pack.credits} credits)
              </Button>
            ))}
          </div>
        </div>

        {/* ================================================================
            Section 2b: Admin Grant Credits (no payment required)
        ================================================================ */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#37bd7e]" />
              Admin: Grant Credits
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add credits directly to this organization without payment. These will appear as a "bonus" in the transaction log.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[120px] max-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    placeholder="100"
                    value={grantAmount}
                    onChange={(e) => setGrantAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50"
                  />
                </div>
                <div className="flex-[2] min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Reason (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Trial bonus, testing, comp credits"
                    value={grantReason}
                    onChange={(e) => setGrantReason(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50"
                  />
                </div>
                <Button
                  onClick={handleGrantCredits}
                  disabled={isGranting || !grantAmount}
                  className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
                >
                  {isGranting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1.5" />
                  )}
                  Grant Credits
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            Section 3: Usage Chart (30 days)
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#37bd7e]" />
            Spend Trend
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <UsageChart days={30} />
          </div>
        </div>

        {/* ================================================================
            Section 4: Usage by Feature
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#37bd7e]" />
            Usage by Feature (Last 30 Days)
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            {featureLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : featureUsage && featureUsage.length > 0 ? (
              <div className="space-y-3">
                {featureUsage.slice(0, 10).map((feature) => (
                  <FeatureBar
                    key={feature.featureKey}
                    feature={feature}
                    maxCost={maxFeatureCost}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No AI feature usage in the last 30 days
              </p>
            )}
          </div>
        </div>

        {/* ================================================================
            Section 5: Transaction Log
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#37bd7e]" />
            Transactions
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <TransactionLog />
          </div>
        </div>

        {/* ================================================================
            Section 6: AI Model Configuration
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#37bd7e]" />
            AI Model Configuration
          </h2>
          <SimpleModelTierSelector />
        </div>
      </div>

      {/* Purchase modal */}
      <CreditPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
      />
    </SettingsPageWrapper>
  );
}
