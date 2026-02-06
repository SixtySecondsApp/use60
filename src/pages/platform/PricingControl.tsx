/**
 * PricingControl - Platform Admin Pricing Management
 *
 * Manages subscription plans, pricing, free tier configuration,
 * and Stripe integration for the platform.
 *
 * Access: Platform Admins only (internal + is_admin)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Settings,
  DollarSign,
  CreditCard,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  AlertCircle,
  CheckCircle,
  Zap,
  ArrowLeft,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BackToPlatform } from '@/components/platform/BackToPlatform';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useUserPermissions } from '@/contexts/UserPermissionsContext';
import {
  getSubscriptionPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from '@/lib/services/saasAdminService';
import {
  createStripeProduct,
  updateStripeProduct,
  syncFromStripe,
  validateStripeIds,
  updatePlanOrder,
  canAcceptPayments,
} from '@/lib/services/stripeSyncService';
import { createTestCheckoutSession } from '@/lib/services/subscriptionService';
import type { SubscriptionPlan, PlanFeatures, CreatePlanInput } from '@/lib/types/subscription';
import { formatCurrency } from '@/lib/types/subscription';

// Default features structure
const DEFAULT_FEATURES: PlanFeatures = {
  analytics: false,
  team_insights: false,
  api_access: false,
  custom_branding: false,
  priority_support: false,
};

export default function PricingControl() {
  const navigate = useNavigate();
  const { isPlatformAdmin } = useUserPermissions();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncingPlanId, setSyncingPlanId] = useState<string | null>(null);
  const [testingCheckoutPlanId, setTestingCheckoutPlanId] = useState<string | null>(null);

  // Load plans
  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const data = await getSubscriptionPlans();
      setPlans(data);
    } catch (error) {
      console.error('Error loading plans:', error);
      toast.error('Failed to load subscription plans');
    } finally {
      setIsLoading(false);
    }
  };

  // Access control
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
        <Button variant="outline" onClick={() => navigate('/platform')}>
          Go Back
        </Button>
      </div>
    );
  }

  const handleCreatePlan = () => {
    setEditingPlan(null);
    setIsEditorOpen(true);
  };

  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setIsEditorOpen(true);
  };

  const handleSavePlan = async (planData: Partial<CreatePlanInput>) => {
    setIsSaving(true);
    try {
      if (editingPlan) {
        // Update existing plan
        await updatePlan(editingPlan.id, planData);
        toast.success('Plan updated successfully');
      } else {
        // Create new plan
        await createPlan(planData as CreatePlanInput);
        toast.success('Plan created successfully');
      }
      setIsEditorOpen(false);
      setEditingPlan(null);
      await loadPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error('Failed to save plan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      await deletePlan(planId);
      toast.success('Plan deleted successfully');
      await loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Failed to delete plan. It may be in use by active subscriptions.');
    }
  };

  const handleTogglePublic = async (plan: SubscriptionPlan) => {
    try {
      await updatePlan(plan.id, { is_public: !plan.is_public });
      toast.success(`Plan ${plan.is_public ? 'hidden from' : 'shown on'} pricing page`);
      await loadPlans();
    } catch (error) {
      console.error('Error toggling plan visibility:', error);
      toast.error('Failed to update plan visibility');
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      await updatePlan(plan.id, { is_active: !plan.is_active });
      toast.success(`Plan ${plan.is_active ? 'deactivated' : 'activated'}`);
      await loadPlans();
    } catch (error) {
      console.error('Error toggling plan status:', error);
      toast.error('Failed to update plan status');
    }
  };

  const handleStripeCreate = async (plan: SubscriptionPlan) => {
    setSyncingPlanId(plan.id);
    try {
      const result = await createStripeProduct(plan.id);
      if (result.success) {
        toast.success('Stripe product created successfully');
        await loadPlans();
      } else {
        toast.error(result.error || 'Failed to create Stripe product');
      }
    } catch (error) {
      console.error('Error creating Stripe product:', error);
      toast.error('Failed to create Stripe product');
    } finally {
      setSyncingPlanId(null);
    }
  };

  const handleStripeSync = async (plan: SubscriptionPlan) => {
    setSyncingPlanId(plan.id);
    try {
      const result = await syncFromStripe(plan.id);
      if (result.success) {
        toast.success('Synced from Stripe successfully');
        await loadPlans();
      } else {
        toast.error(result.error || 'Failed to sync from Stripe');
      }
    } catch (error) {
      console.error('Error syncing from Stripe:', error);
      toast.error('Failed to sync from Stripe');
    } finally {
      setSyncingPlanId(null);
    }
  };

  const handleStripeUpdate = async (plan: SubscriptionPlan) => {
    setSyncingPlanId(plan.id);
    try {
      const result = await updateStripeProduct(plan.id);
      if (result.success) {
        toast.success('Stripe product updated successfully');
        await loadPlans();
      } else {
        toast.error(result.error || 'Failed to update Stripe product');
      }
    } catch (error) {
      console.error('Error updating Stripe product:', error);
      toast.error('Failed to update Stripe product');
    } finally {
      setSyncingPlanId(null);
    }
  };

  const handleTestCheckout = async (plan: SubscriptionPlan) => {
    setTestingCheckoutPlanId(plan.id);
    try {
      const result = await createTestCheckoutSession(plan.id);
      if (result.url) {
        // Open Stripe Checkout in a new tab for testing
        window.open(result.url, '_blank');
        toast.success('Test checkout opened in new tab. Use card 4242 4242 4242 4242 to test.');
      } else {
        toast.error('Failed to create test checkout session');
      }
    } catch (error) {
      console.error('Error creating test checkout:', error);
      const message = error instanceof Error ? error.message : 'Failed to create test checkout';
      toast.error(message);
    } finally {
      setTestingCheckoutPlanId(null);
    }
  };

  // Sort plans by display order
  const sortedPlans = [...plans].sort((a, b) => a.display_order - b.display_order);
  const freeTierPlan = sortedPlans.find((p) => p.is_free_tier);
  const paidPlans = sortedPlans.filter((p) => !p.is_free_tier);

  return (
    <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">
      <BackToPlatform />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/platform')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Pricing Control</h1>
            <p className="text-muted-foreground">
              Manage subscription plans, pricing, and Stripe integration
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.open('/pricing', '_blank')}>
            <Eye className="h-4 w-4 mr-2" />
            Preview Pricing Page
          </Button>
          <Button onClick={handleCreatePlan}>
            <Plus className="h-4 w-4 mr-2" />
            Add Plan
          </Button>
        </div>
      </div>

      {/* Free Tier Card */}
      {freeTierPlan && (
        <Card className="border-2 border-green-500/50 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                <CardTitle>Free Tier</CardTitle>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  {freeTierPlan.max_meetings_per_month} meetings total
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleEditPlan(freeTierPlan)}>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </Button>
            </div>
            <CardDescription>
              Users get {freeTierPlan.max_meetings_per_month} free meetings total (lifetime) before requiring a paid plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Max Users:</span>
                <span className="ml-2 font-medium">{freeTierPlan.max_users || 'Unlimited'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Retention:</span>
                <span className="ml-2 font-medium">
                  {freeTierPlan.meeting_retention_months || 'Unlimited'} month(s)
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={freeTierPlan.is_active ? 'default' : 'secondary'} className="ml-2">
                  {freeTierPlan.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Public:</span>
                <Badge variant={freeTierPlan.is_public ? 'default' : 'outline'} className="ml-2">
                  {freeTierPlan.is_public ? 'Visible' : 'Hidden'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paid Plans */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Paid Plans</h2>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : paidPlans.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No paid plans configured</p>
            <Button onClick={handleCreatePlan}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Plan
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {paidPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => handleEditPlan(plan)}
                onDelete={() => handleDeletePlan(plan.id)}
                onTogglePublic={() => handleTogglePublic(plan)}
                onToggleActive={() => handleToggleActive(plan)}
                onStripeCreate={() => handleStripeCreate(plan)}
                onStripeSync={() => handleStripeSync(plan)}
                onStripeUpdate={() => handleStripeUpdate(plan)}
                onTestCheckout={() => handleTestCheckout(plan)}
                isSyncing={syncingPlanId === plan.id}
                isTestingCheckout={testingCheckoutPlanId === plan.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Plan Editor Dialog */}
      <PlanEditorDialog
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        plan={editingPlan}
        onSave={handleSavePlan}
        isSaving={isSaving}
      />
    </div>
  );
}

// ============================================================================
// Plan Card Component
// ============================================================================

interface PlanCardProps {
  plan: SubscriptionPlan;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  onToggleActive: () => void;
  onStripeCreate: () => void;
  onStripeSync: () => void;
  onStripeUpdate: () => void;
  onTestCheckout: () => void;
  isSyncing: boolean;
  isTestingCheckout: boolean;
}

function PlanCard({
  plan,
  onEdit,
  onDelete,
  onTogglePublic,
  onToggleActive,
  onStripeCreate,
  onStripeSync,
  onStripeUpdate,
  onTestCheckout,
  isSyncing,
  isTestingCheckout,
}: PlanCardProps) {
  const hasStripe = !!plan.stripe_product_id;
  const stripeValidation = validateStripeIds(plan);
  const canTest = canAcceptPayments(plan) && !plan.is_free_tier;

  return (
    <Card className={cn(!plan.is_active && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Plan Info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{plan.name}</h3>
              {plan.badge_text && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {plan.badge_text}
                </Badge>
              )}
              <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                {plan.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant={plan.is_public ? 'outline' : 'secondary'}>
                {plan.is_public ? (
                  <><Eye className="h-3 w-3 mr-1" /> Public</>
                ) : (
                  <><EyeOff className="h-3 w-3 mr-1" /> Hidden</>
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{plan.description}</p>

            {/* Pricing */}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Monthly:</span>
                <span className="ml-1 font-medium">{formatCurrency(plan.price_monthly, plan.currency)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Yearly:</span>
                <span className="ml-1 font-medium">{formatCurrency(plan.price_yearly, plan.currency)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Meetings:</span>
                <span className="ml-1 font-medium">{plan.max_meetings_per_month || 'Unlimited'}/mo</span>
              </div>
              <div>
                <span className="text-muted-foreground">Users:</span>
                <span className="ml-1 font-medium">{plan.max_users || 'Unlimited'}</span>
              </div>
            </div>

            {/* Stripe Status */}
            <div className="flex items-center gap-2 text-xs">
              {hasStripe ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Stripe Connected</span>
                  <code className="text-muted-foreground bg-muted px-1 rounded">
                    {plan.stripe_product_id}
                  </code>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-600">No Stripe Product</span>
                </>
              )}
              {plan.stripe_sync_error && (
                <span className="text-destructive">Error: {plan.stripe_sync_error}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Settings className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Stripe Actions */}
            <div className="flex items-center gap-2">
              {!hasStripe ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onStripeCreate}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-1" />
                  )}
                  Create in Stripe
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onStripeUpdate}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onStripeSync}
                    disabled={isSyncing}
                  >
                    Sync
                  </Button>
                </>
              )}
            </div>

            {/* Test Checkout Button */}
            {canTest && (
              <Button
                variant="default"
                size="sm"
                onClick={onTestCheckout}
                disabled={isTestingCheckout}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isTestingCheckout ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-1" />
                )}
                Test Checkout
              </Button>
            )}

            {/* Toggles */}
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1 cursor-pointer">
                <Switch
                  checked={plan.is_public}
                  onCheckedChange={onTogglePublic}
                  className="scale-75"
                />
                <span>Public</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Switch
                  checked={plan.is_active}
                  onCheckedChange={onToggleActive}
                  className="scale-75"
                />
                <span>Active</span>
              </label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Plan Editor Dialog
// ============================================================================

interface PlanEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubscriptionPlan | null;
  onSave: (data: Partial<CreatePlanInput>) => Promise<void>;
  isSaving: boolean;
}

function PlanEditorDialog({ open, onOpenChange, plan, onSave, isSaving }: PlanEditorDialogProps) {
  const [formData, setFormData] = useState<Partial<CreatePlanInput>>({});
  const [features, setFeatures] = useState<PlanFeatures>(DEFAULT_FEATURES);
  const [highlightFeatures, setHighlightFeatures] = useState<string>('');

  // Initialize form when plan changes
  useEffect(() => {
    if (plan) {
      setFormData({
        name: plan.name,
        slug: plan.slug,
        description: plan.description || '',
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        currency: plan.currency,
        max_users: plan.max_users,
        max_meetings_per_month: plan.max_meetings_per_month,
        max_ai_tokens_per_month: plan.max_ai_tokens_per_month,
        max_storage_mb: plan.max_storage_mb,
        meeting_retention_months: plan.meeting_retention_months,
        included_seats: plan.included_seats,
        per_seat_price: plan.per_seat_price,
        trial_days: plan.trial_days,
        is_active: plan.is_active,
        is_default: plan.is_default,
        is_free_tier: plan.is_free_tier,
        is_public: plan.is_public,
        display_order: plan.display_order,
        badge_text: plan.badge_text,
        cta_text: plan.cta_text,
        cta_url: plan.cta_url,
        stripe_product_id: plan.stripe_product_id,
        stripe_price_id_monthly: plan.stripe_price_id_monthly,
        stripe_price_id_yearly: plan.stripe_price_id_yearly,
      });
      setFeatures(plan.features || DEFAULT_FEATURES);
      setHighlightFeatures((plan.highlight_features || []).join('\n'));
    } else {
      // Reset for new plan
      setFormData({
        name: '',
        slug: '',
        description: '',
        price_monthly: 0,
        price_yearly: 0,
        currency: 'GBP',
        max_users: 1,
        max_meetings_per_month: 100, // Default for paid plans (per month)
        trial_days: 14,
        is_active: true,
        is_public: true,
        is_free_tier: false,
        display_order: 10,
        cta_text: 'Start Free Trial',
      });
      setFeatures(DEFAULT_FEATURES);
      setHighlightFeatures('');
    }
  }, [plan, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: Partial<CreatePlanInput> = {
      ...formData,
      features,
      highlight_features: highlightFeatures.split('\n').filter((f) => f.trim()),
    };

    await onSave(data);
  };

  const updateFormData = (key: keyof CreatePlanInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFeature = (key: string) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
          <DialogDescription>
            Configure plan details, pricing, limits, and Stripe integration
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="limits">Limits</TabsTrigger>
              <TabsTrigger value="stripe">Stripe</TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Plan Name</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => updateFormData('name', e.target.value)}
                    placeholder="e.g., Pro"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={formData.slug || ''}
                    onChange={(e) => updateFormData('slug', e.target.value.toLowerCase())}
                    placeholder="e.g., pro"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => updateFormData('description', e.target.value)}
                  placeholder="Brief description of the plan"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="badge_text">Badge Text</Label>
                  <Input
                    id="badge_text"
                    value={formData.badge_text || ''}
                    onChange={(e) => updateFormData('badge_text', e.target.value || null)}
                    placeholder="e.g., Most Popular"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cta_text">CTA Button Text</Label>
                  <Input
                    id="cta_text"
                    value={formData.cta_text || ''}
                    onChange={(e) => updateFormData('cta_text', e.target.value)}
                    placeholder="e.g., Start Free Trial"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="highlight_features">Highlight Features (one per line)</Label>
                <Textarea
                  id="highlight_features"
                  value={highlightFeatures}
                  onChange={(e) => setHighlightFeatures(e.target.value)}
                  placeholder="Up to 100 meetings/month&#10;Team insights&#10;Priority support"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active || false}
                    onCheckedChange={(checked) => updateFormData('is_active', checked)}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_public"
                    checked={formData.is_public || false}
                    onCheckedChange={(checked) => updateFormData('is_public', checked)}
                  />
                  <Label htmlFor="is_public">Public</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_free_tier"
                    checked={formData.is_free_tier || false}
                    onCheckedChange={(checked) => updateFormData('is_free_tier', checked)}
                  />
                  <Label htmlFor="is_free_tier">Free Tier</Label>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2">
                <Label>Features Included</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(features).map(([key, enabled]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        id={`feature-${key}`}
                        checked={enabled}
                        onCheckedChange={() => toggleFeature(key)}
                      />
                      <Label htmlFor={`feature-${key}`} className="text-sm capitalize">
                        {key.replace(/_/g, ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Pricing Tab */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={formData.currency || 'GBP'}
                    onValueChange={(value) => updateFormData('currency', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_monthly">Monthly Price (pence)</Label>
                  <Input
                    id="price_monthly"
                    type="number"
                    value={formData.price_monthly || 0}
                    onChange={(e) => updateFormData('price_monthly', parseInt(e.target.value) || 0)}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(formData.price_monthly || 0, formData.currency || 'GBP')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_yearly">Yearly Price (pence)</Label>
                  <Input
                    id="price_yearly"
                    type="number"
                    value={formData.price_yearly || 0}
                    onChange={(e) => updateFormData('price_yearly', parseInt(e.target.value) || 0)}
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(formData.price_yearly || 0, formData.currency || 'GBP')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="included_seats">Included Seats</Label>
                  <Input
                    id="included_seats"
                    type="number"
                    value={formData.included_seats || 1}
                    onChange={(e) => updateFormData('included_seats', parseInt(e.target.value) || 1)}
                    min={1}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="per_seat_price">Per Extra Seat (pence)</Label>
                  <Input
                    id="per_seat_price"
                    type="number"
                    value={formData.per_seat_price || 0}
                    onChange={(e) => updateFormData('per_seat_price', parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trial_days">Trial Days</Label>
                  <Input
                    id="trial_days"
                    type="number"
                    value={formData.trial_days || 0}
                    onChange={(e) => updateFormData('trial_days', parseInt(e.target.value) || 0)}
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="display_order">Display Order</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order || 0}
                  onChange={(e) => updateFormData('display_order', parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
              </div>
            </TabsContent>

            {/* Limits Tab */}
            <TabsContent value="limits" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_meetings_per_month">
                    {formData.is_free_tier ? 'Max Meetings (Total/Lifetime)' : 'Max Meetings/Month'}
                  </Label>
                  <Input
                    id="max_meetings_per_month"
                    type="number"
                    value={formData.max_meetings_per_month ?? ''}
                    onChange={(e) =>
                      updateFormData(
                        'max_meetings_per_month',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="Leave empty for unlimited"
                  />
                  {formData.is_free_tier && (
                    <p className="text-xs text-muted-foreground">
                      For free tier, this is the total lifetime limit (not monthly)
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_users">Max Users</Label>
                  <Input
                    id="max_users"
                    type="number"
                    value={formData.max_users ?? ''}
                    onChange={(e) =>
                      updateFormData('max_users', e.target.value ? parseInt(e.target.value) : null)
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_ai_tokens_per_month">Max AI Tokens/Month</Label>
                  <Input
                    id="max_ai_tokens_per_month"
                    type="number"
                    value={formData.max_ai_tokens_per_month ?? ''}
                    onChange={(e) =>
                      updateFormData(
                        'max_ai_tokens_per_month',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_storage_mb">Max Storage (MB)</Label>
                  <Input
                    id="max_storage_mb"
                    type="number"
                    value={formData.max_storage_mb ?? ''}
                    onChange={(e) =>
                      updateFormData(
                        'max_storage_mb',
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    placeholder="Leave empty for unlimited"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meeting_retention_months">Meeting Retention (Months)</Label>
                <Input
                  id="meeting_retention_months"
                  type="number"
                  value={formData.meeting_retention_months ?? ''}
                  onChange={(e) =>
                    updateFormData(
                      'meeting_retention_months',
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  placeholder="Leave empty for unlimited"
                />
                <p className="text-xs text-muted-foreground">
                  How long meetings are retained before auto-deletion
                </p>
              </div>
            </TabsContent>

            {/* Stripe Tab */}
            <TabsContent value="stripe" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Enter existing Stripe IDs to link this plan, or use the "Create in Stripe" button
                after saving to auto-create.
              </p>

              <div className="space-y-2">
                <Label htmlFor="stripe_product_id">Stripe Product ID</Label>
                <Input
                  id="stripe_product_id"
                  value={formData.stripe_product_id || ''}
                  onChange={(e) => updateFormData('stripe_product_id', e.target.value || null)}
                  placeholder="prod_xxx"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stripe_price_id_monthly">Monthly Price ID</Label>
                  <Input
                    id="stripe_price_id_monthly"
                    value={formData.stripe_price_id_monthly || ''}
                    onChange={(e) =>
                      updateFormData('stripe_price_id_monthly', e.target.value || null)
                    }
                    placeholder="price_xxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripe_price_id_yearly">Yearly Price ID</Label>
                  <Input
                    id="stripe_price_id_yearly"
                    value={formData.stripe_price_id_yearly || ''}
                    onChange={(e) =>
                      updateFormData('stripe_price_id_yearly', e.target.value || null)
                    }
                    placeholder="price_xxx"
                  />
                </div>
              </div>

              {formData.stripe_product_id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `https://dashboard.stripe.com/products/${formData.stripe_product_id}`,
                      '_blank'
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Stripe
                </Button>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Plan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
