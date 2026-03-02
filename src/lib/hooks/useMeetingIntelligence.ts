import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';
import { askMeeting } from '@/lib/services/meetingAnalyticsService';

// Types for tables not yet in generated types
interface OrgFileSearchStore {
  id: string;
  org_id: string;
  store_name: string;
  display_name: string | null;
  status: 'active' | 'syncing' | 'error';
  total_files: number;
  last_sync_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface MeetingIndexStatus {
  indexed_count: number;
  total_meetings: number;
  pending_count: number;
  failed_count: number;
  last_indexed_at: string | null;
}

// Helper to bypass Supabase generated types for new tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

export interface SearchFilters {
  sentiment?: 'positive' | 'negative' | 'neutral';
  date_from?: string;
  date_to?: string;
  company_id?: string;
  contact_id?: string;
  has_action_items?: boolean;
  owner_user_id?: string | null; // null = all team, undefined = current user, string = specific user
}

export interface SearchSource {
  source_type: 'meeting' | 'call';
  source_id: string;
  title: string;
  date: string;
  company_name: string | null;
  owner_name?: string | null;
  relevance_snippet: string;
  // Enhanced fields for meeting intelligence
  sentiment_score?: number | null;      // -1.0 to +1.0
  speaker_name?: string | null;         // Extracted from transcript
  fathom_share_url?: string | null;     // Direct link to Fathom recording
  timestamp_seconds?: number | null;    // Position in recording (seconds)
}

export interface SearchResult {
  answer: string;
  sources: SearchSource[];
  query_metadata: {
    semantic_query: string | null;
    filters_applied: object;
    meetings_searched: number;
    response_time_ms: number;
  };
}

export interface IndexStatus {
  indexed: number;
  total: number;
  pending: number;
  failed: number;
  status: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;
}

export interface TeamMember {
  user_id: string;
  email: string;
  full_name: string;
  meeting_count: number;
  indexed_count: number;
}

export interface UseMeetingIntelligenceReturn {
  // Search
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  results: SearchResult | null;
  isSearching: boolean;
  searchError: string | null;

  // Index status
  indexStatus: IndexStatus;
  isLoadingStatus: boolean;

  // Team filter
  selectedUserId: string | null; // null = all team, 'me' = current user, uuid = specific user
  setSelectedUserId: (userId: string | null) => void;
  teamMembers: TeamMember[];
  isLoadingTeam: boolean;

  // Actions
  triggerFullIndex: () => Promise<void>;
  indexMeeting: (meetingId: string) => Promise<void>;
  clearResults: () => void;
  refreshStatus: () => Promise<void>;

  // Query history
  recentQueries: string[];
}

export function useMeetingIntelligence(): UseMeetingIntelligenceReturn {
  const { user } = useAuth();

  // Search state
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Team filter state - default to 'me' (current user only)
  const [selectedUserId, setSelectedUserId] = useState<string | null>('me');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);

