import { supabase } from '@/lib/supabase/clientV2';

export interface Organization {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  company_domain?: string;
  company_website?: string;
  company_country_code?: string;
  company_timezone?: string;
  company_industry?: string;
  company_size?: string;
}

export interface OrganizationWithMemberCount extends Organization {
  member_count: number;
  owner?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  };
}

/**
 * Get all organizations with member counts
 */
export async function getAllOrganizations(): Promise<OrganizationWithMemberCount[]> {
  try {
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (orgsError) throw orgsError;

    // Get member counts for each org
    const orgsWithCounts = await Promise.all(
      (orgs || []).map(async (org) => {
        // Count only ACTIVE members (consistent with other queries)
        // This filters out removed members and NULL status values
        let countQuery = supabase
          .from('organization_memberships')
          .select('*', { count: 'exact' })
          .eq('org_id', org.id)
          .eq('member_status', 'active');

        let { count, error: countError } = await countQuery;

        // If member_status column doesn't exist, retry without it
        if (countError && countError.code === '42703') {
          const { count: fallbackCount, error: fallbackError } = await supabase
            .from('organization_memberships')
            .select('*', { count: 'exact' })
            .eq('org_id', org.id);
          count = fallbackCount;
          countError = fallbackError;
        }

        if (countError) console.error('Error counting members:', countError);

        // Get org owner (with fallback for empty orgs or older schema)
        let { data: owner, error: ownerError } = await supabase
          .from('organization_memberships')
          .select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')
          .eq('org_id', org.id)
          .eq('role', 'owner')
          .neq('member_status', 'removed')
          .maybeSingle();

        // If relationship lookup fails (406 error), retry without the join
        if (ownerError && (ownerError.code === '406' || ownerError.code === 'PGRST116' || ownerError.code === 'PGRST200')) {
          const { data: fallbackOwner } = await supabase
            .from('organization_memberships')
            .select('user_id')
            .eq('org_id', org.id)
            .eq('role', 'owner')
            .neq('member_status', 'removed')
            .limit(1);
          if (fallbackOwner && fallbackOwner.length > 0) {
            owner = { user_id: fallbackOwner[0].user_id };
          }
        }

        return {
          ...org,
          member_count: count || 0,
          owner: owner?.profiles || undefined,
        };
      })
    );

    return orgsWithCounts;
  } catch (error: any) {
    console.error('Error fetching organizations:', error);
    throw error;
  }
}

/**
 * Get a single organization with details
 */
export async function getOrganization(orgId: string): Promise<OrganizationWithMemberCount | null> {
  try {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) {
      if (orgError.code === 'PGRST116') return null; // Not found
      throw orgError;
    }

    // Get member count (only ACTIVE members for consistency)
    let countQuery = supabase
      .from('organization_memberships')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('member_status', 'active');

    let { count, error: countError } = await countQuery;

    // If member_status column doesn't exist, retry without it
    if (countError && countError.code === '42703') {
      const { count: fallbackCount } = await supabase
        .from('organization_memberships')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId);
      count = fallbackCount;
    }

    // Get org owner (with fallback for empty orgs or relationship failures)
    let { data: owner, error: ownerError } = await supabase
      .from('organization_memberships')
      .select('user_id, profiles!user_id(id, email, first_name, last_name, avatar_url)')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .neq('member_status', 'removed')
      .maybeSingle();

    // If relationship lookup fails (406 error), retry without the join
    if (ownerError && (ownerError.code === '406' || ownerError.code === 'PGRST116' || ownerError.code === 'PGRST200')) {
      const { data: fallbackOwner } = await supabase
        .from('organization_memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .neq('member_status', 'removed')
        .limit(1);
      if (fallbackOwner && fallbackOwner.length > 0) {
        owner = { user_id: fallbackOwner[0].user_id };
      }
    }

    return {
      ...org,
      member_count: count || 0,
      owner: owner?.profiles || undefined,
    };
  } catch (error: any) {
    console.error('Error fetching organization:', error);
    throw error;
  }
}

/**
 * Rename an organization
 */
