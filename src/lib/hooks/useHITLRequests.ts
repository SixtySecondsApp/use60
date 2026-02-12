/**
 * useHITLRequests Hook
 *
 * React Query hooks for managing Human-in-the-Loop (HITL) requests.
 * Provides real-time updates for pending requests and response handling.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../supabase/clientV2';
import { useAuth } from '../contexts/AuthContext';
import { useOrg } from '../contexts/OrgContext';
import type { HITLRequest } from './useAgentSequences';
import { SEQUENCE_QUERY_KEYS } from './useAgentSequences';

// =============================================================================
// Types
// =============================================================================

export interface HITLResponseInput {
  requestId: string;
  responseValue: string;
  responseContext?: Record<string, unknown>;
}

export interface HITLRequestWithDetails extends HITLRequest {
  sequence_name?: string;
  requester_name?: string;
  requester_email?: string;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all pending HITL requests for the current organization
 */
export function usePendingHITLRequests() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.pendingHitlRequests(activeOrg?.id || ''),
    queryFn: async (): Promise<HITLRequestWithDetails[]> => {
      if (!activeOrg?.id) return [];

      const { data, error } = await supabase
        .from('hitl_requests')
        .select(`
          *,
          profiles:requested_by_user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('organization_id', activeOrg.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to include requester details
      return (data || []).map((request) => ({
        ...request,
        requester_name:
          (() => {
            const p = request.profiles as { first_name?: string; last_name?: string; email?: string } | null | undefined;
            const name = `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
            return name || p?.email || 'Unknown';
          })(),
        requester_email: (request.profiles as { email?: string })?.email || '',
        profiles: undefined,
      })) as HITLRequestWithDetails[];
    },
    enabled: !!activeOrg?.id,
  });

  // Set up real-time subscription for HITL request changes
  useEffect(() => {
    if (!activeOrg?.id) return;

    const channel = supabase
      .channel(`hitl-requests-${activeOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hitl_requests',
          filter: `organization_id=eq.${activeOrg.id}`,
        },
        (payload) => {
          // Invalidate query to refetch
          queryClient.invalidateQueries({
            queryKey: SEQUENCE_QUERY_KEYS.pendingHitlRequests(activeOrg.id!),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrg?.id, queryClient]);

  return query;
}

/**
 * Fetch HITL requests assigned to the current user
 */
export function useMyHITLRequests() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();

  return useQuery({
    queryKey: [...SEQUENCE_QUERY_KEYS.hitlRequests(), 'my', user?.id || ''],
    queryFn: async (): Promise<HITLRequestWithDetails[]> => {
      if (!activeOrg?.id || !user?.id) return [];

      const { data, error } = await supabase
        .from('hitl_requests')
        .select(`
          *,
          profiles:requested_by_user_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('organization_id', activeOrg.id)
        .eq('status', 'pending')
        .or(`assigned_to_user_id.is.null,assigned_to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((request) => ({
        ...request,
        requester_name:
          (() => {
            const p = request.profiles as { first_name?: string; last_name?: string; email?: string } | null | undefined;
            const name = `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
            return name || p?.email || 'Unknown';
          })(),
        requester_email: (request.profiles as { email?: string })?.email || '',
        profiles: undefined,
      })) as HITLRequestWithDetails[];
    },
    enabled: !!activeOrg?.id && !!user?.id,
  });
}

/**
 * Fetch a single HITL request by ID
 */
export function useHITLRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: SEQUENCE_QUERY_KEYS.hitlRequest(requestId || ''),
    queryFn: async (): Promise<HITLRequest | null> => {
      if (!requestId) return null;

      const { data, error } = await supabase
        .from('hitl_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) throw error;
      return data as HITLRequest;
    },
    enabled: !!requestId,
  });
}

/**
 * Respond to a HITL request
 */
export function useRespondToHITL() {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();

  return useMutation({
    mutationFn: async ({ requestId, responseValue, responseContext }: HITLResponseInput) => {
      const { data, error } = await supabase.rpc('handle_hitl_response', {
        p_request_id: requestId,
        p_response_value: responseValue,
        p_response_context: responseContext || {},
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to submit response');
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate pending requests
      if (activeOrg?.id) {
        queryClient.invalidateQueries({
          queryKey: SEQUENCE_QUERY_KEYS.pendingHitlRequests(activeOrg.id),
        });
      }
      // Invalidate executions to update status
      queryClient.invalidateQueries({
        queryKey: SEQUENCE_QUERY_KEYS.executions(),
      });
    },
  });
}

/**
 * Cancel a HITL request
 */
export function useCancelHITL() {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('hitl_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      // Also update the execution to failed
      const { data: request } = await supabase
        .from('hitl_requests')
        .select('execution_id')
        .eq('id', requestId)
        .single();

      if (request?.execution_id) {
        await supabase
          .from('sequence_executions')
          .update({
            status: 'cancelled',
            waiting_for_hitl: false,
            current_hitl_request_id: null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', request.execution_id);
      }
    },
    onSuccess: () => {
      if (activeOrg?.id) {
        queryClient.invalidateQueries({
          queryKey: SEQUENCE_QUERY_KEYS.pendingHitlRequests(activeOrg.id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: SEQUENCE_QUERY_KEYS.executions(),
      });
    },
  });
}

/**
 * Get count of pending HITL requests for the current user
 */
export function usePendingHITLCount() {
  const { data: requests } = useMyHITLRequests();
  return requests?.length || 0;
}

export default usePendingHITLRequests;
