import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ProductProfileView } from '@/components/product-profiles/ProductProfileView';
import {
  useProductProfile,
  useDeleteProductProfile,
} from '@/lib/hooks/useProductProfiles';
import { useFactProfile } from '@/lib/hooks/useFactProfiles';
import { useActiveOrgId } from '@/lib/stores/orgStore';

export default function ProductProfileViewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const orgId = useActiveOrgId();
  const { id, productId } = useParams<{ id?: string; productId?: string }>();
  const resolvedProductId = productId ?? id;

  const { data: profile, isLoading } = useProductProfile(resolvedProductId);
  const { data: factProfile } = useFactProfile(profile?.fact_profile_id ?? undefined);
  const deleteMutation = useDeleteProductProfile();

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
