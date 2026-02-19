import { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LeadWithPrep } from '@/lib/services/leadService';
import { toast } from 'sonner';
import { LeadList } from '@/components/leads/LeadList';
import { LeadDetailPanel } from '@/components/leads/LeadDetailPanel';
import { LeadPrepToolbar } from '@/components/leads/LeadPrepToolbar';
import { useLeadPrepRunner, useLeads, useLeadReprocessor } from '@/lib/hooks/useLeads';
import { useUser } from '@/lib/hooks/useUser';
import { useActiveOrgId, useOrgStore } from '@/lib/stores/orgStore';
import { supabase } from '@/lib/supabase/clientV2';
import logger from '@/lib/utils/logger';

export default function LeadsInbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: leads = [], isLoading, isFetching, refetch } = useLeads();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const { mutateAsync: runPrep, isPending } = useLeadPrepRunner();
  const { mutateAsync: reprocessLead, isPending: isReprocessingLead } = useLeadReprocessor();
  const { userData: user } = useUser();
  const orgId = useActiveOrgId();
  const loadOrganizations = useOrgStore((state) => state.loadOrganizations);
  const isLoadingOrgs = useOrgStore((state) => state.isLoading);
  const orgError = useOrgStore((state) => state.error);
  const [reprocessingLeadId, setReprocessingLeadId] = useState<string | null>(null);
  const [orgLoadAttempted, setOrgLoadAttempted] = useState(false);

  // Look up the standard Leads Ops table ID for table view navigation
  const { data: leadsOpsTableId } = useQuery({
    queryKey: ['ops-leads-table-id', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('dynamic_tables')
        .select('id')
        .eq('name', 'Leads')
        .eq('is_standard', true)
        .eq('organization_id', orgId!)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // View mode from URL params (table view navigates to Ops, so only 'list' renders here)
  const viewMode = (searchParams.get('view') || 'list') as 'list' | 'table';

  // URL-based filters
  const sourceFilter = searchParams.get('source');
  const stageFilter = searchParams.get('stage');

  // Lazy loading state for list view
  const [visibleCount, setVisibleCount] = useState(20);
  const BATCH_SIZE = 20;

  // Filter and sort state
  const [filterType, setFilterType] = useState<'all' | 'meeting_date' | 'booked_date'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort leads (shared logic for both views)
  const filteredAndSortedLeads = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const matchesQuery = (lead: LeadWithPrep) => {
      if (!normalizedQuery) return true;

      const owner = lead.owner as { first_name: string | null; last_name: string | null; email: string | null } | null;
      const source = lead.source as { name: string | null; source_key: string | null } | null;
      const contact = lead.contact as {
        title: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      } | null;

      const values = [
        lead.contact_name,
        lead.contact_email,
        lead.domain,
        lead.meeting_title,
        lead.booking_link_name,
        lead.utm_source,
        lead.external_source,
        source?.name,
        source?.source_key,
        owner?.first_name,
        owner?.last_name,
        owner?.email,
        contact?.title,
        contact?.first_name,
        contact?.last_name,
        contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : '',
      ];

      return values.some((value) => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery));
    };

    const matchesSource = (lead: LeadWithPrep) => {
      if (!sourceFilter) return true;

      const source = lead.source as { name: string | null } | null;
      const sourceName = source?.name ?? lead.utm_source ?? lead.external_source ?? 'Unknown';

      return sourceName.toLowerCase().includes(sourceFilter.toLowerCase());
    };

    const matchesStage = (lead: LeadWithPrep) => {
      if (!stageFilter) return true;

      // Get the deal stage from the converted deal
      const deal = lead.converted_deal as {
        id: string;
        name: string;
        stage: { id: string; name: string } | null
      } | null;

      return deal?.stage?.name === stageFilter;
    };

    let filtered = [...leads];

    // Apply all filters
    if (normalizedQuery) {
      filtered = filtered.filter(matchesQuery);
    }
    if (sourceFilter) {
      filtered = filtered.filter(matchesSource);
    }
    if (stageFilter) {
      filtered = filtered.filter(matchesStage);
    }

    const getBookedDate = (lead: LeadWithPrep) =>
      lead.first_seen_at || lead.external_occured_at || lead.created_at || null;

    if (filterType === 'meeting_date') {
      return filtered.sort((a, b) => {
        const aDate = a.meeting_start ? new Date(a.meeting_start).getTime() : 0;
        const bDate = b.meeting_start ? new Date(b.meeting_start).getTime() : 0;
        return bDate - aDate; // Most recent first
      });
    }

    if (filterType === 'booked_date') {
      return filtered.sort((a, b) => {
        const aDate = getBookedDate(a) ? new Date(getBookedDate(a) as string).getTime() : 0;
        const bDate = getBookedDate(b) ? new Date(getBookedDate(b) as string).getTime() : 0;
        return bDate - aDate; // Most recent first
      });
    }

    // Default: sort by booked date
    return filtered.sort((a, b) => {
      const aDate = getBookedDate(a) ? new Date(getBookedDate(a) as string).getTime() : 0;
      const bDate = getBookedDate(b) ? new Date(getBookedDate(b) as string).getTime() : 0;
      return bDate - aDate;
    });
  }, [leads, filterType, searchQuery, sourceFilter, stageFilter]);

  // Ensure organizations are loaded when user is available but orgId is not
  useEffect(() => {
    if (user?.id && !orgId && !isLoadingOrgs && !orgLoadAttempted && typeof loadOrganizations === 'function') {
      setOrgLoadAttempted(true);
      loadOrganizations().catch((error) => {
        logger.error('Failed to load organizations:', error);
        toast.error('Failed to load organizations. Please refresh the page.');
      });
    }
  }, [user?.id, orgId, isLoadingOrgs, orgLoadAttempted, loadOrganizations]);

  // Handle view mode change — table view navigates to Ops table
  const handleViewModeChange = (view: 'list' | 'table') => {
    if (view === 'table') {
      if (leadsOpsTableId) {
        navigate(`/ops/${leadsOpsTableId}`);
      } else {
        toast.error('Leads table not provisioned yet. Visit Ops to set up standard tables.');
      }
      return;
    }
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('view', view);
      newParams.set('page', '1');
      return newParams;
    });
  };

  // Lazy loaded leads for list view
  const lazyLoadedLeads = useMemo(() => {
    return filteredAndSortedLeads.slice(0, visibleCount);
  }, [filteredAndSortedLeads, visibleCount]);

  const hasMoreLeads = visibleCount < filteredAndSortedLeads.length;

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredAndSortedLeads.length));
  }, [filteredAndSortedLeads.length, BATCH_SIZE]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );

  // Auto-select first lead on page load or when current selection is not in filtered list
  useEffect(() => {
    if (filteredAndSortedLeads.length === 0) {
      // No leads, clear selection
      if (selectedLeadId !== null) {
        setSelectedLeadId(null);
      }
      return;
    }

    // Check if currently selected lead is in the filtered list
    const isSelectedInList = filteredAndSortedLeads.some(lead => lead.id === selectedLeadId);

    // Auto-select first lead if:
    // 1. No lead is selected, OR
    // 2. Selected lead is not in the current filtered list
    if (!selectedLeadId || !isSelectedInList) {
      // Only select if there are leads available
      if (filteredAndSortedLeads.length > 0) {
        setSelectedLeadId(filteredAndSortedLeads[0].id);
      }
    }
  }, [filteredAndSortedLeads, selectedLeadId]);

  const handleGeneratePrep = async () => {
    try {
      const { processed } = await runPrep();
      toast.success(processed ? `Generated prep for ${processed} lead(s)` : 'No leads needed prep');
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to generate prep');
    }
  };

  const handleReprocessLead = async (leadId: string) => {
    setReprocessingLeadId(leadId);
    try {
      await reprocessLead(leadId);
      toast.success('Lead queued for reprocessing');
      await refetch();
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to reprocess lead');
    } finally {
      setReprocessingLeadId(null);
    }
  };

  return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
        <div className="flex h-[calc(100vh-160px)] sm:h-[calc(100vh-140px)] lg:h-[calc(100vh-120px)] flex-col rounded-xl sm:rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800/60 dark:bg-gray-950/40 overflow-hidden">
          <LeadPrepToolbar
            isProcessing={isPending || isFetching}
            onGenerate={handleGeneratePrep}
            onRefresh={() => refetch()}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
        {/* Empty state when filters return no results */}
        {(sourceFilter || stageFilter) && filteredAndSortedLeads.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="mb-4 text-4xl">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No leads found
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                No leads match the current filters:
                {sourceFilter && <span className="block mt-1">Source: <strong>{sourceFilter}</strong></span>}
                {stageFilter && <span className="block mt-1">Stage: <strong>{stageFilter}</strong></span>}
              </p>
              <button
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete('source');
                  newParams.delete('stage');
                  setSearchParams(newParams);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}

        {!((sourceFilter || stageFilter) && filteredAndSortedLeads.length === 0 && !isLoading) && (
          <div className="flex flex-1 flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-800 overflow-hidden">
            {/* Lead List - Full width on mobile, wider sidebar on desktop */}
            <div className="w-full lg:w-[32rem] lg:max-w-[32rem] flex-shrink-0 flex flex-col h-64 lg:h-auto">
              <div className="flex-1 overflow-y-auto min-h-0">
                <LeadList
                  leads={lazyLoadedLeads}
                  selectedLeadId={selectedLead?.id ?? null}
                  onSelect={(id) => setSelectedLeadId(id)}
                  isLoading={isLoading}
                  onReprocessLead={handleReprocessLead}
                  reprocessingLeadId={reprocessingLeadId}
                  isReprocessing={isReprocessingLead}
                  filterType={filterType}
                  onFilterTypeChange={setFilterType}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onLoadMore={handleLoadMore}
                  hasMore={hasMoreLeads}
                  isLoadingMore={false}
                />
              </div>
            </div>
            {/* Lead Detail - Full width on mobile, flex-1 on desktop */}
            <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950/60 min-h-0">
              <LeadDetailPanel lead={selectedLead} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



