import { Helmet } from 'react-helmet-async';
import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Shield, Building2, Target, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FactProfileGrid } from '@/components/fact-profiles/FactProfileGrid';
import { FactProfileCard } from '@/components/fact-profiles/FactProfileCard';
import { NewFactProfileDialog } from '@/components/fact-profiles/NewFactProfileDialog';
import { ResearchProgress } from '@/components/fact-profiles/ResearchProgress';
import { ProductProfileCard } from '@/components/product-profiles/ProductProfileCard';
import { NewProductProfileDialog } from '@/components/product-profiles/NewProductProfileDialog';
import { ProspectingTab } from '@/components/prospecting/ProspectingTab';
import { useFactProfiles, useDeleteFactProfile } from '@/lib/hooks/useFactProfiles';
import { useProductProfilesByFactProfile, useDeleteProductProfile } from '@/lib/hooks/useProductProfiles';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/clientV2';
import type { FactProfile } from '@/lib/types/factProfile';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'business', label: 'Your Business', icon: Shield },
  { key: 'companies', label: 'Companies', icon: Building2 },
  { key: 'icps', label: 'ICPs', icon: Target },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = useActiveOrgId();
  const { userId } = useAuth();

  // Tab state from URL
  const rawTab = searchParams.get('tab');
  const activeTab: TabKey =
    rawTab === 'business' || rawTab === 'companies' || rawTab === 'icps'
      ? rawTab
      : 'business';

  const setTab = useCallback(
    (tab: TabKey) => {
      setSearchParams({ tab });
    },
    [setSearchParams],
  );

  // Fact profiles
  const { data: profiles = [], isLoading } = useFactProfiles(orgId ?? undefined);
  const deleteMutation = useDeleteFactProfile();
  const orgProfile = profiles.find((p) => p.is_org_profile);
  const hasOrgProfile = !!orgProfile;
  const companyProfiles = profiles.filter((p) => !p.is_org_profile);

  // Product profiles for org profile
  const { data: productProfiles = [] } = useProductProfilesByFactProfile(orgProfile?.id);
  const deleteProductMutation = useDeleteProductProfile();

  // Dialog / overlay state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showNewProductDialog, setShowNewProductDialog] = useState(false);
  const [researchingProfileId, setResearchingProfileId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fact Profile Handlers
  // ---------------------------------------------------------------------------

  const handleView = useCallback(
    (profile: FactProfile) => {
      navigate(`/profiles/${profile.id}`);
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (profile: FactProfile) => {
      navigate(`/profiles/${profile.id}/edit`);
    },
    [navigate],
  );

  const handleResearch = useCallback(async (profile: FactProfile) => {
    setResearchingProfileId(profile.id);
    const { error } = await supabase.functions.invoke('research-fact-profile', {
      body: { action: 'research', profileId: profile.id },
    });
    if (error) {
      setResearchingProfileId(null);
      toast.error('Failed to start research: ' + error.message);
    }
  }, []);

  const handleShare = useCallback((_profile: FactProfile) => {
    toast.info('Share functionality coming soon');
  }, []);

  const handleDelete = useCallback(
    (profile: FactProfile) => {
      if (!orgId) return;
      deleteMutation.mutate({
        id: profile.id,
        orgId,
        companyName: profile.company_name,
      });
    },
    [orgId, deleteMutation],
  );

  const handleCreated = useCallback(
    (_profile: FactProfile, triggerResearch: boolean) => {
      if (triggerResearch) {
        setResearchingProfileId(_profile.id);
      }
    },
    [],
  );

  const handleResearchComplete = useCallback(
    (profile: FactProfile) => {
      setResearchingProfileId(null);
      toast.success(`Research complete for "${profile.company_name}"`);

      // Auto-sync org profiles to enrichment + context when research completes
      if (
        profile.is_org_profile &&
        profile.profile_type === 'client_org' &&
        profile.research_status === 'complete'
      ) {
        supabase.functions
          .invoke('sync-fact-profile-context', { body: { profileId: profile.id } })
          .then(({ data, error }) => {
            if (error) {
              console.error('[auto-sync] Failed to sync org profile on research complete:', error);
              return;
            }
            if (data?.success) {
              toast.success(
                `Org context synced: ${data.context_keys_synced} fields updated`,
                { description: 'Email generation and skills will now use this data.' },
              );
            }
          })
          .catch((err) => console.error('[auto-sync] Error:', err));
      }

      navigate(`/profiles/${profile.id}`);
    },
    [navigate],
  );

  const handleResearchCancel = useCallback(() => {
    setResearchingProfileId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Product Profile Handlers
  // ---------------------------------------------------------------------------

  const handleDeleteProduct = useCallback(
    (product: { id: string; name: string; fact_profile_id?: string | null }) => {
      if (!orgId) return;
      deleteProductMutation.mutate({
        id: product.id,
        orgId,
        name: product.name,
        factProfileId: product.fact_profile_id,
      });
    },
    [orgId, deleteProductMutation],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Helmet>
        <title>Profiles | 60</title>
      </Helmet>
      <div className="min-h-screen">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1E293B] dark:text-gray-100">Profiles</h1>
              <p className="text-[#64748B] dark:text-gray-400 mt-1">
                Research-backed business profiles and ideal customer profiles
              </p>
            </div>
            {activeTab !== 'icps' && (
              <Button
                onClick={() => setShowNewDialog(true)}
                className="bg-brand-blue hover:bg-brand-blue/90 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Profile
              </Button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-[#F8FAFC] dark:bg-gray-800/50 rounded-xl w-fit">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-white dark:bg-gray-700 text-[#1E293B] dark:text-gray-100 shadow-sm'
                    : 'text-[#64748B] dark:text-gray-400 hover:text-[#1E293B] dark:hover:text-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* ============================================================= */}
          {/* Business Tab                                                   */}
          {/* ============================================================= */}
          {activeTab === 'business' && (
            <>
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-52 animate-pulse rounded-xl border border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80"
                    />
                  ))}
                </div>
              ) : orgProfile ? (
                <div className="space-y-8">
                  {/* Org profile card */}
                  <div className="max-w-md">
                    <FactProfileCard
                      profile={orgProfile}
                      onView={handleView}
                      onEdit={handleEdit}
                      onResearch={handleResearch}
                      onShare={handleShare}
                      onDelete={handleDelete}
                    />
                  </div>

                  {/* Product profiles section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-[#64748B] dark:text-gray-400" />
                        <h2 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100">
                          Products & Services
                        </h2>
                        <span className="text-sm text-[#94A3B8] dark:text-gray-500">
                          ({productProfiles.length})
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewProductDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Product
                      </Button>
                    </div>

                    {productProfiles.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {productProfiles.map((product) => (
                          <ProductProfileCard
                            key={product.id}
                            profile={product}
                            onClick={() => navigate(`/profiles/products/${product.id}`)}
                            onEdit={() => navigate(`/profiles/products/${product.id}/edit`)}
                            onDelete={() => handleDeleteProduct(product)}
                            onCreateICP={() =>
                              navigate('/profiles?tab=icps', {
                                state: {
                                  prefillCriteria: {},
                                  fromFactProfileId: orgProfile.id,
                                  fromFactProfileName: orgProfile.company_name,
                                  fromProductProfileId: product.id,
                                  fromProductProfileName: product.name,
                                },
                              })
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-gray-700/50 bg-white dark:bg-gray-900/80 px-6 py-12 text-center">
                        <Package className="h-8 w-8 text-[#94A3B8] dark:text-gray-500 mb-3" />
                        <p className="text-sm text-[#64748B] dark:text-gray-400 mb-4">
                          No product profiles yet. Add your products to research their market positioning.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowNewProductDialog(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Product
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* No org profile — empty state with CTA */
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-2xl bg-[#F8FAFC] dark:bg-gray-800/50 p-6 mb-6">
                    <Shield className="h-12 w-12 text-[#94A3B8] dark:text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100 mb-2">
                    Set up your business profile
                  </h3>
                  <p className="text-[#64748B] dark:text-gray-400 text-center max-w-md mb-6">
                    Create a research-backed profile for your company. This feeds into email
                    generation, skill compilation, and AI context.
                  </p>
                  <Button
                    onClick={() => setShowNewDialog(true)}
                    className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Business Profile
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ============================================================= */}
          {/* Companies Tab                                                  */}
          {/* ============================================================= */}
          {activeTab === 'companies' && (
            <>
              {companyProfiles.length > 0 || isLoading ? (
                <FactProfileGrid
                  profiles={companyProfiles}
                  isLoading={isLoading}
                  filterType="all"
                  onView={handleView}
                  onEdit={handleEdit}
                  onResearch={handleResearch}
                  onShare={handleShare}
                  onDelete={handleDelete}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-2xl bg-[#F8FAFC] dark:bg-gray-800/50 p-6 mb-6">
                    <Building2 className="h-12 w-12 text-[#94A3B8] dark:text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100 mb-2">
                    No company profiles yet
                  </h3>
                  <p className="text-[#64748B] dark:text-gray-400 text-center max-w-md mb-6">
                    Research a client or target company to build a verified business profile. Share
                    it externally for client sign-off, then use it to create accurate ICP profiles.
                  </p>
                  <Button
                    onClick={() => setShowNewDialog(true)}
                    className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Company Profile
                  </Button>
                </div>
              )}
            </>
          )}

          {/* ============================================================= */}
          {/* ICPs Tab                                                       */}
          {/* ============================================================= */}
          {activeTab === 'icps' && orgId && userId && (
            <ProspectingTab orgId={orgId} userId={userId} />
          )}
          {activeTab === 'icps' && (!orgId || !userId) && (
            <div className="flex flex-col items-center justify-center py-20">
              <Target className="h-12 w-12 text-[#94A3B8] dark:text-gray-500 mb-4" />
              <p className="text-[#64748B] dark:text-gray-400">
                Loading organization...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Fact Profile Dialog */}
      <NewFactProfileDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleCreated}
        hasOrgProfile={hasOrgProfile}
      />

      {/* New Product Profile Dialog */}
      {orgId && userId && orgProfile && (
        <NewProductProfileDialog
          open={showNewProductDialog}
          onOpenChange={setShowNewProductDialog}
          organizationId={orgId}
          userId={userId}
          factProfileId={orgProfile.id}
        />
      )}

      {/* Research Progress Overlay */}
      {researchingProfileId && (
        <ResearchProgress
          profileId={researchingProfileId}
          onComplete={handleResearchComplete}
          onCancel={handleResearchCancel}
        />
      )}
    </>
  );
}
