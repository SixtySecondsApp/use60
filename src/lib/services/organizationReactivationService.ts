import { supabase } from '@/lib/supabase/clientV2';
import { logger } from '@/lib/utils/logger';

/**
 * BILLING INTEGRATION NOTES:
 *
 * 1. Auto-Deactivation Triggers:
 *    - Subscription cancelled → call deactivateOrganization(orgId, 'Subscription cancelled')
 *    - Payment failed after retries → call deactivateOrganization(orgId, 'Payment failed')
 *    - Trial expired without payment → call deactivateOrganization(orgId, 'Trial expired')
 *
 * 2. Reactivation Requirements:
 *    - Valid payment method on file
 *    - No outstanding invoices
 *    - Subscription resumed/created
 *
 * 3. Webhook Integration Points:
 *    - stripe.customer.subscription.deleted → deactivateOrganization()
 *    - stripe.invoice.payment_failed → mark for deactivation after grace period
 *    - stripe.invoice.paid → check if was deactivated, auto-approve reactivation
 *
 * 4. Grace Period Logic:
 *    - Add grace_period_expires_at to organizations table
 *    - Show countdown in InactiveOrganizationScreen
 *    - Auto-approve reactivation within grace period if payment resolves
 *
 * 5. Data Retention:
 *    - Keep org data for X days after deactivation
 *    - Show "data deletion scheduled" warning
 *    - Implement soft-delete cascade after retention period
 */

export interface OrganizationReactivationRequest {
  id: string;
  org_id: string;
  requested_by: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;

  // Joined fields
  organization?: {
    name: string;
    company_domain?: string;
  };
  requester?: {
    full_name: string;
    email: string;
  };
}

/**
 * Request reactivation for an inactive organization
 * TODO: BILLING - Integrate with billing service to check payment status before allowing request
 * TODO: BILLING - Validate billing details exist and are current
 */
export async function requestOrganizationReactivation(
  orgId: string
): Promise<{ success: boolean; message: string; requestId?: string }> {
  try {
    logger.log('[OrganizationReactivationService] Requesting reactivation for org:', orgId);

    // TODO: BILLING - Add pre-check for billing status
    // const billingStatus = await checkBillingStatus(orgId);
    // if (!billingStatus.canReactivate) {
    //   return { success: false, message: billingStatus.reason };
    // }

    const { data, error } = await supabase.rpc('request_organization_reactivation', {
      p_org_id: orgId
    });

    if (error) throw error;

    logger.log('[OrganizationReactivationService] Request result:', data);

    return {
      success: data.success,
      message: data.message,
      requestId: data.request_id
    };
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error requesting reactivation:', error);
    throw error;
  }
}

/**
 * Get pending reactivation requests (admin view)
 * TODO: PLATFORM_ADMIN - Restrict to platform admins only
 */
export async function getPendingReactivationRequests(): Promise<OrganizationReactivationRequest[]> {
  try {
    const { data, error } = await supabase
      .from('organization_reactivation_requests')
      .select(`
        *,
        organization:organizations(name, company_domain),
        requester:profiles!organization_reactivation_requests_requested_by_fkey(full_name, email)
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error fetching pending requests:', error);
    throw error;
  }
}

/**
 * Get reactivation request status for a specific organization
 */
export async function getReactivationRequestStatus(
  orgId: string
): Promise<OrganizationReactivationRequest | null> {
  try {
    const { data, error } = await supabase
      .from('organization_reactivation_requests')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .maybeSingle();

    if (error) throw error;

    return data;
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error fetching request status:', error);
    throw error;
  }
}

/**
 * Approve a reactivation request (admin only)
 * TODO: BILLING - Verify billing requirements are met before approving
 * TODO: BILLING - Resume subscription in billing system
 */
export async function approveReactivationRequest(
  requestId: string
): Promise<{ success: boolean; message: string }> {
  try {
    logger.log('[OrganizationReactivationService] Approving request:', requestId);

    // TODO: BILLING - Pre-approval billing checks
    // const billingCheck = await verifyBillingBeforeReactivation(requestId);
    // if (!billingCheck.passed) {
    //   throw new Error(billingCheck.reason);
    // }

    const { data, error } = await supabase.rpc('approve_organization_reactivation', {
      p_request_id: requestId
    });

    if (error) throw error;

    // TODO: BILLING - Resume active subscription
    // await resumeSubscription(orgId);

    logger.log('[OrganizationReactivationService] Approval result:', data);

    return {
      success: data.success,
      message: data.message
    };
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error approving request:', error);
    throw error;
  }
}

/**
 * Reject a reactivation request (admin only)
 */
export async function rejectReactivationRequest(
  requestId: string,
  adminNotes?: string
): Promise<{ success: boolean; message: string }> {
  try {
    logger.log('[OrganizationReactivationService] Rejecting request:', requestId);

    const { data, error } = await supabase.rpc('reject_organization_reactivation', {
      p_request_id: requestId,
      p_admin_notes: adminNotes
    });

    if (error) throw error;

    logger.log('[OrganizationReactivationService] Rejection result:', data);

    return {
      success: data.success,
      message: data.message
    };
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error rejecting request:', error);
    throw error;
  }
}

/**
 * Deactivate an organization (admin/system function)
 * TODO: BILLING - Call this when subscription is cancelled or payment fails
 * TODO: BILLING - Add integration with billing webhook handlers
 */
export async function deactivateOrganization(
  orgId: string,
  reason: string,
  deactivatedBy?: string
): Promise<void> {
  try {
    logger.log('[OrganizationReactivationService] Deactivating organization:', orgId);

    const { error } = await supabase
      .from('organizations')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: deactivatedBy || null,
        deactivation_reason: reason
      })
      .eq('id', orgId);

    if (error) throw error;

    // TODO: BILLING - Pause/cancel subscription in billing system
    // await pauseSubscription(orgId);

    // TODO: BILLING - Send notification to org admins about deactivation
    // await notifyOrgAdmins(orgId, 'organization_deactivated', { reason });

    logger.log('[OrganizationReactivationService] Organization deactivated successfully');
  } catch (error) {
    logger.error('[OrganizationReactivationService] Error deactivating organization:', error);
    throw error;
  }
}
