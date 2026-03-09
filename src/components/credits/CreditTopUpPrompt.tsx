/**
 * CreditTopUpPrompt — Modal shown when an AI action is blocked due to insufficient credits.
 *
 * Also exports CreditTopUpProvider + useCreditTopUp context so any component
 * (including useCreditGatedAction) can open the modal without prop-drilling.
 *
 * Usage (provider wraps app):
 *   <CreditTopUpProvider><App /></CreditTopUpProvider>
 *
 * Usage (open modal from a hook/component):
 *   const { openTopUp } = useCreditTopUp();
 *   openTopUp({ currentBalance: 2, requiredCredits: 5 });
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins,
  CreditCard,
  X,
  Loader2,
  Star,
  Zap,
  TrendingUp,
  Layers,
  Info,
} from 'lucide-react';
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
import {
  CREDIT_PACKS,
  STANDARD_PACKS,
  getCostPerCredit,
  getPackPrice,
} from '@/lib/config/creditPacks';
import type { PackType } from '@/lib/config/creditPacks';
import { useOrgId } from '@/lib/contexts/OrgContext';
import { useUser } from '@/lib/hooks/useUser';
import { useOrgMoney } from '@/lib/hooks/useOrgMoney';
import { isUserAdmin } from '@/lib/utils/adminUtils';
import { cn } from '@/lib/utils';

// ============================================================================
// Context
// ============================================================================

export interface OpenTopUpOptions {
  /** Current credit balance (shown in modal). If omitted, not displayed. */
  currentBalance?: number;
  /** Credits required for the blocked action (shown in modal). If omitted, not displayed. */
  requiredCredits?: number;
  /** Human-readable name of the blocked action (e.g. "Copilot Chat"). */
  actionName?: string;
}

interface CreditTopUpContextValue {
  openTopUp: (opts?: OpenTopUpOptions) => void;
  closeTopUp: () => void;
}

const CreditTopUpContext = createContext<CreditTopUpContextValue | null>(null);

export function useCreditTopUp(): CreditTopUpContextValue {
  const ctx = useContext(CreditTopUpContext);
  if (!ctx) {
    // Return a no-op fallback so components outside the provider don't crash.
    return {
      openTopUp: () => {},
      closeTopUp: () => {},
    };
  }
  return ctx;
}

// ============================================================================
// Pack icons (mirrors CreditPurchaseModal)
// ============================================================================

const PACK_ICONS: Record<string, ReactNode> = {
  starter: <Zap className="h-4 w-4" />,
  growth: <TrendingUp className="h-4 w-4" />,
  scale: <Layers className="h-4 w-4" />,
};

// ============================================================================
// Modal
// ============================================================================

interface CreditTopUpPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: OpenTopUpOptions;
}

function CreditTopUpPromptModal({ open, onOpenChange, options }: CreditTopUpPromptProps) {
  const orgId = useOrgId();
  const { userData } = useUser();
  const { currencyCode } = useOrgMoney();
  const navigate = useNavigate();
  const isAdmin = userData ? isUserAdmin(userData) : false;
  const [selectedPack, setSelectedPack] = useState<PackType>('growth');
  const [isRedirecting, setIsRedirecting] = useState(false);

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

  const handleViewAll = () => {
    onOpenChange(false);
    navigate('/settings/credits');
  };

  const { currentBalance, requiredCredits, actionName } = options;
  const showBalanceInfo = currentBalance !== undefined || requiredCredits !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-500" />
            You need more credits
          </DialogTitle>
          <DialogDescription>
            {actionName
              ? `"${actionName}" requires more credits than your current balance.`
              : 'You don\'t have enough credits to run this AI action.'}
          </DialogDescription>
        </DialogHeader>

        {/* Balance info */}
        {showBalanceInfo && (
          <div className="flex items-center gap-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm">
            {currentBalance !== undefined && (
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">
                  Current balance
                </p>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  {currentBalance % 1 === 0
                    ? `${Math.round(currentBalance)} credits`
                    : `${currentBalance.toFixed(1)} credits`}
                </p>
              </div>
            )}
            {currentBalance !== undefined && requiredCredits !== undefined && (
              <div className="w-px h-8 bg-amber-200 dark:bg-amber-700 flex-shrink-0" />
            )}
            {requiredCredits !== undefined && (
              <div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">
                  Required
                </p>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  {requiredCredits % 1 === 0
                    ? `${Math.round(requiredCredits)} credits`
                    : `${requiredCredits.toFixed(1)} credits`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pack options — admin only */}
        {isAdmin ? (
          <div className="space-y-2">
            {STANDARD_PACKS.map((packType) => {
              const pack = CREDIT_PACKS[packType];
              const { symbol, price } = getPackPrice(packType, currencyCode);
              const isSelected = selectedPack === packType;

              return (
                <button
                  key={packType}
                  type="button"
                  onClick={() => setSelectedPack(packType)}
                  className={cn(
                    'relative w-full rounded-lg border-2 px-4 py-3 text-left transition-all',
                    'hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20',
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  )}
                >
                  {pack.popular && (
                    <span className="absolute -top-2 right-3 inline-flex items-center gap-1 bg-blue-500/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                      <Star className="h-2.5 w-2.5 fill-white" />
                      Popular
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-md',
                          isSelected
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        )}
                      >
                        {PACK_ICONS[packType]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {pack.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {pack.credits} credits
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {symbol}{price}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {symbol}{getCostPerCredit(packType).toFixed(3)}/cr
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {currencyCode !== 'GBP' && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                <Info className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                <span>Charged in GBP at your bank's exchange rate.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
            Contact your organisation admin to add more credits.
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleViewAll}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            View all options
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRedirecting}>
              Cancel
            </Button>
            {isAdmin && (
              <Button onClick={handlePurchase} disabled={isRedirecting}>
                {isRedirecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Buy {getPackPrice(selectedPack, currencyCode).symbol}
                    {getPackPrice(selectedPack, currencyCode).price}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Provider
// ============================================================================

export function CreditTopUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenTopUpOptions>({});

  const openTopUp = useCallback((opts: OpenTopUpOptions = {}) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  const closeTopUp = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <CreditTopUpContext.Provider value={{ openTopUp, closeTopUp }}>
      {children}
      <CreditTopUpPromptModal
        open={open}
        onOpenChange={setOpen}
        options={options}
      />
    </CreditTopUpContext.Provider>
  );
}
