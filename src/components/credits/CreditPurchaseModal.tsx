import { useState } from 'react';
import { CreditCard, Loader2, Star, ChevronDown, ChevronUp, Zap, TrendingUp, Layers, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { purchasePack } from '@/lib/services/creditService';
import { CREDIT_PACKS, STANDARD_PACKS, getCostPerCredit, getPackPrice } from '@/lib/config/creditPacks';
import type { PackType } from '@/lib/config/creditPacks';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { cn } from '@/lib/utils';

interface CreditPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PACK_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="h-5 w-5" />,
  growth: <TrendingUp className="h-5 w-5" />,
  scale: <Layers className="h-5 w-5" />,
};

const COMPARE_ROWS = [
  { label: 'Copilot chat (per message)', feature: 'copilot_chat' },
  { label: 'Meeting summary', feature: 'meeting_summary' },
  { label: 'Apollo search', feature: 'apollo_search' },
  { label: 'Content generation', feature: 'content_generation' },
];

export default function CreditPurchaseModal({ open, onOpenChange }: CreditPurchaseModalProps) {
  const orgId = useOrgId();
  const { userData } = useUser();
  const { currencyCode, symbol } = useOrgMoney();
  const [selectedPack, setSelectedPack] = useState<PackType>('growth');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  if (!isUserAdmin(userData)) {
    return null;
  }

  const handlePurchase = async () => {
    if (!orgId) return;

    setIsRedirecting(true);
    try {
      const result = await purchasePack(orgId, selectedPack);
      window.location.href = result.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      toast.error(message);
      setIsRedirecting(false);
    }
  };

  const selectedPackData = CREDIT_PACKS[selectedPack];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Purchase Credit Pack
          </DialogTitle>
          <DialogDescription>
            Credits power all AI features. 1 credit ≈ {symbol}0.10 — choose the pack that fits your team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-7">
          {/* Pack cards */}
          {STANDARD_PACKS.map((packType) => {
            const pack = CREDIT_PACKS[packType];
            const costPerCredit = getCostPerCredit(packType);
            const { symbol, price } = getPackPrice(packType, currencyCode);
            const isSelected = selectedPack === packType;
            const isPopular = pack.popular;

            return (
              <div key={packType} className="relative">
                {isPopular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <span className="inline-flex items-center gap-1 bg-blue-500/90 dark:bg-blue-600/90 backdrop-blur-sm text-white text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                      <Star className="h-3 w-3 fill-white" />
                      Most Popular
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPack(packType)}
                  className={cn(
                    'relative w-full rounded-lg border-2 p-4 text-left transition-all',
                    'hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20',
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg',
                        isSelected ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      )}>
                        {PACK_ICONS[packType]}
                      </div>
                      <div>
                        <p className="font-semibold text-[#1E293B] dark:text-white">{pack.label}</p>
                        <p className="text-xs text-[#64748B] dark:text-gray-400">{pack.description}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-[#1E293B] dark:text-white">
                        {symbol}{price}
                      </p>
                      <p className="text-xs text-[#64748B] dark:text-gray-400">
                        {pack.credits} credits
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {symbol}{costPerCredit.toFixed(3)}/credit
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}

          {/* Compare packs toggle */}
          <button
            type="button"
            onClick={() => setShowCompare((v) => !v)}
            className="flex w-full items-center justify-between px-1 py-2 text-sm text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-white transition-colors"
          >
            <span className="font-medium">Compare pack value</span>
            {showCompare ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showCompare && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-3 py-2 font-medium text-[#64748B] dark:text-gray-400">Feature</th>
                    {STANDARD_PACKS.map((pt) => (
                      <th key={pt} className="text-center px-2 py-2 font-medium text-[#64748B] dark:text-gray-400">
                        {CREDIT_PACKS[pt].label.replace(' Pack', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-[#1E293B] dark:text-gray-300 font-medium">Credits included</td>
                    {STANDARD_PACKS.map((pt) => (
                      <td key={pt} className="text-center px-2 py-2 text-[#1E293B] dark:text-white font-semibold">
                        {CREDIT_PACKS[pt].credits}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <td className="px-3 py-2 text-[#64748B] dark:text-gray-400">Copilot chats (avg)</td>
                    {STANDARD_PACKS.map((pt) => (
                      <td key={pt} className="text-center px-2 py-2 text-[#64748B] dark:text-gray-300">
                        ~{Math.floor(CREDIT_PACKS[pt].credits / 0.8)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-[#64748B] dark:text-gray-400">Meeting summaries</td>
                    {STANDARD_PACKS.map((pt) => (
                      <td key={pt} className="text-center px-2 py-2 text-[#64748B] dark:text-gray-300">
                        ~{Math.floor(CREDIT_PACKS[pt].credits / 1.8)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <td className="px-3 py-2 text-[#64748B] dark:text-gray-400">Apollo searches</td>
                    {STANDARD_PACKS.map((pt) => (
                      <td key={pt} className="text-center px-2 py-2 text-[#64748B] dark:text-gray-300">
                        ~{Math.floor(CREDIT_PACKS[pt].credits / 0.3)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2 text-[#64748B] dark:text-gray-400">Cost per credit</td>
                    {STANDARD_PACKS.map((pt) => (
                      <td key={pt} className={cn(
                        'text-center px-2 py-2 font-medium',
                        pt === 'scale' ? 'text-green-600 dark:text-green-400' : 'text-[#64748B] dark:text-gray-300'
                      )}>
                        {symbol}{getCostPerCredit(pt).toFixed(3)}
                        {pt === 'scale' && <span className="ml-1 text-xs">(best)</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {currencyCode !== 'GBP' && (
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            <Info className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            <span>Payments are processed in GBP. Your card will be charged at your bank's exchange rate.</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-[#64748B] dark:text-gray-400">
            <span className="font-medium text-[#1E293B] dark:text-white">{selectedPackData.credits} credits</span>
            {' · '}
            <span>{getPackPrice(selectedPack, currencyCode).symbol}{getPackPrice(selectedPack, currencyCode).price} one-time</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRedirecting}>
              Cancel
            </Button>
            <Button onClick={handlePurchase} disabled={isRedirecting}>
              {isRedirecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buy for {getPackPrice(selectedPack, currencyCode).symbol}{getPackPrice(selectedPack, currencyCode).price}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
