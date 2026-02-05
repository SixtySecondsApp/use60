import { supabase } from '@/lib/supabase/clientV2';
import { logger } from '@/lib/utils/logger';
import { toast } from 'sonner';

export interface DeactivationResult {
  success: boolean;
  message: string;
  orgId?: string;
  requestId?: string;
  deadlineDate?: string;
  deactivatedAt?: string;
  error?: string;
}

export interface OrgMember {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'admin' | 'member' | 'readonly';
}

/**
 * Validate that an owner can deactivate the organization
 * Returns null if can deactivate, error message if cannot
 */
export async function validateOwnerCanDeactivate(orgId: string): Promise<string | null> {
  try {
    const { data: currentUser } = await supabase.auth.getUser();
    if (!currentUser.user?.id) {
      return 'Not authenticated';
    }

    // Check if user is owner of this org
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', currentUser.user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return 'Not a member of this organization';
    }

    if (membership.role !== 'owner') {
      return 'Only organization owners can deactivate';
    }

    // FIXED: Removed check for other active organizations
    // Users can now deactivate their only organization

    return null; // Can deactivate
  } catch (error) {
    logger.error('[OrganizationDeactivationService] Error validating deactivation:', error);
    throw error;
  }
}

/**
 * Deactivate an organization as the owner
 * Initiates the deactivation process and schedules cleanup
 */
export async function deactivateOrganizationAsOwner(
  orgId: string,
  reason: string = 'Owner requested deactivation'
): Promise<DeactivationResult> {
  try {
    logger.log('[OrganizationDeactivationService] Deactivating org:', orgId, 'Reason:', reason);

    // Call RPC function
    const { data, error } = await supabase.rpc('deactivate_organization_by_owner', {
      p_org_id: orgId,
      p_reason: reason
    });

    if (error) {
      logger.error('[OrganizationDeactivationService] RPC error:', error);
      return {
        success: false,
        message: error.message || 'Failed to deactivate organization',
        error: error.message
      };
    }

    logger.log('[OrganizationDeactivationService] Deactivation successful:', data);

    if (!data.success) {
      return {
        success: false,
        message: data.error || 'Unknown error',
        error: data.error
      };
    }

    // Get all org members for notification
    try {
      await triggerDeactivationNotifications(orgId, reason);
    } catch (notificationError) {
      logger.error('[OrganizationDeactivationService] Error sending notifications:', notificationError);
      // Don't fail the deactivation if notifications fail - log and continue
    }

    return {
      success: true,
      message: 'Organization deactivated successfully',
      orgId: data.org_id || orgId,
      requestId: data.request_id,
      deadlineDate: data.deadline_date,
      deactivatedAt: data.deactivated_at
    };
  } catch (error) {
    logger.error('[OrganizationDeactivationService] Error deactivating organization:', error);
    return {
      success: false,
      message: 'An unexpected error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get all members of an organization (for notification purposes)
 */
export async function getAllOrgMembers(orgId: string): Promise<OrgMember[]> {
  try {
    const { data: memberships, error: membershipsError } = await supabase
      .from('organization_memberships')
      .select(
        `
        user_id,
        role,
        profiles!organization_memberships_user_id_fkey(id, email, full_name)
      `
      )
      .eq('org_id', orgId)
      .neq('member_status', 'removed'); // Exclude removed members, include active and NULL status for backwards compatibility

    if (membershipsError) throw membershipsError;

    return (memberships || []).map((m) => ({
      id: m.user_id,
      email: m.profiles?.email || 'unknown@example.com',
      full_name: m.profiles?.full_name || 'Unknown User',
      role: m.role as OrgMember['role']
    }));
  } catch (error) {
    logger.error('[OrganizationDeactivationService] Error fetching org members:', error);
    throw error;
  }
}

/**
 * Trigger email notifications for deactivation
 * Sends owner confirmation email and member notification emails
 */
async function triggerDeactivationNotifications(orgId: string, reason: string): Promise<void> {
  try {
    // Get org details
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, deactivated_at, deactivated_by')
      .eq('id', orgId)
      .single();

    if (orgError) throw orgError;
    if (!org) throw new Error('Organization not found');

    // Get all members
    const members = await getAllOrgMembers(orgId);
    if (members.length === 0) {
      logger.log('[OrganizationDeactivationService] No members to notify');
      return;
    }

    // Get deactivator info
    const { data: deactivatorProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', org.deactivated_by)
      .single();

    const deactivatorName = deactivatorProfile?.full_name || 'An administrator';

    // Calculate deadline
    const deadlineDate = new Date(org.deactivated_at);
    deadlineDate.setDate(deadlineDate.getDate() + 30);

    // Prepare notification payload
    const notificationPayload = {
      org_id: orgId,
      org_name: org.name,
      deactivated_by_name: deactivatorName,
      deactivation_reason: reason,
      deactivated_at: org.deactivated_at,
      reactivation_deadline: deadlineDate.toISOString().split('T')[0],
      member_emails: members.map((m) => m.email)
    };

    logger.log('[OrganizationDeactivationService] Triggering notifications:', notificationPayload);

    // Call edge function to send notifications
    const { error: notificationError } = await supabase.functions.invoke(
      'send-org-deactivation-email',
      {
        body: notificationPayload
      }
    );

    if (notificationError) {
      logger.error('[OrganizationDeactivationService] Notification error:', notificationError);
      // Don't throw - notifications are important but not blocking
    }
  } catch (error) {
    logger.error('[OrganizationDeactivationService] Error triggering notifications:', error);
    throw error;
  }
}

/**
 * Get deactivation status for an organization
 */
export async function getDeactivationStatus(orgId: string) {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, is_active, deactivated_at, deactivated_by, deactivation_reason, deletion_scheduled_at')
      .eq('id', orgId)
      .single();

    if (error) throw error;

    if (!data || data.is_active) {
      return null;
    }

    // Calculate days remaining
    const now = new Date();
    const deletionDate = data.deletion_scheduled_at ? new Date(data.deletion_scheduled_at) : null;
    const daysRemaining = deletionDate ? Math.ceil((deletionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

    return {
      orgId: data.id,
      orgName: data.name,
      deactivatedAt: data.deactivated_at,
      deactivationReason: data.deactivation_reason,
      deletionScheduledAt: data.deletion_scheduled_at,
      daysRemaining: daysRemaining || 0,
      isOverdue: daysRemaining !== null && daysRemaining <= 0
    };
  } catch (error) {
    logger.error('[OrganizationDeactivationService] Error fetching deactivation status:', error);
    throw error;
  }
}

/**
 * Show user-friendly error toast
 */
export function showDeactivationError(error: string): void {
  const errorMessages: { [key: string]: string } = {
    'Not authenticated': 'Please log in to deactivate an organization',
    'Not a member of this organization': 'You are not a member of this organization',
    'Only organization owners can deactivate': 'Only organization owners can deactivate',
    'Organization is already deactivated': 'This organization is already deactivated',
    'Organization not found': 'Organization not found'
  };

  const message = errorMessages[error] || error;
  toast.error(message);
}