  // Index status state
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({
    indexed: 0,
    total: 0,
    pending: 0,
    failed: 0,
    status: 'idle',
    lastSyncAt: null,
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Recent queries (stored in local state, persisted to localStorage)
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Get the actual user ID for queries (resolve 'me' to actual ID, null for all)
  const getTargetUserId = useCallback((): string | null => {
    if (selectedUserId === 'me') return user?.id || null;
    return selectedUserId;
  }, [selectedUserId, user?.id]);

  // Load recent queries from localStorage
  useEffect(() => {
    if (user) {
      const stored = localStorage.getItem(`meeting-intelligence-queries-${user.id}`);
      if (stored) {
        try {
          setRecentQueries(JSON.parse(stored));
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [user]);

  // Save recent queries to localStorage
  const saveRecentQuery = useCallback((query: string) => {
    if (!user) return;

    setRecentQueries(prev => {
      const filtered = prev.filter(q => q !== query);
      const updated = [query, ...filtered].slice(0, 10);
      localStorage.setItem(`meeting-intelligence-queries-${user.id}`, JSON.stringify(updated));
      return updated;
    });
  }, [user]);

  // Fetch team members with meeting counts (only users with connected Fathom accounts)
  const fetchTeamMembers = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoadingTeam(true);

      // Try the RPC function first
      const { data: teamData, error: teamError } = await untypedSupabase
        .rpc('get_team_members_with_connected_accounts') as {
          data: TeamMember[] | null;
          error: Error | null;
        };

      if (teamError) {
        console.warn('RPC get_team_members_with_connected_accounts not available:', teamError);

        // Fallback: Org-scoped membership list (Fathom is now org-scoped)
        const { data: orgMembership } = await untypedSupabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle() as { data: { org_id: string } | null };

        const orgId = orgMembership?.org_id;

        if (!orgId) {
          setTeamMembers([]);
          return;
        }

        const { data: members } = await untypedSupabase
          .from('organization_memberships')
          .select('user_id')
          .eq('org_id', orgId) as { data: { user_id: string }[] | null; error: Error | null };

        const memberIds = (members || []).map(m => m.user_id);
        if (memberIds.length === 0) {
          setTeamMembers([]);
          return;
        }

        // Get basic profile info for display
        const { data: profiles } = await untypedSupabase
          .from('profiles')
          .select('id, email, first_name, last_name')
          .in('id', memberIds) as { data: any[] | null; error: Error | null };

        const profileById = new Map<string, any>();
        (profiles || []).forEach((p: any) => profileById.set(p.id, p));

        // Get meeting counts for org members with transcripts
        const { data: meetingOwners } = await supabase
          .from('meetings')
          .select('owner_user_id')
          .not('transcript_text', 'is', null)
          .neq('transcript_text', '')
          .eq('org_id', orgId)
          .in('owner_user_id', memberIds) as {
            data: { owner_user_id: string }[] | null;
            error: Error | null;
          };

        if (meetingOwners) {
          // Build team members list from org members only (only show users with meetings)
          const fallbackMembers: TeamMember[] = memberIds.map((memberId) => {
            const meetingCount = meetingOwners.filter(m => m.owner_user_id === memberId).length;
            const prof = profileById.get(memberId);
            const email = prof?.email || '';
            const fullName = memberId === user.id
              ? 'Me'
              : ([prof?.first_name, prof?.last_name].filter(Boolean).join(' ') || (email ? email.split('@')[0] : 'Team Member'));
            return {
              user_id: memberId,
              email,
              full_name: fullName,
              meeting_count: meetingCount,
              indexed_count: 0,
            };
          }).filter(m => m.meeting_count > 0); // Only show users with meetings

          setTeamMembers(fallbackMembers);
        }
      } else if (teamData) {
        setTeamMembers(teamData);
      }
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setIsLoadingTeam(false);
    }
  }, [user]);

  // Fetch index status based on selected user filter
  const fetchIndexStatus = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoadingStatus(true);

      const targetUserId = getTargetUserId();

      // First get user's organization ID
      const { data: orgMembership } = await untypedSupabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle() as { data: { org_id: string } | null };

      const orgId = orgMembership?.org_id;

      // Get store info for user's organization
      let storeData: Partial<OrgFileSearchStore> | null = null;
      if (orgId) {
        const { data } = await untypedSupabase
          .from('org_file_search_stores')
          .select('status, total_files, last_sync_at')
          .eq('org_id', orgId)
          .maybeSingle() as { data: Partial<OrgFileSearchStore> | null };
        storeData = data;
      }

      // Try org-based RPC function first
      let statusData: MeetingIndexStatus | null = null;

      if (orgId) {
        const { data: statusOrgData, error: statusOrgError } = await untypedSupabase
          .rpc('get_org_meeting_index_status', {
            p_org_id: orgId,
            p_target_user_id: targetUserId, // null = all team
          }) as {
            data: MeetingIndexStatus[] | MeetingIndexStatus | null;
            error: Error | null;
          };

        if (!statusOrgError && statusOrgData) {
          statusData = Array.isArray(statusOrgData) ? statusOrgData[0] : statusOrgData;
        }
      }

      // Fall back to direct queries if RPC not available
      if (!statusData) {
        // Build the base query
        let meetingsQuery = supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true })
          .not('transcript_text', 'is', null)
          .neq('transcript_text', '');

        if (targetUserId) {
          meetingsQuery = meetingsQuery.eq('owner_user_id', targetUserId);
        }

        const { count: totalMeetings } = await meetingsQuery;

        let indexedQuery = untypedSupabase
          .from('meeting_file_search_index')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'indexed');

        if (orgId) {
          indexedQuery = indexedQuery.eq('org_id', orgId);
        }
        if (targetUserId) {
          indexedQuery = indexedQuery.eq('user_id', targetUserId);
        }

        const { count: indexedCount } = await indexedQuery;

        let pendingQuery = untypedSupabase
          .from('meeting_index_queue')
          .select('id', { count: 'exact', head: true });

        if (targetUserId) {
          pendingQuery = pendingQuery.eq('user_id', targetUserId);
        }

        const { count: pendingCount } = await pendingQuery;

        let failedQuery = untypedSupabase
          .from('meeting_file_search_index')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed');

        if (orgId) {
          failedQuery = failedQuery.eq('org_id', orgId);
        }
        if (targetUserId) {
          failedQuery = failedQuery.eq('user_id', targetUserId);
        }

        const { count: failedCount } = await failedQuery;

        statusData = {
          indexed_count: indexedCount || 0,
          total_meetings: totalMeetings || 0,
          pending_count: pendingCount || 0,
          failed_count: failedCount || 0,
          last_indexed_at: null,
        };
      }

