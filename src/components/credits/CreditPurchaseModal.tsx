import { useState, useEffect } from 'react';
import { CreditCard, Loader2, Star, ChevronDown, ChevronUp, Zap, TrendingUp, Layers, Info, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { purchasePack } from '@/lib/services/creditService';
import { CREDIT_PACKS, getCostPerCredit, getPackPrice } from '@/lib/config/creditPacks';
import type { PackType } from '@/lib/config/creditPacks';
import { useOrgId, useOrg } from '@/lib/contexts/OrgContext';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import { cn } from '@/lib/utils';

interface CreditPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select a specific pack when opening */
  defaultPack?: PackType;
  showPopularBadge?: boolean;
  initialPack?: PackType;
}

const PACK_ICONS: Record<string, React.ReactNode> = {
  starter: <Zap className="h-6 w-6" />,
  growth: <TrendingUp className="h-6 w-6" />,
  scale: <Layers className="h-6 w-6" />,
};

const COMPARE_ROWS = [
  { label: 'Copilot chat (per message)', feature: 'copilot_chat' },
  { label: 'Meeting summary', feature: 'meeting_summary' },
  { label: 'Apollo search', feature: 'apollo_search' },
  { label: 'Content generation', feature: 'content_generation' },
];

export default function CreditPurchaseModal({ open, onOpenChange, defaultPack, showPopularBadge = true, initialPack }: CreditPurchaseModalProps) {
  const orgId = useOrgId();
  const { permissions } = useOrg();
  const { isPlatformAdmin } = useUserPermissions();
  const isAdmin = permissions.canManageSettings || permissions.canManageTeam || isPlatformAdmin;
  const { currencyCode, symbol } = useOrgMoney();
  const [selectedPack, setSelectedPack] = useState<PackType>('growth');
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Use defaultPack when provided, otherwise fall back to growth
  const packType: PackType = defaultPack && CREDIT_PACKS[defaultPack] ? defaultPack : 'growth';
  const pack = CREDIT_PACKS[packType];
  const { symbol: packSymbol, price, isApproximate } = getPackPrice(packType, currencyCode);
  const costPerCredit = getCostPerCredit(packType);

  // Reset redirecting state when modal closes
  useEffect(() => {
    if (!open) setIsRedirecting(false);
  }, [open]);

  useEffect(() => {
    if (open && initialPack) setSelectedPack(initialPack);
  }, [open, initialPack]);

  if (!isAdmin) {
    return null;
  }

  const handlePurchase = async () => {
    if (!orgId) return;

    setIsRedirecting(true);
    try {
      const result = await purchasePack(orgId, packType);
      window.location.href = result.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout';
      toast.error(message);
      setIsRedirecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Purchase Credits
          </DialogTitle>
          <DialogDescription>
            Confirm your credit pack purchase below.
          </DialogDescription>
        </DialogHeader>

        {/* Pack summary card */}
        <div className="rounded-xl border-2 border-[#37bd7e]/50 bg-[#37bd7e]/5 dark:bg-[#37bd7e]/10 p-5 mt-2">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#37bd7e]/10 text-[#37bd7e]">
              {PACK_ICONS[packType] ?? <CreditCard className="h-6 w-6" />}
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{pack.label}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{pack.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#37bd7e]/20">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#37bd7e]">{pack.credits}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">credits</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isApproximate ? '~' : ''}{symbol}{price}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">one-time</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {symbol}{costPerCredit.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">per credit</p>
            </div>
          </div>
        </div>

        {/* What you get */}
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#37bd7e] flex-shrink-0" />
            <span>{pack.credits} credits added to your balance instantly</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#37bd7e] flex-shrink-0" />
            <span>Credits never expire</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#37bd7e] flex-shrink-0" />
            <span>Secure payment via Stripe</span>
          </div>
        </div>

        {currencyCode !== 'GBP' && (
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            <Info className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
            <span>Payments are processed in GBP. Your card will be charged at your bank's exchange rate.</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRedirecting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePurchase}
            disabled={isRedirecting}
            className="flex-1 bg-[#37bd7e] hover:bg-[#2da76c] text-white"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting to Stripe...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Buy for {isApproximate ? '~' : ''}{symbol}{price}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
