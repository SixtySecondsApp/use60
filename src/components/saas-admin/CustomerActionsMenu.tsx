/**
 * CustomerActionsMenu
 *
 * Dropdown menu with platform-admin actions for a customer row:
 *   - Extend Trial (7 / 14 / 30 days)
 *   - Grant Credits (arbitrary amount + optional reason)
 */

import { useState } from 'react';
import {
  MoreHorizontal,
  Calendar,
  Coins,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { adminExtendTrial, adminGrantCredits } from '@/lib/services/saasAdminService';
import type { CustomerWithDetails } from '@/lib/types/saasAdmin';

interface CustomerActionsMenuProps {
  customer: CustomerWithDetails;
  onRefresh: () => void;
}

export function CustomerActionsMenu({ customer, onRefresh }: CustomerActionsMenuProps) {
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">
            Admin actions
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setTrialDialogOpen(true);
            }}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Extend Trial
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setCreditsDialogOpen(true);
            }}
          >
            <Coins className="w-4 h-4 mr-2" />
            Grant Credits
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ExtendTrialDialog
        customer={customer}
        open={trialDialogOpen}
        onOpenChange={setTrialDialogOpen}
        onSuccess={() => {
          setTrialDialogOpen(false);
          onRefresh();
        }}
      />

      <GrantCreditsDialog
        customer={customer}
        open={creditsDialogOpen}
        onOpenChange={setCreditsDialogOpen}
        onSuccess={() => {
          setCreditsDialogOpen(false);
          onRefresh();
        }}
      />
    </>
  );
}

// ============================================================================
// Extend Trial Dialog
// ============================================================================

interface ExtendTrialDialogProps {
  customer: CustomerWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function ExtendTrialDialog({ customer, open, onOpenChange, onSuccess }: ExtendTrialDialogProps) {
  const [days, setDays] = useState<'7' | '14' | '30'>('14');
  const [isLoading, setIsLoading] = useState(false);

  const isGracePeriod = customer.subscription?.status === 'grace_period';
  const hasSubscription = !!customer.subscription;

  async function handleSubmit() {
    if (!hasSubscription) return;

    setIsLoading(true);
    try {
      const result = await adminExtendTrial(customer.id, parseInt(days) as 7 | 14 | 30);
      const fieldLabel = result.field === 'grace_period_ends_at' ? 'grace period' : 'trial';
      const newDate = new Date(result.new_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      toast.success(
        `${customer.name}: ${fieldLabel} extended by ${result.days_added} days to ${newDate}`
      );
      onSuccess();
    } catch (error: any) {
      const msg = error?.message?.includes('Unauthorized')
        ? 'Only platform admins can extend trials'
        : error?.message || 'Failed to extend trial';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Extend Trial</DialogTitle>
          <DialogDescription>
            {isGracePeriod
              ? `Extend the grace period for ${customer.name}.`
              : `Extend the trial period for ${customer.name}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!hasSubscription && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              This customer has no subscription. Cannot extend trial.
            </p>
          )}

          {hasSubscription && (
            <>
              <div className="space-y-1.5">
                <Label>Current status</Label>
                <p className="text-sm text-muted-foreground capitalize">
                  {customer.subscription?.status ?? '—'}
                </p>
              </div>

              {isGracePeriod ? (
                <div className="space-y-1.5">
                  <Label>Grace period ends</Label>
                  <p className="text-sm text-muted-foreground">
                    {customer.subscription?.grace_period_ends_at
                      ? new Date(customer.subscription.grace_period_ends_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Trial ends</Label>
                  <p className="text-sm text-muted-foreground">
                    {customer.subscription?.trial_ends_at
                      ? new Date(customer.subscription.trial_ends_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="trial-days">Extend by</Label>
                <Select value={days} onValueChange={(v) => setDays(v as typeof days)}>
                  <SelectTrigger id="trial-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !hasSubscription}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Extending...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                Extend {isGracePeriod ? 'Grace Period' : 'Trial'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Grant Credits Dialog
// ============================================================================

interface GrantCreditsDialogProps {
  customer: CustomerWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function GrantCreditsDialog({ customer, open, onOpenChange, onSuccess }: GrantCreditsDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const parsedAmount = parseFloat(amount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  async function handleSubmit() {
    if (!isValidAmount) return;

    setIsLoading(true);
    try {
      const result = await adminGrantCredits(
        customer.id,
        parsedAmount,
        reason.trim() || undefined
      );
      toast.success(
        `Granted ${result.amount} credits to ${customer.name}. New balance: ${result.new_balance.toFixed(1)}`
      );
      onSuccess();
    } catch (error: any) {
      const msg = error?.message?.includes('Unauthorized')
        ? 'Only platform admins can grant credits'
        : error?.message || 'Failed to grant credits';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!isLoading) {
      if (!open) {
        setAmount('');
        setReason('');
      }
      onOpenChange(open);
    }
  }

  const currentBalance = customer.credit_balance?.balance_credits;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Grant Credits</DialogTitle>
          <DialogDescription>
            Add credits to {customer.name}. This creates an admin_grant transaction record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Current balance</Label>
            <p className="text-sm text-muted-foreground">
              {currentBalance != null ? `${currentBalance.toFixed(1)} credits` : '—'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-amount">Credits to grant</Label>
            <Input
              id="credit-amount"
              type="number"
              min="0.1"
              step="1"
              placeholder="e.g. 50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-reason">
              Reason{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="credit-reason"
              type="text"
              placeholder="e.g. Goodwill gesture, support ticket #123"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !isValidAmount}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Granting...
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Grant Credits
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CustomerActionsMenu;
