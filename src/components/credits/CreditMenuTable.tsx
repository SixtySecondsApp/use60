/**
 * CreditMenuTable — Pricing catalogue for credit costs, grouped by category.
 *
 * Shows all three intelligence tiers (low / medium / high) with the user's
 * current tier highlighted.  Includes FREE badges, flat-rate chips, and a
 * skeleton loading state.
 *
 * Layout order:
 *   1. Credit pack comparison cards (Signal / Insight / Intelligence) — ABOVE pricing table
 *   2. Cost by action pricing table
 *   3. Budget cap quick-set (Unlimited / Daily / Weekly)
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCreditMenu, getBudgetCap, setBudgetCap } from '@/lib/services/creditService';
import type { IntelligenceTier } from '@/lib/config/creditPacks';
import { CREDIT_PACKS, STANDARD_PACKS, getCostPerCredit, getPackPrice } from '@/lib/config/creditPacks';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  MessageSquare,
  Bot,
  Plug,
  Database,
  Sparkles,
  Loader2,
  Star,
  Zap,
  TrendingUp,
  Layers,
  Infinity,
  CalendarDays,
  CalendarRange,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import CreditPurchaseModal from '@/components/credits/CreditPurchaseModal';

// ============================================================================
// Props
// ============================================================================

interface CreditMenuTableProps {
  currentTier: IntelligenceTier;
}

// ============================================================================
// Helpers
// ============================================================================

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  ai_actions: { label: 'AI Actions', icon: MessageSquare },
  agents: { label: 'Autonomous Agents', icon: Bot },
  integrations: { label: 'Integrations & Enrichment', icon: Plug },
  enrichment: { label: 'Integrations & Enrichment', icon: Plug },
  storage: { label: 'Storage', icon: Database },
};

// Merge integrations + enrichment into one section for display
const DISPLAY_ORDER = ['ai_actions', 'agents', 'integrations', 'storage'];

function formatCost(cost: number): string {
  if (cost === 0) return 'FREE';
  return cost % 1 === 0 ? cost.toFixed(0) : cost.toFixed(1);
}

// ============================================================================
// Skeleton row
// ============================================================================

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Budget cap section
// ============================================================================

type CapType = 'unlimited' | 'daily' | 'weekly';

function BudgetCapSection() {
  const orgId = useActiveOrgId();
  const [capType, setCapType] = useState<CapType>('unlimited');
  const [capAmount, setCapAmount] = useState('');
  const [loadingCap, setLoadingCap] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current cap on mount
  useEffect(() => {
    if (!orgId) {
      setLoadingCap(false);
      return;
    }
    let mounted = true;
    getBudgetCap(orgId)
      .then((cap) => {
        if (!mounted) return;
        if (cap) {
          setCapType(cap.capType as CapType);
          setCapAmount(cap.capAmount != null ? String(cap.capAmount) : '');
        }
      })
      .catch(() => {
        // Non-fatal — keep defaults
      })
      .finally(() => {
        if (mounted) setLoadingCap(false);
      });
    return () => {
      mounted = false;
    };
  }, [orgId]);

  const handleSave = async () => {
    if (!orgId) return;
    if (capType !== 'unlimited' && !capAmount) {
      toast.error('Enter a cap amount');
      return;
    }
    setSaving(true);
    try {
      await setBudgetCap(
        orgId,
        capType,
        capType !== 'unlimited' ? Number(capAmount) : undefined
      );
      toast.success('Budget cap saved');
    } catch {
      toast.error('Failed to save budget cap');
    } finally {
      setSaving(false);
    }
  };

  if (loadingCap) {
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading budget settings…
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Zap className="w-4 h-4 text-[#37bd7e]" />
        Budget Cap
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Limit how many credits your organisation can spend per period.
      </p>

      <RadioGroup
        value={capType}
        onValueChange={(v) => setCapType(v as CapType)}
        className="flex flex-wrap gap-4"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="unlimited" id="cap-unlimited" />
          <Label htmlFor="cap-unlimited" className="flex items-center gap-1.5 cursor-pointer text-sm">
            <Infinity className="w-3.5 h-3.5 text-gray-400" />
            Unlimited
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="daily" id="cap-daily" />
          <Label htmlFor="cap-daily" className="flex items-center gap-1.5 cursor-pointer text-sm">
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
            Daily cap
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="weekly" id="cap-weekly" />
          <Label htmlFor="cap-weekly" className="flex items-center gap-1.5 cursor-pointer text-sm">
            <CalendarRange className="w-3.5 h-3.5 text-gray-400" />
            Weekly cap
          </Label>
        </div>
      </RadioGroup>

      {capType !== 'unlimited' && (
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-[200px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Max credits ({capType === 'daily' ? 'per day' : 'per week'})
            </label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="50"
              value={capAmount}
              onChange={(e) => setCapAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#37bd7e]/50"
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || !capAmount}
            className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Save
          </Button>
        </div>
      )}

      {capType === 'unlimited' && (
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#37bd7e] hover:bg-[#2da76c] text-white"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Save
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Pack comparison cards
// ============================================================================

const PACK_ICONS: Record<string, React.ElementType> = {
  starter: Zap,
  growth: TrendingUp,
  scale: Layers,
};

function PackComparisonCards() {
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const { currencyCode } = useOrgMoney();

  return (
    <>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#37bd7e]" />
          Credit Packs
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
          {STANDARD_PACKS.map((packType) => {
            const pack = CREDIT_PACKS[packType];
            const costPerCredit = getCostPerCredit(packType);
            const { symbol, price, isApproximate } = getPackPrice(packType, currencyCode);
            const PackIcon = PACK_ICONS[packType] ?? Zap;

            return (
              <div key={packType} className={cn('relative', pack.popular && 'z-10')}>
                {pack.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
                    <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Star className="w-2.5 h-2.5" />
                      Popular
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    'border rounded-xl p-4 flex flex-col gap-3 h-full',
                    pack.popular
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10'
                      : 'border-gray-200 dark:border-gray-800'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <PackIcon className="w-4 h-4 text-[#37bd7e]" />
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">
                      {pack.label}
                    </span>
                  </div>

                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                      {pack.credits} <span className="text-sm font-normal text-gray-500">cr</span>
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isApproximate && <span className="text-gray-400">~</span>}{symbol}{price}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      £{costPerCredit.toFixed(2)}/cr
                    </p>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                    {pack.description}
                  </p>

                  <Button
                    size="sm"
                    variant={pack.popular ? 'default' : 'outline'}
                    onClick={() => setPurchaseModalOpen(true)}
                    className={cn(
                      'w-full',
                      pack.popular && 'bg-indigo-600 hover:bg-indigo-700 text-white border-0'
                    )}
                  >
                    Buy
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CreditPurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
      />
    </>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function CreditMenuTable({ currentTier }: CreditMenuTableProps) {
  const { data: menu, isLoading, isError, refetch } = useQuery({
    queryKey: ['credit-menu'],
    queryFn: () => getCreditMenu(),
    staleTime: 5 * 60 * 1000,
  });

  const TIER_LABELS: Record<IntelligenceTier, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  return (
    <div className="space-y-6">
      {/* ── Credit Pack Comparison ──────────────────────────────────── */}
      <PackComparisonCards />

      {/* ── Pricing Table ──────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#37bd7e]" />
          Credit Costs by Action
        </h3>

        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-center">Low</TableHead>
                  <TableHead className="text-center">Medium</TableHead>
                  <TableHead className="text-center">High</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </TableBody>
            </Table>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Unable to load pricing data
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          ) : !menu ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Unable to load pricing data
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <Loader2 className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {DISPLAY_ORDER.map((categoryKey) => {
                // Merge integrations + enrichment
                const items =
                  categoryKey === 'integrations'
                    ? [...(menu.integrations ?? []), ...(menu.enrichment ?? [])]
                    : menu[categoryKey] ?? [];

                if (items.length === 0) return null;

                const cfg = CATEGORY_CONFIG[categoryKey] ?? {
                  label: categoryKey,
                  icon: Sparkles,
                };
                const CategoryIcon = cfg.icon;

                return (
                  <div key={categoryKey}>
                    {/* Section header */}
                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 flex items-center gap-2">
                      <CategoryIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        {cfg.label}
                      </span>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-100 dark:border-gray-800">
                          <TableHead className="w-[40%]">Action</TableHead>
                          {(['low', 'medium', 'high'] as IntelligenceTier[]).map((tier) => (
                            <TableHead
                              key={tier}
                              className={cn(
                                'text-center w-[14%]',
                                currentTier === tier &&
                                  'text-indigo-600 dark:text-indigo-400 font-semibold'
                              )}
                            >
                              {TIER_LABELS[tier]}
                              {currentTier === tier && (
                                <span className="ml-1 text-[9px] font-medium text-indigo-500 dark:text-indigo-400">
                                  (you)
                                </span>
                              )}
                            </TableHead>
                          ))}
                          <TableHead className="w-[18%]">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow
                            key={item.action_id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/40"
                          >
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm text-gray-800 dark:text-gray-200">
                                  {item.display_name}
                                </span>
                                {item.free_with_sub && (
                                  <Badge
                                    variant="default"
                                    className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0"
                                  >
                                    FREE
                                  </Badge>
                                )}
                                {item.is_flat_rate && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 text-gray-500 dark:text-gray-400"
                                  >
                                    Flat rate
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">
                                  {item.description}
                                </p>
                              )}
                            </TableCell>

                            {(['low', 'medium', 'high'] as IntelligenceTier[]).map((tier) => {
                              const cost = item[`cost_${tier}` as keyof typeof item] as number;
                              const isCurrentTier = currentTier === tier;
                              return (
                                <TableCell
                                  key={tier}
                                  className={cn(
                                    'text-center text-sm tabular-nums font-medium',
                                    cost === 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-gray-700 dark:text-gray-300',
                                    isCurrentTier &&
                                      'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                  )}
                                >
                                  {formatCost(cost)}
                                </TableCell>
                              );
                            })}

                            <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                              {item.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!isLoading && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Costs shown in credit units. 1 credit ≈ £0.49 at Signal tier.
          </p>
        )}
      </div>

      {/* ── Budget Cap ──────────────────────────────────────────────── */}
      <BudgetCapSection />
    </div>
  );
}
