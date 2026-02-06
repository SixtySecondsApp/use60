import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';

/**
 * Integration tests for organization user removal flow (ORGREM-017)
 *
 * Tests the complete removal flow:
 * - Admin removes user from organization
 * - User's member_status changes to 'removed'
 * - User can still view their data (SELECT)
 * - User cannot edit/delete their data (UPDATE/DELETE blocked)
 * - redirect_to_onboarding flag is set
 * - Audit trail (removed_at, removed_by) is recorded
 */
describe('Organization User Removal Flow', () => {
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

    // Create separate clients for admin and removed user
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
      .select('org_id, role')
      .eq('user_id', adminUserId)
      .eq('member_status', 'active')
      .single();

    if (!adminMembership || adminMembership.role !== 'admin') {
      console.warn('Test user is not an admin, skipping tests');
      return;
    }

    testOrgId = adminMembership.org_id;

    // For testing, we need a second user to remove
    // In a real test environment, you'd create a test user here
    // For now, we'll skip if no removed user credentials are provided
    const removedUserEmail = process.env.TEST_REMOVED_USER_EMAIL;
    const removedUserPassword = process.env.TEST_REMOVED_USER_PASSWORD;

    if (!removedUserEmail || !removedUserPassword) {
      console.warn('TEST_REMOVED_USER_EMAIL or TEST_REMOVED_USER_PASSWORD not set, skipping user-specific tests');
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
    // Reset removed user's status to active before each test
    if (testOrgId && removedUserId && adminClient) {
      // Use service role to reset status (in real tests, you'd use a setup helper)
      // For now, we'll skip this in favor of idempotent tests
    }
  });

  afterAll(async () => {
    // Cleanup: sign out all clients
    await adminClient?.auth.signOut();
    await removedUserClient?.auth.signOut();
  });

  it('should successfully remove a user from organization', async () => {
    if (!testOrgId || !removedUserId || !adminUserId) {
      return;
    }

    // Call remove_user_from_org RPC as admin
    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data?.success).toBe(true);

    // Verify membership status changed to 'removed'
    const { data: membership } = await adminClient
      .from('organization_memberships')
      .select('member_status, removed_at, removed_by')
      .eq('org_id', testOrgId)
      .eq('user_id', removedUserId)
      .single();

    expect(membership?.member_status).toBe('removed');
    expect(membership?.removed_at).toBeTruthy();
    expect(membership?.removed_by).toBe(adminUserId);

    // Verify redirect flag is set
    const { data: profile } = await adminClient
      .from('profiles')
      .select('redirect_to_onboarding')
      .eq('id', removedUserId)
      .single();

    expect(profile?.redirect_to_onboarding).toBe(true);
  });

  it('should prevent non-admin from removing users', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Try to remove user as a non-admin (using removed user client)
    const { data, error } = await removedUserClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    // Should either error or return success=false
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('admin');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should prevent removing the last owner', async () => {
    if (!testOrgId || !adminUserId) {
      return;
    }

    // Try to remove an owner user
    // First, check if admin is owner
    const { data: adminMembership } = await adminClient
      .from('organization_memberships')
      .select('role')
      .eq('org_id', testOrgId)
      .eq('user_id', adminUserId)
      .single();

    if (adminMembership?.role !== 'owner') {
      console.warn('Admin is not owner, skipping last owner test');
      return;
    }

    // Count owners
    const { data: owners } = await adminClient
      .from('organization_memberships')
      .select('user_id')
      .eq('org_id', testOrgId)
      .eq('role', 'owner')
      .eq('member_status', 'active');

    if (!owners || owners.length !== 1) {
      console.warn('More than one owner exists, skipping test');
      return;
    }

    // Try to remove the only owner
    const { data, error } = await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: adminUserId,
    });

    // Should fail
    if (data) {
      expect(data.success).toBe(false);
      expect(data.error).toContain('last owner');
    } else {
      expect(error).toBeTruthy();
    }
  });

  it('should allow removed user to view their data', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // First remove the user
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    // Create a deal as removed user (before removal, for testing)
    // In a real test, you'd create this data in beforeEach

    // Try to SELECT deals as removed user
    const { data: deals, error: selectError } = await removedUserClient
      .from('deals')
      .select('*')
      .eq('org_id', testOrgId)
      .limit(1);

    // Should succeed (SELECT is allowed)
    expect(selectError).toBeNull();
    expect(Array.isArray(deals)).toBe(true);
  });

  it('should prevent removed user from updating data', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Ensure user is removed
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    // Try to UPDATE a deal as removed user
    const { data: existingDeal } = await removedUserClient
      .from('deals')
      .select('id')
      .eq('org_id', testOrgId)
      .limit(1)
      .maybeSingle();

    if (!existingDeal) {
      console.warn('No deals to test update, skipping');
      return;
    }

    const { error: updateError } = await removedUserClient
      .from('deals')
      .update({ deal_name: 'Updated Name' })
      .eq('id', existingDeal.id);

    // Should fail (UPDATE is blocked by RLS)
    expect(updateError).toBeTruthy();
    expect(updateError?.code).toBe('42501'); // Insufficient privilege
  });

  it('should prevent removed user from deleting data', async () => {
    if (!testOrgId || !removedUserId) {
      return;
    }

    // Ensure user is removed
    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    // Try to DELETE a deal as removed user
    const { data: existingDeal } = await removedUserClient
      .from('deals')
      .select('id')
      .eq('org_id', testOrgId)
      .limit(1)
      .maybeSingle();

    if (!existingDeal) {
      console.warn('No deals to test delete, skipping');
      return;
    }

    const { error: deleteError } = await removedUserClient
      .from('deals')
      .delete()
      .eq('id', existingDeal.id);

    // Should fail (DELETE is blocked by RLS)
    expect(deleteError).toBeTruthy();
    expect(deleteError?.code).toBe('42501'); // Insufficient privilege
  });

  it('should create audit trail on removal', async () => {
    if (!testOrgId || !removedUserId || !adminUserId) {
      return;
    }

    // Remove user
    const beforeRemoval = new Date();

    await adminClient.rpc('remove_user_from_org', {
      p_org_id: testOrgId,
      p_user_id: removedUserId,
    });

    const afterRemoval = new Date();

    // Check audit trail
    const { data: membership } = await adminClient
      .from('organization_memberships')
      .select('removed_at, removed_by')
      .eq('org_id', testOrgId)
      .eq('user_id', removedUserId)
      .single();

    expect(membership?.removed_by).toBe(adminUserId);
    expect(membership?.removed_at).toBeTruthy();

    // Verify removed_at is within expected time range
    const removedAt = new Date(membership!.removed_at!);
    expect(removedAt.getTime()).toBeGreaterThanOrEqual(beforeRemoval.getTime());
    expect(removedAt.getTime()).toBeLessThanOrEqual(afterRemoval.getTime());
  });
});
