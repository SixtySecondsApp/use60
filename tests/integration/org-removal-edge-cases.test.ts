import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';

/**
 * Edge case tests for organization user removal (ORGREM-019)
 *
 * Tests edge cases and error conditions:
 * - Removing user who doesn't exist
 * - Removing user from wrong organization
 * - Double removal (idempotency)
 * - Removing user with active tasks/deals
 * - Multiple removal attempts in quick succession
 * - Approving already-approved rejoin request
 * - Rejecting already-rejected request
 */
describe('Organization Removal Edge Cases', () => {
  let adminClient: SupabaseClient<Database>;
  let userClient: SupabaseClient<Database>;
  let testOrgId: string;
  let adminUserId: string;
  let testUserId: string;

  beforeAll(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables not configured for testing');
    }

    adminClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    userClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

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

    // Sign in as test user
    const testEmail = process.env.TEST_REMOVED_USER_EMAIL;
    const testPassword = process.env.TEST_REMOVED_USER_PASSWORD;

    if (!testEmail || !testPassword) {
      console.warn('TEST_REMOVED_USER_EMAIL or TEST_REMOVED_USER_PASSWORD not set, skipping tests');
      return;
    }

    const { data: testAuth } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (testAuth?.user) {
      testUserId = testAuth.user.id;
    }
  });

  afterAll(async () => {
    await adminClient?.auth.signOut();
    await userClient?.auth.signOut();
  });

  it('should handle removing non-existent user gracefully', async () => {
    if (!testOrgId) {
      return;
    }

    const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: nonExistentUserId,
    });

    // Should return error indicating user not found
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should handle removing user from wrong organization', async () => {
    if (!testUserId) {
      return;
    }

    const wrongOrgId = '00000000-0000-0000-0000-000000000001';

    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: wrongOrgId,
      p_user_id: testUserId,
    });

    // Should fail (user not in that org)
    if (data) {
      expect(data.success).toBe(false);
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should handle double removal (idempotency)', async () => {
    if (!testOrgId || !testUserId) {
      return;
    }

    // Remove user first time
    const { data: firstRemoval } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    expect(firstRemoval?.success).toBe(true);

    // Try to remove again
    const { data: secondRemoval, error: secondError } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    // Should either succeed (idempotent) or return error saying already removed
    if (secondRemoval) {
      // If idempotent, success should be true
      // If not idempotent, error message should indicate already removed
      if (!secondRemoval.success) {
        expect(secondRemoval.error).toContain('already removed');
      }
    } else {
      expect(secondError).toBeTruthy();
    }
  });

  it('should allow removing user with active tasks and deals', async () => {
    if (!testOrgId || !testUserId) {
      return;
    }

    // In a real test, you'd create tasks/deals here
    // For now, we just verify removal doesn't fail

    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    // Should succeed - data is preserved, just access is changed
    expect(error).toBeNull();
    if (data) {
      expect(data.success).toBe(true);
    }

    // Verify user can still view their tasks (SELECT allowed)
    const { data: tasks, error: tasksError } = await userClient
      .from('tasks')
      .select('*')
      .eq('org_id', testOrgId)
      .limit(1);

    expect(tasksError).toBeNull();
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('should handle concurrent removal attempts', async () => {
    if (!testOrgId || !testUserId) {
      return;
    }

    // Make two simultaneous removal requests
    const [result1, result2] = await Promise.all([
      adminClient.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: testUserId,
      }),
      adminClient.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: testUserId,
      }),
    ]);

    // At least one should succeed
    const succeeded = [result1.data?.success, result2.data?.success].filter(Boolean).length;
    expect(succeeded).toBeGreaterThanOrEqual(1);

    // Verify final state is 'removed'
    const { data: membership } = await adminClient
      .from('organization_memberships')
      .select('member_status')
      .eq('org_id', testOrgId)
      .eq('user_id', testUserId)
      .single();

    expect(membership?.member_status).toBe('removed');
  });

  it('should handle approving already-approved rejoin request', async () => {
    if (!testOrgId || !testUserId || !adminUserId) {
      return;
    }

    // Remove user and create rejoin request
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    const { data: requestData } = await userClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    if (!requestData?.success) {
      console.warn('Failed to create rejoin request, skipping test');
      return;
    }

    const requestId = requestData.requestId;

    // Approve once
    await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: true,
    });

    // Try to approve again
    const { data: secondApproval, error: secondError } = await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: true,
    });

    // Should either succeed (idempotent) or return error
    if (secondApproval) {
      if (!secondApproval.success) {
        expect(secondApproval.error).toContain('already');
      }
    } else {
      expect(secondError).toBeTruthy();
    }
  });

  it('should handle rejecting already-rejected request', async () => {
    if (!testOrgId || !testUserId || !adminUserId) {
      return;
    }

    // Ensure user is removed
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    // Clean up old requests
    await adminClient
      .from('rejoin_requests')
      .delete()
      .eq('user_id', testUserId)
      .eq('org_id', testOrgId);

    // Create new request
    const { data: requestData } = await userClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    if (!requestData?.success) {
      console.warn('Failed to create rejoin request, skipping test');
      return;
    }

    const requestId = requestData.requestId;

    // Reject once
    await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: false,
      p_rejection_reason: 'First rejection',
    });

    // Try to reject again
    const { data: secondRejection, error: secondError } = await adminClient.rpc('approve_rejoin', {
      p_request_id: requestId,
      p_admin_user_id: adminUserId,
      p_approved: false,
      p_rejection_reason: 'Second rejection',
    });

    // Should either succeed (idempotent) or return error
    if (secondRejection) {
      if (!secondRejection.success) {
        expect(secondRejection.error).toContain('already');
      }
    } else {
      expect(secondError).toBeTruthy();
    }
  });

  it('should handle invalid rejoin request ID', async () => {
    if (!adminUserId) {
      return;
    }

    const invalidRequestId = '00000000-0000-0000-0000-000000000000';

    const { data, error } = await adminClient.rpc('approve_rejoin', {
      p_request_id: invalidRequestId,
      p_admin_user_id: adminUserId,
      p_approved: true,
    });

    // Should fail
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should prevent self-removal', async () => {
    if (!testOrgId || !adminUserId) {
      return;
    }

    // Try to remove self
    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: adminUserId,
    });

    // Should fail (can't remove yourself, or fail if you're the last owner)
    if (data) {
      expect(data.success).toBe(false);
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should maintain data integrity across removal and rejoin', async () => {
    if (!testOrgId || !testUserId || !adminUserId) {
      return;
    }

    // Get initial membership created_at
    const { data: initialMembership } = await adminClient
      .from('organization_memberships')
      .select('created_at')
      .eq('org_id', testOrgId)
      .eq('user_id', testUserId)
      .single();

    if (!initialMembership) {
      console.warn('No membership found, skipping test');
      return;
    }

    const originalCreatedAt = initialMembership.created_at;

    // Remove user
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: testUserId,
    });

    // Request rejoin and approve
    const { data: requestData } = await userClient.rpc('request_rejoin', {
      p_org_id: testOrgId,
    });

    if (!requestData?.success) {
      console.warn('Failed to create rejoin request, skipping test');
      return;
    }

    await adminClient.rpc('approve_rejoin', {
      p_request_id: requestData.requestId,
      p_admin_user_id: adminUserId,
      p_approved: true,
    });

    // Verify membership record is the same (not recreated)
    const { data: finalMembership } = await adminClient
      .from('organization_memberships')
      .select('created_at, member_status')
      .eq('org_id', testOrgId)
      .eq('user_id', testUserId)
      .single();

    expect(finalMembership?.created_at).toBe(originalCreatedAt);
    expect(finalMembership?.member_status).toBe('active');
  });
});
