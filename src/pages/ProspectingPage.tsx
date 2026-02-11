import { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Crosshair,
  Plus,
  History,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { useOrg } from '@/lib/contexts/OrgContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';

// Feature components
import { ICPProfileGrid } from '@/components/prospecting/ICPProfileGrid';
import { ICPProfileForm } from '@/components/prospecting/ICPProfileForm';
import { ProviderSelector, type ProviderOption } from '@/components/prospecting/ProviderSelector';
import { CreditEstimator } from '@/components/prospecting/CreditEstimator';
import { SearchResultsPreview } from '@/components/prospecting/SearchResultsPreview';
import { ImportToOpsDialog } from '@/components/prospecting/ImportToOpsDialog';
import { AddToExistingTableDialog } from '@/components/prospecting/AddToExistingTableDialog';
import { AIProfileGenerator } from '@/components/prospecting/AIProfileGenerator';
import { RefinementSuggestions } from '@/components/prospecting/RefinementSuggestions';
import { SearchHistoryPanel } from '@/components/prospecting/SearchHistoryPanel';
import { ProspectingDashboard } from '@/components/prospecting/ProspectingDashboard';

// Hooks & utils
import { useICPProfiles } from '@/lib/hooks/useICPProfilesCRUD';
import { useProspectingSearch, type ProspectingProvider } from '@/lib/hooks/useProspectingSearch';
import { useApolloIntegration } from '@/lib/hooks/useApolloIntegration';
import { useAiArkIntegration } from '@/lib/hooks/useAiArkIntegration';
import { toApolloSearchParams } from '@/lib/utils/icpToSearchParams';
import type { ICPProfile, ICPCriteria } from '@/lib/types/prospecting';

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800/60" />
        <div className="h-7 w-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800/60" />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/40" />
          ))}
        </div>
        <div className="col-span-9 space-y-4">
          <div className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/40" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-50 dark:bg-gray-800/30" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function ProspectingPage() {
  const { activeOrg } = useOrg();
  const { userId } = useAuth();
  const orgId = activeOrg?.id ?? '';

  // ICP profiles query
  const { data: profiles, isLoading: profilesLoading } = useICPProfiles(orgId || undefined);
  const hasProfiles = (profiles?.length ?? 0) > 0;

  // Provider integration status
  const apollo = useApolloIntegration();
  const aiArk = useAiArkIntegration();

  // Search hook
  const {
    search,
    isSearching,
    results: searchResult,
    reset: resetSearch,
  } = useProspectingSearch();

  // ----- Page state -----
  const [selectedProfile, setSelectedProfile] = useState<ICPProfile | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption>('apollo');
  const [searchParams, setSearchParams] = useState<Record<string, unknown>>({});

  // Dialog states
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editProfile, setEditProfile] = useState<ICPProfile | undefined>(undefined);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAddToExistingDialog, setShowAddToExistingDialog] = useState(false);
  const [importSelectedRows, setImportSelectedRows] = useState<number[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  // ----- Derived state -----
  const isProviderConfigured = (() => {
    if (selectedProvider === 'apollo') return apollo.isConnected;
    if (selectedProvider === 'ai_ark') return aiArk.isConnected;
    return apollo.isConnected || aiArk.isConnected; // "both" needs at least one
  })();

  const activeProvider: ProspectingProvider =
    selectedProvider === 'both' ? 'apollo' : selectedProvider;

  // ----- Handlers -----
  const handleCreateProfile = useCallback(() => {
    setEditProfile(undefined);
    setShowProfileForm(true);
  }, []);

  const handleEditProfile = useCallback((profile: ICPProfile) => {
    setEditProfile(profile);
    setShowProfileForm(true);
  }, []);

  const handleSelectProfile = useCallback((profile: ICPProfile) => {
    setSelectedProfile(profile);

    // Auto-fill search params from ICP criteria
    const apolloParams = toApolloSearchParams(profile.criteria);
    setSearchParams(apolloParams);

    // Auto-select provider from profile target_provider
    if (profile.target_provider === 'ai_ark') {
      setSelectedProvider('ai_ark');
    } else if (profile.target_provider === 'both') {
      setSelectedProvider('both');
    } else {
      setSelectedProvider('apollo');
    }

    // Reset results when switching profiles
    resetSearch();
    setPage(1);
  }, [resetSearch]);

  const handleTestProfile = useCallback((profile: ICPProfile) => {
    handleSelectProfile(profile);
    // Immediately trigger search
    const apolloParams = toApolloSearchParams(profile.criteria);
    const provider: ProspectingProvider =
      profile.target_provider === 'ai_ark' ? 'ai_ark' : 'apollo';

    search({
      icp_profile_id: profile.id,
      provider,
      search_params: apolloParams,
      page: 1,
      per_page: 25,
    });
  }, [handleSelectProfile, search]);

  const handleSearch = useCallback(() => {
    search({
      icp_profile_id: selectedProfile?.id,
      provider: activeProvider,
      search_params: searchParams,
      page,
      per_page: 25,
    });
  }, [search, selectedProfile, activeProvider, searchParams, page]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    search({
      icp_profile_id: selectedProfile?.id,
      provider: activeProvider,
      search_params: searchParams,
      page: newPage,
      per_page: 25,
    });
  }, [search, selectedProfile, activeProvider, searchParams]);

  const handleImportToNew = useCallback((selectedIndices: number[]) => {
    setImportSelectedRows(selectedIndices);
    setShowImportDialog(true);
  }, []);

  const handleAddToExisting = useCallback((selectedIndices: number[]) => {
    setImportSelectedRows(selectedIndices);
    setShowAddToExistingDialog(true);
  }, []);

  const handleProfileSaved = useCallback((profile: ICPProfile) => {
    setSelectedProfile(profile);
  }, []);

  const handleLoadHistoryParams = useCallback((params: Record<string, unknown>) => {
    setSearchParams(params);
    setShowHistoryPanel(false);
  }, []);

  const handleAIEditAndSave = useCallback((criteria: ICPCriteria, name: string, description: string) => {
    // Open the form pre-filled with AI-generated criteria
    setEditProfile({
      id: '',
      organization_id: orgId,
      created_by: userId ?? '',
      name,
      description,
      criteria,
      target_provider: 'apollo',
      status: 'draft',
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

  const handleApplyRefinement = useCallback((filterChange: Record<string, unknown>) => {
    setSearchParams((prev) => ({ ...prev, ...filterChange }));
  }, []);

  // ----- Loading -----
  if (profilesLoading || !activeOrg) {
    return (
      <>
        <Helmet><title>Prospecting | 60</title></Helmet>
        <PageSkeleton />
      </>
    );
  }

  return (
    <>
    <Helmet><title>Prospecting | 60</title></Helmet>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-zinc-800/60 bg-gradient-to-br from-blue-500/20 to-violet-500/20">
            <Crosshair className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">Prospecting</h1>
        </div>

        <div className="flex items-center gap-2">
          {hasProfiles && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAIGenerator(!showAIGenerator)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                AI Suggest
              </Button>
              <Button onClick={handleCreateProfile} className="gap-2">
                <Plus className="h-4 w-4" />
                New ICP Profile
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="mb-6 text-sm text-gray-500 dark:text-zinc-500">
        Define your ideal customer profile and search across providers to find matching leads
      </p>

      {/* Dashboard stats (auto-hides when no profiles) */}
      <div className="mb-6">
        <ProspectingDashboard orgId={orgId} />
      </div>

      {/* AI Generator (collapsible) */}
      {showAIGenerator && (
        <div className="mb-6 rounded-lg border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-500/5 p-4">
          <AIProfileGenerator
            orgId={orgId}
            onProfileCreated={handleProfileSaved}
            onEditAndSave={handleAIEditAndSave}
          />
        </div>
      )}

      {!hasProfiles ? (
        /* Empty state with AI generator */
        <div className="space-y-8">
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-800/50 bg-gray-50 dark:bg-gradient-to-br dark:from-gray-900/80 dark:to-gray-900/40 px-6 py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 dark:bg-zinc-800">
              <Crosshair className="h-7 w-7 text-gray-500 dark:text-zinc-500" />
            </div>
            <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No ICP profiles yet</h3>
            <p className="mb-6 max-w-sm text-sm text-gray-500 dark:text-zinc-400">
              Create your first ICP profile to start prospecting. Define your ideal customer
              and search across providers to find matching leads.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={handleCreateProfile} className="gap-2">
                <Plus className="h-4 w-4" />
                Create ICP Profile
              </Button>
              <Button variant="outline" onClick={() => setShowAIGenerator(true)} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </Button>
            </div>
          </div>

          {/* AI Generator below empty state */}
          {showAIGenerator && (
            <div className="rounded-lg border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-500/5 p-4">
              <AIProfileGenerator
                orgId={orgId}
                onProfileCreated={handleProfileSaved}
                onEditAndSave={handleAIEditAndSave}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left sidebar -- ICP profiles grid */}
          <div className="col-span-12 lg:col-span-4 xl:col-span-3">
            <ICPProfileGrid
              orgId={orgId}
              selectedProfileId={selectedProfile?.id}
              onSelectProfile={handleSelectProfile}
              onEditProfile={handleEditProfile}
              onCreateProfile={handleCreateProfile}
              onTestProfile={handleTestProfile}
            />
          </div>

          {/* Center + Right -- Search and Results */}
          <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-6">
            {/* Provider selector + credit estimator */}
            <div className="space-y-4">
              <ProviderSelector
                selected={selectedProvider}
                onChange={setSelectedProvider}
                disabled={isSearching}
              />

              <CreditEstimator
                provider={selectedProvider}
                onSearch={handleSearch}
                isSearching={isSearching}
                providerConfigured={isProviderConfigured}
              />
            </div>

            {/* History button (shown when a profile is selected) */}
            {selectedProfile && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Searching as:{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {selectedProfile.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistoryPanel(true)}
                  className="gap-1.5"
                >
                  <History className="h-4 w-4" />
                  History
                </Button>
              </div>
            )}

            {/* Search results preview */}
            <SearchResultsPreview
              result={searchResult}
              provider={selectedProvider}
              isLoading={isSearching}
              onImportToNew={handleImportToNew}
              onAddToExisting={handleAddToExisting}
              onPageChange={handlePageChange}
              icpCriteria={selectedProfile?.criteria ?? null}
            />

            {/* Refinement suggestions (shown after search completes) */}
            {searchResult && searchResult.results.length > 0 && selectedProfile && (
              <RefinementSuggestions
                resultsSample={searchResult.results.slice(0, 25)}
                currentCriteria={selectedProfile.criteria}
                provider={activeProvider}
                onApplySuggestion={handleApplyRefinement}
              />
            )}
          </div>
        </div>
      )}

      {/* ----- Dialogs & Panels ----- */}

      {/* ICP Profile Form (create/edit) */}
      <ICPProfileForm
        isOpen={showProfileForm}
        onClose={() => { setShowProfileForm(false); setEditProfile(undefined); }}
        editProfile={editProfile}
        onSaved={handleProfileSaved}
        orgId={orgId}
      />

      {/* Import to New Ops Table */}
      {searchResult && (
        <ImportToOpsDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          results={searchResult.results}
          selectedRowIds={importSelectedRows}
          provider={searchResult.provider}
          action={searchResult.action}
          icpProfileName={selectedProfile?.name}
          searchParams={searchParams}
        />
      )}

      {/* Add to Existing Ops Table */}
      {searchResult && (
        <AddToExistingTableDialog
          isOpen={showAddToExistingDialog}
          onClose={() => setShowAddToExistingDialog(false)}
          results={searchResult.results}
          selectedRowIds={importSelectedRows}
          provider={searchResult.provider}
        />
      )}

      {/* Search History Panel */}
      <SearchHistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        profileId={selectedProfile?.id}
        profileName={selectedProfile?.name}
        onLoadParams={handleLoadHistoryParams}
      />
    </div>
    </>
  );
}

export default ProspectingPage;
