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
        const { count, error: countError } = await supabase
          .from('organization_memberships')
          .select('*', { count: 'exact' })
          .eq('org_id', org.id)
          .eq('member_status', 'active');

        if (countError) console.error('Error counting members:', countError);

        // Get org owner
        const { data: owner } = await supabase
          .from('organization_memberships')
          .select('user_id, profiles!user_id(id, email, first_name, last_name)')
          .eq('org_id', org.id)
          .eq('role', 'owner')
          .eq('member_status', 'active')
          .single();

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

    // Get member count
    const { count } = await supabase
      .from('organization_memberships')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('member_status', 'active');

    // Get org owner
    const { data: owner } = await supabase
      .from('organization_memberships')
      .select('user_id, profiles!user_id(id, email, first_name, last_name)')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('member_status', 'active')
      .single();

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
    const { data, error } = await supabase
      .from('organization_memberships')
      .select(`
        id,
        user_id,
        role,
        member_status,
        created_at,
        profiles!user_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('org_id', orgId)
      .eq('member_status', 'active')
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
      const { count: ownerCount } = await supabase
        .from('organization_memberships')
        .select('*', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .eq('member_status', 'active');

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
    const { count: ownerCount } = await supabase
      .from('organization_memberships')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('member_status', 'active');

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
 * Delete an organization (soft delete - mark as inactive)
 */
export async function deleteOrganization(orgId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('organizations')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', orgId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting organization:', error);
    return { success: false, error: error.message };
  }
}
