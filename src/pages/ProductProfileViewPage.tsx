import { Helmet } from 'react-helmet-async';
import { useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ProductProfileView } from '@/components/product-profiles/ProductProfileView';
import {
  useProductProfile,
  useDeleteProductProfile,
} from '@/lib/hooks/useProductProfiles';
import { useFactProfile } from '@/lib/hooks/useFactProfiles';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useCopilot } from '@/lib/contexts/CopilotContext';

export default function ProductProfileViewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const orgId = useActiveOrgId();
  const { openCopilot } = useCopilot();
  const { id, productId } = useParams<{ id?: string; productId?: string }>();
  const resolvedProductId = productId ?? id;

  const { data: profile, isLoading } = useProductProfile(resolvedProductId);
  const { data: factProfile } = useFactProfile(profile?.fact_profile_id ?? undefined);
  const deleteMutation = useDeleteProductProfile();
  const isMostlyBlank = useMemo(() => {
    if (!profile?.research_data) return true;
    const rd = profile.research_data;
    return !(
      rd.overview?.description ||
      rd.value_propositions?.primary_value_prop ||
      rd.key_features?.features?.length ||
      rd.use_cases?.primary_use_cases?.length ||
      rd.pricing?.tiers?.length
    );
  }, [profile?.research_data]);

  const handleDelete = () => {
    if (!profile || !orgId) return;

    deleteMutation.mutate(
      {
        id: profile.id,
        orgId,
        name: profile.name,
        factProfileId: profile.fact_profile_id,
      },
      {
        onSuccess: () => {
          navigate('/profiles');
        },
      },
    );
  };

  const handleEdit = () => {
    navigate(`${location.pathname.replace(/\/$/, '')}/edit`);
  };

  const handleCreateICP = () => {
    if (!profile) return;

    navigate('/profiles?tab=icps', {
      state: {
        prefillCriteria: {},
        fromFactProfileId: profile.fact_profile_id,
        fromFactProfileName: factProfile?.company_name,
        fromProductProfileId: profile.id,
        fromProductProfileName: profile.name,
      },
    });
    toast.success('Opened ICP tab with product profile context');
  };

  const handleBuildWithCopilot = () => {
    if (!profile) return;
    const prompt = `Help me build a COMPLETE Product Profile for ${profile.name}.

Current context:
- Category: ${profile.category || 'Service'}
- Description: ${profile.description || 'No description provided yet'}
- URL: ${profile.product_url || 'N/A'}

Ask clarifying questions, then return a single JSON object that matches our product profile schema sections (overview, target_market, value_propositions, pricing, competitors, use_cases, differentiators, pain_points_solved, key_features, integrations).`;

    openCopilot(prompt, true);
    navigate('/copilot');
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
        <title>{profile.name} — Product Profile | 60</title>
      </Helmet>
      {isMostlyBlank && (
        <div className="container mx-auto max-w-5xl px-3 sm:px-4 lg:px-6 py-4">
          <div className="rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5 text-brand-blue" />
              <p className="text-sm text-[#1E293B] dark:text-gray-100">
                This profile is still mostly empty. Use AI Copilot to generate a full profile, then apply it in edit mode.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(`${location.pathname}/edit`)}>
                Edit Profile
              </Button>
              <Button onClick={handleBuildWithCopilot}>
                <Sparkles className="h-4 w-4 mr-2" />
                Build with AI Copilot
              </Button>
            </div>
          </div>
        </div>
      )}
      <ProductProfileView
        profile={profile}
        parentCompanyName={factProfile?.company_name}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreateICP={handleCreateICP}
      />
    </>
  );
}
