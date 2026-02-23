/**
 * CreditsSettingsPage — Full credits management page under Settings.
 *
 * Layout:
 *   - Pinned: Balance Overview (always visible above tabs)
 *   - Tab "Top Up": Quick Top-Up + Credit Estimator (collapsible)
 *   - Tab "Inventory": Credit Pack Inventory
 *   - Tab "Usage": Usage Breakdown + Spend Trend + Storage
 *   - Tab "Transactions": Transaction Log (full height)
 *   - Tab "Settings": Auto Top-Up (first) + AI Model Config + AR Budget + Grant Credits
 *
 * URL params:
 *   ?action=topup  — auto-opens the purchase modal
 *   ?tab=topup|usage|transactions|settings — deep-link to a tab
 */

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
import { CreditMenuTable } from '@/components/credits/CreditMenuTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  Settings,
  Receipt,
  ChevronDown,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { CREDIT_PACKS, STANDARD_PACKS, getPackPrice } from '@/lib/config/creditPacks';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';

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
// Valid tab values
// ============================================================================

const VALID_TABS = ['topup', 'inventory', 'usage', 'transactions', 'settings', 'pricing'] as const;
type TabValue = (typeof VALID_TABS)[number];

function isValidTab(value: string | null): value is TabValue {
  return VALID_TABS.includes(value as TabValue);
}

// ============================================================================
// Main page
// ============================================================================

