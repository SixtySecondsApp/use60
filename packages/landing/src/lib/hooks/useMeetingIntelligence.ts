import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/clientV2';
import { useAuth } from '@/lib/contexts/AuthContext';
import { toast } from 'sonner';

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
  meeting_id: string;
  title: string;
  date: string;
  company_name: string | null;
  owner_name?: string | null;
  relevance_snippet: string;
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

        // Fallback: Get users who have active Fathom integrations
        const { data: connectedUsers } = await untypedSupabase
          .from('fathom_integrations')
          .select('user_id, fathom_user_email')
          .eq('is_active', true) as {
            data: { user_id: string; fathom_user_email: string | null }[] | null;
            error: Error | null;
          };

        if (!connectedUsers || connectedUsers.length === 0) {
          setTeamMembers([]);
          return;
        }

        const connectedUserIds = connectedUsers.map(u => u.user_id);

        // Get meeting counts for connected users
        const { data: meetingOwners } = await supabase
          .from('meetings')
          .select('owner_user_id')
          .not('transcript_text', 'is', null)
          .neq('transcript_text', '')
          .in('owner_user_id', connectedUserIds) as {
            data: { owner_user_id: string }[] | null;
            error: Error | null;
          };

        if (meetingOwners) {
          // Build team members list from connected users only
          const fallbackMembers: TeamMember[] = connectedUsers.map(connUser => {
            const meetingCount = meetingOwners.filter(m => m.owner_user_id === connUser.user_id).length;
            return {
              user_id: connUser.user_id,
              email: connUser.fathom_user_email || '',
              full_name: connUser.user_id === user.id ? 'Me' : (connUser.fathom_user_email?.split('@')[0] || 'Team Member'),
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

      setIndexStatus({
        indexed: Number(statusData?.indexed_count) || storeData?.total_files || 0,
        total: Number(statusData?.total_meetings) || 0,
        pending: Number(statusData?.pending_count) || 0,
        failed: Number(statusData?.failed_count) || 0,
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
  useEffect(() => {
    if (!user) {
      setIsLoadingStatus(false);
      return;
    }

    // Subscribe to index updates (listen to all changes for team view)
    const indexSubscription = supabase
      .channel('meeting_file_search_index_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_file_search_index',
        },
        () => {
          fetchIndexStatus();
        }
      )
      .subscribe();

    // Subscribe to org store updates
    const storeSubscription = supabase
      .channel('org_file_search_stores_changes')
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

    // Subscribe to queue updates
    const queueSubscription = supabase
      .channel('meeting_index_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_index_queue',
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

      // Build meeting-analytics URL
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      const askUrl = `${supabaseUrl}/functions/v1/meeting-analytics/api/search/ask`;

      // Get auth headers
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (anonKey) headers['apikey'] = anonKey;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const resp = await fetch(askUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: query.trim(), maxMeetings: 20 }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Search failed (${resp.status}): ${errText}`);
      }

      const json = await resp.json();
      const askData = json.data || json;

      // Map meeting-analytics response to SearchResult format
      const result: SearchResult = {
        answer: askData.answer || '',
        sources: (askData.sources || []).map((s: any) => ({
          meeting_id: s.transcriptId,
          title: s.transcriptTitle || 'Untitled',
          date: s.date || '',
          company_name: null,
          owner_name: null,
          relevance_snippet: s.text || '',
        })),
        query_metadata: {
          semantic_query: query.trim(),
          filters_applied: filters || {},
          meetings_searched: askData.meetingsAnalyzed || 0,
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
  }, [user, getTargetUserId, saveRecentQuery]);

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
        toast.info('No meetings to index', {
          description: 'Sync your Fathom meetings first to enable AI search.',
        });

        await untypedSupabase
          .from('org_file_search_stores')
          .update({ status: 'active' })
          .eq('org_id', orgId);

        setIndexStatus(prev => ({ ...prev, status: 'idle' }));
        return;
      }

      toast.info(`Indexing ${meetings.length} meetings from all team members...`, {
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
        description: `Indexed ${result.succeeded || 0} meetings. ${result.failed || 0} failed.`,
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
