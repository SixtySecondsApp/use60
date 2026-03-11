// src/components/billing/ActiveDiscount.tsx
// Displays active discount/coupon info on the billing settings page (SCS-005)

import { Tag, Clock, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ActiveDiscountProps {
  discountInfo: {
    stripe_discount_id?: string;
    coupon_name?: string;
    percent_off?: number | null;
    amount_off?: number | null;
    currency?: string;
    duration?: string;
    duration_in_months?: number | null;
    start?: number;
    end?: number | null;
  } | null | undefined;
}

function formatDiscountCurrency(amountCents: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function getStatusBadge(end: number | null | undefined): {
  label: string;
  className: string;
} {
  if (!end) {
    return {
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
    };
  }

  const endDate = new Date(end * 1000);
  const now = new Date();
  const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilEnd < 0) {
    return {
      label: 'Expired',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
    };
  }

  if (daysUntilEnd <= 30) {
    return {
      label: 'Expiring Soon',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
    };
  }

  return {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800',
  };
}

function getDurationLabel(
  duration: string | undefined,
  durationInMonths: number | null | undefined,
  end: number | null | undefined
): string {
  if (duration === 'once') return 'One-time';
  if (duration === 'forever') return 'Forever';

  if (duration === 'repeating' && end) {
    const endDate = new Date(end * 1000);
    const now = new Date();
    const monthsRemaining = Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30))
    );

    if (monthsRemaining <= 0) return 'Expired';
    return `${monthsRemaining} month${monthsRemaining === 1 ? '' : 's'} remaining`;
  }

  if (duration === 'repeating' && durationInMonths) {
    return `${durationInMonths} month${durationInMonths === 1 ? '' : 's'}`;
  }

  return 'Active';
}

export function ActiveDiscount({ discountInfo }: ActiveDiscountProps) {
  // Render nothing if no discount info or empty object
  if (
    !discountInfo ||
    (typeof discountInfo === 'object' && Object.keys(discountInfo).length === 0)
  ) {
    return null;
  }

  // Ensure there is actually discount data (not just an empty-ish object)
  if (!discountInfo.percent_off && !discountInfo.amount_off) {
    return null;
  }

  const discountValue = discountInfo.percent_off
    ? `${discountInfo.percent_off}% off`
    : discountInfo.amount_off
      ? `${formatDiscountCurrency(discountInfo.amount_off, discountInfo.currency)} off`
      : null;

  const durationLabel = getDurationLabel(
    discountInfo.duration,
    discountInfo.duration_in_months,
    discountInfo.end
  );

  const badge = getStatusBadge(discountInfo.end);

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Tag className="w-4 h-4 text-[#37bd7e]" />
        Active Discount
      </h3>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="space-y-2">
              {/* Coupon name */}
              {discountInfo.coupon_name && (
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {discountInfo.coupon_name}
                </p>
              )}

              {/* Discount value */}
              <div className="flex items-center gap-4">
                {discountValue && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <Percent className="w-3.5 h-3.5 text-[#37bd7e]" />
                    <span className="font-semibold">{discountValue}</span>
                  </div>
                )}

                {/* Duration */}
                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{durationLabel}</span>
                </div>
              </div>
            </div>

            {/* Status badge */}
            <span
              className={cn(
                'px-2.5 py-0.5 text-xs font-medium rounded-full flex-shrink-0',
                badge.className
              )}
            >
              {badge.label}
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
