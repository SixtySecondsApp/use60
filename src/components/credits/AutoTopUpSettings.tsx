/**
 * AutoTopUpSettings
 *
 * Manage automatic credit top-up for an org.
 * Allows admins to: enable/disable auto top-up, select a pack tier,
 * set balance threshold, set monthly cap, view recent top-up history,
 * and see estimated monthly cost based on burn rate.
 *
 * Data source: auto_top_up_settings, auto_top_up_log
 * Service: creditService.getAutoTopUpSettings / updateAutoTopUpSettings
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { useUser } from '@/lib/hooks/useUser';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  getAutoTopUpSettings,
  updateAutoTopUpSettings,
  type AutoTopUpSettings as AutoTopUpSettingsData,
} from '@/lib/services/creditService';
import { CREDIT_PACKS, type PackType } from '@/lib/config/creditPacks';

// Only individual packs can be auto-top-up targets
const AUTO_TOPUP_PACKS: PackType[] = ['starter', 'growth', 'scale'];

interface TopUpLogEntry {
  id: string;
  triggered_at: string;
  pack_type: string;
  credits_added: number | null;
  status: 'success' | 'failed' | 'retrying' | 'capped';
  error_message: string | null;
  stripe_payment_intent_id: string | null;
}

function statusIcon(status: TopUpLogEntry['status']) {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />;
    case 'retrying':
      return <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />;
    case 'capped':
      return <AlertTriangle className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />;
    default:
      return null;
  }
}

function statusLabel(status: TopUpLogEntry['status']) {
  switch (status) {
    case 'success': return 'Succeeded';
    case 'failed': return 'Failed';
    case 'retrying': return 'Retrying';
    case 'capped': return 'Monthly cap reached';
  }
}

export function AutoTopUpSettings() {
  const orgId = useOrgId();
  const { userData } = useUser();
  const isAdmin = isUserAdmin(userData);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AutoTopUpSettingsData | null>(null);
  const [history, setHistory] = useState<TopUpLogEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Local form state
  const [enabled, setEnabled] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackType>('starter');
  const [threshold, setThreshold] = useState(10);
  const [monthlyCap, setMonthlyCap] = useState(3);

  // Burn rate for estimated monthly cost
  const [dailyBurnRate, setDailyBurnRate] = useState(0);

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [settingsData, historyResult, burnResult] = await Promise.all([
        getAutoTopUpSettings(orgId),
        supabase
          .from('auto_top_up_log')
          .select('id, triggered_at, pack_type, credits_added, status, error_message, stripe_payment_intent_id')
          .eq('org_id', orgId)
          .order('triggered_at', { ascending: false })
          .limit(5),
        supabase
          .from('credit_transactions')
          .select('amount')
          .eq('org_id', orgId)
          .eq('type', 'deduction')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (settingsData) {
        setSettings(settingsData);
        setEnabled(settingsData.enabled);
        setSelectedPack((settingsData.packType as PackType) ?? 'starter');
        setThreshold(settingsData.threshold ?? 10);
        setMonthlyCap(settingsData.monthlyCap ?? 3);
      }

      setHistory((historyResult.data ?? []) as TopUpLogEntry[]);

      // Calculate daily burn rate (credits/day over last 7 days)
      const totalLast7 = (burnResult.data ?? []).reduce(
        (sum: number, row: { amount: number | null }) => sum + Math.abs(row.amount ?? 0),
        0
      );
      setDailyBurnRate(totalLast7 / 7);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await updateAutoTopUpSettings(orgId, {
        enabled,
        packType: selectedPack,
        threshold,
        monthlyCap,
      });
      toast.success('Auto top-up settings saved');
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const pack = CREDIT_PACKS[selectedPack];
  const estimatedMonthlyTopUps = dailyBurnRate > 0 && pack
    ? Math.ceil((dailyBurnRate * 30) / pack.credits)
    : 0;
  const cappedTopUps = Math.min(estimatedMonthlyTopUps, monthlyCap);
  const estimatedMonthlyCostGBP = pack ? cappedTopUps * pack.priceGBP : 0;

  return (
    <div className="space-y-6">
      {/* Enable Toggle */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-medium text-[#1E293B] dark:text-white">
              Automatic Top-Up
            </p>
          </div>
          <p className="text-xs text-[#64748B] dark:text-gray-400">
            Automatically purchase credits when your balance runs low.
            {enabled && !settings?.paymentMethodLast4 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                Add a payment method in billing settings for charges to process.
              </span>
            )}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>

      {/* Pack Selector */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-[#1E293B] dark:text-white">Pack to Auto-Purchase</p>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {AUTO_TOPUP_PACKS.map((packType) => {
            const p = CREDIT_PACKS[packType];
            const pricePerCredit = p.credits > 0 ? ((p.priceGBP / p.credits) * 100).toFixed(1) : '—';
            const isSelected = selectedPack === packType;
            return (
              <button
                key={packType}
                type="button"
                onClick={() => setSelectedPack(packType)}
                className={cn(
                  'relative flex flex-col p-3 rounded-lg border text-left transition-colors',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                {p.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                    Most popular
                  </span>
                )}
                <span className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-[#1E293B] dark:text-white'
                )}>
                  {p.label}
                </span>
                <span className={cn(
                  'text-xs mt-0.5',
                  isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-[#64748B] dark:text-gray-400'
                )}>
                  {p.credits} credits
                </span>
                <span className={cn(
                  'text-sm font-medium mt-1',
                  isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-[#1E293B] dark:text-white'
                )}>
                  £{p.priceGBP}
                </span>
                <span className={cn(
                  'text-[11px]',
                  isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-[#94A3B8] dark:text-gray-500'
                )}>
                  {pricePerCredit}p / credit
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Threshold Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[#1E293B] dark:text-white">
            Top up when balance drops below
          </p>
          <span className="text-sm font-semibold tabular-nums text-[#1E293B] dark:text-white">
            {threshold} credits
          </span>
        </div>
        <Slider
          min={5}
          max={100}
          step={5}
          value={[threshold]}
          onValueChange={([v]) => setThreshold(v)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-[#94A3B8] dark:text-gray-500">
          <span>5 credits</span>
          <span>100 credits</span>
        </div>
      </div>

      {/* Monthly Cap Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#1E293B] dark:text-white">Monthly top-up limit</p>
            <p className="text-xs text-[#64748B] dark:text-gray-400">
              Maximum automatic purchases per calendar month
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-[#1E293B] dark:text-white">
            {monthlyCap} / month
          </span>
        </div>
        <Slider
          min={1}
          max={5}
          step={1}
          value={[monthlyCap]}
          onValueChange={([v]) => setMonthlyCap(v)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-[#94A3B8] dark:text-gray-500">
          <span>1</span>
          <span>5</span>
        </div>
      </div>

      {/* Saved Payment Method */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
        <CreditCard className="h-4 w-4 text-[#64748B] dark:text-gray-400 flex-shrink-0" />
        {settings?.paymentMethodLast4 ? (
          <p className="text-sm text-[#64748B] dark:text-gray-400">
            Card ending in <span className="font-medium text-[#1E293B] dark:text-white">{settings.paymentMethodLast4}</span>
          </p>
        ) : (
          <p className="text-sm text-[#64748B] dark:text-gray-400">
            No saved payment method. Add a card in billing settings to enable auto top-up.
          </p>
        )}
        <a
          href="/settings/billing"
          className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
        >
          Manage
        </a>
      </div>

      {/* Estimated monthly cost */}
      {dailyBurnRate > 0 && pack && (
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-[#64748B] dark:text-gray-400 mb-1">
            Estimated monthly cost based on your current burn rate
          </p>
          <p className="text-sm text-[#1E293B] dark:text-white">
            ~{cappedTopUps} top-up{cappedTopUps !== 1 ? 's' : ''} &times; £{pack.priceGBP} ={' '}
            <span className="font-semibold">£{estimatedMonthlyCostGBP}</span>
            <span className="text-xs text-[#94A3B8] ml-1">
              (capped at {monthlyCap}/month)
            </span>
          </p>
        </div>
      )}

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Settings
      </Button>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((p) => !p)}
            className="flex items-center gap-1.5 text-sm text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-white transition-colors"
          >
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Recent top-up history ({history.length})
          </button>

          {showHistory && (
            <div className="space-y-1.5">
              {history.map((entry) => {
                const packDef = CREDIT_PACKS[entry.pack_type as PackType];
                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 text-sm p-2 rounded-md border border-gray-100 dark:border-gray-800"
                  >
                    {statusIcon(entry.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#1E293B] dark:text-gray-200 font-medium truncate">
                          {packDef?.label ?? entry.pack_type}
                        </span>
                        <span className="text-xs text-[#94A3B8] dark:text-gray-500 flex-shrink-0 tabular-nums">
                          {new Date(entry.triggered_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn(
                          'text-xs',
                          entry.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' :
                          entry.status === 'failed' ? 'text-red-600 dark:text-red-400' :
                          'text-[#64748B] dark:text-gray-400'
                        )}>
                          {statusLabel(entry.status)}
                        </span>
                        {entry.credits_added !== null && entry.status === 'success' && (
                          <span className="text-xs text-[#64748B] dark:text-gray-400">
                            +{entry.credits_added} credits
                          </span>
                        )}
                      </div>
                      {entry.error_message && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">
                          {entry.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
