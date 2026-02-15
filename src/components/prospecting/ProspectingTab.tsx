import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Crosshair,
  Plus,
  Sparkles,
  Table,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Feature components
import { ICPProfileGrid } from '@/components/prospecting/ICPProfileGrid';
import { ICPProfileForm } from '@/components/prospecting/ICPProfileForm';
import { AIProfileGenerator } from '@/components/prospecting/AIProfileGenerator';

// Hooks & utils
import { useICPProfiles } from '@/lib/hooks/useICPProfilesCRUD';
import type { ICPProfile, ICPCriteria } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProspectingTabProps {
  orgId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// ProspectingTab — Profile management page (search moved to Ops "Find More")
// ---------------------------------------------------------------------------

export function ProspectingTab({ orgId, userId }: ProspectingTabProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // ICP profiles query
  const { data: profiles, isLoading: profilesLoading } = useICPProfiles(orgId || undefined);
  const hasProfiles = (profiles?.length ?? 0) > 0;

  // Dialog states
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editProfile, setEditProfile] = useState<ICPProfile | undefined>(undefined);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [prefillSourceName, setPrefillSourceName] = useState<string | null>(null);
  const consumedPrefillRef = useRef(false);

  // ----- Handlers -----
  const handleCreateProfile = useCallback(() => {
    setEditProfile(undefined);
    setShowProfileForm(true);
  }, []);

  const handleEditProfile = useCallback((profile: ICPProfile) => {
    setEditProfile(profile);
    setShowProfileForm(true);
  }, []);

  const [defaultParentIcpId, setDefaultParentIcpId] = useState<string | undefined>(undefined);

  const handleCreatePersona = useCallback((parentIcpId?: string) => {
    setDefaultParentIcpId(parentIcpId);
    setEditProfile({
      id: '',
      organization_id: orgId,
      created_by: userId,
      name: '',
      description: '',
      criteria: {} as ICPCriteria,
      profile_type: 'persona',
      parent_icp_id: parentIcpId ?? null,
      target_provider: 'apollo',
      status: 'active',
      visibility: 'team_only',
      is_active: true,
      last_tested_at: null,
      last_test_result_count: null,
      created_at: '',
      updated_at: '',
    } as ICPProfile);
    setShowProfileForm(true);
  }, [orgId, userId]);

  const handleOpenTable = useCallback((tableId: string) => {
    navigate(`/ops/${tableId}`);
  }, [navigate]);

  const handleSelectProfile = useCallback((profile: ICPProfile) => {
    // If profile has a linked table, navigate to it
    if (profile.linked_table_id) {
      navigate(`/ops/${profile.linked_table_id}`);
    } else {
      // Open edit form if no linked table
      setEditProfile(profile);
      setShowProfileForm(true);
    }
  }, [navigate]);

  const handleTestProfile = useCallback((profile: ICPProfile) => {
    // Navigate to the linked Ops table (Find More can be opened there)
    if (profile.linked_table_id) {
      navigate(`/ops/${profile.linked_table_id}?findMore=true`);
    }
  }, [navigate]);

  const handleProfileSaved = useCallback((_profile: ICPProfile) => {
    // Profile saved — grid will auto-refresh via React Query
  }, []);

  const handleAIEditAndSave = useCallback((criteria: ICPCriteria, name: string, description: string) => {
    setEditProfile({
      id: '',
      organization_id: orgId,
      created_by: userId,
      name,
      description,
      criteria,
      target_provider: 'apollo',
      status: 'active',
      visibility: 'team_only',
      is_active: true,
      last_tested_at: null,
      last_test_result_count: null,
      created_at: '',
      updated_at: '',
    } as ICPProfile);
    setShowProfileForm(true);
    setShowAIGenerator(false);
  }, [orgId, userId]);

  // ----- Fact profile prefill (cross-navigation from Fact Profiles page) -----
  const applyFactProfilePrefill = useCallback((payload: {
    prefillCriteria: Partial<ICPCriteria>;
    fromFactProfileId?: string;
    fromFactProfileName?: string;
    fromProductProfileId?: string;
    fromProductProfileName?: string;
  }) => {
    const fromFactProfileName = payload.fromFactProfileName || 'Fact Profile';
    const profileLabel = payload.fromProductProfileName
      ? `${fromFactProfileName} — ${payload.fromProductProfileName}`
      : fromFactProfileName;
    setPrefillSourceName(profileLabel);
    setEditProfile({
      id: '',
      organization_id: orgId,
      created_by: userId,
      name: `${profileLabel} ICP`,
      description: payload.fromProductProfileId
        ? `Draft ICP generated from product profile "${payload.fromProductProfileName}" under "${fromFactProfileName}".`
        : payload.fromFactProfileId
          ? `Draft ICP generated from fact profile "${fromFactProfileName}" (${payload.fromFactProfileId}).`
          : `Draft ICP generated from fact profile "${fromFactProfileName}".`,
      criteria: payload.prefillCriteria as ICPCriteria,
      fact_profile_id: payload.fromFactProfileId ?? null,
      product_profile_id: payload.fromProductProfileId ?? null,
      target_provider: 'apollo',
      status: 'active',
      visibility: 'team_only',
      is_active: true,
      last_tested_at: null,
      last_test_result_count: null,
      created_at: '',
      updated_at: '',
    } as ICPProfile);
    setShowProfileForm(true);
  }, [orgId, userId]);

  useEffect(() => {
    if (consumedPrefillRef.current || !orgId) return;

    const statePayload = location.state as {
      prefillCriteria?: Partial<ICPCriteria>;
      fromFactProfileId?: string;
      fromFactProfileName?: string;
      fromProductProfileId?: string;
      fromProductProfileName?: string;
    } | null;

    if (statePayload?.prefillCriteria) {
      consumedPrefillRef.current = true;
      applyFactProfilePrefill(statePayload);
      try { sessionStorage.removeItem('prospecting-prefill-fact-profile'); } catch { /* */ }
      return;
    }

    try {
      const raw = sessionStorage.getItem('prospecting-prefill-fact-profile');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        prefillCriteria?: Partial<ICPCriteria>;
        fromFactProfileId?: string;
        fromFactProfileName?: string;
        fromProductProfileId?: string;
        fromProductProfileName?: string;
        createdAt?: number;
      };
      if (!parsed.prefillCriteria) return;
      if (parsed.createdAt && Date.now() - parsed.createdAt > 15 * 60 * 1000) {
        sessionStorage.removeItem('prospecting-prefill-fact-profile');
        return;
      }
      consumedPrefillRef.current = true;
      applyFactProfilePrefill(parsed);
      sessionStorage.removeItem('prospecting-prefill-fact-profile');
    } catch { /* */ }
  }, [location.state, orgId, applyFactProfilePrefill]);

  // ----- Counts -----
  const activeCount = profiles?.filter((p) => p.status === 'active').length ?? 0;
  const withTableCount = profiles?.filter((p) => p.linked_table_id).length ?? 0;

  // ----- Loading -----
  if (profilesLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-white dark:bg-gray-900/80 border border-[#E2E8F0] dark:border-gray-700/50" />
        ))}
      </div>
    );
  }

  return (
    <>
    <div>
      <div className="space-y-5 sm:space-y-6">
        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div>
            {prefillSourceName && (
              <p className="text-xs text-brand-blue dark:text-blue-400">
                Prefilled from: {prefillSourceName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasProfiles && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAIGenerator(!showAIGenerator)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                AI Suggest
              </Button>
            )}
            <Button onClick={handleCreateProfile} className="gap-2">
              <Plus className="h-4 w-4" />
              New Profile
            </Button>
          </div>
        </div>

        {/* Quick stats bar */}
        {hasProfiles && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-[#64748B] dark:text-gray-400">
              <Crosshair className="h-3.5 w-3.5" />
              <span><span className="font-semibold text-[#1E293B] dark:text-white">{profiles?.length ?? 0}</span> profiles</span>
            </div>
            <div className="h-4 w-px bg-[#E2E8F0] dark:bg-gray-700" />
            <div className="flex items-center gap-1.5 text-[#64748B] dark:text-gray-400">
              <div className="h-2 w-2 rounded-full bg-brand-teal" />
              <span><span className="font-semibold text-[#1E293B] dark:text-white">{activeCount}</span> active</span>
            </div>
            {withTableCount > 0 && (
              <>
                <div className="h-4 w-px bg-[#E2E8F0] dark:bg-gray-700" />
                <div className="flex items-center gap-1.5 text-[#64748B] dark:text-gray-400">
                  <Table className="h-3.5 w-3.5" />
                  <span><span className="font-semibold text-[#1E293B] dark:text-white">{withTableCount}</span> with linked tables</span>
                </div>
              </>
            )}
            {withTableCount > 0 && (
              <>
                <div className="h-4 w-px bg-[#E2E8F0] dark:bg-gray-700" />
                <button
                  onClick={() => navigate('/ops')}
                  className="flex items-center gap-1 text-xs font-medium text-brand-blue dark:text-blue-400 hover:underline"
                >
                  Open Ops
                  <ArrowRight className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}

        {/* AI Generator (collapsible) */}
        {showAIGenerator && (
          <div className="rounded-xl border border-brand-violet/20 dark:border-brand-violet/20 bg-brand-violet/5 dark:bg-brand-violet/5 p-4 backdrop-blur-sm">
            <AIProfileGenerator
              orgId={orgId}
              onProfileCreated={handleProfileSaved}
              onEditAndSave={handleAIEditAndSave}
            />
          </div>
        )}

        {/* Full-width profile grid */}
        <ICPProfileGrid
          orgId={orgId}
          onSelectProfile={handleSelectProfile}
          onEditProfile={handleEditProfile}
          onCreateProfile={handleCreateProfile}
          onCreatePersona={handleCreatePersona}
          onTestProfile={handleTestProfile}
          onOpenTable={handleOpenTable}
        />
      </div>
    </div>

    {/* Profile Form Dialog */}
    <ICPProfileForm
      isOpen={showProfileForm}
      onClose={() => { setShowProfileForm(false); setEditProfile(undefined); setDefaultParentIcpId(undefined); }}
      editProfile={editProfile}
      onSaved={handleProfileSaved}
      orgId={orgId}
      defaultParentId={defaultParentIcpId}
    />
    </>
  );
}
