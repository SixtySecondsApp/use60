import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';

/**
 * Integration tests for rejoin request flow (ORGREM-018)
 *
 * Tests the complete rejoin flow:
 * - Removed user requests to rejoin
 * - Admin approves rejoin request
 * - User's member_status changes back to 'active'
 * - redirect_to_onboarding flag is cleared
 * - Admin rejects rejoin request
 * - User receives rejection email
 */
describe('Rejoin Request Flow', () => {
  let adminClient: SupabaseClient<Database>;
  let removedUserClient: SupabaseClient<Database>;
  let testOrgId: string;
  let adminUserId: string;
  let removedUserId: string;

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables not configured for testing');
    }

    adminClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    removedUserClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

    // Sign in as admin
    const adminEmail = process.env.TEST_ADMIN_EMAIL;
    const adminPassword = process.env.TEST_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.warn('TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD not set, skipping tests');
      return;
    }

    const { data: adminAuth, error: adminAuthError } = await adminClient.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    if (adminAuthError || !adminAuth.user) {
      console.error('Failed to authenticate admin:', adminAuthError);
      return;
    }

    adminUserId = adminAuth.user.id;

    // Get admin's organization
    const { data: adminMembership } = await adminClient
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', adminUserId)
      .eq('member_status', 'active')
      .single();

    if (!adminMembership) {
      console.warn('Admin membership not found, skipping tests');
      return;
    }

    testOrgId = adminMembership.org_id;

    // Sign in as removed user
    const removedUserEmail = process.env.TEST_REMOVED_USER_EMAIL;
    const removedUserPassword = process.env.TEST_REMOVED_USER_PASSWORD;

    if (!removedUserEmail || !removedUserPassword) {
      console.warn('TEST_REMOVED_USER_EMAIL or TEST_REMOVED_USER_PASSWORD not set, skipping tests');
      return;
    }

    const { data: removedAuth, error: removedAuthError } = await removedUserClient.auth.signInWithPassword({
      email: removedUserEmail,
      password: removedUserPassword,
    });

    if (removedAuthError || !removedAuth.user) {
      console.error('Failed to authenticate removed user:', removedAuthError);
      return;
    }

    removedUserId = removedAuth.user.id;
  });

  beforeEach(async () => {
    // Ensure user is in removed state before each test
    if (testOrgId && removedUserId && adminUserId) {
      await adminClient.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: removedUserId,
      });

      // Clean up any existing rejoin requests
      await adminClient
        .from('rejoin_requests')
        .delete()
        .eq('user_id', removedUserId)
        .eq('org_id', testOrgId);
    }
  });

  afterAll(async () => {
    await adminClient?.auth.signOut();
    await removedUserClient?.auth.signOut();
  });

  it('should allow removed user to request rejoin', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Request rejoin as removed user
    const { data, error } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data?.success).toBe(true);
    expect(data?.requestId).toBeTruthy();

    // Verify rejoin request was created
    const { data: request } = await adminClient
      .from('rejoin_requests')
      .select('*')
      .eq('id', data!.requestId)
      .single();

    expect(request).toBeTruthy();
    expect(request?.user_id).toBe(removedUserId);
    expect(request?.org_id).toBe(testOrgId);
    expect(request?.status).toBe('pending');
  });

  it('should prevent active user from requesting rejoin', async () => {
    if (!testOrgId || !adminUserId) {
      return;
    }

    // Try to request rejoin as active user (admin)
    const { data, error } = await adminClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    // Should fail
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('not removed');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should prevent duplicate pending rejoin requests', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Create first request
    const { data: firstRequest } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(firstRequest?.success).toBe(true);

    // Try to create second request
    const { data: secondRequest, error: secondError } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    // Should fail due to unique constraint
    if (secondRequest) {
      expect(secondRequest.success).toBe(false);
    } else {
      expect(secondError).toBeTruthy();
      expect(secondError?.message).toContain('duplicate');
    }
  });

  it('should approve rejoin request and restore access', async () => {
    if (!testOrgId || !removedUserId || !adminUserId) {
      return;
    }

    // Create rejoin request
    const { data: requestData } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(requestData?.success).toBe(true);
    const requestId = requestData!.requestId;

    // Approve request as admin
    const { data: approveData, error: approveError } = await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: true,
    });

    expect(approveError).toBeNull();
    expect(approveData?.success).toBe(true);

    // Verify membership status changed to 'active'
    const { data: membership } = await adminClient
      .from('organization_memberships')
      .select('member_status, removed_at, removed_by')
      .eq('org_id', testOrgId)
      .eq('user_id', removedUserId)
      .single();

    expect(membership?.member_status).toBe('active');
    expect(membership?.removed_at).toBeNull();
    expect(membership?.removed_by).toBeNull();

    // Verify redirect flag is cleared
    const { data: profile } = await adminClient
      .from('profiles')
      .select('redirect_to_onboarding')
      .eq('id', removedUserId)
      .single();

    expect(profile?.redirect_to_onboarding).toBe(false);

    // Verify request status is 'approved'
    const { data: request } = await adminClient
      .from('rejoin_requests')
      .select('status, admin_user_id, resolved_at')
      .eq('id', requestId)
      .single();

    expect(request?.status).toBe('approved');
    expect(request?.admin_user_id).toBe(adminUserId);
    expect(request?.resolved_at).toBeTruthy();
  });

  it('should reject rejoin request and keep user removed', async () => {
    if (!testOrgId || !removedUserId || !adminUserId) {
      return;
    }

    // Create rejoin request
    const { data: requestData } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(requestData?.success).toBe(true);
    const requestId = requestData!.requestId;

    // Reject request as admin
    const rejectionReason = 'Not ready to rejoin at this time';
    const { data: rejectData, error: rejectError } = await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: false,
      p_rejection_reason: rejectionReason,
    });

    expect(rejectError).toBeNull();
    expect(rejectData?.success).toBe(true);

    // Verify membership status is still 'removed'
    const { data: membership } = await adminClient
      .from('organization_memberships')
      .select('member_status')
      .eq('org_id', testOrgId)
      .eq('user_id', removedUserId)
      .single();

    expect(membership?.member_status).toBe('removed');

    // Verify redirect flag is still set
    const { data: profile } = await adminClient
      .from('profiles')
      .select('redirect_to_onboarding')
      .eq('id', removedUserId)
      .single();

    expect(profile?.redirect_to_onboarding).toBe(true);

    // Verify request status is 'rejected'
    const { data: request } = await adminClient
      .from('rejoin_requests')
      .select('status, admin_user_id, resolved_at, rejection_reason')
      .eq('id', requestId)
      .single();

    expect(request?.status).toBe('rejected');
    expect(request?.admin_user_id).toBe(adminUserId);
    expect(request?.resolved_at).toBeTruthy();
    expect(request?.rejection_reason).toBe(rejectionReason);
  });

  it('should prevent non-admin from approving rejoin requests', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Create rejoin request
    const { data: requestData } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(requestData?.success).toBe(true);
    const requestId = requestData!.requestId;

    // Try to approve as non-admin (using removed user client)
    const { data, error } = await removedUserClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: removedUserId,
      p_approved: true,
    });

    // Should fail
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('admin');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should allow user to create new request after rejection', async () => {
    if (!testOrgId || !removedUserId || !adminUserId) {
      return;
    }

    // Create and reject first request
    const { data: firstRequestData } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    await adminClient.rpc('approve_rejoin', {
      p_request_id: firstRequestData!.requestId,
      p_admin_user_id: adminUserId,
      p_approved: false,
      p_rejection_reason: 'First rejection',
    });

    // Create second request (should succeed)
    const { data: secondRequestData, error: secondError } = await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    expect(secondError).toBeNull();
    expect(secondRequestData?.success).toBe(true);
    expect(secondRequestData?.requestId).toBeTruthy();
    expect(secondRequestData?.requestId).not.toBe(firstRequestData!.requestId);

    // Verify both requests exist with different statuses
    const { data: allRequests } = await adminClient
      .from('rejoin_requests')
      .select('id, status')
      .eq('user_id', removedUserId)
      .eq('org_id', testOrgId)
      .order('created_at', { ascending: false });

    expect(allRequests).toHaveLength(2);
    expect(allRequests?.[0].status).toBe('pending');
    expect(allRequests?.[1].status).toBe('rejected');
  });

  it('should fetch pending rejoin requests for admin', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Create rejoin request
    await removedUserClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    // Fetch pending requests as admin
    const { data: requests, error } = await adminClient
      .from('rejoin_requests')
      .select(`
        id,
        user_id,
        org_id,
        status,
        created_at,
        profiles:user_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq('org_id', testOrgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    expect(error).toBeNull();
    expect(requests).toBeTruthy();
    expect(requests!.length).toBeGreaterThan(0);

    const pendingRequest = requests!.find((r) => r.user_id === removedUserId);
    expect(pendingRequest).toBeTruthy();
    expect(pendingRequest?.status).toBe('pending');
  });
});
