/**
 * CreditEstimator
 *
 * Shows users what they can do with X credits.
 * Uses pack-based credit costs from creditPacks config.
 * Quick-pick: Starter (100 credits), Growth (250 credits), Scale (500 credits), My Balance.
 */

import { useState, useMemo } from 'react';
import { Calculator, MessageSquare, Users, FileText, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import {
  CREDIT_PACKS,
  ACTION_CREDIT_COSTS,
  STANDARD_PACKS,
  type PackType,
  type IntelligenceTier,
} from '@/lib/config/creditPacks';

// ─── Categories ──────────────────────────────────────────────────────────

interface EstimatorCategory {
  key: keyof typeof ACTION_CREDIT_COSTS;
  label: string;
  actionLabel: string;
  icon: typeof MessageSquare;
}

const CATEGORIES: EstimatorCategory[] = [
  { key: 'copilot_chat', label: 'Copilot Chat', actionLabel: 'message', icon: MessageSquare },
  { key: 'meeting_summary', label: 'Meeting Summary', actionLabel: 'summary', icon: Mic },
  { key: 'research_enrichment', label: 'Research', actionLabel: 'lookup', icon: Users },
  { key: 'content_generation', label: 'Content', actionLabel: 'draft', icon: FileText },
];

// ─── Quick-pick credits ───────────────────────────────────────────────────

const PACK_QUICK_PICKS: { label: string; credits: number; packType: PackType }[] = STANDARD_PACKS.map(
  (pt) => ({
    label: CREDIT_PACKS[pt].label.replace(' Pack', ''),
    credits: CREDIT_PACKS[pt].credits,
    packType: pt,
  })
);

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatActionCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}K`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return Math.floor(count).toLocaleString();
}

const TIER_COLORS: Record<IntelligenceTier, string> = {
  low: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-orange-600 dark:text-orange-400',
};

const TIER_BG: Record<IntelligenceTier, string> = {
  low: 'bg-emerald-50 dark:bg-emerald-900/20',
  medium: 'bg-amber-50 dark:bg-amber-900/20',
  high: 'bg-orange-50 dark:bg-orange-900/20',
};

const TIER_LABELS: Record<IntelligenceTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// ─── Component ────────────────────────────────────────────────────────────

export function CreditEstimator() {
  const { data: balance } = useCreditBalance();
  const [creditAmount, setCreditAmount] = useState<number>(CREDIT_PACKS.growth.credits);
  const [tier, setTier] = useState<IntelligenceTier>('medium');

  const currentBalance = Math.round((balance?.balance ?? 0) * 10) / 10;

  // Calculate actions per category at selected tier
  const estimates = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const costPerAction = ACTION_CREDIT_COSTS[cat.key][tier];
      const actions = costPerAction > 0 ? creditAmount / costPerAction : 0;
      return { category: cat, costPerAction, actions };
    });
  }, [creditAmount, tier]);

  return (
    <div className="space-y-4 px-1 py-2">
      {/* Tier selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          Intelligence tier:
        </span>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as IntelligenceTier[]).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                tier === t
                  ? cn('border-current font-medium', TIER_COLORS[t], TIER_BG[t])
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Credit amount selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600 dark:text-gray-400">With</span>
        <div className="relative">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            value={creditAmount}
            onChange={(e) => setCreditAmount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
            className="w-24 px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50 tabular-nums"
          />
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">credits, you can do approximately:</span>
      </div>

      {/* Quick picks */}
      <div className="flex gap-1.5 flex-wrap">
        {PACK_QUICK_PICKS.map(({ label, credits }) => (
          <button
            key={credits}
            onClick={() => setCreditAmount(credits)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              creditAmount === credits
                ? 'border-[#37bd7e] bg-[#37bd7e]/10 text-[#37bd7e] font-medium'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            {label} ({credits} credits)
          </button>
        ))}
        {currentBalance > 0 && !PACK_QUICK_PICKS.some((p) => p.credits === currentBalance) && (
          <button
            onClick={() => setCreditAmount(currentBalance)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md border transition-colors',
              creditAmount === currentBalance
                ? 'border-[#37bd7e] bg-[#37bd7e]/10 text-[#37bd7e] font-medium'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            My balance ({currentBalance} credits)
          </button>
        )}
      </div>

      {/* Estimate cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {estimates.map(({ category, costPerAction, actions }) => {
          const Icon = category.icon ?? Calculator;

          return (
            <div
              key={category.key}
              className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 flex flex-col"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {category.label}
                </span>
              </div>

              <div className="flex-1">
                <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {actions > 0 ? formatActionCount(actions) : '--'}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {category.actionLabel}s
                </p>
              </div>

              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                    TIER_BG[tier],
                    TIER_COLORS[tier]
                  )}
                >
                  {TIER_LABELS[tier]}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {costPerAction} credits/ea
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Estimates based on typical usage at the selected intelligence tier. Actual costs vary with input size and complexity.
      </p>
    </div>
  );
}