export async function renameOrganization(
  orgId: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('organizations')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error renaming organization:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Toggle organization active status
 */
export async function toggleOrganizationStatus(
  orgId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('organizations')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error toggling organization status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update organization details
 */
export async function updateOrganization(
  orgId: string,
  updates: Partial<Organization>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('organizations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error updating organization:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get organization members
 */
export async function getOrganizationMembers(orgId: string) {
  try {
    // Fetch all active members (including those with NULL status for backwards compatibility)
    // Note: member_status was added in recent migration, so pre-migration records have NULL
    const { data, error } = await supabase
      .from('organization_memberships')
      .select(`
        user_id,
        role,
        member_status,
        created_at,
        profiles!user_id (
          id,
          email,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('org_id', orgId)
      .neq('member_status', 'removed')  // Exclude removed members
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error: any) {
    console.error('Error fetching organization members:', error);
    throw error;
  }
}

/**
 * Change member role
 */
export async function changeOrganizationMemberRole(
  orgId: string,
  userId: string,
  newRole: 'owner' | 'admin' | 'member' | 'readonly'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if this would result in no owners
    if (newRole !== 'owner') {
      let query = supabase
        .from('organization_memberships')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .neq('member_status', 'removed');  // Include active and NULL status members

      let { count: ownerCount, error: ownerCountError } = await query;

      // If member_status column doesn't exist, retry without it
      if (ownerCountError && ownerCountError.code === '42703') {
        const { count: fallbackCount } = await supabase
          .from('organization_memberships')
          .select('*', { count: 'exact' })
          .eq('org_id', orgId)
          .eq('role', 'owner');
        ownerCount = fallbackCount;
      }

      if ((ownerCount || 0) <= 1) {
        // Check if this user is the owner
        const { data: member } = await supabase
          .from('organization_memberships')
          .select('role')
          .eq('org_id', orgId)
          .eq('user_id', userId)
          .single();

        if (member?.role === 'owner') {
          return {
            success: false,
            error: 'Cannot remove the last owner. Promote another member to owner first.',
          };
        }
      }
    }

    const { error } = await supabase
      .from('organization_memberships')
      .update({ role: newRole })
      .eq('org_id', orgId)
      .eq('user_id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error changing member role:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove member from organization
 */
export async function removeOrganizationMember(
  orgId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validation: Check if user is the last owner
    let ownerQuery = supabase
      .from('organization_memberships')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .neq('member_status', 'removed');  // Include active and NULL status members

    let { count: ownerCount, error: ownerCountError } = await ownerQuery;

    // If member_status column doesn't exist, retry without it
    if (ownerCountError && ownerCountError.code === '42703') {
      const { count: fallbackCount } = await supabase
        .from('organization_memberships')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('role', 'owner');
      ownerCount = fallbackCount;
    }

    if ((ownerCount || 0) <= 1) {
      const { data: member } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .single();

      if (member?.role === 'owner') {
        return {
          success: false,
          error: 'Cannot remove the last owner. Promote another member to owner first.',
        };
      }
    }

    // Use the RPC function if available
    try {
      const { data, error: rpcError } = await supabase.rpc('remove_user_from_org', {
        p_org_id: orgId,
        p_user_id: userId,
      });

      if (rpcError) {
        console.warn('RPC error, attempting fallback:', rpcError);
        throw rpcError; // Fall through to fallback
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to remove member');
      }

      return { success: true };
    } catch (rpcError: any) {
      // Fallback to manual update if RPC fails (schema cache issue)
      console.warn('RPC unavailable, using direct database update:', rpcError.message);

      const { error } = await supabase
        .from('organization_memberships')
        .update({
          member_status: 'removed',
          removed_at: new Date().toISOString(),
          removed_by: (await supabase.auth.getUser()).data.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('org_id', orgId)
        .eq('user_id', userId);

      if (error) {
        console.error('Fallback update failed:', error);
        throw error;
      }

      return { success: true };
    }
  } catch (error: any) {
    console.error('Error removing member:', error);
    return {
      success: false,
      error: error.message || 'Failed to remove member from organization',
    };
  }
}

/**
 * Add member to organization (by email)
 */
export async function addOrganizationMember(
  orgId: string,
  email: string,
  role: 'admin' | 'member' | 'readonly' = 'member'
): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userError) {
      return {
        success: false,
        error: 'User with this email not found',
      };
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('organization_memberships')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: 'User is already a member of this organization',
      };
    }

    // Add member
    const { error: insertError } = await supabase.from('organization_memberships').insert({
      org_id: orgId,
      user_id: user.id,
      role,
      member_status: 'active',
    });

    if (insertError) throw insertError;

    return { success: true, userId: user.id };
  } catch (error: any) {
    console.error('Error adding member:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete an organization (hard delete)
 * This will cascade delete all related data:
 * - All 94 organization-linked tables (integrations, meetings, calls, recordings, etc.)
 * - All organization memberships (soft-deleted with member_status = 'removed')
 * - Users are reset to onboarding state so they can join/create a new organization
 */
export async function deleteOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUserId = (await supabase.auth.getUser()).data.user?.id || null;

    // Step 1: Get all active member user IDs before deletion
    // We need these to reset their onboarding state after the org is gone
    const { data: members, error: membersQueryError } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .neq('member_status', 'removed');

    if (membersQueryError) {
      console.warn('Error fetching members for cleanup, continuing with deletion:', membersQueryError);
    }

    const memberUserIds = (members || []).map((m) => m.user_id);

    // Step 2: Soft-delete all members to preserve audit trail
    const { error: memberError } = await supabase
      .from('organization_memberships')
      .update({
        member_status: 'removed',
        removed_at: new Date().toISOString(),
        removed_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId);

    if (memberError) throw memberError;

    // Step 3: Reset user state for members who have NO other active org memberships
    // This ensures they go through onboarding to join/create a new org
    if (memberUserIds.length > 0) {
      for (const userId of memberUserIds) {
        // Check if user has any OTHER active org membership
        const { data: otherMemberships } = await supabase
          .from('organization_memberships')
          .select('org_id')
          .eq('user_id', userId)
          .eq('member_status', 'active')
          .neq('org_id', orgId)
          .limit(1);

        const hasOtherOrg = (otherMemberships || []).length > 0;

        if (!hasOtherOrg) {
          // User will have no org after deletion — reset their onboarding progress
          // so they go through the full onboarding flow again
          await supabase
            .from('user_onboarding_progress')
            .update({
              onboarding_step: 'website_input',
              onboarding_completed_at: null,
              skipped_onboarding: false,
            })
            .eq('user_id', userId);

          // Set redirect flag so the app knows to route them to onboarding
          await supabase
            .from('profiles')
            .update({ redirect_to_onboarding: true })
            .eq('id', userId);
        }
      }
    }

    // Step 4: Hard-delete the organization
    // CASCADE DELETE constraints will automatically remove all organization-linked tables:
    // - Fathom, HubSpot, JustCall, Savvycal, Gmail, Slack, Sentry integrations
    // - Meetings, calls, recordings, meeting data
    // - Organization settings, preferences, feature flags
    // - Billing, usage, notification data
    // - AI conversations, sequences, automation rules
    // - All pending invitations to this organization
    const { error: orgError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (orgError) throw orgError;
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    return { success: false, error: error.message };
  }
}
