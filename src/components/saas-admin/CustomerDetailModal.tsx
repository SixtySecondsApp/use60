/**
 * Customer Detail Modal
 *
 * Shows detailed information about a customer and allows editing their subscription
 */

import { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  CreditCard,
  Calendar,
  Zap,
  HardDrive,
  Video,
  Save,
  AlertCircle,
  Trash2,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type {
  CustomerWithDetails,
  SubscriptionPlan,
  SubscriptionStatus,
  BillingCycle,
} from '@/lib/types/saasAdmin';
import {
  updateSubscription,
  createSubscription,
  getCustomerMembers,
  adminRemoveMember,
  adminAddMember,
  adminDeleteOrganization,
} from '@/lib/services/saasAdminService';
import type { OrganizationMembership } from '@/lib/types/saasAdmin';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/clientV2';

interface CustomerDetailModalProps {
  customer: CustomerWithDetails;
  plans: SubscriptionPlan[];
  onClose: () => void;
  onRefresh: () => void;
}

const statusOptions: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'grace_period', label: 'Grace Period' },
  { value: 'expired', label: 'Expired' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'paused', label: 'Paused' },
  { value: 'canceled', label: 'Canceled' },
];

const billingOptions: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function CustomerDetailModal({
  customer,
  plans,
  onClose,
  onRefresh,
}: CustomerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'subscription' | 'members' | 'usage'>(
    'overview'
  );
  const [members, setMembers] = useState<OrganizationMembership[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Delete org dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state for subscription editing
  const [selectedPlanId, setSelectedPlanId] = useState(customer.subscription?.plan_id || '');
  const [status, setStatus] = useState<SubscriptionStatus>(
    customer.subscription?.status || 'active'
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    customer.subscription?.billing_cycle || 'monthly'
  );
  const [customMaxUsers, setCustomMaxUsers] = useState<string>(
    customer.subscription?.custom_max_users?.toString() || ''
  );
  const [customMaxMeetings, setCustomMaxMeetings] = useState<string>(
    customer.subscription?.custom_max_meetings?.toString() || ''
  );
  const [customMaxTokens, setCustomMaxTokens] = useState<string>(
    customer.subscription?.custom_max_ai_tokens?.toString() || ''
  );
  const [adminNotes, setAdminNotes] = useState(customer.subscription?.admin_notes || '');

  // Debug: Log subscription data
  console.log('[CustomerDetailModal] Customer subscription data:', {
    customerId: customer.id,
    customerName: customer.name,
    subscription: customer.subscription,
    plan_id: customer.subscription?.plan_id,
    plan: customer.subscription?.plan,
    topLevelPlan: customer.plan,
  });

  // Sync form state when customer prop changes
  useEffect(() => {
    if (customer.subscription) {
      setSelectedPlanId(customer.subscription.plan_id || '');
      setStatus(customer.subscription.status || 'active');
      setBillingCycle(customer.subscription.billing_cycle || 'monthly');
      setCustomMaxUsers(customer.subscription.custom_max_users?.toString() || '');
      setCustomMaxMeetings(customer.subscription.custom_max_meetings?.toString() || '');
      setCustomMaxTokens(customer.subscription.custom_max_ai_tokens?.toString() || '');
      setAdminNotes(customer.subscription.admin_notes || '');
    }
  }, [customer.subscription]);

  // Fetch current user ID on mount (for self-removal guard)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // Load members when tab changes
  useEffect(() => {
    if (activeTab === 'members' && members.length === 0) {
      loadMembers();
    }
  }, [activeTab]);

  async function loadMembers() {
    setIsLoadingMembers(true);
    try {
      const data = await getCustomerMembers(customer.id);
      setMembers(data);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Failed to load members');
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function handleSaveSubscription() {
    setIsSaving(true);
    try {
      if (customer.subscription) {
        // Update existing subscription
        await updateSubscription(customer.subscription.id, {
          plan_id: selectedPlanId,
          status,
          billing_cycle: billingCycle,
          custom_max_users: customMaxUsers ? parseInt(customMaxUsers) : null,
          custom_max_meetings: customMaxMeetings ? parseInt(customMaxMeetings) : null,
          custom_max_ai_tokens: customMaxTokens ? parseInt(customMaxTokens) : null,
          admin_notes: adminNotes || undefined,
        });
        toast.success('Subscription updated');
      } else if (selectedPlanId) {
        // Create new subscription
        await createSubscription(customer.id, selectedPlanId, billingCycle);
        toast.success('Subscription created');
      }
      onRefresh();
    } catch (error) {
      console.error('Error saving subscription:', error);
      toast.error('Failed to save subscription');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteOrganization() {
    if (deleteConfirmName !== customer.name) return;
    setIsDeleting(true);
    try {
      await adminDeleteOrganization(customer.id);
      toast.success(`Organization "${customer.name}" deleted`);
      onClose();
      onRefresh();
    } catch (error) {
      console.error('Error deleting organization:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete organization');
    } finally {
      setIsDeleting(false);
    }
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {customer.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Created {new Date(customer.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          {(['overview', 'subscription', 'members', 'usage'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                activeTab === tab
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab customer={customer} />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionTab
              customer={customer}
              plans={plans}
              selectedPlanId={selectedPlanId}
              setSelectedPlanId={setSelectedPlanId}
              status={status}
              setStatus={setStatus}
              billingCycle={billingCycle}
              setBillingCycle={setBillingCycle}
              customMaxUsers={customMaxUsers}
              setCustomMaxUsers={setCustomMaxUsers}
              customMaxMeetings={customMaxMeetings}
              setCustomMaxMeetings={setCustomMaxMeetings}
              customMaxTokens={customMaxTokens}
              setCustomMaxTokens={setCustomMaxTokens}
              adminNotes={adminNotes}
              setAdminNotes={setAdminNotes}
              selectedPlan={selectedPlan}
            />
          )}

          {activeTab === 'members' && (
            <MembersTab
              members={members}
              isLoading={isLoadingMembers}
              orgId={customer.id}
              orgName={customer.name}
              currentUserId={currentUserId}
              onRefresh={loadMembers}
            />
          )}

          {activeTab === 'usage' && (
            <UsageTab customer={customer} />
          )}
        </div>

        {/* Footer - subscription save OR overview delete */}
        {activeTab === 'subscription' && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubscription} disabled={isSaving}>
              {isSaving ? (
                'Saving...'
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/20"
              onClick={() => {
                setDeleteConfirmName('');
                setShowDeleteDialog(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Organization
            </Button>
          </div>
        )}
      </div>

      {/* Delete Organization Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Delete Organization
                </h3>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  This cannot be undone
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Permanently delete <span className="font-semibold text-gray-900 dark:text-gray-100">{customer.name}</span>?
              All members, meetings, data, and the subscription will be permanently destroyed.
            </p>

            <div className="space-y-2 mb-6">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Type <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-900 dark:text-gray-100">{customer.name}</span> to confirm
              </label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={customer.name}
                className="font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteConfirmName === customer.name) {
                    handleDeleteOrganization();
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleDeleteOrganization}
                disabled={deleteConfirmName !== customer.name || isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Organization'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Overview Tab
function OverviewTab({ customer }: { customer: CustomerWithDetails }) {
  const stats = [
    {
      label: 'Members',
      value: customer.member_count,
      icon: Users,
      color: 'text-blue-500',
    },
    {
      label: 'Meetings This Month',
      value: customer.current_usage?.meetings_count || 0,
      icon: Video,
      color: 'text-emerald-500',
    },
    {
      label: 'AI Tokens Used',
      value: (customer.current_usage?.ai_tokens_used || 0).toLocaleString(),
      icon: Zap,
      color: 'text-purple-500',
    },
    {
      label: 'Storage Used',
      value: `${customer.current_usage?.storage_used_mb || 0} MB`,
      icon: HardDrive,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={cn('w-4 h-4', stat.color)} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Current Plan</h4>
        {customer.plan ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{customer.plan.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{customer.plan.description}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                ${(customer.plan.price_monthly / 100).toFixed(0)}/mo
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {customer.subscription?.billing_cycle === 'yearly' ? 'Billed annually' : 'Billed monthly'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span>No active subscription</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Subscription Tab
interface SubscriptionTabProps {
  customer: CustomerWithDetails;
  plans: SubscriptionPlan[];
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  status: SubscriptionStatus;
  setStatus: (status: SubscriptionStatus) => void;
  billingCycle: BillingCycle;
  setBillingCycle: (cycle: BillingCycle) => void;
  customMaxUsers: string;
  setCustomMaxUsers: (value: string) => void;
  customMaxMeetings: string;
  setCustomMaxMeetings: (value: string) => void;
  customMaxTokens: string;
  setCustomMaxTokens: (value: string) => void;
  adminNotes: string;
  setAdminNotes: (value: string) => void;
  selectedPlan: SubscriptionPlan | undefined;
}

function SubscriptionTab({
  customer,
  plans,
  selectedPlanId,
  setSelectedPlanId,
  status,
  setStatus,
  billingCycle,
  setBillingCycle,
  customMaxUsers,
  setCustomMaxUsers,
  customMaxMeetings,
  setCustomMaxMeetings,
  customMaxTokens,
  setCustomMaxTokens,
  adminNotes,
  setAdminNotes,
  selectedPlan,
}: SubscriptionTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Plan</Label>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.filter(p => p.is_active).map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} - ${(plan.price_monthly / 100).toFixed(0)}/mo
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as SubscriptionStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Billing Cycle</Label>
          <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as BillingCycle)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {billingOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trial / Grace Period Dates (read-only) */}
      {(customer.subscription?.trial_ends_at || customer.subscription?.grace_period_ends_at) && (
        <div className="grid grid-cols-2 gap-4">
          {customer.subscription?.trial_ends_at && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                Trial Ends
              </Label>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {new Date(customer.subscription.trial_ends_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
          {customer.subscription?.grace_period_ends_at && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                Grace Period Ends
              </Label>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {new Date(customer.subscription.grace_period_ends_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Custom Limits */}
      <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-4">
          Custom Limits (Override Plan Defaults)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Max Users</Label>
            <Input
              type="number"
              placeholder={selectedPlan?.max_users?.toString() || 'Unlimited'}
              value={customMaxUsers}
              onChange={(e) => setCustomMaxUsers(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Meetings/Month</Label>
            <Input
              type="number"
              placeholder={selectedPlan?.max_meetings_per_month?.toString() || 'Unlimited'}
              value={customMaxMeetings}
              onChange={(e) => setCustomMaxMeetings(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Max AI Tokens/Month</Label>
            <Input
              type="number"
              placeholder={selectedPlan?.max_ai_tokens_per_month?.toString() || 'Unlimited'}
              value={customMaxTokens}
              onChange={(e) => setCustomMaxTokens(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Admin Notes */}
      <div className="space-y-2">
        <Label>Admin Notes</Label>
        <textarea
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
          rows={3}
          placeholder="Internal notes about this customer..."
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
        />
      </div>
    </div>
  );
}

// Members Tab
function MembersTab({
  members,
  isLoading,
  orgId,
  orgName,
  currentUserId,
  onRefresh,
}: {
  members: OrganizationMembership[];
  isLoading: boolean;
  orgId: string;
  orgName: string;
  currentUserId: string | null;
  onRefresh: () => void;
}) {
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<'member' | 'admin' | 'owner'>('member');
  const [isAdding, setIsAdding] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<OrganizationMembership | null>(null);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setIsAdding(true);
    try {
      await adminAddMember(orgId, addEmail.trim(), addRole);
      toast.success(`${addEmail.trim()} added to ${orgName}`);
      setAddEmail('');
      setAddRole('member');
      onRefresh();
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add member');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemoveMember(member: OrganizationMembership) {
    setRemovingUserId(member.user_id);
    try {
      await adminRemoveMember(orgId, member.user_id);
      const name = member.user
        ? `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.trim() || member.user.email
        : member.user_id;
      toast.success(`${name} removed from ${orgName}`);
      setConfirmRemove(null);
      onRefresh();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove member');
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add Member Form */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-emerald-500" />
          Add Member
        </h4>
        <form onSubmit={handleAddMember} className="flex gap-2">
          <Input
            type="email"
            placeholder="user@example.com"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            className="flex-1"
            required
          />
          <Select value={addRole} onValueChange={(v) => setAddRole(v as 'member' | 'admin' | 'owner')}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isAdding || !addEmail.trim()} className="shrink-0">
            {isAdding ? 'Adding...' : 'Add'}
          </Button>
        </form>
      </div>

      {/* Members List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No members found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const isRemoving = removingUserId === member.user_id;
            const displayName =
              member.user
                ? `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.trim() || member.user.email
                : member.user_id;

            return (
              <div
                key={member.user_id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  {member.user?.avatar_url ? (
                    <img
                      src={member.user.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {member.user?.first_name?.[0]}
                        {member.user?.last_name?.[0]}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {member.user?.first_name} {member.user?.last_name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(you)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{member.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 capitalize">
                    {member.role}
                  </span>
                  {!isSelf && (
                    <button
                      onClick={() => setConfirmRemove(member)}
                      disabled={isRemoving}
                      title={`Remove ${displayName}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Remove Member
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Remove{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {confirmRemove.user
                  ? `${confirmRemove.user.first_name ?? ''} ${confirmRemove.user.last_name ?? ''}`.trim() || confirmRemove.user.email
                  : confirmRemove.user_id}
              </span>{' '}
              from <span className="font-semibold text-gray-900 dark:text-gray-100">{orgName}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmRemove(null)}
                disabled={!!removingUserId}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleRemoveMember(confirmRemove)}
                disabled={!!removingUserId}
              >
                {removingUserId ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Usage Tab
function UsageTab({ customer }: { customer: CustomerWithDetails }) {
  const usage = customer.current_usage;

  if (!usage) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No usage data available for this period</p>
      </div>
    );
  }

  const limits = {
    meetings: customer.subscription?.custom_max_meetings || customer.plan?.max_meetings_per_month,
    tokens: customer.subscription?.custom_max_ai_tokens || customer.plan?.max_ai_tokens_per_month,
    storage: customer.subscription?.custom_max_storage_mb || customer.plan?.max_storage_mb,
  };

  const usageItems = [
    {
      label: 'Meetings',
      used: usage.meetings_count,
      limit: limits.meetings,
      icon: Video,
    },
    {
      label: 'AI Tokens',
      used: usage.ai_tokens_used,
      limit: limits.tokens,
      icon: Zap,
    },
    {
      label: 'Storage (MB)',
      used: usage.storage_used_mb,
      limit: limits.storage,
      icon: HardDrive,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>
          Period: {new Date(usage.period_start).toLocaleDateString()} -{' '}
          {new Date(usage.period_end).toLocaleDateString()}
        </span>
      </div>

      {usageItems.map((item) => {
        const percentage = item.limit ? Math.min((item.used / item.limit) * 100, 100) : 0;
        const isOverLimit = item.limit && item.used > item.limit;

        return (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <item.icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {item.used.toLocaleString()} / {item.limit?.toLocaleString() || '∞'}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isOverLimit ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${item.limit ? percentage : 0}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CustomerDetailModal;
