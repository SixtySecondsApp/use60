import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Loader2,
  Sparkles,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useProductProfile, useUpdateProductProfile } from '@/lib/hooks/useProductProfiles';
import type { ProductProfileResearchData } from '@/lib/types/productProfile';
import { ProductProfileBuilderWizard } from '@/components/product-profiles/ProductProfileBuilderWizard';
import { useActiveOrgId } from '@/lib/stores/orgStore';

const CATEGORY_OPTIONS = [
  'SaaS',
  'Service',
  'Platform',
  'Hardware',
  'Consulting',
  'Other',
] as const;

export default function ProductProfileEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const orgId = useActiveOrgId();
  const { id, productId } = useParams<{ id?: string; productId?: string }>();
  const resolvedProductId = productId ?? id;
  const { data: profile, isLoading } = useProductProfile(resolvedProductId);
  const updateMutation = useUpdateProductProfile();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);

  const canSave = useMemo(() => Boolean(name.trim()), [name]);

  const sectionCount = useMemo(() => {
    if (!profile?.research_data) return { complete: 0, total: 10 };
    const rd = profile.research_data;
    const checks = [
      Boolean(rd.overview?.description || rd.overview?.tagline),
      Boolean(rd.target_market?.industries?.length || rd.target_market?.buyer_personas?.length),
      Boolean(rd.value_propositions?.primary_value_prop || rd.value_propositions?.supporting_points?.length),
      Boolean(rd.pricing?.model || rd.pricing?.tiers?.length || rd.pricing?.price_range),
      Boolean(rd.competitors?.direct_competitors?.length || rd.competitors?.indirect_competitors?.length),
      Boolean(rd.use_cases?.primary_use_cases?.length || rd.use_cases?.secondary_use_cases?.length),
      Boolean(rd.differentiators?.key_differentiators?.length || rd.differentiators?.unique_capabilities?.length),
      Boolean(rd.pain_points_solved?.pain_points?.length),
      Boolean(rd.key_features?.features?.length),
      Boolean(rd.integrations?.native_integrations?.length || rd.integrations?.platforms?.length),
    ];
    return { complete: checks.filter(Boolean).length, total: checks.length };
  }, [profile?.research_data]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? '');
    setDescription(profile.description ?? '');
    setCategory(profile.category ?? '');
    setProductUrl(profile.product_url ?? '');
  }, [profile]);

  useEffect(() => {
    const state = location.state as { startBuilder?: boolean } | null;
    if (state?.startBuilder) {
      setShowBuilder(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const handleSave = async () => {
    if (!profile || !canSave) return;
    await updateMutation.mutateAsync({
      id: profile.id,
      payload: {
        name: name.trim(),
        description: description.trim() || '',
        category: category || '',
        product_url: productUrl.trim() || '',
      },
    });
    toast.success('Profile basics saved');
    navigate(`/profiles/products/${profile.id}`);
  };

  const handleApproveBuilderDraft = async (researchData: ProductProfileResearchData) => {
    if (!profile) return;
    const existing = profile.research_data ?? ({} as ProductProfileResearchData);
    const merged: ProductProfileResearchData = {
      ...existing,
      ...researchData,
    };
    await updateMutation.mutateAsync({
      id: profile.id,
      payload: { research_data: merged, research_status: 'complete' },
      silent: true,
    });
    navigate(`/profiles/products/${profile.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-8">
        <p className="text-[#64748B]">Product profile not found.</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Edit {profile.name} — Product Profile | 60</title>
      </Helmet>
      <div className="container mx-auto max-w-5xl px-3 sm:px-4 lg:px-6 py-6 space-y-6">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-gradient-to-r from-white to-[#F8FAFC] dark:from-gray-900 dark:to-gray-900/80 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-[#1E293B] dark:text-gray-100">
                Edit Product Profile
              </h1>
              <p className="text-sm text-[#64748B] dark:text-gray-400 mt-1">
                Improve the basics and run the guided AI builder to generate the full research profile.
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {sectionCount.complete}/{sectionCount.total} sections complete
            </Badge>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${showBuilder ? '' : 'xl:grid-cols-2'} gap-6`}>
          <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
              Profile Basics
            </h2>

            <div className="space-y-2">
              <Label htmlFor="pp-name">Name</Label>
              <Input
                id="pp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-description">Description</Label>
              <Textarea
                id="pp-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Brief description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="pp-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pp-url">Product URL</Label>
              <Input
                id="pp-url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!canSave || updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save Basics'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-blue" />
              <h2 className="text-sm font-semibold text-[#1E293B] dark:text-gray-100">
                Guided AI Builder
              </h2>
            </div>

            <p className="text-xs text-[#64748B] dark:text-gray-400">
              Start a section-by-section guided flow. AI enriches content in your tone, then you review and approve.
            </p>

            {!showBuilder ? (
              <Button onClick={() => setShowBuilder(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Start Guided Builder
              </Button>
            ) : (
              <ProductProfileBuilderWizard
                profile={profile}
                organizationId={orgId ?? undefined}
                basics={{ name, description, category, productUrl }}
                onApprove={handleApproveBuilderDraft}
              />
            )}

            <div className="rounded-lg border border-[#E2E8F0] dark:border-gray-700/50 bg-[#F8FAFC] dark:bg-gray-800/30 p-3 text-xs text-[#64748B] dark:text-gray-400 flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
              Draft answers stay in memory during the flow. Only approving the draft writes `research_data`.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
