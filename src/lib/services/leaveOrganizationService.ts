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
 * Uses RPC function for atomic updates
 */
export async function leaveOrganization(
  orgId: string,
  userId: string
): Promise<LeaveOrganizationResult> {
  try {
    // Use RPC function for atomic update of membership and profile
    const { data, error } = await supabase.rpc('user_leave_organization', {
      p_org_id: orgId,
    });

    if (error) {
      console.error('RPC error leaving organization:', error);
      return {
        success: false,
        error: error.message || 'Failed to leave organization',
      };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to leave organization',
      };
    }

    return {
      success: true,
      orgId,
      userId,
    };
  } catch (error: any) {
    console.error('Error leaving organization:', error);
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
