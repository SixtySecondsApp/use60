/**
 * CustomerTrackingTab
 *
 * Enhanced customers table for SaasAdminDashboard with full subscription/credit data,
 * multi-dimension filters, and default sort by trial end date (soonest first).
 */

import { useState, useMemo } from 'react';
import {
  Building2,
  Users,
  CreditCard,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Coins,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  ShieldAlert,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CustomerWithDetails,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/lib/types/saasAdmin';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerActionsMenu } from './CustomerActionsMenu';

// ============================================================================
// Status config (includes grace_period + expired from TRIAL-001)
// ============================================================================

type ExtendedStatus = SubscriptionStatus | 'none';

const statusConfig: Record<
  SubscriptionStatus,
  { label: string; icon: typeof CheckCircle; color: string; bgColor: string }
> = {
  active: {
    label: 'Active',
    icon: CheckCircle,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  trialing: {
    label: 'Trialing',
    icon: Clock,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  grace_period: {
    label: 'Grace Period',
    icon: ShieldAlert,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  past_due: {
    label: 'Past Due',
    icon: AlertCircle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  canceled: {
    label: 'Canceled',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  expired: {
    label: 'Expired',
    icon: Ban,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  paused: {
    label: 'Paused',
    icon: Pause,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
};

// ============================================================================
// Helpers
// ============================================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCredits(credits: number | null | undefined): string {
  if (credits == null) return '—';
  return credits.toFixed(1);
}

function getMrr(customer: CustomerWithDetails): number {
  const sub = customer.subscription;
  const plan = customer.plan;
  if (!sub || !plan) return 0;
  if (sub.status === 'canceled' || sub.status === 'expired') return 0;
  if (sub.billing_cycle === 'yearly') return Math.round(plan.price_yearly / 12);
  return plan.price_monthly;
}

function formatCurrency(cents: number): string {
  if (cents === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function isTrialEndingSoon(customer: CustomerWithDetails, days: number): boolean {
  const trialEnd = customer.subscription?.trial_ends_at;
  if (!trialEnd) return false;
  const now = Date.now();
  const end = new Date(trialEnd).getTime();
  return end > now && end - now <= days * 24 * 60 * 60 * 1000;
}

function getCreditLevel(balance: number | null | undefined): 'none' | 'low' | 'medium' | 'high' {
  if (balance == null) return 'none';
  if (balance === 0) return 'none';
  if (balance < 10) return 'low';
  if (balance < 50) return 'medium';
  return 'high';
}

// ============================================================================
// Sort types
// ============================================================================

type SortField = 'trial_end' | 'grace_end' | 'name' | 'plan' | 'status' | 'credits' | 'mrr';
type SortDir = 'asc' | 'desc';

function getSortValue(customer: CustomerWithDetails, field: SortField): number | string {
  switch (field) {
    case 'trial_end': {
      const v = customer.subscription?.trial_ends_at;
      return v ? new Date(v).getTime() : Infinity;
    }
    case 'grace_end': {
      const v = customer.subscription?.grace_period_ends_at;
      return v ? new Date(v).getTime() : Infinity;
    }
    case 'name':
      return customer.name.toLowerCase();
    case 'plan':
      return customer.plan?.name?.toLowerCase() ?? 'zzz';
    case 'status':
      return customer.subscription?.status ?? 'zzz';
    case 'credits':
      return customer.credit_balance?.balance_credits ?? -1;
    case 'mrr':
      return getMrr(customer);
    default:
      return 0;
  }
}

// ============================================================================
// Props
// ============================================================================

interface CustomerTrackingTabProps {
  customers: CustomerWithDetails[];
  plans: SubscriptionPlan[];
  isLoading: boolean;
  onRefresh: () => void;
  onDelete?: (orgId: string) => Promise<void>;
}

// ============================================================================
// Component
// ============================================================================

export function CustomerTrackingTab({
  customers,
  plans,
  isLoading,
  onRefresh,
  onDelete,
}: CustomerTrackingTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExtendedStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [trialEndingFilter, setTrialEndingFilter] = useState<'all' | '7' | '14' | '30'>('all');
  const [creditFilter, setCreditFilter] = useState<'all' | 'none' | 'low' | 'medium' | 'high'>('all');
  const [sortField, setSortField] = useState<SortField>('trial_end');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithDetails | null>(null);

  // Toggle sort
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // Filter + sort
  const filtered = useMemo(() => {
    let result = [...customers];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.owner_email ?? '').toLowerCase().includes(q) ||
          (c.plan?.name ?? '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => {
        const status = c.subscription?.status ?? 'none';
        return status === statusFilter;
      });
    }

    // Plan filter
    if (planFilter !== 'all') {
      result = result.filter((c) => c.plan?.id === planFilter);
    }

    // Trial ending filter
    if (trialEndingFilter !== 'all') {
      const days = parseInt(trialEndingFilter, 10);
      result = result.filter((c) => isTrialEndingSoon(c, days));
    }

    // Credit level filter
    if (creditFilter !== 'all') {
      result = result.filter(
        (c) => getCreditLevel(c.credit_balance?.balance_credits) === creditFilter
      );
    }

    // Sort
    result.sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);
      let cmp = 0;
      if (typeof va === 'string' && typeof vb === 'string') {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [customers, searchQuery, statusFilter, planFilter, trialEndingFilter, creditFilter, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  }

  function SortButton({ field, children }: { field: SortField; children: React.ReactNode }) {
    return (
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      >
        {children}
        <SortIcon field={field} />
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b border-gray-100 dark:border-gray-800"
            >
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/5" />
              </div>
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-16" />
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-20" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-24" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search org, email, plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ExtendedStatus | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="grace_period">Grace Period</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>

        {/* Plan filter */}
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Trial ending filter */}
        <Select
          value={trialEndingFilter}
          onValueChange={(v) => setTrialEndingFilter(v as typeof trialEndingFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Trial ending" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any trial end</SelectItem>
            <SelectItem value="7">Trial ending in 7d</SelectItem>
            <SelectItem value="14">Trial ending in 14d</SelectItem>
            <SelectItem value="30">Trial ending in 30d</SelectItem>
          </SelectContent>
        </Select>

        {/* Credit level filter */}
        <Select
          value={creditFilter}
          onValueChange={(v) => setCreditFilter(v as typeof creditFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Credit level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All credits</SelectItem>
            <SelectItem value="none">No credits</SelectItem>
            <SelectItem value="low">Low (&lt;10)</SelectItem>
            <SelectItem value="medium">Medium (10-50)</SelectItem>
            <SelectItem value="high">High (50+)</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {filtered.length} of {customers.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden overflow-x-auto">
        {/* Header */}
        <div className="min-w-[960px] grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_40px] gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <SortButton field="name">
            <Building2 className="w-3 h-3" />
            Organization
          </SortButton>
          <SortButton field="plan">
            <CreditCard className="w-3 h-3" />
            Plan
          </SortButton>
          <SortButton field="status">Status</SortButton>
          <SortButton field="trial_end">
            <Clock className="w-3 h-3" />
            Trial End
          </SortButton>
          <SortButton field="grace_end">Grace End</SortButton>
          <SortButton field="credits">
            <Coins className="w-3 h-3" />
            Credits
          </SortButton>
          <SortButton field="mrr">MRR</SortButton>
          <div className="flex items-center gap-1">
            <Mail className="w-3 h-3" />
            Owner
          </div>
          <div />
        </div>

        {/* Rows */}
        <div className="min-w-[960px] divide-y divide-gray-100 dark:divide-gray-800">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-500 dark:text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No customers match your filters</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setPlanFilter('all');
                  setTrialEndingFilter('all');
                  setCreditFilter('all');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            filtered.map((customer) => {
              const status = customer.subscription?.status;
              const statusInfo = status ? statusConfig[status] : null;
              const StatusIcon = statusInfo?.icon ?? Users;
              const credits = customer.credit_balance?.balance_credits ?? null;
              const creditLevel = getCreditLevel(credits);
              const mrr = getMrr(customer);

              return (
                <div
                  key={customer.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr_40px] gap-3 px-4 py-4 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  {/* Organization */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {customer.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {customer.member_count}
                      </p>
                    </div>
                  </div>

                  {/* Plan */}
                  <div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {customer.plan?.name || <span className="italic text-gray-400">None</span>}
                    </span>
                  </div>

                  {/* Status */}
                  <div>
                    {statusInfo ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          statusInfo.bgColor,
                          statusInfo.color
                        )}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </div>

                  {/* Trial End */}
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {customer.subscription?.trial_ends_at ? (
                      <span
                        className={cn(
                          isTrialEndingSoon(customer, 7) && 'text-red-600 dark:text-red-400 font-medium',
                          isTrialEndingSoon(customer, 14) && !isTrialEndingSoon(customer, 7) && 'text-amber-600 dark:text-amber-400'
                        )}
                      >
                        {formatDate(customer.subscription.trial_ends_at)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>

                  {/* Grace End */}
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {customer.subscription?.grace_period_ends_at ? (
                      <span className="text-orange-600 dark:text-orange-400">
                        {formatDate(customer.subscription.grace_period_ends_at)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>

                  {/* Credits */}
                  <div>
                    {credits !== null ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-sm font-medium',
                          creditLevel === 'none' && 'text-gray-400 dark:text-gray-500',
                          creditLevel === 'low' && 'text-red-600 dark:text-red-400',
                          creditLevel === 'medium' && 'text-amber-600 dark:text-amber-400',
                          creditLevel === 'high' && 'text-emerald-600 dark:text-emerald-400'
                        )}
                      >
                        <Coins className="w-3 h-3" />
                        {formatCredits(credits)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </div>

                  {/* MRR */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {formatCurrency(mrr)}
                  </div>

                  {/* Owner email */}
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {customer.owner_email ?? '—'}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end">
                    <CustomerActionsMenu customer={customer} onRefresh={onRefresh} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          plans={plans}
          onClose={() => setSelectedCustomer(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

export default CustomerTrackingTab;
