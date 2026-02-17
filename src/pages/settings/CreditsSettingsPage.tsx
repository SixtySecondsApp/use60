/**
 * CreditsSettingsPage — Full credits management page under Settings.
 *
 * Sections:
 *   1. Balance Overview — credit balance, auto top-up status, burn rate, runway
 *   2. Quick Top-Up — three pack buttons
 *   2b. What Can Your Credits Do?
 *   3. Pack Inventory — active packs with remaining credits
 *   4. Usage Breakdown — category bar chart (last 30 days)
 *   5. Storage Usage — storage footprint and projected monthly cost
 *   6. Spend Trend — 30-day chart
 *   7. Transaction Log — paginated, filterable
 *   8. AI Model Configuration — tier selector
 *   9. Auto Top-Up Settings (admin only)
 *   10. AR Budget Settings (admin only)
 *   11. Admin: Grant Credits (admin only)
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import SettingsPageWrapper from '@/components/SettingsPageWrapper';
import { useCreditBalance, creditKeys } from '@/lib/hooks/useCreditBalance';
import { grantCredits } from '@/lib/services/creditService';
import { useOrgId } from '@/lib/contexts/OrgContext';
import CreditPurchaseModal from '@/components/credits/CreditPurchaseModal';
import { UsageChart } from '@/components/credits/UsageChart';
import { CreditEstimator } from '@/components/credits/CreditEstimator';
import { TransactionLog } from '@/components/credits/TransactionLog';
import { SimpleModelTierSelector } from '@/components/credits/SimpleModelTierSelector';
import { PackInventory } from '@/components/credits/PackInventory';
import { StorageUsageCard } from '@/components/credits/StorageUsageCard';
import { UsageBreakdownChart } from '@/components/credits/UsageBreakdownChart';
import { AutoTopUpSettings } from '@/components/credits/AutoTopUpSettings';
import { ARBudgetSettings } from '@/components/credits/ARBudgetSettings';
import { CreditMigrationModal } from '@/components/credits/CreditMigrationModal';
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
  Package,
  HardDrive,
  RefreshCw,
  CreditCard,
  Zap,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { CREDIT_PACKS, STANDARD_PACKS } from '@/lib/config/creditPacks';

// ============================================================================
// Balance color helpers
// ============================================================================

function getStatusColor(balance: number, projectedDays: number) {
  if (balance <= 0) return 'text-red-500';
  if (projectedDays < 0) return 'text-emerald-500';
  if (projectedDays < 7) return 'text-red-500';
  if (projectedDays <= 14) return 'text-amber-500';
  return 'text-emerald-500';
}

function getStatusBg(balance: number, projectedDays: number) {
  if (balance <= 0) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  if (projectedDays < 0) return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
  if (projectedDays < 7) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  if (projectedDays <= 14) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
  return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
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
      const formatted = newBalance % 1 === 0 ? `${Math.round(newBalance)}` : newBalance.toFixed(1);
      toast.success(`Granted ${amount} credits. New balance: ${formatted} cr`);
      setGrantAmount('');
      setGrantReason('');
      queryClient.setQueryData(creditKeys.balance(orgId), (old: any) => ({
        ...(old || { dailyBurnRate: 0, projectedDaysRemaining: -1, usageByFeature: [], recentTransactions: [], lastPurchaseDate: null, autoTopUp: null, storage: null, packInventory: { activePacks: 0, totalRemaining: 0 } }),
        balance: newBalance,
      }));
      queryClient.invalidateQueries({ queryKey: creditKeys.balance(orgId) });
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant credits');
    } finally {
      setIsGranting(false);
    }
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

  const formattedBalance = balance
    ? (balance.balance % 1 === 0 ? `${Math.round(balance.balance)} credits` : `${balance.balance.toFixed(1)} credits`)
    : '-- credits';

  const formattedBurnRate = balance
    ? (balance.dailyBurnRate % 1 === 0 ? `${Math.round(balance.dailyBurnRate)} cr/day` : `${balance.dailyBurnRate.toFixed(1)} cr/day`)
    : '--';

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
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
                  {formattedBalance}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {balance.packInventory.activePacks > 0
                    ? `${balance.packInventory.activePacks} active pack${balance.packInventory.activePacks !== 1 ? 's' : ''}`
                    : 'No active packs'}
                </p>
              </div>

              {/* Auto top-up status */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Auto Top-Up
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    'w-2.5 h-2.5 rounded-full flex-shrink-0',
                    balance.autoTopUp?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                  )} />
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {balance.autoTopUp?.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {balance.autoTopUp?.enabled && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Triggers below {balance.autoTopUp.threshold} cr
                  </p>
                )}
                {!balance.autoTopUp?.enabled && isAdmin && (
                  <button
                    onClick={() => {/* navigate to auto top-up settings */}}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                  >
                    Enable
                  </button>
                )}
              </div>

              {/* Daily burn rate */}
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  Daily Burn Rate
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {formattedBurnRate}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  7-day average
                </p>
              </div>

              {/* Projected runway */}
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
                  {balance.projectedDaysRemaining < 0 ? 'no usage yet' : 'at current usage'}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* ================================================================
            Section 2: Quick Top-Up
        ================================================================ */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#37bd7e]" />
              Quick Top-Up
            </h2>
            <div className="flex flex-wrap gap-3">
              {STANDARD_PACKS.map((packType) => {
                const pack = CREDIT_PACKS[packType];
                return (
                  <Button
                    key={packType}
                    variant="outline"
                    onClick={() => setPurchaseModalOpen(true)}
                    className="hover:border-[#37bd7e] hover:text-[#37bd7e] flex items-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {pack.label} — {pack.credits} cr / £{pack.priceGBP}
                    {pack.popular && (
                      <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded-full font-medium">
                        Popular
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================
            Section 2b: What can your credits do?
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
            Section 3: Pack Inventory
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#37bd7e]" />
            Credit Pack Inventory
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <PackInventory />
          </div>
        </div>

        {/* ================================================================
            Section 4: Usage Breakdown
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#37bd7e]" />
            Usage Breakdown (Last 30 Days)
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <UsageBreakdownChart
              usageByFeature={balance?.usageByFeature ?? []}
              storageCostCredits={balance?.storage?.projectedMonthlyCostCredits}
            />
          </div>
        </div>

        {/* ================================================================
            Section 5: Storage Usage
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#37bd7e]" />
            Storage Usage
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            {balanceLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : balance?.storage ? (
              <StorageUsageCard storage={balance.storage} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                No storage data available
              </p>
            )}
          </div>
        </div>

        {/* ================================================================
            Section 6: Spend Trend
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#37bd7e]" />
            Spend Trend (30 Days)
          </h2>
          <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
            <UsageChart days={30} />
          </div>
        </div>

        {/* ================================================================
            Section 7: Transaction Log
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
            Section 8: AI Model Configuration
        ================================================================ */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#37bd7e]" />
            AI Model Configuration
          </h2>
          <SimpleModelTierSelector />
        </div>

        {/* ================================================================
            Section 9: Auto Top-Up Settings
        ================================================================ */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#37bd7e]" />
              Auto Top-Up
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <AutoTopUpSettings />
            </div>
          </div>
        )}

        {/* ================================================================
            Section 10: AR Budget Settings
        ================================================================ */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#37bd7e]" />
              Autonomous Research Budget
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <ARBudgetSettings />
            </div>
          </div>
        )}

        {/* ================================================================
            Section 11: Admin Grant Credits
        ================================================================ */}
        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#37bd7e]" />
              Admin: Grant Credits
            </h2>
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add credits directly to this organization without payment. Appears as "bonus" in the transaction log.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[120px] max-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Amount (credits)
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
      </div>

      {/* Purchase modal */}
      <CreditPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
      />

      {/* Post-migration onboarding modal (shown once per user) */}
      <CreditMigrationModal />
    </SettingsPageWrapper>
  );
}