      // Calls counts (always computed locally)
      let totalCalls = 0;
      let callsIndexed = 0;
      let callsPending = 0;
      let callsFailed = 0;

      if (orgId) {
        let callsQuery = supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .not('transcript_text', 'is', null)
          .neq('transcript_text', '');

        if (targetUserId) {
          callsQuery = callsQuery.eq('owner_user_id', targetUserId);
        }

        const { count } = await callsQuery;
        totalCalls = count || 0;

        let callsIndexedQuery = untypedSupabase
          .from('call_file_search_index')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'indexed')
          .eq('org_id', orgId);

        if (targetUserId) {
          callsIndexedQuery = callsIndexedQuery.eq('owner_user_id', targetUserId);
        }

        const { count: indexedCount } = await callsIndexedQuery;
        callsIndexed = indexedCount || 0;

        let callsPendingQuery = untypedSupabase
          .from('call_index_queue')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);

        if (targetUserId) {
          callsPendingQuery = callsPendingQuery.eq('owner_user_id', targetUserId);
        }

        const { count: pendingCount } = await callsPendingQuery;
        callsPending = pendingCount || 0;

        let callsFailedQuery = untypedSupabase
          .from('call_file_search_index')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed')
          .eq('org_id', orgId);

        if (targetUserId) {
          callsFailedQuery = callsFailedQuery.eq('owner_user_id', targetUserId);
        }

        const { count: failedCount } = await callsFailedQuery;
        callsFailed = failedCount || 0;
      }

      setIndexStatus({
        indexed: (Number(statusData?.indexed_count) || 0) + callsIndexed || storeData?.total_files || 0,
        total: (Number(statusData?.total_meetings) || 0) + totalCalls,
        pending: (Number(statusData?.pending_count) || 0) + callsPending,
        failed: (Number(statusData?.failed_count) || 0) + callsFailed,
        status: storeData?.status === 'syncing' ? 'syncing' :
                storeData?.status === 'error' ? 'error' : 'idle',
        lastSyncAt: statusData?.last_indexed_at || storeData?.last_sync_at || null,
      });

    } catch (error) {
      console.error('Error fetching index status:', error);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [user, getTargetUserId]);

  // Fetch team members on mount
  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // Refetch index status when selected user changes
  useEffect(() => {
    fetchIndexStatus();
  }, [fetchIndexStatus, selectedUserId]);

  // Initial fetch and subscribe to updates
  // PERFORMANCE: Added user_id filters to reduce realtime overhead
  // Previously listened to ALL changes across all users
  useEffect(() => {
    if (!user) {
      setIsLoadingStatus(false);
      return;
    }

    // Subscribe to index updates - filtered by user_id
    const indexSubscription = supabase
      .channel(`meeting_file_search_index_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_file_search_index',
          filter: `user_id=eq.${user.id}`, // Only listen to current user's index changes
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    // Subscribe to queue updates - filtered by user_id
    const queueSubscription = supabase
      .channel(`meeting_index_queue_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_index_queue',
          filter: `user_id=eq.${user.id}`, // Only listen to current user's queue changes
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    // Calls: index updates (filtered by owner_user_id)
    const callIndexSubscription = supabase
      .channel(`call_file_search_index_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_file_search_index',
          filter: `owner_user_id=eq.${user.id}`,
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    const callQueueSubscription = supabase
      .channel(`call_index_queue_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_index_queue',
          filter: `owner_user_id=eq.${user.id}`,
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    // Note: org_file_search_stores is org-wide and doesn't have user_id
    // This subscription remains unfiltered but is low-volume (one record per org)
    // and updates are infrequent. Could be filtered by org_id if we had it synchronously.
    const storeSubscription = supabase
      .channel(`org_file_search_stores_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'org_file_search_stores',
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    return () => {
      indexSubscription.unsubscribe();
      storeSubscription.unsubscribe();
      queueSubscription.unsubscribe();
      callIndexSubscription.unsubscribe();
      callQueueSubscription.unsubscribe();
    };
  }, [user, fetchIndexStatus]);

  // Search function — calls meeting-analytics (Railway pgvector + GPT-4o-mini)
  const search = useCallback(async (query: string, filters?: SearchFilters) => {
    if (!user) {
      setSearchError('Not authenticated');
      return;
    }

    if (!query.trim()) {
      setSearchError('Query is required');
      return;
    }

    try {
      setIsSearching(true);
      setSearchError(null);

      const startTime = Date.now();

      // Call meeting-analytics /api/search/ask (Railway-backed RAG)
      const askResponse = await askMeeting({
        question: query.trim(),
        maxMeetings: 20,
      });

      // Map meeting-analytics response to SearchResult format
      const result: SearchResult = {
        answer: askResponse.answer,
        sources: (askResponse.sources || []).map((s) => ({
          source_type: 'meeting' as const,
          source_id: s.transcriptId,
          title: s.transcriptTitle,
          date: (s as any).date || '',
          company_name: null,
          owner_name: null,
          relevance_snippet: s.text,
          sentiment_score: null,
          speaker_name: null,
        })),
        query_metadata: {
          semantic_query: query.trim(),
          filters_applied: filters || {},
          meetings_searched: askResponse.meetingsAnalyzed || 0,
          response_time_ms: Date.now() - startTime,
        },
      };

      setResults(result);
      saveRecentQuery(query.trim());

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      setSearchError(message);
      toast.error('Search Failed', { description: message });
    } finally {
      setIsSearching(false);
    }
  }, [user, saveRecentQuery]);

  // Trigger full index of all meetings (indexes ALL team meetings)
  const triggerFullIndex = useCallback(async () => {
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    try {
      // First get user's organization ID
      const { data: orgMembership } = await untypedSupabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle() as { data: { org_id: string } | null };

      const orgId = orgMembership?.org_id;

      if (!orgId) {
        toast.error('Organization not found', {
          description: 'You must be a member of an organization to use AI search.',
        });
        return;
      }

      // Update org store status to syncing
      await untypedSupabase
        .from('org_file_search_stores')
        .update({ status: 'syncing' })
        .eq('org_id', orgId);

      setIndexStatus(prev => ({ ...prev, status: 'syncing' }));

      // Get ALL meetings with transcripts (team-wide indexing)
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id, owner_user_id')
        .not('transcript_text', 'is', null)
        .gt('transcript_text', '') as { data: { id: string; owner_user_id: string }[] | null; error: Error | null };

      if (meetingsError) {
        throw new Error(`Failed to fetch meetings: ${meetingsError.message}`);
      }

      if (!meetings || meetings.length === 0) {
        toast.info('No conversations to index', {
          description: 'Sync your meetings/calls first to enable AI search.',
        });

        await untypedSupabase
          .from('org_file_search_stores')
          .update({ status: 'active' })
          .eq('org_id', orgId);

        setIndexStatus(prev => ({ ...prev, status: 'idle' }));
        return;
      }

      toast.info(`Indexing conversations from all team members...`, {
        description: 'This may take a few minutes.',
      });

      // Queue all meetings for indexing (with their respective owners)
      const queueItems = meetings.map(m => ({
        meeting_id: m.id,
        user_id: m.owner_user_id,
        priority: 0,
      }));

      const { error: queueError } = await untypedSupabase
        .from('meeting_index_queue')
        .upsert(queueItems, { onConflict: 'meeting_id' });

      if (queueError) {
        console.error('Queue error:', queueError);
      }

      // Get ALL calls with transcripts (team-wide indexing)
      const { data: calls, error: callsError } = await supabase
        .from('calls')
        .select('id, owner_user_id')
        .eq('org_id', orgId)
        .not('transcript_text', 'is', null)
        .gt('transcript_text', '') as { data: { id: string; owner_user_id: string | null }[] | null; error: Error | null };

      if (callsError) {
        throw new Error(`Failed to fetch calls: ${callsError.message}`);
      }

      if (calls && calls.length > 0) {
        const callQueueItems = calls.map(c => ({
          call_id: c.id,
          org_id: orgId,
          owner_user_id: c.owner_user_id,
          priority: 0,
        }));

        const { error: callQueueError } = await untypedSupabase
          .from('call_index_queue')
          .upsert(callQueueItems, { onConflict: 'call_id' });

        if (callQueueError) {
          console.error('Call queue error:', callQueueError);
        }
      }

      // Trigger queue processor (process all, not just current user)
      const response = await supabase.functions.invoke('meeting-intelligence-process-queue', {
        body: {
          limit: 100,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Index processing failed');
      }

      const result = response.data;

      // Update org store status
      await untypedSupabase
        .from('org_file_search_stores')
        .update({ status: 'active' })
        .eq('org_id', orgId);

      toast.success('Indexing complete', {
        description: `Indexed ${result.succeeded || 0} conversations. ${result.failed || 0} failed.`,
      });

      // Refresh status
      fetchIndexStatus();
      fetchTeamMembers();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      toast.error('Indexing Failed', { description: message });

      // Try to update org store status to error
      try {
        const { data: orgMembership } = await untypedSupabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle() as { data: { org_id: string } | null };

        if (orgMembership?.org_id) {
          await untypedSupabase
            .from('org_file_search_stores')
            .update({ status: 'error' })
            .eq('org_id', orgMembership.org_id);
        }
      } catch {
        // Ignore error handling errors
      }

      setIndexStatus(prev => ({ ...prev, status: 'error' }));
    }
  }, [user, fetchIndexStatus, fetchTeamMembers]);

  // Index a single meeting
  const indexMeeting = useCallback(async (meetingId: string) => {
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    try {
      const response = await supabase.functions.invoke('meeting-intelligence-index', {
        body: {
          meetingId,
          forceReindex: true,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Indexing failed');
      }

      const result = response.data;

      if (result.indexed > 0) {
        toast.success('Meeting indexed', {
          description: 'Meeting is now searchable.',
        });
      } else {
        toast.warning('Indexing skipped', {
          description: result.results?.[0]?.message || 'No changes detected.',
        });
      }

      // Refresh status
      fetchIndexStatus();

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      toast.error('Indexing Failed', { description: message });
    }
  }, [user, fetchIndexStatus]);

  // Clear results
  const clearResults = useCallback(() => {
    setResults(null);
    setSearchError(null);
  }, []);

  // Refresh status manually
  const refreshStatus = useCallback(async () => {
    await fetchIndexStatus();
    await fetchTeamMembers();
  }, [fetchIndexStatus, fetchTeamMembers]);

  return {
    // Search
    search,
    results,
    isSearching,
    searchError,

    // Index status
    indexStatus,
    isLoadingStatus,

    // Team filter
    selectedUserId,
    setSelectedUserId,
    teamMembers,
    isLoadingTeam,

    // Actions
    triggerFullIndex,
    indexMeeting,
    clearResults,
    refreshStatus,

    // Query history
    recentQueries,
  };
}
