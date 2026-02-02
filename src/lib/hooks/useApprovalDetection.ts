/**
 * useApprovalDetection Hook
 *
 * Centralized React Query hook for detecting approval status of join requests.
 * Checks both organization_memberships (source of truth) and organization_join_requests.
 *
 * Returns:
 * - isApproved: true if user has active membership in the organization
 * - membership: the membership record if approved
 * - isPending: true if there's a pending join request
 * - error: error message if queries fail
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/clientV2';

export interface OrganizationMembership {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface JoinRequest {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
}

export interface ApprovalDetectionResult {
  isApproved: boolean;
  membership: OrganizationMembership | null;
  isPending: boolean;
  error: string | null;
}

/**
 * Hook to detect if a user's join request has been approved
 *
 * @param userId - The user ID to check approval for
 * @param orgId - Optional organization ID to check (if known)
 * @param enabled - Whether to run the query (default: true)
 */
export function useApprovalDetection(
  userId: string | undefined,
  orgId?: string,
  enabled: boolean = true
): ApprovalDetectionResult & { isLoading: boolean; refetch: () => void } {
  // Query for organization memberships (source of truth)
  const {
    data: membershipData,
    error: membershipError,
    isLoading: membershipLoading,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ['approval-detection', 'membership', userId, orgId],
    queryFn: async () => {
      if (!userId) return null;

      let query = supabase
        .from('organization_memberships')
        .select('id, org_id, user_id, role, created_at')
        .eq('user_id', userId);

      // If orgId is provided, filter by it
      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('[useApprovalDetection] Error fetching membership:', error);
        throw new Error(error.message);
      }

      return data as OrganizationMembership | null;
    },
    enabled: enabled && !!userId,
    staleTime: 1000, // 1 second - frequently refetch for real-time detection
    refetchOnWindowFocus: true,
  });

  // Query for join requests (fallback check)
  const {
    data: joinRequestData,
    error: joinRequestError,
    isLoading: joinRequestLoading,
    refetch: refetchJoinRequest,
  } = useQuery({
    queryKey: ['approval-detection', 'join-request', userId, orgId],
    queryFn: async () => {
      if (!userId) return null;

      let query = supabase
        .from('organization_join_requests')
        .select('id, org_id, user_id, email, status, requested_at')
        .eq('user_id', userId)
        .eq('status', 'pending');

      // If orgId is provided, filter by it
      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('[useApprovalDetection] Error fetching join request:', error);
        throw new Error(error.message);
      }

      return data as JoinRequest | null;
    },
    enabled: enabled && !!userId,
    staleTime: 1000, // 1 second - frequently refetch for real-time detection
    refetchOnWindowFocus: true,
  });

  // Refetch both queries
  const refetch = () => {
    refetchMembership();
    refetchJoinRequest();
  };

  // Determine approval status
  const isApproved = !!membershipData;
  const isPending = !isApproved && !!joinRequestData;
  const isLoading = membershipLoading || joinRequestLoading;
  const error =
    membershipError?.message || joinRequestError?.message || null;

  return {
    isApproved,
    membership: membershipData || null,
    isPending,
    error,
    isLoading,
    refetch,
  };
}
