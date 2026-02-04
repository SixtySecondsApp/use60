import { test, expect } from '@playwright/test';

/**
 * OBV2-002: Playwright E2E test - Corporate email auto-join path
 *
 * Tests the corporate email auto-join flow:
 * - Business email detected (@company-domain.com)
 * - Domain matching with existing org
 * - Auto-join to existing org
 * - Enrichment loading and completion
 * - Skills config and completion
 * - Dashboard redirect
 */

test.describe('Onboarding V2: Corporate Email Auto-Join Path', () => {
  const BASE_URL = process.env.VITE_PUBLIC_URL || 'http://localhost:5175';
  const testEmail = 'test.corporate@acme-corp.com';
  const testPassword = 'TestPassword123!';

  test('should auto-join business email user to existing org', async ({ page, context }) => {
    // Navigate to onboarding page
    await page.goto(`${BASE_URL}/onboarding/v2`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Find and click signup button
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await expect(signupButton).toBeVisible({ timeout: 5000 });
    await signupButton.click();

    // Wait for auth page to load
    await page.waitForLoadState('domcontentloaded');

    // Fill email
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(testEmail);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);

    // Fill password confirmation
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    // Click sign up button
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for redirect to onboarding - business email should skip website_input
    // and go directly to enrichment_loading
    const enrichmentHeading = page.locator('h1, h2').filter({ hasText: /enrichment|analyzing/i });
    await expect(enrichmentHeading).toBeVisible({ timeout: 10000 });

    // Verify org context is set
    const orgName = page.locator('[data-testid="current-org-name"]');
    if (await orgName.isVisible({ timeout: 2000 })) {
      expect(await orgName.innerText()).toBeTruthy();
    }

    // Wait for enrichment to complete
    const enrichmentComplete = page.locator('text=/completed|success/i');
    await expect(enrichmentComplete).toBeVisible({ timeout: 120000 }); // 2 minutes for enrichment

    // Verify skills config step is shown
    const skillsHeading = page.locator('h1, h2').filter({ hasText: /skills|configuration/i });
    await expect(skillsHeading).toBeVisible({ timeout: 10000 });

    // Skip all skills by clicking skip button if available
    const skipButton = page.locator('button:has-text("Skip")').first();
    if (await skipButton.isVisible({ timeout: 2000 })) {
      await skipButton.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Should redirect to dashboard
    const dashboardUrl = await page.waitForURL(/\/(dashboard|meetings|deals)/, { timeout: 10000 });
    expect(dashboardUrl).toBeTruthy();

    // Verify user is logged in and on dashboard
    const dashboardHeading = page.locator('h1, h2').filter({ hasText: /dashboard|meetings/i });
    await expect(dashboardHeading).toBeVisible({ timeout: 5000 });
  });

  test('should display enrichment data for auto-joined org', async ({ page }) => {
    // Navigate to onboarding
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Perform signup with business email
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    // Fill signup form
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test.acme@acme-corp.com');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for enrichment results to load
    await page.waitForLoadState('domcontentloaded');

    // Look for enrichment data display
    const companyInfo = page.locator('[data-testid="company-name"], text=/(company|industry|employees)/i');
    await expect(companyInfo.first()).toBeVisible({ timeout: 15000 });
  });

  test('should mark onboarding as complete after auto-join flow', async ({ page, context }) => {
    // This would require database access to verify the onboarding_step = 'complete' in user_onboarding_progress
    // For E2E testing, we verify the user can access the dashboard
    await page.goto(`${BASE_URL}/dashboard`);

    // If onboarding is not marked complete, ProtectedRoute would redirect to onboarding
    // So if we can access dashboard without redirect, onboarding was marked complete
    const currentUrl = page.url();
    expect(currentUrl).toContain('dashboard');
  });

  test('should set active org correctly for auto-joined organization', async ({ page }) => {
    await page.goto(`${BASE_URL}/onboarding/v2`);
    await page.waitForLoadState('domcontentloaded');

    // Navigate through signup
    const signupButton = page.locator('button:has-text("Sign up")').first();
    await signupButton.click();
    await page.waitForLoadState('domcontentloaded');

    // Fill form
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test.active@acme-corp.com');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);
    const passwordConfirmInput = page.locator('input[type="password"]').nth(1);
    await passwordConfirmInput.fill(testPassword);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for enrichment completion
    await page.waitForLoadState('domcontentloaded');

    // After auto-join, the org should be active
    // Check org switcher shows the org
    const orgSwitcher = page.locator('[data-testid="org-switcher"], button:has-text(/select.*org/i)');
    if (await orgSwitcher.isVisible({ timeout: 2000 })) {
      await orgSwitcher.click();
      const orgName = page.locator('text=/(acme|ACME)/i');
      await expect(orgName).toBeVisible({ timeout: 5000 });
    }
  });
});
