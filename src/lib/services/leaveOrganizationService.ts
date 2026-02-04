import { supabase } from '@/lib/supabase/clientV2';

export interface LeaveOrganizationResult {
  success: boolean;
  error?: string;
  orgId?: string;
  userId?: string;
}

/**
 * Leave an organization
 * User must not be the owner - owners must transfer ownership first
 */
export async function leaveOrganization(
  orgId: string,
  userId: string
): Promise<LeaveOrganizationResult> {
  try {
    console.log('[leaveOrganization] Starting leave process:', { orgId, userId });

    // Get current session to verify authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('[leaveOrganization] No session - cannot proceed:', sessionError);
      return await leaveOrganizationFallback(orgId, userId);
    }

    console.log('[leaveOrganization] Session valid, attempting RPC call');

    // First, try using RPC function which has SECURITY DEFINER to bypass RLS
    const { data, error: rpcError } = await supabase
      .rpc('user_leave_organization', {
        p_org_id: orgId,
      });

    console.log('[leaveOrganization] RPC response:', { data, error: rpcError });

    // If RPC function doesn't exist (PGRST202), try fallback direct update
    if (rpcError && (rpcError.code === 'PGRST202' || rpcError.message?.includes('Could not find the function'))) {
      console.warn('[leaveOrganization] RPC not available, trying fallback direct update...');
      return await leaveOrganizationFallback(orgId, userId);
    }

    if (rpcError) {
      console.error('[leaveOrganization] RPC error:', rpcError);
      // Still try fallback even on error - user might not have been authenticated or other transient issues
      console.warn('[leaveOrganization] RPC failed, attempting fallback...');
      return await leaveOrganizationFallback(orgId, userId);
    }

    if (!data) {
      console.warn('[leaveOrganization] No data returned from RPC, trying fallback');
      return await leaveOrganizationFallback(orgId, userId);
    }

    // RPC might return an array or an object - handle both cases
    const result = Array.isArray(data) ? data[0] : data;

    if (!result || !result.success) {
      console.warn('[leaveOrganization] RPC returned failure:', result?.error);
      return {
        success: false,
        error: result?.error || 'Failed to leave organization',
      };
    }

    console.log('[leaveOrganization] ✓ Successfully left organization via RPC:', {
      orgId: result.orgId,
      userId: result.userId,
      removedAt: result.removedAt,
    });

    // Verify the database was actually updated
    const { data: verification, error: verifyError } = await supabase
      .from('organization_memberships')
      .select('member_status')
      .eq('org_id', result.orgId)
      .eq('user_id', result.userId)
      .maybeSingle();

    if (verifyError || !verification) {
      console.warn('[leaveOrganization] Could not verify membership update:', verifyError);
    } else {
      console.log('[leaveOrganization] Verified member_status:', verification.member_status);
      if (verification.member_status !== 'removed') {
        console.error('[leaveOrganization] CRITICAL: member_status is NOT removed! Actual:', verification.member_status);
        // The RPC claimed success but didn't actually update - return error
        return {
          success: false,
          error: 'Failed to leave organization: member status not updated',
        };
      }
    }

    return {
      success: true,
      orgId: result.orgId,
      userId: result.userId,
    };
  } catch (error: any) {
    console.error('[leaveOrganization] Exception caught:', error);
    // Try fallback on any exception
    console.warn('[leaveOrganization] Exception occurred, attempting fallback...');
    return await leaveOrganizationFallback(orgId, userId);
  }
}

/**
 * Fallback approach if RPC function is not available
 * Attempts direct table updates (may fail due to RLS)
 */
async function leaveOrganizationFallback(
  orgId: string,
  userId: string
): Promise<LeaveOrganizationResult> {
  try {
    // First, check if user is an owner
    const { data: membership, error: fetchError } = await supabase
      .from('organization_memberships')
      .select('role, member_status')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      return {
        success: false,
        error: 'Failed to fetch membership information',
      };
    }

    if (!membership) {
      return {
        success: false,
        error: 'You are not a member of this organization',
      };
    }

    if (membership.role === 'owner') {
      return {
        success: false,
        error: 'Organization owners must transfer ownership before leaving. Please promote another member to owner and try again.',
      };
    }

    if (membership.member_status === 'removed') {
      return {
        success: false,
        error: 'You have already been removed from this organization',
      };
    }

    // Perform soft delete: mark membership as removed
    console.log('[leaveOrganizationFallback] Updating member_status to removed');
    const { error: updateError } = await supabase
      .from('organization_memberships')
      .update({
        member_status: 'removed',
        removed_at: new Date().toISOString(),
        removed_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[leaveOrganizationFallback] Membership update error:', updateError);
      return {
        success: false,
        error: 'Failed to leave organization: ' + (updateError.message || 'database update failed'),
      };
    }

    // Verify the update actually happened
    console.log('[leaveOrganizationFallback] Verifying member_status update');
    const { data: verification, error: verifyError } = await supabase
      .from('organization_memberships')
      .select('member_status, updated_at')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();

    if (verifyError || !verification) {
      console.error('[leaveOrganizationFallback] Could not verify update:', verifyError);
      return {
        success: false,
        error: 'Failed to verify membership update',
      };
    }

    console.log('[leaveOrganizationFallback] Verified update - member_status:', verification.member_status);
    if (verification.member_status !== 'removed') {
      console.error('[leaveOrganizationFallback] CRITICAL: member_status is NOT removed! Actual:', verification.member_status);
      return {
        success: false,
        error: 'Failed to leave organization: member_status not updated to removed',
      };
    }

    // Set redirect flag - non-blocking, continue even if this fails
    try {
      await supabase
        .from('profiles')
        .update({
          redirect_to_onboarding: true,
        })
        .eq('id', userId);
    } catch (error) {
      console.error('[leaveOrganizationFallback] Failed to set redirect flag:', error);
      // Don't fail - membership is already updated
    }

    console.log('[leaveOrganization] ✓ Successfully left organization via fallback:', {
      orgId,
      userId,
    });

    return {
      success: true,
      orgId,
      userId,
    };
  } catch (error: any) {
    console.error('Error in fallback leave organization:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Check if a user is the last owner of an organization
 */
export async function isLastOwner(orgId: string, userId: string): Promise<boolean> {
  try {
    // Check if this user is an owner
    const { data: userMembership, error: userError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('member_status', 'active')
      .maybeSingle();

    if (userError || !userMembership || userMembership.role !== 'owner') {
      return false;
    }

    // Count active owners
    const { data, count, error: countError } = await supabase
      .from('organization_memberships')
      .select('org_id', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('member_status', 'active');

    if (countError) {
      console.error('Error counting owners:', countError);
      return false;
    }

    return (count || 0) <= 1;
  } catch (error: any) {
    console.error('Error checking if last owner:', error);
    return false;
  }
}