export default function CreditsSettingsPage() {
  const orgId = useOrgId();
  const { data: balance, isLoading: balanceLoading } = useCreditBalance();
  const { currencyCode } = useOrgMoney();
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const { userData } = useUser();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive active tab from URL
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : 'topup';

  // Auto-open purchase modal from ?action=topup
  useEffect(() => {
    if (searchParams.get('action') === 'topup') {
      setPurchaseModalOpen(true);
      // Clean up the action param
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'topup') {
      next.delete('tab');
    } else {
      next.set('tab', value);
    }
    setSearchParams(next, { replace: true });
  };

  // Collapsible estimator state
  const [estimatorOpen, setEstimatorOpen] = useState(false);

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
      toast.success(`Granted ${amount} credits. New balance: ${formatted} credits`);
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
    ? (balance.dailyBurnRate % 1 === 0 ? `${Math.round(balance.dailyBurnRate)} credits/day` : `${balance.dailyBurnRate.toFixed(1)} credits/day`)
    : '--';

  return (
    <SettingsPageWrapper title="Credits & AI" description="Manage your AI credit balance and usage">
      <div className="space-y-6">

        {/* ================================================================
            Pinned: Balance Overview (always visible)
        ================================================================ */}
        {balanceLoading ? (
          <div className="flex items-center justify-center h-28">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : balance ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Current balance */}
            <div className={cn(
              'border rounded-xl p-4',
              getStatusBg(balance.balance, balance.projectedDaysRemaining)
            )}>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Balance
              </p>
              <p className={cn(
                'text-2xl font-bold tabular-nums',
                getStatusColor(balance.balance, balance.projectedDaysRemaining)
              )}>
                {formattedBalance}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {balance.packInventory.activePacks > 0
                  ? `${balance.packInventory.activePacks} active pack${balance.packInventory.activePacks !== 1 ? 's' : ''}`
                  : 'No active packs'}
              </p>
            </div>

            {/* Auto top-up status */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" />
                Auto Top-Up
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  balance.autoTopUp?.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                )} />
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {balance.autoTopUp?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {balance.autoTopUp?.enabled && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Triggers below {balance.autoTopUp.threshold} credits
                </p>
              )}
              {!balance.autoTopUp?.enabled && isAdmin && (
                <button
                  onClick={() => handleTabChange('settings')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
                >
                  Enable
                </button>
              )}
            </div>

            {/* Daily burn rate */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                Burn Rate
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {formattedBurnRate}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                7-day average
              </p>
            </div>

            {/* Projected runway */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Runway
              </p>
              <p className={cn(
                'text-2xl font-bold tabular-nums',
                getStatusColor(balance.balance, balance.projectedDaysRemaining)
              )}>
                {balance.projectedDaysRemaining < 0 || balance.projectedDaysRemaining === Infinity
                  ? '--'
                  : `${Math.round(balance.projectedDaysRemaining)}d`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {balance.projectedDaysRemaining < 0 ? 'no usage yet' : 'at current usage'}
              </p>
            </div>
          </div>
        ) : null}

        {/* ================================================================
            Tabbed Content
        ================================================================ */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="topup" className="gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Top Up
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5">
              <Receipt className="w-3.5 h-3.5" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              Pricing
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Top Up ─────────────────────────────────────────── */}
          <TabsContent value="topup" className="space-y-6 mt-4">
            {/* Quick Top-Up */}
            {isAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#37bd7e]" />
                  Quick Top-Up
                </h3>
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
                        {pack.label} — {pack.credits} credits / {(() => { const { symbol, price, isApproximate } = getPackPrice(packType, currencyCode); return `${isApproximate ? '~' : ''}${symbol}${price}`; })()}
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

            {/* Credit Estimator — collapsible */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl">
              <button
                onClick={() => setEstimatorOpen(!estimatorOpen)}
                className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors"
              >
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#37bd7e]" />
                  What Can Your Credits Do?
                </span>
                <ChevronDown className={cn(
                  'w-4 h-4 text-gray-400 transition-transform duration-200',
                  estimatorOpen && 'rotate-180'
                )} />
              </button>
              {estimatorOpen && (
                <div className="px-5 pb-5">
                  <CreditEstimator />
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Tab: Inventory ─────────────────────────────────────── */}
          <TabsContent value="inventory" className="mt-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#37bd7e]" />
                Credit Pack Inventory
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <PackInventory />
              </div>
            </div>
          </TabsContent>

          {/* ── Tab: Usage ──────────────────────────────────────────── */}
          <TabsContent value="usage" className="space-y-6 mt-4">
            {/* Usage Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#37bd7e]" />
                Usage Breakdown (Last 30 Days)
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <UsageBreakdownChart
                  usageByFeature={balance?.usageByFeature ?? []}
                  storageCostCredits={balance?.storage?.projectedMonthlyCostCredits}
                />
              </div>
            </div>

            {/* Spend Trend */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#37bd7e]" />
                Spend Trend (30 Days)
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                <UsageChart days={30} />
              </div>
            </div>

            {/* Storage Usage */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#37bd7e]" />
                Storage Usage
              </h3>
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
          </TabsContent>

          {/* ── Tab: Transactions ───────────────────────────────────── */}
          <TabsContent value="transactions" className="mt-4">
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <TransactionLog />
            </div>
          </TabsContent>

          {/* ── Tab: Settings ──────────────────────────────────────── */}
          <TabsContent value="settings" className="space-y-6 mt-4">
            {/* Auto Top-Up Settings — first so "Enable" link lands here immediately */}
            {isAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#37bd7e]" />
                  Auto Top-Up
                </h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                  <AutoTopUpSettings />
                </div>
              </div>
            )}

            {/* AI Model Configuration */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#37bd7e]" />
                AI Model Configuration
              </h3>
              <SimpleModelTierSelector />
            </div>

            {/* AR Budget Settings */}
            {isAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#37bd7e]" />
                  Autonomous Research Budget
                </h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5">
                  <ARBudgetSettings />
                </div>
              </div>
            )}

            {/* Admin Grant Credits */}
            {isAdmin && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#37bd7e]" />
                  Admin: Grant Credits
                </h3>
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
          </TabsContent>

          {/* ── Tab: Pricing ──────────────────────────────────────────── */}
          <TabsContent value="pricing" className="mt-4">
            <CreditMenuTable
              currentTier={
                (balance as any)?.intelligenceTier ?? 'medium'
              }
            />
          </TabsContent>
        </Tabs>
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
