/**
 * CouponAdmin - Platform Admin Coupon & Promotion Code Management
 *
 * Create and manage Stripe coupons, promotion codes, and discount
 * offers for subscriptions and credit packs.
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Tag,
  Percent,
  DollarSign,
  Plus,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  Calendar,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  useCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  usePromotionCodes,
  useCreatePromotionCode,
  useUpdatePromotionCode,
} from '@/lib/hooks/useCoupons';
import type {
  StripeCoupon,
  StripePromotionCode,
  CouponDiscountType,
  CouponDuration,
} from '@/lib/types/subscription';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// Helper functions
// ============================================================================

function generatePromoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function formatDiscountLabel(coupon: StripeCoupon): string {
  if (coupon.discount_type === 'percent_off') {
    return `${coupon.discount_value}% off`;
  }
  const symbol = coupon.currency === 'USD' ? '$' : coupon.currency === 'EUR' ? '\u20AC' : '\u00A3';
  return `${symbol}${(coupon.discount_value / 100).toFixed(2)} off`;
}

function formatDurationLabel(coupon: StripeCoupon): string {
  if (coupon.duration === 'once') return 'Once';
  if (coupon.duration === 'forever') return 'Forever';
  return `${coupon.duration_in_months} month${coupon.duration_in_months !== 1 ? 's' : ''}`;
}

function getCouponStatus(coupon: StripeCoupon): 'active' | 'inactive' | 'expired' {
  if (coupon.redeem_by && new Date(coupon.redeem_by) < new Date()) return 'expired';
  if (coupon.max_redemptions && coupon.times_redeemed >= coupon.max_redemptions) return 'expired';
  if (!coupon.is_active) return 'inactive';
  return 'active';
}

function getStatusBadgeClasses(status: 'active' | 'inactive' | 'expired'): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'inactive':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    case 'expired':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  }
}

// ============================================================================
// Promotion Codes Sub-table
// ============================================================================

function PromotionCodesSection({
  couponId,
  onCreateClick,
}: {
  couponId: string;
  onCreateClick: () => void;
}) {
  const { data: promoCodes, isLoading } = usePromotionCodes(couponId);
  const updatePromoCode = useUpdatePromotionCode();

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading promotion codes...</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Promotion Codes</h4>
        <Button size="sm" variant="outline" onClick={onCreateClick}>
          <Plus className="mr-1 h-3 w-3" />
          Create Code
        </Button>
      </div>

      {!promoCodes || promoCodes.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-3 text-center">
          No promotion codes yet. Create one to share a discount link.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Redemptions</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>First Time Only</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoCodes.map((pc: StripePromotionCode) => (
              <TableRow key={pc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-white dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                      {pc.code}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleCopyCode(pc.code)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={pc.is_active}
                    disabled={updatePromoCode.isPending}
                    onCheckedChange={(checked) =>
                      updatePromoCode.mutate({ promoCodeId: pc.id, isActive: checked, couponId })
                    }
                  />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {pc.times_redeemed}
                    {pc.max_redemptions ? ` / ${pc.max_redemptions}` : ''}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {pc.expires_at
                      ? new Date(pc.expires_at).toLocaleDateString()
                      : 'Never'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {pc.customer_restriction || 'Any'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {pc.first_time_only ? 'Yes' : 'No'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ============================================================================
// Create Coupon Dialog
// ============================================================================

interface CreateCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateCouponDialog({ open, onOpenChange }: CreateCouponDialogProps) {
  const createCouponMutation = useCreateCoupon();
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percent_off');
  const [discountValue, setDiscountValue] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [duration, setDuration] = useState<CouponDuration>('once');
  const [durationInMonths, setDurationInMonths] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [redeemBy, setRedeemBy] = useState('');

  function resetForm() {
    setName('');
    setDiscountType('percent_off');
    setDiscountValue('');
    setCurrency('GBP');
    setDuration('once');
    setDurationInMonths('');
    setMaxRedemptions('');
    setRedeemBy('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Coupon name is required');
      return;
    }

    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      toast.error('Discount value must be greater than 0');
      return;
    }

    if (discountType === 'percent_off' && value > 100) {
      toast.error('Percentage discount cannot exceed 100%');
      return;
    }

    if (duration === 'repeating') {
      const months = parseInt(durationInMonths);
      if (isNaN(months) || months <= 0) {
        toast.error('Duration in months is required for repeating coupons');
        return;
      }
    }

    const discountValueToSend =
      discountType === 'amount_off' ? Math.round(value * 100) : value;

    createCouponMutation.mutate(
      {
        name: name.trim(),
        discount_type: discountType,
        discount_value: discountValueToSend,
        currency: discountType === 'amount_off' ? currency : undefined,
        duration,
        duration_in_months: duration === 'repeating' ? parseInt(durationInMonths) : undefined,
        max_redemptions: maxRedemptions ? parseInt(maxRedemptions) : undefined,
        redeem_by: redeemBy || undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Coupon</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="coupon-name">Name</Label>
            <Input
              id="coupon-name"
              placeholder="e.g. Launch Discount"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Discount Type</Label>
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as CouponDiscountType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent_off">Percentage</SelectItem>
                <SelectItem value="amount_off">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount-value">
              {discountType === 'percent_off' ? 'Percentage (%)' : 'Amount'}
            </Label>
            <div className="relative">
              {discountType === 'percent_off' ? (
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              ) : (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  {currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : '\u00A3'}
                </span>
              )}
              <Input
                id="discount-value"
                type="number"
                min="0"
                step={discountType === 'percent_off' ? '1' : '0.01'}
                placeholder={discountType === 'percent_off' ? '20' : '10.00'}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {discountType === 'amount_off' && (
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP (\u00A3)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (\u20AC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={(v) => setDuration(v as CouponDuration)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Once</SelectItem>
                <SelectItem value="repeating">Repeating</SelectItem>
                <SelectItem value="forever">Forever</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {duration === 'repeating' && (
            <div className="space-y-2">
              <Label htmlFor="duration-months">Duration in Months</Label>
              <Input
                id="duration-months"
                type="number"
                min="1"
                placeholder="3"
                value={durationInMonths}
                onChange={(e) => setDurationInMonths(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="max-redemptions">Max Redemptions (optional)</Label>
            <Input
              id="max-redemptions"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="redeem-by">Redeem By (optional)</Label>
            <Input
              id="redeem-by"
              type="date"
              value={redeemBy}
              onChange={(e) => setRedeemBy(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createCouponMutation.isPending}>
            {createCouponMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Coupon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Edit Coupon Dialog
// ============================================================================

interface EditCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: StripeCoupon | null;
}

function EditCouponDialog({ open, onOpenChange, coupon }: EditCouponDialogProps) {
  const updateCouponMutation = useUpdateCoupon();
  const [name, setName] = useState('');

  // Sync form state when coupon changes or dialog opens
  useEffect(() => {
    if (open && coupon) {
      setName(coupon.name);
    }
  }, [open, coupon]);

  function handleOpenChange(isOpen: boolean) {
    onOpenChange(isOpen);
  }

  async function handleSubmit() {
    if (!coupon) return;
    if (!name.trim()) {
      toast.error('Coupon name is required');
      return;
    }

    updateCouponMutation.mutate(
      { couponId: coupon.id, updates: { name: name.trim() } },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Coupon</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-coupon-name">Name</Label>
            <Input
              id="edit-coupon-name"
              placeholder="Coupon name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Note: Only the name can be updated on an existing Stripe coupon.
            To change the discount or duration, create a new coupon.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={updateCouponMutation.isPending}>
            {updateCouponMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Create Promotion Code Dialog
// ============================================================================

interface CreatePromoCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  couponId: string;
}

function CreatePromoCodeDialog({ open, onOpenChange, couponId }: CreatePromoCodeDialogProps) {
  const createPromoCodeMutation = useCreatePromotionCode();
  const [code, setCode] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [firstTimeOnly, setFirstTimeOnly] = useState(false);
  const [minimumAmount, setMinimumAmount] = useState('');
  const [minimumCurrency, setMinimumCurrency] = useState('GBP');

  function resetForm() {
    setCode('');
    setMaxRedemptions('');
    setExpiresAt('');
    setCustomerEmail('');
    setFirstTimeOnly(false);
    setMinimumAmount('');
    setMinimumCurrency('GBP');
  }

  async function handleSubmit() {
    if (!code.trim()) {
      toast.error('Promotion code is required');
      return;
    }

    createPromoCodeMutation.mutate(
      {
        coupon_id: couponId,
        code: code.trim().toUpperCase(),
        max_redemptions: maxRedemptions ? parseInt(maxRedemptions) : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        first_time_only: firstTimeOnly,
        minimum_amount_cents: minimumAmount ? Math.round(parseFloat(minimumAmount) * 100) : undefined,
        minimum_amount_currency: minimumAmount ? minimumCurrency : undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Promotion Code</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="promo-code">Code</Label>
            <div className="flex gap-2">
              <Input
                id="promo-code"
                placeholder="e.g. LAUNCH20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCode(generatePromoCode())}
                className="whitespace-nowrap"
              >
                Auto-generate
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="promo-max-redemptions">Max Redemptions (optional)</Label>
            <Input
              id="promo-max-redemptions"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promo-expires">Expires At (optional)</Label>
            <Input
              id="promo-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promo-customer-email">Customer Email (optional)</Label>
            <Input
              id="promo-customer-email"
              type="email"
              placeholder="Restrict to a specific customer"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Leave empty to allow any customer to use this code.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="promo-first-time">First Time Customers Only</Label>
            <Switch
              id="promo-first-time"
              checked={firstTimeOnly}
              onCheckedChange={setFirstTimeOnly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promo-min-amount">Minimum Amount (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="promo-min-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={minimumAmount}
                onChange={(e) => setMinimumAmount(e.target.value)}
              />
              <Select value={minimumCurrency} onValueChange={setMinimumCurrency}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createPromoCodeMutation.isPending}>
            {createPromoCodeMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: StripeCoupon | null;
}

function DeleteCouponDialog({ open, onOpenChange, coupon }: DeleteCouponDialogProps) {
  const deleteCouponMutation = useDeleteCoupon();

  async function handleDelete() {
    if (!coupon) return;
    deleteCouponMutation.mutate(coupon.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Coupon</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete <strong>{coupon?.name}</strong>? This will also
          delete the coupon from Stripe. Existing discounts on active subscriptions will
          not be affected.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteCouponMutation.isPending}
          >
            {deleteCouponMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete Coupon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CouponAdmin() {
  const { isPlatformAdmin } = useUserPermissions();
  const { data: coupons, isLoading, error } = useCoupons();

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editCoupon, setEditCoupon] = useState<StripeCoupon | null>(null);
  const [deleteCouponTarget, setDeleteCouponTarget] = useState<StripeCoupon | null>(null);
  const [showCreatePromoDialog, setShowCreatePromoDialog] = useState(false);
  const [promoDialogCouponId, setPromoDialogCouponId] = useState('');

  // UI states
  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter coupons by search
  const filteredCoupons = useMemo(() => {
    if (!coupons) return [];
    if (!searchQuery.trim()) return coupons;
    const q = searchQuery.toLowerCase();
    return coupons.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.stripe_coupon_id.toLowerCase().includes(q)
    );
  }, [coupons, searchQuery]);

  function handleToggleExpand(couponId: string) {
    setExpandedCouponId((prev) => (prev === couponId ? null : couponId));
  }

  function handleOpenCreatePromo(couponId: string) {
    setPromoDialogCouponId(couponId);
    setShowCreatePromoDialog(true);
  }

  // Access guard
  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">
          You do not have permission to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <BackToPlatform />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Coupons & Promotions
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create and manage discount codes for subscriptions and credit packs
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Coupon
        </Button>
      </div>

      {/* Search */}
      {coupons && coupons.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search coupons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500 dark:text-gray-400">Loading coupons...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 dark:text-red-400">
              Failed to load coupons: {(error as Error).message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && coupons && coupons.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-4 mb-4">
              <Tag className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              No coupons yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Create your first coupon to start offering discounts
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Coupon
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Coupons Table */}
      {!isLoading && !error && filteredCoupons.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCoupons.map((coupon) => {
                  const status = getCouponStatus(coupon);
                  const isExpanded = expandedCouponId === coupon.id;

                  return (
                    <>
                      <TableRow
                        key={coupon.id}
                        className={cn(
                          'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                          isExpanded && 'bg-gray-50 dark:bg-gray-800/50'
                        )}
                        onClick={() => handleToggleExpand(coupon.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {coupon.name}
                            </span>
                            {coupon.promotion_code_count != null && coupon.promotion_code_count > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {coupon.promotion_code_count} code{coupon.promotion_code_count !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {coupon.discount_type === 'percent_off' ? (
                              <Percent className="mr-1 h-3 w-3" />
                            ) : (
                              <DollarSign className="mr-1 h-3 w-3" />
                            )}
                            {formatDiscountLabel(coupon)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {formatDurationLabel(coupon)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {coupon.times_redeemed}
                            {coupon.max_redemptions
                              ? ` / ${coupon.max_redemptions}`
                              : ''}
                            {!coupon.max_redemptions && (
                              <span className="text-gray-400 ml-1 text-xs">Unlimited</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs border-0', getStatusBadgeClasses(status))}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <Calendar className="h-3 w-3" />
                            {new Date(coupon.created_at).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Edit coupon"
                              onClick={() => setEditCoupon(coupon)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Delete coupon"
                              onClick={() => setDeleteCouponTarget(coupon)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded promotion codes section */}
                      {isExpanded && (
                        <TableRow key={`${coupon.id}-promo`}>
                          <TableCell colSpan={8} className="p-4">
                            <PromotionCodesSection
                              couponId={coupon.id}
                              onCreateClick={() => handleOpenCreatePromo(coupon.id)}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No search results */}
      {!isLoading &&
        !error &&
        coupons &&
        coupons.length > 0 &&
        filteredCoupons.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              No coupons match your search.
            </p>
          </div>
        )}

      {/* Dialogs */}
      <CreateCouponDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      <EditCouponDialog
        open={!!editCoupon}
        onOpenChange={(open) => {
          if (!open) setEditCoupon(null);
        }}
        coupon={editCoupon}
      />

      <DeleteCouponDialog
        open={!!deleteCouponTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteCouponTarget(null);
        }}
        coupon={deleteCouponTarget}
      />

      {showCreatePromoDialog && promoDialogCouponId && (
        <CreatePromoCodeDialog
          open={showCreatePromoDialog}
          onOpenChange={setShowCreatePromoDialog}
          couponId={promoDialogCouponId}
        />
      )}
    </div>
  );
}
