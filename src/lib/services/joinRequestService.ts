/**
 * Join Request Service
 *
 * Handles organization join request operations:
 * - Approving requests (generates magic link token)
 * - Rejecting requests
 * - Validating tokens for accepting requests
 * - Accepting join requests via magic link
 */

import { supabase } from '@/lib/supabase/clientV2';

export interface JoinRequest {
  id: string;
  org_id: string;
  user_id: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  actioned_by?: string;
  actioned_at?: string;
  rejection_reason?: string;
  join_request_token?: string;
  join_request_expires_at?: string;
  user_profile?: Record<string, any>;
}

export interface ApproveRequestResult {
  success: boolean;
  error?: string;
  token?: string;
}

export interface RejectRequestResult {
  success: boolean;
  error?: string;
}

export interface ValidateTokenResult {
  success: boolean;
  error?: string;
  joinRequest?: JoinRequest;
  organization?: {
    id: string;
    name: string;
  };
}

export interface AcceptRequestResult {
  success: boolean;
  error?: string;
  organizationId?: string;
}

/**
 * Approve a join request
 * Uses RPC function which handles permission checks via RLS
 */
export async function approveJoinRequest(
  requestId: string,
  adminUserId: string
): Promise<ApproveRequestResult> {
  try {
    console.log('[joinRequestService] Approving join request via RPC:', requestId);

    // Call RPC function - auth is handled automatically via session
    const { data, error } = await supabase.rpc('approve_join_request', {
      p_request_id: requestId,
    });

    if (error) {
      console.error('[joinRequestService] RPC error:', error);
      return {
        success: false,
        error: error.message || 'Failed to approve join request',
      };
    }

    // RPC returns array with single result
    const result = data?.[0];

    if (!result) {
      console.error('[joinRequestService] No result from RPC');
      return {
        success: false,
        error: 'Failed to approve join request',
      };
    }

    if (!result.success) {
      console.error('[joinRequestService] RPC returned failure:', result.message);
      return {
        success: false,
        error: result.message || 'Failed to approve join request',
      };
    }

    console.log('[joinRequestService] ✅ Join request approved successfully');

    // Update profile status to active
    if (result.user_id) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ profile_status: 'active' })
        .eq('id', result.user_id);

      if (profileError) {
        console.error('[joinRequestService] Failed to update profile status:', profileError);
        // Don't fail - membership was already created
      }
    }

    return {
      success: true,
    };
  } catch (err) {
    console.error('[joinRequestService] Exception in approveJoinRequest:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Reject a join request
 * Uses RPC function which handles permission checks via RLS
 */
export async function rejectJoinRequest(
  requestId: string,
  adminUserId: string,
  reason?: string
): Promise<RejectRequestResult> {
  try {
    console.log('[joinRequestService] Rejecting join request via RPC:', requestId);

    // Call RPC function - auth is handled automatically via session
    const { data, error } = await supabase.rpc('reject_join_request', {
      p_request_id: requestId,
      p_reason: reason || null,
    });

    if (error) {
      console.error('[joinRequestService] RPC error:', error);
      return {
        success: false,
        error: error.message || 'Failed to reject join request',
      };
    }

    // RPC returns array with single result
    const result = data?.[0];

    if (!result) {
      console.error('[joinRequestService] No result from RPC');
      return {
        success: false,
        error: 'Failed to reject join request',
      };
    }

    if (!result.success) {
      console.error('[joinRequestService] RPC returned failure:', result.message);
      return {
        success: false,
        error: result.message || 'Failed to reject join request',
      };
    }

    console.log('[joinRequestService] ✅ Join request rejected successfully');

    return {
      success: true,
    };
  } catch (err) {
    console.error('[joinRequestService] Exception in rejectJoinRequest:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate a join request token
 * Called when user clicks magic link from approval email
 */
export async function validateJoinRequestToken(
  token: string,
  requestId: string
): Promise<ValidateTokenResult> {
  try {
    // Fetch the join request by token
    const { data: joinRequest, error: requestError } = await supabase
      .from('organization_join_requests')
      .select('id, org_id, user_id, email, status, join_request_token, join_request_expires_at')
      .eq('id', requestId)
      .eq('join_request_token', token)
      .eq('status', 'approved')
      .maybeSingle();

    if (requestError) {
      console.error('[joinRequestService] Failed to fetch join request:', requestError);
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }

    if (!joinRequest) {
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }

    // Check if token is expired
    if (joinRequest.join_request_expires_at) {
      const expiresAt = new Date(joinRequest.join_request_expires_at);
      if (expiresAt < new Date()) {
        return {
          success: false,
          error: 'Token has expired. Please contact the organization admin for a new link.',
        };
      }
    }

    // Fetch organization details
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', joinRequest.org_id)
      .single();

    if (orgError || !org) {
      console.error('[joinRequestService] Failed to fetch organization:', orgError);
      return {
        success: false,
        error: 'Organization not found',
      };
    }

    return {
      success: true,
      joinRequest: joinRequest as JoinRequest,
      organization: org,
    };
  } catch (err) {
    console.error('[joinRequestService] Exception in validateJoinRequestToken:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Accept a join request via magic link token
 * Creates membership and marks profile as active
 */
export async function acceptJoinRequest(
  token: string,
  requestId: string
): Promise<AcceptRequestResult> {
  try {
    // First validate the token
    const validation = await validateJoinRequestToken(token, requestId);

    if (!validation.success || !validation.joinRequest || !validation.organization) {
      return {
        success: false,
        error: validation.error || 'Invalid token',
      };
    }

    const joinRequest = validation.joinRequest;
    const orgId = validation.organization.id;

    // Check if user is already a member (shouldn't happen, but be safe)
    const { data: existingMembership } = await supabase
      .from('organization_memberships')
      .select('org_id, user_id')
      .eq('org_id', orgId)
      .eq('user_id', joinRequest.user_id)
      .maybeSingle();

    if (existingMembership) {
      return {
        success: false,
        error: 'You are already a member of this organization',
      };
    }

    // Create membership
    const { error: membershipError } = await supabase
      .from('organization_memberships')
      .insert({
        org_id: orgId,
        user_id: joinRequest.user_id,
        role: 'member',
      });

    if (membershipError) {
      console.error('[joinRequestService] Failed to create membership:', membershipError);
      return {
        success: false,
        error: 'Failed to create membership',
      };
    }

    // Update profile status to active
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ profile_status: 'active' })
      .eq('id', joinRequest.user_id);

    if (profileError) {
      console.error('[joinRequestService] Failed to update profile status:', profileError);
      // Don't fail - membership was already created
    }

    // Mark the join request as having been used by clearing the token
    // Keep status as 'approved' since membership is now created
    const { error: requestUpdateError } = await supabase
      .from('organization_join_requests')
      .update({
        join_request_token: null, // Clear token after use to prevent reuse
      })
      .eq('id', requestId);

    if (requestUpdateError) {
      console.error('[joinRequestService] Failed to clear join request token:', requestUpdateError);
      // Don't fail - the important parts were already done
    }

    return {
      success: true,
      organizationId: orgId,
    };
  } catch (err) {
    console.error('[joinRequestService] Exception in acceptJoinRequest:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get pending join requests for an organization
 * Used by org admins to review requests
 */
export async function getPendingJoinRequests(orgId: string): Promise<JoinRequest[]> {
  try {
    console.log('[joinRequestService] ===== FETCHING JOIN REQUESTS =====');
    console.log('[joinRequestService] Org ID:', orgId);

    // Check auth state
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[joinRequestService] Auth session exists:', !!session);
    console.log('[joinRequestService] User ID:', session?.user?.id);
    console.log('[joinRequestService] User email:', session?.user?.email);

    // Step 1: Fetch join requests (without embedded profile join)
    // Note: Only selecting columns that exist in base migration
    // join_request_token and join_request_expires_at columns may not exist yet
    const { data: joinRequests, error } = await supabase
      .from('organization_join_requests')
      .select(`
        id,
        org_id,
        user_id,
        email,
        status,
        requested_at,
        actioned_by,
        actioned_at,
        rejection_reason
      `)
      .eq('org_id', orgId)
      .eq('status', 'pending') // Only show pending requests (approved ones become members immediately)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('[joinRequestService] ❌ Query failed with error:', error);
      console.error('[joinRequestService] Error code:', error.code);
      console.error('[joinRequestService] Error message:', error.message);
      console.error('[joinRequestService] Error details:', error.details);
      console.error('[joinRequestService] Error hint:', error.hint);
      return [];
    }

    console.log('[joinRequestService] ✅ Join requests query succeeded');
    console.log('[joinRequestService] Number of results:', joinRequests?.length || 0);

    if (!joinRequests || joinRequests.length === 0) {
      console.warn('[joinRequestService] ⚠️ No pending requests found for org:', orgId);
      return [];
    }

    // Log what we have in user_profile (stored in join request table)
    joinRequests.forEach((req, idx) => {
      console.log(`[joinRequestService] Request ${idx + 1}:`, {
        email: req.email,
        status: req.status,
        org_id: req.org_id,
        user_profile_data: req.user_profile,
        has_first_name: !!(req.user_profile as any)?.first_name,
        has_last_name: !!(req.user_profile as any)?.last_name,
      });
    });

    // Return join requests as-is - they already have user_profile data from the table
    // No need to fetch profiles separately (would be blocked by RLS anyway)
    return joinRequests as JoinRequest[];
  } catch (err) {
    console.error('[joinRequestService] ❌ Exception in getPendingJoinRequests:', err);
    return [];
  }
}

/**
 * Get join request details by user
 * Check what requests a user has made
 */
export async function getUserJoinRequests(userId: string): Promise<JoinRequest[]> {
  try {
    const { data, error } = await supabase
      .from('organization_join_requests')
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('[joinRequestService] Failed to get user join requests:', error);
      return [];
    }

    return (data || []) as JoinRequest[];
  } catch (err) {
    console.error('[joinRequestService] Exception in getUserJoinRequests:', err);
    return [];
  }
}

/**
 * Cancel a pending join request
 * Allows user to cancel and restart onboarding
 * Handles both organization_join_requests and rejoin_requests
 */
export async function cancelJoinRequest(
  requestId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // First try the RPC (works if deployed)
    const { data, error } = await supabase.rpc('cancel_join_request', {
      p_request_id: requestId,
      p_user_id: userId,
    });

    if (error) {
      console.warn('[joinRequestService] RPC call failed, trying direct deletion:', error.message);
      // Fall through to direct deletion approach
    } else if (data?.[0]?.success) {
      return { success: true };
    } else if (data?.[0]) {
      console.warn('[joinRequestService] RPC returned failure, trying direct deletion:', data[0].message);
      // Fall through to direct deletion approach
    }

    // Fallback: Try to delete from organization_join_requests
    console.log('[joinRequestService] Attempting direct deletion from organization_join_requests...');
    let { data: joinReqData, error: joinReqError } = await supabase
      .from('organization_join_requests')
      .select('id')
      .eq('id', requestId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (joinReqData) {
      const { error: deleteError } = await supabase
        .from('organization_join_requests')
        .delete()
        .eq('id', requestId)
        .eq('user_id', userId);

      if (!deleteError) {
        console.log('[joinRequestService] ✅ Deleted from organization_join_requests');
        await resetOnboardingState(userId);
        return { success: true };
      } else {
        console.warn('[joinRequestService] Failed to delete from organization_join_requests:', deleteError);
      }
    }

    // Fallback: Try to delete from rejoin_requests
    console.log('[joinRequestService] Attempting direct deletion from rejoin_requests...');
    const { data: rejoinData, error: rejoinError } = await supabase
      .from('rejoin_requests')
      .select('id')
      .eq('id', requestId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (rejoinData) {
      const { error: deleteError } = await supabase
        .from('rejoin_requests')
        .delete()
        .eq('id', requestId)
        .eq('user_id', userId);

      if (!deleteError) {
        console.log('[joinRequestService] ✅ Deleted from rejoin_requests');
        await resetOnboardingState(userId);
        return { success: true };
      } else {
        console.error('[joinRequestService] Failed to delete from rejoin_requests:', deleteError);
        return {
          success: false,
          error: deleteError.message || 'Failed to cancel rejoin request',
        };
      }
    }

    // Request not found in either table
    console.error('[joinRequestService] Request not found in either table');
    return {
      success: false,
      error: 'Join request not found or already processed',
    };
  } catch (err) {
    console.error('[joinRequestService] Exception in cancelJoinRequest:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Helper function to reset onboarding state after canceling a request
 */
async function resetOnboardingState(userId: string): Promise<void> {
  try {
    // Reset profile status to active
    await supabase
      .from('profiles')
      .update({ profile_status: 'active' })
      .eq('id', userId);

    // Reset onboarding progress
    await supabase
      .from('user_onboarding_progress')
      .upsert(
        {
          user_id: userId,
          onboarding_step: 'website_input',
          onboarding_completed_at: null,
        },
        { onConflict: 'user_id' }
      );

    console.log('[joinRequestService] Reset onboarding state for user:', userId);
  } catch (err) {
    console.error('[joinRequestService] Error resetting onboarding state:', err);
  }
}
