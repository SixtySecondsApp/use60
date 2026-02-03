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
    const { error: updateError } = await supabase
      .from('organization_memberships')
      .update({
        member_status: 'removed',
        removed_at: new Date().toISOString(),
        removed_by: userId, // User removed themselves
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (updateError) {
      return {
        success: false,
        error: 'Failed to leave organization',
      };
    }

    // Set redirect flag so user goes to onboarding screen on next page load
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        redirect_to_onboarding: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Failed to set redirect flag:', profileError);
      // Don't fail the whole operation if this fails - it's non-critical
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
