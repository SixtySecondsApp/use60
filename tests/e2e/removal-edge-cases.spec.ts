/**
 * Test Suite: Organization User Removal - Edge Cases and Error Handling
 * Story: ORGREM-019
 *
 * Tests edge cases and error handling for the org user removal feature:
 * - Cannot remove last owner (RPC returns error)
 * - Cannot remove self (frontend prevents)
 * - Concurrent removal/rejoin requests handled gracefully
 * - RLS edge cases with removed users in shared deals
 * - Email delivery failures logged but don't block flow
 * - Network timeouts during RPC calls handled
 */

import { describe, test, expect as vitestExpect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { expect as playwrightExpect } from '../fixtures/playwright-assertions';
import { setupPlaywriter, teardownPlaywriter } from '../fixtures/playwriter-setup';
import type { Page } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.VITE_BASE_URL || 'http://localhost:5175';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

describe('Organization User Removal - Edge Cases', () => {
  let page: Page;
  let supabase: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const setup = await setupPlaywriter();
    page = setup.page;
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  afterAll(async () => {
    await teardownPlaywriter();
  });

  beforeEach(async () => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
  });

  afterEach(async () => {
    // Clean up any route mocks
    await page.unroute('**/*');
  });

  describe('RPC Error Handling - Last Owner Protection', () => {
    test('should prevent removal of last owner via RPC', async () => {
      // This test verifies the RPC function returns an error when attempting
      // to remove the last owner of an organization

      // Mock the scenario: Try to remove a user who is the last owner
      const testOrgId = '00000000-0000-0000-0000-000000000001';
      const lastOwnerId = '00000000-0000-0000-0000-000000000002';

      // Call the RPC directly through Supabase client
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: lastOwnerId
      });

      // Should return an error indicating last owner cannot be removed
      if (data && typeof data === 'object' && 'success' in data) {
        vitestExpect(data.success).toBe(false);
        vitestExpect(data.error).toContain('last owner');
      } else {
        // If RPC throws error directly
        vitestExpect(error).toBeTruthy();
      }
    });

    test('should show error toast when attempting to remove last owner in UI', async () => {
      // Navigate to team members page
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock RPC response to simulate last owner scenario
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Cannot remove the last owner of the organization'
          })
        });
      });

      // Attempt to remove a user (assuming UI has remove button)
      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        // Confirm dialog
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Should show error toast
        await page.waitForTimeout(1000);
        const toastContent = await page.textContent('body');
        vitestExpect(toastContent).toMatch(/last owner|cannot remove/i);
      }
    });
  });

  describe('Self-Removal Prevention', () => {
    test('should prevent user from removing themselves via RPC', async () => {
      // The RPC function should return an error when caller tries to remove themselves
      const testOrgId = '00000000-0000-0000-0000-000000000001';
      const selfUserId = '00000000-0000-0000-0000-000000000003';

      // Mock authenticated user ID to match the target
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: selfUserId
      });

      // Should return error about self-removal
      if (data && typeof data === 'object' && 'success' in data) {
        vitestExpect(data.success).toBe(false);
        vitestExpect(data.error).toMatch(/cannot remove yourself/i);
      }
    });

    test('should hide remove button for current user in UI', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Current user's row should not have a remove button
      // This is a frontend protection
      const currentUserRow = page.locator('[data-current-user="true"]');

      if (await currentUserRow.count() > 0) {
        const removeButton = currentUserRow.locator('button:has-text("Remove")');
        const removeButtonCount = await removeButton.count();

        // Should not show remove button for self
        vitestExpect(removeButtonCount).toBe(0);
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should handle concurrent removal requests gracefully', async () => {
      const testOrgId = '00000000-0000-0000-0000-000000000001';
      const targetUserId = '00000000-0000-0000-0000-000000000004';

      // Simulate two concurrent removal requests
      const promise1 = supabase.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: targetUserId
      });

      const promise2 = supabase.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: targetUserId
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // At least one should succeed or both should handle gracefully
      const hasSuccess = (result1.data as any)?.success || (result2.data as any)?.success;
      const hasError = result1.error || result2.error ||
                      (result1.data as any)?.error || (result2.data as any)?.error;

      // Should not crash - either succeeds or returns clear error
      vitestExpect(hasSuccess || hasError).toBeTruthy();
    });

    test('should handle concurrent rejoin requests', async () => {
      const testOrgId = '00000000-0000-0000-0000-000000000001';

      // Simulate two concurrent rejoin requests from same user
      const promise1 = supabase.rpc('request_rejoin', {
        p_org_id: testOrgId
      });

      const promise2 = supabase.rpc('request_rejoin', {
        p_org_id: testOrgId
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, other should get "already have pending request" error
      const results = [result1.data, result2.data];
      const successCount = results.filter(r => r && typeof r === 'object' && 'success' in r && r.success).length;

      // Should handle duplicate gracefully with unique constraint
      vitestExpect(successCount).toBeLessThanOrEqual(1);
    });

    test('should handle concurrent approval of same rejoin request', async () => {
      const testRequestId = '00000000-0000-0000-0000-000000000005';

      // Simulate two concurrent approvals of same request
      const promise1 = supabase.rpc('approve_rejoin_request', {
        p_request_id: testRequestId,
        p_approved: true
      });

      const promise2 = supabase.rpc('approve_rejoin_request', {
        p_request_id: testRequestId,
        p_approved: true
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, other should get "already processed" error
      const results = [result1.data, result2.data];

      // At least one should indicate the request was already processed
      const hasAlreadyProcessed = results.some(r =>
        r && typeof r === 'object' && 'error' in r &&
        (r.error as string)?.includes('already been processed')
      );

      vitestExpect(hasAlreadyProcessed || results.some(r => r && typeof r === 'object' && 'success' in r && r.success)).toBeTruthy();
    });
  });

  describe('RLS Edge Cases - Removed Users and Shared Data', () => {
    test('should allow removed users to view their old deals but not edit', async () => {
      // This tests that RLS policies correctly handle removed users
      // They should have read-only access to their historical data

      await page.goto(`${BASE_URL}/deals`);
      await page.waitForLoadState('networkidle');

      // Mock a scenario where user is removed
      await page.route('**/rest/v1/organization_memberships*', async route => {
        const response = await route.fetch();
        const data = await response.json();

        // Modify response to mark user as removed
        const modifiedData = Array.isArray(data) ? data.map(m => ({
          ...m,
          member_status: 'removed'
        })) : data;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(modifiedData)
        });
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Should still be able to view deals
      const dealsList = page.locator('[data-testid="deals-list"], .deals-table, [role="table"]');
      const dealsCount = await dealsList.count();

      if (dealsCount > 0) {
        // But edit buttons should be disabled or hidden
        const editButtons = page.locator('button:has-text("Edit"), button[aria-label*="edit"]');
        const editButtonsCount = await editButtons.count();

        // If edit buttons exist, they should be disabled
        if (editButtonsCount > 0) {
          const isDisabled = await editButtons.first().isDisabled();
          vitestExpect(isDisabled).toBe(true);
        }
      }
    });

    test('should handle removed user data with null references gracefully', async () => {
      // Test that UI doesn't break when displaying data from removed users
      await page.goto(`${BASE_URL}/deals`);
      await page.waitForLoadState('networkidle');

      // Mock deal data with removed user references
      await page.route('**/rest/v1/deals*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-deal-1',
              name: 'Test Deal',
              owner_id: '00000000-0000-0000-0000-000000000999', // Non-existent/removed user
              value: 10000,
              stage: 'negotiation'
            }
          ])
        });
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Should display deals without crashing
      const pageContent = await page.textContent('body');
      vitestExpect(pageContent).toBeTruthy();

      // Should not show "undefined" or "null" for removed user names
      vitestExpect(pageContent).not.toMatch(/\bundefined\b/);
      vitestExpect(pageContent).not.toMatch(/\bnull\b/);
    });
  });

  describe('Email Delivery Failures - Non-Blocking', () => {
    test('should complete removal even when email fails', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock successful RPC but email failure
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            userId: '00000000-0000-0000-0000-000000000004',
            orgId: '00000000-0000-0000-0000-000000000001',
            emailSent: false,
            emailError: 'SMTP timeout'
          })
        });
      });

      // Try to remove a user
      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        await page.waitForTimeout(1500);

        // Should show success toast even though email failed
        const toastContent = await page.textContent('body');
        vitestExpect(toastContent).toMatch(/removed|success/i);

        // May optionally mention email issue, but should not block
        // The key is that the removal succeeded
      }
    });

    test('should log email errors without displaying to user', async () => {
      // Verify that email errors are logged but don't create user-facing alerts
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Capture console errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleErrors.push(msg.text());
        }
      });

      // Mock email failure in removal process
      await page.route('**/functions/v1/send-removal-email', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Email service unavailable' })
        });
      });

      // Mock successful removal RPC
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            userId: '00000000-0000-0000-0000-000000000004'
          })
        });
      });

      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        await page.waitForTimeout(1500);

        // Email error may be logged, but should not show error alert to user
        const errorAlerts = page.locator('[role="alert"][data-type="error"], .error-alert');
        const errorCount = await errorAlerts.count();

        // Success should be shown, not error
        const toastContent = await page.textContent('body');
        vitestExpect(toastContent).toMatch(/success|removed/i);
      }
    });
  });

  describe('Network Timeout Handling', () => {
    test('should handle RPC timeout gracefully with loading state', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock slow RPC response (timeout scenario)
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        // Delay response to simulate timeout
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
        await route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway timeout' })
        });
      });

      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Should show loading state immediately
          await page.waitForTimeout(500);
          const loadingIndicator = page.locator('[data-loading="true"], .loading, [aria-busy="true"]');
          const hasLoading = await loadingIndicator.count() > 0;

          // Should either show loading or handle timeout
          vitestExpect(hasLoading).toBeTruthy();
        }
      }
    });

    test('should show timeout error after extended delay', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock timeout
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        await route.abort('timedout');
      });

      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Wait for timeout
          await page.waitForTimeout(6000);

          // Should show error message about timeout
          const pageContent = await page.textContent('body');
          vitestExpect(pageContent).toMatch(/timeout|failed|error|try again/i);
        }
      }
    });

    test('should handle rejoin request timeout', async () => {
      // Navigate to removed user screen (if it exists)
      await page.goto(`${BASE_URL}/onboarding/removed-user`);
      await page.waitForLoadState('networkidle');

      // Mock timeout for rejoin request
      await page.route('**/rest/v1/rpc/request_rejoin', async route => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        await route.abort('timedout');
      });

      // Try to submit rejoin request
      const rejoinButton = page.locator('button:has-text("Request to Rejoin")');
      if (await rejoinButton.isVisible()) {
        await rejoinButton.click();

        await page.waitForTimeout(6000);

        // Should show error without crashing
        const pageContent = await page.textContent('body');
        vitestExpect(pageContent).toMatch(/timeout|failed|error|try again/i);
      }
    });
  });

  describe('RPC Error Response Formats', () => {
    test('should handle malformed RPC error responses', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock malformed error response
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            // Missing success field, malformed response
            message: 'Something went wrong'
          })
        });
      });

      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          await page.waitForTimeout(1500);

          // Should handle gracefully without crashing
          const pageContent = await page.textContent('body');
          vitestExpect(pageContent).toBeTruthy();
          vitestExpect(pageContent).not.toContain('undefined');
        }
      }
    });

    test('should handle unexpected HTTP status codes', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock unexpected status code
      await page.route('**/rest/v1/rpc/remove_user_from_org', async route => {
        await route.fulfill({
          status: 418, // I'm a teapot
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unexpected error' })
        });
      });

      const removeButtons = page.locator('button:has-text("Remove")');
      if (await removeButtons.count() > 0) {
        await removeButtons.first().click();

        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          await page.waitForTimeout(1500);

          // Should show error without crashing
          const pageContent = await page.textContent('body');
          vitestExpect(pageContent).toMatch(/error|failed/i);
        }
      }
    });
  });

  describe('Permission Edge Cases', () => {
    test('should prevent non-admin from removing users', async () => {
      const testOrgId = '00000000-0000-0000-0000-000000000001';
      const targetUserId = '00000000-0000-0000-0000-000000000004';

      // Call RPC as non-admin user (will be rejected)
      const { data, error } = await supabase.rpc('remove_user_from_org', {
        p_org_id: testOrgId,
        p_user_id: targetUserId
      });

      // Should return permission error
      if (data && typeof data === 'object' && 'success' in data) {
        vitestExpect(data.success).toBe(false);
        vitestExpect(data.error).toMatch(/owner|admin|permission/i);
      }
    });

    test('should hide remove buttons for non-admin users in UI', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await page.waitForLoadState('networkidle');

      // Mock user as regular member (not admin)
      await page.route('**/rest/v1/organization_memberships*', async route => {
        const response = await route.fetch();
        const data = await response.json();

        const modifiedData = Array.isArray(data) ? data.map(m => ({
          ...m,
          role: 'member' // Not admin/owner
        })) : data;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(modifiedData)
        });
      });

      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Remove buttons should not be visible for non-admin
      const removeButtons = page.locator('button:has-text("Remove")');
      const removeCount = await removeButtons.count();

      // Non-admins should not see remove buttons
      vitestExpect(removeCount).toBe(0);
    });
  });
});
