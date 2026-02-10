import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreditBalance } from '@/lib/hooks/useCreditBalance';
import { purchaseCredits } from '@/lib/services/creditService';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { cn } from '@/lib/utils';

interface CreditPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CREDIT_PACKS = [10, 25, 50, 100, 250];

export default function CreditPurchaseModal({ open, onOpenChange }: CreditPurchaseModalProps) {
  const orgId = useOrgId();
  const { userData } = useUser();
  const { data: balance } = useCreditBalance();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);

  const currentBalance = balance?.balance ?? 0;

  const effectiveAmount = selectedPack ?? (customAmount ? Number(customAmount) : 0);
  const isCustomMode = selectedPack === null && customAmount !== '';
  const customValue = Number(customAmount);
  const isCustomValid = !isCustomMode || (customValue >= 5 && customValue <= 1000);
  const canPurchase = effectiveAmount > 0 && isCustomValid && !isRedirecting;

  if (!isUserAdmin(userData)) {
    return null;
  }

  const handleSelectPack = (amount: number) => {
    setSelectedPack(amount);
    setCustomAmount('');
  };

  const handleCustomChange = (value: string) => {
    // Allow empty or numeric input
    if (value === '' || /^\d+$/.test(value)) {
      setCustomAmount(value);
      setSelectedPack(null);
    }
  };

  const handlePurchase = async () => {
    if (!orgId || !effectiveAmount) return;

    setIsRedirecting(true);
    try {
      const result = await purchaseCredits(orgId, effectiveAmount);
      window.location.href = result.url;
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
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
            Select a credit pack or enter a custom amount. 1 credit = $1.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Credit pack options */}
          <div className="grid grid-cols-3 gap-2">
            {CREDIT_PACKS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleSelectPack(amount)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-colors',
                  'hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20',
                  selectedPack === amount
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                <span className="text-lg font-semibold text-[#1E293B] dark:text-white">
                  ${amount}
                </span>
                <span className="text-xs text-[#64748B] dark:text-gray-400">
                  New bal: ${currentBalance + amount}
                </span>
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#1E293B] dark:text-gray-200">
              Custom amount
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#64748B]">$</span>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="5 - 1000"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
              />
            </div>
            {isCustomMode && !isCustomValid && (
              <p className="text-xs text-red-500">Amount must be between $5 and $1,000</p>
            )}
            {isCustomMode && isCustomValid && customValue > 0 && (
              <p className="text-xs text-[#64748B] dark:text-gray-400">
                New balance: ${currentBalance + customValue}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRedirecting}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={!canPurchase}>
            {isRedirecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>Purchase {effectiveAmount > 0 ? `$${effectiveAmount}` : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
