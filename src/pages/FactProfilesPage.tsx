import { Helmet } from 'react-helmet-async';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Plus, Building2, Target, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FactProfileGrid } from '@/components/fact-profiles/FactProfileGrid';
import { NewFactProfileDialog } from '@/components/fact-profiles/NewFactProfileDialog';
import { ResearchProgress } from '@/components/fact-profiles/ResearchProgress';
import { useFactProfiles, useDeleteFactProfile } from '@/lib/hooks/useFactProfiles';
import { useActiveOrgId } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import type { FactProfile } from '@/lib/types/factProfile';

export default function FactProfilesPage() {
  const navigate = useNavigate();
  const orgId = useActiveOrgId();

  const { data: profiles = [], isLoading } = useFactProfiles(orgId ?? undefined);
  const deleteMutation = useDeleteFactProfile();

  const [activeTab, setActiveTab] = useState<'all' | 'org_profile' | 'client_org' | 'target_company'>('all');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [researchingProfileId, setResearchingProfileId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleView = useCallback(
    (profile: FactProfile) => {
      navigate(`/profiles/${profile.id}`);
    },
    [navigate]
  );

  const handleEdit = useCallback(
    (profile: FactProfile) => {
      navigate(`/profiles/${profile.id}/edit`);
    },
    [navigate]
  );

  const handleResearch = useCallback(
    async (profile: FactProfile) => {
      // Show progress overlay immediately for responsive UX.
      setResearchingProfileId(profile.id);
      const { error } = await supabase.functions.invoke('research-fact-profile', {
        body: { action: 'research', profileId: profile.id },
      });
      if (error) {
        setResearchingProfileId(null);
        toast.error('Failed to start research: ' + error.message);
      }
    },
    []
  );

  const handleShare = useCallback(
    (_profile: FactProfile) => {
      toast.info('Share functionality coming soon');
    },
    []
  );

  const handleDelete = useCallback(
    (profile: FactProfile) => {
      if (!orgId) return;
      deleteMutation.mutate({
        id: profile.id,
        orgId,
        companyName: profile.company_name,
      });
    },
    [orgId, deleteMutation]
  );

  const handleCreated = useCallback(
    (profile: FactProfile, triggerResearch: boolean) => {
      if (triggerResearch) {
        setResearchingProfileId(profile.id);
      }
    },
    []
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
                { description: 'Email generation and skills will now use this data.' }
              );
            }
          })
          .catch((err) => console.error('[auto-sync] Error:', err));
      }

      navigate(`/profiles/${profile.id}`);
    },
    [navigate]
  );

  const handleResearchCancel = useCallback(() => {
    setResearchingProfileId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasProfiles = profiles.length > 0;
  const hasOrgProfile = profiles.some((p) => p.is_org_profile);

  return (
    <>
      <Helmet><title>Profiles | 60</title></Helmet>
      <div className="min-h-screen">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#1E293B] dark:text-gray-100">
                Profiles
              </h1>
              <p className="text-[#64748B] dark:text-gray-400 mt-1">
                Research-backed business profiles and ideal customer profiles
              </p>
            </div>
            <Button
              onClick={() => setShowNewDialog(true)}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Profile
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-[#F8FAFC] dark:bg-gray-800/50 rounded-xl w-fit">
            {[
              { key: 'all' as const, label: 'All', icon: FileSearch },
              { key: 'org_profile' as const, label: 'Your Business', icon: Shield },
              { key: 'client_org' as const, label: 'Clients', icon: Building2 },
              { key: 'target_company' as const, label: 'Prospects', icon: Target },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
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

          {/* Content: Grid or Empty State */}
          {hasProfiles || isLoading ? (
            <FactProfileGrid
              profiles={profiles}
              isLoading={isLoading}
              filterType={activeTab}
              onView={handleView}
              onEdit={handleEdit}
              onResearch={handleResearch}
              onShare={handleShare}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-gray-800/50 p-6 mb-6">
                <FileSearch className="h-12 w-12 text-[#94A3B8] dark:text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-[#1E293B] dark:text-gray-100 mb-2">
                No profiles yet
              </h3>
              <p className="text-[#64748B] dark:text-gray-400 text-center max-w-md mb-6">
                Research a client or target company to build a verified business profile. Share it
                externally for client sign-off, then use it to create accurate ICP profiles.
              </p>
              <Button
                onClick={() => setShowNewDialog(true)}
                className="bg-brand-blue hover:bg-brand-blue/90 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Profile
              </Button>
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
